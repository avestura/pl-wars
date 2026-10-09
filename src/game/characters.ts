import type { CharId, HelperId } from './types';

export interface AbilityInfo {
  name: string;
  desc: string;
  /** cooldown in frames */
  cd: number;
  /** meter cost (0-100) */
  cost: number;
  /** total cast animation frames */
  cast: number;
  /** frame in the cast at which the effect fires */
  fireAt: number;
  /** hold-to-charge ability: max charge frames */
  charge?: number;
}

export interface CharDef {
  id: CharId;
  name: string;
  tag: string;
  color: string;
  accent: string;
  tagline: string;
  hp: number;
  speed: number;
  jump: number;
  weight: number;
  /** outgoing damage multiplier */
  dmg: number;
  /** melee reach multiplier */
  reach: number;
  abilities: [AbilityInfo, AbilityInfo, AbilityInfo];
  passive?: string;
}

const A = (name: string, desc: string, cd: number, cost = 0, cast = 20, fireAt = 10, charge?: number): AbilityInfo =>
  ({ name, desc, cd, cost, cast, fireAt, charge });

export const CHARACTERS: Record<CharId, CharDef> = {
  javascript: {
    id: 'javascript', name: 'JavaScript', tag: 'JS', color: '#f7df1e', accent: '#1a1a1a',
    tagline: 'Everything is an object. Even your hopes.',
    hp: 108, speed: 3.9, jump: 13.2, weight: 0.95, dmg: 1.0, reach: 1.0,
    abilities: [
      A('NaN Bomb', 'Throws NaN. Damage is... unpredictable.', 150),
      A('Callback Hell', 'Three nested callbacks fire one after another.', 300, 0, 24, 6),
      A('Type Coercion', '0 == "0". Swap places and scramble enemy controls.', 480, 50, 20, 8),
    ],
  },
  typescript: {
    id: 'typescript', name: 'TypeScript', tag: 'TS', color: '#3178c6', accent: '#ffffff',
    tagline: 'JavaScript, but it tells you what you did wrong.',
    hp: 100, speed: 3.6, jump: 13.0, weight: 1.0, dmg: 1.0, reach: 1.0,
    abilities: [
      A('Type Check', 'Typed projectile. Hits JavaScript extra hard.', 140),
      A('Interface Shield', 'Reflects projectiles back at the sender.', 420, 0, 18, 6),
      A('Compile Error', 'Squiggly beam. Silences enemy abilities.', 480, 50),
    ],
  },
  python: {
    id: 'python', name: 'Python', tag: 'PY', color: '#3776ab', accent: '#ffd43b',
    tagline: 'Readability counts. So does a massive import.',
    hp: 100, speed: 3.4, jump: 13.0, weight: 1.0, dmg: 1.0, reach: 1.0,
    abilities: [
      A('Import Barrage', 'Throws numpy, pandas and friends.', 160, 0, 24, 6),
      A('Power Charge', 'Hold to charge `pass`; release to import torch.', 240, 0, 16, 6, 80),
      A('GIL Lock', 'Locks the enemy in place. One thread at a time.', 480, 50, 20, 8),
    ],
  },
  go: {
    id: 'go', name: 'Go', tag: 'GO', color: '#00add8', accent: '#ffffff',
    tagline: 'Simple. Concurrent. Slightly smug about it.',
    hp: 105, speed: 3.7, jump: 13.0, weight: 1.05, dmg: 1.0, reach: 1.0,
    abilities: [
      A('go func()', 'Spawns three goroutines at the enemy.', 130, 0, 22, 8),
      A('Defer Shield', 'A circle of defense blocks everything.', 420, 0, 18, 6),
      A('Goroutine Swarm', 'Rains a swarm of goroutines.', 480, 50, 24, 10),
    ],
  },
  rust: {
    id: 'rust', name: 'Rust', tag: 'RS', color: '#e8501a', accent: '#ffb089',
    tagline: 'Fearless. Borrowed. Mildly insufferable.',
    hp: 110, speed: 3.3, jump: 12.6, weight: 1.15, dmg: 1.0, reach: 1.0,
    abilities: [
      A('Borrow Checker', 'Yanks the enemy toward you. Strong vs C/C++.', 160),
      A('unsafe { }', 'Berserk: more damage dealt, more damage taken.', 420, 0, 18, 6),
      A('Move Semantics', 'Lunges and moves the enemy. Armored.', 480, 50, 20, 8),
    ],
  },
  haskell: {
    id: 'haskell', name: 'Haskell', tag: 'HS', color: '#5e5086', accent: '#c7b6ff',
    tagline: 'Pure. Lazy. Will explain monads unprompted.',
    hp: 90, speed: 3.2, jump: 12.8, weight: 0.9, dmg: 1.1, reach: 1.0,
    abilities: [
      A('Lambda Throw', 'Throws a lambda. Weak vs functional languages.', 120),
      A('Lazy Evaluation', 'Plants a thunk at the enemy that explodes later.', 330, 0, 22, 10),
      A('Curried Barrage', 'Five curried lambdas in a fan.', 480, 50, 24, 10),
    ],
  },
  fsharp: {
    id: 'fsharp', name: 'F#', tag: 'F#', color: '#378bba', accent: '#30b9db',
    tagline: 'Functional-first. Reluctantly shares a runtime.',
    hp: 108, speed: 3.7, jump: 13.0, weight: 0.95, dmg: 1.05, reach: 1.0,
    abilities: [
      A('Pipeline |>', 'Accelerating pipe projectile.', 130),
      A('Pattern Match', 'Counter stance: punishes any hit with a riposte.', 330, 0, 18, 6),
      A('Call for Help', 'Summons C# (or OCaml if facing C#).', 600, 50, 22, 10),
    ],
  },
  csharp: {
    id: 'csharp', name: 'C#', tag: 'C#', color: '#9b4f96', accent: '#ffd700',
    tagline: 'Has every feature. Yes, including yours.',
    hp: 112, speed: 3.5, jump: 13.0, weight: 1.05, dmg: 1.05, reach: 1.0,
    abilities: [
      A('LINQ Query', 'Piercing .Where().Select() chain.', 140),
      A('async / await', 'Faster movement and dodge for a while.', 330, 0, 18, 6),
      A('Call for Help', 'Summons F# (or C++ if facing F#).', 600, 50, 22, 10),
    ],
  },
  c: {
    id: 'c', name: 'C', tag: 'C', color: '#a8b9cc', accent: '#1d2a3b',
    tagline: 'Trust the programmer. Regret it later.',
    hp: 100, speed: 3.6, jump: 12.8, weight: 1.05, dmg: 1.0, reach: 1.05,
    abilities: [
      A('malloc()', 'Lobbed memory block that leaks, damaging over time.', 180),
      A('ptr++', 'Pointer arithmetic blink-strike.', 220, 0, 16, 6),
      A('Buffer Overflow', 'Huge piercing wave. Rust shrugs it off.', 480, 50, 26, 12),
    ],
  },
  cpp: {
    id: 'cpp', name: 'C++', tag: 'C++', color: '#00599c', accent: '#9cc2e8',
    tagline: 'C, but with eleven more ways to hurt yourself.',
    hp: 108, speed: 3.1, jump: 12.4, weight: 1.15, dmg: 1.0, reach: 1.05,
    abilities: [
      A('template<T>', 'Projectile that instantiates into three.', 150),
      A('Dangling Pointer', 'Boomerang pointer. Hits twice, if you are lucky.', 330),
      A('Undefined Behavior', 'Anything can happen. Literally.', 480, 50, 24, 10),
    ],
  },
  nirvana: {
    id: 'nirvana', name: 'Nirvana', tag: 'NV', color: '#ffd86b', accent: '#c9b6ff',
    tagline: 'The language that compiles before you write it.',
    hp: 140, speed: 3.9, jump: 13.6, weight: 1.15, dmg: 1.2, reach: 1.15,
    passive: 'Auto-patch: ignores the first hit each round. Slowly self-heals.',
    abilities: [
      A('Refactor', 'Homing volley borrowing every language.', 110),
      A('Zero Bugs', 'Heals, purges debuffs, briefly invulnerable.', 420, 0, 18, 6),
      A('rm -rf enemy/', "Deletes the enemy's code. Telegraphed.", 420, 40, 26, 12),
    ],
  },
};

export const HELPER_NAMES: Record<HelperId, string> = {
  ...(Object.fromEntries(Object.values(CHARACTERS).map((c) => [c.id, c.name])) as Record<CharId, string>),
  ocaml: 'OCaml',
};

export const ROSTER_IDS = Object.keys(CHARACTERS) as CharId[];
