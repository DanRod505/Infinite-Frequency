/**
 * Shared IndexedDB database (GDD §11.1, D09). Every store is created here so
 * version upgrades stay in one place. All failures resolve to `null`: local
 * persistence is a convenience, never a requirement.
 */
const DB_NAME = 'infinite-frequency';
const DB_VERSION = 2;

export const STORES = {
  /** Music analyses keyed by content hash (v1). */
  analyses: 'analyses',
  /** Song library metadata (v2). */
  songs: 'songs',
  /** Song file contents, kept apart so listing the library stays cheap (v2). */
  songData: 'songData',
} as const;

let connection: Promise<IDBDatabase | null> | null = null;

export function openDatabase(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase | null> {
  connection ??= new Promise((resolve) => {
    try {
      if (!factory) return resolve(null);
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.analyses)) {
          db.createObjectStore(STORES.analyses, { keyPath: 'key' }).createIndex('savedAt', 'savedAt');
        }
        if (!db.objectStoreNames.contains(STORES.songs)) {
          db.createObjectStore(STORES.songs, { keyPath: 'id' }).createIndex('lastPlayed', 'lastPlayed');
        }
        if (!db.objectStoreNames.contains(STORES.songData)) {
          db.createObjectStore(STORES.songData, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the schema: let it, and reconnect lazily.
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return connection;
}

/** Test helper: forget the cached connection. */
export function resetDatabaseConnection(): void {
  connection = null;
}

/** Wraps an IDBRequest in a promise that resolves to `fallback` on error. */
export function requestResult<T>(request: IDBRequest<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(fallback);
  });
}

/** Resolves when a transaction finishes, whatever the outcome. */
export function transactionDone(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}
