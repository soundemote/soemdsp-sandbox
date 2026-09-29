# Tube Saturation TraceWoscope face blank (demo Bright=0)

**Status:** fixed  
**Severity:** see  
**Source:** user 2026-09-28 (ArchIV soemdsp-sandbox — Tube Sat lost TraceWoscope / scope1dTrace face)  
**Fixed:** 2026-09-28 (local, no push)  
**Related:** B-078 face-track-omitted; waterfall premium form; B-081 scope1dTrace Size; FEATURE_TUBE_SAT_CRT_AMBER

## User symptom

Tube Saturation appeared to lose its 1D Trace / TraceWoscope face (blank / no CRT-amber beam). Defs still declared `displayType: scope1dTrace` + crt-amber `defaultDisplaySettings`.

## Checks (not the root cause)

| Check | Result |
|-------|--------|
| Layout band / B-078 `face-track-omitted` | OK — LayoutA default uses band id `scope` → canonical `face`. Hide-display omits face correctly. |
| Paint registration | OK — `nodeGraphModuleScopeCustomRenderers.scope1dTrace` → `drawNodeGraphScope1dTraceItem`. |
| Mount path | OK — processor LayoutA else-branch mounts `createNodeGraphModuleScopeSection` + registers slot (same as PolyBLEP/Limiter; **no** `layout:"scopeFace"` required). |
| Normalize migrate stripping displayType | OK — schema stays `scope1dTrace`. |

## Root cause

`patches/demo patches/tubesaturation.json` shipped (CRT polish commit) with:

- `traceDisplaySettings.dot1Brightness: 0`
- mismatched plate (`background: #0000ff`) while still carrying crt-amber `gradientStops`

TraceWoscope early-outs when intensity ≤ 0:

```js
if (intensity <= 0 || !(diameter > 0)) { /* draw nothing */ }
```

So the face chrome stayed mounted but the beam never painted — looked like a lost face.

## Fix

1. Demo patch: Bright=1, plate `#050200`, ink `#ffb020`, crt-amber stops (match def defaults).
2. `nodeGraphScope1dTraceSettingsForNode` + clone `scope1dTrace` path merge module `defaultDisplaySettings` under the saved bag (gradient/amber seed without wiping user edits).
3. Display Settings form defaults for `scope1dTrace` seed target module `defaultDisplaySettings`.
4. Tube Sat def: explicit `displayHeightGu: 2`.
5. Regression: `scripts/test_module_layout_bands.js` tubeSaturation face band + hide-display.
6. Cache-bust `tubesat-crt-face-1` (index + perform).

## Verify

1. Load **demo patches/tubesaturation.json** — Tube Sat face shows amber TraceWoscope beam (not blank).
2. Spawn fresh Tube Saturation — crt-amber defaults, Bright full.
3. `node scripts/test_module_layout_bands.js` — tubeSat face band ok.
4. Displays off / Display Height 0 still hides the face track.

Display/UI only — no audio path.