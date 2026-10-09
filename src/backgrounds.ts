import { H, W } from './config';
import type { Plat, Stage, StageId } from './game/stages';

const MONO = '"Courier New", Consolas, monospace';
const cache = new Map<StageId, HTMLCanvasElement>();

function mkCanvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

// deterministic pseudo random for static scenery
function prng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

const CODE = [
  "import { Fighter } from './fighter';",
  'const MAX_HP = 100;',
  '',
  'export async function fight(a: Fighter, b: Fighter) {',
  '  while (a.hp > 0 && b.hp > 0) {',
  '    await a.attack(b);',
  '    if (b.isBlocking) continue;',
  '    b.hp -= a.damage * 1.5;',
  '  }',
  "  return a.hp > 0 ? a : b; // 42",
  '}',
  '',
  'function ringOut(f: Fighter): boolean {',
  '  return f.x < -130 || f.y > 710;',
  '}',
  '',
  '// TODO: add Nirvana to the roster',
  'const winner = await fight(js, ts);',
  'console.log(`${winner.name} wins`);',
];
const KW = new Set(['import', 'from', 'const', 'export', 'async', 'function', 'while', 'await', 'if', 'continue', 'return']);

function codeLine(g: CanvasRenderingContext2D, line: string, x: number, y: number) {
  const re = /(\/\/.*$)|('[^']*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null; let cx = x;
  while ((m = re.exec(line))) {
    const tok = m[0];
    g.fillStyle = m[1] ? '#6a9955' : m[2] ? '#ce9178' : m[3] ? '#b5cea8' : m[4] ? (KW.has(tok) ? '#569cd6' : /^[A-Z]/.test(tok) ? '#4ec9b0' : line.slice(m.index + tok.length).startsWith('(') ? '#dcdcaa' : '#9cdcfe') : '#d4d4d4';
    g.fillText(tok, cx, y); cx += g.measureText(tok).width;
  }
}

function buildVscode(): HTMLCanvasElement {
  const c = mkCanvas(), g = c.getContext('2d')!;
  g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, W, H);
  // activity bar + sidebar
  g.fillStyle = '#333'; g.fillRect(0, 0, 48, H);
  for (let i = 0; i < 5; i++) { g.strokeStyle = i === 0 ? '#fff' : '#858585'; g.lineWidth = 2; g.strokeRect(14, 22 + i * 54, 20, 20); }
  g.fillStyle = '#fff'; g.fillRect(0, 14, 2, 36);
  g.fillStyle = '#252526'; g.fillRect(48, 0, 210, H);
  g.font = `11px ${MONO}`; g.fillStyle = '#bbb'; g.fillText('EXPLORER', 62, 24);
  const files = ['▾ PROGRAMMING-LANGUAGE-WARS', '  ▾ src', '     main.ts', '     fighter.ts', '     stage.ts', '     abilities.ts', '  ▸ public', '     package.json', '     README.md'];
  files.forEach((f, i) => { g.fillStyle = i === 2 ? '#fff' : '#ccc'; if (i === 2) { g.fillStyle = '#37373d'; g.fillRect(48, 60 + i * 22 - 14, 210, 22); g.fillStyle = '#fff'; } g.font = `13px ${MONO}`; g.fillText(f, 58, 60 + i * 22); });
  // tabs
  g.fillStyle = '#252526'; g.fillRect(258, 0, W - 258, 35);
  const tabs = ['main.ts', 'fighter.ts', 'stage.ts'];
  tabs.forEach((t, i) => { g.fillStyle = i === 0 ? '#1e1e1e' : '#2d2d2d'; g.fillRect(258 + i * 130, 0, 128, 35); if (i === 0) { g.fillStyle = '#007acc'; g.fillRect(258, 0, 128, 2); } g.fillStyle = i === 0 ? '#fff' : '#999'; g.font = `13px ${MONO}`; g.fillText('TS ' + t, 270 + i * 130, 22); });
  g.fillStyle = '#9a9a9a'; g.font = `12px ${MONO}`; g.fillText('src > main.ts > fight', 270, 52);
  // code
  g.font = `14px ${MONO}`;
  for (let i = 0; i < 24; i++) {
    const y = 80 + i * 20; g.fillStyle = '#6e7681'; g.textAlign = 'right'; g.fillText(String(i + 1), 296, y); g.textAlign = 'left';
    codeLine(g, CODE[i % CODE.length], 312, y);
  }
  // minimap
  g.fillStyle = '#1e1e1e'; g.fillRect(W - 80, 36, 80, H - 60);
  const r = prng(4);
  for (let i = 0; i < 46; i++) { g.fillStyle = ['#569cd6', '#ce9178', '#9cdcfe', '#4ec9b0'][(r() * 4) | 0]; g.globalAlpha = 0.5; g.fillRect(W - 74, 44 + i * 9, 6 + r() * 50, 3); }
  g.globalAlpha = 1;
  // status bar
  g.fillStyle = '#007acc'; g.fillRect(0, H - 24, W, 24); g.fillStyle = '#fff'; g.font = `12px ${MONO}`;
  g.fillText('⎇ main*    ⊗ 0  ⚠ 0        Ln 12, Col 5     Spaces: 2     UTF-8     TypeScript     ✓ Prettier', 12, H - 8);
  // dim code so fighters stand out
  g.fillStyle = 'rgba(20,20,20,.35)'; g.fillRect(258, 36, W - 340, H - 60);
  return c;
}

function buildTerminal(): HTMLCanvasElement {
  const c = mkCanvas(), g = c.getContext('2d')!;
  g.fillStyle = '#050805'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, W, 30);
  ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(18 + i * 22, 15, 6, 0, 7); g.fill(); });
  g.fillStyle = '#aaa'; g.font = `13px ${MONO}`; g.textAlign = 'center'; g.fillText('user@linux: ~/language-wars — bash', W / 2, 20); g.textAlign = 'left';
  const cmds = ['$ git clone https://github.com/lang/wars', "Cloning into 'wars'...", '$ make all', 'gcc -O2 -o fight fight.c', 'warning: implicit declaration of function', '$ ./fight --js --ts', 'Segmentation fault (core dumped)', '$ cargo build --release', 'error[E0382]: borrow of moved value', '$ sudo rm -rf /', 'rm: it is dangerous to operate recursively', '$ ls -la', 'drwxr-xr-x  5 user user 4096 haskell/', '-rwxr-xr-x  1 user user  666 nirvana.out'];
  g.font = `14px ${MONO}`;
  cmds.forEach((l, i) => { g.fillStyle = l.startsWith('$') ? '#37e060' : l.includes('error') || l.includes('Segm') ? '#ff6b6b' : '#7fbf7f'; g.globalAlpha = 0.45; g.fillText(l, 22, 60 + i * 22); g.fillText(l, 520, 140 + i * 22); });
  g.globalAlpha = 1;
  return c;
}

function buildStack(): HTMLCanvasElement {
  const c = mkCanvas(), g = c.getContext('2d')!;
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f48024'; g.fillRect(0, 0, W, 5); g.fillStyle = '#fff'; g.fillRect(0, 5, W, 45);
  g.fillStyle = '#222'; g.font = `bold 20px ${MONO}`; g.fillText('stack', 22, 36); g.fillStyle = '#f48024'; g.fillText('overflow', 84, 36);
  g.fillStyle = '#e4e6e8'; g.fillRect(250, 14, 300, 24); g.fillStyle = '#9a9a9a'; g.font = `12px ${MONO}`; g.fillText('Search...', 258, 30);
  g.fillStyle = '#0d1117'; g.fillRect(W / 2 + 20, 50, W / 2 - 20, H - 50);
  g.fillStyle = '#161b22'; g.fillRect(W / 2 + 20, 50, W / 2 - 20, 30); g.fillStyle = '#c9d1d9'; g.fillText('Merge pull request #404 — conflicts must be resolved', W / 2 + 34, 70);
  const diff: [string, string][] = [['-', '  return a.hp > b.hp ? a : b;'], ['+', '  return a.hp >= b.hp ? a : b;'], [' ', '<<<<<<< HEAD'], ['-', '  speed = 3;'], [' ', '======='], ['+', '  speed = 4;'], [' ', '>>>>>>> feature/nirvana'], [' ', '  // TODO fix later'], ['-', 'console.log("debug")'], ['+', 'logger.info("fight")']];
  g.font = `13px ${MONO}`;
  for (let i = 0; i < 16; i++) { const [s, t] = diff[i % diff.length]; const y = 100 + i * 24; g.fillStyle = s === '+' ? 'rgba(46,160,67,.25)' : s === '-' ? 'rgba(248,81,73,.25)' : 'rgba(0,0,0,0)'; g.fillRect(W / 2 + 20, y - 15, W / 2 - 20, 24); g.fillStyle = '#c9d1d9'; g.globalAlpha = 0.8; g.fillText(`${s} ${t}`, W / 2 + 34, y); g.globalAlpha = 1; }
  g.fillStyle = '#222'; g.font = `bold 18px ${MONO}`; g.fillText('Why does my fighter keep losing?', 60, 100);
  g.font = `13px ${MONO}`; g.fillStyle = '#555';
  ['asked today · viewed 4,096 times', '', 'I wrote my game in a language I do not understand.', 'Now it prints NaN and I cannot tell why.', '', 'Possible duplicate of "Why does my code not work?"', 'Closed as off-topic.', '', 'Edit: Thanks for the upvotes!', 'Edit 2: it works on my machine.'].forEach((l, i) => g.fillText(l, 60, 130 + i * 22));
  g.globalAlpha = 0.12; g.fillStyle = '#f48024'; g.font = `bold 260px ${MONO}`; g.fillText('?', 230, 360); g.globalAlpha = 1;
  return c;
}

function buildK8s(): HTMLCanvasElement {
  const c = mkCanvas(), g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#060d1a'); gr.addColorStop(1, '#10264a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // kubernetes wheel
  g.save(); g.translate(W / 2, 230); g.globalAlpha = 0.14; g.strokeStyle = '#326ce5'; g.fillStyle = '#326ce5'; g.lineWidth = 14;
  g.beginPath(); for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * 140, y = Math.sin(a) * 140; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke();
  g.beginPath(); g.arc(0, 0, 54, 0, 7); g.stroke();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 140, Math.sin(a) * 140); g.stroke(); }
  g.restore();
  // rack silhouettes
  for (let i = 0; i < 9; i++) {
    const x = i * 110 - 10, y = 90; g.fillStyle = '#0b1830'; g.fillRect(x, y, 96, 360); g.strokeStyle = '#1b3560'; g.lineWidth = 2; g.strokeRect(x, y, 96, 360);
    for (let s = 0; s < 12; s++) { g.fillStyle = '#12274a'; g.fillRect(x + 6, y + 8 + s * 29, 84, 22); g.fillStyle = '#1b3560'; for (let k = 0; k < 6; k++) g.fillRect(x + 40 + k * 8, y + 14 + s * 29, 5, 10); }
  }
  g.strokeStyle = '#2a4a80'; g.lineWidth = 3;
  const r = prng(9);
  for (let i = 0; i < 7; i++) { g.beginPath(); const y = 60 + r() * 20; g.moveTo(0, y); g.bezierCurveTo(250, y + 80 + r() * 60, 600, y - 40, W, y + 40 + r() * 40); g.stroke(); }
  return c;
}

function buildNirvana(): HTMLCanvasElement {
  const c = mkCanvas(), g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#120a2e'); gr.addColorStop(0.55, '#4d2d86'); gr.addColorStop(1, '#f7d27a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const r = prng(77);
  for (let i = 0; i < 120; i++) { g.fillStyle = '#fff'; g.globalAlpha = 0.2 + r() * 0.6; g.fillRect(r() * W, r() * H * 0.8, 2, 2); }
  g.globalAlpha = 1;
  return c;
}

const BUILDERS: Record<StageId, () => HTMLCanvasElement> = {
  vscode: buildVscode, terminal: buildTerminal, stackoverflow: buildStack, k8s: buildK8s, nirvana: buildNirvana,
};

// ------------------------------------------------------------------ animated layer
export function drawBackground(g: CanvasRenderingContext2D, id: StageId, t: number) {
  let c = cache.get(id);
  if (!c) { c = BUILDERS[id](); cache.set(id, c); }
  g.drawImage(c, 0, 0);
  switch (id) {
    case 'vscode': {
      if (Math.floor(t / 30) % 2 === 0) { g.fillStyle = '#fff'; g.fillRect(312 + 22 * 8.4, 80 + 5 * 20 - 13, 2, 17); }
      break;
    }
    case 'terminal': {
      g.font = `14px ${MONO}`;
      const r = prng(31);
      for (let i = 0; i < 38; i++) {
        const x = 20 + i * 25, sp = 0.6 + r() * 1.8, off = r() * 600;
        for (let k = 0; k < 9; k++) {
          const y = ((t * sp + off) % (H + 160)) - 120 + k * 16;
          g.fillStyle = k === 8 ? '#b6ffc8' : '#20c040'; g.globalAlpha = k === 8 ? 0.5 : 0.07 + k * 0.025;
          g.fillText(String.fromCharCode(0x30a0 + ((x * 7 + k * 13 + Math.floor(t / 8)) % 60)), x, y);
        }
      }
      g.globalAlpha = 1;
      if (Math.floor(t / 30) % 2 === 0) { g.fillStyle = '#37e060'; g.fillRect(40, H - 60, 12, 20); }
      g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
      break;
    }
    case 'stackoverflow': {
      g.font = `bold 16px ${MONO}`;
      const r = prng(3);
      for (let i = 0; i < 9; i++) {
        const x = 40 + r() * 400, sp = 0.4 + r() * 0.6, off = r() * 500, y = H - ((t * sp + off) % (H + 40));
        g.globalAlpha = Math.min(1, y / 120) * 0.5; g.fillStyle = '#f48024'; g.fillText('▲ +1', x, y);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'k8s': {
      const r = prng(5);
      for (let i = 0; i < 9; i++) for (let s = 0; s < 12; s++) {
        const on = Math.sin(t * 0.04 + r() * 40) > 0.1;
        g.fillStyle = on ? (r() > 0.85 ? '#ff5f5f' : '#4fff8f') : '#1b3560'; g.fillRect(i * 110 - 10 + 18, 90 + 14 + s * 29, 5, 5);
      }
      break;
    }
    case 'nirvana': {
      g.save(); g.translate(W / 2, 250);
      for (let i = 0; i < 7; i++) {
        g.save(); g.rotate(t * 0.002 * (i % 2 ? 1 : -1) * (1 + i * 0.2)); g.strokeStyle = i % 2 ? '#ffd86b' : '#c9b6ff'; g.globalAlpha = 0.18; g.lineWidth = 2;
        const R = 90 + i * 55, n = 6 + i;
        for (let k = 0; k < n; k++) { g.beginPath(); const a = (k / n) * Math.PI * 2; g.arc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.45, 0, 7); g.stroke(); }
        g.restore();
      }
      g.restore(); g.globalAlpha = 1;
      g.font = `bold 22px ${MONO}`; const glyphs = ['λ', '::', '∅', 'fn', '#', '{}', '=>', '∞', '0', '1'];
      for (let i = 0; i < 16; i++) { const x = (i * 137 + t * 0.3) % (W + 60) - 30, y = 80 + ((i * 53 + Math.sin(t * 0.01 + i) * 30) % 360); g.globalAlpha = 0.25; g.fillStyle = '#fff'; g.fillText(glyphs[i % glyphs.length], x, y); }
      g.globalAlpha = 1;
      break;
    }
  }
}

// ------------------------------------------------------------------ platforms
interface PlatStyle { fill: string; edge: string; text: string; solidFill: string; floorFill: string; }
const STYLES: Record<StageId, PlatStyle> = {
  vscode: { fill: '#2d2d30', edge: '#007acc', text: '#d4d4d4', solidFill: '#3c3c3c', floorFill: '#1b1b1c' },
  terminal: { fill: '#0f1a0f', edge: '#37e060', text: '#37e060', solidFill: '#12301a', floorFill: '#040a04' },
  stackoverflow: { fill: '#ffffff', edge: '#f48024', text: '#6a737c', solidFill: '#fdf7e2', floorFill: '#e9eaeb' },
  k8s: { fill: '#16315e', edge: '#4fa3ff', text: '#bcd6ff', solidFill: '#0f2144', floorFill: '#0a1730' },
  nirvana: { fill: '#fff8e1', edge: '#ffd86b', text: '#8a6d1f', solidFill: '#fff3c4', floorFill: '#fff3c4' },
};

export function drawPlatforms(g: CanvasRenderingContext2D, stage: Stage, t: number) {
  const id = stage.def.id, st = STYLES[id];
  for (const p of stage.plats) {
    const isFloor = p === stage.plats[0];
    g.save();
    if (isFloor) {
      g.fillStyle = st.floorFill; g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = st.edge; g.fillRect(p.x, p.y, p.w, 5);
      drawFloorDetail(g, id, p, t);
    } else if (p.kind === 'solid') {
      g.fillStyle = st.solidFill; g.fillRect(p.x, p.y, p.w, p.h); g.strokeStyle = st.edge; g.lineWidth = 3; g.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
      if (p.label) { g.fillStyle = st.text; g.font = `bold 11px ${MONO}`; g.textAlign = 'center'; g.fillText(p.label, p.x + p.w / 2, p.y + p.h / 2 + 4, p.w - 6); }
    } else {
      g.fillStyle = st.fill; g.fillRect(p.x, p.y, p.w, p.h); g.fillStyle = st.edge; g.fillRect(p.x, p.y, p.w, 3);
      g.globalAlpha = 0.25; g.fillRect(p.x, p.y + p.h, p.w, 3); g.globalAlpha = 1;
      if (p.label) { g.fillStyle = st.text; g.font = `bold 11px ${MONO}`; g.textAlign = 'center'; g.fillText(p.label, p.x + p.w / 2, p.y + 11, p.w - 6); }
      if (p.mv) { g.fillStyle = st.edge; g.globalAlpha = 0.5; g.fillRect(p.x + 4, p.y + p.h - 2, 6, 2); g.fillRect(p.x + p.w - 10, p.y + p.h - 2, 6, 2); }
    }
    g.restore();
  }
}

function drawFloorDetail(g: CanvasRenderingContext2D, id: StageId, p: Plat, t: number) {
  g.font = `bold 12px ${MONO}`; g.textAlign = 'left';
  switch (id) {
    case 'vscode': g.fillStyle = '#999'; g.fillText('PROBLEMS    OUTPUT    DEBUG CONSOLE    TERMINAL', p.x + 14, p.y + 26); g.fillStyle = '#007acc'; g.fillRect(p.x + 14 + 36 * 7.2 + 12, p.y + 31, 66, 2); g.fillStyle = '#37e060'; g.fillText('$ npm run dev', p.x + 14, p.y + 58); break;
    case 'terminal': g.fillStyle = '#37e060'; g.fillText('user@linux:~$ ./fight', p.x + 14, p.y + 28); g.fillStyle = '#1f8a38'; g.fillText('[sudo] password for user: ********', p.x + 14, p.y + 54); break;
    case 'stackoverflow': g.fillStyle = '#6a737c'; g.fillText('Answer · Accepted · 1,337 votes', p.x + 14, p.y + 28); g.fillStyle = '#f48024'; g.fillText('▲ Share  Improve this answer  Follow', p.x + 14, p.y + 54); break;
    case 'k8s': g.fillStyle = '#4fa3ff'; g.fillText('NAME            READY   STATUS             RESTARTS', p.x + 14, p.y + 28); g.fillStyle = '#9ad'; g.fillText('fighter-0       1/1     Running            0', p.x + 14, p.y + 54); g.fillStyle = '#ff7b7b'; g.fillText('fighter-1       0/1     CrashLoopBackOff   42', p.x + 14, p.y + 76); break;
    case 'nirvana': g.fillStyle = '#ffd86b'; g.globalAlpha = 0.5 + Math.sin(t * 0.05) * 0.2; g.fillRect(p.x, p.y - 4, p.w, 4); g.globalAlpha = 1; g.fillStyle = '#b8902a'; g.fillText('No warnings. No errors. No problems.', p.x + 80, p.y + 36); break;
  }
}

// ------------------------------------------------------------------ hazards
export function drawHazards(g: CanvasRenderingContext2D, stage: Stage, t: number) {
  for (const hs of stage.hazards) {
    const d = hs.def;
    if (hs.phase === 'idle') continue;
    g.save();
    if (hs.phase === 'warn') {
      const pulse = 0.12 + 0.28 * Math.abs(Math.sin(hs.p * Math.PI * 6));
      g.globalAlpha = pulse; g.fillStyle = d.color; g.fillRect(hs.x, d.y, d.w, d.h);
      g.globalAlpha = 0.9; g.strokeStyle = d.color; g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeRect(hs.x + 1, d.y + 1, d.w - 2, d.h - 2);
      g.setLineDash([]); g.fillStyle = d.color; g.font = `bold 13px ${MONO}`; g.textAlign = 'center';
      g.fillText('⚠ ' + d.label, hs.x + d.w / 2, Math.max(70, d.y > 0 ? d.y - 8 : 100));
    } else {
      g.globalAlpha = 0.8; g.fillStyle = d.color; g.fillRect(hs.x, d.y, d.w, d.h);
      g.globalAlpha = 1; g.fillStyle = '#fff';
      // jagged energy
      for (let i = 0; i < 10; i++) { const x = hs.x + ((i * 37 + t * 9) % d.w), y = d.y + ((i * 53 + t * 13) % d.h); g.fillRect(x, y, 3, 8); }
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath();
      const base = d.y + d.h - 6; for (let x = 0; x <= d.w; x += 8) { const yy = base - (d.h > 200 ? 0 : 0) + (x / 8 % 2 ? -4 : 4); x ? g.lineTo(hs.x + x, yy) : g.moveTo(hs.x, yy); }
      g.stroke();
    }
    g.restore();
  }
}
