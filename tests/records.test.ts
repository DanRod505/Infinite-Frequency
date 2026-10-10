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
    expect(records.submit(key, { title: 'Song', score: 1000, rank: 'B', maxCombo: 10, date: 1 })).toEqual({ previous: null, isNewBest: true });
    expect(records.submit(key, { title: 'Song', score: 800, rank: 'C', maxCombo: 5, date: 2 }).isNewBest).toBe(false);
    expect(records.submit(key, { title: 'Song', score: 1500, rank: 'A', maxCombo: 30, date: 3 }).previous?.score).toBe(1000);
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

describe('Records listing', () => {
  it('lists records newest first with decoded options, and clears them', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const records = new Records(storage);
    records.submit(Records.key('a', 'easy', false), { title: 'A', score: 10, rank: 'D', maxCombo: 1, date: 1 });
    records.submit(Records.key('b', 'hard', true), { title: 'B', score: 20, rank: 'C', maxCombo: 2, date: 2 });
    const list = records.list();
    expect(list.map((r) => r.title)).toEqual(['B', 'A']);
    expect(list[0]).toMatchObject({ difficulty: 'hard', obstacles: true });
    expect(list[1]).toMatchObject({ difficulty: 'easy', obstacles: false });
    records.clear();
    expect(records.list()).toEqual([]);
    expect(new Records(storage).list()).toEqual([]);
  });

  it('gives old records without a title a placeholder', () => {
    const storage = new MemoryStorage();
    storage.setItem('infinite-frequency.records.v1', JSON.stringify({ k: { score: 5, rank: 'A' } }));
    expect(new Records(storage as unknown as Storage).get('k')?.title).toBe('Música sem título');
  });
});
