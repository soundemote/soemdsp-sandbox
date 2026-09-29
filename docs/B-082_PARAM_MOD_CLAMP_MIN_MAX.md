# B-082 — Parameter modulation must clamp to paramMeta [min,max]

Report ID: B-082  
Status: fixed (code; needs Live UI verify)  
Severity: hear  
Source: user 2026-09-28 (Keyboard Gate + Toggle → PolyBLEP Amplitude)  
Related: PARAM_SURFACES unit-band MOD; Output Amplitude already `modClamp: true`

## What

Parameter modulation must clamp the summed/modulated value into the destination parameter's `[min,max]` from param meta before DSP. Example: Keyboard **Gate** + **Toggle** both ON into PolyBLEP **Amplitude** must not exceed Amp max (usually 1).

## Repro

1. PolyBLEP Amplitude at 0 (or 1).
2. Wire Keyboard Gate and a Toggle (both unit 0…1) into Amplitude MOD.
3. Hold a key and turn Toggle ON.
4. Before fix: effective Amp could reach ~2 (sum of two unit sources), hotter than full-scale.
5. After fix: effective Amp stays in `[min,max]` (≤ 1).

## Root cause

- Native `control_effective` only clamped unit-band when `modClamp || !unbounded`.
- Host packed `modClamp: false` (common on Amp defs, including PolyBLEP) as bit3 unbounded, so Gate+Toggle summed past max.
- JS fold SSOT (`nodeGraphParamModClamp`) honored `modClamp: false` the same way for UI/ghost paths.

Domain-valued / `outputDomain` MOD correctly stays unclamped (real units).

## Fix (SSOT, native / host-CV — no JS DSP)

1. **Native** `control_effective`: unit-band always clamps to `domainMin…domainMax` when a range exists (unless wraparound). Legacy unbounded / `modClamp:false` ignored for unit-band. Graph version **156**.
2. **Host** `pushChanged` domain flags: unit-band always sets bit1; stop setting bit3 from `modClamp: false`.
3. **Helpers** `nodeGraphParamModClamp` always returns true (fold/UI match native). Live-parameter-runtime fallback matches.
4. PolyBLEP Amplitude meta `modClamp: true` + tooltip; `docs/PARAM_SURFACES.md` updated.

## Files

- `native_modules/graph_engine/graph_engine.cpp` (+ combined wasm relink)
- `public/node-live-audio-worklet-native-graph.js`
- `public/node-graph-stdlib/node-graph-param-surface-helpers.js`
- `public/node-graph-live-parameter-runtime.js`
- `public/node-graph-module-definitions.js`
- `public/node-graph-live-runtime.js` (worklet cache-bust)
- `docs/PARAM_SURFACES.md`
- `scripts/smoke_b082_amp_mod_clamp.mjs`

## Verify

- `node scripts/smoke_b082_amp_mod_clamp.mjs` (Amp base 0 + unitAdd 2; Amp 1 + unitAdd 1; legacy flags=8 — all peak ≤ ~1)
- Live: Gate + Toggle → PolyBLEP Amp cannot exceed Amp max
- Local, no push
