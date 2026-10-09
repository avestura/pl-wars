// Procedural pixel-art sprite-sheet generator (no dependencies).
// Run: npm run sprites   -> writes public/sprites/<id>.png + sprites.json + preview.png
// Every character is drawn from a shared skeleton + per-language head/torso/accessory painters,
// so animations stay consistent and new characters are cheap to add.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/sprites');
fs.mkdirSync(OUT, { recursive: true });

const FW = 48, FH = 48, BASE = 44; // frame size, ground line
const COLS = 6;

// ---------- tiny raster toolkit ----------
const hex = (s) => {
  if (Array.isArray(s)) return s;
  const n = parseInt(s.slice(1), 16);
  return s.length > 7 ? [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const shade = (s, f) => { const c = hex(s); return [c[0] * f, c[1] * f, c[2] * f, c[3] ?? 255].map((v, i) => i < 3 ? Math.max(0, Math.min(255, Math.round(v))) : v); };

class Img {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    c = hex(c); const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3];
  }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.3), dy = (y - cy) / (ry + 0.3);
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }
  ring(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x - cx) / (rx + 0.3), dy = (y - cy) / (ry + 0.3), d = dx * dx + dy * dy;
        if (d <= 1 && d > 0.55) this.px(x, y, c);
      }
  }
  line(x0, y0, x1, y1, c, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (th <= 1) this.px(x0, y0, c); else this.rect(x0 - Math.floor((th - 1) / 2), y0 - Math.floor((th - 1) / 2), th, th, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minx = Math.floor(Math.min(x0, x1, x2)), maxx = Math.ceil(Math.max(x0, x1, x2));
    const miny = Math.floor(Math.min(y0, y1, y2)), maxy = Math.ceil(Math.max(y0, y1, y2));
    const s = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const d1 = s(x, y, x0, y0, x1, y1), d2 = s(x, y, x1, y1, x2, y2), d3 = s(x, y, x2, y2, x0, y0);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.px(x, y, c);
    }
  }
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.d[i + 3]) this.px(x + dx, y + dy, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
    }
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.a(x, y)) continue;
      if (this.a(x + 1, y) || this.a(x - 1, y) || this.a(x, y + 1) || this.a(x, y - 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.px(x, y, c);
  }
  glow(c, r = 2) {
    const base = hex(c);
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.a(x, y)) continue;
      let best = 99;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (this.a(x + i, y + j) > 200) best = Math.min(best, Math.abs(i) + Math.abs(j));
      if (best <= r + 1) add.push([x, y, Math.round(70 / best)]);
    }
    for (const [x, y, a] of add) this.px(x, y, [base[0], base[1], base[2], a]);
  }
  rotated(deg) {
    const out = new Img(this.w, this.h), r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), cx = 24, cy = 28;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(cx + dx * cs + dy * sn), sy = Math.round(cy - dx * sn + dy * cs);
      if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) continue;
      const i = (sy * this.w + sx) * 4;
      if (this.d[i + 3]) out.px(x, y, [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]);
    }
    // drop so the lowest pixel rests on the ground line
    let maxY = 0, minX = 99, maxX = 0;
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) if (out.a(x, y)) { maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    const res = new Img(this.w, this.h);
    res.blit(out, Math.round(24 - (minX + maxX) / 2), BASE - maxY);
    return res;
  }
}

// 3x5 font for emblems
const FONT = {
  J: ['..#', '..#', '..#', '#.#', '.#.'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  C: ['.##', '#..', '#..', '#..', '.##'], '+': ['...', '.#.', '###', '.#.', '...'], '#': ['.#.#', '####', '.#.#', '####', '.#.#'],
  F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  L: ['#..', '.#.', '.#.', '#.#', '#.#'], R: ['##.', '#.#', '##.', '#.#', '#.#'], o: ['...', '.#.', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
};
function text(img, str, x, y, c) {
  for (const ch of str) {
    const g = FONT[ch]; if (!g) continue;
    for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') img.px(x + i, y + j, c);
    x += g[0].length + 1;
  }
}
const textW = (s) => s.length * 4 - 1;

// ---------- poses ----------
const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const P = (o) => Object.assign({ dy: 0, lean: 1, aF: [8, 1], aB: [4, 3], fF: [5, 0], fB: [-5, 0], mouth: 0, angry: 0, hurt: 0 }, o);

const ANIMS = [
  ['idle', 4, 6, (i) => P({ dy: [0, 0, 1, 1][i], aF: [8, 1 + [0, 0, 1, 1][i]], aB: [4, 3 + [0, 0, 1, 1][i]] })],
  ['walk', 6, 12, (i) => { const p = i / 6 * 2 * PI; return P({ dy: i % 3 === 0 ? 1 : 0, lean: 2, aF: [5 - sin(p) * 4, 3], aB: [-1 + sin(p) * 4, 3], fF: [sin(p) * 7, Math.max(0, -cos(p)) * 3], fB: [-sin(p) * 7, Math.max(0, cos(p)) * 3] }); }],
  ['jump', 2, 6, (i) => i === 0 ? P({ dy: -1, aF: [7, -7], aB: [-4, -6], fF: [4, 6], fB: [-3, 4] }) : P({ dy: -1, aF: [8, -4], aB: [-5, -4], fF: [6, 4], fB: [-6, 4] })],
  ['fall', 1, 6, () => P({ dy: 0, aF: [8, -5], aB: [-6, -3], fF: [4, 4], fB: [-4, 2], mouth: 1 })],
  ['light', 3, 14, (i) => [P({ lean: -2, aF: [-2, 2], aB: [4, 3], angry: 1 }), P({ lean: 3, aF: [16, 0], aB: [3, 3], fF: [7, 0], fB: [-6, 0], mouth: 1, angry: 1 }), P({ lean: 1, aF: [9, 2], aB: [4, 3] })][i]],
  ['heavy', 5, 12, (i) => [
    P({ lean: -3, aF: [-4, -5], aB: [-5, 2], angry: 1 }), P({ lean: -4, dy: 1, aF: [-5, -7], aB: [-6, 0], fF: [4, 0], fB: [-6, 0], angry: 1 }),
    P({ lean: 5, aF: [17, -3], aB: [11, 2], fF: [9, 0], fB: [-7, 0], mouth: 1, angry: 1 }), P({ lean: 5, aF: [19, -1], aB: [12, 1], fF: [9, 0], fB: [-7, 0], mouth: 1, angry: 1 }),
    P({ lean: 2, aF: [10, 2], aB: [6, 3] })][i]],
  ['block', 1, 6, () => P({ dy: 2, lean: -1, aF: [8, -6], aB: [7, -2], fF: [6, 0], fB: [-6, 0], angry: 1 })],
  ['hurt', 2, 8, (i) => i === 0 ? P({ lean: -4, aF: [-3, -6], aB: [-6, -4], fF: [3, 0], fB: [-4, 2], hurt: 1, mouth: 1 }) : P({ lean: -5, dy: 1, aF: [-4, -3], aB: [-6, -1], fF: [3, 0], fB: [-5, 0], hurt: 1, mouth: 1 })],
  ['dodge', 1, 6, () => P({ dy: 4, lean: 6, aF: [10, 3], aB: [7, 4], fF: [8, 0], fB: [-8, 0] })],
  ['special', 4, 10, (i) => [
    P({ lean: -2, aF: [-3, -6], aB: [-5, -5], angry: 1 }), P({ lean: 0, dy: -1, aF: [6, -9], aB: [3, -9], fF: [4, 1], fB: [-4, 1], angry: 1, mouth: 1 }),
    P({ lean: 4, aF: [16, -2], aB: [14, 0], fF: [8, 0], fB: [-6, 0], mouth: 1, angry: 1 }), P({ lean: 3, aF: [12, 0], aB: [9, 1], fF: [6, 0], fB: [-5, 0] })][i]],
  ['ko', 3, 6, (i) => P({ lean: -5, aF: [-4, -3], aB: [-6, -1], fF: [3, 0], fB: [-5, 0], hurt: 1, mouth: 1, _rot: [28, 62, 90][i] })],
  ['win', 4, 6, (i) => P({ dy: [0, -2, -3, -1][i] * 1, aF: [i % 2 ? 6 : 2, -9], aB: [i % 2 ? -5 : -2, -9], fF: [3, [0, 2, 3, 1][i]], fB: [-3, [0, 2, 3, 1][i]], mouth: 1 })],
];

// ---------- character painters ----------
// ctx g: {cx, lean, hipY, top (torso top), hx, hy (head centre), pose}
const skinHand = (img, x, y, c, claw) => {
  img.rect(x - 1, y - 1, 3, 3, c);
  if (claw) { img.px(x + 2, y - 1, c); img.px(x + 2, y + 1, c); img.px(x + 1, y, null); }
};

function eyesDefault(img, g, white = '#ffffff', pupil = '#111111', size = 2) {
  const { hx, hy, pose } = g;
  const ey = hy - 1;
  for (const ex of [hx + 1, hx + 5]) {
    img.rect(ex, ey, size, size + (pose.hurt ? 0 : 1), white);
    img.px(ex + (size > 1 ? 1 : 0), ey + 1, pupil);
  }
  if (pose.angry) { img.line(hx, hy - 3, hx + 3, hy - 2, '#111'); img.line(hx + 4, hy - 2, hx + 7, hy - 3, '#111'); }
}
function mouth(img, g, c = '#111') {
  const { hx, hy, pose } = g;
  if (pose.mouth) img.rect(hx + 2, hy + 3, 4, 2, c); else img.line(hx + 2, hy + 3, hx + 5, hy + 3, c);
}

const CHARS = {
  javascript: {
    skin: '#f7df1e', arm: '#f7df1e', hand: '#f7df1e', leg: '#2b2b2b', foot: '#f7df1e', outline: '#1a1a1a',
    torso(img, g) { const { cx, lean, top } = g; img.rect(cx - 6 + lean, top, 13, 14, '#f7df1e'); text(img, 'JS', cx - 3 + lean + 1, top + 7, '#1a1a1a'); img.rect(cx - 6 + lean, top, 13, 1, '#fff27a'); },
    head(img, g) { const { hx, hy } = g; img.rect(hx - 6, hy - 6, 14, 13, '#f7df1e'); img.rect(hx - 6, hy - 6, 14, 1, '#fff27a'); img.rect(hx + 3, hy - 8, 3, 2, '#f7df1e'); eyesDefault(img, g, '#fff', '#111'); mouth(img, g); },
  },
  typescript: {
    skin: '#3178c6', arm: '#3178c6', hand: '#e8f1fb', leg: '#1e4a80', foot: '#e8f1fb', outline: '#0d2644',
    torso(img, g) { const { cx, lean, top } = g; img.rect(cx - 6 + lean, top, 13, 14, '#3178c6'); text(img, 'TS', cx - 3 + lean + 1, top + 7, '#ffffff'); img.rect(cx - 6 + lean, top, 13, 1, '#6aa5e8'); },
    head(img, g) {
      const { hx, hy } = g; img.rect(hx - 6, hy - 6, 14, 13, '#3178c6'); img.rect(hx - 6, hy - 6, 14, 1, '#6aa5e8');
      eyesDefault(img, g, '#fff', '#0d2644'); img.ring(hx + 2, hy, 3, 3, '#fff'); img.ring(hx + 6, hy, 3, 3, '#fff'); mouth(img, g, '#fff');
    },
  },
  python: {
    skin: '#3776ab', arm: '#3776ab', hand: '#ffd43b', leg: '#ffd43b', foot: '#3776ab', outline: '#14304a',
    snake: true,
    head(img, g) {
      const { hx, hy, pose } = g; img.ellipse(hx, hy, 8, 6, '#3776ab'); img.ellipse(hx + 2, hy + 3, 6, 2, '#ffd43b');
      img.rect(hx + 1, hy - 3, 3, 3, '#ffd43b'); img.px(hx + 3, hy - 2, '#111'); img.px(hx + 3, hy - 3, '#111');
      if (pose.angry) img.line(hx, hy - 4, hx + 5, hy - 3, '#14304a');
      if (pose.mouth) { img.rect(hx + 6, hy + 2, 5, 1, '#e23d3d'); img.px(hx + 11, hy + 1, '#e23d3d'); img.px(hx + 11, hy + 3, '#e23d3d'); } else img.px(hx + 8, hy + 1, '#14304a');
    },
  },
  go: {
    skin: '#00add8', arm: '#00add8', hand: '#00add8', leg: '#008fb3', foot: '#00add8', outline: '#00465a',
    back(img, g) { const { cx, lean, hipY } = g; img.ellipse(cx - 8 + lean, hipY - 1, 2, 3, '#008fb3'); },
    torso(img, g) { const { cx, lean, top } = g; img.ellipse(cx + lean, top + 7, 7, 7.5, '#00add8'); img.ellipse(cx + 1 + lean, top + 9, 4, 5, '#7fe3f5'); },
    head(img, g) {
      const { hx, hy, pose } = g; img.ellipse(hx - 4, hy - 6, 2, 2, '#00add8'); img.ellipse(hx + 6, hy - 6, 2, 2, '#00add8');
      img.ellipse(hx, hy, 8, 7, '#00add8');
      for (const ex of [hx - 1, hx + 5]) { img.ellipse(ex, hy - 1, 3, 3, '#ffffff'); img.px(ex + 1, hy - 1, '#111'); img.px(ex + 1, hy, '#111'); }
      img.ellipse(hx + 3, hy + 2, 2, 1, '#00465a');
      img.rect(hx + 2, hy + 3, 2, pose.mouth ? 3 : 2, '#ffffff'); img.rect(hx + 4, hy + 3, 1, 2, '#ffffff');
      if (pose.angry) { img.line(hx - 3, hy - 5, hx + 1, hy - 3, '#00465a'); img.line(hx + 4, hy - 3, hx + 8, hy - 5, '#00465a'); }
    },
  },
  rust: {
    skin: '#e8501a', arm: '#e8501a', hand: '#e8501a', claw: true, leg: '#b83a10', foot: '#b83a10', outline: '#3a1004',
    torso(img, g) {
      const { cx, lean, top } = g; img.ellipse(cx + lean, top + 8, 9, 8, '#e8501a'); img.ellipse(cx + lean, top + 11, 7, 4, '#ff8a55');
      for (let i = -6; i <= 6; i += 4) img.px(cx + lean + i, top + 3 + Math.abs(i) / 3, '#b83a10');
    },
    head(img, g) {
      const { hx, hy, pose } = g;
      for (const ex of [hx - 1, hx + 5]) { img.line(ex, hy - 1, ex, hy - 7, '#b83a10'); img.ellipse(ex, hy - 8, 2, 2, '#ffffff'); img.px(ex + 1, hy - 8, '#111'); img.px(ex + 1, hy - 7, '#111'); }
      img.ellipse(hx + 2, hy + 1, 6, 3, '#e8501a');
      if (pose.mouth) img.rect(hx, hy + 2, 5, 2, '#3a1004'); else img.line(hx, hy + 2, hx + 4, hy + 2, '#3a1004');
      if (pose.angry) { img.line(hx - 3, hy - 9, hx + 1, hy - 7, '#111'); img.line(hx + 4, hy - 7, hx + 8, hy - 9, '#111'); }
    },
  },
  haskell: {
    skin: '#e9c9a4', arm: '#5e5086', hand: '#e9c9a4', leg: '#453a62', foot: '#2e2745', outline: '#14102a',
    torso(img, g) { const { cx, lean, top, hipY } = g; img.tri(cx - 7 + lean, top, cx + 8 + lean, top, cx + 10 + lean, hipY + 2, '#5e5086'); img.rect(cx - 7 + lean, top, 15, 14, '#5e5086'); text(img, 'L', cx - 1 + lean, top + 6, '#c7b6ff'); img.rect(cx - 7 + lean, top + 12, 15, 2, '#8f4e8b'); },
    head(img, g) {
      const { hx, hy, pose } = g; img.rect(hx - 5, hy - 5, 12, 11, '#e9c9a4');
      img.tri(hx - 8, hy - 5, hx + 9, hy - 5, hx + 1, hy - 18, '#453a62'); img.rect(hx - 8, hy - 6, 17, 2, '#5e5086'); img.px(hx + 1, hy - 14, '#ffd86b'); img.px(hx + 3, hy - 10, '#ffd86b');
      // beard
      img.tri(hx - 5, hy + 1, hx + 7, hy + 1, hx + 1, hy + 11, '#eeeef5'); img.rect(hx - 5, hy + 1, 12, 3, '#eeeef5');
      img.line(hx + 1, hy - 1, hx + 3, hy - 1, '#222'); img.line(hx + 5, hy - 1, hx + 6, hy - 1, '#222');
      if (pose.angry) { img.line(hx, hy - 3, hx + 3, hy - 2, '#999'); img.line(hx + 4, hy - 2, hx + 7, hy - 3, '#999'); }
      if (pose.mouth) img.rect(hx + 2, hy + 3, 3, 2, '#7a3b3b');
    },
  },
  fsharp: {
    skin: '#378bba', arm: '#378bba', hand: '#30b9db', leg: '#1b4f72', foot: '#30b9db', outline: '#0b2338',
    torso(img, g) { const { cx, lean, top } = g; img.rect(cx - 6 + lean, top, 13, 14, '#378bba'); text(img, 'F#', cx - 3 + lean + 1, top + 7, '#ffffff'); img.rect(cx - 6 + lean, top, 13, 1, '#7fcbe8'); img.rect(cx - 6 + lean, top + 13, 13, 1, '#1b4f72'); },
    head(img, g) {
      const { hx, hy } = g; img.ellipse(hx, hy, 7, 6.5, '#378bba'); img.ellipse(hx, hy - 4, 6, 2, '#30b9db');
      img.rect(hx + 1, hy - 2, 8, 3, '#0b2338'); img.rect(hx + 2, hy - 1, 2, 1, '#30b9db'); img.rect(hx + 6, hy - 1, 2, 1, '#30b9db');
      mouth(img, g, '#0b2338'); text(img, '#', hx - 8, hy - 11, '#30b9db');
    },
  },
  csharp: {
    skin: '#9b4f96', arm: '#9b4f96', hand: '#e9c4e6', leg: '#68217a', foot: '#e9c4e6', outline: '#2a0a33',
    torso(img, g) { const { cx, lean, top } = g; img.rect(cx - 6 + lean, top, 13, 14, '#9b4f96'); text(img, 'C#', cx - 3 + lean + 1, top + 7, '#ffffff'); img.rect(cx - 6 + lean, top, 13, 1, '#c68ac2'); img.rect(cx - 6 + lean, top + 12, 13, 2, '#68217a'); },
    head(img, g) {
      const { hx, hy, pose } = g; img.rect(hx - 6, hy - 6, 14, 13, '#9b4f96'); img.rect(hx - 6, hy - 6, 14, 1, '#c68ac2');
      // crown
      img.rect(hx - 5, hy - 9, 12, 3, '#ffd700'); img.tri(hx - 5, hy - 9, hx - 3, hy - 9, hx - 4, hy - 12, '#ffd700'); img.tri(hx, hy - 9, hx + 2, hy - 9, hx + 1, hy - 13, '#ffd700'); img.tri(hx + 4, hy - 9, hx + 6, hy - 9, hx + 5, hy - 12, '#ffd700');
      img.px(hx + 1, hy - 8, '#e23d3d');
      for (const ex of [hx + 1, hx + 5]) { img.rect(ex, hy - 1, 3, 3, '#fff'); img.px(ex + 2, hy, '#111'); img.line(ex, hy - 2, ex + 2, hy - 2, '#2a0a33'); }
      mouth(img, g, '#2a0a33');
    },
  },
  c: {
    skin: '#a8b9cc', arm: '#8497ad', hand: '#d3dde8', leg: '#53657d', foot: '#2a3547', outline: '#0f1620',
    torso(img, g) { const { cx, lean, top } = g; img.rect(cx - 6 + lean, top, 13, 14, '#8497ad'); text(img, 'C', cx - 1 + lean, top + 6, '#1d2a3b'); img.rect(cx - 6 + lean, top, 13, 1, '#c3d0de'); img.rect(cx - 6 + lean, top + 12, 13, 2, '#53657d'); img.px(cx - 4 + lean, top + 3, '#c3d0de'); },
    head(img, g) {
      const { hx, hy, pose } = g; img.rect(hx - 5, hy - 6, 12, 13, '#a8b9cc'); img.rect(hx - 6, hy - 4, 14, 9, '#a8b9cc'); img.rect(hx - 5, hy - 6, 12, 1, '#d3dde8');
      img.rect(hx - 5, hy - 7, 12, 2, '#2a3547'); // flat-top hair
      img.rect(hx + 1, hy - 1, 3, 2, '#fff'); img.rect(hx + 5, hy - 1, 3, 2, '#fff'); img.px(hx + 3, hy - 1, '#111'); img.px(hx + 7, hy - 1, '#111');
      img.line(hx, hy - 3, hx + 4, hy - 2, '#111'); img.line(hx + 4, hy - 2, hx + 8, hy - 3, '#111');
      img.line(hx - 2, hy - 3, hx + 0, hy + 1, '#7a2e2e'); // scar
      for (let i = 0; i < 5; i++) img.px(hx - 3 + i * 2, hy + 4, '#53657d');
      if (pose.mouth) img.rect(hx + 2, hy + 3, 4, 2, '#111'); else img.line(hx + 2, hy + 3, hx + 6, hy + 3, '#111');
    },
  },
  cpp: {
    skin: '#659ad2', arm: '#00599c', hand: '#9cc2e8', leg: '#003f70', foot: '#9cc2e8', outline: '#001a30', wide: 2,
    back(img, g) { const { cx, lean, top } = g; img.line(cx - 4 + lean, top + 8, cx - 11 + lean, top + 12, '#00599c', 2); img.rect(cx - 13 + lean, top + 11, 3, 3, '#9cc2e8'); },
    torso(img, g) {
      const { cx, lean, top } = g; img.rect(cx - 8 + lean, top - 1, 17, 15, '#00599c'); img.rect(cx - 8 + lean, top - 1, 17, 1, '#659ad2'); img.rect(cx - 8 + lean, top + 12, 17, 2, '#003f70');
      text(img, 'C++', cx - 5 + lean + 1, top + 6, '#ffffff');
      img.line(cx + 6 + lean, top + 9, cx + 11 + lean, top + 12, '#00599c', 2); img.rect(cx + 10 + lean, top + 12, 3, 3, '#9cc2e8');
    },
    head(img, g) {
      const { hx, hy, pose } = g; img.rect(hx - 6, hy - 6, 14, 13, '#659ad2'); img.rect(hx - 7, hy - 3, 16, 7, '#659ad2'); img.rect(hx - 6, hy - 6, 14, 1, '#9cc2e8');
      img.rect(hx + 1, hy - 2, 3, 3, '#fff'); img.rect(hx + 5, hy - 2, 3, 3, '#fff'); img.px(hx + 3, hy - 1, '#111'); img.px(hx + 7, hy - 1, '#111');
      img.line(hx, hy - 4, hx + 4, hy - 3, '#001a30'); img.line(hx + 4, hy - 3, hx + 8, hy - 4, '#001a30');
      if (pose.mouth) img.rect(hx + 1, hy + 3, 6, 3, '#001a30'); else img.line(hx + 1, hy + 4, hx + 6, hy + 4, '#001a30');
      img.px(hx + 2, hy + 4, '#fff'); img.px(hx + 5, hy + 4, '#fff');
    },
  },
  nirvana: {
    skin: '#fff5d6', arm: '#fff5d6', hand: '#ffd86b', leg: '#fff', foot: '#fff', outline: '#ffd86b', float: true, glow: '#fff1b0',
    back(img, g) { const { cx, lean, top } = g; img.ring(cx + lean - 2, top + 6, 13, 13, '#ffd86b'); for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * PI; img.px(cx + lean - 2 + cos(a) * 14, top + 6 + sin(a) * 14, '#fff'); } },
    torso(img, g) {
      const { cx, lean, top, hipY } = g; img.tri(cx - 7 + lean, top, cx + 7 + lean, top, cx + 12 + lean, 42, '#fffaf0'); img.tri(cx - 7 + lean, top, cx - 12 + lean, 42, cx + 12 + lean, 42, '#fffaf0');
      img.rect(cx - 7 + lean, top, 15, 14, '#fffaf0'); img.rect(cx - 7 + lean, top, 2, 14, '#ffd86b'); img.rect(cx + 7 + lean, top, 2, 14, '#ffd86b'); img.rect(cx - 7 + lean, top + 9, 15, 2, '#ffd86b'); img.ellipse(cx + lean, top + 5, 3, 2, '#fff5d6'); for (let i = 0; i < 5; i++) img.px(cx - 8 + i * 4 + lean, 41 - (i % 2), '#ffd86b');
      img.px(cx + lean, top + 5, '#c9b6ff');
    },
    head(img, g) {
      const { hx, hy, pose } = g; img.ellipse(hx, hy, 8, 8, '#fffaf0'); img.ellipse(hx + 2, hy + 1, 5, 5, '#fff5d6');
      img.ring(hx, hy - 12, 6, 2, '#ffd86b');
      img.px(hx + 4, hy - 4, '#ffd86b'); img.px(hx + 4, hy - 5, '#c9b6ff');
      img.line(hx + 1, hy, hx + 3, hy, '#7a6a3a'); img.line(hx + 5, hy, hx + 7, hy, '#7a6a3a');
      if (pose.mouth) img.rect(hx + 3, hy + 3, 2, 1, '#b07a5a'); else img.px(hx + 4, hy + 3, '#b07a5a');
    },
  },
  ocaml: {
    skin: '#c58a3a', arm: '#c58a3a', hand: '#e9b96e', leg: '#9a6a28', foot: '#5a3c14', outline: '#2a1a06',
    back(img, g) { const { cx, lean, top } = g; img.ellipse(cx - 4 + lean, top - 1, 6, 5, '#c58a3a'); },
    torso(img, g) { const { cx, lean, top } = g; img.rect(cx - 6 + lean, top, 13, 14, '#c58a3a'); img.rect(cx - 6 + lean, top + 1, 13, 3, '#ec6a13'); img.rect(cx - 6 + lean, top + 10, 13, 4, '#e9b96e'); },
    head(img, g) {
      const { hx, hy, pose } = g; img.rect(hx - 5, hy - 5, 11, 11, '#c58a3a'); img.rect(hx + 3, hy - 1, 8, 6, '#e9b96e'); img.rect(hx - 4, hy - 8, 3, 3, '#c58a3a');
      img.rect(hx + 1, hy - 2, 3, 3, '#fff'); img.px(hx + 3, hy - 1, '#111'); img.px(hx + 10, hy + 1, '#2a1a06');
      if (pose.mouth) img.rect(hx + 5, hy + 4, 5, 1, '#2a1a06');
      if (pose.angry) img.line(hx, hy - 4, hx + 4, hy - 3, '#2a1a06');
    },
  },
};

// ---------- compose frames ----------
// Snake body: coiled base on the ground, curved neck, head that lunges forward when attacking.
function drawSnake(def, pose) {
  const img = new Img(FW, FH);
  const BLUE = '#3776ab', DARK = '#2a5a87', YEL = '#ffd43b';
  const lean = pose.lean, dy = pose.dy, t = pose._t ?? 0;
  const sway = Math.round(Math.sin(t * 1.2) * (pose._walk ? 2 : 0.6));
  const cx = 22 + sway;
  // coil: three stacked rings, wider at the bottom
  const rings = [[40, 13, 4.2], [35.5, 11, 3.8], [31.5, 8.5, 3.4]];
  rings.forEach(([y, rx, ry], i) => {
    const ox = i === 1 ? -1 : i === 2 ? 1 : 0;
    img.ellipse(cx + ox, y + (i === 2 ? dy : 0), rx, ry, i % 2 ? DARK : BLUE);
    img.ellipse(cx + ox + 1, y + 1.5 + (i === 2 ? dy : 0), rx - 3, Math.max(1.5, ry - 2), YEL);
    img.ellipse(cx + ox - 1, y - 1 + (i === 2 ? dy : 0), rx - 4, Math.max(1, ry - 3), i % 2 ? BLUE : DARK);
  });
  img.ellipse(cx - 12, 41, 3, 2, DARK); img.ellipse(cx - 15, 41, 2, 1.5, YEL); // tail tip curling out of the coil
  // neck: quadratic curve from the coil up to the head
  const reach = (pose.aF[0] - 8) * 0.9, rise = (pose.aF[1] - 1) * 0.7;
  const hx = Math.min(37, Math.round(cx + 4 + lean * 1.6 + reach)), hy = Math.round(15 + dy * 0.5 + rise);
  const p0 = [cx, 30 + dy], p1 = [cx - 8 + lean, 22], p2 = [hx - 3, hy + 6];
  for (let k = 0; k <= 20; k++) {
    const u = k / 20, x = (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], y = (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1];
    const r = 3.6 - u * 0.6;
    img.ellipse(x, y, r, r, k % 4 < 2 ? BLUE : DARK);
    img.ellipse(x + 1.6, y + 0.5, 1.2, 1.2, YEL);
  }
  const g = { hx, hy, pose };
  def.head(img, g);
  if (def.glow) img.glow(def.glow, 2);
  img.outline(def.outline);
  if (pose._rot) return img.rotated(-pose._rot);
  return img;
}

function drawFrame(def, pose) {
  if (def.snake) return drawSnake(def, pose);
  const img = new Img(FW, FH);
  const cx = 24, lean = Math.round(pose.lean), dy = pose.dy;
  const legLen = def.float ? 0 : 11;
  const hipY = BASE - legLen + dy + (def.float ? -6 : 0);
  const top = hipY - 14;
  const g = { cx, lean, hipY, top, hx: cx + lean + 1, hy: top - 5 + (def.float ? 0 : 0), pose };
  const armCol = def.arm, shoulderY = top + 3;
  const sF = [cx + 4 + lean, shoulderY], sB = [cx - 3 + lean, shoulderY];
  def.back?.(img, g);
  const arm = (s, d, col) => {
    img.line(s[0], s[1], s[0] + d[0], s[1] + d[1], col, 3);
    skinHand(img, s[0] + d[0], s[1] + d[1], def.hand, def.claw);
  };
  const leg = (hx0, f, col, foot) => {
    const fx = cx + hx0 + f[0], fy = BASE - f[1] - (def.float ? 3 : 0);
    if (def.float) return;
    img.line(cx + hx0, hipY, fx, fy - 1, col, 3);
    img.rect(fx - 1, fy - 1, 6, 2, foot);
  };
  arm(sB, pose.aB, shade(armCol, 0.8));
  leg(-3, pose.fB, shade(def.leg, 0.85), shade(def.foot, 0.85));
  def.torso(img, g);
  leg(3, pose.fF, def.leg, def.foot);
  def.head(img, g);
  arm(sF, pose.aF, armCol);
  if (def.float) img.ellipse(cx - 2, 43, 8, 1, '#ffd86b60');
  if (def.glow) img.glow(def.glow, 2);
  img.outline(def.outline);
  if (pose._rot) return img.rotated(-pose._rot);
  return img;
}

// ---------- PNG encoder ----------
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(img) {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) { raw[y * (img.w * 4 + 1)] = 0; Buffer.from(img.d.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- build sheets ----------
const meta = { frame: [FW, FH], base: BASE, cols: COLS, anims: {}, chars: [] };
let row = 0;
for (const [name, n, fps] of ANIMS) { meta.anims[name] = { row: row++, frames: n, fps }; }

const preview = new Img(FW * Object.keys(CHARS).length, FH);
let pi = 0;
for (const [id, def] of Object.entries(CHARS)) {
  const sheet = new Img(FW * COLS, FH * ANIMS.length);
  ANIMS.forEach(([name, n, , fn], r) => {
    for (let i = 0; i < n; i++) sheet.blit(drawFrame(def, { ...fn(i), _t: i, _walk: name === 'walk' }), i * FW, r * FH);
  });
  fs.writeFileSync(path.join(OUT, `${id}.png`), png(sheet));
  preview.blit(drawFrame(def, ANIMS[0][3](0)), pi++ * FW, 0);
  meta.chars.push(id);
}
fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify(meta, null, 2));

// upscaled contact sheet for eyeballing (not used by the game)
const S = 6; const big = new Img(preview.w * S, preview.h * S);
for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const i = ((y / S | 0) * preview.w + (x / S | 0)) * 4; if (preview.d[i + 3]) big.px(x, y, [preview.d[i], preview.d[i + 1], preview.d[i + 2], preview.d[i + 3]]); else big.px(x, y, '#2a2d3a'); }
fs.writeFileSync(path.join(process.env.SPRITE_PREVIEW_DIR ?? OUT, '_preview.png'), png(big));
console.log('wrote', Object.keys(CHARS).length, 'sprite sheets to', OUT);
