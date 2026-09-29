# B-078 - Trace / Phosphor / Instant Waterfall faces hidden after waterfall rename

**Status:** fixed  
**Severity:** see  
**Source:** user 2026-09-28 ("Trace modules and Phosphor modules don't have displays")  
**Fixed:** 2026-09-28 (local)

## User symptom

Catalog Trace modules (1D Trace, 2D Trace) and Phosphor modules (1D Phosphor, 2D Phosphor) — and Instant Waterfall monitors sharing `layout: "scopeFace"` — spawn with no visible display face.

## Root cause

Waterfall rename (`traceDisplay*` → `waterfall*`, layout `traceDisplay` → `scopeFace`) replaced the chrome band alias:

```diff
-  trace: "face",
+  waterfall: "face",
```

in `NODE_GRAPH_MODULE_WIDGET_BAND_ID`, while `scopeFace` layout bands still used `{ id: "trace", ... }`.

`applyNodeGraphModuleLayout` set `face-track-omitted` when no band had raw `id === "face"`. CSS then hid the mounted face:

```css
.dsp-node.face-track-omitted .node-module-face { display: none !important; }
```

`displayType` / `settingsSchema` / paint registration were intact — faces were mounted then forced invisible.

## Fix

1. `scopeFace` stack band id → `"face"`.
2. Restore `trace: "face"` alias (keep `waterfall: "face"`).
3. `faceBandVisible` uses `nodeGraphModuleCanonicalBandId`.
4. Harden: `scope1dTrace` / `scope1dTraceStereo` dry thrus + `UsesWiredInputs`.

## Verification

- `node scripts/test_module_layout_bands.js` (scopeFace regression)
- Manual: drag 1D Phosphor / 1D Trace / Instant Waterfall — face row visible; Display Settings gear paints.

Display/UI only — no audio path.
