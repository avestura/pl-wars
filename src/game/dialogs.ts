import raw from '../data/dialogs.json';
import type { HelperId, Rng } from './types';

export type Phase =
  | 'intro' | 'reply' | 'taunt' | 'hurt' | 'lowhp' | 'special'
  | 'winRound' | 'loseRound' | 'winMatch' | 'assist' | 'block' | 'combo' | 'dodge' | 'ringout';

export type Emotion =
  | 'mockery' | 'contempt' | 'smug' | 'anger' | 'distress' | 'confident' | 'pity' | 'panic' | 'nostalgia'
  | 'disgust' | 'cheerful' | 'serene' | 'sarcasm' | 'fear' | 'determined' | 'bored';

/** One spoken line. `id` doubles as the voice file name: public/voice/<id>.mp3 */
export interface Line {
  id: string;
  speaker: HelperId;
  listener: HelperId | '*';
  phase: Phase;
  text: string;
  emotion: Emotion;
}

type Pool = Partial<Record<Phase, [string, string][]>>;
const DB = raw as unknown as Record<string, Record<string, Pool>>;

function mk(speaker: string, listener: string, phase: Phase, idx: number, e: [string, string]): Line {
  return { id: `${speaker}.${listener === '*' ? 'any' : listener}.${phase}.${idx}`, speaker: speaker as HelperId, listener: listener as Line['listener'], phase, text: e[0], emotion: e[1] as Emotion };
}

function pool(speaker: string, listener: string, phase: Phase): Line[] {
  const p = DB[speaker]?.[listener]?.[phase];
  return p ? p.map((e, i) => mk(speaker, listener, phase, i, e)) : [];
}

/**
 * Choose a line for `speaker` while facing `listener`.
 * Matchup-specific lines win; falls back to the speaker's generic pool.
 * intro <-> reply fall back to each other so any ordering works.
 */
export function pickLine(speaker: HelperId, listener: HelperId, phase: Phase, rng: Rng = Math.random, exclude?: Set<string>): Line | null {
  const order: Phase[] = phase === 'reply' ? ['reply', 'intro'] : phase === 'intro' ? ['intro', 'reply'] : [phase];
  for (const ph of order) {
    let specific = pool(speaker, listener, ph);
    // matchup-specific lines are favoured (~70%) but never exclusive, so generic lines keep every fight varied
    if (specific.length && rng() < (phase === 'assist' ? 1 : phase === 'intro' || phase === 'reply' ? 0.7 : 0.65)) {
      const fresh = exclude ? specific.filter((l) => !exclude.has(l.id)) : specific;
      if (fresh.length) specific = fresh;
      return specific[Math.floor(rng() * specific.length)];
    }
  }
  for (const ph of order) {
    let generic = pool(speaker, '*', ph);
    if (!generic.length) continue;
    const fresh = exclude ? generic.filter((l) => !exclude.has(l.id)) : generic;
    if (fresh.length) generic = fresh;
    return generic[Math.floor(rng() * generic.length)];
  }
  return null;
}

/** Every line in the game (used by the voice-script exporter and tests). */
export function allLines(): Line[] {
  const out: Line[] = [];
  for (const [sp, targets] of Object.entries(DB)) {
    if (sp.startsWith('_')) continue;
    for (const [to, phases] of Object.entries(targets)) {
      for (const [ph, arr] of Object.entries(phases)) arr.forEach((e, i) => out.push(mk(sp, to, ph as Phase, i, e)));
    }
  }
  return out;
}
