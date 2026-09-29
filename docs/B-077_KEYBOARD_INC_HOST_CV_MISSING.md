# B-077 - Keyboard Inc outlet not publishing (host CV)

Report ID: B-077  
Status: fixed (code; needs Live UI verify)  
Severity: hear  
Source: user 2026-09-28  
Related: B-070 CallNow keypad host-CV restore; B-047/B-049 Arp/Softwave Inc; controller efficient sidecar

## User symptom

Keyboard module is **not sending out Inc** (increment / Hz per sample).

Other Keyboard outs (Gate, pitch, Play Keys, …) may still work — same class of missing host publish after JS evaluator retirement, separate from Keypad Analog.

## How it is supposed to work

| Path | Graph | Expected |
|------|-------|----------|
| Inc | `keyboard` `inc` → osc / Softwave / PolyBLEP **Increment** | Press a key → `frequency / sampleRate` Bias-feeds native Increment |
| Pitch family | `pitch` (MIDI) and `inc` (Hz/sr) both published | Same as retired `keyboard-controller-live-evaluator.js` |

Keyboard is a **host CV controller** (no native GraphEngine opcode), like Knob / Keypad / Momentary.

1. UI posts `setKeyboardModuleSignal` → worklet `keyboardModuleSignal`.
2. Efficient Live `processControllerEfficientSidecar` builds CV (`buildCv` already computes `increment = frequency / sr`).
3. Sidecar must publish `inc` on `nodeOutputs` so `syncNativeHostCvFeeders` can Bias-feed native Increment.

## Root cause

Regression from retiring JS DSP evaluator twins / moving Keyboard to the efficient sidecar:

- Old `nodeGraphLiveModuleEvaluators.keyboard` returned `inc: cv.increment`.
- Sidecar Pass 1 published `KeyIndex` / `KeyNorm` / `pitch` / Gate / Trigger / masks but **never** `outs.inc`.
- `buildCv` still computed `increment`; host feeder for cables from `Keyboard.inc` stayed at Bias 0.

Same class as B-070 (missing host publish after evaluator retirement), different port (Inc vs Keypad Analog). Not a wiring/port-name bug — definition already has `outputs: […, "inc", …]` and aliases `Inc`/`Increment` → `inc`.

## Fix

- Publish `outs.inc = cv.increment` for non-grid Keyboard in Pass 1.
- Pass 2 (after Play Keys / Arp / Chord IN remix): refresh `KeyIndex` / `KeyNorm` / `pitch` / `inc` for `type === "keyboard"`.
- Cache-bust efficient sidecar `?v=keyboard-inc-1`.
- Smoke: sidecar must contain `outs.inc = cv.increment` and `outs2.inc = cv.increment`.

**Not** a JS DSP evaluator restore. Host-CV / controller sidecar only (APP_POLICY).

## Verify (manual Live UI)

1. Hard-refresh sandbox (worklet blob cache buster `keyboard-inc-1`).
2. Drop Keyboard + PolyBLEP (or Softwave). Wire **Keyboard.inc → Increment**.
3. Start Live / Play. Press a Keyboard key — oscillator should track pitch via Increment.
4. Optional: Value / scope on Keyboard `inc` while holding a key (should be `f/sr`, e.g. A4 ≈ 440/48000).
5. Gate / pitch / Play Keys still behave as before.

## Files

- `public/modules/_shared/controller-efficient-sidecar.js`
- `public/node-graph-live-runtime.js`
- `scripts/smoke_test.py`
- `docs/BUG_PLAN.md`
- `docs/B-077_KEYBOARD_INC_HOST_CV_MISSING.md`
