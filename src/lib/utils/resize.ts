export interface ComputePairedDimensionOpts {
  edited: 'width' | 'height';
  value: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Given one edited dimension and the original aspect ratio, returns the other
 * dimension rounded to the nearest integer.
 * Returns 0 if originalWidth or originalHeight is 0, or if value <= 0.
 */
export function computePairedDimension(opts: ComputePairedDimensionOpts): number {
  const { edited, value, originalWidth, originalHeight } = opts;

  if (originalWidth === 0 || originalHeight === 0) return 0;
  if (value <= 0) return 0;

  if (edited === 'width') {
    return Math.round((value * originalHeight) / originalWidth);
  } else {
    return Math.round((value * originalWidth) / originalHeight);
  }
}

export interface ApplyResizeTarget {
  width: number | null;
  height: number | null;
  maintainAspect: boolean;
}

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Compute the final output dimensions given original dims and a resize target.
 *
 * Rules:
 *   - Both null → return original
 *   - maintainAspect + only width set → height proportional
 *   - maintainAspect + only height set → width proportional
 *   - maintainAspect + both set → fit inside box (scale so both fit, never exceed)
 *   - !maintainAspect + both set → use as-is
 *   - !maintainAspect + only one set → other = original
 *
 * All results are rounded to integers.
 */
export function applyResize(original: Dimensions, target: ApplyResizeTarget): Dimensions {
  const { width: tw, height: th, maintainAspect } = target;
  const { width: ow, height: oh } = original;

  // Both null → no resize
  if (tw === null && th === null) {
    return { width: ow, height: oh };
  }

  if (maintainAspect) {
    if (tw !== null && th === null) {
      // Only width set — scale height proportionally
      if (ow === 0) return { width: tw, height: 0 };
      return { width: tw, height: Math.round((tw * oh) / ow) };
    }

    if (th !== null && tw === null) {
      // Only height set — scale width proportionally
      if (oh === 0) return { width: 0, height: th };
      return { width: Math.round((th * ow) / oh), height: th };
    }

    // Both set — fit inside box (never exceed either dimension)
    if (tw !== null && th !== null) {
      if (ow === 0 || oh === 0) return { width: tw, height: th };
      const scaleW = tw / ow;
      const scaleH = th / oh;
      const scale = Math.min(scaleW, scaleH);
      return { width: Math.round(ow * scale), height: Math.round(oh * scale) };
    }
  } else {
    // maintainAspect = false
    if (tw !== null && th !== null) {
      return { width: tw, height: th };
    }
    if (tw !== null && th === null) {
      return { width: tw, height: oh };
    }
    if (th !== null && tw === null) {
      return { width: ow, height: th };
    }
  }

  // Fallback (shouldn't reach here)
  return { width: ow, height: oh };
}
