# A1 — Live vs worklet DSP duplication inventory

**Date:** 2026-08-02  
**Phase:** A of `HIGH_RISK_HIGH_REWARD_PLAN.md`

## Already shared (stdlib)

| Helper file | Used for |
|-------------|----------|
| `node-graph-phasor-helpers.js` | wrap01, trisaw, pitched frequency, phase advance |
| `node-graph-control-bus-helpers.js` | Bias/In, binary out, stereo mix, external stereo, MIDI ports |
| `node-graph-shared-dsp-helpers.js` | trigger divider, one-pole LP, noise channel state, etc. |
| `node-graph-analog-filter-helpers.js` | analog filter math |
| Per-module `*-math.js` | curveOsc, snowflake, rotate3dTo2d, vectorscopeTransform, gain, bias, gainBias, softClipper, comparator, sampleDelay, slewLimiter, inertialFilter, sampleHold, speedColorInertia, minMax, bitConverter |

## High-duplicate pitch CV pattern (next A2 batches)

Many live evaluators still inline:

```js
base * (2 ** ((pitchInput - referenceVoltage) / 0.1))
```

instead of `nodeGraphPitchedFrequency(base, cv, ref)`.

**Migrated to pitch helper (live and/or worklet):**  
`curveOsc`, `snowflake`, `dsf`, `hypersaw`, `polyBlep`, `additiveOsc`, `softwave`,
`sinc`, `sineWavetable`, `robinSupersaw`, `surge`, `ellipsoid` (absolute CV uses ref 0),
`midiNotePitch` → `nodeGraphDspMidiNoteToHz`.

**SIGNAL IN Phase/Amp helpers (Phase F + A):**  
`nodeGraphParamSignalInPhaseAdd`, `nodeGraphParamSignalInAmplitude` used on  
softwave / dsf / curveOsc (live + worklet evaluators map).

**Still dual-lane / residual:** ~90 live+worklet pairs without shared `*-math.js`;
native-heavy modules correctly differ. Next A batches: more Phase/Amp oscs,
then filter mono/L/R skeletons if still duplicated.

**Gate for each slice:** fixed-frequency sample vector matches before/after on offline render.

## Dual live + worklet evaluator pairs (module folders)

Typical pattern (thin adapters good; thick dual bad):

- `*-live-evaluator.js` + `*-worklet-evaluator.js` + optional pure math
- Prefer pure math first, then thin adapters only

Native-backed modules (WASM) correctly differ: worklet calls native; live/offline may use JS math or native via main-thread path — not always unifiable to one function without an abstraction over native handles.

## Recommended A2 order

1. Oscillator pitch + phase CV boilerplate → `nodeGraphPitchedFrequency` / shared phase+level CV read helper
2. Mono/L/R filter skeleton (if still duplicated beyond analog-filter-helpers)
3. Envelope trigger edge helpers if still copy-pasted

## Non-goals

- Merging native and JS formula “improvements”
- Single megacore DSP file
