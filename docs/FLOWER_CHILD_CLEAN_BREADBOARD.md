# Flower Child Clean breadboard (Graph-driven)

Patch: `patches/flowerchild-breadboard-clean.json` (bank label **FCF Clean breadboard**).

This is **not** the sealed `flowerChildFilter` module. It rebuilds a Clean-style loop so you can edit the Resonance→feedback curve on a Smooth Graph.

## Signal path

1. Source (`polyBlep` saw) → `inScale` (≈0.036) → `mix` In1  
2. Feedback → `fbVca` → `mix` In2 (`bleed2to1=1`)  
3. `mix` Out1 → `fmScale` → `osc` **Increment** (FM-ish drive; hand-tune `fmScale`)  
4. `osc` Sine (`basicShape`) → `lpf1` 6 dB → `lpf2` 6 dB → **Out**  
5. `lpf2` → 1-sample `fbDelay` → `fbVca` In (loop)

## Controls to edit

| Control | Role |
|---------|------|
| **knobRes** + **resGraph** | Main hand-tune surface: Resonance → feedback amount |
| **knobFreq** + **rangeFreq** | Base Hz for osc; also feeds ratio attenuverters |
| **ratio1 / ratio2** | ≈0.164 / 0.366 cutoff ratios into the two Passive Filters |
| **inScale** | Input into the loop (old ~0.0358) |
| **fmScale** | How hard the mix FM-drives the osc Increment |

## Intentionally omitted (v1)

- Live `moveNode` resonance morph / sample-rate soft-cap  
- Dirty / Rev3  
- Sealed `flowerChildFilter` in the path (keep it as a side A/B reference if you want)

## How to open

Load **FCF Clean breadboard** from the patch bank (same place as `flowerchild` / `flowerchildfilter`). Hard-refresh if the list was cached.
