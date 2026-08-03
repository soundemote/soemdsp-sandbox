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

## Module renames / patch format

**No backwards compatibility goal right now** — old patches may break when
modules (types, ports, faces) change. Existing format 0→2 migrators still run
if loaded; new migrators are not a priority. See `docs/PATCH_MIGRATIONS.md`.

## Still open

1. **A** — more `*-math.js` / helper peels  
2. **D** — more scopes geometry/buffer helpers (settings-ui + draw-orchestrator done)  
3. **E** — external player shells default to slim (out of this tree)  
4. **SIGNAL IN** — remaining oscs onto resolve/Phase/Amp helpers  

**Done / not open:** worklet **evaluators.js** split (sources/processors/utility).

See: `docs/PARAM_SURFACES.md`, `docs/WASM_SLIM_LOAD.md`, `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`.
