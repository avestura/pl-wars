// Exports every dialog line with an emotion + a TTS style prompt, ready for batch synthesis.
// Run: npm run voice:script  -> voice-script.json and voice-script.csv in the project root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(fs.readFileSync(path.join(root, 'src/data/dialogs.json'), 'utf8'));

const STYLE = {
  mockery: 'mocking, taunting, playful cruelty', contempt: 'cold, disdainful, looking down on the listener',
  smug: 'smug, self-satisfied, slow and confident', anger: 'angry, shouting, aggressive', distress: 'pained, grunting, strained',
  confident: 'confident, calm, assured', pity: 'condescending pity', panic: 'panicked, breathless, rising pitch',
  nostalgia: 'wistful, old-timer reminiscing', disgust: 'disgusted, recoiling', cheerful: 'upbeat, energetic',
  serene: 'serene, calm, otherworldly, whispery', sarcasm: 'dry sarcasm, deadpan', fear: 'frightened, trembling',
  determined: 'determined, resolute', bored: 'bored, unimpressed, flat',
};
const VOICE = {
  javascript: 'young, hyperactive, chaotic', typescript: 'polished, precise, slightly condescending', python: 'relaxed, friendly, laid-back',
  go: 'cheerful, concise, plainspoken', rust: 'intense, zealous, proud', haskell: 'elderly professor, academic, wry',
  fsharp: 'cool, quick-witted, a little cocky', csharp: 'corporate, polished, smug', c: 'gruff veteran, deep and weathered',
  cpp: 'booming, bombastic, over-complicated', nirvana: 'ethereal, genderless, calm, resonant', ocaml: 'warm, wise, old camel',
};

const rows = [];
for (const [speaker, targets] of Object.entries(db)) {
  if (speaker.startsWith('_')) continue;
  for (const [listener, phases] of Object.entries(targets)) {
    for (const [phase, lines] of Object.entries(phases)) {
      lines.forEach(([text, emotion], i) => rows.push({
        id: `${speaker}.${listener === '*' ? 'any' : listener}.${phase}.${i}`,
        speaker, listener, phase, emotion, text,
        voice: VOICE[speaker] ?? '', style: STYLE[emotion] ?? emotion,
        file: `public/voice/${speaker}.${listener === '*' ? 'any' : listener}.${phase}.${i}.mp3`,
      }));
    }
  }
}
fs.writeFileSync(path.join(root, 'voice-script.json'), JSON.stringify(rows, null, 2));
const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(root, 'voice-script.csv'), ['id,speaker,listener,phase,emotion,voice,style,text', ...rows.map((r) => [r.id, r.speaker, r.listener, r.phase, r.emotion, r.voice, r.style, r.text].map(esc).join(','))].join('\n'));
console.log(`exported ${rows.length} lines`);
