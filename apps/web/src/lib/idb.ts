/**
 * Minimal single-key IndexedDB store, with a localStorage fallback.
 *
 * FitMe is local-first: everything lives on the device, nothing is uploaded
 * unless the user explicitly asks for it. IndexedDB is the primary store
 * because an imported training history can run to several megabytes, which is
 * comfortably past what localStorage will hold.
 */

const DB_NAME = "fitme";
const DB_VERSION = 1;
const STORE = "documents";
const FALLBACK_PREFIX = "fitme:fallback:";

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    // Private browsing modes and blocked site data both land here. The
    // localStorage fallback keeps the app usable rather than blank.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
};

const fallbackGet = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(FALLBACK_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const fallbackSet = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(FALLBACK_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const idbGet = async <T,>(key: string): Promise<T | null> => {
  const db = await openDb();
  if (!db) return fallbackGet<T>(key);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(fallbackGet<T>(key));
    } catch {
      resolve(fallbackGet<T>(key));
    }
  });
};

export const idbSet = async (key: string, value: unknown): Promise<boolean> => {
  const db = await openDb();
  if (!db) return fallbackSet(key, value);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(fallbackSet(key, value));
      tx.onabort = () => resolve(fallbackSet(key, value));
    } catch {
      resolve(fallbackSet(key, value));
    }
  });
};

export const idbDelete = async (key: string): Promise<void> => {
  const db = await openDb();
  if (!db) {
    try {
      localStorage.removeItem(FALLBACK_PREFIX + key);
    } catch {
      /* nothing more we can do */
    }
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
};
