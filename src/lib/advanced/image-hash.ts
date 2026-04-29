/**
 * Stable hash of a File's raw bytes. Used to key persisted palette overrides
 * to a specific source image so that re-opening the same file restores the
 * user's previous color edits.
 *
 * SHA-256 via SubtleCrypto. Falls back to a tiny FNV-1a if crypto.subtle is
 * unavailable (insecure contexts on LAN IPs).
 */
export async function hashFile(file: File): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193);
  }
  return `fnv-${(h >>> 0).toString(16)}-${file.size}`;
}
