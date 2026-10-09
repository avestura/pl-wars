import { H, W } from './config';
import { App, type Mode, type Screen, type Session } from './app';
import type { MenuPress } from './input';
import { CHARACTERS, HELPER_NAMES, ROSTER_IDS } from './game/characters';
import { pickLine, type Line } from './game/dialogs';
import { Match, type Bubble } from './game/match';
import { AIController, skillFor } from './game/ai';
import { DUMMY_MODES, DummyController } from './game/dummy';
import { NORMAL_STAGES, STAGES, type StageId } from './game/stages';
import { ACTIONS, type Action, type CharId, type Difficulty } from './game/types';
import { DEFAULT_BINDS, getSave, isUnlocked, keyLabel, ladderFor, resetBinds, resetProgress, settings, unlock } from './save';
import { MONO, drawBubble, renderMatch, rrect, shadowText, text, wrap } from './render';

// ================================================================== shared UI bits
export function menuBg(g: CanvasRenderingContext2D, t: number, tint = '#1b1f3b') {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b0d1c'); gr.addColorStop(1, tint);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.font = `16px ${MONO}`; g.textAlign = 'left';
  const gl = ['λ', '#', '{}', '=>', '::', 'fn', 'int', 'let', '</>', '0x', '&mut', '|>', 'go', 'def', 'pub', 'async'];
  for (let i = 0; i < 28; i++) {
    const x = (i * 97) % W, y = ((i * 61 + t * (0.25 + (i % 5) * 0.12)) % (H + 40)) - 20;
    g.fillStyle = '#7b8cff'; g.globalAlpha = 0.07 + (i % 4) * 0.025; g.fillText(gl[i % gl.length], x, y);
  }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 640); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

export interface MenuItem { label: string | (() => string); action?: () => void; adjust?: (d: -1 | 1) => void; disabled?: boolean }
export class ListMenu {
  i = 0;
  constructor(public items: MenuItem[], public x: number, public y: number, public w = 440, public rowH = 46, public size = 22, public align: 'center' | 'left' = 'center') {}
  private lab(it: MenuItem) { return typeof it.label === 'function' ? it.label() : it.label; }
  private move(app: App, d: number) {
    const n = this.items.length; let k = this.i;
    for (let c = 0; c < n; c++) { k = (k + d + n) % n; if (!this.items[k].disabled) break; }
    if (k !== this.i) { this.i = k; app.sfx('menu'); }
  }
  update(app: App, m: MenuPress) {
    if (m.up) this.move(app, -1);
    if (m.down) this.move(app, 1);
    const it = this.items[this.i];
    if (m.left && it.adjust) { it.adjust(-1); app.sfx('menu'); }
    if (m.right && it.adjust) { it.adjust(1); app.sfx('menu'); }
    if (m.confirm && it.action && !it.disabled) { app.sfx('select'); it.action(); }
  }
  private rowAt(x: number, y: number): number {
    const lx = this.align === 'center' ? this.x - this.w / 2 : this.x;
    if (x < lx || x > lx + this.w) return -1;
    const k = Math.floor((y - (this.y - this.rowH * 0.7)) / this.rowH);
    return k >= 0 && k < this.items.length ? k : -1;
  }
  pointer(app: App, x: number, y: number, down: boolean) {
    const k = this.rowAt(x, y);
    if (k < 0 || this.items[k].disabled) return;
    if (k !== this.i) { this.i = k; app.sfx('menu'); }
    if (down) {
      const it = this.items[k];
      if (it.adjust && !it.action) { const mid = this.align === 'center' ? this.x : this.x + this.w / 2; it.adjust(x < mid ? -1 : 1); app.sfx('menu'); }
      else if (it.action) { app.sfx('select'); it.action(); }
    }
  }
  draw(g: CanvasRenderingContext2D, t: number) {
    this.items.forEach((it, k) => {
      const y = this.y + k * this.rowH, sel = k === this.i;
      const lx = this.align === 'center' ? this.x - this.w / 2 : this.x;
      if (sel) { g.fillStyle = 'rgba(123,140,255,.22)'; rrect(g, lx, y - this.rowH * 0.7, this.w, this.rowH - 4, 8); g.fill(); g.strokeStyle = '#7b8cff'; g.lineWidth = 2; g.stroke(); }
      const col = it.disabled ? '#556' : sel ? '#fff' : '#b9bfe8';
      const label = (sel && it.adjust ? '◀ ' : '') + this.lab(it) + (sel && it.adjust ? ' ▶' : '');
      if (this.align === 'center') text(g, label, this.x, y + this.size * 0.3, this.size, col, 'center');
      else text(g, label, lx + 16, y + this.size * 0.3, this.size, col, 'left');
      if (sel) text(g, '▸', lx + 10 + Math.sin(t * 0.15) * 3, y + this.size * 0.3, this.size, '#ffd86b', 'left');
    });
  }
}

function title(g: CanvasRenderingContext2D, s: string, sub?: string) {
  shadowText(g, s, W / 2, 62, 34, '#fff', 'center', '#3a3f8f');
  if (sub) text(g, sub, W / 2, 90, 15, '#9aa3ff', 'center');
}

const MODE_NAME: Record<Mode, string> = { arcade: 'ARCADE LADDER', vsai: 'VERSUS — VS AI', vs2p: 'VERSUS — 2 PLAYERS', training: 'SKILL PLAYGROUND' };

// ================================================================== title
const SOURCE_URL = 'https://github.com/avestura/pl-wars/';
export class TitleScreen implements Screen {
  music = 'menu';
  menu!: ListMenu;
  enter(app: App) {
    const go = (mode: Mode) => () => {
      app.session.mode = mode;
      if (mode === 'vs2p' || mode === 'training') app.go(new SelectScreen(0)); else app.go(new DifficultyScreen());
    };
    this.menu = new ListMenu([
      { label: 'Arcade Ladder', action: go('arcade') },
      { label: 'Versus: Player vs AI', action: go('vsai') },
      { label: 'Versus: Player vs Player', action: go('vs2p') },
      { label: 'Skill Playground (test abilities)', action: go('training') },
      { label: 'Settings & Controls', action: () => app.go(new SettingsScreen()) },
      { label: 'Source code on GitHub ↗', action: () => { window.open(SOURCE_URL, '_blank', 'noopener,noreferrer'); } },
    ], W / 2, 296, 480, 38, 19);
  }
  update(app: App, m: MenuPress) { this.menu.update(app, m); }
  pointer(app: App, x: number, y: number, d: boolean) { this.menu.pointer(app, x, y, d); }
  draw(g: CanvasRenderingContext2D, app: App) {
    const t = app.frame;
    menuBg(g, t);
    // logo
    g.save(); g.translate(W / 2, 120 + Math.sin(t * 0.03) * 3);
    const gr = g.createLinearGradient(-300, 0, 300, 0); gr.addColorStop(0, '#7b8cff'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#ffd86b');
    g.font = `bold 60px ${MONO}`; g.textAlign = 'center'; g.fillStyle = '#1c2060'; g.fillText('PROGRAMMING', 4, 4); g.fillStyle = gr; g.fillText('PROGRAMMING', 0, 0);
    g.font = `bold 78px ${MONO}`; g.fillStyle = '#5a1c1c'; g.fillText('LANGUAGE WARS', 4, 82); g.fillStyle = gr; g.fillText('LANGUAGE WARS', 0, 78);
    g.restore();
    text(g, 'where compilers brawl', W / 2, 232, 16, '#9aa3ff', 'center');
    // parade of unlocked fighters
    const un = ROSTER_IDS.filter(isUnlocked);
    un.forEach((id, i) => {
      const x = ((t * (0.8 + (i % 3) * 0.25) + i * 160) % (W + 200)) - 100;
      app.assets.sprite(g, id, 'walk', Math.floor(t / 6 + i) % 6, x, H - 14, 1, 2.2, 0.4);
    });
    // soft panel so the menu stays readable over the fighters
    g.fillStyle = 'rgba(8,10,28,.88)'; rrect(g, W / 2 - 250, 262, 500, 250, 14); g.fill();
    this.menu.draw(g, t);
    const touch = matchMedia('(pointer: coarse)').matches;
    text(g, touch ? 'tap to select' : '↑↓ move   Enter / Space / J confirm   Esc back', W / 2, H - 6, 12, '#7782c9', 'center');
  }
}

// ================================================================== difficulty
export class DifficultyScreen implements Screen {
  music = 'menu';
  menu!: ListMenu;
  enter(app: App) {
    const opts: [Difficulty, string][] = [['easy', 'Easy — gentle linting'], ['normal', 'Normal — passes code review'], ['hard', 'Hard — production incident']];
    const pick = (d: Difficulty) => () => {
      settings.difficulty = d; app.saveSettings(); app.session.difficulty = d;
      app.go(new SelectScreen(0));
    };
    this.menu = new ListMenu(opts.map(([d, label]) => ({ label, action: pick(d) })), W / 2, 220, 520, 56, 22);
    this.menu.i = opts.findIndex(([d]) => d === settings.difficulty);
  }
  update(app: App, m: MenuPress) { this.menu.update(app, m); if (m.back) { app.sfx('back'); app.go(new TitleScreen()); } }
  pointer(app: App, x: number, y: number, d: boolean) { this.menu.pointer(app, x, y, d); }
  draw(g: CanvasRenderingContext2D, app: App) {
    menuBg(g, app.frame); title(g, MODE_NAME[app.session.mode], 'Choose AI difficulty');
    this.menu.draw(g, app.frame);
    text(g, app.session.mode === 'arcade' ? 'AI also gets tougher as you climb the ladder.' : '', W / 2, 440, 14, '#9aa3ff', 'center');
    text(g, 'Esc: back', W / 2, H - 14, 12, '#7782c9', 'center');
  }
}

// ================================================================== character select
export class SelectScreen implements Screen {
  music = 'menu';
  cur = 0;
  constructor(private which: 0 | 1) {}
  private cols = 4;
  enter(app: App) {
    const prev = this.which === 0 ? app.session.p1 : app.session.p2;
    this.cur = Math.max(0, ROSTER_IDS.indexOf(prev));
  }
  private cell(i: number) { const c = i % this.cols, r = Math.floor(i / this.cols); return { x: 36 + c * 108, y: 118 + r * 128, w: 98, h: 118 }; }
  private choose(app: App) {
    const id = ROSTER_IDS[this.cur];
    if (!isUnlocked(id)) { app.sfx('back'); return; }
    app.sfx('select');
    const s = app.session;
    if (this.which === 0) {
      s.p1 = id;
      if (s.mode === 'arcade') {
        s.ladder = ladderFor(id); s.ladderIdx = 0; s.p2 = s.ladder[0];
        app.go(new IntroScreen());
      } else app.go(new SelectScreen(1));
    } else {
      s.p2 = id; app.go(new StageScreen());
    }
  }
  update(app: App, m: MenuPress) {
    const n = ROSTER_IDS.length;
    if (m.left) { this.cur = (this.cur + n - 1) % n; app.sfx('menu'); }
    if (m.right) { this.cur = (this.cur + 1) % n; app.sfx('menu'); }
    if (m.up && this.cur - this.cols >= 0) { this.cur -= this.cols; app.sfx('menu'); }
    if (m.down && this.cur + this.cols < n) { this.cur += this.cols; app.sfx('menu'); }
    if (m.confirm) this.choose(app);
    if (m.back) {
      app.sfx('back');
      if (this.which === 1) app.go(new SelectScreen(0));
      else app.go(app.session.mode === 'vs2p' || app.session.mode === 'training' ? new TitleScreen() : new DifficultyScreen());
    }
  }
  pointer(app: App, x: number, y: number, down: boolean) {
    ROSTER_IDS.forEach((_, i) => {
      const c = this.cell(i);
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { if (this.cur !== i) { this.cur = i; app.sfx('menu'); } if (down) this.choose(app); }
    });
  }
  draw(g: CanvasRenderingContext2D, app: App) {
    const t = app.frame, s = app.session;
    menuBg(g, t);
    const who = this.which === 0 ? (s.mode === 'vs2p' ? 'PLAYER 1' : 'YOU') : s.mode === 'vs2p' ? 'PLAYER 2' : s.mode === 'training' ? 'TARGET DUMMY' : 'OPPONENT (AI)';
    title(g, `${who}: CHOOSE YOUR LANGUAGE`, MODE_NAME[s.mode]);
    ROSTER_IDS.forEach((id, i) => {
      const c = this.cell(i), un = isUnlocked(id), sel = i === this.cur, def = CHARACTERS[id];
      g.fillStyle = sel ? 'rgba(123,140,255,.28)' : 'rgba(255,255,255,.06)'; rrect(g, c.x, c.y, c.w, c.h, 10); g.fill();
      g.strokeStyle = sel ? '#ffd86b' : un ? def.color : '#333'; g.lineWidth = sel ? 4 : 2; g.stroke();
      if (un) app.assets.sprite(g, id, 'idle', sel ? Math.floor(t / 10) % 4 : 0, c.x + c.w / 2, c.y + 84, 1, 2.1);
      else { g.imageSmoothingEnabled = false; g.drawImage(app.assets.silhouette(id), c.x + c.w / 2 - 48, c.y + 84 - 92, 96, 96); }
      text(g, un ? def.tag : '???', c.x + c.w / 2, c.y + c.h - 8, 14, un ? def.color : '#556', 'center');
    });
    this.info(g, app);
    text(g, '←↑↓→ choose   Enter confirm   Esc back', W / 2, H - 10, 12, '#7782c9', 'center');
  }
  private info(g: CanvasRenderingContext2D, app: App) {
    const id = ROSTER_IDS[this.cur], def = CHARACTERS[id], un = isUnlocked(id), t = app.frame;
    const x0 = 484;
    g.fillStyle = 'rgba(0,0,0,.4)'; rrect(g, x0 - 12, 104, W - x0 - 20, 396, 12); g.fill(); g.strokeStyle = un ? def.color : '#444'; g.lineWidth = 2; g.stroke();
    if (!un) {
      g.drawImage(app.assets.silhouette(id), x0 + 150, 160, 192, 192);
      text(g, 'LOCKED', x0 + 246, 130, 28, '#8890c0', 'center');
      text(g, 'Defeat this language in Arcade to unlock it.', x0 + 246, 400, 14, '#9aa3ff', 'center');
      text(g, `Unlock order is shuffled per save.`, x0 + 246, 420, 12, '#6a72b0', 'center');
      return;
    }
    shadowText(g, def.name, x0, 138, 30, def.color, 'left');
    g.font = `13px ${MONO}`;
    wrap(g, `"${def.tagline}"`, 300).forEach((l, i) => text(g, l, x0, 160 + i * 16, 13, '#c9cdf5', 'left', false));
    app.assets.sprite(g, id, 'idle', Math.floor(t / 10) % 4, x0 + 380, 250, 1, 4);
    // stats
    const stats: [string, number][] = [['HP', def.hp / 140], ['SPD', def.speed / 4.2], ['PWR', def.dmg / 1.25], ['WGT', def.weight / 1.25]];
    stats.forEach(([k, v], i) => {
      const y = 196 + i * 18; text(g, k, x0, y + 10, 12, '#9aa3ff', 'left');
      g.fillStyle = '#222'; g.fillRect(x0 + 40, y, 150, 10); g.fillStyle = def.color; g.fillRect(x0 + 40, y, 150 * Math.min(1, v), 10);
    });
    const binds = settings.binds[this.which === 1 && app.session.mode === 'vs2p' ? 1 : 0];
    text(g, 'ABILITIES', x0, 292, 13, '#ffd86b', 'left');
    def.abilities.forEach((a, i) => {
      const y = 314 + i * 52;
      const key = keyLabel(binds[(['s1', 's2', 's3'] as Action[])[i]][0] ?? '');
      g.fillStyle = 'rgba(255,255,255,.08)'; rrect(g, x0, y - 16, 44, 40, 6); g.fill();
      text(g, key, x0 + 22, y + 10, 13, '#fff', 'center');
      text(g, a.name + (a.cost ? `  ★${a.cost}` : '') + (a.charge ? '  (hold)' : ''), x0 + 54, y - 2, 14, def.color === '#5e5086' ? '#c7b6ff' : def.color, 'left');
      g.font = `12px ${MONO}`;
      wrap(g, a.desc, W - x0 - 90).slice(0, 2).forEach((l, k) => text(g, l, x0 + 54, y + 14 + k * 13, 12, '#c9cdf5', 'left', false));
    });
    if (def.passive) text(g, '✦ ' + def.passive, x0, 482, 12, '#ffd86b', 'left', false, W - x0 - 40);
  }
}

// ================================================================== stage select
export class StageScreen implements Screen {
  music = 'menu';
  menu!: ListMenu;
  private opts: (StageId | 'random')[] = [];
  enter(app: App) {
    this.opts = ['random', ...NORMAL_STAGES, ...(isUnlocked('nirvana') ? (['nirvana'] as StageId[]) : [])];
    this.menu = new ListMenu(this.opts.map((o) => ({
      label: o === 'random' ? 'Random' : STAGES[o].name,
      action: () => {
        app.session.stage = o;
        if (app.session.mode === 'training') {
          (app.session as Session & { resolvedStage?: StageId }).resolvedStage = o === 'random' ? NORMAL_STAGES[Math.floor(Math.random() * NORMAL_STAGES.length)] : o;
          app.go(new FightScreen());
        } else app.go(new IntroScreen());
      },
    })), W / 2, 190, 520, 50, 21);
  }
  update(app: App, m: MenuPress) { this.menu.update(app, m); if (m.back) { app.sfx('back'); app.go(new SelectScreen(1)); } }
  pointer(app: App, x: number, y: number, d: boolean) { this.menu.pointer(app, x, y, d); }
  draw(g: CanvasRenderingContext2D, app: App) {
    menuBg(g, app.frame); title(g, 'CHOOSE A STAGE', `${CHARACTERS[app.session.p1].name} vs ${CHARACTERS[app.session.p2].name}`);
    this.menu.draw(g, app.frame);
    const o = this.opts[this.menu.i];
    text(g, o === 'random' ? 'Any stage. Surprise me.' : STAGES[o].subtitle, W / 2, H - 40, 14, '#9aa3ff', 'center');
  }
}

// ================================================================== versus intro (dialog cutscene)
export class IntroScreen implements Screen {
  music = 'menu';
  private stage: StageId = 'vscode';
  private order: [0 | 1, 0 | 1] = [0, 1];
  private lines: (Line | null)[] = [null, null];
  private step = 0; private t = 0; private chars = 0; private done = false;
  private bubbles: (Bubble | null)[] = [null, null];

  enter(app: App) {
    const s = app.session;
    this.stage = s.stage === 'random' ? NORMAL_STAGES[Math.floor(Math.random() * NORMAL_STAGES.length)] : s.stage;
    if (s.p1 === 'nirvana' || s.p2 === 'nirvana') this.stage = s.mode === 'arcade' && s.p2 === 'nirvana' ? 'nirvana' : s.stage === 'random' ? 'nirvana' : this.stage;
    if (s.mode === 'arcade' && s.p2 === 'nirvana') this.stage = 'nirvana';
    // who disses first is random each match
    const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    this.order = [first, (1 - first) as 0 | 1];
    const ids = [s.p1, s.p2];
    const a = pickLine(ids[first], ids[1 - first], 'intro');
    const b = pickLine(ids[1 - first], ids[first], 'reply');
    this.lines = settings.dialogs ? [a, b] : [null, null];
    this.lines.forEach((l, i) => { if (l) this.bubbles[i] = { line: l, text: l.text, t: 0, life: 1e9 }; });
    (app.session as Session & { resolvedStage?: StageId }).resolvedStage = this.stage;
    if (!this.lines[0]) this.finish(app, true);
    else this.speak(app);
  }
  private speak(app: App) {
    const l = this.lines[this.step]; if (!l) return;
    app.voice.speak(l, this.order[this.step]);
    this.t = 0; this.chars = 0; this.done = false;
  }
  private finish(app: App, quick = false) {
    if (quick) { app.go(new FightScreen()); return; }
    app.go(new FightScreen());
  }
  update(app: App, m: MenuPress) {
    const l = this.lines[this.step];
    if (!l) { this.finish(app, true); return; }
    this.t++;
    if (!this.done) {
      this.chars += 0.8; if (Math.floor(this.chars) % 3 === 0 && this.t % 3 === 0) app.sfx('typing');
      if (this.chars >= l.text.length) { this.done = true; this.t = 0; }
    }
    const next = () => {
      if (this.step === 0 && this.lines[1]) { this.step = 1; this.speak(app); } else this.finish(app);
    };
    if (m.confirm || m.pause) {
      if (!this.done) { this.chars = l.text.length; this.done = true; this.t = 0; app.sfx('select'); }
      else next();
    } else if (this.done && this.t > 170 + l.text.length * 4.5) next();
    if (m.back) { app.sfx('back'); app.go(new TitleScreen()); }
  }
  pointer(app: App, _x: number, _y: number, down: boolean) { if (down) { const l = this.lines[this.step]; if (l && !this.done) { this.chars = l.text.length; this.done = true; this.t = 0; } else if (this.done) { if (this.step === 0 && this.lines[1]) { this.step = 1; this.speak(app); } else this.finish(app); } } }
  draw(g: CanvasRenderingContext2D, app: App) {
    const s = app.session, t = app.frame;
    menuBg(g, t, '#2a1530');
    // diagonal split
    g.save(); g.fillStyle = 'rgba(255,255,255,.04)'; g.beginPath(); g.moveTo(W / 2 + 70, 0); g.lineTo(W / 2 - 70, H); g.lineTo(W, H); g.lineTo(W, 0); g.fill(); g.restore();
    const ids: [CharId, CharId] = [s.p1, s.p2];
    ids.forEach((id, i) => {
      const x = i === 0 ? 240 : W - 240, d = CHARACTERS[id];
      app.assets.sprite(g, id, 'idle', Math.floor(t / 10) % 4, x, 420, i === 0 ? 1 : -1, 6.2);
      shadowText(g, d.name, x, 478, 30, d.color === '#a8b9cc' ? '#d3dde8' : d.color, 'center');
      text(g, i === 0 ? (s.mode === 'vs2p' ? 'PLAYER 1' : 'YOU') : s.mode === 'vs2p' ? 'PLAYER 2' : 'AI', x, 500, 13, '#9aa3ff', 'center');
    });
    shadowText(g, 'VS', W / 2, 270, 70, '#ffd86b', 'center', '#5a1c1c');
    const stage = (app.session as Session & { resolvedStage?: StageId }).resolvedStage ?? this.stage;
    text(g, `${STAGES[stage].name}`, W / 2, 40, 18, '#c9cdf5', 'center');
    if (s.mode === 'arcade') text(g, `Fight ${s.ladderIdx + 1} / ${s.ladder.length}`, W / 2, 62, 13, '#9aa3ff', 'center');
    // bubbles
    for (let k = 0; k <= this.step; k++) {
      const b = this.bubbles[k]; if (!b) continue;
      const side = this.order[k], x = side === 0 ? 240 : W - 240;
      const shown = k === this.step ? this.chars : 999;
      b.t = 0; drawBubble(g, b, x, 190 + (k === 0 ? 0 : 30), CHARACTERS[ids[side]].color, shown);
    }
    text(g, 'Enter: skip', W / 2, H - 10, 12, '#7782c9', 'center');
  }
}

// ================================================================== fight
export class FightScreen implements Screen {
  touch = true;
  match!: Match;
  ai: AIController | null = null;
  dummy: DummyController | null = null;
  paused = false;
  private pause!: ListMenu;
  private stageId: StageId = 'vscode';
  private done = 0;

  enter(app: App) {
    const s = app.session as Session & { resolvedStage?: StageId };
    this.stageId = s.resolvedStage ?? (s.stage === 'random' ? 'vscode' : s.stage);
    const training = s.mode === 'training';
    this.match = new Match({ p1: s.p1, p2: s.p2, stage: this.stageId, dialogs: settings.dialogs, training });
    if (training) this.dummy = new DummyController(Math.random);
    else if (s.mode !== 'vs2p') {
      const skill = s.mode === 'arcade' ? skillFor(s.difficulty, s.ladderIdx, s.ladder.length, s.p2 === 'nirvana') : skillFor(s.difficulty, 0, 1, s.p2 === 'nirvana');
      this.ai = new AIController(skill, Math.random);
    }
    const items: MenuItem[] = [{ label: 'Resume', action: () => { this.paused = false; } }];
    if (training) {
      const d = this.dummy!;
      items.push(
        { label: () => `Dummy: ${DUMMY_MODES.find((x) => x.id === d.mode)!.label}`, adjust: (k) => { const i = DUMMY_MODES.findIndex((x) => x.id === d.mode); d.mode = DUMMY_MODES[(i + k + DUMMY_MODES.length) % DUMMY_MODES.length].id; } },
        { label: () => `Cooldowns: ${this.match.trainInstantCd ? 'instant + full meter' : 'realistic'}`, adjust: () => { this.match.trainInstantCd = !this.match.trainInstantCd; } },
        { label: 'Reset positions', action: () => { this.match.resetTraining(); this.paused = false; } },
        { label: 'Change characters', action: () => app.go(new SelectScreen(0)) },
      );
    }
    items.push(
      { label: 'Controls & Settings', action: () => { this.paused = false; app.go(new SettingsScreen(this)); } },
      { label: 'Quit to Menu', action: () => app.go(new TitleScreen()) },
    );
    this.pause = new ListMenu(items, W / 2, training ? 215 : 250, 520, training ? 44 : 50, training ? 20 : 22);
    app.audio.music(this.stageId);
    app.onPause = () => { this.paused = !this.paused; };
    this.done = 0;
  }
  /** called when returning from settings */
  resume(app: App) { app.screen = this; app.audio.music(this.stageId); app.onPause = () => { this.paused = !this.paused; }; app.touch.show(settings.touch === 'on' || (settings.touch === 'auto' && matchMedia('(pointer: coarse)').matches)); }

  update(app: App, m: MenuPress) {
    app.onPause = () => { this.paused = !this.paused; };
    if (this.paused) {
      this.pause.update(app, m);
      if (m.pause || m.back) { this.paused = false; app.sfx('back'); }
      return;
    }
    if (m.pause) { this.paused = true; app.sfx('menu'); return; }
    const mt = this.match;
    const in1 = app.input.fighter(0);
    const in2 = this.dummy ? this.dummy.update(mt, mt.fighters[1]) : this.ai ? this.ai.update(mt, mt.fighters[1]) : app.input.fighter(1);
    mt.step([in1, in2]);
    for (const n of mt.sfxQueue) app.sfx(n);
    mt.sfxQueue.length = 0;
    for (const l of mt.lineQueue) app.voice.speak(l.line, l.side);
    mt.lineQueue.length = 0;
    if (mt.phase === 'done' && ++this.done > 20) app.go(new ResultScreen(mt.matchWinner as 0 | 1));
  }
  pointer(app: App, x: number, y: number, d: boolean) { if (this.paused) this.pause.pointer(app, x, y, d); }
  draw(g: CanvasRenderingContext2D, app: App) {
    const s = app.session;
    renderMatch(g, this.match, app.assets, {
      frame: app.frame,
      keys: [settings.binds[0], this.ai || this.dummy ? null : settings.binds[1]],
      names: [s.mode === 'vs2p' ? `P1 ${CHARACTERS[s.p1].name}` : CHARACTERS[s.p1].name, s.mode === 'vs2p' ? `P2 ${CHARACTERS[s.p2].name}` : `${CHARACTERS[s.p2].name} (${this.dummy ? 'Dummy' : 'AI'})`],
    }, settings.shake);
    if (this.paused) {
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, W, H);
      shadowText(g, this.dummy ? 'PLAYGROUND OPTIONS' : 'PAUSED', W / 2, 150, 40, '#fff', 'center');
      this.pause.draw(g, app.frame);
    }
  }
}

// ================================================================== result
export class ResultScreen implements Screen {
  music = 'menu';
  menu!: ListMenu;
  private unlocked: CharId | null = null;
  private cleared = false;
  constructor(private winner: 0 | 1) {}
  enter(app: App) {
    const s = app.session, items: MenuItem[] = [];
    const playerWon = this.winner === 0;
    if (s.mode === 'arcade') {
      if (playerWon) {
        if (unlock(s.p2)) { this.unlocked = s.p2; app.sfx('unlock'); }
        const more = s.ladderIdx + 1 < s.ladder.length;
        this.cleared = !more;
        if (more) items.push({ label: 'Next Fight', action: () => { s.ladderIdx++; s.p2 = s.ladder[s.ladderIdx]; app.go(new IntroScreen()); } });
      } else items.push({ label: 'Retry', action: () => app.go(new IntroScreen()) });
      items.push({ label: 'Character Select', action: () => app.go(new SelectScreen(0)) });
    } else {
      items.push({ label: 'Rematch', action: () => app.go(new IntroScreen()) });
      items.push({ label: 'Character Select', action: () => app.go(new SelectScreen(0)) });
    }
    items.push({ label: 'Main Menu', action: () => app.go(new TitleScreen()) });
    this.menu = new ListMenu(items, W / 2, 380, 420, 46, 21);
  }
  update(app: App, m: MenuPress) { this.menu.update(app, m); }
  pointer(app: App, x: number, y: number, d: boolean) { this.menu.pointer(app, x, y, d); }
  draw(g: CanvasRenderingContext2D, app: App) {
    const s = app.session, t = app.frame, w = this.winner === 0 ? s.p1 : s.p2;
    menuBg(g, t, this.winner === 0 ? '#1d3a2a' : '#3a1d1d');
    const def = CHARACTERS[w];
    const head = s.mode === 'arcade' ? (this.winner === 0 ? 'VICTORY' : 'DEFEATED') : s.mode === 'vs2p' ? `PLAYER ${this.winner + 1} WINS` : this.winner === 0 ? 'YOU WIN' : 'AI WINS';
    shadowText(g, head, W / 2, 80, 52, this.winner === 0 || s.mode !== 'arcade' ? '#ffd86b' : '#ff6b6b', 'center');
    app.assets.sprite(g, w, 'win', Math.floor(t / 8) % 4, W / 2, 262, 1, 3.8);
    text(g, def.name, W / 2, 288, 24, def.color === '#a8b9cc' ? '#d3dde8' : def.color, 'center');
    if (this.unlocked) {
      const u = CHARACTERS[this.unlocked];
      g.fillStyle = 'rgba(255,216,107,.15)'; rrect(g, W / 2 - 230, 304, 460, 56, 10); g.fill(); g.strokeStyle = '#ffd86b'; g.lineWidth = 2; g.stroke();
      text(g, `★ UNLOCKED: ${u.name.toUpperCase()} ★`, W / 2, 330, 22, '#ffd86b', 'center');
      text(g, u.tagline, W / 2, 350, 12, '#c9cdf5', 'center', false);
    } else if (s.mode === 'arcade' && this.winner === 0) text(g, 'Already unlocked.', W / 2, 330, 14, '#9aa3ff', 'center');
    if (s.mode === 'arcade' && this.winner === 0 && this.cleared) text(g, s.p2 === 'nirvana' ? 'You have reached Nirvana. The ladder is complete.' : 'Ladder complete!', W / 2, 372, 14, '#7dff9b', 'center');
    if (s.mode === 'vs2p' || s.mode === 'vsai') text(g, 'Versus fights do not unlock characters.', W / 2, 340, 12, '#7782c9', 'center');
    this.menu.y = this.cleared || this.unlocked ? 400 : 390;
    this.menu.draw(g, t);
  }
}

// ================================================================== settings
export class SettingsScreen implements Screen {
  music = 'menu';
  menu!: ListMenu;
  private confirmReset = 0;
  constructor(private back?: FightScreen) {}
  enter(app: App) {
    const pct = (v: number) => `${'█'.repeat(Math.round(v * 10))}${'░'.repeat(10 - Math.round(v * 10))} ${Math.round(v * 100)}%`;
    const vol = (k: 'master' | 'music' | 'sfx' | 'voice') => (d: -1 | 1) => { settings[k] = Math.max(0, Math.min(1, Math.round((settings[k] + d * 0.1) * 10) / 10)); app.saveSettings(); };
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    const touches: ('auto' | 'on' | 'off')[] = ['auto', 'on', 'off'];
    this.menu = new ListMenu([
      { label: () => `Master volume  ${pct(settings.master)}`, adjust: vol('master') },
      { label: () => `Music         ${pct(settings.music)}`, adjust: vol('music') },
      { label: () => `Sound FX      ${pct(settings.sfx)}`, adjust: vol('sfx') },
      { label: () => `Voice         ${pct(settings.voice)}`, adjust: vol('voice') },
      { label: () => `Mute: ${settings.muted ? 'ON' : 'off'}`, action: () => { settings.muted = !settings.muted; app.saveSettings(); } },
      { label: () => `AI difficulty: ${settings.difficulty}`, adjust: (d) => { settings.difficulty = diffs[(diffs.indexOf(settings.difficulty) + d + 3) % 3]; app.saveSettings(); } },
      { label: () => `Dialog bubbles: ${settings.dialogs ? 'ON' : 'off'}`, action: () => { settings.dialogs = !settings.dialogs; app.saveSettings(); } },
      { label: () => `Screen shake: ${settings.shake ? 'ON' : 'off'}`, action: () => { settings.shake = !settings.shake; app.saveSettings(); } },
      { label: () => `Touch controls: ${settings.touch}`, adjust: (d) => { settings.touch = touches[(touches.indexOf(settings.touch) + d + 3) % 3]; app.saveSettings(); } },
      { label: 'Rebind keys...', action: () => app.go(new RebindScreen(this.back)) },
      { label: () => (this.confirmReset > 0 ? 'Really reset progress? Press again' : 'Reset unlock progress'), action: () => { if (this.confirmReset > 0) { resetProgress(); this.confirmReset = 0; } else this.confirmReset = 240; } },
      { label: 'Back', action: () => this.exit(app) },
    ], 150, 128, 660, 33, 17, 'left');
  }
  private exit(app: App) { if (this.back) this.back.resume(app); else app.go(new TitleScreen()); }
  update(app: App, m: MenuPress) {
    if (this.confirmReset > 0) this.confirmReset--;
    this.menu.update(app, m);
    if (m.back) { app.sfx('back'); this.exit(app); }
  }
  pointer(app: App, x: number, y: number, d: boolean) { this.menu.pointer(app, x, y, d); }
  draw(g: CanvasRenderingContext2D, app: App) {
    menuBg(g, app.frame); title(g, 'SETTINGS', 'Left / Right to adjust');
    this.menu.draw(g, app.frame);
    text(g, 'Esc: back', W / 2, H - 12, 12, '#7782c9', 'center');
  }
}

// ================================================================== rebinding
const ACTION_NAMES: Record<Action, string> = {
  left: 'Move left', right: 'Move right', up: 'Jump', down: 'Drop / fast-fall', light: 'Light attack', heavy: 'Heavy attack',
  block: 'Block', dodge: 'Dodge', s1: 'Special 1', s2: 'Special 2', s3: 'Special 3 (meter)',
};
export class RebindScreen implements Screen {
  music = 'menu';
  col = 0; row = 0; waiting = false;
  constructor(private back?: FightScreen) {}
  update(app: App, m: MenuPress) {
    if (this.waiting) return;
    const n = ACTIONS.length + 1;
    if (m.up) { this.row = (this.row + n - 1) % n; app.sfx('menu'); }
    if (m.down) { this.row = (this.row + 1) % n; app.sfx('menu'); }
    if (m.left || m.right) { this.col = 1 - this.col; app.sfx('menu'); }
    if (m.confirm) {
      if (this.row === ACTIONS.length) { resetBinds(); app.sfx('unlock'); return; }
      this.waiting = true; app.sfx('select');
      const action = ACTIONS[this.row], player = this.col as 0 | 1;
      app.input.captureNext((code) => { this.waiting = false; if (code) { app.input.rebind(player, action, code); app.sfx('select'); } else app.sfx('back'); });
    } else if (m.back) { app.sfx('back'); if (this.back) app.go(new SettingsScreen(this.back)); else app.go(new SettingsScreen()); }
  }
  pointer(app: App, x: number, y: number, down: boolean) {
    const r = Math.floor((y - 112) / 30);
    if (r >= 0 && r <= ACTIONS.length && down) {
      this.row = r; if (x > W / 2) this.col = 1; else this.col = 0;
      if (r < ACTIONS.length && !this.waiting) { this.waiting = true; const action = ACTIONS[r], player = this.col as 0 | 1; app.input.captureNext((code) => { this.waiting = false; if (code) app.input.rebind(player, action, code); }); }
      else if (r === ACTIONS.length) resetBinds();
    }
  }
  draw(g: CanvasRenderingContext2D, app: App) {
    menuBg(g, app.frame); title(g, 'REBIND KEYS', this.waiting ? 'Press a key (Esc cancels)...' : 'Enter on an action, then press the new key');
    text(g, 'PLAYER 1', 400, 108, 16, '#7b8cff', 'center'); text(g, 'PLAYER 2', 730, 108, 16, '#ff8a7b', 'center');
    ACTIONS.forEach((a, i) => {
      const y = 134 + i * 30;
      text(g, ACTION_NAMES[a], 60, y, 15, '#c9cdf5', 'left');
      [0, 1].forEach((p) => {
        const sel = this.row === i && this.col === p, x = p === 0 ? 400 : 730;
        g.fillStyle = sel ? (this.waiting ? '#a33' : 'rgba(123,140,255,.35)') : 'rgba(255,255,255,.06)'; rrect(g, x - 110, y - 18, 220, 25, 6); g.fill();
        if (sel) { g.strokeStyle = '#ffd86b'; g.lineWidth = 2; g.stroke(); }
        const keys = settings.binds[p][a];
        text(g, sel && this.waiting ? '...' : keys.map(keyLabel).join(' / ') || '—', x, y, 15, '#fff', 'center');
      });
    });
    const y = 134 + ACTIONS.length * 30;
    g.fillStyle = this.row === ACTIONS.length ? 'rgba(123,140,255,.35)' : 'rgba(255,255,255,.06)'; rrect(g, W / 2 - 150, y - 18, 300, 25, 6); g.fill();
    text(g, 'Reset to defaults', W / 2, y, 15, '#fff', 'center');
    text(g, `Defaults — P1: WASD + Space, J K L, Shift, U I O   P2: Arrows + Numpad 1-6, 0`, W / 2, H - 14, 11, '#7782c9', 'center');
    void DEFAULT_BINDS; void getSave; void HELPER_NAMES;
  }
}
