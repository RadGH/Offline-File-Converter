/**
 * Model downloader with streaming progress, SHA-256 verification, and
 * AbortSignal support.
 *
 * On success the bytes are also persisted to IndexedDB via putCachedModelBytes.
 */

import { UPSCALE_MODEL } from './model-config.js';
import { putCachedModelBytes } from './model-cache.js';

export class ModelVerificationError extends Error {
  constructor(expected: string, got: string) {
    super(
      `Model SHA-256 mismatch. Expected ${expected}, got ${got}. ` +
        'The download may be corrupted — please try again.',
    );
    this.name = 'ModelVerificationError';
  }
}

/**
 * Download the upscale model, report progress, verify SHA-256, cache in IDB.
 *
 * @param signal  Optional AbortSignal. Aborting mid-download rejects with
 *                DOMException('AbortError').
 * @param onProgress  Called with (loadedBytes, totalBytes). totalBytes may be
 *                    0 if the server omits Content-Length.
 * @returns  Verified model bytes.
 */
export async function downloadModelWithProgress(
  signal: AbortSignal | undefined,
  onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(UPSCALE_MODEL.url, { signal });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch model: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const contentLength = Number(response.headers.get('Content-Length') ?? '0');
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable as a stream.');
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  // Stream with progress reporting.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, contentLength);
  }

  // Concatenate all chunks into a single Uint8Array.
  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  // Verify SHA-256.
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (hex !== UPSCALE_MODEL.sha256) {
    throw new ModelVerificationError(UPSCALE_MODEL.sha256, hex);
  }

  // Persist to IndexedDB after successful verification.
  await putCachedModelBytes(bytes);

  return bytes;
}
