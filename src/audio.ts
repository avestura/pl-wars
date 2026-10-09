import { settings } from './save';

/** Synthesised SFX + chiptune music. Everything is generated with WebAudio, no asset files. */
interface Track {
  bpm: number; root: number; scale: number[]; prog: number[]; bass: string; arp: number[]; drums: string; lead: OscillatorType; seed: number; swing?: number;
}

const TRACKS: Record<string, Track> = {
  menu: { bpm: 100, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], bass: 'x..x..x.x..x..x.', arp: [0, 2, 4, 2], drums: 'k...s...k...s...', lead: 'triangle', seed: 7 },
  vscode: { bpm: 128, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 6], bass: 'x.x.x.x.x.x.x.xx', arp: [0, 2, 4, 7, 4, 2], drums: 'k.h.s.h.k.hks.h.', lead: 'square', seed: 3 },
  terminal: { bpm: 140, root: 45, scale: [0, 3, 5, 6, 7, 10], prog: [0, 0, 3, 4], bass: 'xx.xx.x.xx.xx.x.', arp: [0, 3, 5, 3], drums: 'k.hhs.hhk.hhs.hh', lead: 'sawtooth', seed: 11 },
  stackoverflow: { bpm: 118, root: 53, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 0], bass: 'x..x.x..x..x.x..', arp: [0, 2, 4, 2, 4, 7], drums: 'k..hs..hk.h.s..h', lead: 'square', seed: 5 },
  k8s: { bpm: 134, root: 48, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 5, 4], bass: 'x.x.xx.xx.x.xx.x', arp: [0, 4, 7, 4], drums: 'k.s.k.sskhs.k.s.', lead: 'sawtooth', seed: 13 },
  nirvana: { bpm: 84, root: 52, scale: [0, 2, 4, 7, 9], prog: [0, 2, 3, 1], bass: 'x.......x.......', arp: [0, 1, 2, 3, 4, 3, 2, 1], drums: '....s.......s...', lead: 'sine', seed: 21 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private musicG!: GainNode; private sfxG!: GainNode; private noiseBuf!: AudioBuffer;
  private track: string | null = null; private timer = 0; private step = 0; private nextT = 0; private rand = rng(1); private melody: number[] = [];

  /** must be called from a user gesture */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.musicG = this.ctx.createGain(); this.sfxG = this.ctx.createGain();
    this.musicG.connect(this.master); this.sfxG.connect(this.master); this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.track) { const t = this.track; this.track = null; this.music(t); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.muted ? 0 : settings.master;
    this.musicG.gain.value = settings.music * 0.5;
    this.sfxG.gain.value = settings.sfx;
  }

  // ---------------------------------------------------------- primitives
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0, dest?: AudioNode) {
    const c = this.ctx!; const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest ?? this.sfxG); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, freq = 2000, when = 0, dest?: AudioNode) {
    const c = this.ctx!; const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest ?? this.sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------- sfx
  sfx(name: string) {
    if (!this.ctx || settings.muted) return;
    switch (name) {
      case 'hit': this.noise(0.08, 0.5, 1800); this.tone(220, 0.08, 'square', 0.25, 90); break;
      case 'hitHeavy': this.noise(0.18, 0.8, 900); this.tone(150, 0.18, 'square', 0.35, 50); this.tone(90, 0.22, 'sawtooth', 0.25, 40); break;
      case 'block': this.tone(520, 0.06, 'triangle', 0.3, 300); this.noise(0.05, 0.3, 4000); break;
      case 'jump': this.tone(300, 0.12, 'square', 0.15, 620); break;
      case 'dodge': this.noise(0.12, 0.25, 3000); break;
      case 'special': this.tone(440, 0.18, 'sawtooth', 0.2, 880); this.tone(660, 0.2, 'square', 0.12, 1320, 0.04); break;
      case 'boom': this.noise(0.4, 0.9, 400); this.tone(80, 0.4, 'sawtooth', 0.4, 30); break;
      case 'ko': this.tone(400, 0.6, 'sawtooth', 0.35, 60); this.noise(0.5, 0.6, 700); break;
      case 'fight': [0, 0.08, 0.16].forEach((w, i) => this.tone(330 * (1 + i * 0.25), 0.15, 'square', 0.25, undefined, w)); break;
      case 'menu': this.tone(660, 0.04, 'square', 0.12); break;
      case 'select': this.tone(520, 0.08, 'square', 0.18); this.tone(780, 0.1, 'square', 0.18, undefined, 0.07); break;
      case 'back': this.tone(400, 0.08, 'square', 0.15, 250); break;
      case 'unlock': [0, 0.1, 0.2, 0.3].forEach((w, i) => this.tone(mtof(64 + [0, 4, 7, 12][i]), 0.25, 'square', 0.2, undefined, w)); break;
      case 'typing': this.tone(900 + Math.random() * 200, 0.02, 'square', 0.04); break;
    }
  }

  // ---------------------------------------------------------- music
  music(id: string) {
    if (this.track === id) return;
    this.track = id;
    if (!this.ctx) return;
    clearInterval(this.timer);
    const tr = TRACKS[id]; if (!tr) return;
    this.rand = rng(tr.seed); this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.melody = Array.from({ length: 16 }, () => Math.floor(this.rand() * tr.scale.length));
    this.timer = window.setInterval(() => this.schedule(tr), 60);
  }
  stopMusic() { this.track = null; clearInterval(this.timer); }

  private schedule(tr: Track) {
    const c = this.ctx!; const sixteenth = 60 / tr.bpm / 4;
    while (this.nextT < c.currentTime + 0.25) {
      const s = this.step, t = this.nextT - c.currentTime;
      const bar = Math.floor(s / 16) % tr.prog.length, st = s % 16;
      const deg = tr.prog[bar];
      const note = (d: number, oct = 0) => tr.root + 12 * oct + tr.scale[((d % tr.scale.length) + tr.scale.length) % tr.scale.length] + 12 * Math.floor(d / tr.scale.length);
      if (tr.bass[st] === 'x') this.tone(mtof(note(deg, -1)), sixteenth * 1.8, 'triangle', 0.5, undefined, t, this.musicG);
      const a = tr.arp[st % tr.arp.length];
      if (st % 2 === 0 || tr.arp.length > 4) this.tone(mtof(note(deg + a, 1)), sixteenth * 0.9, tr.lead, 0.16, undefined, t, this.musicG);
      if (st % 4 === 0 && this.rand() < 0.7) this.tone(mtof(note(this.melody[(s >> 2) % 16] + deg, 2)), sixteenth * 3, tr.lead === 'sine' ? 'sine' : 'square', 0.1, undefined, t, this.musicG);
      const d = tr.drums[st];
      if (d === 'k') this.tone(130, 0.1, 'sine', 0.7, 40, t, this.musicG);
      else if (d === 's') this.noise(0.1, 0.35, 2500, t, this.musicG);
      else if (d === 'h') this.noise(0.03, 0.15, 7000, t, this.musicG);
      if (st === 15 && bar === tr.prog.length - 1) this.melody = this.melody.map((m) => (this.rand() < 0.3 ? Math.floor(this.rand() * tr.scale.length) : m));
      this.nextT += sixteenth; this.step++;
    }
  }
}
