# Gates & Triggers (app-wide)

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
- Order: **Gate, then Trigger**, adjacent (same idea as ♯/♭ then ƒ).
- Thru: same names in and out (`Gate` in → `Gate` out).
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

Do not classify “this cable is a gate vs a trigger” over several samples. The **first sample > 0 after a sample ≤ 0** is the hit.

```
armed ← last ≤ 0
hit   ← armed && current > 0     // this sample is the strike; height = current
on    ← current > 0              // hold until ≤ 0
last  ← current
```

- **> 0 is a hit.** Anything ≤ 0 is rest and **re-arms**.
- No second hit until a sample **≤ 0** has been seen.
- **0.4 → 0.8 while already on is not a hit.** That is swell, aftertouch, or thru adding level.
- Hits are the **edge sample**, not a later “this was a gate” decision.
- Negative is not a hit. It re-arms. The next rise is a new strike.

**Chatter:** noise flipping around 0 will retrigger. No extra Schmitt until we see it in the field. No 0.5 threshold.

---

## 4. What each jack publishes

Same detector. Two publications:

| Jack | While | Voltage |
|------|--------|---------|
| **Trigger** | the hit sample only | strike height, then **0** (one engine sample) |
| **Gate** | every sample with `current > 0` | **live** `current` (follow analog / thru). **0** when `current ≤ 0` |

Trigger never holds. Gate is the hold. “Stop holding” is only **`current ≤ 0`**.

Keyboard keys go 0 → velocity in one sample, so Trigger height and Gate height match on the strike, then Gate holds that velocity until key-up.

Analog ramp `0, 0.01, 0.2, 0.8`:

- Trigger = **0.01** on the first sample, then 0
- Gate = 0.01, then 0.2, then 0.8, until ≤ 0

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

---

## 6. Consumers

- **Rising-edge inlets** (Reset, envelope Trigger, clocks): `hit` from §3. Height = that sample.
- **Gate-follow inlets** (envelope Gate, VCA): use live voltage while `> 0`; off when `≤ 0`.
- **Pluck Envelope:** Trigger height = velocity. No Velocity knob.
- Do not wait to see if the cable will stay high. First `hit` is enough to start an attack.

---

## 7. Reset

Reset is a **trigger-shaped action** (zero phasors). Same detector as Trigger. No thru-sum unless a module explicitly has Reset thru.

---

## 8. Clock family

- **Pulse / T** = Trigger (one sample).
- **Digital Out** = Gate (held high for the clock high phase).
- Same glyphs, same detector, same −1…+1 if the module grows thru.

---

## 9. Note-off

Gate falling to ≤ 0 is enough. No extra note-off Trigger unless a module asks for it.

---

## 10. Implementation (when we code)

1. Shared helper (JS + C++): `armed / hit / on` from §3. Replace mixed 0.0 vs 0.5 thresholds.
2. Keyboard: `Gate` + `Trigger` **in**, add to key outs, clamp −1…+1. Glyphs, white digital.
3. Any other Gate/Trigger thru uses the same add+clamp.
4. Envelope / Reset inlets use this detector. Trigger latches height on `hit`. Gate follows live height.
5. Clock Pulse/Digital Out already conceptually match; align detectors if they still use 0.5.

Do not special-case a patch. Do not invent a second edge law for analog vs digital — analog is the same voltage, slower.
