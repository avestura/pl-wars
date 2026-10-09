import type { Fighter, Match } from './match';
import { emptyInput, type Difficulty, type Input, type Rng } from './types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Base skill 0..1 from the chosen difficulty, nudged up as the arcade ladder progresses. */
export function skillFor(diff: Difficulty, ladderIndex = 0, ladderLength = 10, isNirvana = false): number {
  const base = diff === 'easy' ? 0.18 : diff === 'normal' ? 0.5 : 0.8;
  const ramp = ladderLength > 1 ? (ladderIndex / (ladderLength - 1)) * 0.2 : 0;
  return Math.min(1, base + ramp + (isNirvana ? 0.1 : 0));
}

type Role = 'ranged' | 'defense' | 'buff' | 'heal' | 'close' | 'charge' | 'ult';
const ROLES: Record<string, [Role, Role, Role]> = {
  javascript: ['ranged', 'ranged', 'ult'],
  typescript: ['ranged', 'defense', 'ult'],
  python: ['ranged', 'charge', 'ult'],
  go: ['ranged', 'defense', 'ult'],
  rust: ['ranged', 'buff', 'ult'],
  haskell: ['ranged', 'ranged', 'ult'],
  fsharp: ['ranged', 'defense', 'ult'],
  csharp: ['ranged', 'buff', 'ult'],
  c: ['ranged', 'close', 'ult'],
  cpp: ['ranged', 'ranged', 'ult'],
  nirvana: ['ranged', 'heal', 'ult'],
};

export class AIController {
  private inp: Input = emptyInput();
  private timer = 0;
  private blockT = 0;
  private holdKey: 's1' | 's2' | 's3' | null = null;
  private holdT = 0;
  private recovering = false;
  private upPrev = false;
  constructor(public skill: number, private rng: Rng) {}

  update(m: Match, me: Fighter): Input {
    const i = this.inp;
    // one-frame pulses
    i.light = i.heavy = i.dodge = i.up = i.s1 = i.s2 = i.s3 = false;
    if (this.holdT > 0 && this.holdKey) { this.holdT--; i[this.holdKey] = true; } else if (this.holdKey) { i[this.holdKey] = false; this.holdKey = null; }
    if (this.blockT > 0) { this.blockT--; i.block = true; } else i.block = false;

    if (m.phase !== 'fight') { i.left = i.right = i.down = false; return i; }
    if (--this.timer <= 0) {
      this.think(m, me, m.foe(me));
      const react = lerp(22, 4, this.skill);
      this.timer = this.recovering ? 1 : Math.max(2, Math.round(react * (0.7 + this.rng() * 0.6)));
    }
    this.upPrev = i.up;
    return i;
  }

  private think(m: Match, me: Fighter, foe: Fighter) {
    this.recovering = false;
    this.think0(m, me, foe);
    // never walk off the main platform on purpose
    const floor = m.stage.def.floor, i = this.inp;
    if (me.grounded && me.standing === m.stage.plats[0] && !me.st.confuse) {
      if (me.x < floor.left + 28 && i.left) i.left = false;
      if (me.x > floor.right - 28 && i.right) i.right = false;
    }
    if (me.y > floor.top + 20 || me.x < floor.left - 10 || me.x > floor.right + 10) this.recovering = true;
  }

  private think0(m: Match, me: Fighter, foe: Fighter) {
    const i = this.inp, s = this.skill, rng = this.rng;
    const floor = m.stage.def.floor;
    const dx = foe.x - me.x, dist = Math.abs(dx), toward = dx >= 0 ? 1 : -1;
    const setDir = (d: number) => { i.left = d < 0; i.right = d > 0; };
    i.down = false;

    // ---- recovery when off the stage
    const offStage = me.y > floor.top + 30 || me.x < floor.left - 10 || me.x > floor.right + 10;
    if (offStage && me.y > floor.top - 20) {
      setDir(((floor.left + floor.right) / 2 - me.x) > 0 ? 1 : -1);
      if (me.jumpsLeft > 0 && me.vy > -2 && !this.upPrev) i.up = true;
      return;
    }

    // ---- defence
    const foeAtk = foe.state === 'light' || foe.state === 'heavy' || (foe.state === 'special' && !!foe.cast?.fired === false);
    if (dist < 140 && foeAtk && me.grounded) {
      if (rng() < lerp(0.1, 0.65, s)) { this.blockT = 10 + ((rng() * 12) | 0); i.block = true; setDir(0); return; }
      if (rng() < lerp(0.03, 0.3, s) && me.dodgeCd <= 0) { i.dodge = true; return; }
    }
    for (const p of m.projectiles) {
      if (p.owner === me || p.hit.has(me)) continue;
      const near = Math.abs(p.x - me.x) < 260 && Math.sign(p.vx || 1) === Math.sign(me.x - p.x) && Math.abs(p.y - me.cy) < 90;
      if (near && me.grounded) {
        if (rng() < lerp(0.1, 0.7, s)) { this.blockT = 12; i.block = true; return; }
        if (rng() < lerp(0.05, 0.4, s)) { i.up = true; return; }
      }
    }

    // ---- abilities
    const roles = ROLES[me.id];
    if (me.st.silence <= 0 && rng() < lerp(0.35, 0.95, s)) {
      for (let slot = 2; slot >= 0; slot--) {
        if (!me.canCast(slot) || !me.actionable) continue;
        const role = roles[slot];
        let use = false;
        switch (role) {
          case 'ult': use = dist < 450; break;
          case 'ranged': use = dist > 130 && dist < 520; break;
          case 'defense': use = (dist < 200 && foeAtk) || (m.projectiles.some((p) => p.owner !== me && Math.abs(p.x - me.x) < 240)); break;
          case 'buff': use = dist < 320; break;
          case 'heal': use = me.hp / me.maxHp < 0.7; break;
          case 'close': use = dist > 140 && dist < 330; break;
          case 'charge': use = dist > 180; break;
        }
        if (use) {
          const k = (`s${slot + 1}`) as 's1' | 's2' | 's3';
          i[k] = true;
          if (role === 'charge') { this.holdKey = k; this.holdT = Math.round(lerp(10, 58, s) * (0.7 + rng() * 0.6)); }
          return;
        }
      }
    }

    // ---- positioning
    const vertical = me.cy - foe.cy;
    if (vertical > 90 && rng() < 0.55) {
      setDir(toward); if (me.grounded || me.jumpsLeft > 0) i.up = true; return;
    }
    if (vertical < -140 && me.standing && me.standing.kind === 'oneway' && rng() < 0.3) { i.down = true; }

    const reach = 78 * me.def.reach;
    if (dist > reach + 25) {
      // approach (sometimes hesitate at low skill)
      if (rng() < lerp(0.55, 0.95, s)) setDir(toward); else setDir(0);
      // keep away from edges on the ground
      if (me.grounded && me.standing === m.stage.plats[0]) {
        if (me.x < floor.left + 30 && toward < 0) setDir(0);
        if (me.x > floor.right - 30 && toward > 0) setDir(0);
      }
      if (dist > 380 && rng() < 0.1 && me.grounded) i.up = true;
    } else {
      setDir(0);
      // melee
      if (rng() < lerp(0.4, 0.9, s)) {
        if (rng() < 0.65) i.light = true; else i.heavy = true;
      } else if (rng() < 0.25) {
        setDir(-toward); // back off
      }
      if (me.atk?.hit && me.state === 'light') { i.light = rng() < 0.8; i.heavy = !i.light && rng() < 0.4; }
    }
  }
}
