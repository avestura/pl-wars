import { ACTIONS, emptyInput, type Action, type Input } from './game/types';
import { saveSettings, settings } from './save';

export interface MenuPress { up: boolean; down: boolean; left: boolean; right: boolean; confirm: boolean; back: boolean; pause: boolean }

const GAME_KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab']);

/** Standard-mapping gamepad buttons -> actions */
const PAD_MAP: Record<number, Action> = { 0: 'up', 2: 'light', 3: 'heavy', 1: 'dodge', 4: 'block', 6: 'block', 5: 's1', 7: 's2', 15: 'right', 14: 'left', 12: 'up', 13: 'down' };
const PAD_S3 = 8; // "back/select" button for the third special; also Y+X chord could be added later

export class InputManager {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private touch: Partial<Input> = {};
  private prevMenu: MenuPress = { up: false, down: false, left: false, right: false, confirm: false, back: false, pause: false };
  private capture: ((code: string | null) => void) | null = null;
  /** gamepad indices assigned to players */
  private padFor: [number, number] = [-1, -1];
  lastDevice: 'keyboard' | 'pad' | 'touch' = 'keyboard';

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture; this.capture = null;
        cb(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); });
  }

  /** capture the next key press (for rebinding). Esc cancels (null). */
  captureNext(cb: (code: string | null) => void) { this.capture = cb; }
  get capturing() { return !!this.capture; }

  setTouch(a: Action, down: boolean) { this.touch[a] = down; this.lastDevice = 'touch'; }
  clearTouch() { this.touch = {}; }

  private pads(): Gamepad[] {
    const list = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter((g): g is Gamepad => !!g && g.connected);
    return list;
  }

  private padInput(g: Gamepad): Input {
    const i = emptyInput();
    g.buttons.forEach((b, idx) => { const a = PAD_MAP[idx]; if (a && b.pressed) i[a] = true; });
    if (g.buttons[PAD_S3]?.pressed || (g.buttons[2]?.pressed && g.buttons[3]?.pressed)) i.s3 = true;
    const ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
    if (ax < -0.45) i.left = true; if (ax > 0.45) i.right = true;
    if (ay > 0.6) i.down = true;
    if (g.buttons[9]?.pressed) i.s3 = i.s3 || false;
    return i;
  }

  /** Called once per game frame for fighting input */
  fighter(player: 0 | 1): Input {
    const out = emptyInput();
    const b = settings.binds[player];
    for (const a of ACTIONS) if (b[a].some((k) => this.keys.has(k))) out[a] = true;
    const pads = this.pads();
    const g = pads[player] ?? (player === 0 ? pads[0] : undefined);
    if (g && (player === 1 ? pads.length > 1 : true)) {
      const p = this.padInput(g);
      for (const a of ACTIONS) if (p[a]) { out[a] = true; this.lastDevice = 'pad'; }
    }
    if (player === 0) for (const a of ACTIONS) if (this.touch[a]) out[a] = true;
    return out;
  }

  /** edge-detected menu navigation from keyboard + gamepad. Call once per frame. */
  menu(): MenuPress {
    const k = this.keys;
    const any = (...c: string[]) => c.some((x) => k.has(x));
    const cur: MenuPress = {
      up: any('ArrowUp', 'KeyW'), down: any('ArrowDown', 'KeyS'), left: any('ArrowLeft', 'KeyA'), right: any('ArrowRight', 'KeyD'),
      confirm: any('Enter', 'Space', 'KeyJ', 'NumpadEnter'), back: any('Escape', 'Backspace', 'KeyK'), pause: any('Escape', 'KeyP'),
    };
    for (const g of this.pads()) {
      const ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
      if (g.buttons[12]?.pressed || ay < -0.6) cur.up = true;
      if (g.buttons[13]?.pressed || ay > 0.6) cur.down = true;
      if (g.buttons[14]?.pressed || ax < -0.6) cur.left = true;
      if (g.buttons[15]?.pressed || ax > 0.6) cur.right = true;
      if (g.buttons[0]?.pressed) cur.confirm = true;
      if (g.buttons[1]?.pressed) cur.back = true;
      if (g.buttons[9]?.pressed) cur.pause = true;
    }
    const edge: MenuPress = {
      up: cur.up && !this.prevMenu.up, down: cur.down && !this.prevMenu.down, left: cur.left && !this.prevMenu.left, right: cur.right && !this.prevMenu.right,
      confirm: cur.confirm && !this.prevMenu.confirm, back: cur.back && !this.prevMenu.back, pause: cur.pause && !this.prevMenu.pause,
    };
    this.prevMenu = cur;
    return edge;
  }

  anyKeyPressed(): boolean { const r = this.pressedThisFrame.size > 0; return r; }
  endFrame() { this.pressedThisFrame.clear(); }

  rebind(player: 0 | 1, action: Action, code: string) {
    const b = settings.binds[player];
    // remove the code from other actions of the same player so keys never double-bind
    for (const a of ACTIONS) b[a] = b[a].filter((k) => k !== code);
    b[action] = [code];
    for (const a of ACTIONS) if (!b[a].length) b[a] = [];
    saveSettings();
  }
}

// ------------------------------------------------------------ on-screen touch controls
export class TouchControls {
  root: HTMLElement;
  private enabled = false;
  constructor(private input: InputManager, private onPause: () => void) {
    this.root = document.getElementById('touch')!;
    this.build();
  }
  private btn(label: string, action: Action | 'pause', cls: string) {
    const b = document.createElement('button');
    b.textContent = label; b.className = `tb ${cls}`; b.setAttribute('aria-label', String(action));
    const set = (v: boolean) => { if (action === 'pause') { if (v) this.onPause(); } else this.input.setTouch(action, v); b.classList.toggle('on', v); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }
  private build() {
    const left = document.createElement('div'); left.className = 'pad left';
    left.append(this.btn('◀', 'left', 'tl'), this.btn('▶', 'right', 'tr'), this.btn('▲', 'up', 'tu'), this.btn('▼', 'down', 'td'));
    const right = document.createElement('div'); right.className = 'pad right';
    right.append(
      this.btn('J', 'light', 'a1'), this.btn('K', 'heavy', 'a2'), this.btn('🛡', 'block', 'a3'), this.btn('⇢', 'dodge', 'a4'),
      this.btn('S1', 's1', 'a5'), this.btn('S2', 's2', 'a6'), this.btn('S3', 's3', 'a7'),
    );
    const pause = this.btn('II', 'pause', 'pausebtn');
    this.root.append(left, right, pause);
  }
  show(v: boolean) {
    if (v === this.enabled) return;
    this.enabled = v; this.root.style.display = v ? 'block' : 'none';
    if (!v) this.input.clearTouch();
  }
}
