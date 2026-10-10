import type { MusicAnalysis } from './analysisTypes';
import { ANALYZER_VERSION } from './MusicAnalyzer';

const DB_NAME = 'infinite-frequency';
const STORE = 'analyses';
const MAX_ENTRIES = 20;

interface Entry {
  key: string;
  savedAt: number;
  analysis: MusicAnalysis;
}

/**
 * Caches analyses in IndexedDB keyed by the file's content hash, so a song
 * only needs to be analysed once (GDD §10.2, D09). Every failure degrades to
 * "not cached"; the cache is never required for the game to work.
 */
export class AnalysisCache {
  private db: Promise<IDBDatabase | null> | null = null;

  /** SHA-256 of the file contents combined with the analyzer version. */
  static async keyFor(data: ArrayBuffer): Promise<string | null> {
    try {
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      return `v${ANALYZER_VERSION}:${hex}`;
    } catch {
      return null;
    }
  }

  async get(key: string): Promise<MusicAnalysis | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        request.onsuccess = () => {
          const entry = request.result as Entry | undefined;
          resolve(entry && entry.analysis.version === ANALYZER_VERSION ? entry.analysis : null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async put(key: string, analysis: MusicAnalysis): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        store.put({ key, savedAt: Date.now(), analysis } satisfies Entry);
        // Keep only the most recent entries.
        const all = store.index('savedAt').getAllKeys();
        all.onsuccess = () => {
          const keys = all.result;
          for (let i = 0; i < keys.length - MAX_ENTRIES; i++) store.delete(keys[i]);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('savedAt', 'savedAt');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }
}
