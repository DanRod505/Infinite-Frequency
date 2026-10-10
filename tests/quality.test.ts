import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '../src/game/Quality';

function run(quality: AdaptiveQuality, fps: number, seconds: number) {
  const changes: string[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const change = quality.sample(1 / fps);
    if (change) changes.push(change);
  }
  return changes;
}

describe('AdaptiveQuality', () => {
  it('keeps the level while the frame rate is fine', () => {
    expect(run(new AdaptiveQuality('high'), 60, 20)).toEqual([]);
  });

  it('steps down one level at a time and stops at low', () => {
    const quality = new AdaptiveQuality('high');
    expect(run(quality, 25, 30)).toEqual(['medium', 'low']);
    expect(quality.level).toBe('low');
  });

  it('waits for the grace period and ignores hitches', () => {
    const quality = new AdaptiveQuality('high');
    expect(quality.sample(0.5)).toBeNull(); // tab switch
    expect(run(quality, 20, 4.9)).toEqual([]); // 2 s grace + 3 s window not complete yet
    expect(run(quality, 20, 0.3)).toEqual(['medium']);
  });
});
