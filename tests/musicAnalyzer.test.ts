import { beforeAll, describe, expect, it } from 'vitest';
import { FFT } from '../src/audio/fft';
import { analyzeMusic, mixToMono, sampleAt } from '../src/audio/MusicAnalyzer';
import { synthesizeDemoTrack, type DemoTrack } from '../src/audio/demoTrack';
import type { MusicAnalysis } from '../src/audio/analysisTypes';
import { Rng } from '../src/core/rng';

const RATE = 44100;

function nearestError(time: number, truth: number[]): number {
  let best = Infinity;
  for (const t of truth) if (Math.abs(time - t) < Math.abs(best)) best = time - t;
  return best;
}

/** Click track: short decaying tone bursts on every beat, accented downbeats. */
function clickTrack(bpm: number, seconds: number, offset = 0.2): { samples: Float32Array; beats: number[] } {
  const samples = new Float32Array(Math.round(seconds * RATE));
  const beats: number[] = [];
  for (let t = offset, i = 0; t < seconds - 0.2; t += 60 / bpm, i++) {
    beats.push(t);
    const start = Math.round(t * RATE);
    const gain = i % 4 === 0 ? 0.9 : 0.6;
    for (let k = 0; k < 0.08 * RATE && start + k < samples.length; k++) {
      samples[start + k] += gain * Math.sin((2 * Math.PI * 80 * k) / RATE) * Math.exp(-k / (0.02 * RATE));
    }
  }
  return { samples, beats };
}

describe('FFT', () => {
  it('finds the frequency of a pure tone', () => {
    const n = 1024;
    const fft = new FFT(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 37 * i) / n);
    fft.transform(re, im);
    let peak = 0;
    for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[peak], im[peak])) peak = k;
    expect(peak).toBe(37);
    expect(Math.hypot(re[37], im[37])).toBeCloseTo(n / 2, 6);
  });

  it('rejects non power-of-two sizes', () => {
    expect(() => new FFT(1000)).toThrow();
  });
});

describe('analyzeMusic on the demo track (known ground truth)', () => {
  let demo: DemoTrack;
  let analysis: MusicAnalysis;

  beforeAll(() => {
    demo = synthesizeDemoTrack(RATE);
    analysis = analyzeMusic(demo.samples, demo.sampleRate);
  });

  it('estimates the tempo', () => {
    expect(analysis.tempo.reliable).toBe(true);
    expect(analysis.tempo.bpm).toBeGreaterThan(demo.bpm - 0.5);
    expect(analysis.tempo.bpm).toBeLessThan(demo.bpm + 0.5);
  });

  it('places beats within 20 ms of the true grid, without drift', () => {
    expect(analysis.beats.length).toBeGreaterThan(demo.beatTimes.length * 0.95);
    for (const beat of analysis.beats) expect(Math.abs(nearestError(beat.time, demo.beatTimes))).toBeLessThan(0.02);
    // No duplicates: consecutive beats are about one period apart.
    for (let i = 1; i < analysis.beats.length; i++) {
      expect(analysis.beats[i].time - analysis.beats[i - 1].time).toBeGreaterThan((60 / demo.bpm) * 0.9);
    }
  });

  it('finds the bar phase', () => {
    const barStarts = demo.beatTimes.filter((_, i) => i % 4 === 0);
    const downbeats = analysis.beats.filter((b) => b.downbeat);
    expect(downbeats.length).toBeGreaterThan(barStarts.length * 0.9);
    for (const beat of downbeats) expect(Math.abs(nearestError(beat.time, barStarts))).toBeLessThan(0.02);
  });

  it('detects onsets without timing bias', () => {
    const errors = analysis.onsets.map((t) => nearestError(t, demo.beatTimes)).filter((e) => Math.abs(e) < 0.05);
    expect(errors.length).toBeGreaterThan(100);
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(Math.abs(meanError)).toBeLessThan(0.01);
  });

  it('segments the structure by intensity', () => {
    expect(analysis.sections.map((s) => s.level)).toEqual(demo.sections.map((s) => s.level));
    analysis.sections.slice(1).forEach((section, i) => {
      expect(Math.abs(section.start - demo.sections[i + 1].start)).toBeLessThan(0.1);
    });
    expect(analysis.sections[0].start).toBe(0);
    expect(analysis.sections.at(-1)!.end).toBeCloseTo(analysis.duration, 6);
  });

  it('estimates drops', () => {
    expect(analysis.drops.length).toBe(demo.drops.length);
    analysis.drops.forEach((drop, i) => expect(Math.abs(drop - demo.drops[i])).toBeLessThan(0.1));
  });

  it('measures more energy and bass in drops than in the break', () => {
    const mean = (feature: Float32Array, from: number, to: number) => {
      let sum = 0;
      let n = 0;
      for (let t = from; t < to; t += 0.05, n++) sum += sampleAt(feature, t, analysis.frameRate);
      return sum / n;
    };
    const drop = demo.sections[2];
    const breakdown = demo.sections[3];
    expect(mean(analysis.energy, drop.start, drop.end)).toBeGreaterThan(mean(analysis.energy, breakdown.start, breakdown.end) + 0.3);
    expect(mean(analysis.low, drop.start, drop.end)).toBeGreaterThan(mean(analysis.low, breakdown.start, breakdown.end) + 0.3);
  });

  it('keeps all normalised features in [0, 1]', () => {
    for (const feature of [analysis.energy, analysis.low, analysis.mid, analysis.high, analysis.onsetStrength]) {
      for (const v of feature) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic', () => {
    const again = analyzeMusic(demo.samples, demo.sampleRate);
    expect(again.beats).toEqual(analysis.beats);
    expect(again.sections).toEqual(analysis.sections);
  });
});

describe('analyzeMusic on other material', () => {
  for (const bpm of [90, 140]) {
    it(`tracks a ${bpm} BPM click track`, () => {
      const { samples, beats } = clickTrack(bpm, 40);
      const analysis = analyzeMusic(samples, RATE);
      expect(analysis.tempo.reliable).toBe(true);
      expect(Math.abs(analysis.tempo.bpm - bpm)).toBeLessThan(0.5);
      for (const beat of analysis.beats) expect(Math.abs(nearestError(beat.time, beats))).toBeLessThan(0.02);
    });
  }

  it('handles 48 kHz input', () => {
    const rate = 48000;
    const samples = new Float32Array(rate * 20);
    const period = 0.5;
    for (let t = 0.1; t < 19.8; t += period) {
      const start = Math.round(t * rate);
      for (let k = 0; k < 0.05 * rate; k++) samples[start + k] = Math.sin((2 * Math.PI * 70 * k) / rate) * Math.exp(-k / (0.015 * rate));
    }
    const analysis = analyzeMusic(samples, rate);
    expect(Math.abs(analysis.tempo.bpm - 120)).toBeLessThan(0.5);
    expect(analysis.duration).toBeCloseTo(20, 6);
  });

  it('survives silence', () => {
    const analysis = analyzeMusic(new Float32Array(RATE * 5), RATE);
    expect(analysis.tempo.reliable).toBe(false);
    expect(analysis.beats).toEqual([]);
    expect(analysis.onsets).toEqual([]);
    expect(analysis.sections).toHaveLength(1);
    expect(Array.from(analysis.energy).every((v) => v === 0)).toBe(true);
  });

  it('flags noise without a pulse as unreliable', () => {
    const rng = new Rng(3);
    const samples = new Float32Array(RATE * 20).map(() => (rng.next() * 2 - 1) * 0.3);
    const analysis = analyzeMusic(samples, RATE);
    expect(analysis.tempo.reliable).toBe(false);
  });

  it('handles clips shorter than one analysis frame', () => {
    const analysis = analyzeMusic(new Float32Array(300).fill(0.1), RATE);
    expect(analysis.duration).toBeCloseTo(300 / RATE, 9);
    expect(analysis.energy.length).toBe(1);
  });

  it('mixes channels down to mono', () => {
    const mono = mixToMono([new Float32Array([1, 0, 0.5]), new Float32Array([0, 1, 0.5])]);
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0.5]);
  });

  it('reports progress up to completion', () => {
    const stages: number[] = [];
    analyzeMusic(clickTrack(120, 10).samples, RATE, { onProgress: (p) => stages.push(p.progress) });
    expect(stages.at(-1)).toBe(1);
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1]);
  });
});
