import { CHARACTERS, type CharDef } from './characters';
import { pickLine, type Line, type Phase } from './dialogs';
import { ABILITIES, matchupMod } from './abilities';
import { Stage, STAGES, type Plat, type StageId } from './stages';
import { ACTIONS, emptyInput, overlap, type CharId, type HelperId, type Input, type Rect, type Rng } from './types';
import { H, ROUNDS_TO_WIN, ROUND_SECONDS, W } from '../config';

// ---------------------------------------------------------------- constants
const GRAV = 0.62;
const MAX_FALL = 16;
const FW = 38; // fighter body width
const FH = 100; // fighter body height
const BUF = 8; // input buffer frames
const BLAST = { left: -130, right: W + 130, top: -320, bottom: H + 170 };

export type StatusName = 'confuse' | 'root' | 'silence' | 'rage' | 'speed' | 'shield' | 'counter' | 'reflect' | 'invuln' | 'armor';
const STATUS_NAMES: StatusName[] = ['confuse', 'root', 'silence', 'rage', 'speed', 'shield', 'counter', 'reflect', 'invuln', 'armor'];

interface AttackDef {
  startup: number; active: number; rec: number;
  dmg: number; kb: [number, number]; stun: number;
  hb: { x: number; y: number; w: number; h: number };
  lunge?: number;
}
const LIGHT: AttackDef[] = [
  { startup: 4, active: 3, rec: 9, dmg: 5, kb: [2.6, -1.4], stun: 13, hb: { x: 8, y: -88, w: 44, h: 32 } },
  { startup: 4, active: 3, rec: 9, dmg: 5, kb: [2.8, -1.4], stun: 13, hb: { x: 8, y: -88, w: 46, h: 32 } },
  { startup: 5, active: 3, rec: 16, dmg: 8, kb: [7.5, -4.8], stun: 20, hb: { x: 8, y: -92, w: 54, h: 42 }, lunge: 2.5 },
];
const HEAVY: AttackDef = { startup: 14, active: 5, rec: 22, dmg: 15, kb: [9.5, -6.5], stun: 26, hb: { x: 4, y: -98, w: 66, h: 62 }, lunge: 3 };
const RIPOSTE: AttackDef = { startup: 2, active: 7, rec: 14, dmg: 18, kb: [10, -6], stun: 24, hb: { x: 0, y: -100, w: 90, h: 80 }, lunge: 10 };

export interface Bubble { line: Line; text: string; t: number; life: number }

// ---------------------------------------------------------------- entities
export class Fighter {
  x = 0; y = 0; vx = 0; vy = 0; facing: 1 | -1 = 1;
  hp: number; maxHp: number; meter = 0;
  grounded = true; standing: Plat | null = null; jumpsLeft = 2; dropT = 0;
  state: 'idle' | 'walk' | 'jump' | 'fall' | 'light' | 'heavy' | 'block' | 'hurt' | 'dodge' | 'special' | 'ko' | 'win' = 'idle';
  stateT = 0;
  hitstun = 0; hitstunMax = 1;
  atk: { def: AttackDef; t: number; hit: boolean; stage: number } | null = null;
  cast: { slot: number; t: number; fired: boolean; charging: boolean; chargeT: number } | null = null;
  cd = [0, 0, 0]; dodgeCd = 0; invulnT = 0; hazCd = 0;
  dashT = 0; dashVx = 0;
  st: Record<StatusName, number> = { confuse: 0, root: 0, silence: 0, rage: 0, speed: 0, shield: 0, counter: 0, reflect: 0, invuln: 0, armor: 0 };
  prev: Input = emptyInput();
  buf: Record<string, number> = {};
  bubble: Bubble | null = null; bubbleCd = 0;
  patched = false; lowSaid = false; ringOut = false; combo = 0; comboT = 0;
  flash = 0; // white hit flash frames
  def: CharDef;

  constructor(public id: CharId, public side: 0 | 1) {
    this.def = CHARACTERS[id];
    this.maxHp = this.def.hp; this.hp = this.maxHp;
  }

  get rect(): Rect { return { x: this.x - FW / 2, y: this.y - FH, w: FW, h: FH }; }
  get cx() { return this.x; }
  get cy() { return this.y - FH / 2; }

  reset(x: number, y: number, facing: 1 | -1) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.facing = facing;
    this.hp = this.maxHp; this.meter = 0; this.state = 'idle'; this.stateT = 0; this.atk = null; this.cast = null;
    this.cd = [0, 0, 0]; this.dodgeCd = 0; this.invulnT = 0; this.hitstun = 0; this.dashT = 0; this.jumpsLeft = 3;
    for (const k of STATUS_NAMES) this.st[k] = 0;
    this.bubble = null; this.bubbleCd = 0; this.patched = false; this.lowSaid = false; this.ringOut = false; this.combo = 0; this.flash = 0;
    this.prev = emptyInput(); this.buf = {}; this.grounded = true; this.standing = null;
  }

  want(a: string) { return (this.buf[a] ?? 0) > 0; }
  eat(a: string) { this.buf[a] = 0; }

  canCast(slot: number): boolean {
    const i = this.def.abilities[slot];
    return this.cd[slot] <= 0 && this.meter >= i.cost && this.st.silence <= 0;
  }

  get actionable() { return ['idle', 'walk', 'jump', 'fall', 'block'].includes(this.state); }

  /** controls scrambled by Type Coercion */
  private effInput(raw: Input): Input {
    if (this.st.confuse <= 0) return raw;
    return { ...raw, left: raw.right, right: raw.left, light: raw.heavy, heavy: raw.light };
  }

  /** Name of the sprite animation + frame to draw. */
  anim(): [string, number] {
    const t = this.stateT;
    switch (this.state) {
      case 'ko': return ['ko', Math.min(2, Math.floor(t / 7))];
      case 'win': return ['win', Math.floor(t / 8) % 4];
      case 'hurt': return ['hurt', this.hitstunMax - this.hitstun > 6 ? 1 : 0];
      case 'block': return ['block', 0];
      case 'dodge': return ['dodge', 0];
      case 'light': { const a = this.atk!; return ['light', a.t < a.def.startup ? 0 : a.t < a.def.startup + a.def.active ? 1 : 2]; }
      case 'heavy': {
        const a = this.atk!, d = a.def;
        if (a.t < d.startup / 2) return ['heavy', 0];
        if (a.t < d.startup) return ['heavy', 1];
        if (a.t < d.startup + d.active / 2) return ['heavy', 2];
        if (a.t < d.startup + d.active) return ['heavy', 3];
        return ['heavy', 4];
      }
      case 'special': {
        const c = this.cast!, i = this.def.abilities[c.slot];
        if (c.charging) return ['special', 1];
        if (c.t < i.fireAt * 0.5) return ['special', 0];
        if (c.t < i.fireAt) return ['special', 1];
        if (c.t < i.fireAt + 6) return ['special', 2];
        return ['special', 3];
      }
      case 'jump': return ['jump', this.vy < -3 ? 0 : 1];
      case 'fall': return ['fall', 0];
      case 'walk': return ['walk', Math.floor(t / 5) % 6];
      default: return ['idle', Math.floor(t / 12) % 4];
    }
  }

  setState(s: Fighter['state']) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

  startAttack(kind: 'light' | 'heavy', def: AttackDef, stage = 0) {
    this.atk = { def, t: 0, hit: false, stage };
    this.setState(kind); this.stateT = 0;
    this.cast = null;
  }

  startCast(m: Match, slot: number) {
    const i = this.def.abilities[slot];
    this.meter -= i.cost; this.cd[slot] = i.cd;
    this.cast = { slot, t: 0, fired: false, charging: false, chargeT: 0 };
    this.atk = null;
    this.setState('special'); this.stateT = 0;
    m.say(this, 'special', 0.5);
  }

  attackRect(): Rect | null {
    const a = this.atk;
    if (!a || (this.state !== 'light' && this.state !== 'heavy')) return null;
    if (a.t < a.def.startup || a.t >= a.def.startup + a.def.active) return null;
    const hb = a.def.hb, reach = this.def.reach;
    const w = hb.w * reach;
    const x = this.facing > 0 ? this.x + hb.x : this.x - hb.x - w;
    return { x, y: this.y + hb.y, w, h: hb.h };
  }

  // ------------------------------------------------------------ per-frame
  update(m: Match, raw: Input, canAct: boolean) {
    const foe = m.foe(this);
    this.stateT++;
    for (const k of STATUS_NAMES) if (this.st[k] > 0) this.st[k]--;
    for (let i = 0; i < 3; i++) if (this.cd[i] > 0) this.cd[i]--;
    if (this.dodgeCd > 0) this.dodgeCd--;
    if (this.invulnT > 0) this.invulnT--;
    if (this.hazCd > 0) this.hazCd--;
    if (this.flash > 0) this.flash--;
    if (this.bubbleCd > 0) this.bubbleCd--;
    if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;
    if (this.bubble && ++this.bubble.t > this.bubble.life) this.bubble = null;
    if (this.id === 'nirvana' && this.state !== 'ko' && this.hp > 0 && m.phase === 'fight') this.hp = Math.min(this.maxHp, this.hp + 0.035);

    const inp = canAct ? this.effInput(raw) : emptyInput();
    for (const a of ACTIONS) {
      const pressed = inp[a] && !this.prev[a];
      if (pressed) this.buf[a] = BUF; else if ((this.buf[a] ?? 0) > 0) this.buf[a]--;
    }
    const pressedDown = inp.down && !this.prev.down;

    if (this.dashT > 0) { this.vx = this.dashVx; this.dashT--; }

    switch (this.state) {
      case 'ko': this.vx *= 0.96; break;
      case 'win': this.vx *= 0.8; break;
      case 'hurt':
        if (--this.hitstun <= 0) this.setState(this.grounded ? 'idle' : 'fall');
        break;
      case 'light': case 'heavy': case 'special': case 'dodge':
        this.updateAction(m, inp, foe);
        break;
      default:
        if (canAct) this.updateFree(m, inp, foe, pressedDown);
        else { this.vx *= 0.8; this.setState(this.grounded ? 'idle' : 'fall'); }
    }
    this.prev = { ...inp };
    this.physics(m);
  }

  private moveDir(inp: Input) { return this.st.root > 0 ? 0 : (inp.right ? 1 : 0) - (inp.left ? 1 : 0); }
  private speed() { return this.def.speed * (this.st.speed > 0 ? 1.4 : 1); }

  private updateFree(m: Match, inp: Input, foe: Fighter, pressedDown: boolean) {
    if (this.grounded) this.facing = foe.x >= this.x ? 1 : -1;
    // cancel into actions
    if (this.want('s3') && this.canCast(2)) { this.eat('s3'); this.startCast(m, 2); return; }
    if (this.want('s2') && this.canCast(1)) { this.eat('s2'); this.startCast(m, 1); return; }
    if (this.want('s1') && this.canCast(0)) { this.eat('s1'); this.startCast(m, 0); return; }
    if (this.want('dodge') && this.dodgeCd <= 0) { this.eat('dodge'); this.startDodge(m, inp); return; }
    if (this.want('heavy')) { this.eat('heavy'); this.startAttack('heavy', HEAVY); if (this.grounded) this.vx *= 0.3; return; }
    if (this.want('light')) { this.eat('light'); this.startAttack('light', LIGHT[0], 0); if (this.grounded) this.vx *= 0.3; return; }

    const dir = this.moveDir(inp);
    if (inp.block && this.grounded) {
      this.setState('block'); this.vx *= 0.7;
      return;
    }
    if (this.state === 'block') this.setState('idle');

    // drop through one-way platforms
    if (pressedDown && this.grounded && this.standing && this.standing.kind === 'oneway') {
      this.dropT = 14; this.grounded = false; this.standing = null; this.y += 3; this.vy = 2;
    }
    // jumping
    if (this.want('up') && this.jumpsLeft > 0 && this.st.root <= 0) {
      this.eat('up');
      const first = this.grounded;
      this.vy = -this.def.jump * (first ? 1 : 0.94);
      this.jumpsLeft--; this.grounded = false; this.standing = null;
      if (!first) m.fx.burst(this.x, this.y - 4, '#cfe8ff', 6, 2);
      m.sfx('jump');
    }
    // horizontal
    const target = dir * this.speed();
    const acc = this.grounded ? 1.1 : 0.45;
    this.vx += Math.max(-acc, Math.min(acc, target - this.vx));
    if (dir === 0 && this.grounded) this.vx *= 0.8;
    if (inp.down && !this.grounded) this.vy = Math.min(MAX_FALL * 1.4, this.vy + GRAV * 0.9);
    if (this.grounded) this.setState(dir !== 0 ? 'walk' : 'idle');
    else this.setState(this.vy < 0 ? 'jump' : 'fall');
  }

  private startDodge(m: Match, inp: Input) {
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0) || -this.facing;
    this.setState('dodge'); this.atk = null; this.cast = null;
    this.vx = dir * 8.5 * (this.st.speed > 0 ? 1.2 : 1);
    if (!this.grounded) this.vy = Math.min(this.vy, -2);
    this.invulnT = 15;
    this.dodgeCd = this.st.speed > 0 ? 28 : 55;
    m.fx.burst(this.x, this.y - 40, '#ffffff', 5, 2);
    m.sfx('dodge');
  }

  private updateAction(m: Match, inp: Input, foe: Fighter) {
    if (this.state === 'dodge') {
      this.vx *= 0.9;
      if (this.stateT >= 16) this.setState(this.grounded ? 'idle' : 'fall');
      return;
    }
    if (this.state === 'special') { this.updateCast(m, inp); return; }
    const a = this.atk!;
    if (a.t === a.def.startup - 1 && a.def.lunge) this.vx += this.facing * a.def.lunge;
    a.t++;
    this.vx *= this.grounded ? 0.82 : 0.97;
    const total = a.def.startup + a.def.active + a.def.rec;
    const inRecovery = a.t >= a.def.startup + a.def.active;
    // cancels: light chains / cancels into heavy and specials after connecting
    if (a.hit && inRecovery) {
      if (this.state === 'light') {
        if (this.want('light') && a.stage < 2) { this.eat('light'); this.startAttack('light', LIGHT[a.stage + 1], a.stage + 1); return; }
        if (this.want('heavy')) { this.eat('heavy'); this.startAttack('heavy', HEAVY); return; }
      }
      for (let s = 2; s >= 0; s--) {
        const k = `s${s + 1}`;
        if (this.want(k) && this.canCast(s)) { this.eat(k); this.startCast(m, s); return; }
      }
    }
    if (a.t >= total) { this.atk = null; this.setState(this.grounded ? 'idle' : 'fall'); }
    void foe; void inp;
  }

  private updateCast(m: Match, inp: Input) {
    const c = this.cast!, info = this.def.abilities[c.slot];
    const fire = (power: number) => { c.fired = true; ABILITIES[this.id][c.slot](this, m, power); };
    this.vx *= this.grounded ? 0.8 : 0.97;
    if (info.charge && !c.fired) {
      if (c.t < info.fireAt) { c.t++; return; }
      c.charging = true; c.chargeT++;
      if (!inp[(`s${c.slot + 1}`) as Action] || c.chargeT >= info.charge) { c.charging = false; fire(Math.min(1, c.chargeT / info.charge)); c.t = info.fireAt; }
      return;
    }
    c.t++;
    if (!c.fired && c.t >= info.fireAt) fire(1);
    if (c.t >= info.cast) { this.cast = null; this.setState(this.grounded ? 'idle' : 'fall'); }
  }

  // ------------------------------------------------------------ physics
  physics(m: Match) {
    if (this.dropT > 0) this.dropT--;
    if (this.standing) { this.x += this.standing.dx; this.y += this.standing.dy; }
    const plats = m.stage.plats;
    this.vy = Math.min(MAX_FALL, this.vy + GRAV);
    // horizontal
    this.x += this.vx;
    for (const p of plats) {
      if (p.kind !== 'solid') continue;
      if (this.y - FH < p.y + p.h && this.y > p.y + 3 && this.x + FW / 2 > p.x && this.x - FW / 2 < p.x + p.w) {
        if (this.x < p.x + p.w / 2) this.x = p.x - FW / 2; else this.x = p.x + p.w + FW / 2;
        this.vx = 0;
      }
    }
    // vertical
    const prevY = this.y;
    this.y += this.vy;
    this.grounded = false; this.standing = null;
    for (const p of plats) {
      if (this.x + FW / 2 <= p.x + 1 || this.x - FW / 2 >= p.x + p.w - 1) continue;
      if (p.kind === 'oneway' && this.dropT > 0) continue;
      if (this.vy >= 0 && prevY <= p.y + 6 && this.y >= p.y) {
        this.y = p.y; this.vy = 0; this.grounded = true; this.standing = p; this.jumpsLeft = 3;
      } else if (p.kind === 'solid' && this.vy < 0 && this.y - FH <= p.y + p.h && prevY - FH >= p.y + p.h - 4) {
        this.y = p.y + p.h + FH; this.vy = 0;
      }
    }
    if (this.grounded && this.state === 'hurt' && this.hitstun > 0 && this.vy === 0) this.vx *= 0.9;
  }
}

type Action = (typeof ACTIONS)[number];

// ---------------------------------------------------------------- projectiles, zones, assists
export interface ProjOpts {
  owner: Fighter; x: number; y: number; vx: number; vy: number; w: number; h: number;
  dmg: number; kb: [number, number]; stun: number; label: string; color: string; fg?: string;
  life?: number; gravity?: number; pierce?: boolean; spin?: number; tag?: string; solidDie?: boolean;
  unblockable?: boolean; shape?: 'text' | 'orb' | 'wave' | 'none'; hits?: number;
  update?: (p: Projectile, m: Match) => void;
  onHit?: (p: Projectile, target: Fighter, m: Match) => void;
  onDie?: (p: Projectile, m: Match) => void;
}
export class Projectile {
  owner: Fighter; x: number; y: number; vx: number; vy: number; w: number; h: number;
  dmg: number; kb: [number, number]; stun: number; label: string; color: string; fg: string;
  life: number; gravity: number; pierce: boolean; spin: number; rot = 0; tag?: string; solidDie: boolean;
  unblockable: boolean; shape: 'text' | 'orb' | 'wave' | 'none'; age = 0; dead = false;
  hit = new Set<Fighter>();
  update?: ProjOpts['update']; onHit?: ProjOpts['onHit']; onDie?: ProjOpts['onDie'];
  data: Record<string, number> = {};
  constructor(o: ProjOpts) {
    this.owner = o.owner; this.x = o.x; this.y = o.y; this.vx = o.vx; this.vy = o.vy; this.w = o.w; this.h = o.h;
    this.dmg = o.dmg; this.kb = o.kb; this.stun = o.stun; this.label = o.label; this.color = o.color; this.fg = o.fg ?? '#111';
    this.life = o.life ?? 180; this.gravity = o.gravity ?? 0; this.pierce = !!o.pierce; this.spin = o.spin ?? 0; this.tag = o.tag;
    this.solidDie = o.solidDie ?? true; this.unblockable = !!o.unblockable; this.shape = o.shape ?? 'text';
    this.update = o.update; this.onHit = o.onHit; this.onDie = o.onDie;
  }
  get rect(): Rect { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  kill(m: Match) { if (this.dead) return; this.dead = true; this.onDie?.(this, m); }
}

export interface ZoneOpts {
  owner: Fighter; x: number; y: number; w: number; h: number; mode: 'burst' | 'dot';
  delay: number; life?: number; tick?: number; dmg: number; kb: [number, number]; stun: number;
  label: string; color: string; tag?: string;
}
export class Zone {
  t = 0; dead = false; tickT = 0;
  constructor(public o: ZoneOpts) {}
  get rect(): Rect { return { x: this.o.x - this.o.w / 2, y: this.o.y - this.o.h, w: this.o.w, h: this.o.h }; }
}

export class Assist {
  t = 0; dead = false; x: number; y: number; facing: 1 | -1 = 1; hitsDone = 0; bubble: Bubble | null = null;
  atkT = -1; atkHit = false;
  constructor(public owner: Fighter, public helper: HelperId, x: number, y: number) { this.x = x; this.y = y; }
}

// ---------------------------------------------------------------- fx
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }
interface FloatText { x: number; y: number; text: string; color: string; life: number; max: number; size: number }
export class FxSystem {
  particles: Particle[] = []; texts: FloatText[] = []; rings: { x: number; y: number; r: number; max: number; life: number; color: string }[] = [];
  constructor(private rng: Rng) {}
  burst(x: number, y: number, color: string, n = 8, speed = 3, g = 0.12) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, s = (0.4 + this.rng() * 0.8) * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: 18 + this.rng() * 14, max: 32, color, size: 2 + (this.rng() * 3 | 0), g });
    }
  }
  text(x: number, y: number, text: string, color = '#fff', size = 16, life = 55) { this.texts.push({ x, y, text, color, life, max: life, size }); }
  ring(x: number, y: number, max: number, color: string, life = 18) { this.rings.push({ x, y, r: 0, max, life, color }); }
  update() {
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 0.6; t.life--; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) { r.life--; r.r += r.max / 18; }
    this.rings = this.rings.filter((r) => r.life > 0);
  }
}

export interface HitSpec {
  attacker: Fighter | null; dmg: number; kb: [number, number]; dir: 1 | -1; stun: number;
  unblockable?: boolean; tag?: string; src: 'melee' | 'proj' | 'zone' | 'hazard' | 'assist';
}
export type HitResult = 'hit' | 'blocked' | 'miss';

export interface MatchOptions {
  p1: CharId; p2: CharId; stage: StageId; rng?: Rng; dialogs?: boolean; training?: boolean;
}
export type Phase_ = 'ready' | 'fight' | 'ko' | 'roundEnd' | 'done';

export class Match {
  rng: Rng;
  stage: Stage;
  fighters: [Fighter, Fighter];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  assists: Assist[] = [];
  fx: FxSystem;
  t = 0; phase: Phase_ = 'ready'; phaseT = 0;
  round = 0; wins: [number, number] = [0, 0];
  timer = ROUND_SECONDS * 60;
  roundWinner: -1 | 0 | 1 = -1; matchWinner: -1 | 0 | 1 = -1;
  hitstop = 0; shake = 0;
  dialogOn: boolean;
  /** Skill Playground: endless round, unkillable dummy, optional instant cooldowns */
  training: boolean;
  trainInstantCd = true;
  trainStats = { last: 0, total: 0, hits: 0, idle: 0 };
  sayCd = 0;
  used = new Set<string>();
  sfxQueue: string[] = [];
  lineQueue: { line: Line; side: 0 | 1 | 'assist' }[] = [];
  later_: { t: number; fn: () => void }[] = [];
  banner = '';

  constructor(opts: MatchOptions) {
    this.rng = opts.rng ?? Math.random;
    this.dialogOn = opts.dialogs ?? true;
    this.training = !!opts.training;
    this.stage = new Stage(STAGES[opts.stage], this.rng);
    this.fighters = [new Fighter(opts.p1, 0), new Fighter(opts.p2, 1)];
    this.fx = new FxSystem(this.rng);
    this.startRound();
  }

  foe(f: Fighter) { return this.fighters[1 - f.side]; }
  sfx(n: string) { this.sfxQueue.push(n); }
  later(frames: number, fn: () => void) { this.later_.push({ t: frames, fn }); }

  startRound() {
    this.round++;
    const top = this.stage.def.floor.top;
    this.fighters[0].reset(360, top, 1);
    this.fighters[1].reset(600, top, -1);
    this.projectiles = []; this.zones = []; this.assists = []; this.later_ = [];
    this.timer = ROUND_SECONDS * 60;
    this.phase = 'ready'; this.phaseT = 0; this.roundWinner = -1;
    this.banner = this.wins[0] === ROUNDS_TO_WIN - 1 && this.wins[1] === ROUNDS_TO_WIN - 1 ? 'FINAL ROUND' : `ROUND ${this.round}`;
  }

  // ------------------------------------------------------------ dialog
  say(f: Fighter, phase: Phase, chance = 1, force = false) {
    if (!this.dialogOn || (!force && this.rng() > chance)) return;
    if (!force && (f.bubbleCd > 0 || this.sayCd > 0)) return;
    const foe = this.foe(f);
    const line = pickLine(f.id, foe.id, phase, this.rng, this.used);
    if (!line) return;
    this.used.add(line.id);
    f.bubble = { line, text: line.text, t: 0, life: 40 + line.text.length * 3.2 };
    f.bubbleCd = 240; this.sayCd = 100;
    this.lineQueue.push({ line, side: f.side });
  }

  // ------------------------------------------------------------ spawning API (used by abilities)
  spawnProjectile(o: ProjOpts) { const p = new Projectile(o); this.projectiles.push(p); return p; }
  spawnZone(o: ZoneOpts) { const z = new Zone(o); this.zones.push(z); return z; }
  spawnAssist(owner: Fighter, helper: HelperId) {
    const side = owner.x < W / 2 ? -1 : 1;
    const a = new Assist(owner, helper, side < 0 ? -60 : W + 60, this.stage.def.floor.top);
    this.assists.push(a);
    if (this.dialogOn) {
      const line = pickLine(helper, owner.id, 'assist', this.rng);
      if (line) { a.bubble = { line, text: line.text, t: 0, life: 150 }; this.lineQueue.push({ line, side: 'assist' }); }
    }
    this.fx.text(owner.x, owner.y - 130, 'Call for help!', '#ffffff', 14);
    return a;
  }
  heal(f: Fighter, n: number) { f.hp = Math.min(f.maxHp, f.hp + n); this.fx.text(f.x, f.y - 120, `+${Math.round(n)}`, '#7dff9b', 16); }

  // ------------------------------------------------------------ hit resolution
  hit(t: Fighter, h: HitSpec): HitResult {
    if (this.phase !== 'fight' || t.state === 'ko') return 'miss';
    const a = h.attacker;
    if (t.invulnT > 0 || t.st.invuln > 0) { this.fx.text(t.x, t.y - 110, 'MISS', '#9ad', 12, 30); if (t.invulnT > 0) this.say(t, 'dodge', 0.3); return 'miss'; }
    if (t.st.shield > 0) {
      this.fx.ring(t.x, t.cy, 80, '#7fe3f5'); this.sfx('block'); this.fx.text(t.x, t.y - 120, 'BLOCKED', '#7fe3f5', 12, 30);
      if (a && h.src === 'melee') a.vx = -a.facing * 3;
      return 'blocked';
    }
    if (t.st.counter > 0 && a && h.src !== 'hazard') {
      t.st.counter = 0; t.invulnT = 18; t.facing = a.x >= t.x ? 1 : -1;
      t.startAttack('heavy', RIPOSTE, 0); t.atk!.t = 0;
      this.fx.text(t.x, t.y - 120, 'match → riposte!', '#30b9db', 14);
      this.sfx('special');
      return 'miss';
    }
    if (t.id === 'nirvana' && !t.patched && h.src !== 'hazard') {
      t.patched = true; this.fx.text(t.x, t.y - 120, 'BUG FIXED', '#ffd86b', 16, 70); this.fx.ring(t.x, t.cy, 90, '#ffd86b', 24); this.sfx('block');
      return 'miss';
    }
    let dmg = h.dmg;
    if (a) {
      dmg *= a.def.dmg * (a.st.rage > 0 ? 1.4 : 1) * matchupMod(a.id, t.id, h.tag);
    }
    if (t.st.rage > 0) dmg *= 1.25;
    dmg = Math.max(1, dmg);

    const fromX = a ? a.x : t.x - h.dir * 10;
    const front = t.facing * (fromX - t.x) > 0 || h.src === 'hazard';
    const blocking = t.state === 'block' && !h.unblockable && front && h.src !== 'hazard';
    if (blocking) {
      const chip = Math.max(0.5, dmg * 0.12);
      t.hp = Math.max(1, t.hp - chip);
      t.vx = h.dir * 3; t.meter = Math.min(100, t.meter + 2);
      if (a) a.meter = Math.min(100, a.meter + 2);
      this.fx.burst(t.x + t.facing * 20, t.cy - 10, '#9ad2ff', 6, 2);
      this.fx.text(t.x, t.y - 118, 'BLOCK', '#9ad2ff', 12, 28);
      this.hitstop = Math.max(this.hitstop, 3);
      this.sfx('block');
      this.say(t, 'block', 0.3);
      return 'blocked';
    }

    t.hp -= dmg;
    t.flash = 5;
    const dmgPct = 1 - Math.max(0, t.hp) / t.maxHp;
    const mult = (1 + dmgPct * 1.6) / t.def.weight;
    const armored = t.st.armor > 0;
    if (!armored) {
      t.vx = h.dir * h.kb[0] * mult; t.vy = h.kb[1] * mult;
      if (t.vy < -0.5) { t.grounded = false; t.standing = null; }
      t.setState('hurt'); t.stateT = 0; t.hitstun = h.stun; t.hitstunMax = h.stun; t.atk = null; t.cast = null; t.dashT = 0;
    } else t.hp += dmg * 0.4;
    t.meter = Math.min(100, t.meter + dmg * 0.5);
    if (a) {
      a.meter = Math.min(100, a.meter + dmg * 0.9);
      a.combo++; a.comboT = 60;
      if (a.combo === 3 || a.combo === 5) this.say(a, 'combo', 0.6); else this.say(a, 'taunt', 0.2);
    }
    this.say(t, 'hurt', 0.22);
    const heavy = dmg >= 12;
    this.hitstop = Math.max(this.hitstop, heavy ? 8 : 4);
    this.shake = Math.max(this.shake, heavy ? 7 : 3);
    this.fx.burst(t.x, t.cy - 10, heavy ? '#ffe27a' : '#ffffff', heavy ? 14 : 7, heavy ? 4 : 3);
    this.fx.text(t.x + (this.rng() - 0.5) * 20, t.y - 115, `${Math.round(dmg)}`, heavy ? '#ffb347' : '#ffffff', heavy ? 20 : 15, 40);
    this.sfx(heavy ? 'hitHeavy' : 'hit');
    if (this.training && t.side === 1) { const st = this.trainStats; st.last = dmg; st.total += dmg; st.hits++; st.idle = 0; }
    if (t.hp <= 0 && this.training) t.hp = 1;
    else if (t.hp <= 0) this.knockout(t, false);
    else if (t.hp / t.maxHp < 0.3 && !t.lowSaid) { t.lowSaid = true; this.say(t, 'lowhp', 1, true); }
    return 'hit';
  }

  private knockout(t: Fighter, ringOut: boolean) {
    t.hp = 0; t.ringOut = ringOut; t.setState('ko'); t.atk = null; t.cast = null;
    if (!ringOut) { t.vy = Math.min(t.vy, -5); t.grounded = false; t.standing = null; }
  }

  // ------------------------------------------------------------ main step
  step(inputs: [Input, Input]) {
    this.fx.update();
    if (this.shake > 0) this.shake *= 0.85;
    if (this.sayCd > 0) this.sayCd--;
    if (this.hitstop > 0) { this.hitstop--; return; }
    this.t++; this.phaseT++;
    this.stage.update(this.t);
    for (const l of this.later_) l.t--;
    const due = this.later_.filter((l) => l.t <= 0);
    if (due.length) { this.later_ = this.later_.filter((l) => l.t > 0); due.forEach((l) => l.fn()); }

    if (this.phase === 'ko' && (this.phaseT & 1)) return; // slow-mo
    const canAct = this.phase === 'fight';
    for (const f of this.fighters) f.update(this, inputs[f.side], canAct);
    this.separate();

    if (this.phase === 'fight' || this.phase === 'ko') {
      this.processMelee();
      this.processProjectiles();
      this.processZones();
      this.processAssists();
      this.processHazards();
    }

    switch (this.phase) {
      case 'ready':
        if (this.phaseT >= (this.training ? 25 : 100)) { this.phase = 'fight'; this.phaseT = 0; this.banner = 'FIGHT!'; this.sfx('fight'); }
        break;
      case 'fight': {
        if (this.training) { this.stepTraining(); break; }
        this.timer--;
        for (const f of this.fighters) {
          if (f.state !== 'ko' && (f.x < BLAST.left || f.x > BLAST.right || f.y > BLAST.bottom || f.y < BLAST.top)) {
            this.knockout(f, true); this.fx.text(Math.max(110, Math.min(W - 110, f.x)), Math.max(60, Math.min(H - 40, f.y)), 'RING OUT!', '#ff6b6b', 22, 70); this.sfx('ko');
            this.later(30, () => { const w = this.foe(f); if (w.state !== 'ko') this.say(w, 'ringout', 1, true); });
          }
        }
        // quiet moment: somebody talks smack
        if (this.t % 300 === 0) this.say(this.fighters[this.rng() < 0.5 ? 0 : 1], 'taunt', 0.5);
        const [a, b] = this.fighters;
        if (a.state === 'ko' || b.state === 'ko') {
          this.endRound(a.state === 'ko' && b.state === 'ko' ? -1 : a.state === 'ko' ? 1 : 0);
        } else if (this.timer <= 0) {
          const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
          this.banner = 'TIME!';
          this.endRound(Math.abs(ra - rb) < 0.001 ? -1 : ra > rb ? 0 : 1, true);
        }
        break;
      }
      case 'ko':
        if (this.phaseT >= 80) { this.phase = 'roundEnd'; this.phaseT = 0; this.afterKo(); }
        break;
      case 'roundEnd':
        if (this.phaseT >= 150) {
          if (this.matchWinner >= 0) { this.phase = 'done'; this.phaseT = 0; }
          else this.startRound();
        }
        break;
    }
  }

  private stepTraining() {
    const [p, d] = this.fighters, top = this.stage.def.floor.top;
    if (this.trainInstantCd) { p.cd = [0, 0, 0]; p.meter = 100; p.dodgeCd = 0; }
    // dummy heals and resets its combo tally after a short quiet period
    const st = this.trainStats;
    if (++st.idle > 90) { d.hp = Math.min(d.maxHp, d.hp + 2); if (d.hp >= d.maxHp) { st.total = 0; st.hits = 0; d.patched = false; } }
    if (d.hp < 1) d.hp = 1;
    for (const f of this.fighters) {
      if (f.x < BLAST.left || f.x > BLAST.right || f.y > BLAST.bottom || f.y < BLAST.top) {
        f.reset(f.side === 0 ? 360 : 600, top, f.side === 0 ? 1 : -1); f.hp = f.maxHp; this.fx.text(f.x, f.y - 120, 'respawn', '#fff', 14);
      }
    }
  }

  /** Playground: put both fighters back at their start positions and clear effects. */
  resetTraining() {
    const top = this.stage.def.floor.top;
    this.fighters[0].reset(360, top, 1); this.fighters[1].reset(600, top, -1);
    this.projectiles = []; this.zones = []; this.assists = []; this.later_ = [];
    this.trainStats = { last: 0, total: 0, hits: 0, idle: 0 };
  }

  private endRound(winner: -1 | 0 | 1, timeout = false) {
    this.roundWinner = winner;
    if (winner >= 0) { const w = winner as 0 | 1; this.wins[w]++; if (this.wins[w] >= ROUNDS_TO_WIN) this.matchWinner = w; }
    if (!timeout) this.banner = winner < 0 ? 'DOUBLE KO' : (this.fighters[(1 - winner) as 0 | 1].ringOut ? 'RING OUT' : 'K.O.');
    this.phase = 'ko'; this.phaseT = 0;
    this.sfx('ko');
    if (timeout) { this.phase = 'ko'; }
  }

  private afterKo() {
    const w = this.roundWinner;
    if (w >= 0) {
      const win = this.fighters[w as 0 | 1], lose = this.fighters[(1 - w) as 0 | 1];
      win.setState('win'); win.atk = null; win.cast = null;
      this.banner = `${win.def.name} wins`;
      this.say(win, this.matchWinner >= 0 ? 'winMatch' : 'winRound', 1, true);
      this.later(50, () => this.say(lose, 'loseRound', 1, true));
    } else this.banner = 'DRAW';
  }

  private separate() {
    const [a, b] = this.fighters;
    if (a.state === 'ko' || b.state === 'ko') return;
    if (Math.abs(a.y - b.y) < 60) {
      const dx = b.x - a.x, min = FW * 0.85;
      if (Math.abs(dx) < min) {
        const push = (min - Math.abs(dx)) / 2, s = dx >= 0 ? 1 : -1;
        a.x -= s * push * 0.6; b.x += s * push * 0.6;
      }
    }
  }

  private processMelee() {
    for (const f of this.fighters) {
      const r = f.attackRect();
      if (!r || !f.atk || f.atk.hit) continue;
      const t = this.foe(f);
      if (overlap(r, t.rect)) {
        const d = f.atk.def;
        const res = this.hit(t, { attacker: f, dmg: d.dmg, kb: d.kb, dir: f.facing, stun: d.stun, src: 'melee' });
        if (res !== 'miss') f.atk.hit = true;
        if (res === 'miss' && t.st.counter <= 0 && t.invulnT <= 0) f.atk.hit = true;
      }
    }
  }

  private processProjectiles() {
    const solids = this.stage.plats.filter((p) => p.kind === 'solid');
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.age++;
      p.update?.(p, this);
      p.vy += p.gravity; p.x += p.vx; p.y += p.vy; p.rot += p.spin;
      if (--p.life <= 0) { p.kill(this); continue; }
      if (p.x < -250 || p.x > W + 250 || p.y > H + 300 || p.y < -400) { p.kill(this); continue; }
      const r = p.rect;
      if (p.solidDie && p.shape !== 'none') {
        const core = { x: p.x - 8, y: p.y - 8, w: 16, h: 16 };
        for (const s of solids) if (overlap(core, s)) { p.kill(this); break; }
        if (p.dead) continue;
      }
      // reflect
      for (const f of this.fighters) {
        if (f !== p.owner && f.st.reflect > 0 && overlap(r, { x: f.x - 45, y: f.y - 120, w: 90, h: 130 })) {
          p.owner = f; p.vx = -p.vx; p.vy = -p.vy * 0.5; p.hit.clear(); p.dmg *= 1.1;
          this.fx.ring(f.x, f.cy, 70, '#6aa5e8'); this.fx.text(f.x, f.y - 120, 'REFLECTED', '#6aa5e8', 12, 30); this.sfx('block');
          break;
        }
      }
      const t = this.foe(p.owner);
      if (!p.hit.has(t) && overlap(r, t.rect)) {
        const dir: 1 | -1 = p.vx >= 0 ? 1 : -1;
        const res = this.hit(t, { attacker: p.owner, dmg: p.dmg, kb: p.kb, dir, stun: p.stun, tag: p.tag, unblockable: p.unblockable, src: 'proj' });
        if (res !== 'miss' || t.invulnT <= 0) p.hit.add(t);
        if (res === 'hit') p.onHit?.(p, t, this);
        if (!p.pierce || res === 'blocked') { if (res !== 'miss' || t.invulnT <= 0) p.kill(this); }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private processZones() {
    for (const z of this.zones) {
      z.t++;
      const o = z.o, t = this.foe(o.owner), r = z.rect;
      const dir: 1 | -1 = t.x >= o.x ? 1 : -1;
      const spec = (): HitSpec => ({ attacker: o.owner, dmg: o.dmg, kb: o.kb, dir, stun: o.stun, tag: o.tag, unblockable: true, src: 'zone' });
      if (o.mode === 'burst') {
        if (z.t === o.delay) {
          this.fx.burst(o.x, o.y - o.h / 2, o.color, 24, 5); this.fx.ring(o.x, o.y - o.h / 2, o.w * 0.8, o.color, 20); this.shake = Math.max(this.shake, 6); this.sfx('boom');
          if (overlap(r, t.rect)) this.hit(t, spec());
        }
        if (z.t >= o.delay + 14) z.dead = true;
      } else if (z.t >= o.delay) {
        if (z.t >= o.delay + (o.life ?? 120)) z.dead = true;
        else if (++z.tickT >= (o.tick ?? 30) && overlap(r, t.rect)) { z.tickT = 0; this.hit(t, spec()); }
      }
    }
    this.zones = this.zones.filter((z) => !z.dead);
  }

  private processAssists() {
    for (const a of this.assists) {
      a.t++;
      if (a.bubble && ++a.bubble.t > a.bubble.life) a.bubble = null;
      const foe = this.foe(a.owner);
      const floor = this.stage.def.floor;
      // phases: run in (0-40), 2 attacks, run out
      if (a.t < 40) {
        a.facing = foe.x >= a.x ? 1 : -1;
        const target = foe.x - a.facing * 60;
        a.x += Math.sign(target - a.x) * Math.min(Math.abs(target - a.x), 10);
        if (Math.abs(target - a.x) < 4 && a.atkT < 0) { a.t = 40; }
      } else if (a.hitsDone < 2) {
        if (a.atkT < 0) { a.atkT = 0; a.atkHit = false; a.facing = foe.x >= a.x ? 1 : -1; }
        a.atkT++;
        if (a.atkT >= 10 && a.atkT < 16 && !a.atkHit) {
          const hb: Rect = { x: a.facing > 0 ? a.x : a.x - 110, y: a.y - 220, w: 110, h: 230 };
          if (overlap(hb, foe.rect)) {
            const res = this.hit(foe, { attacker: a.owner, dmg: 12, kb: [8, -7], dir: a.facing, stun: 22, src: 'assist', tag: 'assist' });
            if (res !== 'miss') a.atkHit = true;
          }
        }
        if (a.atkT >= 30) { a.hitsDone++; a.atkT = -1; a.facing = foe.x >= a.x ? 1 : -1; a.x += (foe.x - a.x) * 0.3; }
      } else {
        a.facing = a.x < W / 2 ? -1 : 1;
        a.x += a.facing * 11;
        if (a.x < -80 || a.x > W + 80) a.dead = true;
      }
      a.y = floor.top;
    }
    this.assists = this.assists.filter((a) => !a.dead);
  }

  private processHazards() {
    for (const hs of this.stage.hazards) {
      if (hs.phase !== 'active') continue;
      const d = hs.def;
      const r: Rect = { x: hs.x, y: d.y, w: d.w, h: d.h };
      for (const f of this.fighters) {
        if (f.state === 'ko' || f.hazCd > 0 || !overlap(r, f.rect)) continue;
        f.hazCd = 45;
        const dir: 1 | -1 = f.x >= hs.x + d.w / 2 ? 1 : -1;
        this.hit(f, { attacker: null, dmg: d.dmg, kb: [4, -8], dir, stun: 22, unblockable: true, src: 'hazard' });
      }
    }
  }
}

export { FW as FIGHTER_W, FH as FIGHTER_H };
