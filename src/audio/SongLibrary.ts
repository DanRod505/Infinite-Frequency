import { STORES, openDatabase, requestResult, transactionDone } from '../core/db';

export interface SongMeta {
  /** Content hash: the same file is stored once. */
  id: string;
  title: string;
  duration: number;
  size: number;
  addedAt: number;
  lastPlayed: number;
}

/** Library limits: enough for a personal playlist without hoarding disk space. */
export const LIBRARY_MAX_SONGS = 12;
export const LIBRARY_MAX_BYTES = 250 * 1024 * 1024;

/**
 * Recently imported songs kept in the browser (GDD §10.1 "Selecionar
 * música", §10.2). Files never leave the computer; the oldest songs are
 * evicted when the library is full.
 */
export class SongLibrary {
  constructor(private readonly factory?: IDBFactory) {}

  async list(): Promise<SongMeta[]> {
    const db = await this.db();
    if (!db) return [];
    try {
      const songs = await requestResult<SongMeta[]>(db.transaction(STORES.songs, 'readonly').objectStore(STORES.songs).getAll(), []);
      return songs.sort((a, b) => b.lastPlayed - a.lastPlayed);
    } catch {
      return [];
    }
  }

  /** Stores a song (or refreshes it) and evicts the least recently played beyond the limits. */
  async add(meta: Omit<SongMeta, 'addedAt' | 'lastPlayed' | 'size'>, data: ArrayBuffer): Promise<boolean> {
    if (data.byteLength > LIBRARY_MAX_BYTES) return false;
    const db = await this.db();
    if (!db) return false;
    const now = Date.now();
    try {
      const existing = (await this.list()).filter((s) => s.id !== meta.id);
      const tx = db.transaction([STORES.songs, STORES.songData], 'readwrite');
      tx.objectStore(STORES.songs).put({ ...meta, size: data.byteLength, addedAt: now, lastPlayed: now } satisfies SongMeta);
      tx.objectStore(STORES.songData).put({ id: meta.id, data });
      // Evict from the oldest until both limits hold.
      let count = existing.length + 1;
      let bytes = existing.reduce((sum, s) => sum + s.size, 0) + data.byteLength;
      for (const song of [...existing].reverse()) {
        if (count <= LIBRARY_MAX_SONGS && bytes <= LIBRARY_MAX_BYTES) break;
        tx.objectStore(STORES.songs).delete(song.id);
        tx.objectStore(STORES.songData).delete(song.id);
        count--;
        bytes -= song.size;
      }
      return await transactionDone(tx);
    } catch {
      return false;
    }
  }

  async load(id: string): Promise<ArrayBuffer | null> {
    const db = await this.db();
    if (!db) return null;
    try {
      const entry = await requestResult<{ id: string; data: ArrayBuffer } | undefined>(
        db.transaction(STORES.songData, 'readonly').objectStore(STORES.songData).get(id),
        undefined,
      );
      return entry?.data ?? null;
    } catch {
      return null;
    }
  }

  async touch(id: string): Promise<void> {
    const db = await this.db();
    if (!db) return;
    try {
      const tx = db.transaction(STORES.songs, 'readwrite');
      const store = tx.objectStore(STORES.songs);
      const meta = await requestResult<SongMeta | undefined>(store.get(id), undefined);
      if (meta) store.put({ ...meta, lastPlayed: Date.now() });
      await transactionDone(tx);
    } catch {
      // Ordering is cosmetic.
    }
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    if (!db) return;
    try {
      const tx = db.transaction([STORES.songs, STORES.songData], 'readwrite');
      tx.objectStore(STORES.songs).delete(id);
      tx.objectStore(STORES.songData).delete(id);
      await transactionDone(tx);
    } catch {
      // Nothing else to do.
    }
  }

  private db(): Promise<IDBDatabase | null> {
    return openDatabase(this.factory);
  }
}
