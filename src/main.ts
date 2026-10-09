import './style.css';
import { App } from './app';
import { FightScreen, RebindScreen, ResultScreen, SettingsScreen, StageScreen, TitleScreen } from './screens';
import type { Screen } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(canvas);

// Dev-only shortcut (npm run dev): ?fight=javascript,rust,k8s jumps straight into a match.
let first: Screen = new TitleScreen();
if (import.meta.env.DEV) {
  const f = new URLSearchParams(location.search).get('fight')?.split(',');
  const scr = new URLSearchParams(location.search).get('screen');
  if (scr === 'settings') first = new SettingsScreen();
  if (scr === 'rebind') first = new RebindScreen();
  if (scr === 'result') { Object.assign(app.session, { mode: 'arcade', p1: 'javascript', p2: 'rust', ladder: ['rust', 'go', 'nirvana'], ladderIdx: 0 }); first = new ResultScreen(0); }
  if (scr === 'stage') first = new StageScreen();
  if (f && f.length >= 2) {
    Object.assign(app.session, { mode: new URLSearchParams(location.search).has('training') ? 'training' : 'vsai', p1: f[0], p2: f[1], stage: f[2] ?? 'vscode', difficulty: 'normal' });
    first = new FightScreen();
  }
}
app.boot(first).catch((e) => {
  const el = document.getElementById('error');
  if (el) { el.style.display = 'block'; el.textContent = `Failed to start: ${e instanceof Error ? e.message : e}`; }
  console.error(e);
});
