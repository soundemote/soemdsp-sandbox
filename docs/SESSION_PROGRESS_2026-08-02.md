# Session progress — architecture push (2026-08-02)

Informative map of what landed on `master` ahead of this push (~20 commits),
plus what remains. Pair with `docs/HIGH_RISK_HIGH_REWARD_PLAN.md` (remaining-only).

## Shipped in this arc

### Product / modules
- **Vectorscope Transform** — Layout A X/Y→X/Y goniometer (fixed 45° mid/side).
  Wire stereo L/R into any existing XY scope; scopes unchanged.
- **Soft Fractal** — wider evolution knobs; auto zoom pulse removed (fixed Scale).
- **Knob rename** — patch format **2**: `valueSlider` → `knob` (migrator).

### Architecture phases (mostly complete)
| Phase | Status |
|-------|--------|
| **B planRole** | Done — free-run / roles, legacy source sets retired |
| **C migrators** | Done — format ladder 0→1→2; C1 knob rename |
| **F param surfaces** | Done — DOMAIN / MOD bipolar / SIGNAL IN helpers |
| **D worklet megacore** | Done shell (~13KB) + many peels; scopes still large |
| **E WASM slim** | Done in sandbox (`?wasmLoad=slim`, player-ish defaults); clapplayer external |
| **A shared DSP** | Ongoing peels (pitch helpers, Phase/Amp, rotate3d/vectorscope math, …) |

### Scopes peels (D follow-up)
Peeled: defaults, normalize, display-mode, phosphor, settings-form, capture,
number-readout, draw-basic, draw-burn. Core `module-scopes.js` still owns
settings chrome + orchestrator draw.

### Notable commits (newest first, sample)
- vectorscopeTransform + rotate3d shared math
- scopes draw peels, softwave Morph SIGNAL IN
- remaining-only plan; E player slim defaults
- wasmLoad slim path; Phase F surfaces; format 2 knob
- plan roles, worklet core split, Soft Fractal controls

## What “format 3+ product renames” means

Patches are versioned: `{ format: { kind, version } }`. On load,
`migrateNodeGraphPatchToCurrent` walks migrators (v0→1→2…).

**Format 2** already renames module type `valueSlider` → `knob` so old patches
open without “unknown type”.

**Format 3+** would be the same mechanism for the **next** intentional product
rename (another module type, port name, or face key). It is **not** open work —
only when we decide a rename that must not break saved patches. Then: bump
`format.version`, add pure migrator, rename defs/store in the same change.

## Still open (post-push work targets)

1. **A** — more `*-math.js` / helper peels; SIGNAL IN consistency on remaining jacks  
2. **D** — settings UI chrome + draw orchestrator peels out of scopes.js  
3. **E** — clapplayer repo default to slim (out of this tree); optional fetch metrics  
4. **Worklet evaluators.js** — split map into cluster files (navigation only)  
5. **SIGNAL IN audit** — every Phase / Amplitude / 0.1V/Oct jack uses shared helpers  

See also: `docs/PARAM_SURFACES.md`, `docs/WASM_SLIM_LOAD.md`, `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`.
