"""
Simulator misi kapal Naval Bengawan UV 2027.

Menjalankan class Mission dari misi_kapal.py TANPA kapal asli:
  - dunia 2D (meter): gate zig-zag, box biru, bola biru, box kuning
  - kapal differential drive (motor kiri/kanan)
  - kamera virtual yang merender gambar seperti dari kapal (BGR, 640x480)

Pemakaian:
  python3 simulasi.py                  # jalankan, cetak hasil, simpan lintasan.png
  python3 simulasi.py --video out.mp4  # tambah rekaman pandangan kamera
  python3 simulasi.py --live           # tampilkan jendela kamera real-time
  python3 simulasi.py --noise 0.05 --seed 3   # uji dengan gangguan (kebisingan & posisi awal)
"""

import argparse
import math
import numpy as np
import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import misi_kapal as mk

# ===================== DUNIA (satuan meter; +x kanan, +y maju) =====================
BALL_R = 0.15       # jari-jari bola
BOX_HALF = 0.30     # setengah sisi box
GATE_W = 2.0        # jarak hijau-merah dalam satu gate
GATES = [(0.0, 4.0), (-1.0, 7.0), (0.0, 10.0)]   # (x tengah, y) -> zig-zag
BOX_BLUE = (-2.3, 11.8)
BALL_BLUE = (-5.3, 12.4)
BOX_YELLOW = (-3.5, 14.5)

# ===================== KAPAL & KAMERA =====================
BOAT_R = 0.25               # jari-jari badan kapal (untuk deteksi tabrakan)
MAX_SPEED = 1.0             # m/s pada perintah motor 1.0
MAX_YAW = 1.6               # rad/s pada selisih motor (R-L)/2 = 1.0
HFOV = math.radians(70)
CAM_H = 0.30                # tinggi kamera di atas air
FPX = (mk.FRAME_W / 2) / math.tan(HFOV / 2)
DT = 0.05                   # 20 FPS

# warna (BGR)
C_GREEN, C_RED = (0, 200, 0), (0, 0, 220)
C_BLUE, C_YELLOW = (230, 100, 0), (0, 220, 220)


def build_objects():
    objs = []
    for gx, gy in GATES:
        objs.append(dict(kind="ball", color=C_GREEN, pos=(gx - GATE_W / 2, gy), name="hijau"))
        objs.append(dict(kind="ball", color=C_RED, pos=(gx + GATE_W / 2, gy), name="merah"))
    objs.append(dict(kind="box", color=C_BLUE, pos=BOX_BLUE, name="box_biru"))
    objs.append(dict(kind="ball", color=C_BLUE, pos=BALL_BLUE, name="bola_biru"))
    objs.append(dict(kind="box", color=C_YELLOW, pos=BOX_YELLOW, name="box_kuning"))
    return objs


def render(objs, x, y, psi, noise=0.0, rng=None):
    """Gambar pandangan kamera dari pose kapal (x, y, psi)."""
    W, H = mk.FRAME_W, mk.FRAME_H
    img = np.zeros((H, W, 3), np.uint8)
    img[:H // 2] = (200, 195, 190)      # langit (abu terang)
    img[H // 2:] = (90, 85, 80)         # air (abu gelap, saturasi rendah)

    f = np.array([math.cos(psi), math.sin(psi)])
    l = np.array([-math.sin(psi), math.cos(psi)])

    vis = []
    for o in objs:
        rel = np.array(o["pos"]) - np.array([x, y])
        d, lat = rel @ f, rel @ l
        if d > 0.3:
            vis.append((d, lat, o))
    for d, lat, o in sorted(vis, key=lambda t: -t[0]):   # gambar yang jauh dulu
        u = W / 2 - FPX * lat / d
        if o["kind"] == "ball":
            v = H / 2 + FPX * (CAM_H - BALL_R) / d
            cv2.circle(img, (int(u), int(v)), max(1, int(FPX * BALL_R / d)), o["color"], -1)
        else:
            half = FPX * BOX_HALF / d
            v = H / 2 + FPX * (CAM_H - BOX_HALF) / d
            cv2.rectangle(img, (int(u - half), int(v - half)), (int(u + half), int(v + half)),
                          o["color"], -1)
    if noise > 0:
        img = np.clip(img + rng.normal(0, noise * 255, img.shape), 0, 255).astype(np.uint8)
    return img


def check_gates(path):
    """Apakah kapal melintas di antara bola hijau & merah pada tiap gate?"""
    results = []
    for gx, gy in GATES:
        ok = False
        for (x0, y0), (x1, y1) in zip(path[:-1], path[1:]):
            if (y0 - gy) * (y1 - gy) <= 0 and y0 != y1:
                xc = x0 + (x1 - x0) * (gy - y0) / (y1 - y0)
                if gx - GATE_W / 2 < xc < gx + GATE_W / 2:
                    ok = True
        results.append(ok)
    return results


def run(args):
    rng = np.random.default_rng(args.seed)
    objs = build_objects()
    mission = mk.Mission()

    # pose awal: di (0,0) menghadap +y; noise = posisi/arah awal sedikit meleset
    x = rng.normal(0, 0.3) if args.noise else 0.0
    y = 0.0
    psi = math.pi / 2 + (rng.normal(0, math.radians(8)) if args.noise else 0.0)

    path, states, hits = [(x, y)], [], set()
    writer = None
    t, result = 0.0, "TIMEOUT"

    while t < args.max_time:
        frame = render(objs, x, y, psi, args.noise, rng)
        left, right = mission.update(frame, t)

        # kinematika differential drive
        v = (left + right) / 2 * MAX_SPEED
        w = (right - left) / 2 * MAX_YAW
        psi += w * DT
        x += v * math.cos(psi) * DT
        y += v * math.sin(psi) * DT
        t += DT
        path.append((x, y))
        states.append(mission.state)

        # tabrakan dengan objek
        for o in objs:
            r = BALL_R if o["kind"] == "ball" else BOX_HALF * 1.2
            if math.hypot(o["pos"][0] - x, o["pos"][1] - y) < BOAT_R + r:
                if o["name"] == "bola_biru":
                    result = "KENA_BOLA_BIRU"
                else:
                    hits.add(o["name"] + f"@({o['pos'][0]:.1f},{o['pos'][1]:.1f})")
        if result == "KENA_BOLA_BIRU":
            break

        # tampilan / rekaman
        if args.live or args.video:
            vis = frame.copy()
            cv2.putText(vis, f"{mission.state}  gate={mission.gates_passed}  t={t:.1f}s",
                        (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
            if args.video and writer is None:
                writer = cv2.VideoWriter(args.video, cv2.VideoWriter_fourcc(*"mp4v"),
                                         int(1 / DT), (mk.FRAME_W, mk.FRAME_H))
            if writer:
                writer.write(vis)
            if args.live:
                cv2.imshow("kamera virtual", vis)
                if cv2.waitKey(int(DT * 1000)) == 27:   # ESC keluar
                    break
    if writer:
        writer.release()
    if args.live:
        cv2.destroyAllWindows()

    return dict(result=result, time=t, path=path, states=states, hits=sorted(hits),
                gates=check_gates(path), mission_state=mission.state)


def plot(res, filename):
    fig, ax = plt.subplots(figsize=(6, 8))
    ax.set_aspect("equal")
    for gx, gy in GATES:
        ax.plot(gx - GATE_W / 2, gy, "o", color="green", ms=10)
        ax.plot(gx + GATE_W / 2, gy, "o", color="red", ms=10)
    ax.plot(*BOX_BLUE, "s", color="dodgerblue", ms=14)
    ax.plot(*BALL_BLUE, "o", color="dodgerblue", ms=10)
    ax.plot(*BOX_YELLOW, "s", color="gold", ms=14)

    xs, ys = zip(*res["path"])
    palette = {"GATE": "tab:orange", "PAST_GATE": "tab:purple", "TURN": "tab:brown",
               "ATTACK": "tab:red", "DONE": "black"}
    for i in range(len(res["states"])):
        ax.plot(xs[i:i + 2], ys[i:i + 2], color=palette[res["states"][i]], lw=2)
    for s, c in palette.items():
        if s in res["states"]:
            ax.plot([], [], color=c, label=s)
    ax.plot(xs[0], ys[0], "k^", ms=12, label="start")
    ax.legend(loc="lower left")
    ax.set_title(f"Lintasan simulasi: {res['result']} ({res['time']:.1f} s)")
    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.grid(alpha=0.3)
    fig.savefig(filename, dpi=110, bbox_inches="tight")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--video", help="simpan rekaman kamera virtual (mp4)")
    p.add_argument("--live", action="store_true", help="tampilkan jendela kamera")
    p.add_argument("--noise", type=float, default=0.0, help="kebisingan gambar (0..0.1) + posisi awal acak")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--max-time", type=float, default=120.0)
    p.add_argument("--out", default="lintasan.png")
    args = p.parse_args()

    # matikan cetakan motor dari modul misi (opsional) -> tidak dipakai di simulator
    res = run(args)
    plot(res, args.out)

    print("=" * 50)
    print(f"Hasil          : {res['result']}  (t = {res['time']:.1f} s)")
    print(f"State terakhir : {res['mission_state']}")
    print(f"Gate 1/2/3 OK  : {res['gates']}")
    print(f"Menabrak objek lain : {res['hits'] or 'tidak ada'}")
    print(f"Lintasan disimpan di {args.out}")
