import { SAVE_KEY, SETTINGS_KEY } from './config';
import { ACTIONS, type Action, type CharId, type Difficulty } from './game/types';
import { ROSTER_IDS } from './game/characters';

// ------------------------------------------------------------ progress
export interface Save {
  v: 1;
  /** unlock order: JavaScript first, Nirvana last, everyone else shuffled once per save */
  order: CharId[];
  unlocked: CharId[];
}

function newOrder(): CharId[] {
  const mid = ROSTER_IDS.filter((c) => c !== 'javascript' && c !== 'nirvana');
  for (let i = mid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mid[i], mid[j]] = [mid[j], mid[i]]; }
  return ['javascript', ...mid, 'nirvana'];
}

function freshSave(): Save { return { v: 1, order: newOrder(), unlocked: ['javascript'] }; }

let save: Save | null = null;
export function getSave(): Save {
  if (save) return save;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save;
      if (s.v === 1 && s.order?.length === ROSTER_IDS.length && Array.isArray(s.unlocked)) return (save = s);
    }
  } catch { /* storage unavailable */ }
  return (save = freshSave());
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ } }
export function isUnlocked(id: CharId) { return getSave().unlocked.includes(id); }
export function unlock(id: CharId): boolean {
  const s = getSave();
  if (s.unlocked.includes(id)) return false;
  s.unlocked.push(id); persist(); return true;
}
export function resetProgress() { save = freshSave(); persist(); }

/** Arcade ladder for a chosen fighter: starts at the next locked character, ends with Nirvana. */
export function ladderFor(player: CharId): CharId[] {
  const s = getSave();
  const others = s.order.filter((c) => c !== player);
  const firstLocked = others.findIndex((c) => !s.unlocked.includes(c));
  return firstLocked < 0 ? others : others.slice(firstLocked);
}

// ------------------------------------------------------------ settings
export type Binds = Record<Action, string[]>;
export interface Settings {
  master: number; music: number; sfx: number; voice: number; muted: boolean;
  difficulty: Difficulty; dialogs: boolean; shake: boolean; touch: 'auto' | 'on' | 'off';
  binds: [Binds, Binds];
}

export const DEFAULT_BINDS: [Binds, Binds] = [
  {
    left: ['KeyA'], right: ['KeyD'], up: ['Space', 'KeyW'], down: ['KeyS'],
    light: ['KeyJ'], heavy: ['KeyK'], block: ['KeyL'], dodge: ['ShiftLeft'],
    s1: ['KeyU'], s2: ['KeyI'], s3: ['KeyO'],
  },
  {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    light: ['Numpad1'], heavy: ['Numpad2'], block: ['Numpad3'], dodge: ['Numpad0'],
    s1: ['Numpad4'], s2: ['Numpad5'], s3: ['Numpad6'],
  },
];

const cloneBinds = (b: [Binds, Binds]): [Binds, Binds] => JSON.parse(JSON.stringify(b));

export const settings: Settings = {
  master: 0.8, music: 0.5, sfx: 0.8, voice: 1, muted: false,
  difficulty: 'normal', dialogs: true, shake: true, touch: 'auto', binds: cloneBinds(DEFAULT_BINDS),
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Partial<Settings>;
    Object.assign(settings, s);
    // make sure every action has a binding
    for (let p = 0; p < 2; p++) for (const a of ACTIONS) if (!settings.binds?.[p]?.[a]?.length) { settings.binds = settings.binds ?? cloneBinds(DEFAULT_BINDS); settings.binds[p][a] = [...DEFAULT_BINDS[p][a]]; }
  } catch { /* ignore */ }
}
export function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
export function resetBinds() { settings.binds = cloneBinds(DEFAULT_BINDS); saveSettings(); }

/** "KeyA" -> "A", "Numpad1" -> "Num1", "ArrowLeft" -> "←" */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) { const r = code.slice(6); return 'Num' + (({ Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Decimal: '.', Enter: '↵' } as Record<string, string>)[r] ?? r); }
  return ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', ControlRight: 'RCtrl', Enter: 'Enter', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' } as Record<string, string>)[code] ?? code;
}
