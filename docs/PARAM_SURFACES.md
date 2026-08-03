# Parameter surfaces (Phase F)

Canonical math lives in `public/node-graph-stdlib/node-graph-param-surface-helpers.js`.
Live and worklet both call it (no dual formulas).

## Three surfaces

| Surface | What it is | Math contract |
|---------|------------|----------------|
| **DOMAIN** | Knob/slider value in real units | Stored on the node; readout shows this (after smooth) |
| **MOD** | Param-row modulation CV | Bipolar unit **[−1, 1]**; see apply rules below |
| **SIGNAL IN** | Named jacks (`In`, `0.1V/Oct`, …) | Module-specific; **not** the same as MOD |

## MOD apply rules

Sum all mod sources after `nodeGraphParamNormalizeModInput` (clamp to [−1, 1] each).

Then `nodeGraphParamApplyMod(domainBase, modSum, metadata)`:

1. **`kind: "frequency"`** (pitch knobs)  
   `effectiveHz = baseHz * 2^(modSum / 0.1)`  
   Same scale as **0.1V/Oct** jacks: +0.1 → +1 octave.

2. **Everything else**  
   Map domain → unit [0, 1] (with nonlinear mid skew if `nonlinearSlider`),  
   add `modSum`, map back to domain, apply min/max/wrap.

**Behavior change vs older live path:** non-frequency mod was often treated as
**unipolar [0, 1]** (negative LFOs clipped). It is now **bipolar [−1, 1]** so
through-zero LFOs work on level, morph, etc.

**Behavior change vs older worklet path:** frequency mod no longer requires
`nonlinearSlider` to get V/Oct-style apply — any `kind: "frequency"` param uses it.

## SIGNAL IN (examples, module-owned)

| Jack pattern | Helper / convention |
|--------------|---------------------|
| Knob **In** additive | `nodeGraphDspBiasFromIn` / `nodeGraphParamSignalInAdditive` |
| Amplitude multiply | `nodeGraphParamSignalInAmplitude` / `nodeGraphParamSignalInMultiply` (unwired → 1) |
| **0.1V/Oct** | `nodeGraphPitchedFrequency` / `nodeGraphParamResolveOscPitchHz` |
| Phase jack | `nodeGraphParamSignalInPhaseAdd` (domain + CV, wrap 0…1 cycles) |

**Osc pitch via `nodeGraphParamResolveOscPitchHz`:** softwave, dsf, curveOsc,
snowflake, polyBlep/osc/blit, additive, sineWavetable, sinc, ellipsoid, surge,
hypersaw, robin — live + worklet peels/map aligned (incl. additive/ellipsoid/
sineWavetable worklet peels).

**Phase / Amp helpers:** softwave, dsf, curveOsc, snowflake Amp, sinc Phase,
sineWavetable Amplitude (**additive** via `nodeGraphParamSignalInAdditive`).

**Pitch processors** (pitchQuantizer, noteGlide, …): pass `0.1V/Oct` as CV —
do **not** force osc Hz resolve.

**Still converting:** any remaining generators that still inline pitch math;
keyboard/musical engines that emit CV (not osc Hz) stay raw.

## API (pure)

```js
nodeGraphParamDomainToUnit(value, metadata)
nodeGraphParamUnitToDomain(unit, metadata)
nodeGraphParamNormalizeModInput(value, metadata)  // → [-1, 1]
nodeGraphParamApplyMod(base, modSum, metadata)
nodeGraphParamApplyDomainBounds(value, metadata)
nodeGraphParamSignalInAdditive(domain, inSample)
nodeGraphParamSignalInMultiply(domain, scale, defaultScale=1)
```

## Wiring

- Main: `index.html` loads param-surface-helpers before live-parameter-runtime  
- Worklet Blob: loads param-surface-helpers after control-bus, before core  
- Live effective param: `readNodeGraphLiveEffectiveParam`  
- Worklet effective param: `readEffectiveParameter`  

Both end in `nodeGraphParamApplyMod`.
