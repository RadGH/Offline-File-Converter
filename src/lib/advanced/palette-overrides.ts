/**
 * Per-image palette-override persistence.
 *
 * Stores `paletteOverrides` keyed by SHA-256 of the file bytes so re-opening
 * the same file restores the user's color edits. Bounded LRU at 64 entries
 * to avoid unbounded localStorage growth.
 */

import type { PaletteOverride } from '@/lib/queue/store';

const LS_KEY = 'converter.paletteOverrides.v1';
const MAX_ENTRIES = 64;

interface StorageShape {
  /** [hash, overrides, lastUsedTs] tuples, ordered most-recent-first */
  entries: Array<[string, PaletteOverride[], number]>;
}

function loadAll(): StorageShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as StorageShape;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function saveAll(s: StorageShape): void {
  try {
    // Trim to MAX_ENTRIES
    if (s.entries.length > MAX_ENTRIES) {
      s.entries.sort((a, b) => b[2] - a[2]);
      s.entries = s.entries.slice(0, MAX_ENTRIES);
    }
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}

export function readOverrides(hash: string): PaletteOverride[] | null {
  const all = loadAll();
  const found = all.entries.find(e => e[0] === hash);
  if (!found) return null;
  // Touch lastUsed
  found[2] = Date.now();
  saveAll(all);
  return found[1];
}

export function writeOverrides(hash: string, overrides: PaletteOverride[]): void {
  const all = loadAll();
  const idx = all.entries.findIndex(e => e[0] === hash);
  if (idx >= 0) {
    if (overrides.length === 0) {
      all.entries.splice(idx, 1);
    } else {
      all.entries[idx] = [hash, overrides, Date.now()];
    }
  } else if (overrides.length > 0) {
    all.entries.push([hash, overrides, Date.now()]);
  }
  saveAll(all);
}

export function clearOverrides(hash: string): void {
  writeOverrides(hash, []);
}

export function clearAllOverrides(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}
