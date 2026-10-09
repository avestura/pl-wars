import { H, W } from './config';
import { AudioEngine } from './audio';
import { InputManager, TouchControls, type MenuPress } from './input';
import { loadSettings, saveSettings, settings } from './save';
import { Assets } from './render';
import { Voice } from './voice';
import type { CharId, Difficulty } from './game/types';
import type { StageId } from './game/stages';

export type Mode = 'arcade' | 'vsai' | 'vs2p' | 'training';
export interface Session {
  mode: Mode;
  p1: CharId; p2: CharId;
  stage: StageId | 'random';
  difficulty: Difficulty;
  ladder: CharId[]; ladderIdx: number;
}

export interface Screen {
  music?: string;
  touch?: boolean;
  enter?(app: App): void;
  update(app: App, m: MenuPress): void;
  draw(g: CanvasRenderingContext2D, app: App): void;
  pointer?(app: App, x: number, y: number, down: boolean): void;
}

export class App {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  assets = new Assets();
  input = new InputManager();
  audio = new AudioEngine();
  voice = new Voice();
  touch: TouchControls;
  screen!: Screen;
  frame = 0;
  private acc = 0; private last = 0;
  session: Session = { mode: 'arcade', p1: 'javascript', p2: 'typescript', stage: 'random', difficulty: 'normal', ladder: [], ladderIdx: 0 };
  /** set by FightScreen so the touch pause button can reach it */
  onPause: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    canvas.width = W; canvas.height = H;
    loadSettings();
    this.touch = new TouchControls(this.input, () => this.onPause?.());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const unlockAudio = () => { this.audio.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlockAudio, { passive: true });
    const toLogical = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)] as const;
    };
    canvas.addEventListener('pointermove', (e) => { const [x, y] = toLogical(e); this.screen?.pointer?.(this, x, y, false); });
    canvas.addEventListener('pointerdown', (e) => { const [x, y] = toLogical(e); this.screen?.pointer?.(this, x, y, true); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async boot(first: Screen) {
    await Promise.all([this.assets.load(), this.voice.init()]);
    this.audio.applyVolumes();
    this.go(first);
    requestAnimationFrame((t) => this.loop(t));
  }

  go(s: Screen) {
    this.screen = s;
    s.enter?.(this);
    this.audio.music(s.music ?? 'menu');
    const wantTouch = !!s.touch && (settings.touch === 'on' || (settings.touch === 'auto' && matchMedia('(pointer: coarse)').matches));
    this.touch.show(wantTouch);
    this.onPause = null;
  }

  sfx(n: string) { this.audio.sfx(n); }

  resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.canvas.style.width = `${Math.floor(W * s)}px`;
    this.canvas.style.height = `${Math.floor(H * s)}px`;
    const t = document.getElementById('touch');
    if (t) { t.style.width = this.canvas.style.width; t.style.height = this.canvas.style.height; }
  }

  private loop(now: number) {
    if (!this.last) this.last = now;
    this.acc += Math.min(100, now - this.last); this.last = now;
    const step = 1000 / 60;
    while (this.acc >= step) {
      this.acc -= step; this.frame++;
      const m = this.input.menu();
      this.screen.update(this, m);
      this.input.endFrame();
    }
    this.g.imageSmoothingEnabled = false;
    this.screen.draw(this.g, this);
    requestAnimationFrame((t) => this.loop(t));
  }

  saveSettings() { saveSettings(); this.audio.applyVolumes(); }
}
