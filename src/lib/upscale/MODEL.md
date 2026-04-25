# Upscale Model

## Chosen model (v2 — current)

**Swin2SR-Realworld-SR-x4-64-BSRGAN-PSNR (uint8 quantized)**

| Field | Value |
|---|---|
| HF repo | https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr |
| File path | `onnx/model_uint8.onnx` |
| Full URL | https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model_uint8.onnx |
| License | Apache-2.0 |
| Scale factor | 4x |
| File size | ~18.1 MB (18,999,633 bytes) |
| SHA-256 | `a60f3781f8e3a48babc94cfe7bfb02a61102f3cccff59574ae55673f5a70f931` |
| IndexedDB key | `upscale-model-v2` |

## Why this model (vs v1 classical)

The previous model (Swin2SR-Classical-SR-x4-64 INT8) triggered a null-deref
("Cannot read properties of null (reading 'Nd')") in the ORT WebGPU backend.
Root cause: the classical model uses `DepthToSpace` ops which have incomplete
WebGPU kernel coverage in onnxruntime-web.

The realworld variant (BSRGAN degradation training) does **not** use
`DepthToSpace`. Op audit of the uint8 export:

| Op | Classical (v1) | Realworld (v2) |
|---|---|---|
| `DepthToSpace` | YES (WebGPU crash) | **no** |
| `MatMul` | yes | yes (WebGPU OK) |
| `Softmax` | yes | yes (WebGPU OK) |
| `ScatterND` | yes | yes (WebGPU OK) |
| `DequantizeLinear` | NO | no |

Additionally the realworld model is trained with the BSRGAN real-world
degradation pipeline, which generalises better to photographs with noise,
compression artifacts, and blur compared to the classical bicubic-downscaling
training set.

## Candidates evaluated

| Model | Size | Result |
|---|---|---|
| Xenova/Real-ESRGAN-x4plus | — | HTTP 401 (gated) |
| Xenova/RealESRGAN_x4plus | — | HTTP 401 (gated) |
| briaai/Real-ESRGAN | — | HTTP 401 (gated) |
| Xenova/swin2SR-classical-sr-x4-64 (INT8) | ~18.3 MB | WebGPU crash (DepthToSpace) — was v1 |
| onnx-community/swin2SR-realworld fp16 | ~28.3 MB | Over 20 MB limit |
| onnx-community/swin2SR-realworld uint8 | ~18.1 MB | Different repo, same content as Xenova |
| Xenova/4x_APISR_GRL_GAN_generator-onnx fp16 | ~5.0 MB | Has ScatterND; needs further WebGPU testing |
| Xenova/swin2SR-realworld-sr-x4-64 uint8 | ~18.1 MB | **Selected** — no DepthToSpace, Apache-2.0 |

## Input tensor spec

- Format: NCHW (`[batch, channels, height, width]`)
- Channels: 3 (RGB, no alpha)
- dtype: float32
- Value range: [0.0, 1.0] (divide pixel values by 255 before inference)
- Rescale factor: `1/255 = 0.00392156862745098` (from `preprocessor_config.json`)
- `pad_size`: 8 (dimensions should be multiples of 8 — tiler handles this via
  clamp-to-edge padding)

## Output tensor spec

- Format: NCHW `[1, 3, height*4, width*4]`
- dtype: float32
- Value range: [0.0, 1.0] (clamp then multiply by 255 for display)

## Tiling strategy

- Tile size: 256px with 32px overlap
- Edge tiles are padded to full square size via clamp-to-edge so the model
  never sees non-square inputs
- Overlap blend: feathered linear weight (see `tiler.ts`)

## Typical latency (estimates for v2)

| Hardware | 256×256 tile | 512×512 input (4 tiles) |
|---|---|---|
| WebGPU (discrete GPU) | ~3–8 s | ~12–30 s |
| WASM 4-thread (modern CPU, crossOriginIsolated=true) | ~15–25 s | ~60–100 s |
| WASM 1-thread (crossOriginIsolated=false) | ~60–90 s | ~240–360 s |

## Previous model (v1)

**Swin2SR-Classical-SR-x4-64 (INT8 quantized)**

| Field | Value |
|---|---|
| HF repo | https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64 |
| SHA-256 | `c6ae25a4a6d2102c625712bbff2c7c0d2a25af3bf5afec488d5a0d3a1e2a4c75` |
| IndexedDB key | `upscale-model-v1` (now stale — browser will re-download v2) |
| Why replaced | DepthToSpace op causes WebGPU null-deref in ORT |

## CORS verification

HuggingFace serves `/resolve/main/...` paths via a CDN (CloudFront) with:

```
access-control-allow-credentials: true
Vary: origin,access-control-request-method,access-control-request-headers
```

Browser `fetch()` with an `Origin` header receives a matching
`Access-Control-Allow-Origin` response from the CDN. Verified 2026-04-25.

The COI service worker (`public/coi-serviceworker.js`) adds
`Cross-Origin-Resource-Policy: cross-origin` to cross-origin responses so that
COEP=require-corp mode (required for SharedArrayBuffer / multi-threaded WASM)
does not block the CDN fetch.
