# B-094 — Curve AR: envelope ignores gate velocity

Report ID: B-094  
Status: fixed (local, uncommitted)  
Severity: hear  
Source: user 2026-10-06 (ArchIV)  

## User symptom

Curve AR does not respond to velocity on the Gate input. In this app the gate level carries velocity (e.g. keyboard Gate = velocity while held), but the Curve AR envelope output ignores it.

## Repro

1. Patch a keyboard Gate output into Curve AR's Gate input.
2. Play soft and hard notes.
3. Observe: envelope output level does not change with velocity.

## Expected behavior

The envelope output follows gate velocity.

## Notes

Other similar gate-driven envelope modules may have the same bug; audit pending. No cause investigated.

## Investigation / fix shape

Not started. Logged only; do not tackle. Docs-only bug report; no code change included.

## Findings (read-only, 2026-10-06)

Status: still open, not tackled. Affects Curve AR, Curve ADSR, Linear ADSR, Linear AR (and retired Attack Decay).

### Source is fine
- Keyboard Gate reaches the native graph as the velocity level: `keyboard-controller-live-evaluator.js:81-90` (gateAmp); `node-live-audio-worklet-native-graph.js` readEfficientModSourceBlock ~2888-2907; `graph_engine.cpp` process_curve_attack_release 8992-9016 sums gate inputs.

### Envelopes treat gate as on/off and always peak at 1.0
- Curve AR (`curve_attack_release.cpp`): gate_on/gate_hit :185-189; peak 1.0 in start_attack :111-115, retarget :212, hold :218/:224; output clamp(out,0,1)*amplitude :236.
- Curve ADSR (exp_adsr): rising_edge :233; peak 1.0 :133-139, :275, :304-310, :323-325; sustain raw knob :160, :347.
- Linear ADSR (linear_envelope): :114; peak 1.0 :50-52, :138-141; sustain raw :146-155; clamp :170.
- Linear AR: gate > 0.5 threshold :77-81 (velocity under 0.5 never fires); peak 1.0 :101-117.
- Attack Decay (retired): gate > 0.5 :86-90; target 1.0 :117.

### Already correct
- Wavetable ADSR (latches velocity at rising edge, `wavetable_adsr.cpp:172-200`), Pluck Envelope (:175-177, :226-227), PowerDecay (:73-76, :89), Ping Envelope (follows live level, `ping_envelope.cpp:146`), Vactrol (`vactrol_envelope.cpp:197`).
- `docs/GATES_TRIGGERS.md:32-33, 72, 79`: gate height is velocity, no separate velocity knob.

### Proposed fix (not applied)
- C++ only, Wavetable ADSR pattern. Latch raw gate level (no clamp) at the rising edge (and when gate is on while idle in Gate mode); use it as the peak target instead of 1.0 and velocity*sustain for sustain.
- Remove the output [0,1] clamps in Curve AR :236 and Linear ADSR :170.
- Linear AR and Attack Decay use gate_on/gate_hit instead of > 0.5.
- Pluck Envelope wraps Curve AR and already applies velocity, so pass its inner Curve AR `gate_on(gate) ? 1 : 0` to avoid applying velocity twice.
- Open decision: latch at note-on (Wavetable ADSR) vs live height tracking per `GATES_TRIGGERS.md:79` (same result for keyboard input).

## Fixed (local, uncommitted) — 2026-10-06

Approved by Argi. C++ only; latch at note-on (Wavetable ADSR pattern). No new params.

- Each module latches `velocity` = raw Gate height (no clamp) on the hit, and in Gate mode also when the Gate is already on while idle (Curve AR, Linear AR, Attack Decay). Peak target = velocity; sustain level = velocity × Sustain. The peak is a target, not an output multiplier: a re-strike glides from the current level (down too, for a softer hit).
- `curve_attack_release.cpp`: velocity in start_attack / attack retarget / attack complete / hold. The attack and release "reached" checks work in either direction. Output is `out * amplitude` (the [0,1] clamp is gone).
- `exp_adsr.cpp` (Curve ADSR): velocity latched at `rising_edge`. Peak = velocity in trigger_attack, live retarget, Delay→Attack/Decay, Attack→Decay. Sustain = velocity × sustain in enter_sustain_or_release, Decay live retarget/release check, and STAGE_SUSTAIN.
- `linear_envelope.cpp` (Linear ADSR): the attack stops at velocity (glides either way). Decay runs toward velocity × sustain with step `(velocity − velocity×sustain)·period/decay`, so decay time is unchanged. The output clamp is gone. The attack *rate* is unchanged (1/attack per second of full scale), so a softer hit reaches its peak sooner.
- `linear_attack_release.cpp` (Linear AR): `gate > 0.5` replaced with `gate_on` / `gate_hit` (it now fires at 0.3). Peak/hold = velocity. Release end works for either sign. The output [0,1] clamp is gone.
- `attack_decay.cpp` (retired): `gate_on` / `gate_hit`. Targets = velocity; the attack-complete check is `kPeak × velocity`. Velocity starts at 1, so an ungated Cycle still runs. The output keeps a floor at 0 (pow_pos needs a non-negative base), and the upper clamp is gone.
- `pluck_envelope_fb.cpp`: the inner Curve AR gets `gate_on(safeGate) ? 1.0 : 0.0` so velocity is applied only once, by Pluck itself. Pluck output is bit-identical to before (max diff 0 across five gate/trigger/keytrack cases).
- `graph_engine.cpp` process_* for these modules only sum the gate and pass it through. No change needed.

Test: `node scripts/test_envelope_gate_velocity.mjs` checks that Curve AR, Curve ADSR, Linear ADSR and Linear AR peak at gate 0.3 and 1.0, that the ADSR sustain is 0.15 / 0.5, that Linear AR fires at 0.3, and that a re-strike glides. Add `--compare-pluck <file>` to compare Pluck against a dump taken with `--dump-pluck` on the old wasm. The old wasm fails 10 checks; the new wasm passes all of them. `smoke_graph_envelopes`, `smoke_graph_pluck_envelope` and `smoke_graph_attack_decay` pass.

Cache: `soemdsp_combined.wasm?v=env-vel-20261006` and `node-live-audio-worklet-native-graph.js?v=env-vel-20261006` in `public/node-graph-live-runtime.js`. That file's script tag in index/perform is also `env-vel-20261006`.

Note: velocity is signed, as in the app Gate contract. A negative Gate gives a negative peak on Curve AR and Linear AR. Curve/Linear ADSR only trigger on Gate > 0.