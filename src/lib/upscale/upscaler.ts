/**
 * High-level upscale API: Blob in → Blob out.
 *
 * Pipeline:
 *   1. Decode Blob → ImageBitmap → Canvas → ImageData
 *   2. splitIntoTiles (tileSize × tileSize, 32px overlap)
 *   3. For each tile:
 *      a. Normalise RGB to float32 [0, 1], NCHW layout
 *      b. Run ORT InferenceSession
 *      c. Decode output tensor → ImageData (scaled tile)
 *   4. stitchTiles → final ImageData
 *   5. Render to OffscreenCanvas → toBlob('image/png')
 *   6. If requested scale < model scale, canvas-downscale.
 */

import type * as OrtType from 'onnxruntime-web';
import { getUpscaleSession } from './session.js';
import { splitIntoTiles, stitchTiles } from './tiler.js';
import { UPSCALE_MODEL } from './model-config.js';
import type { OutputTile } from './tiler.js';

export interface UpscaleOptions {
  scale: 2 | 4;
  tileSize?: 256 | 512 | 1024;
  onProgress?: (pct: number) => void;
}

const DEFAULT_TILE_SIZE = 256;
const TILE_OVERLAP = 32;

/**
 * Upscale a Blob using the cached ONNX model.
 *
 * @param input  Source image Blob (any format decodable by createImageBitmap).
 * @param opts   scale (2|4), optional tileSize, optional progress callback.
 * @returns      Upscaled PNG Blob.
 */
export async function runUpscale(
  input: Blob,
  opts: UpscaleOptions,
): Promise<Blob> {
  const { scale, tileSize = DEFAULT_TILE_SIZE, onProgress } = opts;
  const modelScale = UPSCALE_MODEL.scale; // typically 4

  // 1. Decode source image.
  const bitmap = await createImageBitmap(input);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Could not get 2D context for source canvas.');
  srcCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);

  // 2. Split into tiles.
  const { tiles } = splitIntoTiles(srcImageData, tileSize, TILE_OVERLAP);

  // 3. Get session.
  const session = await getUpscaleSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  // 4. Run each tile through inference.
  const outputTiles: OutputTile[] = [];
  let completed = 0;

  for (const tile of tiles) {
    const outImageData = await runTile(session, inputName, outputName, tile.data);
    outputTiles.push({ x: tile.x, y: tile.y, data: outImageData });
    completed++;
    onProgress?.(Math.round((completed / tiles.length) * 95));
  }

  // 5. Stitch.
  const stitched = stitchTiles(
    outputTiles,
    srcW,
    srcH,
    modelScale,
    TILE_OVERLAP,
  );

  // 6. If requested scale < modelScale, downscale via canvas.
  const finalW = srcW * scale;
  const finalH = srcH * scale;

  const outCanvas = new OffscreenCanvas(finalW, finalH);
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Could not get 2D context for output canvas.');

  if (scale === modelScale) {
    // Direct render.
    const scaledBitmap = await createImageBitmap(stitched);
    outCtx.drawImage(scaledBitmap, 0, 0);
    scaledBitmap.close();
  } else {
    // Run at modelScale then downscale.
    const intermediateBitmap = await createImageBitmap(stitched);
    outCtx.drawImage(intermediateBitmap, 0, 0, finalW, finalH);
    intermediateBitmap.close();
  }

  onProgress?.(100);

  // 7. Encode as PNG.
  const blob = await outCanvas.convertToBlob({ type: 'image/png' });
  return blob;
}

/**
 * Run a single tile through the ORT session.
 *
 * Normalisation: pixel RGB / 255 → float32, NCHW [1, 3, H, W].
 * Output: float32 NCHW [1, 3, H*scale, W*scale] → ImageData (H*scale, W*scale).
 */
async function runTile(
  session: OrtType.InferenceSession,
  inputName: string,
  outputName: string,
  tileData: ImageData,
): Promise<ImageData> {
  const ort = await import('onnxruntime-web');

  const { width: tw, height: th } = tileData;
  const pixels = tileData.data; // Uint8ClampedArray, RGBA

  // Build float32 NCHW [1, 3, th, tw].
  const float32 = new Float32Array(3 * th * tw);
  const rOffset = 0;
  const gOffset = th * tw;
  const bOffset = 2 * th * tw;

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const src = (y * tw + x) * 4;
      const dst = y * tw + x;
      float32[rOffset + dst] = pixels[src + 0] / 255;
      float32[gOffset + dst] = pixels[src + 1] / 255;
      float32[bOffset + dst] = pixels[src + 2] / 255;
    }
  }

  const inputTensor = new ort.Tensor('float32', float32, [1, 3, th, tw]);
  const feeds: Record<string, OrtType.Tensor> = { [inputName]: inputTensor };
  const results = await session.run(feeds);
  const output = results[outputName];

  if (!output) {
    throw new Error(`Output tensor "${outputName}" not found in session results.`);
  }

  // Decode float32 NCHW output → ImageData.
  const outData = output.data as Float32Array;
  const scale = UPSCALE_MODEL.scale;
  const outW = tw * scale;
  const outH = th * scale;

  const imageData = new ImageData(outW, outH);
  const outPixels = imageData.data;

  const outROffset = 0;
  const outGOffset = outH * outW;
  const outBOffset = 2 * outH * outW;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = y * outW + x;
      const dst = (y * outW + x) * 4;
      outPixels[dst + 0] = Math.max(0, Math.min(255, Math.round(outData[outROffset + src] * 255)));
      outPixels[dst + 1] = Math.max(0, Math.min(255, Math.round(outData[outGOffset + src] * 255)));
      outPixels[dst + 2] = Math.max(0, Math.min(255, Math.round(outData[outBOffset + src] * 255)));
      outPixels[dst + 3] = 255;
    }
  }

  return imageData;
}
