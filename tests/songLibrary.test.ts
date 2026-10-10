import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LIBRARY_MAX_SONGS, SongLibrary } from '../src/audio/SongLibrary';
import { resetDatabaseConnection } from '../src/core/db';

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill).buffer;

describe('SongLibrary', () => {
  let library: SongLibrary;
  beforeEach(() => {
    resetDatabaseConnection();
    library = new SongLibrary(new IDBFactory());
  });

  it('stores, lists and loads songs', async () => {
    expect(await library.add({ id: 'a', title: 'Song A', duration: 120 }, bytes(10, 7))).toBe(true);
    const list = await library.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', title: 'Song A', duration: 120, size: 10 });
    const data = await library.load('a');
    expect(new Uint8Array(data!)[0]).toBe(7);
    expect(await library.load('missing')).toBeNull();
  });

  it('lists the most recently played first and stores a file only once', async () => {
    await library.add({ id: 'a', title: 'A', duration: 1 }, bytes(4));
    await new Promise((r) => setTimeout(r, 5));
    await library.add({ id: 'b', title: 'B', duration: 1 }, bytes(4));
    await new Promise((r) => setTimeout(r, 5));
    await library.touch('a');
    expect((await library.list()).map((s) => s.id)).toEqual(['a', 'b']);
    await library.add({ id: 'a', title: 'A', duration: 1 }, bytes(4));
    expect(await library.list()).toHaveLength(2);
  });

  it('evicts the least recently played songs beyond the limit', async () => {
    for (let i = 0; i < LIBRARY_MAX_SONGS + 3; i++) {
      await library.add({ id: `s${i}`, title: `S${i}`, duration: 1 }, bytes(4));
      await new Promise((r) => setTimeout(r, 2));
    }
    const ids = (await library.list()).map((s) => s.id);
    expect(ids).toHaveLength(LIBRARY_MAX_SONGS);
    expect(ids).not.toContain('s0');
    expect(ids).toContain(`s${LIBRARY_MAX_SONGS + 2}`);
    expect(await library.load('s0')).toBeNull();
  });

  it('removes songs', async () => {
    await library.add({ id: 'a', title: 'A', duration: 1 }, bytes(4));
    await library.remove('a');
    expect(await library.list()).toEqual([]);
    expect(await library.load('a')).toBeNull();
  });
});
