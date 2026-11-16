import time
import cv2
import numpy as np


FRAME_W, FRAME_H = 640, 480
TOTAL_GATE = 3          # jumlah gate (pasangan hijau-merah)
BASE_SPEED = 0.5        # kecepatan maju (0..1)
TURN_SPEED = 0.4        # kecepatan putar saat belok
KP = 0.6                # gain kemudi
MIN_AREA = 300          # abaikan blob yang lebih kecil dari ini (noise)
GATE_NEAR_AREA = 4000   # ukuran bola dianggap "sudah dekat dengan gate"
BOX_LOST_TIME = 8.0     # detik, box biru hilang dari kamera -> dianggap sudah terlewati
BOX_NEAR_AREA = 4000    # ukuran box dianggap "sudah dekat"
BOX_MAX_X = 200         # box tidak boleh lebih ke tengah dari x ini (piksel), supaya tidak tertabrak
BALL_CLOSE_AREA = 15000 # ukuran bola biru dianggap hampir menabrak
RAM_TIME = 2.0          # detik maju terus setelah bola biru hilang/dekat

GREEN = [((40, 80, 50), (85, 255, 255))]
RED = [((0, 120, 70), (10, 255, 255)), ((170, 120, 70), (180, 255, 255))]
BLUE = [((95, 100, 50), (130, 255, 255))]


def set_motor(left, right):
    """left/right: -1.0 .. 1.0. Ganti dengan kode kirim ke motor/ESC."""
    left = max(-1.0, min(1.0, left))
    right = max(-1.0, min(1.0, right))
    print(f"motor L={left:+.2f} R={right:+.2f}")

def find_blobs(hsv, ranges):
    mask = np.zeros(hsv.shape[:2], np.uint8)
    for lo, hi in ranges:
        mask |= cv2.inRange(hsv, np.array(lo), np.array(hi))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    blobs = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < MIN_AREA:
            continue
        (x, y), r = cv2.minEnclosingCircle(c)
        fill = area / (np.pi * r * r)  # bulat ~0.9, kotak ~0.64
        blobs.append({"x": x, "y": y, "area": area, "round": fill > 0.8})
    return blobs

def largest(blobs):
    return max(blobs, key=lambda b: b["area"]) if blobs else None

class Mission:
    def __init__(self):
        self.state = "GATE"
        self.gates_passed = 0
        self.gate_near = False
        self.box_seen = False
        self.box_last_seen = 0.0
        self.ball_close = False
        self.ball_lost_since = None

    @staticmethod
    def _steer(error, speed=BASE_SPEED):
        """error: -1 (target di kiri) .. +1 (target di kanan)."""
        return speed + KP * error, speed - KP * error

    def update(self, frame, now):
        """Terima 1 frame kamera (BGR) + waktu (detik). Return (left, right)."""
        h, w = frame.shape[:2]
        cx = w / 2
        hsv = cv2.cvtColor(cv2.GaussianBlur(frame, (7, 7), 0), cv2.COLOR_BGR2HSV)
        cmd = (0.0, 0.0)

        if self.state == "GATE":
            g = largest(find_blobs(hsv, GREEN))
            r = largest(find_blobs(hsv, RED))

            if g and r:                      # dua bola terlihat -> arahkan ke tengah
                target = (g["x"] + r["x"]) / 2
                cmd = self._steer((target - cx) / cx)
                size = min(g["area"], r["area"])
                if size > GATE_NEAR_AREA:
                    self.gate_near = True
                elif self.gate_near and size < GATE_NEAR_AREA * 0.5:
                    self.gates_passed += 1   # pasangan lama sudah lewat
                    self.gate_near = False
            elif g:                          # hanya hijau: jaga hijau tetap di kiri
                cmd = self._steer((g["x"] + w * 0.25 - cx) / cx)
            elif r:                          # hanya merah: jaga merah tetap di kanan
                cmd = self._steer((r["x"] - w * 0.25 - cx) / cx)
            else:                            # tidak ada bola
                if self.gate_near:           # tadi dekat, sekarang hilang -> gate lewat
                    self.gates_passed += 1
                    self.gate_near = False
                cmd = (BASE_SPEED, BASE_SPEED)

            if self.gates_passed >= TOTAL_GATE:
                self.state = "PAST_GATE"

        elif self.state == "PAST_GATE":
            boxes = [b for b in find_blobs(hsv, BLUE) if not b["round"]]
            box = largest(boxes)
            if box and box["x"] < cx:        # box ada di sisi kiri kapal
                self.box_seen = True
                self.box_last_seen = now
                if box["area"] > BOX_NEAR_AREA:
                    cmd = (BASE_SPEED, BASE_SPEED)          # sudah dekat: lurus saja
                elif box["x"] > BOX_MAX_X:
                    cmd = self._steer(0.3)                  # box terlalu ke tengah -> belok kanan
                else:
                    cmd = (BASE_SPEED, BASE_SPEED)          # box di sisi kiri: lurus saja
            elif not self.box_seen:
                # box belum terlihat (kapal agak menghadap kanan setelah zig-zag)
                # -> maju sambil berbelok kiri pelan sampai box muncul
                cmd = (BASE_SPEED * 0.8, BASE_SPEED * 1.2)
            else:
                cmd = (BASE_SPEED, BASE_SPEED)              # box sudah hilang: lurus sebentar
            if self.box_seen and now - self.box_last_seen > BOX_LOST_TIME:
                self.state = "TURN"          # box sudah terlewati

        # ---------- 3. BELOK KIRI SAMPAI BOLA BIRU TERLIHAT ----------
        elif self.state == "TURN":
            cmd = (-TURN_SPEED, TURN_SPEED)  # putar ke kiri
            balls = [b for b in find_blobs(hsv, BLUE) if b["round"]]
            if balls:
                self.state = "ATTACK"

        # ---------- 4. TABRAK BOLA BIRU ----------
        elif self.state == "ATTACK":
            balls = [b for b in find_blobs(hsv, BLUE) if b["round"]]
            ball = largest(balls)
            if ball:
                self.ball_lost_since = None
                cmd = self._steer((ball["x"] - cx) / cx, speed=0.7)
                if ball["area"] > BALL_CLOSE_AREA:
                    self.ball_close = True
            else:
                cmd = (0.7, 0.7)             # lurus terus
                if self.ball_lost_since is None:
                    self.ball_lost_since = now
                # bola hilang saat sudah dekat = kena; atau timeout
                if self.ball_close and now - self.ball_lost_since > RAM_TIME:
                    self.state = "DONE"
                elif now - self.ball_lost_since > 5.0:
                    self.state = "TURN"      # bola hilang jauh -> cari lagi

        return cmd

    @property
    def done(self):
        return self.state == "DONE"


# ===================== PROGRAM UTAMA (KAPAL ASLI) =====================
def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)
    mission = Mission()

    try:
        while not mission.done:
            ok, frame = cap.read()
            if not ok:
                set_motor(0, 0)
                continue
            frame = cv2.resize(frame, (FRAME_W, FRAME_H))
            left, right = mission.update(frame, time.time())
            set_motor(left, right)
    finally:
        set_motor(0, 0)
        cap.release()
        print("Misi selesai")


if __name__ == "__main__":
    main()
