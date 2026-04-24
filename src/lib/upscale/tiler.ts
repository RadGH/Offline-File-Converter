/**
 * Tile-split and stitch utilities for large-image inference.
 *
 * Splits an ImageData into overlapping tiles, then reassembles them with
 * feathered blending across the overlap border so seams are invisible.
 *
 * Design notes:
 * - Tiles are always axis-aligned.
 * - The last column / row of tiles extends to cover the right / bottom edge
 *   even if that produces a tile smaller than tileSize (padded internally by
 *   the caller if the model requires fixed dimensions).
 * - Blending weight at seam pixels interpolates linearly from 0 → 1 across
 *   the overlap region.
 */

export interface Tile {
  x: number; // pixel offset in source image (pre-scale)
  y: number;
  data: ImageData;
}

export interface SplitResult {
  tiles: Tile[];
  width: number; // original image width
  height: number; // original image height
}

export interface OutputTile {
  x: number; // pixel offset in source image (pre-scale)
  y: number;
  data: ImageData; // already at scale (e.g. tileSize*4 × tileSize*4)
}

/**
 * Split imageData into overlapping tiles.
 *
 * @param imageData  Source image.
 * @param tileSize   Tile edge length in pixels (square).
 * @param overlap    Number of pixels on each side that adjacent tiles share.
 * @returns          SplitResult with tile list and original dimensions.
 */
export function splitIntoTiles(
  imageData: ImageData,
  tileSize: number,
  overlap: number,
): SplitResult {
  const { width, height } = imageData;
  const step = tileSize - overlap * 2; // advance by (tileSize - 2*overlap)

  // Guard against degenerate config.
  if (step <= 0) {
    throw new RangeError(
      `tileSize (${tileSize}) must be greater than 2 * overlap (${overlap * 2}).`,
    );
  }

  const tiles: Tile[] = [];

  // Compute tile start positions (left edges).
  const xs: number[] = [];
  for (let x = 0; x < width; x += step) {
    xs.push(x);
  }
  // Make sure the last tile covers the right edge.
  if (xs.length === 0 || xs[xs.length - 1] + tileSize < width) {
    xs.push(Math.max(0, width - tileSize));
  }

  const ys: number[] = [];
  for (let y = 0; y < height; y += step) {
    ys.push(y);
  }
  if (ys.length === 0 || ys[ys.length - 1] + tileSize < height) {
    ys.push(Math.max(0, height - tileSize));
  }

  for (const ty of ys) {
    for (const tx of xs) {
      // Always produce a full tileSize × tileSize tile. Pixels outside the
      // source image are filled by clamp-to-edge replication so the model
      // (which requires uniform square inputs) never sees odd shapes and the
      // padded region contributes plausible neighbour color rather than black
      // bleeding into the result.
      const tileData = new ImageData(tileSize, tileSize);
      const src = imageData.data;
      const dst = tileData.data;

      for (let row = 0; row < tileSize; row++) {
        const srcRow = Math.max(0, Math.min(height - 1, ty + row));
        const srcRowStart = srcRow * width;
        const dstRowStart = row * tileSize;
        for (let col = 0; col < tileSize; col++) {
          const srcCol = Math.max(0, Math.min(width - 1, tx + col));
          const s = (srcRowStart + srcCol) * 4;
          const d = (dstRowStart + col) * 4;
          dst[d + 0] = src[s + 0];
          dst[d + 1] = src[s + 1];
          dst[d + 2] = src[s + 2];
          dst[d + 3] = src[s + 3];
        }
      }

      tiles.push({ x: tx, y: ty, data: tileData });
    }
  }

  return { tiles, width, height };
}

/**
 * Reassemble scaled output tiles into a single ImageData.
 *
 * Each tile must already be at the scaled resolution (tileData.width/height
 * must equal original_tile_width * scale etc.).
 *
 * @param outputTiles  Array of { x, y, data } where x/y are the original
 *                     (pre-scale) offsets.
 * @param originalWidth   Width of the original (pre-scale) image.
 * @param originalHeight  Height of the original (pre-scale) image.
 * @param scale        Scale factor applied (e.g. 4).
 * @param overlap      Overlap that was used during splitIntoTiles (pre-scale).
 * @returns            Final stitched ImageData at scaled resolution.
 */
export function stitchTiles(
  outputTiles: OutputTile[],
  originalWidth: number,
  originalHeight: number,
  scale: number,
  overlap: number,
): ImageData {
  const outW = originalWidth * scale;
  const outH = originalHeight * scale;

  // Accumulator buffers (float) for weighted blending.
  const accumR = new Float32Array(outW * outH);
  const accumG = new Float32Array(outW * outH);
  const accumB = new Float32Array(outW * outH);
  const accumA = new Float32Array(outW * outH);
  const accumW = new Float32Array(outW * outH);

  const scaledOverlap = overlap * scale;

  for (const tile of outputTiles) {
    const tileW = tile.data.width;
    const tileH = tile.data.height;
    const dstX = tile.x * scale;
    const dstY = tile.y * scale;

    // Determine which edges of this tile touch the image boundary (pre-scale).
    const atLeftEdge = tile.x === 0;
    const atTopEdge = tile.y === 0;
    const atRightEdge = dstX + tileW >= outW;
    const atBottomEdge = dstY + tileH >= outH;

    for (let row = 0; row < tileH; row++) {
      for (let col = 0; col < tileW; col++) {
        const px = dstX + col;
        const py = dstY + row;

        if (px >= outW || py >= outH) continue;

        const srcIdx = (row * tileW + col) * 4;
        const dstIdx = py * outW + px;

        // Weight: linear fade from 0 to 1 in the overlap border, then 1.
        // At image boundaries (no neighbor tile), use full weight (1.0) to
        // avoid zero-weight corners that would produce black pixels.
        let wx = 1;
        let wy = 1;
        if (scaledOverlap > 0) {
          wx = blendWeightBounded(col, tileW, scaledOverlap, atLeftEdge, atRightEdge);
          wy = blendWeightBounded(row, tileH, scaledOverlap, atTopEdge, atBottomEdge);
        }
        const w = wx * wy;

        accumR[dstIdx] += tile.data.data[srcIdx + 0] * w;
        accumG[dstIdx] += tile.data.data[srcIdx + 1] * w;
        accumB[dstIdx] += tile.data.data[srcIdx + 2] * w;
        accumA[dstIdx] += tile.data.data[srcIdx + 3] * w;
        accumW[dstIdx] += w;
      }
    }
  }

  // Normalise and write final image.
  const result = new ImageData(outW, outH);
  for (let i = 0; i < outW * outH; i++) {
    const w = accumW[i] || 1;
    result.data[i * 4 + 0] = Math.round(accumR[i] / w);
    result.data[i * 4 + 1] = Math.round(accumG[i] / w);
    result.data[i * 4 + 2] = Math.round(accumB[i] / w);
    result.data[i * 4 + 3] = Math.round(accumA[i] / w);
  }

  return result;
}

/**
 * Like blendWeight but treats image-boundary edges as having full weight
 * (no fade) since there is no neighboring tile to blend with there.
 *
 * @param atStart  Whether this tile's left/top edge is at the image boundary.
 * @param atEnd    Whether this tile's right/bottom edge is at the image boundary.
 */
function blendWeightBounded(
  pos: number,
  size: number,
  fadeLen: number,
  atStart: boolean,
  atEnd: boolean,
): number {
  const distFromStart = pos;
  const distFromEnd = size - 1 - pos;

  // Near the start edge: fade only if there's a neighboring tile there.
  const wStart = atStart || distFromStart >= fadeLen
    ? 1
    : distFromStart / fadeLen;

  // Near the end edge: fade only if there's a neighboring tile there.
  const wEnd = atEnd || distFromEnd >= fadeLen
    ? 1
    : distFromEnd / fadeLen;

  return Math.min(wStart, wEnd);
}
