import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, LATENCY_LIMIT_MS, Settings } from '../src/core/Settings';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe('Settings', () => {
  it('persists and reloads values', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    new Settings(storage).update({ volume: 0.3, reduceFlashes: true });
    const reloaded = new Settings(storage);
    expect(reloaded.values.volume).toBe(0.3);
    expect(reloaded.values.reduceFlashes).toBe(true);
  });

  it('clamps and repairs invalid values', () => {
    const storage = new MemoryStorage();
    storage.setItem('infinite-frequency.settings.v1', JSON.stringify({ volume: 7, latencyMs: -9999, effects: 'x', cameraShake: 1 }));
    const settings = new Settings(storage as unknown as Storage);
    expect(settings.values.volume).toBe(1);
    expect(settings.values.latencyMs).toBe(-LATENCY_LIMIT_MS);
    expect(settings.values.effects).toBe(DEFAULT_SETTINGS.effects);
    expect(settings.values.cameraShake).toBe(DEFAULT_SETTINGS.cameraShake);
  });

  it('survives corrupt or missing storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('infinite-frequency.settings.v1', '{not json');
    expect(new Settings(storage as unknown as Storage).values).toEqual(DEFAULT_SETTINGS);
    const settings = new Settings(null);
    settings.update({ latencyMs: 25 });
    expect(settings.values.latencyMs).toBe(25);
  });

  it('notifies subscribers', () => {
    const settings = new Settings(null);
    const seen: number[] = [];
    const unsubscribe = settings.subscribe((v) => seen.push(v.effects));
    settings.update({ effects: 0.5 });
    unsubscribe();
    settings.update({ effects: 0.2 });
    expect(seen).toEqual([0.5]);
  });
});

describe('Settings: run options', () => {
  it('keeps valid mode and difficulty and repairs invalid ones', () => {
    const storage = new MemoryStorage();
    storage.setItem('infinite-frequency.settings.v1', JSON.stringify({ mode: 'free', difficulty: 'insane', obstacles: 'yes' }));
    const settings = new Settings(storage as unknown as Storage);
    expect(settings.values.mode).toBe('free');
    expect(settings.values.difficulty).toBe(DEFAULT_SETTINGS.difficulty);
    expect(settings.values.obstacles).toBe(DEFAULT_SETTINGS.obstacles);
  });
});
