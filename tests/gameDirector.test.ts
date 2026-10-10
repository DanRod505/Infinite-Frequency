import { describe, expect, it } from 'vitest';
import type { MusicAnalysis } from '../src/audio/analysisTypes';
import { MusicTimeline } from '../src/audio/MusicTimeline';
import { DEFAULT_SETTINGS } from '../src/core/Settings';
import { GameDirector } from '../src/game/GameDirector';

function analysis(): MusicAnalysis {
  const frames = 200;
  const loud = new Float32Array(frames).map((_, i) => (i < 100 ? 0.1 : 0.9));
  return {
    version: 1,
    duration: 20,
    frameRate: 10,
    energy: loud,
    low: loud,
    mid: loud,
    high: loud,
    onsetStrength: loud,
    onsets: [],
    tempo: { bpm: 120, confidence: 1, reliable: true },
    beats: Array.from({ length: 40 }, (_, i) => ({ time: i * 0.5, strength: 1, downbeat: i % 4 === 0 })),
    sections: [
      { start: 0, end: 10, intensity: 0.1, level: 'low' },
      { start: 10, end: 20, intensity: 0.9, level: 'high' },
    ],
    drops: [10],
  };
}

function run(director: GameDirector, from: number, to: number, dt = 1 / 60) {
  let state = director.update(from, dt);
  for (let t = from; t <= to; t += dt) state = director.update(t, dt);
  return state;
}

describe('GameDirector', () => {
  it('reacts to sections, beats and drops', () => {
    let drops = 0;
    let beats = 0;
    let ended = false;
    const director = new GameDirector(DEFAULT_SETTINGS, { onDrop: () => drops++, onBeat: () => beats++, onEnd: () => (ended = true) });
    director.setTimeline(new MusicTimeline(analysis()), -3);
    const calm = { ...run(director, -3, 9) };
    const intense = { ...run(director, 9, 14) };
    expect(intense.intensity).toBeGreaterThan(calm.intensity + 0.3);
    expect(intense.bass).toBeGreaterThan(calm.bass);
    run(director, 14, 21);
    expect(drops).toBe(1);
    expect(beats).toBe(40);
    expect(ended).toBe(true);
  });

  it('pulses right after a beat and decays before the next', () => {
    const director = new GameDirector(DEFAULT_SETTINGS);
    director.setTimeline(new MusicTimeline(analysis()), 0);
    expect(run(director, 1.98, 2.02).beatPulse).toBeGreaterThan(0.8);
    expect(director.update(2.45, 1 / 60).beatPulse).toBeLessThan(0.1);
  });

  it('flashes on drops only when flashes are allowed', () => {
    const normal = new GameDirector(DEFAULT_SETTINGS);
    normal.setTimeline(new MusicTimeline(analysis()), 9);
    expect(run(normal, 9.9, 10.05).flash).toBeGreaterThan(0.5);

    const reduced = new GameDirector({ ...DEFAULT_SETTINGS, reduceFlashes: true });
    reduced.setTimeline(new MusicTimeline(analysis()), 9);
    const state = run(reduced, 9.9, 10.05);
    expect(state.flash).toBe(0);
    expect(state.beatPulse).toBeLessThanOrEqual(0.5);
  });

  it('removes music reactions when effects are at zero', () => {
    const director = new GameDirector({ ...DEFAULT_SETTINGS, effects: 0 });
    director.setTimeline(new MusicTimeline(analysis()), 9);
    const state = run(director, 9.9, 12);
    expect(state.flash).toBe(0);
    expect(state.beatPulse).toBe(0);
    expect(state.bass).toBeCloseTo(0.3, 9);
  });
});
