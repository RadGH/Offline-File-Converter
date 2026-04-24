# BUILD PLAN — Phase 2: WebGPU Upscaling Integration

> **Context:** Phase 1 (Convert/Compress MVP per BUILD_PLAN.md) is already in progress using Vite + vanilla-TS + plain-CSS + custom pub/sub store + npm. This plan extends that foundation — **do not** re-scaffold, introduce new frameworks, or change the existing state/test patterns. Match what's already there.

## Goal

Add in-browser AI upscaling as a third mode alongside Convert and Compress, using a WebGPU-first ONNX Runtime Web pipeline. The upscaler model must be **under 20MB** and gated behind a one-time explicit "Download Model" action. When the model is present, upscaling becomes seamlessly available — including as an auto-applied step when a user's resize settings would otherwise enlarge an image beyond its native resolution.

## Design Principles

1. **Three explicit modes:** Convert, Compress, Upscale. User always knows which mode is active.
2. **No surprise downloads.** Model bytes never hit the wire without an explicit user click. This is a privacy/data-cost promise.
3. **Seamless cross-mode upscaling.** If a user is in Convert or Compress mode and requests an output larger than the source, offer upscaling inline — checked by default *only if* the model is already downloaded. Never auto-trigger the download.
4. **WebGPU primary, WASM fallback, graceful refusal.** Detect capability. If neither works, upscaling UI is disabled with a clear explanation.
5. **Match Phase 1 conventions.** Plain CSS, custom store, vanilla TS, Vitest + Playwright. No new frameworks.

---

## Model Selection

**Target: Real-ESRGAN x4 small (quantized) or SwinIR-lightweight, under 20MB, ONNX format.**

Candidate models (Claude Code should evaluate and pick one; document the choice):

| Model | Size (approx) | Scale | Notes |
|-------|---------------|-------|-------|
| Real-ESRGAN x4 anime6B-lite | ~17MB | 4x | Fastest, anime-biased but works on photos |
| Real-ESRGAN x4-v3 (quantized INT8) | ~15-18MB | 4x | Better on photos, slightly slower |
| SwinIR-lightweight x4 | ~5-10MB | 4x | Smallest, modern transformer, solid quality |
| RealCUGAN-nano x2 | ~8-12MB | 2x | Anime/illustration strong |

**Recommended first pick:** SwinIR-lightweight x4 if a well-tested ONNX export is available; otherwise Real-ESRGAN x4-v3 quantized. Commit the final choice in `src/lib/upscale/MODEL.md` including source URL, license, and SHA-256.

**Model hosting:** Host the model file on a static CDN (Cloudflare R2, GitHub Release asset, or similar). **Do not** commit the model binary to the repo. Store only the URL + expected SHA-256 in a config file.

**License check:** Verify and document the model's license permits redistribution in a free web tool. Real-ESRGAN is BSD-3, SwinIR is Apache-2.0 — both fine.

---

## Architecture

### New directories/files (additive, no existing-file rewrites beyond integration points)

```
src/
├── lib/
│   ├── upscale/
│   │   ├── MODEL.md                  # chosen model, source, license, SHA-256
│   │   ├── model-config.ts           # URL, size, hash, input/output spec
│   │   ├── model-cache.ts            # IndexedDB persistence + integrity check
│   │   ├── capability.ts             # WebGPU / WASM detection
│   │   ├── session.ts                # ONNX Runtime Web session lifecycle
│   │   ├── tiler.ts                  # tile + stitch for memory safety
│   │   ├── upscaler.ts               # high-level: Blob in → Blob out
│   │   └── worker/
│   │       └── upscale.worker.ts     # runs inference off main thread
│   └── converters/
│       └── ...                       # unchanged from Phase 1
├── state/
│   ├── mode.ts                       # NEW: 'convert' | 'compress' | 'upscale'
│   └── upscale-model.ts              # NEW: model status (absent/downloading/ready/error)
├── components/
│   ├── ModeTabs.ts                   # NEW: 3-tab switcher
│   ├── ModelDownloadCard.ts          # NEW: download button + progress + status
│   ├── UpscaleSettings.ts            # NEW: scale factor, tile size (advanced)
│   └── InlineUpscaleCheckbox.ts      # NEW: shown in Convert/Compress when enlarging
├── workers/
│   └── ...                           # Phase 1 codec workers unchanged
```

### State additions

Extend the existing custom pub/sub store. Two new slices:

```ts
// state/mode.ts
type Mode = 'convert' | 'compress' | 'upscale';
// Default: 'convert'. Persist last-used mode in localStorage.

// state/upscale-model.ts
type ModelStatus =
  | { kind: 'absent' }
  | { kind: 'downloading'; bytesLoaded: number; bytesTotal: number }
  | { kind: 'verifying' }
  | { kind: 'ready'; loadedAt: number }
  | { kind: 'error'; reason: string };
// Persist 'ready' state across sessions via IndexedDB presence check on boot.
```

### Capability detection flow (run once on page load, cache result)

```
1. Check navigator.gpu exists
2. If yes: try navigator.gpu.requestAdapter()
3. If adapter returned: try requestDevice() with minimum required limits
4. If all succeed: capability = 'webgpu'
5. Else: check WebAssembly + SharedArrayBuffer (for threaded WASM)
6. If wasm available: capability = 'wasm'
7. Else: capability = 'none' — upscale mode disabled with explanation
```

---

## UI Changes

### 1. Mode Tabs (top of converter panel)

Replace the current single-panel header with a three-tab switcher:

```
┌─────────────────────────────────────────────────────┐
│  [ Convert ]  [ Compress ]  [ Upscale ]            │
├─────────────────────────────────────────────────────┤
│                                                     │
│            (mode-specific panel below)              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- Active tab visually distinct (background fill, not just color change — accessibility).
- Keyboard nav: Left/Right arrows switch tabs when focused.
- ARIA: proper `role="tablist"` / `role="tab"` / `aria-selected`.

### 2. Upscale Mode Panel

Two states based on `upscale-model` store:

**State A — Model absent (default for first-time users):**

```
┌─────────────────────────────────────────────────────┐
│  Upscale images with AI                             │
│                                                     │
│  This feature uses a small neural network that     │
│  runs entirely in your browser. A one-time model   │
│  download is required.                             │
│                                                     │
│  Model size: ~17 MB                                 │
│  Runs on: WebGPU (with WASM fallback)              │
│  Files never leave your device.                    │
│                                                     │
│            [ Download Model ]                       │
└─────────────────────────────────────────────────────┘
```

**State B — Downloading:**

```
┌─────────────────────────────────────────────────────┐
│  Downloading model…                                 │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  12.3 / 17.2 MB  (71%)      │
│                                                     │
│              [ Cancel ]                             │
└─────────────────────────────────────────────────────┘
```

**State C — Ready (model cached):**

Full upscale UI — drop zone, per-file scale factor (2x / 4x), queue, download ZIP — mirroring the Convert/Compress layout exactly. Include a small status line: `✓ Model ready (17.2 MB, cached)` with a subtle "Remove" link that purges the IndexedDB entry.

**State D — Capability none:**

Panel shows: *"Upscaling requires WebGPU or WebAssembly support, which isn't available in this browser. Convert and Compress still work."* Mode tab itself remains visible but disabled with a tooltip.

### 3. Inline Upscale in Convert/Compress

When a user sets resize width/height that would **enlarge** the image beyond its natural size, show an inline checkbox under the resize controls:

```
Resize: [ 4000 ] × [ 3000 ] px   ☑ Maintain aspect ratio

  ⚠ Output is larger than source (2000×1500).
  ☑ Upscale with AI to preserve quality   (adds ~3s per image)
```

Rules:
- **Checkbox only appears** when output dimensions > source dimensions on at least one axis.
- **Checked by default** if and only if `upscale-model.kind === 'ready'`.
- **Unchecked and disabled** if model not ready, with a tooltip: *"Download the upscaler model in the Upscale tab to enable this."* Do **not** trigger a download from this checkbox.
- **Unchecked and disabled** if capability is `none`, with appropriate tooltip.
- If checked: conversion pipeline runs upscale first (to target dimensions or nearest scale factor up), then the normal convert/compress step.

### 4. Per-file upscale settings (Upscale mode)

Each queue item in Upscale mode exposes:
- **Scale factor:** 2x / 4x radio (constrained by model; if model is 4x only, 2x is done by running 4x then downscaling 50% — document this).
- **Advanced → Tile size:** 256 / 512 / 1024 with a note about memory.
- **Output format:** PNG (default, lossless) / JPEG / WebP.

---

## Pipeline Integration

The existing Phase 1 converter pipeline uses a dispatcher (`lib/converters/index.ts`). Extend it to optionally chain an upscale step:

```
Input file
  → [optional] decode (HEIC etc.)
  → [optional] upscale step (if mode = upscale, or inline upscale checked)
  → [optional] resize via canvas (to final target dims)
  → encode to target format
  → output Blob
```

Key behaviors:
- **Upscale step runs at native scale factor** (e.g. 4x), then any fine-grained resize to exact target dimensions happens via canvas bilinear/lanczos afterward.
- **Never upscale twice.** If the 4x output already exceeds the target, downscale via canvas.
- **Tile + stitch is mandatory** for inputs larger than ~512×512 to keep GPU memory sane. 32px overlap, feathered blending at seams.

---

## Model Loading Details

### Download

- `fetch()` with streaming reader to report progress.
- Verify SHA-256 against the hash in `model-config.ts` before marking ready.
- Store in IndexedDB under key `upscale-model-v1` (version the key so future model swaps invalidate cleanly).
- On download error: show retry button, do not auto-retry.
- Allow cancel mid-download — abort the fetch, clear partial bytes.

### Cache check on boot

```
1. On app load, query IndexedDB for 'upscale-model-v1'
2. If present and hash matches config: set model status to 'ready' without re-download
3. If present but hash mismatches: delete and set to 'absent'
4. If absent: leave as 'absent' (no auto-download ever)
```

### Session warm-up

- The first inference after page load takes longer (session creation, shader compilation). Do this lazily on the first upscale request, not on page load.
- Keep the session alive across requests in the worker.
- Dispose session if user switches away from upscale for > 5 minutes (free GPU memory).

---

## Implementation Phases

Build in this order. Run the gate tests before moving on.

### Phase 2.0 — Capability detection + mode tabs

1. Implement `lib/upscale/capability.ts` with WebGPU → WASM → none detection.
2. Implement `state/mode.ts` with localStorage persistence.
3. Build `components/ModeTabs.ts` with proper ARIA.
4. Wire into existing page layout above the existing converter panel.
5. When Upscale tab is selected but capability is `none`, show the refusal panel.
6. Unit tests: `capability.ts` mocked branches. Playwright: tab switching, keyboard nav.

**Gate:** Tab tests pass. Existing Convert/Compress flows unchanged.

### Phase 2.1 — Model config + download UI (no inference yet)

1. Pick a model, populate `MODEL.md` and `model-config.ts` with URL + SHA-256.
2. Implement `model-cache.ts`: IndexedDB put/get/delete with integrity check.
3. Implement `state/upscale-model.ts` store slice.
4. Build `components/ModelDownloadCard.ts` covering absent / downloading / ready / error states.
5. Build boot check that promotes `absent` → `ready` if cache is valid.
6. Unit tests: cache put/get roundtrip, hash mismatch detection. Playwright: mock the model URL, click download, observe progress, observe ready state, reload page, confirm still ready.

**Gate:** Model downloads, persists, and re-hydrates on reload. No inference yet.

### Phase 2.2 — ONNX Runtime Web inference (single image, no UI)

1. Add `onnxruntime-web` dependency.
2. Configure to load WASM + WebGPU EPs from the same origin (copy files to `public/ort/` during build if needed).
3. Implement `session.ts` — load model from IndexedDB bytes, create session with `executionProviders: ['webgpu', 'wasm']`.
4. Implement `tiler.ts` — split input ImageData into tiles with 32px overlap, reassemble output tiles with feathered blending.
5. Implement `upscaler.ts` — Blob in → Blob out, using tiler internally.
6. Run in a Web Worker (`upscale.worker.ts`) to keep the main thread free.
7. Unit tests: tiler math (split + stitch produces correct output size). Integration test: run a small fixture image through the full upscale path, assert output dimensions = input × scale factor.

**Gate:** A fixture 128×128 image upscales to 512×512 (4x) end-to-end, headless.

### Phase 2.3 — Upscale mode UI (full queue)

1. Build the full Upscale panel mirroring Convert/Compress layout: drop zone, queue, per-file settings, download ZIP.
2. Wire per-file upscale settings (scale factor, tile size, output format).
3. Hook queue processing into `upscaler.ts`.
4. Reuse the existing ZIP download component.
5. Playwright: drop 3 images in Upscale mode, process all, download ZIP, verify files are 4x the input dimensions.

**Gate:** End-to-end upscale of 3 files through the queue with ZIP export works.

### Phase 2.4 — Inline upscale in Convert/Compress

1. Detect in the resize settings component when output > source.
2. Render `InlineUpscaleCheckbox.ts` conditionally based on dimension math + model status + capability.
3. Extend the converter pipeline to optionally insert an upscale step before the final encode.
4. Ensure no double-upscaling and that final dimensions match user's target exactly (upscale to nearest factor up, then canvas-downscale if needed).
5. Playwright:
   - Model absent → enlarge in Convert mode → checkbox shown but disabled with tooltip.
   - Model ready → enlarge in Convert mode → checkbox shown and checked.
   - Model ready → uncheck → output is naive canvas-upscaled (blurry).
   - Model ready → leave checked → output is AI-upscaled (measure sharpness via a proxy: edge density or file size).

**Gate:** Inline upscaling behaves correctly across all four states.

### Phase 2.5 — Self-testing matrix extension

Extend the existing Phase 7 conversion matrix test to cover upscaling. Build `tests/e2e/upscale-matrix.spec.ts`:

For each input format (JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP) × scale factor (2x, 4x) × output format (JPEG, PNG, WebP):

1. Upload fixture
2. Run upscale
3. Assert: output exists, dimensions = input × scale, MIME matches requested output, image is decodable
4. Record pass/fail

Write results to `UPSCALE_MATRIX.md` alongside the existing `MATRIX.md`.

**Gate:** All cells pass or are explicitly documented as unsupported with reason.

### Phase 2.6 — Performance + graceful degradation

1. Benchmark on a 1024×1024 input: measure time on WebGPU vs WASM.
2. If WASM path is >60s for a 1MP image, show a one-time warning before first use: *"Upscaling will be slow on this device (~Xs per image). WebGPU acceleration isn't available."*
3. Implement memory pressure detection: if `performance.memory` shows high usage, reduce tile size automatically.
4. Cancel behavior: user clicks cancel mid-inference, worker terminates cleanly, partial output discarded.
5. Playwright: cancel mid-upscale, verify worker terminated and queue item marked cancelled.

**Gate:** Cancel works cleanly; slow-device warning shows when expected.

### Phase 2.7 — Polish

1. Privacy copy update: add a line to footer/about — *"AI upscaling runs on your device using WebGPU. The model downloads once (~17 MB) and is cached. No image data is ever uploaded."*
2. Model info tooltip: clicking the model status line shows model name, version, license, and source URL.
3. "Remove model" confirmation dialog.
4. Lighthouse re-check: adding ONNX Runtime Web shouldn't push main bundle > 250KB gzipped (WASM/model are separate lazy loads).
5. Accessibility pass on new components.

**Gate:** Lighthouse targets met; accessibility audit clean.

---

## Acceptance Criteria

Phase 2 is done when:

- [ ] Three mode tabs (Convert / Compress / Upscale) work with keyboard nav and proper ARIA
- [ ] Upscale mode shows Download Model card when model is absent
- [ ] Model download: explicit click only, shows progress, verifies SHA-256, persists to IndexedDB, re-hydrates on reload
- [ ] No network request for the model ever fires without a user click
- [ ] WebGPU detected and used when available; WASM fallback works when not; graceful refusal when neither
- [ ] Upscale mode queue processes multiple files with ZIP export
- [ ] Inline upscale checkbox appears in Convert/Compress when enlarging, checked by default if model ready, disabled with tooltip if not
- [ ] Converter pipeline correctly chains upscale → resize → encode without double-upscaling
- [ ] `UPSCALE_MATRIX.md` shows all supported cells passing
- [ ] Model file size under 20 MB
- [ ] Main bundle (not counting lazy-loaded model/WASM) stays under 250 KB gzipped
- [ ] Existing Phase 1 Convert/Compress flows and tests remain green

---

## Non-Goals (Explicit)

- Multiple upscale models / user-selectable model variants (ship one, evaluate demand later)
- Face enhancement or specialized anime models as separate pipelines
- Server-side fallback for devices without WebGPU or WASM
- Batch "smart upscale" that auto-picks scale factor based on content
- Training or fine-tuning
- Video upscaling
- Progressive web app / offline install (the model is cached, but no service worker is required for Phase 2)

---

## Notes for Claude Code

- **Prototype inference before wiring UI.** Spend a short spike verifying the chosen model actually produces good results at its file size before building the full UI around it. If quality is unacceptable, swap models before committing.
- **Respect the existing store pattern.** Extend the custom pub/sub store; do not introduce Zustand, Redux, or any new state library.
- **Plain CSS only.** Match Phase 1 — no Tailwind, no CSS-in-JS.
- **Copy ONNX Runtime Web assets to the build output.** The WASM files and WebGPU shaders need to be same-origin. Vite config change required.
- **Model URL must be CORS-enabled.** GitHub Release assets work; raw S3 buckets need explicit CORS config.
- **Commit `UPSCALE_MATRIX.md` alongside codec changes.** Same rule as `MATRIX.md`.
- **Privacy promise is sacred.** Never fire a request for the model without a user click. Never send image bytes anywhere. Verify with a DevTools network check as part of CI.
