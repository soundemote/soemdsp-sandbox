# B-079 — Choices range clamp does not remapping UI subset

Report ID: B-079  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28  
Related: choice index/label mapping (`nodeGraphPatchChoiceIndexFromValue`); PolyBLEP Waveform metaparam range

## User symptom

Limiting a choices parameter range (e.g. PolyBLEP Waveform min=4 max=5 for Triangle and Sine) does not update the choices set. The UI still treats the ends as 2nd-to-last / last of the **full** catalog and paints dividers as if there are still ~9–10 choices instead of 2.

## Repro

1. Drop PolyBLEP. Open Metaparameters on Waveform (10 choices, min 0 max 9).
2. Set Min=4, Max=5 (Triangle / Sine only). Apply.
3. Observe readout dividers still ~9 segments; labels at the ends are wrong (full-list proportional map) instead of Triangle at 4 and Sine at 5 with a single midpoint divider.

## Expected behavior

Range clamp remaps choice indices/labels onto the restricted subset. Dividers divide evenly over the filtered count (2 choices → 1 divider). Domain values stay absolute (4 / 5) so DSP waveform indices are unchanged.

## Root cause

`nodeGraphPatchChoiceIndexFromValue` only used the discrete `(v-min)/step` path when `(max-min)/step+1 === choices.length`. After a range clamp that equality fails, so it fell through to proportional mapping across the **full** catalog (`t * (n-1)`). Readout dividers always used `parseNodeMetadataChoices(dataset.choices)` length, ignoring the clamped span.

## Fix

- Added `nodeGraphResolveChoiceSet` — slices the catalog to the contiguous `[min,max]` subset using `choiceOriginMin` (domain value of `choices[0]`, persisted from definition min).
- Index / label / value-from-index / type-in / readout dividers consume the resolved subset (even division over filtered count).
- Persist `choiceOriginMin` through definition metadata, patch normalize, slider dataset, factories, and metaparameter editor.
- Cache-bust `b079-choice-range-1`. Smoke: `scripts/test_b079_choice_range_remap.js`.

## Verify

1. `node scripts/test_b079_choice_range_remap.js` and `node scripts/test_knob_choice_neg.js`.
2. Hard-reload Live UI. PolyBLEP Waveform → Min 4 Max 5 → labels Triangle/Sine; one divider; values 4 and 5 still select those shapes.
3. Restore Min 0 Max 9 → full catalog / 9 dividers again.
4. No audio/DSP path change beyond existing absolute domain values.
