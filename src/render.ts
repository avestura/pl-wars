import { H, ROUNDS_TO_WIN, SPRITE_SCALE, W } from './config';
import { drawBackground, drawHazards, drawPlatforms } from './backgrounds';
import { CHARACTERS } from './game/characters';
import { ACTIONS, type Action, type HelperId } from './game/types';
import { Fighter, type Assist, type Bubble, type Match, type Projectile, type Zone } from './game/match';
import { keyLabel, type Binds } from './save';

export const MONO = '"Courier New", Consolas, monospace';

// ------------------------------------------------------------------ assets
interface SheetMeta { frame: [number, number]; base: number; cols: number; anims: Record<string, { row: number; frames: number; fps: number }>; chars: string[] }
export class Assets {
  meta!: SheetMeta;
  sheets = new Map<string, HTMLImageElement>();
  async load() {
    this.meta = await (await fetch('sprites/sprites.json')).json();
    await Promise.all(this.meta.chars.map((id) => new Promise<void>((res, rej) => {
      const img = new Image(); img.onload = () => res(); img.onerror = () => rej(new Error('sprite ' + id));
      img.src = `sprites/${id}.png`; this.sheets.set(id, img);
    })));
  }
  private sil = new Map<string, HTMLCanvasElement>();
  /** dark silhouette of a character's idle pose (for locked slots) */
  silhouette(id: string): HTMLCanvasElement {
    let c = this.sil.get(id);
    if (c) return c;
    c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const g = c.getContext('2d')!; const img = this.sheets.get(id);
    if (img) {
      g.drawImage(img, 0, 0, 48, 48, 0, 0, 48, 48);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#0b0c18'; g.fillRect(0, 0, 48, 48);
    }
    this.sil.set(id, c); return c;
  }
  /** draw a frame with the feet at (x,y). facing -1 mirrors. */
  sprite(g: CanvasRenderingContext2D, id: HelperId, anim: string, frame: number, x: number, y: number, facing: 1 | -1 = 1, scale = SPRITE_SCALE, alpha = 1) {
    const img = this.sheets.get(id), a = this.meta.anims[anim];
    if (!img || !a) return;
    const [fw, fh] = this.meta.frame;
    g.save();
    g.globalAlpha *= alpha;
    g.translate(x, y); g.scale(facing * scale, scale);
    g.drawImage(img, (frame % a.frames) * fw, a.row * fh, fw, fh, -fw / 2, -this.meta.base, fw, fh);
    g.restore();
  }
}

// ------------------------------------------------------------------ small ui helpers
export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size = 16, color = '#fff', align: CanvasTextAlign = 'left', bold = true, maxW?: number) {
  g.font = `${bold ? 'bold ' : ''}${size}px ${MONO}`; g.textAlign = align; g.fillStyle = color; g.textBaseline = 'alphabetic';
  if (maxW) g.fillText(s, x, y, maxW); else g.fillText(s, x, y);
}
export function shadowText(g: CanvasRenderingContext2D, s: string, x: number, y: number, size = 16, color = '#fff', align: CanvasTextAlign = 'left', shadow = '#000') {
  text(g, s, x + 2, y + 2, size, shadow, align); text(g, s, x, y, size, color, align);
}
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function wrap(g: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const words = s.split(' '), lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}

/** speech bubble with its tail pointing down at (x, y) */
export function drawBubble(g: CanvasRenderingContext2D, b: Bubble, x: number, y: number, accent: string, chars = Infinity) {
  g.save();
  g.font = `bold 13px ${MONO}`;
  const full = wrap(g, b.text, 230);
  const shown = b.text.slice(0, Math.max(0, Math.floor(chars)));
  const lines = wrapPartial(g, full, shown);
  const w = Math.max(...full.map((l) => g.measureText(l).width)) + 20, h = full.length * 16 + 14;
  let bx = x - w / 2; bx = Math.max(8, Math.min(W - w - 8, bx));
  const by = y - h - 14;
  g.globalAlpha = Math.min(1, (b.life - b.t) / 14);
  g.fillStyle = '#fff'; g.strokeStyle = accent; g.lineWidth = 3;
  rrect(g, bx, by, w, h, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 7, by + h - 1); g.lineTo(x, by + h + 12); g.lineTo(x + 7, by + h - 1); g.closePath(); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.moveTo(x - 7, by + h); g.lineTo(x, by + h + 12); g.lineTo(x + 7, by + h); g.strokeStyle = accent; g.stroke();
  g.fillStyle = '#fff'; g.fillRect(x - 6, by + h - 3, 12, 4);
  g.fillStyle = '#111'; g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, bx + 10, by + 20 + i * 16));
  g.restore();
}
function wrapPartial(g: CanvasRenderingContext2D, fullLines: string[], shown: string): string[] {
  const out: string[] = []; let left = shown.length;
  for (const l of fullLines) { if (left <= 0) break; out.push(l.slice(0, left)); left -= l.length + 1; }
  return out;
}

// ------------------------------------------------------------------ match rendering
export interface HudOpts {
  frame: number;
  keys: [Binds | null, Binds | null];
  names: [string, string];
  /** show a human readable control hint under each fighter's ability icons */
  chargeLabel?: boolean;
}

export function renderMatch(g: CanvasRenderingContext2D, m: Match, assets: Assets, hud: HudOpts, shake: boolean) {
  g.save();
  g.imageSmoothingEnabled = false;
  if (shake && m.shake > 0.5) g.translate((Math.random() - 0.5) * m.shake, (Math.random() - 0.5) * m.shake);
  drawBackground(g, m.stage.def.id, m.t);
  drawHazards(g, m.stage, m.t);
  drawPlatforms(g, m.stage, m.t);
  for (const z of m.zones) drawZone(g, z);
  // shadows
  for (const f of m.fighters) shadow(g, f);
  for (const a of m.assists) drawAssist(g, a, assets);
  // draw the fighter being hit/ko'd first so the active one stays on top
  const order = [...m.fighters].sort((a, b) => (a.state === 'ko' ? -1 : 0) - (b.state === 'ko' ? -1 : 0));
  for (const f of order) drawFighter(g, f, assets, hud.frame);
  for (const p of m.projectiles) drawProjectile(g, p);
  drawFx(g, m);
  for (const f of m.fighters) drawOverhead(g, f);
  for (const a of m.assists) if (a.bubble) drawBubble(g, a.bubble, a.x, a.y - 150, '#888', a.bubble.t * 1.6);
  g.restore();
  drawHud(g, m, assets, hud);
  drawBanner(g, m);
}

function shadow(g: CanvasRenderingContext2D, f: Fighter) {
  if (f.state === 'ko' && !f.grounded) return;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(f.x, f.standing ? f.y : f.y + 2, 26, 6, 0, 0, 7); g.fill();
}

function drawFighter(g: CanvasRenderingContext2D, f: Fighter, assets: Assets, frame: number) {
  const [anim, idx] = f.anim();
  g.save();
  // status auras
  if (f.st.rage > 0) { g.fillStyle = `rgba(255,60,30,${0.18 + 0.1 * Math.sin(frame * 0.3)})`; g.beginPath(); g.ellipse(f.x, f.cy, 42, 62, 0, 0, 7); g.fill(); }
  if (f.st.speed > 0) { g.fillStyle = 'rgba(255,215,0,.18)'; g.beginPath(); g.ellipse(f.x, f.cy, 40, 60, 0, 0, 7); g.fill(); }
  if (f.id === 'nirvana') { g.fillStyle = `rgba(255,236,160,${0.12 + 0.05 * Math.sin(frame * 0.1)})`; g.beginPath(); g.ellipse(f.x, f.cy, 52, 72, 0, 0, 7); g.fill(); }
  let alpha = 1;
  if (f.invulnT > 0 || f.st.invuln > 0) alpha = 0.45 + 0.25 * Math.sin(frame * 1.2);
  if (f.flash > 0 && f.flash % 2 === 0) alpha = 0.55;
  assets.sprite(g, f.id, anim, idx, f.x, f.y, f.facing, SPRITE_SCALE, alpha);
  if (f.flash > 2) { g.globalCompositeOperation = 'lighter'; assets.sprite(g, f.id, anim, idx, f.x, f.y, f.facing, SPRITE_SCALE, 0.5); g.globalCompositeOperation = 'source-over'; }
  // shields / counters
  const ring = (col: string, r: number, lw = 3) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(f.x, f.cy, r, 0, 7); g.stroke(); };
  if (f.st.shield > 0) { g.fillStyle = 'rgba(127,227,245,.18)'; g.beginPath(); g.arc(f.x, f.cy, 82, 0, 7); g.fill(); ring('#7fe3f5', 82); ring('rgba(255,255,255,.6)', 78, 1); }
  if (f.st.reflect > 0) { ring('#6aa5e8', 74 + Math.sin(frame * 0.3) * 2); g.fillStyle = 'rgba(106,165,232,.15)'; g.beginPath(); g.arc(f.x, f.cy, 74, 0, 7); g.fill(); }
  if (f.st.counter > 0) ring('#30b9db', 58, 2);
  if (f.st.armor > 0) ring('#ffb089', 60, 4);
  // python charge: the `pass` keyword
  if (f.cast?.charging) {
    const p = f.cast.chargeT / (f.def.abilities[f.cast.slot].charge ?? 1);
    text(g, 'pass', f.x, f.y - 128 - p * 6, 18 + p * 8, '#ffd43b', 'center');
    g.fillStyle = '#222'; g.fillRect(f.x - 30, f.y - 118, 60, 6); g.fillStyle = p >= 1 ? '#ff6b3b' : '#ffd43b'; g.fillRect(f.x - 30, f.y - 118, 60 * Math.min(1, p), 6);
  }
  g.restore();
}

function drawOverhead(g: CanvasRenderingContext2D, f: Fighter) {
  // status glyphs
  const icons: [string, string][] = [];
  if (f.st.confuse > 0) icons.push(['?!', '#f7df1e']);
  if (f.st.root > 0) icons.push(['GIL', '#ffd43b']);
  if (f.st.silence > 0) icons.push(['ERR', '#e23d3d']);
  if (f.st.rage > 0) icons.push(['unsafe', '#ff5533']);
  icons.forEach(([s, c], i) => text(g, s, f.x - (icons.length - 1) * 16 + i * 32, f.y - 112, 11, c, 'center'));
  if (f.bubble) drawBubble(g, f.bubble, f.x, f.y - 134 - (f.cast?.charging ? 24 : 0), f.def.color, f.bubble.t * 1.6);
  if (f.combo >= 2) text(g, `${f.combo} HITS`, f.x, f.y - 160, 18, '#ffe27a', 'center');
}

function drawAssist(g: CanvasRenderingContext2D, a: Assist, assets: Assets) {
  const anim = a.atkT >= 0 ? 'heavy' : 'walk';
  const frame = a.atkT >= 0 ? Math.min(4, Math.floor(a.atkT / 6)) : Math.floor(a.t / 4) % 6;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(a.x, a.y + 2, 24, 5, 0, 0, 7); g.fill();
  const fade = a.t < 8 ? a.t / 8 : 1;
  assets.sprite(g, a.helper, anim, frame, a.x, a.y, a.facing, 2.7, fade);
}

function drawProjectile(g: CanvasRenderingContext2D, p: Projectile) {
  if (p.shape === 'none') {
    if (p.age < 6) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h); }
    return;
  }
  g.save(); g.translate(p.x, p.y);
  const dir = p.vx >= 0 ? 1 : -1;
  if (p.shape === 'orb') {
    g.fillStyle = p.color; g.globalAlpha = 0.25; g.beginPath(); g.arc(0, 0, p.w * 0.85, 0, 7); g.fill(); g.globalAlpha = 1;
    g.beginPath(); g.arc(0, 0, p.w / 2, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.rotate(p.rot); text(g, p.label, 0, 8, 24, p.fg, 'center');
  } else if (p.shape === 'wave') {
    const grd = g.createLinearGradient(-p.w / 2 * dir, 0, p.w / 2 * dir, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, p.color);
    g.fillStyle = grd; rrect(g, -p.w / 2, -p.h / 2, p.w, p.h, 14); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    text(g, p.label.slice(0, 14), dir * 12, 5, 14, '#111', 'center', true, p.w - 20);
  } else {
    // trail
    g.fillStyle = p.color; g.globalAlpha = 0.25; g.fillRect(-dir * p.w * 0.9 - p.w / 2 * (dir > 0 ? 0 : -1) * 0, -p.h / 2 + 3, p.w * 0.8 * -dir, p.h - 6); g.globalAlpha = 1;
    g.rotate(p.spin ? p.rot : 0);
    g.fillStyle = p.color; rrect(g, -p.w / 2, -p.h / 2, p.w, p.h, 6); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke();
    text(g, p.label, 0, 5, 13, p.fg, 'center', true, p.w - 6);
  }
  g.restore();
}

function drawZone(g: CanvasRenderingContext2D, z: Zone) {
  const o = z.o, r = z.rect;
  g.save();
  if (o.mode === 'burst') {
    if (z.t < o.delay) {
      const p = z.t / o.delay;
      g.globalAlpha = 0.15 + 0.25 * Math.abs(Math.sin(p * 14)); g.fillStyle = o.color; g.fillRect(r.x, r.y, r.w, r.h);
      g.globalAlpha = 0.9; g.strokeStyle = o.color; g.lineWidth = 2; g.setLineDash([6, 5]); g.strokeRect(r.x, r.y, r.w, r.h); g.setLineDash([]);
      text(g, o.label, o.x, Math.max(30, r.y - 6), 13, o.color, 'center');
      g.fillStyle = o.color; g.globalAlpha = 0.9; g.fillRect(r.x, r.y + r.h - 5, r.w * p, 5);
    } else { g.globalAlpha = Math.max(0, 1 - (z.t - o.delay) / 14); g.fillStyle = '#fff'; g.fillRect(r.x, r.y, r.w, r.h); }
  } else if (z.t >= o.delay) {
    g.globalAlpha = 0.55; g.fillStyle = o.color; g.beginPath(); g.ellipse(o.x, o.y - 6, o.w / 2, 14, 0, 0, 7); g.fill();
    g.globalAlpha = 1; text(g, o.label, o.x, o.y - 12, 11, '#fff', 'center');
  }
  g.restore();
}

function drawFx(g: CanvasRenderingContext2D, m: Match) {
  for (const p of m.fx.particles) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.color; g.fillRect(p.x, p.y, p.size, p.size); }
  g.globalAlpha = 1;
  for (const r of m.fx.rings) { g.globalAlpha = r.life / 18; g.strokeStyle = r.color; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, r.r, 0, 7); g.stroke(); }
  g.globalAlpha = 1;
  for (const t of m.fx.texts) { g.globalAlpha = Math.min(1, t.life / 15); shadowText(g, t.text, t.x, t.y, t.size, t.color, 'center'); }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ HUD
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string, ghost: number, flip: boolean) {
  g.fillStyle = '#000a'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = '#2a2a33'; g.fillRect(x, y, w, h);
  const fx = (f: number) => (flip ? x + w - w * f : x);
  g.fillStyle = '#ffd0d0'; g.fillRect(fx(ghost), y, w * ghost, h);
  g.fillStyle = color; g.fillRect(fx(frac), y, w * frac, h);
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(fx(frac), y, w * frac, 4);
}
const ghosts = [1, 1];

function drawHud(g: CanvasRenderingContext2D, m: Match, assets: Assets, hud: HudOpts) {
  const BW = 370;
  const top = g.createLinearGradient(0, 0, 0, 100); top.addColorStop(0, 'rgba(0,0,0,.75)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 100);
  const bot = g.createLinearGradient(0, H - 110, 0, H); bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,.7)');
  g.fillStyle = bot; g.fillRect(0, H - 110, W, 110);
  m.fighters.forEach((f, i) => {
    const flip = i === 1, x = flip ? W - 30 - BW : 30;
    const frac = Math.max(0, f.hp / f.maxHp);
    ghosts[i] = Math.max(frac, ghosts[i] - 0.004); if (m.phase === 'ready') ghosts[i] = frac;
    const col = frac > 0.5 ? '#4cd964' : frac > 0.25 ? '#ffcc00' : '#ff453a';
    bar(g, x, 28, BW, 22, frac, col, ghosts[i], flip);
    text(g, hud.names[i], flip ? x + BW : x, 20, 15, f.def.color === '#a8b9cc' ? '#d3dde8' : f.def.color, flip ? 'right' : 'left');
    text(g, `${Math.ceil(Math.max(0, f.hp))}`, flip ? x + 6 : x + BW - 6, 45, 13, '#fff', flip ? 'left' : 'right');
    // meter
    g.fillStyle = '#000a'; g.fillRect(x - 2, 56, BW * 0.55 + 4, 11); g.fillStyle = '#2a2a33'; g.fillRect(x, 58, BW * 0.55, 7);
    const mx = flip ? x + BW - BW * 0.55 * (f.meter / 100) : x;
    g.fillStyle = f.meter >= 50 ? '#ffd86b' : '#b8902a'; g.fillRect(flip ? mx : x, 58, BW * 0.55 * (f.meter / 100), 7);
    const mlx = flip ? x + BW - BW * 0.55 : x;
    g.fillStyle = '#fff6'; g.fillRect(mlx + BW * 0.55 * 0.5, 58, 1, 7);
    // round pips
    if (!m.training) for (let r = 0; r < ROUNDS_TO_WIN; r++) {
      const px = flip ? x + BW - 10 - r * 20 : x + 10 + r * 20;
      g.fillStyle = r < m.wins[i] ? '#ffd86b' : '#333'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px, 80, 7, 0, 7); g.fill(); g.stroke();
    }
    // abilities
    const bx = flip ? W - 30 - 3 * 58 : 30, by = H - 82;
    f.def.abilities.forEach((ab, s) => {
      const ax = bx + s * 58, cdFrac = f.cd[s] / ab.cd, usable = f.canCast(s);
      g.fillStyle = '#000b'; g.fillRect(ax, by, 52, 52);
      g.strokeStyle = usable ? f.def.color : '#555'; g.lineWidth = 3; g.strokeRect(ax + 1.5, by + 1.5, 49, 49);
      text(g, abbr(ab.name), ax + 26, by + 31, 13, usable ? '#fff' : '#777', 'center', true, 46);
      if (cdFrac > 0) { g.fillStyle = '#000a'; g.fillRect(ax + 2, by + 2 + 48 * (1 - cdFrac), 48, 48 * cdFrac); }
      if (ab.cost > 0) { g.fillStyle = f.meter >= ab.cost ? '#ffd86b' : '#a55'; g.fillRect(ax + 2, by + 46, 48, 4); text(g, '★' + ab.cost, ax + 26, by + 14, 10, f.meter >= ab.cost ? '#ffd86b' : '#a77', 'center'); }
      const k = hud.keys[i]; if (k) text(g, keyLabel(k[(['s1', 's2', 's3'] as Action[])[s]][0] ?? ''), ax + 26, by + 64, 11, '#ddd', 'center');
    });
  });
  // timer
  g.fillStyle = '#000b'; rrect(g, W / 2 - 38, 14, 76, 52, 8); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  const secs = Math.max(0, Math.ceil(m.timer / 60));
  if (m.training) text(g, '∞', W / 2, 56, 40, '#7dff9b', 'center');
  else text(g, String(secs), W / 2, 54, 34, secs <= 10 ? '#ff6b6b' : '#fff', 'center');
  if (m.training) {
    const s = m.trainStats;
    g.fillStyle = '#000b'; rrect(g, W / 2 - 150, 74, 300, 40, 8); g.fill();
    text(g, 'SKILL PLAYGROUND  ·  Esc: options', W / 2, 88, 11, '#7dff9b', 'center');
    text(g, `last ${s.last.toFixed(1)}   combo ${s.total.toFixed(1)}   hits ${s.hits}`, W / 2, 106, 13, '#ffe27a', 'center');
  }
  text(g, m.stage.def.subtitle, W / 2, H - 10, 11, '#ffffff99', 'center');
  void assets;
}
const abbr = (n: string) => (n.length > 9 ? n.replace(/ .*/, '') : n);

function drawBanner(g: CanvasRenderingContext2D, m: Match) {
  let s = '', size = 64, col = '#fff';
  if (m.phase === 'ready') { s = m.banner; size = 58 + Math.max(0, 30 - m.phaseT) * 1.2; }
  else if (m.phase === 'fight' && m.phaseT < 50) { s = m.banner; col = '#ffd86b'; size = 80; }
  else if (m.phase === 'ko' || m.phase === 'roundEnd') { s = m.banner; col = '#ff6b6b'; size = 70 + Math.min(30, m.phaseT); if (m.phase === 'roundEnd') { col = '#ffd86b'; size = 44; } }
  if (!s) return;
  g.save(); g.globalAlpha = m.phase === 'fight' ? Math.max(0, 1 - m.phaseT / 50) : 1;
  shadowText(g, s, W / 2, H / 2 - 20, size, col, 'center'); g.restore();
}

export { ACTIONS };
