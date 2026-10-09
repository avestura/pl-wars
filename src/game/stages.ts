import type { Rng } from './types';

export type StageId = 'vscode' | 'terminal' | 'stackoverflow' | 'k8s' | 'nirvana';

export interface Plat {
  x: number; y: number; w: number; h: number;
  kind: 'solid' | 'oneway';
  label?: string;
  mv?: { type: 'h' | 'v' | 'c'; amp: number; speed: number; phase: number };
  bx: number; by: number; // base position
  dx: number; dy: number; // movement this frame
}

export interface HazardDef {
  label: string;
  color: string;
  /** candidate x ranges (cycled through) or random placement in [min,max] */
  zones?: [number, number][];
  random?: [number, number];
  w: number;
  y: number;
  h: number;
  period: number;
  warn: number;
  active: number;
  offset: number;
  dmg: number;
}

export interface HazardState {
  def: HazardDef;
  x: number;
  phase: 'idle' | 'warn' | 'active';
  /** 0..1 progress through the current phase */
  p: number;
  cycle: number;
}

export interface StageDef {
  id: StageId;
  name: string;
  subtitle: string;
  secret?: boolean;
  floor: { left: number; right: number; top: number };
  plats: Omit<Plat, 'bx' | 'by' | 'dx' | 'dy'>[];
  hazards: HazardDef[];
}

const FLOOR_Y = 450;
const floorPlat = (l: number, r: number) =>
  ({ x: l, y: FLOOR_Y, w: r - l, h: 120, kind: 'solid' as const, label: 'floor' });

export const STAGES: Record<StageId, StageDef> = {
  vscode: {
    id: 'vscode', name: 'Visual Studio Code', subtitle: 'main.ts — Untitled (Workspace)',
    floor: { left: 140, right: 820, top: FLOOR_Y },
    plats: [
      floorPlat(140, 820),
      { x: 200, y: 330, w: 190, h: 14, kind: 'oneway', label: 'main.ts' },
      { x: 570, y: 330, w: 190, h: 14, kind: 'oneway', label: 'utils.ts' },
      { x: 400, y: 215, w: 160, h: 14, kind: 'oneway', label: 'IntelliSense', mv: { type: 'h', amp: 150, speed: 0.012, phase: 0 } },
      { x: 450, y: 385, w: 60, h: 65, kind: 'solid', label: 'folded {...}' },
    ],
    hazards: [{ label: 'error', color: '#f14c4c', zones: [[560, 790], [170, 400]], w: 230, y: FLOOR_Y - 50, h: 50, period: 480, warn: 70, active: 80, offset: 120, dmg: 8 }],
  },
  terminal: {
    id: 'terminal', name: 'Linux Terminal', subtitle: 'user@box:~$ sudo fight',
    floor: { left: 140, right: 820, top: FLOOR_Y },
    plats: [
      floorPlat(140, 820),
      { x: 210, y: 340, w: 170, h: 14, kind: 'oneway', label: 'ls -la' },
      { x: 580, y: 340, w: 170, h: 14, kind: 'oneway', label: 'cd ..' },
      { x: 420, y: 250, w: 120, h: 14, kind: 'oneway', label: 'top', mv: { type: 'v', amp: 70, speed: 0.015, phase: 0 } },
      { x: 300, y: 400, w: 50, h: 50, kind: 'solid', label: 'rm' },
      { x: 610, y: 400, w: 50, h: 50, kind: 'solid', label: 'mv' },
    ],
    hazards: [{ label: 'KERNEL PANIC', color: '#ff4fd8', random: [180, 780], w: 70, y: 0, h: FLOOR_Y, period: 420, warn: 75, active: 28, offset: 200, dmg: 12 }],
  },
  stackoverflow: {
    id: 'stackoverflow', name: 'Stack Overflow / GitHub', subtitle: 'Marked as duplicate',
    floor: { left: 140, right: 820, top: FLOOR_Y },
    plats: [
      floorPlat(140, 820),
      { x: 180, y: 350, w: 130, h: 14, kind: 'oneway', label: '▲ 1337' },
      { x: 650, y: 350, w: 130, h: 14, kind: 'oneway', label: '▲ 42' },
      { x: 440, y: 375, w: 80, h: 75, kind: 'solid', label: 'DUPLICATE' },
      { x: 300, y: 245, w: 130, h: 14, kind: 'oneway', label: '✔ accepted', mv: { type: 'h', amp: 180, speed: 0.01, phase: 1.2 } },
    ],
    hazards: [{ label: '<<<<<<< HEAD', color: '#f48024', zones: [[140, 480], [480, 820]], w: 340, y: FLOOR_Y - 45, h: 45, period: 540, warn: 80, active: 90, offset: 160, dmg: 9 }],
  },
  k8s: {
    id: 'k8s', name: 'Server Room / Kubernetes', subtitle: 'pod/fighter-0 CrashLoopBackOff',
    floor: { left: 140, right: 820, top: FLOOR_Y },
    plats: [
      floorPlat(140, 820),
      { x: 185, y: 365, w: 62, h: 85, kind: 'solid', label: 'rack-01' },
      { x: 713, y: 365, w: 62, h: 85, kind: 'solid', label: 'rack-02' },
      { x: 300, y: 310, w: 130, h: 14, kind: 'oneway', label: 'pod-a', mv: { type: 'h', amp: 60, speed: 0.014, phase: 0 } },
      { x: 530, y: 310, w: 130, h: 14, kind: 'oneway', label: 'pod-b', mv: { type: 'h', amp: 60, speed: 0.014, phase: Math.PI } },
      { x: 415, y: 200, w: 130, h: 14, kind: 'oneway', label: 'ingress', mv: { type: 'v', amp: 30, speed: 0.02, phase: 0 } },
    ],
    hazards: [
      { label: 'short circuit', color: '#4fd8ff', zones: [[400, 560]], w: 160, y: FLOOR_Y - 40, h: 40, period: 420, warn: 60, active: 60, offset: 100, dmg: 9 },
      { label: 'OOMKilled', color: '#ff5f5f', random: [200, 760], w: 60, y: 0, h: FLOOR_Y, period: 600, warn: 70, active: 26, offset: 330, dmg: 12 },
    ],
  },
  nirvana: {
    id: 'nirvana', name: 'The Void of Enlightenment', subtitle: 'Zero warnings. Zero errors.', secret: true,
    floor: { left: 230, right: 730, top: FLOOR_Y },
    plats: [
      floorPlat(230, 730),
      { x: 130, y: 330, w: 130, h: 14, kind: 'oneway', label: '', mv: { type: 'c', amp: 40, speed: 0.012, phase: 0 } },
      { x: 700, y: 330, w: 130, h: 14, kind: 'oneway', label: '', mv: { type: 'c', amp: 40, speed: 0.012, phase: Math.PI } },
      { x: 415, y: 230, w: 130, h: 14, kind: 'oneway', label: '', mv: { type: 'v', amp: 40, speed: 0.01, phase: 0 } },
    ],
    hazards: [],
  },
};

export const NORMAL_STAGES: StageId[] = ['vscode', 'terminal', 'stackoverflow', 'k8s'];

export class Stage {
  def: StageDef;
  plats: Plat[];
  hazards: HazardState[];
  t = 0;
  constructor(def: StageDef, private rng: Rng) {
    this.def = def;
    this.plats = def.plats.map((p) => ({ ...p, bx: p.x, by: p.y, dx: 0, dy: 0 }));
    this.hazards = def.hazards.map((h) => ({ def: h, x: 0, phase: 'idle', p: 0, cycle: -1 }));
    this.update(0);
    for (const p of this.plats) { p.dx = 0; p.dy = 0; }
  }

  update(t: number) {
    this.t = t;
    for (const p of this.plats) {
      if (!p.mv) continue;
      const a = t * p.mv.speed + p.mv.phase;
      const nx = p.mv.type === 'h' ? p.bx + Math.sin(a) * p.mv.amp : p.mv.type === 'c' ? p.bx + Math.cos(a) * p.mv.amp : p.bx;
      const ny = p.mv.type === 'v' ? p.by + Math.sin(a) * p.mv.amp : p.mv.type === 'c' ? p.by + Math.sin(a) * p.mv.amp : p.by;
      p.dx = nx - p.x; p.dy = ny - p.y; p.x = nx; p.y = ny;
    }
    for (const hs of this.hazards) {
      const d = hs.def;
      const tt = t + d.offset;
      const cycle = Math.floor(tt / d.period);
      const ph = tt % d.period;
      const idleEnd = d.period - d.warn - d.active;
      if (cycle !== hs.cycle) {
        hs.cycle = cycle;
        if (d.random) hs.x = d.random[0] + this.rng() * (d.random[1] - d.random[0]) - d.w / 2;
        else if (d.zones) hs.x = d.zones[cycle % d.zones.length][0];
      }
      if (ph < idleEnd) { hs.phase = 'idle'; hs.p = ph / idleEnd; }
      else if (ph < idleEnd + d.warn) { hs.phase = 'warn'; hs.p = (ph - idleEnd) / d.warn; }
      else { hs.phase = 'active'; hs.p = (ph - idleEnd - d.warn) / d.active; }
    }
  }
}
