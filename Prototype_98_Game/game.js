/* =====================================================================
   PASAR SUNYI - Side scroller 2D (gaya horizontal movement ala Hollow Knight)
   ---------------------------------------------------------------------
   FILE YANG DIBUTUHKAN (taruh satu folder dengan index.html):
     background.jpg  -> gambar pasar rusak
     karakter.png    -> gambar anak SD

   CARA MENAMBAH ANIMASI SENDIRI:
     Cari bagian "SLOT ANIMASI" di bawah. Isi frames[] (urutan gambar)
     atau sheet (spritesheet) untuk state 'idle' dan 'walk'.
     Kalau dibiarkan kosong, game memakai karakter.png + efek idle
     sederhana (napas) dan efek bob saat jalan.
   ===================================================================== */

'use strict';

/* ------------------------- KONFIGURASI UMUM ------------------------- */
const CONFIG = {
  // Aset
  backgroundSrc: 'background.jpg',
  backgroundSrc: 'Background2.jpe',
  characterSrc:  'karakter.png',

  // Layar logis (canvas 1280x720)
  width: 1280,
  height: 720,

  // Dunia
  worldScreens: 2,          // panjang dunia = berapa kali lebar layar
  groundY: 0.88,         // posisi lantai (0..1 dari tinggi layar). Sesuaikan dgn background!
  mirrorTiles: false,        // cermin tiap tile agar sambungan background mulus

  // Karakter
  charHeight: 0.32,         // tinggi karakter relatif tinggi layar
  walkSpeed: 330,           // px/detik
  runSpeed: 520,
  accel: 2600,              // percepatan
  friction: 3000,           // perlambatan saat tidak menekan tombol
  jumpPower: 900,
  gravity: 2400,
  maxFall: 1500,
  coyoteTime: 0.1,          // toleransi lompat setelah turun dari tepi
  jumpBuffer: 0.12,         // toleransi menekan lompat sebelum mendarat
  variableJump: true,       // lepas tombol lebih cepat = lompatan lebih pendek

  // Hapus latar putih karakter.png otomatis (kalau PNG belum transparan)
  removeWhiteBg: true,

  // Kamera
  cameraLerp: 6,            // makin besar makin cepat mengikuti
  cameraLookAhead: 90,      // kamera sedikit melihat ke arah hadap

  // Visual
  vignette: true,
  dust: true,               // debu melayang
};

/* ====================== SLOT ANIMASI (ISI DI SINI) ====================== */
/*
  Setiap state punya dua cara pengisian (pilih salah satu):

  A) frames: daftar gambar terpisah
       frames: ['anim/idle_0.png', 'anim/idle_1.png', 'anim/idle_2.png'],

  B) sheet: satu spritesheet (frame berderet horizontal / grid)
       sheet: { src: 'anim/walk.png', frameW: 256, frameH: 512, count: 8, cols: 8 },

  fps  : kecepatan animasi
  loop : ulang terus atau tidak

  Anchor semua frame: kaki di tengah-bawah gambar (feet bottom-center).
  Jika ukuran frame berbeda dari karakter.png, atur 'scale' (1 = tinggi sama dgn charHeight
  dihitung dari tinggi frame itu sendiri).
*/
const ANIMATIONS = {
  idle: {
    frames: [],            // <-- ISI frame idle di sini (opsional)
    sheet: null,           // <-- atau spritesheet idle
    fps: 6,
    loop: true,
  },
  walk: {
    frames: ['pose_1.png', 'pose_2.png', 'pose_3.png', 'pose_4.png', 'pose_5.png', 'pose_6.png', 'pose_7.png'], // <-- ISI frame walk di sini (opsional)
    sheet: null,           // <-- atau spritesheet walking
    fps: 12,
    loop: true,
  },
  // Tambahan opsional. Kalau kosong, memakai gambar idle/walk statis.
  jump: { frames: [], sheet: null, fps: 8, loop: false },
  fall: { frames: [], sheet: null, fps: 8, loop: false },
};
/* ======================================================================== */

/* ------------------------- UTILITAS ------------------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.width;
canvas.height = CONFIG.height;

const W = CONFIG.width;
const H = CONFIG.height;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, delta) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('Gagal memuat:', src);
      resolve(null);
    };
    img.src = src;
  });
}

/* Hapus latar putih yang tersambung ke tepi gambar (flood fill),
   sehingga kemeja putih di dalam karakter tidak ikut terhapus. */
function removeWhiteBackground(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);

  let data;
  try {
    data = g.getImageData(0, 0, c.width, c.height);
  } catch (e) {
    console.warn('Tidak bisa memproses piksel (buka lewat server lokal, bukan file://). Memakai gambar apa adanya.');
    return img;
  }

  const { width: w, height: h } = c;
  const px = data.data;

  // Jika gambar sudah transparan di sudut, tidak perlu diproses
  if (px[3] < 250) return img;

  const isBg = (i) => px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238 && px[i + 3] > 0;
  const seen = new Uint8Array(w * h);
  const stack = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = y * w + x;
    if (seen[k]) return;
    if (!isBg(k * 4)) return;
    seen[k] = 1;
    stack.push(k);
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const k = stack.pop();
    const x = k % w, y = (k / w) | 0;
    px[k * 4 + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  g.putImageData(data, 0, 0);
  return c;
}

/* Cari tepi sprite (bounding box piksel tidak transparan) supaya kaki pas di lantai */
function trimBounds(source) {
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0);
  try {
    const d = g.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, w, h };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch (e) {
    return { x: 0, y: 0, w, h };
  }
}

/* ------------------------- INPUT ------------------------- */
const keys = {};
const pressed = {};
const touch = { left: false, right: false, jump: false };
let debug = false;

window.addEventListener('keydown', (e) => {
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
  if (k === 'F1') { e.preventDefault(); debug = !debug; }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function bindTouch(id, name) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = (e) => { e.preventDefault(); touch[name] = true; el.classList.add('on'); if (name === 'jump') pressed.TouchJump = true; };
  const off = (e) => { e.preventDefault(); touch[name] = false; el.classList.remove('on'); };
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
bindTouch('btnLeft', 'left');
bindTouch('btnRight', 'right');
bindTouch('btnJump', 'jump');

const input = {
  left:  () => keys.KeyA || keys.ArrowLeft || touch.left,
  right: () => keys.KeyD || keys.ArrowRight || touch.right,
  run:   () => keys.ShiftLeft || keys.ShiftRight,
  jumpHeld: () => keys.Space || keys.KeyW || keys.ArrowUp || touch.jump,
  jumpPressed: () => pressed.Space || pressed.KeyW || pressed.ArrowUp || pressed.TouchJump,
};

/* ------------------------- SISTEM ANIMASI ------------------------- */
class AnimState {
  constructor(def) {
    this.def = def;
    this.images = [];       // untuk mode frames
    this.sheetImg = null;   // untuk mode sheet
    this.ready = false;
  }

  async load() {
    const d = this.def;
    if (d.frames && d.frames.length) {
      const imgs = await Promise.all(d.frames.map(loadImage));
      this.images = imgs.filter(Boolean);
      this.ready = this.images.length > 0;
    } else if (d.sheet && d.sheet.src) {
      this.sheetImg = await loadImage(d.sheet.src);
      this.ready = !!this.sheetImg;
    }
  }

  get count() {
    if (this.images.length) return this.images.length;
    if (this.sheetImg) return this.def.sheet.count;
    return 0;
  }

  /* Mengembalikan {img, sx, sy, sw, sh} untuk frame ke-i */
  frame(i) {
    if (this.images.length) {
      const img = this.images[i % this.images.length];
      return { img, sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
    }
    const s = this.def.sheet;
    const cols = s.cols || s.count;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { img: this.sheetImg, sx: col * s.frameW, sy: row * s.frameH, sw: s.frameW, sh: s.frameH };
  }
}

const anims = {};

async function loadAnimations() {
  for (const name of Object.keys(ANIMATIONS)) {
    anims[name] = new AnimState(ANIMATIONS[name]);
    await anims[name].load();
  }
}

/* ------------------------- PLAYER ------------------------- */
const player = {
  x: 300,
  y: 0,            // posisi kaki
  vx: 0,
  vy: 0,
  facing: 1,       // 1 = kanan, -1 = kiri
  onGround: true,
  coyote: 0,
  buffer: 0,
  state: 'idle',
  animTime: 0,
  squash: 0,       // efek mendarat
  stepDust: 0,
};

let sprite = null;       // sprite statis (karakter.png)
let spriteBounds = null; // bounding box piksel
let bgImg = null;

/* ------------------------- DUNIA & KAMERA ------------------------- */
let tileW = W;           // lebar 1 tile background setelah di-scale ke tinggi layar
let worldW = W * CONFIG.worldScreens;
const camera = { x: 0 };
const groundY = () => Math.round(H * CONFIG.groundY);

/* Debu melayang untuk suasana */
const dust = Array.from({ length: 60 }, () => ({
  x: Math.random() * 4000,
  y: Math.random() * H,
  r: 0.8 + Math.random() * 2,
  s: 6 + Math.random() * 14,
  a: 0.1 + Math.random() * 0.25,
  p: Math.random() * 6.28,
}));

/* ------------------------- UPDATE ------------------------- */
function update(dt) {
  const p = player;
  const gy = groundY();

  // Input horizontal
  let dir = 0;
  if (input.left()) dir -= 1;
  if (input.right()) dir += 1;

  const maxSpeed = input.run() ? CONFIG.runSpeed : CONFIG.walkSpeed;

  if (dir !== 0) {
    p.facing = dir;
    p.vx = approach(p.vx, dir * maxSpeed, CONFIG.accel * dt);
  } else {
    p.vx = approach(p.vx, 0, CONFIG.friction * dt);
  }

  // Lompat (dengan coyote time & jump buffer)
  p.coyote = p.onGround ? CONFIG.coyoteTime : p.coyote - dt;
  p.buffer = input.jumpPressed() ? CONFIG.jumpBuffer : p.buffer - dt;

  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -CONFIG.jumpPower;
    p.onGround = false;
    p.coyote = 0;
    p.buffer = 0;
    p.squash = -0.12; // meregang saat lompat
  }

  // Lompatan variabel
  if (CONFIG.variableJump && p.vy < -250 && !input.jumpHeld()) {
    p.vy = approach(p.vy, -250, 6000 * dt);
  }

  // Gravitasi
  p.vy = Math.min(p.vy + CONFIG.gravity * dt, CONFIG.maxFall);

  // Gerak
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Batas dunia
  const half = 40;
  p.x = clamp(p.x, half, worldW - half);

  // Tabrak lantai
  const wasAir = !p.onGround;
  if (p.y >= gy) {
    p.y = gy;
    if (p.vy > 300) p.squash = clamp(p.vy / 9000, 0.05, 0.22); // menekuk saat mendarat
    p.vy = 0;
    p.onGround = true;
    if (wasAir) p.animTime = 0;
  } else {
    p.onGround = false;
  }

  // State animasi
  let next;
  if (!p.onGround) next = p.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(p.vx) > 20) next = 'walk';
  else next = 'idle';

  if (next !== p.state) {
    p.state = next;
    p.animTime = 0;
  }
  p.animTime += dt;

  // Efek squash pulih
  p.squash = approach(p.squash, 0, dt * 1.2);

  // Kamera
  const target = clamp(
    p.x - W / 2 + p.facing * CONFIG.cameraLookAhead * (Math.abs(p.vx) > 20 ? 1 : 0.3),
    0,
    worldW - W
  );
  camera.x += (target - camera.x) * Math.min(1, CONFIG.cameraLerp * dt);
  camera.x = clamp(camera.x, 0, worldW - W);

  // Reset tombol "baru ditekan"
  for (const k in pressed) pressed[k] = false;
}

/* ------------------------- RENDER ------------------------- */
function drawBackground() {
  if (!bgImg) {
    // Placeholder jika background.png belum ada
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a3a3d');
    g.addColorStop(1, '#151516');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, groundY(), W, H - groundY());
    ctx.fillStyle = '#aaa';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('background.jpg tidak ditemukan', W / 2, H / 2);
    return;
  }

  const first = Math.floor(camera.x / tileW);
  const last = Math.floor((camera.x + W) / tileW);
  for (let i = first; i <= last; i++) {
    const dx = Math.round(i * tileW - camera.x);
    if (CONFIG.mirrorTiles && i % 2 !== 0) {
      ctx.save();
      ctx.translate(dx + tileW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bgImg, 0, 0, tileW + 1, H);
      ctx.restore();
    } else {
      ctx.drawImage(bgImg, dx, 0, tileW + 1, H);
    }
  }
}

function drawDust(t) {
  if (!CONFIG.dust) return;
  ctx.save();
  for (const d of dust) {
    // efek parallax ringan (lebih lambat dari kamera)
    let x = (d.x - camera.x * 0.6 + Math.sin(t * 0.0005 + d.p) * 30) % (W + 100);
    if (x < -50) x += W + 100;
    const y = (d.y - t * 0.001 * d.s) % H;
    ctx.globalAlpha = d.a;
    ctx.fillStyle = '#e8e0d8';
    ctx.beginPath();
    ctx.arc(x, y < 0 ? y + H : y, d.r, 0, 6.283);
    ctx.fill();
  }
  ctx.restore();
}

function drawShadow() {
  const p = player;
  const sx = p.x - camera.x;
  const height = groundY() - p.y;               // jarak dari lantai
  const scale = clamp(1 - height / 500, 0.4, 1);
  ctx.save();
  ctx.globalAlpha = 0.35 * scale;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(sx, groundY() + 4, 46 * scale, 9 * scale, 0, 0, 6.283);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  const sx = Math.round(p.x - camera.x);
  const sy = Math.round(p.y);

  const targetH = H * CONFIG.charHeight;

  // Tentukan sumber gambar: animasi buatan pengguna atau sprite statis
  let src = null;     // {img, sx, sy, sw, sh}
  let useCustom = false;

  // fallback state: jump/fall -> idle/walk bila kosong
  let name = p.state;
  let anim = anims[name];
  if (!anim || !anim.ready) {
    if (name === 'jump' || name === 'fall') {
      name = Math.abs(p.vx) > 20 ? 'walk' : 'idle';
      anim = anims[name];
    }
  }

  if (anim && anim.ready && anim.count > 0) {
    const def = anim.def;
    let idx = Math.floor(p.animTime * def.fps);
    idx = def.loop ? idx % anim.count : Math.min(idx, anim.count - 1);
    src = anim.frame(idx);
    useCustom = true;
  } else if (sprite) {
    src = { img: sprite, sx: spriteBounds.x, sy: spriteBounds.y, sw: spriteBounds.w, sh: spriteBounds.h };
  }

  if (!src) {
    // Placeholder jika karakter.png tidak ditemukan
    ctx.fillStyle = '#c33';
    ctx.fillRect(sx - 25, sy - targetH, 50, targetH);
    return;
  }

  const scale = targetH / src.sh;
  let dw = src.sw * scale;
  let dh = src.sh * scale;

  // Efek procedural (hanya jika memakai sprite statis)
  let bobY = 0, tilt = 0, sx2 = 1, sy2 = 1;
  if (!useCustom) {
    const t = p.animTime;
    if (p.state === 'idle') {
      // napas pelan
      const b = Math.sin(t * 2.4);
      sy2 = 1 + b * 0.012;
      sx2 = 1 - b * 0.006;
    } else if (p.state === 'walk') {
      // goyang kecil sebagai pengganti walking (nanti diganti animasi Anda)
      const run = Math.abs(p.vx) > CONFIG.walkSpeed + 40;
      const f = run ? 14 : 10;
      bobY = -Math.abs(Math.sin(t * f)) * (run ? 9 : 6);
      tilt = Math.sin(t * f) * (run ? 0.045 : 0.03);
    } else if (p.state === 'jump') {
      sy2 = 1.04; sx2 = 0.97;
    } else if (p.state === 'fall') {
      sy2 = 1.02; sx2 = 0.98;
    }
  }

  // squash & stretch saat lompat/mendarat
  sy2 *= 1 - p.squash;
  sx2 *= 1 + p.squash * 0.8;

  ctx.save();
  ctx.translate(sx, sy + bobY);          // titik kaki
  ctx.rotate(tilt * p.facing);
  ctx.scale(p.facing * sx2, sy2);        // balik horizontal sesuai arah
  ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, -dw / 2, -dh, dw, dh);
  ctx.restore();

  if (debug) {
    ctx.save();
    ctx.strokeStyle = '#0f0';
    ctx.strokeRect(sx - dw / 2, sy - dh, dw, dh);
    ctx.restore();
  }
}

function drawVignette() {
  if (!CONFIG.vignette) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawDebug() {
  if (!debug) return;
  const gy = groundY();
  ctx.save();
  ctx.strokeStyle = '#ff0';
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(W, gy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.fillRect(10, 50, 290, 118);
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  const p = player;
  [
    `state   : ${p.state}`,
    `x / y   : ${p.x.toFixed(0)} / ${p.y.toFixed(0)}`,
    `vx / vy : ${p.vx.toFixed(0)} / ${p.vy.toFixed(0)}`,
    `kamera  : ${camera.x.toFixed(0)}  dunia: ${worldW.toFixed(0)}`,
    `groundY : ${gy}  (CONFIG.groundY=${CONFIG.groundY})`,
  ].forEach((line, i) => ctx.fillText(line, 20, 74 + i * 20));
  ctx.restore();
}

function render(t) {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawDust(t);
  drawShadow();
  drawPlayer();
  drawVignette();
  drawDebug();
}

/* ------------------------- GAME LOOP ------------------------- */
let last = 0;
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  render(now);
  requestAnimationFrame(loop);
}

/* ------------------------- INISIALISASI ------------------------- */
async function init() {
  const [bg, ch] = await Promise.all([
    loadImage(CONFIG.backgroundSrc),
    loadImage(CONFIG.characterSrc),
  ]);

  bgImg = bg;
  if (bgImg) {
    // Skala background ke tinggi layar, lalu ulang secara horizontal
    tileW = bgImg.naturalWidth * (H / bgImg.naturalHeight);
    worldW = Math.max(W, Math.round(tileW * CONFIG.worldScreens));
  } else {
    worldW = W * CONFIG.worldScreens;
  }

  if (ch) {
    sprite = CONFIG.removeWhiteBg ? removeWhiteBackground(ch) : ch;
    spriteBounds = trimBounds(sprite);
  }

  await loadAnimations();

  player.x = Math.min(360, worldW / 2);
  player.y = groundY();
  camera.x = clamp(player.x - W / 2, 0, worldW - W);

  document.getElementById('loading').classList.add('hide');
  requestAnimationFrame((t) => { last = t; loop(t); });
}

init();
