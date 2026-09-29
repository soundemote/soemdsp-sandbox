# Feature: Tube Saturation 1D Trace + crt-amber colormap

**Date:** 2026-09-28 (local, uncommitted)  
**Kind:** feature restore / display restore (corrected)

## What

Tube Saturation restores a face using the shared **1D Trace** path (`TraceWoscope`), **not** 1D Phosphor (`lineBurn`) and **not** a Soft Clipper–style transfer-curve canvas.

## Display identity (exact)

| Field | Value |
|-------|-------|
| `displayType` | `scope1dTrace` |
| `settingsSchema` / mode renderer | `scope1dTrace` |
| Mode key | `scope1dTrace` |
| Source port | `Out` |
| Ink | TraceWoscope (optional `gradientStops` LUT along path) |

PolyBLEP’s `lineBurn` remains phosphor — wrong family for this restore.

## Colormap

| Field | Value |
|-------|-------|
| id | `crt-amber` |
| label | `crt amber` |
| defaultStops kind | `crtAmber` |
| Tube Sat default | `defaultDisplaySettings.gradientStops` = crt-amber stops |

Photorealistic P3-style CRT amber (deep glass → bias glow → body amber → yellow peak → bloom tip). Distinct from the flatter shared `amber` preset.

## Files

- `public/modules/spectrogram/spectrogram-gradient-editor.js` — `crt-amber` preset + `DEFAULT_CRT_AMBER_STOPS`
- `public/node-graph-module-definitions.js` — Tube Sat `scope1dTrace` + amber `defaultDisplaySettings`
- `public/node-graph-module-scope-1d-trace.js` — pass `gradientStops` into TraceWoscope when present
- `public/node-graph-module-scope-normalize.js` — preserve `gradientStops` on scope1dTrace settings
- Discarded phosphor curve face (`tube-saturation-display.js` / `tubeSaturationFace` / `tubeSaturationCurve`)

## Verify

1. Add **Tube Saturation** — face is 1D Trace (woscope beam), amber LUT default (not flat orange, not phosphor burn).
2. Audio still native GraphEngine; no JS DSP on the path.
3. Display Settings schema is **`scope1dTrace`** (1D Trace controls).
4. Shared colormap list includes **`crt-amber`** for any gradient face.
5. PolyBLEP still `lineBurn` (phosphor) — unchanged.

## Follow-up (2026-09-28)

Demo patch had shipped with dot1Brightness: 0 (TraceWoscope draws nothing). Fixed in docs/B-083_TUBE_SAT_TRACE_FACE_BLANK.md + demo settings restore + scope1dTrace defaultDisplaySettings merge.

## Follow-up (2026-09-28) — B-084 gradient LUT

Display Settings gradientStops now feed TraceWoscope via per-point energy 	 = |sample| and peak ink sampling. 1D Trace Color swatches removed (Gradient owns color). **2D Trace unchanged** (additive solid hue). See docs/B-084_SCOPE1DTRACE_GRADIENT_LUT.md.
