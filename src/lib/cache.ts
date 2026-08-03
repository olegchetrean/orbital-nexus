/**
 * Cache persistent pentru datele orbitale.
 *
 * De ce IndexedDB și nu localStorage: catalogul Starlink singur trece de 10.000 de
 * obiecte × ~150 octeți de TLE. Serializat, depășește cota localStorage (~5 MB),
 * scrierea eșuează în tăcere, iar aplicația reinterogează CelesTrak la fiecare
 * încărcare — ceea ce declanșează limitarea lor și te lasă cu date de rezervă.
 */

const DB_NAME = 'lili-sat';
const DB_VERSION = 1;
const STORE = 'tle-groups';

export interface CachedGroup {
  /** cheia = id-ul sursei, ex. "gp:starlink" sau "sup:starlink" */
  key: string;
  /** textul TLE brut, exact cum a venit de la sursă */
  text: string;
  /** când a fost descărcat (ms epoch) */
  fetchedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // Mod privat / stocare blocată: nu blocăm pornirea aplicației.
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export async function cacheGet(key: string): Promise<CachedGroup | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedGroup) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheSet(key: string, text: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, text, fetchedAt: Date.now() } satisfies CachedGroup);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cacheGetAll(keys: string[]): Promise<Map<string, CachedGroup>> {
  const out = new Map<string, CachedGroup>();
  const results = await Promise.all(keys.map((k) => cacheGet(k)));
  results.forEach((r, i) => {
    if (r) out.set(keys[i], r);
  });
  return out;
}

export async function cacheClear(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
