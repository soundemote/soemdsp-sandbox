# B-070 - CallNow keypad / PhoneTone silent (Gate still works)

Report ID: B-070  
Status: fixed (code; needs Live UI verify)  
Severity: hear  
Source: user 2026-09-28  
Related: CallNow patch (`patches/callnow.json`); keypad host CV; Phone Tone native; portal outlet speaker sum; controller efficient sidecar

## User symptom

On the CallNow patch:

- Keypad does **not** send clicks / key CV
- Phone Tone does **not** send tones
- Gate / CALL🐞NOW momentary button **still works**

## Patch wiring (how it is supposed to work)

| Path | Graph | Expected |
|------|-------|----------|
| Gate | `momentaryButton` Bias/Out → `slewLimiter` → MOD `flowerChildFilter.amplitude` | Press CALL🐞NOW → filter amplitude opens (works) |
| Key / tones | `keypad` Analog → `phoneTone` Analog; `phoneTone` ToneL/ToneR → `portalOutletLeftRight` (auto-sums into speaker bus) | Press keypad key → Analog CV → DTMF tones (broken) |

Ellipsoid → flowerChildFilter In → Output is the continuous bed; Gate only modulates amplitude.

## Root cause

Keypad is a **host CV controller** (no native GraphEngine opcode), same family as Knob / Momentary.

1. UI posts `keypadInteraction` to the worklet (`keypad-ui.js`).
2. Worklet must apply it via `setKeypadInteraction` into `keypadStates`.
3. Efficient Live must publish Analog/Digital/Gate/X/Y from that state in `processControllerEfficientSidecar` so `syncNativeHostCvFeeders` can Bias-feed native `phoneTone`.

Regression from retiring JS DSP evaluator twins (`77f269d9`):

- `keypad-worklet-evaluator.js` (which defined `setKeypadInteraction`) was deleted.
- `handle-message.js` still calls `this.setKeypadInteraction(message)` → no-op / throw.
- Controller sidecar published Knob / Momentary Bias but **never published keypad**.
- `keypad-math.js` was not in the efficient worklet blob, so even a restore needed slot math in-scope.

Momentary Gate kept working because the sidecar already publishes smoothed Bias for `momentaryButton`.

Phone Tone native DSP and portal outlet speaker sum were fine; they never received Analog > 0 (idle Analog is silence per `phone_tone.cpp`).

## Fix

- Restore `setKeypadInteraction` / `createKeypadState` on the worklet in `controller-efficient-sidecar.js` (UI→CV only; **not** a JS DSP evaluator).
- Publish keypad ports in `processControllerEfficientSidecar`.
- Load `keypad-math.js` in `nodeGraphLiveWorkletSourceFilesEfficient` before the sidecar.
- Smoke: efficient blob must include keypad-math + sidecar; sidecar must define `setKeypadInteraction` and publish `type === "keypad"`.

## Verify (manual Live UI)

1. Hard-refresh sandbox (new worklet blob cache busters: `keypad-hostcv-1`).
2. Load `patches/callnow.json` (or cookbook CallNow).
3. Start Live / Play.
4. Press CALL🐞NOW — filter bed should swell (Gate still OK).
5. Press keypad keys 1–9, *, 0, # — each should produce a DTMF tone through the portal (heard at speakers).
6. Release key — tone should stop (momentary mode).
7. Optional: scope `phoneTone` Tone / ToneL / ToneR or keypad Analog while pressing.

## Files

- `public/modules/_shared/controller-efficient-sidecar.js`
- `public/node-graph-live-runtime.js`
- `scripts/smoke_test.py`
- `docs/BUG_PLAN.md`
- `docs/B-070_CALLNOW_KEYPAD_PHONETONE_SILENT.md`
