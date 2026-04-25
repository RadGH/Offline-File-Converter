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
  /** See PerFileSettings.preserveOrientation */
  preserveOrientation?: boolean;
  /** See PerFileSettings.dimensionUnit */
  dimensionUnit?: 'px' | 'percent';
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
 *   - dimensionUnit='percent': treat width/height as percentages (1–200) of source.
 *     null means "100%". With maintainAspect, both axes use the same percent.
 *   - maintainAspect + preserveOrientation + px: typed value applies to the LONGER
 *     source side so portrait images stay portrait and landscape stays landscape.
 *   - maintainAspect + only width set → height proportional
 *   - maintainAspect + only height set → width proportional
 *   - maintainAspect + both set → fit inside box (scale so both fit, never exceed)
 *   - !maintainAspect + both set → use as-is
 *   - !maintainAspect + only one set → other = original
 *
 * All results are rounded to integers.
 */
export function applyResize(original: Dimensions, target: ApplyResizeTarget): Dimensions {
  const { width: ow, height: oh } = original;
  const { maintainAspect, preserveOrientation = false, dimensionUnit = 'px' } = target;
  let { width: tw, height: th } = target;

  // ── Percent mode ────────────────────────────────────────────────────────────
  if (dimensionUnit === 'percent') {
    // null = 100%
    const pctW = tw !== null ? tw / 100 : 1;
    const pctH = th !== null ? th / 100 : 1;
    if (maintainAspect) {
      // Use width percent if set, else height percent; both axes same ratio.
      const pct = tw !== null ? pctW : pctH;
      return {
        width: Math.round(ow * pct),
        height: Math.round(oh * pct),
      };
    }
    return {
      width: Math.round(ow * pctW),
      height: Math.round(oh * pctH),
    };
  }

  // ── Pixel mode ──────────────────────────────────────────────────────────────

  // Preserve orientation: swap typed dimensions so the value applies to the
  // longer source side. Only relevant when maintainAspect=true.
  if (preserveOrientation && maintainAspect && ow > 0 && oh > 0) {
    const srcIsPortrait = oh > ow;
    if (tw !== null && th !== null) {
      // Both set: ensure the typed (W, H) orientation matches source orientation.
      const typedIsLandscape = tw >= th;
      if (srcIsPortrait && typedIsLandscape) {
        // Source portrait but typed as landscape — swap
        [tw, th] = [th, tw];
      } else if (!srcIsPortrait && !typedIsLandscape) {
        // Source landscape but typed as portrait — swap
        [tw, th] = [th, tw];
      }
    } else if (tw !== null && th === null) {
      // Only width set: if source is portrait, the typed value should be height
      if (srcIsPortrait) {
        th = tw;
        tw = null;
      }
    } else if (th !== null && tw === null) {
      // Only height set: if source is landscape, the typed value should be width
      if (!srcIsPortrait) {
        tw = th;
        th = null;
      }
    }
  }

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
