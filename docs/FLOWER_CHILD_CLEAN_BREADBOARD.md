# Flower Child Clean breadboard (Graph-driven)

Patch: `patches/flowerchild-breadboard-clean.json` (bank label **FCF Clean breadboard**).

This is **not** the sealed `flowerChildFilter` module. It rebuilds a Clean-style loop so you can edit the Resonance→feedback curve on a Smooth Graph.

## Signal path

1. Source (`polyBlep` saw) → polyBlep amplitude (≈0.036) → `mix` In1  
2. Feedback → `fbVca` → `mix` In2 (`bleed2to1=1`)  
3. `mix` Mix → `fmScale` → `osc` **Increment** (FM-ish drive; hand-tune `fmScale`)  
4. `osc` Sine (`basicShape`) → `lpf1` 6 dB → `lpf2` 6 dB → **Out**  
5. `lpf2` → 1-sample (removed: use graph feedback state-read) → `fbVca` In (loop)

## Controls to edit

| Control | Role |
|---------|------|
| **knobRes** + **resGraph** | Main hand-tune surface: Resonance → feedback amount |
| **knobFreq** + **rangeFreq** | Base Hz for osc; also feeds ratio attenuverters |
| **rangeLpf1 / rangeLpf2** | ≈0.164 / 0.366 cutoff ratios into the two Passive Filters |
| **inScale** | Input into the loop (old ~0.0358) |
| **fmScale** | How hard the mix FM-drives the osc Increment |

## Intentionally omitted (v1)

- Live `moveNode` resonance morph / sample-rate soft-cap  
- Dirty / Rev3  
- Sealed `flowerChildFilter` in the path (keep it as a side A/B reference if you want)

## How to open

Load **FCF Clean breadboard** from the patch bank (same place as `flowerchild` / `flowerchildfilter`). Hard-refresh if the list was cached.

## Control mapping (Ranges, real Hz)

Frequency knob Bias feeds three Ranges (no ratio attenuverters):

- **Freq** (`rangeFreq`): 0…1 → 40…2500 Hz → MOD BasicShape `frequency`
- **LPF1** (`rangeLpf1`): 0…1 → 40×0.164…2500×0.164 Hz → MOD Passive Filter 1 `highFrequency`
- **LPF2** (`rangeLpf2`): 0…1 → 40×0.366…2500×0.366 Hz → MOD Passive Filter 2 `highFrequency`

Range Out values above |1| domain-add on MOD. For PARAM OUT sources that should emit Hz (etc.) instead of 0…1, use Parameter Settings → **Param out: domain**.

Audio-path gains stay attenuverters: polyBlep amplitude, `fmScale`, `fbVca`. Resonance still goes Knob → `resGraph` → MOD `fbVca.amplitude` (0…1 curve for now).

## Feedback delay

No explicit `sampleDelay`. Closing the loop (`lpf2` → `fbVca`) is a scheduler **state-read**: previous-frame output, i.e. the automatic unit delay.


Uses **Mix2** (In1/In2 → Mix/Out1/Out2; Amplitude1/2/Amplitude). Passive Filter Mono → Output Mono.

## Rev1 reference (2026-09-18 retune)

Aligned gains/spans with FlowerChildRev1 (LP24 Clean) in FlowerChildFilterCore.h: input bleed ~0.03585 (inverted), mix drive 1.4, osc amp 1.3, F span ~9.7–15kHz with LPF ratios 0.164312/0.366131, resGraph to selfMod 0.0368–0.6333, output makeup ~+2.3 dB. Still missing FM/PM crossfade and chaos.
