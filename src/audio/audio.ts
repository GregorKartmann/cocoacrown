/**
 * Synthesised sound effects and a light generative background loop using the
 * Web Audio API – no audio files needed, works offline, tiny download.
 * Audio starts only after the first user gesture (browser autoplay rules).
 */
export type Sfx = 'tap' | 'batch' | 'sale' | 'upgrade' | 'milestone' | 'unlock' | 'golden' | 'skill' | 'fail' | 'claim' | 'hire';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  sfxOn = true;
  musicOn = true;
  private last: Partial<Record<Sfx, number>> = {};

  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyMusic();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.applyMusic();
  }

  private applyMusic() {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(this.musicOn ? 0.16 : 0, t + 0.6);
    if (this.musicOn && !this.musicTimer) {
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.musicTimer = setInterval(() => this.schedule(), 120);
    } else if (!this.musicOn && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  play(s: Sfx) {
    if (!this.sfxOn || !this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const minGap: Partial<Record<Sfx, number>> = { batch: 0.12, sale: 0.09, tap: 0.03 };
    const lastT = this.last[s] ?? -1;
    if (now - lastT < (minGap[s] ?? 0.02)) return;
    this.last[s] = now;
    const d = this.sfxGain;
    switch (s) {
      case 'tap':
        this.tone(520 + Math.random() * 80, now, 0.09, 'sine', 0.35, d, 260);
        break;
      case 'batch':
        this.tone(330, now, 0.08, 'triangle', 0.12, d, 220);
        break;
      case 'sale':
        this.tone(1318, now, 0.12, 'triangle', 0.18, d);
        this.tone(1760, now + 0.05, 0.2, 'triangle', 0.16, d);
        break;
      case 'upgrade':
        [523, 659, 784].forEach((f, i) => this.tone(f, now + i * 0.05, 0.14, 'square', 0.07, d));
        break;
      case 'milestone':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.07, 0.22, 'triangle', 0.2, d));
        break;
      case 'unlock':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.09, 0.3, 'triangle', 0.22, d));
        this.tone(130, now, 0.6, 'sine', 0.25, d);
        break;
      case 'golden':
        [1568, 1976, 2349, 2637].forEach((f, i) => this.tone(f, now + i * 0.06, 0.25, 'sine', 0.15, d));
        break;
      case 'skill':
        this.tone(220, now, 0.35, 'sawtooth', 0.08, d, 880);
        this.tone(660, now + 0.12, 0.25, 'triangle', 0.15, d);
        break;
      case 'claim':
        [784, 988, 1175].forEach((f, i) => this.tone(f, now + i * 0.06, 0.18, 'triangle', 0.18, d));
        break;
      case 'hire':
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, now + i * 0.06, 0.2, 'triangle', 0.17, d));
        break;
      case 'fail':
        this.tone(160, now, 0.18, 'square', 0.08, d, 110);
        break;
    }
  }

  /** Simple pentatonic marimba loop with soft bass, scheduled ahead of time. */
  private schedule() {
    if (!this.ctx || !this.musicGain) return;
    const bpm = 92;
    const eighth = 60 / bpm / 2;
    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    const bass = [130.8, 110.0, 146.8, 98.0];
    const pattern = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 3, 2];
    while (this.nextNoteTime < this.ctx.currentTime + 0.4) {
      const st = this.step % 64;
      const bar = Math.floor(st / 16);
      const idx = pattern[st % 16];
      if (st % 16 !== 7 && st % 16 !== 15) {
        const f = scale[(idx + bar) % scale.length];
        this.tone(f, this.nextNoteTime, 0.32, 'sine', 0.22, this.musicGain);
        this.tone(f * 2, this.nextNoteTime, 0.12, 'triangle', 0.05, this.musicGain);
      }
      if (st % 8 === 0) this.tone(bass[bar], this.nextNoteTime, 0.7, 'triangle', 0.3, this.musicGain);
      this.nextNoteTime += eighth;
      this.step++;
    }
  }
}

export const audio = new AudioEngine();

export function haptic(enabled: boolean, ms = 8) {
  if (!enabled) return;
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}
