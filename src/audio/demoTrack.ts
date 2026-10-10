import { Rng } from '../core/rng';

/**
 * Procedurally synthesised demo song with a known structure.
 *
 * Lets players try the game without a file and gives the analyzer tests a
 * ground truth (tempo, beat times, sections and drops are all known).
 */
export interface DemoTrack {
  samples: Float32Array;
  sampleRate: number;
  bpm: number;
  /** Time of every beat (kick grid), including sections without a kick. */
  beatTimes: number[];
  sections: { name: string; start: number; end: number; level: 'low' | 'mid' | 'high' }[];
  drops: number[];
}

export const DEMO_TITLE = 'Neon Pulse (demo)';
const BPM = 128;
const START_OFFSET = 0.1;

type Part = { name: string; bars: number; level: 'low' | 'mid' | 'high' };
const STRUCTURE: Part[] = [
  { name: 'intro', bars: 8, level: 'low' },
  { name: 'build', bars: 8, level: 'mid' },
  { name: 'drop', bars: 16, level: 'high' },
  { name: 'break', bars: 8, level: 'low' },
  { name: 'build', bars: 4, level: 'mid' },
  { name: 'drop', bars: 16, level: 'high' },
  { name: 'outro', bars: 4, level: 'mid' },
];

/** Am – F – C – G, one chord per bar. */
const ROOTS = [110, 87.31, 130.81, 98];
const CHORDS = [
  [440, 523.25, 659.25],
  [349.23, 440, 523.25],
  [523.25, 659.25, 783.99],
  [392, 493.88, 587.33],
];

export function synthesizeDemoTrack(sampleRate = 44100): DemoTrack {
  const beat = 60 / BPM;
  const bar = beat * 4;
  const totalBars = STRUCTURE.reduce((sum, p) => sum + p.bars, 0);
  const duration = START_OFFSET + totalBars * bar + 1.5;
  const out = new Float32Array(Math.ceil(duration * sampleRate));
  const synth = new Synth(out, sampleRate, new Rng(0x5eed));

  const sections: DemoTrack['sections'] = [];
  const drops: number[] = [];
  const beatTimes: number[] = [];
  let barIndex = 0;

  for (const part of STRUCTURE) {
    const partStart = START_OFFSET + barIndex * bar;
    sections.push({ name: part.name, start: partStart, end: partStart + part.bars * bar, level: part.level });
    if (part.name === 'drop') drops.push(partStart);

    for (let b = 0; b < part.bars; b++, barIndex++) {
      const barStart = START_OFFSET + barIndex * bar;
      const chord = barIndex % 4;
      const progress = b / part.bars;

      for (let q = 0; q < 4; q++) {
        const t = barStart + q * beat;
        beatTimes.push(t);
        switch (part.name) {
          case 'intro':
            synth.hat(t, 0.05);
            synth.hat(t + beat / 2, 0.035);
            break;
          case 'build':
            synth.kick(t, 0.45 + 0.25 * progress);
            synth.hat(t + beat / 2, 0.06);
            if (part.bars <= 4 || progress >= 0.5) {
              // Snare roll that doubles in density toward the drop.
              const hits = progress < 0.75 ? 2 : 4;
              for (let h = 0; h < hits; h++) synth.snare(t + (h * beat) / hits, 0.12 + 0.2 * progress);
            }
            break;
          case 'drop':
            synth.kick(t, 1);
            synth.bass(t + beat / 2, ROOTS[chord], beat * 0.45, 0.32);
            if (q === 1 || q === 3) synth.snare(t, 0.35);
            for (let s = 0; s < 4; s++) synth.hat(t + (s * beat) / 4, s % 2 === 0 ? 0.07 : 0.045);
            break;
          case 'break':
            synth.hat(t + beat / 2, 0.025);
            break;
          case 'outro':
            synth.kick(t, 0.7 * (1 - progress * 0.6));
            synth.hat(t + beat / 2, 0.05);
            break;
        }
      }

      const padGain = part.level === 'high' ? 0.1 : part.name === 'outro' ? 0.05 : 0.07;
      synth.pad(barStart, bar, CHORDS[chord], padGain);
    }
    if (part.name === 'build') synth.riser(partStart, part.bars * bar, 0.12);
  }

  synth.normalise(0.9);
  return { samples: out, sampleRate, bpm: BPM, beatTimes, sections, drops };
}

class Synth {
  constructor(
    private readonly out: Float32Array,
    private readonly rate: number,
    private readonly rng: Rng,
  ) {}

  kick(time: number, gain: number): void {
    let phase = 0;
    this.render(time, 0.35, (t) => {
      const freq = 48 + 110 * Math.exp(-t * 30);
      phase += (2 * Math.PI * freq) / this.rate;
      const click = t < 0.004 ? 0.6 * (1 - t / 0.004) : 0;
      return (Math.sin(phase) * Math.exp(-t * 9) + click) * gain;
    });
  }

  snare(time: number, gain: number): void {
    let prev = 0;
    this.render(time, 0.18, (t) => {
      const noise = this.rng.next() * 2 - 1;
      const bright = noise - prev * 0.5;
      prev = noise;
      const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30);
      return (bright * Math.exp(-t * 22) * 0.8 + tone * 0.5) * gain;
    });
  }

  hat(time: number, gain: number): void {
    let prev = 0;
    this.render(time, 0.06, (t) => {
      const noise = this.rng.next() * 2 - 1;
      const highPassed = noise - prev;
      prev = noise;
      return highPassed * Math.exp(-t * 70) * gain;
    });
  }

  bass(time: number, freq: number, length: number, gain: number): void {
    this.render(time, length, (t) => {
      let v = 0;
      for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * freq * k * t) / k;
      const envelope = Math.min(1, t / 0.005) * Math.min(1, (length - t) / 0.03);
      return v * envelope * gain;
    });
  }

  pad(time: number, length: number, freqs: number[], gain: number): void {
    this.render(time, length, (t) => {
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * t);
      const envelope = Math.min(1, t / 0.4) * Math.min(1, (length - t) / 0.2);
      return (v / freqs.length) * envelope * gain;
    });
  }

  riser(time: number, length: number, gain: number): void {
    let prev = 0;
    this.render(time, length, (t) => {
      const noise = this.rng.next() * 2 - 1;
      const highPassed = noise - prev;
      prev = noise;
      const x = t / length;
      return highPassed * x * x * gain;
    });
  }

  normalise(peak: number): void {
    let max = 0;
    for (const v of this.out) max = Math.max(max, Math.abs(v));
    if (max === 0) return;
    const g = peak / max;
    for (let i = 0; i < this.out.length; i++) this.out[i] *= g;
  }

  private render(time: number, length: number, voice: (t: number) => number): void {
    const start = Math.round(time * this.rate);
    const count = Math.round(length * this.rate);
    for (let i = 0; i < count; i++) {
      const j = start + i;
      if (j >= this.out.length) break;
      this.out[j] += voice(i / this.rate);
    }
  }
}
