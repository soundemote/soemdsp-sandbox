# B-072 — PolyBLEP phosphor dot size does not stick after closing Display Settings

Report ID: B-072  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28  
Related: DISPLAY_SCALE_REWRITE / APP_POLICY §15 (authored ink px @ 96); XY Pad already used ink-px normalize (same family)

## User symptom

Changing Size of the PolyBLEP display phosphor / stamp in Display Settings appears to take while the panel is open, then reverts after closing (and when reopening the form).

## Repro

1. Add / select a **PolyBLEP** (display schema `lineBurn`).
2. Open Display Settings on the face.
3. Drag or type **Size** to a value clearly above 1 (e.g. 4–8; default phosphor look is ~2 CSS px @ 96).
4. Close Display Settings.
5. Reopen Display Settings (and/or watch the face stamp).

**Before fix:** Size snaps back (pegged at 1). Values ≥ 1 all stored/drawn as 1.  
**After fix:** Size remains the authored ink-px value across close/reopen and on the face.

## Expected behavior

Phosphor Size is authored CSS px at a 96px face (0…32). Changing it must persist on the node `traceDisplaySettings` and survive closing Display Settings (same store as patch/session).

## Root cause

`normalizeNodeGraphLineBurnSettings` (PolyBLEP / Instant Waterfall line-burn face) clamped `dot1Size` with `normalizeNodeGraphTraceDisplayNumber(..., 0, 1)`.

Display Settings UI and phosphor paint already treat Size as **authored ink px** (`nodeGraphTraceDisplayClampInkPx` / `faceInkPx` @ ref 96). Live drag wrote the ink-px number into the form input, but every apply/read path re-normalized through the 0…1 clamp, so any Size ≥ 1 became **1**. Closing and reopening reseeded the form from the clamped store — looked like "does not stick."

Same wrong clamp also lived on shared phosphor normals:

- `normalizeNodeGraphZeroDBurnSettings` (0D phosphor Dot)
- `normalizeNodeGraphScope2dSettings` (2D scope2d / Lorenz / phosphorLight SSOT)

XY Pad had already been migrated to ink-px normalize; lineBurn/scope2d/zeroD were left on the old fraction clamp.

Not an audio-path bug. No JS in the audio path.

## Fix

- Store phosphor `dot1Size` via `nodeGraphTraceDisplayNormalizeInkPx` (0…32 ink @ 96) in lineBurn / zeroD / scope2d normalize.
- Extend Display Settings Size field labels/tooltips to include `lineBurn`, `scope2d`, `phosphorLight`, `xyPad`, `dot` so the control reads as CSS px @ 96.

## Files

- `public/node-graph-module-scope-normalize.js` — ink-px `dot1Size` for lineBurn, zeroD, scope2d
- `public/node-graph-module-scope-settings-form.js` — Size label/tooltip for phosphor schemas
- `docs/BUG_PLAN.md` — B-072 index + open/fixed notes
- `docs/B-072_POLYBLEP_PHOSPHOR_DOT_SIZE_PERSIST.md` — this doc

## Verify

1. Soft refresh / reload sandbox so the updated normalize scripts load.
2. PolyBLEP → Display Settings → set Size to e.g. **5** → close → reopen → Size still **5**; face stamp thicker than default.
3. Set Size to **0.5** → close → reopen → still **0.5**; thinner stamp.
4. Optional same check on a scope2d / phosphorLight / 0D Dot face (shared normalize).
5. `python scripts\smoke_test.py` (UI-only; smoke is sanity, not the Size repro).

## Notes for coordinator

- Local edits only; no commit/push/PR from this pass.
- Audio / WASM untouched.
