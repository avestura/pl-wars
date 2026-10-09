import { AIController } from './ai';
import type { Fighter, Match } from './match';
import { emptyInput, type Input, type Rng } from './types';

export type DummyMode = 'stand' | 'block' | 'jump' | 'patrol' | 'fight';
export const DUMMY_MODES: { id: DummyMode; label: string }[] = [
  { id: 'stand', label: 'Stand still' },
  { id: 'block', label: 'Hold block' },
  { id: 'jump', label: 'Keep jumping' },
  { id: 'patrol', label: 'Walk back and forth' },
  { id: 'fight', label: 'Fight back (AI)' },
];

/** Training dummy brain for the Skill Playground. */
export class DummyController {
  mode: DummyMode = 'stand';
  private ai: AIController;
  private t = 0;
  private dir: 1 | -1 = 1;
  constructor(rng: Rng) { this.ai = new AIController(0.5, rng); }

  update(m: Match, me: Fighter): Input {
    this.t++;
    const i = emptyInput();
    if (m.phase !== 'fight') return i;
    switch (this.mode) {
      case 'block': i.block = true; break;
      case 'jump': if (this.t % 70 === 0) i.up = true; break;
      case 'patrol': {
        const f = m.stage.def.floor;
        if (me.x < f.left + 60) this.dir = 1; else if (me.x > f.right - 60) this.dir = -1; else if (this.t % 150 === 0) this.dir = (this.dir * -1) as 1 | -1;
        i.right = this.dir > 0; i.left = this.dir < 0;
        break;
      }
      case 'fight': return this.ai.update(m, me);
    }
    return i;
  }
}
