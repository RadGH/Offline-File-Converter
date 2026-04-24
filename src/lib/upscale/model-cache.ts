/**
 * IndexedDB cache for the upscale model bytes.
 *
 * DB:    converter-upscale
 * Store: models
 * Key:   MODEL_CACHE_KEY (versioned — see model-config.ts)
 *
 * Each stored entry: { key: string; bytes: Uint8Array }
 *
 * Integrity is verified by comparing the stored bytes' SHA-256 against the
 * expected hash in model-config.ts. A hash mismatch triggers deletion.
 */

import { UPSCALE_MODEL, MODEL_CACHE_KEY } from './model-config.js';

const DB_NAME = 'converter-upscale';
const DB_VERSION = 1;
const STORE_NAME = 'models';

// ─── DB lifecycle ────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

// ─── SHA-256 helper ──────────────────────────────────────────────────────────

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Ensure we pass a proper ArrayBuffer (not SharedArrayBuffer) to digest().
  const buf = bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : bytes.slice(0).buffer;
  const hashBuf = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the cached model bytes if present AND SHA-256 matches the config.
 * Deletes the entry and returns null on hash mismatch.
 */
export async function getCachedModelBytes(): Promise<Uint8Array | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(MODEL_CACHE_KEY);
    req.onsuccess = async () => {
      const row = req.result as { key: string; bytes: Uint8Array } | undefined;
      if (!row) {
        db.close();
        resolve(null);
        return;
      }
      // Verify integrity.
      const hash = await sha256Hex(row.bytes);
      if (hash !== UPSCALE_MODEL.sha256) {
        db.close();
        // Mismatch — purge stale entry, return null.
        await deleteCachedModel();
        resolve(null);
        return;
      }
      db.close();
      resolve(row.bytes);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Persist model bytes to IndexedDB. Does not verify hash — caller must. */
export async function putCachedModelBytes(bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put({ key: MODEL_CACHE_KEY, bytes });
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Delete the cached model entry if present. */
export async function deleteCachedModel(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(MODEL_CACHE_KEY);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Quick presence check — does not verify hash.
 * Use getCachedModelBytes() when you need integrity guarantees.
 */
export async function hasCachedModel(): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count(MODEL_CACHE_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(req.result > 0);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}
