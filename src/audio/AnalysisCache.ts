import { STORES, openDatabase, requestResult, transactionDone } from '../core/db';
import type { MusicAnalysis } from './analysisTypes';
import { ANALYZER_VERSION } from './MusicAnalyzer';

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
  /** SHA-256 of the file contents combined with the analyzer version. */
  static async keyFor(data: ArrayBuffer): Promise<string | null> {
    const hash = await contentHash(data);
    return hash ? `v${ANALYZER_VERSION}:${hash}` : null;
  }

  async get(key: string): Promise<MusicAnalysis | null> {
    const db = await openDatabase();
    if (!db) return null;
    try {
      const entry = await requestResult<Entry | undefined>(db.transaction(STORES.analyses, 'readonly').objectStore(STORES.analyses).get(key), undefined);
      return entry && entry.analysis.version === ANALYZER_VERSION ? entry.analysis : null;
    } catch {
      return null;
    }
  }

  async put(key: string, analysis: MusicAnalysis): Promise<void> {
    const db = await openDatabase();
    if (!db) return;
    try {
      const tx = db.transaction(STORES.analyses, 'readwrite');
      const store = tx.objectStore(STORES.analyses);
      store.put({ key, savedAt: Date.now(), analysis } satisfies Entry);
      // Keep only the most recent entries.
      const all = store.index('savedAt').getAllKeys();
      all.onsuccess = () => {
        const keys = all.result;
        for (let i = 0; i < keys.length - MAX_ENTRIES; i++) store.delete(keys[i]);
      };
      await transactionDone(tx);
    } catch {
      // Ignore: the analysis simply is not cached.
    }
  }
}

/** Hex SHA-256 of a buffer, or null where Web Crypto is unavailable. */
export async function contentHash(data: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
