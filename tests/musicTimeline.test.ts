import { describe, expect, it } from 'vitest';
import type { MusicAnalysis } from '../src/audio/analysisTypes';
import { MusicTimeline, createMusicFrame, type MusicEvent } from '../src/audio/MusicTimeline';
import { PlaybackClock } from '../src/audio/PlaybackClock';

function fakeAnalysis(): MusicAnalysis {
  const frameRate = 10;
  const frames = 100;
  const ramp = new Float32Array(frames).map((_, i) => i / (frames - 1));
  return {
    version: 1,
    duration: 10,
    frameRate,
    energy: ramp,
    low: ramp,
    mid: ramp,
    high: ramp,
    onsetStrength: ramp,
    onsets: [],
    tempo: { bpm: 120, confidence: 1, reliable: true },
    beats: Array.from({ length: 20 }, (_, i) => ({ time: i * 0.5, strength: 0.5, downbeat: i % 4 === 0 })),
    sections: [
      { start: 0, end: 4, intensity: 0.2, level: 'low' },
      { start: 4, end: 10, intensity: 0.9, level: 'high' },
    ],
    drops: [4],
  };
}

describe('MusicTimeline', () => {
  it('emits every event exactly once regardless of frame rate', () => {
    for (const fps of [7, 30, 60, 144, 1000]) {
      const timeline = new MusicTimeline(fakeAnalysis());
      const seen: MusicEvent[] = [];
      for (let t = -1; t <= 11; t += 1 / fps) timeline.advance(t, (e) => seen.push(e));
      expect(seen.filter((e) => e.type === 'beat')).toHaveLength(20);
      expect(seen.filter((e) => e.type === 'section')).toHaveLength(1);
      expect(seen.filter((e) => e.type === 'drop')).toHaveLength(1);
      expect(seen.filter((e) => e.type === 'end')).toHaveLength(1);
      for (let i = 1; i < seen.length; i++) expect(seen[i].time).toBeGreaterThanOrEqual(seen[i - 1].time);
    }
  });

  it('orders the section and drop before the beat they share', () => {
    const timeline = new MusicTimeline(fakeAnalysis());
    const types: string[] = [];
    timeline.advance(4, (e) => {
      if (e.time === 4) types.push(e.type);
    });
    expect(types).toEqual(['section', 'drop', 'beat']);
  });

  it('rewinds silently on restart and replays events after it', () => {
    const timeline = new MusicTimeline(fakeAnalysis());
    timeline.advance(5, () => {});
    const replay: MusicEvent[] = [];
    timeline.advance(1.2, (e) => replay.push(e));
    expect(replay).toEqual([]);
    timeline.advance(2, (e) => replay.push(e));
    expect(replay.map((e) => e.time)).toEqual([1.5, 2]);
  });

  it('samples features, section and beat phase', () => {
    const timeline = new MusicTimeline(fakeAnalysis());
    const frame = timeline.sample(5.2, createMusicFrame());
    expect(frame.progress).toBeCloseTo(0.52, 9);
    expect(frame.sectionIndex).toBe(1);
    expect(frame.sectionIntensity).toBe(0.9);
    expect(frame.sinceBeat).toBeCloseTo(0.2, 9);
    expect(frame.sinceDownbeat).toBeCloseTo(1.2, 9);
    expect(frame.energy).toBeGreaterThan(0.4);
    const before = timeline.sample(-1, createMusicFrame());
    expect(before.energy).toBe(0);
    expect(before.sinceBeat).toBe(Infinity);
  });
});

describe('PlaybackClock', () => {
  it('maps context time to song position through pauses', () => {
    const clock = new PlaybackClock();
    clock.start(100, -3); // lead-in of 3 s
    expect(clock.position(101)).toBeCloseTo(-2, 9);
    expect(clock.position(110)).toBeCloseTo(7, 9);
    clock.pause(110);
    expect(clock.position(500)).toBeCloseTo(7, 9);
    clock.start(600, clock.position(0));
    expect(clock.position(601.5)).toBeCloseTo(8.5, 9);
    clock.reset();
    expect(clock.isRunning).toBe(false);
    expect(clock.position(1000)).toBe(0);
  });
});
