/**
 * Configuration for the bundled upscale model.
 *
 * Model: Swin2SR-Realworld-SR-x4-64-BSRGAN-PSNR (uint8 quantized)
 * Source: https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr
 * License: Apache-2.0
 *
 * The model file is NOT committed to the repo. It is downloaded on first use
 * (explicit user action), cached in IndexedDB, and verified by SHA-256 before
 * use.
 *
 * Changelog:
 *   v2 (2026-04-25): Switched from swin2SR-classical-sr-x4-64 INT8 to
 *     swin2SR-realworld-sr-x4-64-bsrgan-psnr uint8. The classical INT8 model
 *     triggered a null-deref ("Nd") in the ORT WebGPU backend due to the
 *     DepthToSpace op having incomplete WebGPU kernel coverage. The realworld
 *     variant does not use DepthToSpace and works with both WebGPU and WASM
 *     execution providers. It also produces better results on real-world
 *     photographs (trained with BSRGAN degradation pipeline).
 */

export interface InputShape {
  format: 'NCHW' | 'NHWC';
  channels: 3 | 4;
  dtype: 'float32' | 'uint8';
  range: [0, 1] | [0, 255];
}

export interface UpscaleModelConfig {
  name: string;
  version: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  scale: 2 | 4;
  inputShape: InputShape;
  license: string;
  sourceUrl: string;
}

export const UPSCALE_MODEL: UpscaleModelConfig = {
  name: 'Swin2SR-Realworld-SR-x4-64-BSRGAN-PSNR (uint8)',
  version: '2.0.0-uint8',
  url: 'https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model_uint8.onnx',
  sizeBytes: 18_999_633,
  sha256: 'a60f3781f8e3a48babc94cfe7bfb02a61102f3cccff59574ae55673f5a70f931',
  scale: 4,
  inputShape: {
    format: 'NCHW',
    channels: 3,
    dtype: 'float32',
    range: [0, 1],
  },
  license: 'Apache-2.0',
  sourceUrl: 'https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr',
};

/** IndexedDB store key — bump this suffix when swapping models. */
export const MODEL_CACHE_KEY = 'upscale-model-v2';
