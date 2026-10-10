import { describe, expect, it } from 'vitest';
import { Records } from '../src/rhythm/Records';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe('Records', () => {
  it('keeps only the best score per key and persists it', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const records = new Records(storage);
    const key = Records.key('song', 'normal', true);
    expect(records.submit(key, { score: 1000, rank: 'B', maxCombo: 10, date: 1 })).toEqual({ previous: null, isNewBest: true });
    expect(records.submit(key, { score: 800, rank: 'C', maxCombo: 5, date: 2 }).isNewBest).toBe(false);
    expect(records.submit(key, { score: 1500, rank: 'A', maxCombo: 30, date: 3 }).previous?.score).toBe(1000);
    expect(new Records(storage).get(key)?.score).toBe(1500);
    expect(new Records(storage).get(Records.key('song', 'hard', true))).toBeNull();
  });

  it('ignores corrupt data', () => {
    const storage = new MemoryStorage();
    storage.setItem('infinite-frequency.records.v1', JSON.stringify({ a: { score: 'x' }, b: { score: 5, rank: 'Z' }, c: { score: 9, rank: 'S' } }));
    const records = new Records(storage as unknown as Storage);
    expect(records.get('a')).toBeNull();
    expect(records.get('b')).toBeNull();
    expect(records.get('c')?.score).toBe(9);
  });
});
