# Parameter surfaces (Phase F)

Canonical math lives in `public/node-graph-stdlib/node-graph-param-surface-helpers.js`.
Live and worklet both call it (no dual formulas).

## Three surfaces

| Surface | What it is | Math contract |
|---------|------------|----------------|
| **DOMAIN** | Knob/slider value in real units | Stored on the node; readout shows this (after smooth). **min/max are slider/unit-map guides**, not hard clips (unless wraparound, `constraint: cpu|gpu|ram`, or `hardClamp: true`). |
| **MOD** | Param-row modulation CV | Bipolar unit **[−1, 1]** *or* absolute DOMAIN when `|mod| > 1`; see apply rules below |
| **SIGNAL IN** | Named jacks (`In`, `0.1V/Oct`, …) | Module-specific; **not** the same as MOD |
| **PARAM OUT** | Slider-row output jack | Default: DOMAIN→unit **0…1**. **Yellow Graph** modules (`outputDomain: true`): emit raw **DOMAIN** (Hz, cycles, …). |

## DOMAIN hard clamp policy

Hard clamp/wrap of stored or post-MOD effective values only when:

- **`wraparound: true`** — always wrap into min/max
- **`constraint: "cpu" | "gpu" | "ram"`** — resource-limited params (e.g. harmonics)
- **`hardClamp: true`** — explicit opt-in
- **`modClamp: true`** — after MOD only (default is **false**)

Typing Amplitude `8000` or Frequency outside the slider mid-band must stick.

## MOD apply rules

Order is always **`effective = applyMod(smooth(knob), MOD)`** — never smooth the
already-modulated value. Full/live JS does that in `readEffectiveParameter` /
`readNodeGraphLiveEffectiveParam`. Efficient native: knob → `set_param` →
`Control.target` → smoother → `Control.out`; MOD → `set_param_mod`; DSP reads
`control_effective(out, MOD)`.

Per-source classify (`nodeGraphParamModAccumulators` / `nodeGraphParamFoldModSources`):

1. **Unit-band** (`|mod| ≤ 1`): linear map across param min…max (no slider skew),
   add to base unit, map back to domain.
2. **Absolute** (`|mod| > 1`): domain-add `base + mod` (exact Hz sources, large Bias).

Pitch exponential is **not** param MOD — use the **0.1V/Oct** SIGNAL IN jack.

**Behavior change vs older live path:** non-frequency mod was often treated as
**unipolar [0, 1]** (negative LFOs clipped). It is now **bipolar [−1, 1]** so
through-zero LFOs work on level, morph, etc.

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

**Phase / Amp helpers:** softwave, dsf, curveOsc, snowflake Amp, sinc Phase.
sineWavetable (SinCos) uses the **Amp** parameter only (no Amplitude CV jack).

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
nodeGraphParamModAccumulators(sources, metadata)  // → { unitAdd, domainAdd }
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
