// Headless AI-vs-AI simulation: catches crashes and shows rough balance. Run: npm run sim
import { Match } from '../src/game/match';
import { AIController } from '../src/game/ai';
import { ROSTER_IDS } from '../src/game/characters';
import { NORMAL_STAGES, type StageId } from '../src/game/stages';
import { allLines } from '../src/game/dialogs';

function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const wins: Record<string, number> = {}, games: Record<string, number> = {};
let frames = 0, stuck = 0, lines = 0, ringouts = 0;
const t0 = Date.now();
let seed = 1;
for (const a of ROSTER_IDS) for (const b of ROSTER_IDS) {
  if (a === b) continue;
  const rng = mulberry(seed++);
  const stage: StageId = a === 'nirvana' || b === 'nirvana' ? 'nirvana' : NORMAL_STAGES[seed % 4];
  const m = new Match({ p1: a, p2: b, stage, rng });
  const ai = [new AIController(0.6, rng), new AIController(0.6, rng)];
  let n = 0;
  while (m.phase !== 'done' && n < 60 * 60 * 5) {
    m.step([ai[0].update(m, m.fighters[0]), ai[1].update(m, m.fighters[1])]);
    m.lineQueue.length = 0; m.sfxQueue.length = 0; n++;
    for (const f of m.fighters) if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) throw new Error(`NaN position ${a} vs ${b}`);
  }
  frames += n;
  if (m.phase !== 'done') { stuck++; console.log('STUCK', a, b, m.wins, m.round); }
  games[a] = (games[a] ?? 0) + 1; games[b] = (games[b] ?? 0) + 1;
  if (m.matchWinner >= 0) { const w = m.fighters[m.matchWinner as 0 | 1].id; wins[w] = (wins[w] ?? 0) + 1; }
  if (m.fighters.some((f) => f.ringOut)) ringouts++;
}
console.log('win rate (AI skill 0.6 mirror):');
for (const id of ROSTER_IDS) console.log(id.padEnd(11), `${wins[id] ?? 0}/${games[id]}`);
console.log(`avg match frames ${(frames / 110).toFixed(0)} (~${(frames / 110 / 60).toFixed(0)}s), stuck ${stuck}, matches with ringouts ${ringouts}, ${Date.now() - t0}ms`);
console.log('dialog lines:', allLines().length, lines);
