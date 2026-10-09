import type { Fighter, Match, ProjOpts } from './match';
import type { CharId, HelperId } from './types';
import { H, W } from '../config';

export type AbilityFn = (f: Fighter, m: Match, power: number) => void;

/**
 * Matchup modifiers: damage multiplier for ability `tag` thrown by `attacker` at `target`.
 * This is where "F# takes less from lambdas" and similar jokes live.
 */
export function matchupMod(attacker: CharId, target: CharId, tag?: string): number {
  if (!tag) return 1;
  switch (tag) {
    case 'lambda': return target === 'fsharp' ? 0.4 : target === 'nirvana' ? 0.6 : 1;
    case 'types': return target === 'javascript' ? 1.5 : 1;
    case 'borrow': return target === 'c' || target === 'cpp' ? 1.25 : 1;
    case 'memunsafe': return target === 'rust' ? 0.5 : target === 'go' ? 0.75 : 1;
    default: return attacker === target ? 1 : 1;
  }
}

/** Which helper a summoner calls, given who they are fighting. */
export function helperFor(owner: CharId, foe: CharId): HelperId {
  if (owner === 'fsharp') return foe === 'csharp' ? 'ocaml' : 'csharp';
  if (owner === 'csharp') return foe === 'fsharp' ? 'cpp' : 'fsharp';
  return 'csharp';
}

const mz = (f: Fighter) => ({ x: f.x + f.facing * 34, y: f.y - 68 });
const rnd = (m: Match, a: number, b: number) => a + m.rng() * (b - a);

interface Shot extends Partial<ProjOpts> { speed?: number; dy?: number; ang?: number; label: string; color: string; dmg: number }
/** Fire a projectile forward from the fighter's hands. */
function shoot(f: Fighter, m: Match, s: Shot) {
  const p = mz(f), ang = s.ang ?? 0, sp = s.speed ?? 9;
  return m.spawnProjectile({
    owner: f, x: p.x, y: p.y + (s.dy ?? 0), vx: f.facing * Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    w: 44, h: 26, kb: [3.5, -2.5], stun: 16, ...s,
  } as ProjOpts);
}

const foeOf = (f: Fighter, m: Match) => m.foe(f);

export const ABILITIES: Record<CharId, [AbilityFn, AbilityFn, AbilityFn]> = {
  // ---------------------------------------------------------------- JavaScript
  javascript: [
    (f, m) => {
      const dmg = Math.round(rnd(m, 4, 15));
      shoot(f, m, { label: 'NaN', color: '#f7df1e', dmg, speed: 9, w: 50, h: 30, spin: 0.05, kb: [3 + dmg * 0.3, -2.5], tag: 'nan' });
      m.fx.text(f.x, f.y - 125, dmg > 11 ? 'NaN!!' : 'NaN', '#f7df1e', 12, 30);
    },
    (f, m) => {
      for (let i = 0; i < 3; i++) m.later(i * 14, () => {
        if (f.state === 'ko') return;
        shoot(f, m, { label: i === 2 ? 'cb(' + ')'.repeat(3) : 'cb(', color: '#f7df1e', dmg: 6, speed: 8 + i, dy: -i * 6, w: 54, h: 26, gravity: 0.02, kb: [3, -3] });
        m.sfx('special');
      });
    },
    (f, m) => {
      const t = foeOf(f, m);
      [f.x, t.x] = [t.x, f.x]; [f.y, t.y] = [t.y, f.y]; f.vx = f.vy = t.vx = t.vy = 0;
      f.standing = t.standing = null; f.grounded = t.grounded = false;
      const dur = t.id === 'typescript' ? 60 : t.id === 'nirvana' ? 40 : 160;
      t.st.confuse = dur;
      m.fx.text(f.x, f.y - 130, '0 == "0"', '#f7df1e', 16, 60);
      m.fx.text(t.x, t.y - 130, t.id === 'typescript' ? 'type-safe!' : 'true', '#fff', 14, 60);
      m.fx.burst(t.x, t.cy, '#f7df1e', 14, 4); m.fx.burst(f.x, f.cy, '#f7df1e', 14, 4);
      m.hit(t, { attacker: f, dmg: 6, kb: [1, -3], dir: f.facing, stun: 14, unblockable: true, src: 'proj', tag: 'coerce' });
    },
  ],
  // ---------------------------------------------------------------- TypeScript
  typescript: [
    (f, m) => {
      const types = [': string', ': number', ': boolean'];
      shoot(f, m, { label: types[(m.rng() * 3) | 0], color: '#3178c6', fg: '#fff', dmg: 9, speed: 10.5, w: 66, h: 26, tag: 'types', kb: [4, -3] });
    },
    (f, m) => { f.st.reflect = 150; m.fx.ring(f.x, f.cy, 90, '#6aa5e8', 24); m.fx.text(f.x, f.y - 130, 'interface Shield', '#6aa5e8', 13, 50); },
    (f, m) => {
      shoot(f, m, {
        label: 'error TS2322', color: '#e23d3d', fg: '#fff', dmg: 12, speed: 11.5, w: 100, h: 30, kb: [5, -3], tag: 'types',
        onHit: (_p, t) => { t.st.silence = 240; m.fx.text(t.x, t.y - 130, 'abilities locked', '#ff6b6b', 13, 70); },
      });
    },
  ],
  // ---------------------------------------------------------------- Python
  python: [
    (f, m) => {
      const libs = ['numpy', 'pandas', 'scipy', 'sklearn', 'seaborn', 'flask'];
      for (let i = 0; i < 3; i++) m.later(i * 8, () => {
        if (f.state === 'ko') return;
        shoot(f, m, { label: libs[(m.rng() * libs.length) | 0], color: i % 2 ? '#ffd43b' : '#3776ab', fg: i % 2 ? '#111' : '#fff', dmg: 6, speed: 9 + i * 0.8, dy: (i - 1) * 14, w: 62, h: 24, kb: [3, -2] });
        m.sfx('special');
      });
    },
    (f, m, power) => {
      const sz = 0.5 + power;
      shoot(f, m, {
        label: 'import torch', color: '#ee4c2c', fg: '#fff', dmg: 8 + 22 * power, speed: 8 + power * 3, w: 80 * sz + 30, h: 36 * sz + 10,
        kb: [4 + power * 8, -2 - power * 5], stun: 14 + power * 14, pierce: power > 0.9, life: 200,
      });
      m.fx.text(f.x, f.y - 125, power > 0.9 ? 'FULLY CHARGED' : 'import', '#ffd43b', 13, 40);
    },
    (f, m) => {
      const t = foeOf(f, m);
      t.st.root = 110;
      m.fx.ring(t.x, t.cy, 80, '#ffd43b', 24); m.fx.text(t.x, t.y - 130, 'GIL locked', '#ffd43b', 15, 70);
      m.hit(t, { attacker: f, dmg: 6, kb: [0, 0], dir: f.facing, stun: 10, unblockable: true, src: 'proj', tag: 'gil' });
    },
  ],
  // ---------------------------------------------------------------- Go
  go: [
    (f, m) => {
      for (let i = -1; i <= 1; i++) shoot(f, m, { label: 'go', color: '#00add8', fg: '#fff', dmg: 4.5, speed: 11, ang: i * 0.12, w: 34, h: 22, kb: [2.5, -2], stun: 12, life: 140 });
    },
    (f, m) => { f.st.shield = 180; m.fx.ring(f.x, f.cy, 90, '#7fe3f5', 24); m.fx.text(f.x, f.y - 135, 'defer shield', '#7fe3f5', 13, 50); },
    (f, m) => {
      const t = foeOf(f, m);
      for (let i = 0; i < 10; i++) m.later(i * 5, () => {
        if (f.state === 'ko') return;
        const x = Math.max(40, Math.min(W - 40, t.x + rnd(m, -240, 240)));
        m.spawnProjectile({ owner: f, x, y: -30, vx: rnd(m, -0.6, 0.6), vy: 4, gravity: 0.35, w: 36, h: 24, dmg: 6, kb: [1.5, -3], stun: 14, label: 'go', color: '#00add8', fg: '#fff', life: 140 });
      });
    },
  ],
  // ---------------------------------------------------------------- Rust
  rust: [
    (f, m) => {
      shoot(f, m, {
        label: '&mut', color: '#e8501a', fg: '#fff', dmg: 5, speed: 12, w: 54, h: 26, kb: [0.5, -1], stun: 20, tag: 'borrow',
        onHit: (p, t) => { t.vx = -p.vx * 0.8; t.vy = -2; m.fx.text(t.x, t.y - 130, 'borrowed', '#ffb089', 13, 40); },
      });
    },
    (f, m) => { f.st.rage = 300; m.fx.burst(f.x, f.cy, '#ff5533', 20, 5); m.fx.text(f.x, f.y - 130, 'unsafe { }', '#ff5533', 15, 60); },
    (f, m) => {
      f.st.armor = 24; f.dashT = 18; f.dashVx = f.facing * 13;
      m.spawnProjectile({
        owner: f, x: f.x, y: f.y - 55, vx: 0, vy: 0, w: 90, h: 90, dmg: 22, kb: [9, -9], stun: 30, label: 'move', color: '#e8501a', shape: 'none', life: 18, pierce: false, solidDie: false,
        update: (p) => { p.x = f.x + f.facing * 45; p.y = f.y - 55; },
        onHit: (_p, t) => { m.fx.text(t.x, t.y - 130, 'value moved', '#ffb089', 14, 50); },
      });
      m.fx.text(f.x, f.y - 130, 'Move Semantics', '#ffb089', 13, 40);
    },
  ],
  // ---------------------------------------------------------------- Haskell
  haskell: [
    (f, m) => {
      shoot(f, m, { label: 'λ', color: '#8f4e8b', fg: '#fff', dmg: 11, speed: 9.5, w: 36, h: 36, spin: 0.25, tag: 'lambda', kb: [4, -3], shape: 'orb' });
    },
    (f, m) => {
      const t = foeOf(f, m);
      m.spawnZone({ owner: f, x: t.x, y: t.y, w: 120, h: 150, mode: 'burst', delay: 75, dmg: 14, kb: [6, -9], stun: 26, label: 'thunk', color: '#8f4e8b', tag: 'thunk' });
      m.fx.text(t.x, t.y - 130, '<<thunk>>', '#c7b6ff', 13, 60);
    },
    (f, m) => {
      for (let i = -2; i <= 2; i++) shoot(f, m, { label: 'λ', color: '#8f4e8b', fg: '#fff', dmg: 9, speed: 10, ang: i * 0.14, w: 32, h: 32, spin: 0.3, tag: 'lambda', kb: [4, -3], shape: 'orb', life: 130 });
    },
  ],
  // ---------------------------------------------------------------- F#
  fsharp: [
    (f, m) => {
      shoot(f, m, { label: '|>', color: '#30b9db', dmg: 9, speed: 5, w: 44, h: 26, kb: [4, -3], update: (p) => { p.vx *= 1.045; } });
    },
    (f, m) => { f.st.counter = 70; m.fx.ring(f.x, f.cy, 70, '#30b9db', 22); m.fx.text(f.x, f.y - 130, 'match … with', '#30b9db', 13, 60); },
    (f, m) => { m.spawnAssist(f, helperFor('fsharp', foeOf(f, m).id)); },
  ],
  // ---------------------------------------------------------------- C#
  csharp: [
    (f, m) => {
      shoot(f, m, { label: '.Where()', color: '#9b4f96', fg: '#fff', dmg: 8, speed: 9, w: 78, h: 26, pierce: true, kb: [3, -3], life: 110 });
    },
    (f, m) => { f.st.speed = 240; f.dodgeCd = 0; m.fx.burst(f.x, f.cy, '#ffd700', 14, 4); m.fx.text(f.x, f.y - 130, 'await Task.Run', '#ffd700', 13, 50); },
    (f, m) => { m.spawnAssist(f, helperFor('csharp', foeOf(f, m).id)); },
  ],
  // ---------------------------------------------------------------- C
  c: [
    (f, m) => {
      const p = mz(f);
      m.spawnProjectile({
        owner: f, x: p.x, y: p.y, vx: f.facing * 7, vy: -9, gravity: 0.5, w: 56, h: 30, dmg: 8, kb: [3, -4], stun: 16, label: 'malloc', color: '#a8b9cc', life: 120,
        onDie: (pr) => {
          m.spawnZone({ owner: f, x: pr.x, y: Math.min(pr.y + 20, m.stage.def.floor.top), w: 110, h: 50, mode: 'dot', delay: 0, life: 200, tick: 30, dmg: 3, kb: [0.5, -2], stun: 8, label: 'leak', color: '#6fbf73' });
        },
      });
    },
    (f, m) => {
      const from = f.x;
      f.x = Math.max(30, Math.min(W - 30, f.x + f.facing * 170));
      m.fx.burst(from, f.cy, '#a8b9cc', 10, 3); m.fx.burst(f.x, f.cy, '#a8b9cc', 10, 3); m.fx.text(f.x, f.y - 130, 'ptr++', '#c3d0de', 14, 40);
      m.spawnProjectile({ owner: f, x: f.x + f.facing * 30, y: f.y - 55, vx: 0, vy: 0, w: 100, h: 100, dmg: 10, kb: [6, -5], stun: 18, label: '', color: '#fff', shape: 'none', life: 7, solidDie: false });
    },
    (f, m) => {
      shoot(f, m, { label: 'AAAAAAAAAAAA', color: '#a8b9cc', dmg: 22, speed: 12, w: 170, h: 90, pierce: true, kb: [12, -7], stun: 30, tag: 'memunsafe', life: 90, shape: 'wave' });
      m.shake = 8;
    },
  ],
  // ---------------------------------------------------------------- C++
  cpp: [
    (f, m) => {
      shoot(f, m, {
        label: '<T>', color: '#659ad2', dmg: 6, speed: 8, w: 48, h: 28, kb: [3, -2],
        update: (p) => {
          if (p.age === 18 && !p.data.split) {
            p.data.split = 1;
            ['int', 'float', 'char'].forEach((lbl, i) => m.spawnProjectile({ owner: p.owner, x: p.x, y: p.y, vx: p.vx * 1.1, vy: (i - 1) * 2.6, w: 40, h: 24, dmg: 6, kb: [3, -2], stun: 14, label: lbl, color: '#9cc2e8', life: 80 }));
          }
        },
      });
    },
    (f, m) => {
      shoot(f, m, {
        label: '*ptr', color: '#00599c', fg: '#fff', dmg: 9, speed: 10, w: 52, h: 28, kb: [4, -3], pierce: true, life: 140, solidDie: false,
        update: (p) => {
          if (p.age === 36) { p.vx = -p.vx * 0.9; p.hit.clear(); p.data.back = 1; }
          if (p.data.back) { const dx = f.x - p.x; p.vx += Math.sign(dx) * 0.4; if (Math.abs(dx) < 30) p.life = 0; }
        },
      });
    },
    (f, m) => {
      const r = m.rng();
      m.fx.text(f.x, f.y - 135, 'undefined behavior', '#9cc2e8', 14, 60);
      if (r < 0.4) shoot(f, m, { label: 'UB', color: '#ff4fd8', fg: '#fff', dmg: 28, speed: 11, w: 130, h: 80, pierce: true, kb: [12, -8], stun: 30, shape: 'wave', life: 90 });
      else if (r < 0.6) {
        m.spawnZone({ owner: f, x: f.x, y: f.y, w: 220, h: 160, mode: 'burst', delay: 12, dmg: 14, kb: [8, -8], stun: 24, label: 'segfault', color: '#ff6b6b' });
        f.hp = Math.max(1, f.hp - 10); m.fx.text(f.x, f.y - 110, '-10 (self)', '#ff6b6b', 13, 50);
      } else if (r < 0.8) m.heal(f, 22);
      else for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        m.spawnProjectile({ owner: f, x: f.x, y: f.y - 60, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, w: 70, h: 24, dmg: 8, kb: [4, -3], stun: 14, label: '0xDEADBEEF', color: '#9cc2e8', life: 70 });
      }
    },
  ],
  // ---------------------------------------------------------------- Nirvana
  nirvana: [
    (f, m) => {
      const labels: [string, string, string, string?][] = [['λ', '#8f4e8b', '#fff', 'lambda'], ['go', '#00add8', '#fff'], ['import', '#3776ab', '#fff']];
      labels.forEach(([label, color, fg, tag], i) => shoot(f, m, {
        label, color, fg, dmg: 7, speed: 8, ang: (i - 1) * 0.35, w: 46, h: 28, tag, kb: [3, -3], life: 150,
        update: (p) => {
          const t = foeOf(f, m); const dx = t.x - p.x, dy = t.cy - p.y; const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 0.35; p.vy += (dy / d) * 0.35;
          const s = Math.hypot(p.vx, p.vy); if (s > 9) { p.vx *= 9 / s; p.vy *= 9 / s; }
        },
      }));
    },
    (f, m) => {
      m.heal(f, 22); f.st.confuse = f.st.root = f.st.silence = 0; f.st.invuln = 36;
      m.fx.ring(f.x, f.cy, 110, '#fff', 26); m.fx.text(f.x, f.y - 135, 'zero bugs', '#ffd86b', 15, 60);
    },
    (f, m) => {
      const t = foeOf(f, m);
      m.spawnZone({ owner: f, x: t.x, y: H, w: 90, h: H + 40, mode: 'burst', delay: 55, dmg: 35, kb: [4, -12], stun: 34, label: 'rm -rf', color: '#ffd86b' });
      m.fx.text(t.x, t.y - 140, 'rm -rf enemy/', '#ffd86b', 16, 70);
    },
  ],
};
