# AcidSequencer — implementation plan

**Status:** implemented locally, not tested by Argi. Under construction; do **not** mark complete in `docs/FUTURE_PLANNING.md` until Argi has tested a build.

**Parent seed:** `docs/FUTURE_PLANNING.md` §AcidSequencer.

**Related:** `docs/APP_POLICY.md` (pitch / Gate / Trigger / `inc` / native-only DSP / no shims); `docs/ADDING_HARDCODED_SANDBOX_MODULE.md`; `docs/MODULE_PATTERN_REFERENCE.md`; existing `sequencer` (piano roll — **do not modify** for this feature).

---

## Goal

Ship a new **AcidSequencer** module: a TB-303-style step sequencer with a fixed 13-note C–C piano grid and four per-step modifiers (Gate / Accent / Slide / Octave). Own module type. Native C++/WASM DSP only. Face/UI in JS. No JS DSP twin. No shims.

---

## Locked decisions (Argi)

| Topic | Choice |
|-------|--------|
| Module identity | **Own module** — not a change to `sequencer` |
| Step count | Parameter **step length** = active step count **1–32**, **default 16** |
| Piano grid | 13 chromatic pitches **C to C** (one octave inclusive) |
| Base octave | Grid = **C2–C3** (MIDI **36–48**) |
| Per-step modifiers | **Gate** (on / off / tie), **Accent**, **Slide**, **Octave** (−1 / 0 / +1) |
| Tie semantics | Tie does **not** hold pitch. Tie = **Gate stays high** / **no envelope retrigger** across the step boundary. Pitch may still change (piano note and/or Octave). Slide still applies when that step’s Slide is on |
| Accent | Short **1 ms** Trigger on step entry when Accent is on **and** Gate is on or tie. Gate off = rest, no Accent |
| Slide | Per-step flag. **Linear** glide over Slide time toward the **next** step’s grid MIDI (wrap in the active length), even if the next step is a rest. Non-slide sounding steps jump to their own grid MIDI. Slide time 0 = instant |
| Params | **bpm** 1–320 default 120, **step length** 1–32 default 16, **Gate height** 0–1 default 1, **Accent height** 0–1 default 1, **Slide time** 0–2 s default 0.06, **semitone offset** integer −48…+48 default 0 (replaces a global octave offset). Per-step Octave row stays |
| Gate / Accent heights | **0…1** levels on Gate / Trigger outs |
| Rotate | Face **← / →** arrows **rotate stored step data** (wrap). Not a viewport/pan over a longer pattern |
| Outputs | **Gate**, **Trigger** (Accent), **pitch**, **f**, **inc**. Jack labels: pitch ♯/♭, f ƒ, inc `inc`. No Clock/Reset jacks. No dual-key aliases |
| DSP | Own module `acidSequencer`, type id **199**. Native C++/WASM in `graph_engine`. JS face only. **No** JS DSP twin. **No** shims. Hz via `soemdsp::math::midi_to_hz` (A440). `inc = hz / sr`. Global semitone is added at the output, not stored in the step |
| Status gate | FUTURE_PLANNING stays **seed / not done** until Argi tests |

---

## Module identity

| Field | Value |
|-------|--------|
| Type key | `acidSequencer` |
| Shop / header label | Acid Sequencer |
| Plan role | `source` (generates Gate / Trigger / pitch family; no audio In) |
| Layout | Custom face (`customDisplayArea` / dedicated layout key), LayoutA stack: header → I/O → face → params → lip |

Do **not** reuse `sequencer` layout, state shape, or persistence keys.

---

## Ports

### Inputs

None. No Clock or Reset jacks. The module is clocked to transport start/stop (native time freezes while paused; play from stop rewinds and retriggers step 0). Each step is a 16th at the module's local bpm.

### Outputs (locked order)

```text
Gate, Trigger, pitch, f, inc
```

| Port id | Jack label | Domain / chrome | Behavior |
|---------|------------|-----------------|----------|
| `Gate` | Gate | Digital white; level **0…Gate height** | High while current step is Gate **on** or **tie-sustained** from a prior tie chain; 0 when Gate **off** (and not held by a prior tie) |
| `Trigger` | Trigger | Digital white; pulse height **Accent height** | Accent edge at step entry when that step’s Accent is on (and typically when Gate is not merely continuing a tie — see open question) |
| `pitch` | ♯/♭ | MIDI note number (not /120, not /127) | Current (possibly sliding) MIDI from grid note + Octave |
| `f` | ƒ | Hz | `hz = tuning × 2^((midi − 69)/12)` (patch Freq Ref / same law as Keyboard / APP_POLICY) |
| `inc` | `inc` | cycles/sample | Phase increment from `f` / sample rate |

`outputLabels`: `pitch` → `♯/♭`, `inc` → `inc`. Aliases for load only if Architect later demands a rename — **no proactive dual keys**.

**Non-goals for outlets:** no Play Keys bitmask, no Velocity, no separate Accent CV jack (Accent = Trigger), no audio Out.

---

## Parameters

| Key | Label | Range | Default | Notes |
|-----|-------|-------|---------|--------|
| `bpm` | BPM | ~1…320 (match `transport` unless Architect picks otherwise) | 120 | Tempo-clocked step advance. **Not** free-run Hz. Per-node BPM (like Metronome / `transport`), not a forced copy of `patch.timing.tempoBpm` |
| `stepLength` | Steps (or “Step Length”) | **1…32** integer | **16** | Active pattern length. Steps beyond length are stored but inactive until length grows (or discarded on rotate — see open question) |
| `gateHeight` | Gate Height | 0…1 | 1 | Multiplier / level for Gate out when high |
| `accentHeight` | Accent Height | 0…1 | 1 | Level of Accent Trigger pulse |
| `slideTime` | Slide Time | time (seconds), min 0 | TBD small default (e.g. 0.05–0.1 s) | Glide duration toward next pitch when Slide flag is on; 0 = instant |

All ordinary param MOD rules apply. Choice-like discrete face toggles (Gate mode, Accent, Slide, Octave, piano pitch) are **face state**, not slider params — persist on the node (see schema).

---

## Per-step data schema

Fixed storage for **32** steps (max). Runtime uses indices `0 .. stepLength-1`.

```text
Step {
  pitchIndex: 0..12     // 0 = low C, 12 = high C on the grid
  gate:      0 | 1 | 2  // 0 = off, 1 = on, 2 = tie
  accent:    bool       // Trigger on step entry when true
  slide:     bool       // glide toward next step’s target pitch
  octave:   -1 | 0 | 1  // added to base MIDI
}
```

**Derived MIDI (before slide):**

```text
midiTarget = baseMidiC + pitchIndex + 12 * octave
// provisional baseMidiC = 36 (C2); high C on grid = 48 (C3) at octave 0
```

**Persistence:** store the step array on the node (e.g. `node.acidSequencer.steps` or equivalent durable field Architect prefers). Stable names/keys — **no index-as-identity for enums** (Gate mode stored as `"off"|"on"|"tie"` or integer with a named map documented once). Defaults for a new module: length 16; remaining steps exist as empty defaults (Gate off, Accent/Slide false, Octave 0, pitchIndex 0 or mid — see open question).

**Rotate left/right:** cyclic shift of the **entire stored 32-step array** (not a viewport). Wrap. Hidden steps survive length changes.

---

## Semantics

### Clocking

- One step = one sixteenth at local `bpm` (`stepSamples = sr * 15 / bpm`). Not free-running Hz.
- Step index = floor(masterSamples / stepSamples) mod stepLength. Transport pause stops `process_block`, so the playhead holds. Play from stop calls `soemdsp_graph_rewind_master`, which resets the step latch so step 0 retriggers.
- Same local BPM stays aligned across instances because they share masterSamples.

### Gate / Tie

| Gate mode | During this step | At boundary into next step |
|-----------|------------------|----------------------------|
| **off** | Gate out = 0 | — |
| **on** | Gate out = `gateHeight` | If next is **on** or **off**: normal. If this step is **tie**: see Tie |
| **tie** | Gate out stays high (`gateHeight`) | **No Gate falling edge** and **no envelope retrigger** into the next step — Gate remains high across the boundary. Pitch **may** change immediately (or via Slide). Next step’s Gate mode still matters for *later* boundaries |

**Tie does not hold the note** (no “keep previous MIDI until Gate falls”). Pitch = this step’s grid + Octave (with Slide if flagged).

**Retrigger rule:** emit a Gate-related retrigger / treat as new note start only when Gate rises from low→high. A tie→anything that keeps Gate high does **not** retrigger. Accent Trigger is separate (below).

### Accent → Trigger

- On step entry, if Accent is on and Gate is on or tie, Trigger stays at Accent height for **1 ms** (at least one sample), then falls. A rest cuts the pulse.
- Tie does not retrigger the Gate envelope (Gate stays high) but Accent still pulses Trigger.
- Gate off = rest: Gate low, no Accent. Pitch holds the last sounding note.

### Slide

- If current step `slide == true`, glide `pitch` / `f` / `inc` from the pitch **at step entry** toward the **next** step’s `midiTarget` over `slideTime`.
- If `slide == false`, pitch jumps to this step’s `midiTarget` at step entry (ZOH until next change).
- End of pattern: “next” wraps to step 0 within `stepLength`.
- Curve is **linear** over Slide time (not one-pole). No new library API.
- Slide time 0 → instantaneous even if flag is on.

### Octave

- Per-step −1 / 0 / +1 → ±12 semitones on the grid MIDI.
- Face control: three-state or cycle button on that step’s Octave cell.

### Piano grid

- 13 cells, low C … high C. One selected pitchIndex per step (or none — open).
- Click selects pitch for the current step (or the step under edit focus). Visual highlight for playhead step.

---

## UI layout (face)

Top → bottom inside the face (seed layout):

1. **Modifier rows** — four rows × `stepLength` columns (columns visible for active length; or always 32 with inactive dimmed — prefer show **active length only** so 16-step default is readable):
   - Row **Gate** — per column: off / on / tie (cycle click or segmented)
   - Row **Accent** — per column toggle
   - Row **Slide** — per column toggle
   - Row **Octave** — per column −1 / 0 / +1
2. **piano grid** — 13-note C–C under the columns (shared pitch lane per step column, or a single keyboard that paints the selected step — prefer **per-column pitch cell** or compact piano under each step so the pattern is readable at a glance)
3. **← / →** rotate controls (header of face or flanks) — rotate stored data, wrap

Playhead: highlight current step column while running.

Params (BPM, Steps, Gate Height, Accent Height, Slide Time) live in the normal **parameter row** under the face — not duplicated as face chrome unless Architect wants face mirrors.

I/O jacks: LayoutA above the face — outlets **Gate, Trigger, pitch, f, inc**.

---

## Native vs face split

| Concern | Where |
|---------|--------|
| Step advance, Gate/Tie continuous level, Accent Trigger pulse, Slide glide, pitch / f / inc | **Native** `graph_engine` opcode (C++/WASM) |
| Face paint, hit-testing, rotate buttons, step cell edits | **JS** face only — writes step array + params into node / param sync; **no** audio math in JS |
| Offline render / Live | Same native path; silence until WASM ready — **no** JS twin “so render works” |
| Shared maths | Prefer `library/include/soemdsp` (`midi_hz`, one-pole / glide, trigger helpers). **Architect approval** before new library APIs |

Host sync: step table + params must reach the native instance every edit (same patterns as other stateful native sequencers / `chordSequencer`). Face may read back playhead index for highlight via existing display-signal / HUD channels if available — display-only.

---

## Files (landed locally; not committed)

**Create**

- `native_modules/…` path as required by current native registration (likely a `process_acid_sequencer` / opcode arm inside `native_modules/graph_engine/graph_engine.cpp`, **or** a dedicated native module folded into the combined wasm — follow whichever pattern peer sequencers use at implement time)
- `public/modules/acidSequencer/` — face UI, CSS, register helpers (no `*-worklet-evaluator` DSP, no live-evaluator DSP twin)
- Face renderer registration + display mode if needed

**Touch**

- `public/node-graph-module-definitions.js` — type `acidSequencer`, ports, params, labels, layout flags
- Shop / Add Module menu (`public/index.html` or current registry)
- `NATIVE_GRAPH_TYPE_IDS` / native param sync / port maps (`public/node-live-audio-worklet-native-graph.js` and peers)
- `scripts/build_native_modules.ps1` / combined wasm / catalog as required
- `docs/APP_POLICY.md` allowlist table — add `acidSequencer` when shipped
- Smoke: small script asserting Gate/Tie/Accent/Slide/rotate + pitch-family outs
- `docs/FUTURE_PLANNING.md` — status remains seed until Argi tests; then Architect marks done

**Do not touch for feature work:** `public/modules/sequencer/**` behavior (reference only).

---

## Non-goals (v1)

- Changing or subclassing the existing **Sequencer** piano roll
- JS DSP twin / AudioWorklet peel / “temporary” JS algorithm
- Soft remaps, dual persistence keys, or compatibility shims
- Play Keys / poly bitmask / multi-note chords per step
- Free-run Hz clock mode
- Pattern length &gt; 32 or &lt; 1
- Viewport/pan metaphor for ← → (must be data rotate)
- Tie-as-portamento or tie-as-hold-pitch
- Marking FUTURE_PLANNING complete without Argi test sign-off
- New `library/include/soemdsp` APIs without Architect OK

---

## Implementation phases (when asked)

1. **Spec freeze** — close Remaining questions below with Argi.
2. **Definition + empty face** — module def, outlets, params, face chrome, rotate + step edit (silent outs OK).
3. **Native kernel** — clock, Gate/Tie, Accent Trigger, pitch + Slide, f/inc; register opcode; no JS DSP.
4. **Wire + smoke** — Live + offline native path; face playhead; APP_POLICY allowlist.
5. **Argi test** — only then update FUTURE_PLANNING status.

---

## Closed questions

1. No Clock/Reset jacks. Transport start/stop only.
2. One step = one 16th at local bpm.
3. Accent pulse width = 1 ms.
4. Accent fires on Gate on and on tie. Gate off suppresses Accent.
5. Slide is linear toward the next step's grid MIDI.
6. Gate off holds the last sounding pitch.
7. Default pattern is all rests (gate off, pitchIndex 0, accent/slide false, octave 0).
8. Rotate shifts all 32 stored steps.
9. slideTime default 0.06 s, range 0-2 s.
10. Semitone offset is one integer param, -48..+48, default 0. Per-step Octave stays.
11. Shop category musical, next to Sequencer. Type id 199.
12. FUTURE_PLANNING stays incomplete until Argi tests.

## Reference: APP_POLICY bits this module must obey

- **Pitch** port id `pitch`, label ♯/♭, MIDI note number, white digital chrome.
- Pitch-family outlet order when present: **♯/♭, then ƒ, then `inc`**, adjacent.
- **`inc`** display lowercase `inc`.
- Module DSP in native/WASM only; no JS twin for render.
- No shims / dual-key soft recovery on rename.
- LayoutA: I/O above the face.
- Prefer `soemdsp` helpers; Architect gate on library edits.
