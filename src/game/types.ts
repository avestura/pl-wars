export type CharId =
  | 'javascript' | 'typescript' | 'python' | 'go' | 'rust'
  | 'haskell' | 'fsharp' | 'csharp' | 'c' | 'cpp' | 'nirvana';
export type HelperId = CharId | 'ocaml';

export const ACTIONS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'block', 'dodge', 's1', 's2', 's3'] as const;
export type Action = (typeof ACTIONS)[number];
export type Input = Record<Action, boolean>;

export const emptyInput = (): Input => ({
  left: false, right: false, up: false, down: false, light: false, heavy: false,
  block: false, dodge: false, s1: false, s2: false, s3: false,
});

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Rect { x: number; y: number; w: number; h: number }
export const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export type Rng = () => number;
