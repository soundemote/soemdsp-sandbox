# Gates, Triggers & Reset (app-wide)

**Status:** binding spec. Implement toward this; do not invent a second detector.  
**Related:** [PORT_TYPES.md](./PORT_TYPES.md) (`digital` = white round), [APP_POLICY.md](./APP_POLICY.md).

Nominal bus: **0 rest, +1 full on.** Height **is** velocity. Negative is allowed (invert / thru mix). It is not the normal on-state.

---

## 1. Jacks

| | Gate | Trigger | Reset |
|---|---|---|---|
| Port key | `Gate` | `Trigger` | `Reset` |
| Stamp | **▮** `U+25AE` | **⎍** `U+238D` | **↺** `U+21BA` |
| Spoken | Gate | Trigger | Reset |
| Chrome | white round (`digital`) | white round (`digital`) | white round (`digital`) |

- Keys stay ASCII (`Gate` / `Trigger` / `Reset`). The face shows only the glyph.
- Order: **Gate, then Trigger**, adjacent (same idea as ♯/♭ then ƒ). **Reset** sits with them when present (after Trigger).
- Thru: same names in and out (`Gate` in → `Gate` out). Reset has no thru unless a module explicitly adds Reset in and Reset out.
- Aliases on load: `Trig` → `Trigger`, `Gate Pulse` → `Gate`. Clock **Pulse / T** = Trigger. Clock **Digital Out** = Gate.
- `audio` ↔ `digital` stays allowed. A gold cable into a white Gate is a voltage.

**Not Gate/Trigger:** Env, Amp, ƒ, pitch, Play Keys / Arp Keys / Chord Memory (colored square buses).

---

## 2. Voltage

- Rest = **0**. Full hit = **+1**. Invert = **−1**.
- **Velocity is the height** of the Gate or Trigger sample. No extra velocity jack unless a module truly needs a second tap.
- Keyboard key: `out = on ? velocity : 0` (usually `velocity = 1`). A 0.4 pulse is a 0.4 hit.
- Analog (LFO, envelope, audio) on a Gate/Trigger jack is the same bus: a voltage that spends time above 0.

---

## 3. Detector (one law)

Do not classify “this cable is a gate vs a trigger” over several samples. Rest is **Planck silence**. Leaving silence in **either sign** is the hit.

C++ (`soemdsp::math`, `trigger.h`):

```c
on  = !silent_planck(now);                 // |x| >= kPlanck (1e-7)
hit = silent_planck(last) && on;           // gate_hit(now, &last)
```

- `silent_planck(x)` is `fabs(x) < kPlanck` (open ball; strict `<`).
- Exact 0 is rest. `|x| == 1e-7` is on.
- **0.4 → 0.8 while already on is not a hit.** Swell / thru level, not a new strike.
- Negative is a hit when leaving silence (`0 → −1`). Height is the signed sample.
- Re-arm only by returning inside the ball (`|x| < 1e-7`).
- Hits are the **edge sample**. No 0.5 Schmitt.

`rising_edge(…, 0.0)` / `rising_edge(…, 0.5)` stay for clocks or modules with a **Threshold** knob. Gate, Trigger, and **Reset** inlets use `gate_hit` / `gate_on`.

---

## 4. What each jack publishes

Same detector. Two publications:

| Jack | While | Voltage |
|------|--------|---------|
| **Trigger** | the hit sample only | strike height (signed), then **0** (one engine sample) |
| **Gate** | every sample with `gate_on(current)` | **live** `current`. **0** when silent |
| **Reset** | the hit sample only | action pulse (same as Trigger). Height ignored — fire or don’t |

Trigger never holds. Gate is the hold. “Stop holding” is only **Planck silence**.

Keyboard keys go 0 → velocity in one sample, so Trigger height and Gate height match on the strike, then Gate holds that velocity until key-up.

Analog ramp `0, 0.01, 0.2, 0.8`:

- Trigger / Reset = **0.01** on the first sample, then 0 (Reset fires that sample)
- Gate = 0.01, then 0.2, then 0.8, until Planck silence

Envelopes that fire from **Trigger** latch attack from the strike sample. Envelopes that follow **Gate** track live height.

---

## 5. Thru

On a module that **has Gate/Trigger in and out** (Keyboard, and any later thru):

```
out = clamp(internal + inlet, -1, +1)
```

Then the detector / publication above applies to what you **emit**, and to what a downstream module **reads**.

- Several cables into one inlet already sum; then this add; then clamp.
- Two +1s stay +1. 0.5 + 0.5 = 1. +1 and −1 cancel.
- **Clamp −1…+1 only on thru outputs.** A Trigger inlet with no thru (Pluck Envelope) reads analog height as velocity and does not have to emit a clamped copy.
- Trigger thru can pulse while Gate is still high. That is a new strike on the Trigger bus. Gate thru while high only changes height.
- **Keyboard / Grid Keyboard** are not native DSP. Live compile expands
  `Src → Keyboard.Gate` + `Keyboard.Gate → Dst` into a native `Src → Dst`
  leg (`expandControllerDigitalThruConnections`). Key Gate stays on the
  host CV feeder (key-only). Same for Trigger. Keyboard Gate/Trigger **out**
  for scopes is refreshed after native publish (`refreshControllerDigitalThruOuts`).

---

## 6. Consumers

- **Trigger / Reset inlets:** `gate_hit`. Trigger uses height as velocity. Reset ignores height (zero phasors / rewind).
- **Gate-follow inlets** (envelope Gate, VCA): `gate_on` live voltage; off when silent.
- **Pluck Envelope:** Trigger height = velocity. No Velocity knob.
- Do not wait to see if the cable will stay high. First `hit` is enough to start an attack.

---

## 7. Reset

Reset is in this standard. Same detector as Gate/Trigger:

```c
if (gate_hit(resetIn, &lastReset)) { /* zero phasors / rewind */ }
```

- White round, stamp **↺**, port key `Reset`.
- **Action, not velocity.** The hit sample fires once; held Reset does not retrigger until silence (`|x| < 1e-7`).
- `0 → −1` **does** reset (leave silence). Crumbs inside Planck do not.
- No thru-sum unless the module has Reset in **and** Reset out; then `clamp(internal + in, -1, +1)` like Gate/Trigger.
- Unplugged Reset is silence (`lastReset = 0`) so the next cable-in can hit.

---

## 8. Clock family

- **Pulse / T** = Trigger (one sample).
- **Digital Out** = Gate (held high for the clock high phase).
- Same glyphs, same detector, same −1…+1 if the module grows thru.

---

## 9. Note-off

Gate falling to ≤ 0 is enough. No extra note-off Trigger unless a module asks for it.

---

## 10. Implementation

1. Done: `gate_hit` / `gate_on` in `trigger.h`; `nodeGraphSilentPlanck` / `nodeGraphGateOn` in `node-graph-semath.js`.
2. Done: Keyboard / Grid Keyboard `Gate` + `Trigger` in, add to key outs, clamp −1…+1.
3. Any other Gate/Trigger thru uses the same add+clamp.
4. Envelope Trigger: Pluck Envelope / Curve AR use `gate_hit`. Remaining envelopes still on mixed `rising_edge`.
5. Reset inlets: graph_engine osc Reset + Hyperpluck / Robin / wavetable / etc. use `gate_hit`. Modules with a **Threshold** knob (`delayed_trigger`, `trigger_divider`, …) keep `rising_edge(…, threshold)`.
6. Clock Pulse/Digital Out: align if they still use 0.5.

Do not special-case a patch. Do not invent a second edge law for analog vs digital — analog is the same voltage, slower.
