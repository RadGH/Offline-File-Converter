import type { PerFileSettings } from '@/lib/queue/store';

/**
 * Shallow comparison of all PerFileSettings keys.
 * Returns true when any key differs between a and b.
 */
export function settingsDiffer(a: PerFileSettings, b: PerFileSettings): boolean {
  const keys = Object.keys(a) as (keyof PerFileSettings)[];
  for (const k of keys) {
    if (a[k] !== b[k]) return true;
  }
  return false;
}
