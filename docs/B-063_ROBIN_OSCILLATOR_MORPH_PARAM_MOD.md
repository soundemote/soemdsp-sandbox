# B-063 - Robin Oscillator Morph MOD silent (ParamModEdge → wrong Control)

**Status:** fixed  
**Severity:** hear  
**Source:** user 2026-09-27 (`patches/demo patches/analoghorror.json`)  
**Related:** B-051 (Softwave *display* refresh when Morph is modulated via RobinSinusoid — see-only; not this audible wiring bug)

## User symptom

Robin Oscillator **Morph** does not audibly respond to modulation. In `analoghorror.json`, `passiveFilter-2` Out → `robinOscillator-1` Morph looks wired, but timbre stays at the knob value.

## Root cause

- Native DSP (`process_robin_oscillator`) and quantum knob push both store Morph on **WIDTH** (`NATIVE_GRAPH_PARAM_WIDTH`).
- Softwave Morph correctly lives on **SHAPE**.
- `mapNativeGraphParamId("morph")` defaulted to **SHAPE** (Softwave-correct) for every type except Hypersaw/Spiral overrides.
- Live audio→param MOD compiles as **ParamModEdge** via `mapNativeGraphParamId`, so Robin Morph MOD stamped **SHAPE** while DSP read **WIDTH** → silent Morph CV.
- Same class as the Softwave Morph→MIX dead-audio lesson already noted in the KEY_IDS comment.

B-051 remains a separate display-invalidation issue; this fix does not claim Softwave face refresh.

## Fix

In `public/node-live-audio-worklet-native-graph.js` `mapNativeGraphParamId`:

- `robinOscillator` + `morph` → `NATIVE_GRAPH_PARAM_WIDTH`

No native C++ / graph_engine change required — Control slot was already WIDTH.

## Verification

- Smoke: `node scripts/test_b063_robin_morph_param_mod.js`
- Manual: load `patches/demo patches/analoghorror.json`, run live.
  - Patch Morph cable: `passiveFilter-2` Out → `robinOscillator-1` Morph.
  - Saved waveform is **Ramp** (index 1), which **ignores** Morph in DSP — switch to **Trisaw Center**, **Pulse**, or **Analog Square** to hear Morph CV.
  - Softwave Morph MOD must still target SHAPE.
