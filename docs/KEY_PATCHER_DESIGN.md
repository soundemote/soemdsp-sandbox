# Key Patcher — Design

| Field | Value |
|-------|-------|
| **Author** | Sandbox / Argi |
| **Date** | 2026-09-16 |
| **Status** | Draft — brainstorm → design (rev 1) |
| **Repo** | `C:\Users\argit\Documents\_PROGRAMMING\soemdsp-sandbox` |
| **Related** | `docs/PARAM_SURFACES.md` (DOMAIN vs unit 0…1), existing keyboard / pitch-reference UI |

---

## Overview

**Key Patcher** is a separate keyboard-faced module that stores **sparse per-key parameter keyframes** so a patch can sound right at different pitches (e.g. C0 vs C5) and morph in between.

It is **not** a full patch-per-key system and **not** an automapper. It records intentional snapshots of selected parameters against MIDI keys, diffs them against a base, and at play time writes **DOMAIN** (real engineering) values into the live graph.

---

## Motivation

DSP that tracks pitch often needs different filter cuts, resonance, drive, morph, etc. at low vs high registers. Manual tweaking per note does not scale; a continuous curve between a few authored keys does.

Goals for a prototype:

1. Author "this sounds good at this key" without rebuilding the graph.
2. Morph those settings as keys change (play mode).
3. Keep storage and DSP in **real units**, matching how the sandbox already thinks about knobs.

---

## Goals & Non-Goals

### Goals

- Keyboard UI module with clear play / snapshot / edit grammar.
- Persist a **base** reference + **sparse keyframes** keyed by MIDI note (or pitch class + octave).
- Store and apply **DOMAIN** values only (Hz, st, dB, domain floats) — never 0…1 slider normals as the source of truth.
- Diff on snapshot: only params that changed (epsilon) enter the keyframe, unless manually pinned.
- Manual include / exclude of which params participate — no automatic spread of one key's edits onto all keys.
- Interpolate between nearest keyframes along the MIDI axis for continuous params; hold for enums / discrete.

### Non-Goals (rev 1)

- Full graph clone per key (nodes, cables, module presence).
- Auto-detecting every knob touch into a global automap across the keyboard.
- Replacing Patch Pitch / `0.1V/Oct` / voice pitch — Key Patcher **modulates parameters**; pitch routing stays the existing pitch path unless we later add an optional "also emit note" jack.
- Perfect musical models of every curve on day one (start lin / log / hold).
- Native audio-rate morph of every param (block-rate / control-rate apply is enough for MVP).

---

## Parameter value contract (critical)

Align with `docs/PARAM_SURFACES.md`:

| Layer | Role for Key Patcher |
|-------|----------------------|
| **DOMAIN** | **SSOT for keyframes.** Snapshot stores DOMAIN; play writes DOMAIN via the same host paths as knobs (`set_param` / patch params). |
| **Unit 0…1** | UI mapping only. **Never** persist keyframes as unit positions — nonlinear sliders would corrupt Hz/st across keys. |
| **MOD** | Out of scope for keyframe storage. Key Patcher sets the knob DOMAIN (base for MOD), same as typing a value. |
| **SIGNAL IN** | Not stored as keyframes in rev 1. |

**Examples of correct keyframe payloads:**

```json
{
  "midi": 24,
  "params": {
    "passiveFilter-2|lowFrequency": 80,
    "passiveFilter-2|highFrequency": 400,
    "passiveFilter-2|sweep": 0,
    "activeFilter-1|resonance": 0.35
  }
}
```

Wrong (do not do this):

```json
{ "passiveFilter-2|lowFrequency": 0.12 }
```

that `0.12` is a unit-map position, not 80 Hz.

**Identity:** prefer stable `nodeId|paramKey` (and optionally module type for migration warnings). Read/write through existing param helpers that already speak DOMAIN.

**Epsilon for diffs:** domain-aware (relative for Hz-like, absolute for 0…1 knobs that are already domain). Never diff in unit space.

---

## User interaction (keyboard face)

Separate module (working title: **Key Patcher**), keyboard display as the main face.

| Input | Mode | Behavior |
|-------|------|----------|
| **Click** | Play | Select key. Apply morph toward that key's keyframe (and optionally arm "current play key" for MIDI/QWERTY later). |
| **Alt+click** | Snapshot | Diff current graph DOMAIN vs base (see below) → create/update keyframe for that key. Only included params. |
| **Ctrl+click** | Edit | Arm that key for editing. Subsequent knob changes update **that keyframe's** DOMAIN entries (not the global base), until disarmed. |

Visuals:

- Keys with keyframes: marked (dot / fill).
- Armed edit key: distinct highlight.
- Play key: current selection / last played.

Later (not blocking MVP): Shift+click clear keyframe; per-param curve menu; range selection.

---

## Data model

### Base

On first arm / first snapshot / explicit "Capture base":

- Store a **base DOMAIN snapshot** of the **include list** (or of all continuous params on included modules — product choice; default = include list only).
- Base is the "untuned" reference. Keyframes are deltas or absolute DOMAIN overlays (see Apply).

Recommendation for rev 1: **absolute DOMAIN per keyframe param**, not delta encoding. Diff is only used to *decide which keys enter the keyframe*; stored values are the real DOMAIN numbers at snapshot time. Apply = write those DOMAIN values (with morph). Simpler, inspectable, survives base re-capture with an explicit "rebase" action later.

### Keyframes

```text
KeyPatcherState
  include: Array<{ nodeId, paramKey }>     // manual list
  exclude: Array<{ nodeId, paramKey }>     // optional hard deny
  base?: Record<paramRef, number>          // DOMAIN, optional until first capture
  keys: Record<midiNote, {
    params: Record<paramRef, number>       // DOMAIN sparse
    curves?: Record<paramRef, "lin"|"log"|"hold">
  }>
  playMidi?: number
  editMidi?: number | null
```

`paramRef` = `"nodeId|paramKey"` string.

### Include list (manual)

- Empty include + snapshot → either no-op or prompt; **do not** silently keyframe the whole patch.
- User pins params (UI: "pin from last touched", or pick from a list).
- Exclude always wins.

No automatic "you moved X so every key now has X."

---

## Morph / apply

### Axis

MIDI note number as X (semitone-linear). Example: keyframes at 24 (C0) and 84 (C5); play at 60 → interpolate t = (60−24)/(84−24).

### Per-param interpolation

| Domain kind | Default curve |
|-------------|---------------|
| `kind: "frequency"` / Hz-like | **log** (lerp in log2 space) |
| Most continuous (reso, morph, drive, …) | **lin** |
| Enum / discrete / choice | **hold** (nearest keyframe) |
| Semitone offsets (`unit: "st"`) | **lin** in st |

Override per param in `curves` when needed.

### Apply path

1. Resolve play MIDI (click or later MIDI in).
2. Find surrounding keyframes (or exact).
3. For each param in the **union** of neighboring keyframes ∩ include list, compute DOMAIN value.
4. Write DOMAIN into the live graph the same way a knob commit does (sticky target / `set_param`).
5. Params not present in any neighboring keyframe: leave untouched (inherit current / base).

If only one keyframe exists on that side, hold that value.

### Interaction with live knob moves

- **Play mode:** moving a knobs changes the live patch; does **not** rewrite keyframes unless Alt-snapshot or Ctrl-edit is active.
- **Edit mode (Ctrl):** knobs rewrite the armed key's keyframe entries for included params.
- **Snapshot (Alt):** one-shot write of current DOMAIN into that key for included params that differ from base (or all included, toggle later).

---

## Module surface (MVP)

**Face:** piano keyboard (reuse existing keyboard chrome if possible).

**Params / controls (module chrome, not keyframed by default):**

- Include list editor (minimal: text or "add last touched param").
- Capture base.
- Clear key / clear all.
- Optional: morph amount / enable (on/off).
- Optional: output MIDI or gate later — not required for param morph MVP.

**I/O (later):** `MIDI` / note in, `Gate`, maybe `Morph` CV 0…1 across a fixed key range. Rev 1 can be mouse-only on the face.

---

## Persistence

Store `KeyPatcherState` on the module node params / module-private blob in the patch JSON (same pattern as other modules with structured state). Save/load with the patch.

Migrations: if `nodeId` missing on load, drop those entries and warn once.

---

## Prototype plan

### Phase 0 — Design lock (this doc)

Agree: DOMAIN-only storage, click grammar, absolute keyframes, manual include, lin/log/hold.

### Phase 1 — Data + apply (no fancy UI)

- Module stub + state helpers (get/set DOMAIN by `nodeId|paramKey`).
- Two hard-pinned params in a test patch; programmatic keyframes at two MIDI notes; verify morph writes real Hz.

### Phase 2 — Keyboard face + click grammar

- Click / Alt+click / Ctrl+click as specified.
- Markers for keyed / edit / play.

### Phase 3 — Include UX + curves

- Pin last-touched; per-param curve; rebase base.

### Phase 4 — MIDI / poly (optional)

- Drive play key from MIDI; policy for polyphony (lowest / last / per-voice — decide later).

---

## Open questions

1. **Polyphony:** one global morph (mono play key) vs per-voice keyframes when multiple notes hold?
2. **Snapshot diff vs absolute include:** default Alt+click = only changed-vs-base, or always write full include list at current DOMAIN?
3. **Rebase:** when base is recaptured, keep absolute keyframe DOMAINs as-is (recommended) or reinterpret as deltas?
4. **Pitch coupling:** should selecting a key also publish note/gate to the graph, or stay param-only until an output jack exists?
5. **Module name** in the shop: Key Patcher vs Keyframe Keyboard vs Pitch Scene?

---

## Success criteria (MVP)

- Snapshot at C0 and C5 stores real Hz/st values for included filter params.
- Play between them morphs DOMAIN continuously; readout / DSP hear the morph.
- Widening include list is manual; no surprise keyframes.
- Patch save/load restores keyframes.
- Never round-trips through 0…1 unit space for storage.

---

## References

- `docs/PARAM_SURFACES.md` — DOMAIN SSOT, unit map is UI-only.
- Pitch-tracking bandpass work (Passive Filter / Dual Ladder `sweep` in semitones) — example consumer of per-register DOMAIN settings.
