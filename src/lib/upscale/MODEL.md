# Upscale Model

## Chosen model

**Swin2SR-Classical-SR-x4-64 (INT8 quantized)**

| Field | Value |
|---|---|
| HF repo | https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64 |
| File path | `onnx/model_uint8.onnx` |
| Full URL | https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model_uint8.onnx |
| License | Apache-2.0 |
| Scale factor | 4x |
| File size | ~18.3 MB |
| SHA-256 | `c6ae25a4a6d2102c625712bbff2c7c0d2a25af3bf5afec488d5a0d3a1e2a4c75` |

## Input tensor spec

- Format: NCHW (`[batch, channels, height, width]`)
- Channels: 3 (RGB, no alpha)
- dtype: float32
- Value range: [0.0, 1.0] (divide pixel values by 255 before inference)
- Rescale factor: `1/255 = 0.00392156862745098`
- Padding: pad input dimensions to multiples of 8

## Output tensor spec

- Format: NCHW `[1, 3, height*4, width*4]`
- dtype: float32
- Value range: [0.0, 1.0] (clamp then multiply by 255 for display)

## Tiling strategy

- Tile size: 64px (model's native window size)
- For production use a tile of 256px with 32px overlap to avoid seam artifacts
- Overlap blend: feathered linear weight

## Typical latency (estimates)

| Hardware | 512x512 input (4x → 2048x2048) |
|---|---|
| WebGPU (discrete GPU) | ~2–5 s |
| WASM (modern CPU) | ~15–40 s |
| WASM (mobile/low-end) | ~60–120 s |

## Why this model

The Qualcomm Real-ESRGAN-x4plus candidate returned HTTP 404. The onnx-community
real-esrgan-x4-v3 candidate returned HTTP 401 (gated). Xenova/swin2SR-classical-sr-x4-64
is publicly accessible with CORS (`Access-Control-Allow-Origin: *` on HF resolve URLs).
The INT8 quantized variant is 18.3 MB — just under the 20 MB limit — and provides
acceptable quality on photographs. The Apache-2.0 license permits use in a free web tool.

## CORS verification

HuggingFace serves `/resolve/main/...` paths with:

```
Access-Control-Allow-Origin: *
```

Verified 2026-04-23 via `curl -sI` from dev machine.
