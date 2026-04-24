/**
 * Unit tests for model-config.ts
 *
 * Verifies the UPSCALE_MODEL const has well-formed values —
 * particularly the SHA-256 format and URL structure.
 */

import { describe, it, expect } from 'vitest';
import { UPSCALE_MODEL, MODEL_CACHE_KEY } from '@/lib/upscale/model-config';

describe('UPSCALE_MODEL', () => {
  it('has a valid HuggingFace URL', () => {
    expect(UPSCALE_MODEL.url).toMatch(/^https:\/\/huggingface\.co\//);
    expect(UPSCALE_MODEL.url).toContain('/resolve/main/');
  });

  it('has a 64-char lowercase hex SHA-256', () => {
    expect(UPSCALE_MODEL.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has scale 2 or 4', () => {
    expect([2, 4]).toContain(UPSCALE_MODEL.scale);
  });

  it('has NCHW or NHWC format', () => {
    expect(['NCHW', 'NHWC']).toContain(UPSCALE_MODEL.inputShape.format);
  });

  it('has a non-empty license field', () => {
    expect(UPSCALE_MODEL.license.length).toBeGreaterThan(0);
  });

  it('has a positive sizeBytes', () => {
    expect(UPSCALE_MODEL.sizeBytes).toBeGreaterThan(0);
  });

  it('MODEL_CACHE_KEY is a versioned string', () => {
    expect(MODEL_CACHE_KEY).toMatch(/^upscale-model-v\d+$/);
  });
});
