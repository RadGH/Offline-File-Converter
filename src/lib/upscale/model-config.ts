/**
 * Configuration for the bundled upscale model.
 *
 * Model: Swin2SR-Classical-SR-x4-64 (INT8 quantized)
 * Source: https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64
 * License: Apache-2.0
 *
 * The model file is NOT committed to the repo. It is downloaded on first use
 * (explicit user action), cached in IndexedDB, and verified by SHA-256 before
 * use.
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
  name: 'Swin2SR-Classical-SR-x4-64 (INT8)',
  version: '1.0.0-uint8',
  url: 'https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model_uint8.onnx',
  sizeBytes: 19_183_439,
  sha256: 'c6ae25a4a6d2102c625712bbff2c7c0d2a25af3bf5afec488d5a0d3a1e2a4c75',
  scale: 4,
  inputShape: {
    format: 'NCHW',
    channels: 3,
    dtype: 'float32',
    range: [0, 1],
  },
  license: 'Apache-2.0',
  sourceUrl: 'https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64',
};

/** IndexedDB store key — bump this suffix when swapping models. */
export const MODEL_CACHE_KEY = 'upscale-model-v1';
