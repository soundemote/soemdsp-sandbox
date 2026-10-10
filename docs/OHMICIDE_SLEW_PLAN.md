# Ohmicide Slew I / Slew II (later)

Status: planning seed only. Do not implement until Architect says go.  
Date captured: 2026-10-08.  
Parent seed: `docs/FUTURE_PLANNING.md` §Ohmicide Slew I / Slew II.

## Goal

Bring Ohm Force Ohmicide’s **Slew 1** and **Slew 2** distortion flavors into the sandbox as useful graph modules (or modes), for dark edge-bevel / amp-slew character and the dirtier waveshaped sibling. Useful for Softwave / liminal / VHS-adjacent damage chains and general distortion.

Aesthetic: **abusable slew as distortion**, not a transparent de-esser.

## Ohmicide source notes (public blurbs)

Classic Ohmicide algorithm list:

- **Slew 1** — “Slew rate limiter. This is an extreme version of a physical limitation that exists on any amplifier. Alteration will change the slew rate limit, raising it will give more highs.”
- **Slew 2** — “Waveshaped slew rate distortion.”

In Ohmicide[S] renames (Amazona mapping):

- Slew 1 → **LowFi** (limiter-ish tag)
- Slew 2 → **LowerFi** (waveshaped distortion tag)

No published equations. Class is clear: amplifier **max `|dy/dt|`** limiting as a distortion, with Slew 2 adding a waveshape stage.

## DSP model (working)

### Slew I — slope clip

Classic amp slew / Airwindows-Slew family:

```text
out += clamp(in - out, -maxDelta, +maxDelta)
```

- `maxDelta` maps from Alteration / Rate / Gain (higher = more highs allowed).
- Loud / bright / sharp edges hit the limit first → dynamic HF darkening.
- Extreme clamp → trapezoid / triangle edges; fully frozen → sample-and-hold / DC (document that end stop).

### Slew II — waveshaped slew

Same slope clamp, then a waveshaper on the result (or on the residual / error):

```text
In → gain → slew-clip → softClipper (or tube) → mix → Out
```

Serial slew→shaper matches the name better than parallel.

## Sandbox elements (existing vs missing)

| Piece | Today | Role |
|---|---|---|
| `slewLimiter` (Up/Down Slew) | **Wrong law** for Ohmicide I | Time-to-target glide (Up/Down seconds, amplitude-independent). Related, not a max-`|dy/dt|` clip. |
| `softClipper` | Have | Slew II primary shaper |
| `tubeSaturation` | Have | Warmer Slew II variant |
| `clipperLimiter` / hard clip | Have | Extra crest grit |
| `gain` / `attenuverter` / `bias` | Have | Drive + Bias |
| `mix` | Have | Dry/wet |
| `sampleHold` | Have | Extreme “slew → 0” cousin |
| True slope-rate clip | **Missing** | Real Slew I heart |

### Temporary approximation (no new C++)

`gain` → `slewLimiter` with very short Up/Down + Lin → `softClipper` → `mix`. Neighborhood sound only; does not match Ohmicide’s slope law.

### Preferred build path

1. Add a **Slew Clip** native (or a Rate mode on `slewLimiter`: Time vs MaxΔ).  
2. Ship **Slew I** as that clip alone (+ drive/bias/mix).  
3. Ship **Slew II** as clip → `softClipper` (composite module or documented breadboard / metamodule).

## Suggested params (draft, not final)

**Slew Clip / Slew I**

- Rate / Alteration (max slope; higher = brighter)
- Bias
- Drive / Gain into the limiter
- Mix
- Optional separate Up/Down maxΔ if asymmetric amps matter later

**Slew II**

- Everything above
- Shape amount (softClipper Drive / Knee / Threshold, or a single Shape)
- Optional Mode: Soft / Tube / Hard

## Product placement

- Shop: Distortion / Utility (same neighborhood as Soft Clipper / Tube Saturation).
- Optional Softwave / damage rack building block (alongside wow-flutter / VHS linear-track modes if those land later).
- Keep naming honest: “Slew Clip” / “Slew Distort” is fine; “Ohmicide” is reference only in planning docs.

## Out of scope for this seed

- Implementing code
- Bit-identical Ohmicide reverse-engineering
- Multiband Ohmicide clone
- Replacing or changing default behavior of existing Up/Down Slew without an explicit Architect decision

## References

- Ohmicide classic algorithm blurbs (community mirrors of official list; Dubstepforum Ohmicide distortion-type thread)
- Ohmicide[S] rename map: LowFi ← Slew 1, LowerFi ← Slew 2 (Amazona.de review, 2025)
- Airwindows Slew / Slew2 / Slew3 / GoldenSlew (same physical class; different flavors)
- Existing sandbox: `native_modules/slew_limiter/slew_limiter.cpp`, `soft_clipper`, `tube_saturation`
- Related bug note: `docs/B-095_SLEW_S_CURVE_DOUBLE_S.md` (Up/Down Slew curve behavior — separate from this distortion seed)
