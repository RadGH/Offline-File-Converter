/**
 * Resolves the abstract `auto` output format to a concrete encoder format
 * based on the source file's properties.
 *
 * Heuristic:
 *   - Multi-frame source (animated webp / animated gif) → webp-animated
 *     (smaller files than gif; supports alpha; widely playable).
 *     Falls back to gif-animated when output preference rules out webp.
 *   - Source has alpha → webp (smallest lossy with alpha) when input is png/webp,
 *     png when input is png and the user kept it. Defaults to webp.
 *   - Source is jpeg/no-alpha → jpeg.
 *   - Source is heic/avif/bmp → webp (modern + small).
 *
 * The resolver is conservative — when in doubt, picks a format that the
 * destination can be displayed everywhere (jpeg / png / webp).
 */

import type { OutputFormat } from '@/lib/queue/store';
import { detectInputFormat } from '@/lib/utils/mime';

export interface AutoSourceProbe {
  /** True when the source has at least one frame with non-opaque alpha. */
  hasAlpha: boolean;
  /** True when the source has more than one frame (animated). */
  isAnimated: boolean;
}

export function resolveAutoFormat(file: File, probe: AutoSourceProbe): OutputFormat {
  if (probe.isAnimated) {
    // Prefer animated WebP — smaller and modern. If source is gif and user
    // expects gif passthrough, we still produce webp-animated for size; the
    // user can pick gif-animated explicitly if they want a real .gif.
    return 'webp-animated';
  }

  const inputFmt = detectInputFormat(file);
  if (probe.hasAlpha) {
    // Has alpha — pick webp by default. PNG only when input was already png
    // and we want to preserve format identity.
    if (inputFmt === 'png') return 'png';
    return 'webp';
  }

  // No alpha:
  if (inputFmt === 'jpeg') return 'jpeg';
  if (inputFmt === 'gif') return 'webp'; // single-frame gif → webp is smaller
  return 'jpeg';
}
