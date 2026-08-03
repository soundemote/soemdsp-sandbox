# Session progress — architecture arc

Pair with `docs/HIGH_RISK_HIGH_REWARD_PLAN.md` (remaining-only).

## Planning doc snapshot (what’s open)

| Track | Still open |
|-------|------------|
| **A** | More `*-math.js` peels (filters/envelopes); optional node smoke |
| **D** | More scopes.js peels (slot/metrics/geometry/WebGL still in core) |
| **E** | External player/clapplayer slim default (other repo) |
| **SIGNAL IN** | Residual non-osc CV modules only (by design) |

| Done | Note |
|------|------|
| B planRole, C format2 knob, F param surfaces | Landed |
| Worklet evaluators split | sources/processors/utility |
| Osc pitch resolve | Major oscs + worklet peels |
| E sandbox slim + fetch report | In-repo complete |
| Up/Down Slew + Inertial Filter | Filter shelf A/B |
| SpeedColorInertia | Multimeter; Inertia uses inertial math |

## Modules added this arc (sample)

- Vectorscope Transform, Speed Color Inertia  
- Inertial Filter (next to existing Up/Down Slew)  
- Soft Fractal knobs; zoom pulse removed  

## Policy

No BC goal — old patches may break. Modules, not “products.”  
