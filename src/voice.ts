import type { Line } from './game/dialogs';
import { settings } from './save';

/**
 * Voice-over hook.
 *
 * Every spoken line has a stable id (e.g. "haskell.fsharp.intro.0") plus an emotion tag.
 * To add real voices later:
 *   1. `npm run voice:script` exports every line (id, text, emotion, speaker style) to voice-script.json/.csv
 *   2. synthesise each line with your TTS model, save as public/voice/<id>.mp3
 *   3. list the ids you generated in public/voice/manifest.json  -> { "ext": "mp3", "ids": ["..."] }
 *
 * Alternatively, listen to the `plw:line` window event (detail: { line, side }) and drive a
 * streaming TTS engine yourself; call `event.preventDefault()` to stop the built-in file playback.
 */
export class Voice {
  private ids = new Set<string>();
  private ext = 'mp3';
  private current: HTMLAudioElement | null = null;

  async init() {
    try {
      const r = await fetch('voice/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const j = (await r.json()) as { ext?: string; ids?: string[] };
      this.ext = j.ext ?? 'mp3'; this.ids = new Set(j.ids ?? []);
    } catch { /* no voice pack: fine */ }
  }

  speak(line: Line, side: 0 | 1 | 'assist') {
    const ev = new CustomEvent('plw:line', { detail: { line, side }, cancelable: true });
    if (!window.dispatchEvent(ev)) return;
    if (!this.ids.has(line.id) || settings.muted || settings.voice <= 0) return;
    this.stop();
    const a = new Audio(`voice/${line.id}.${this.ext}`);
    a.volume = Math.min(1, settings.voice * settings.master);
    this.current = a;
    void a.play().catch(() => undefined);
  }
  stop() { this.current?.pause(); this.current = null; }
}
