# Key Patcher � Design

| Field | Value |
|-------|-------|
| **Author** | Sandbox / Argi |
| **Date** | 2026-09-16 (rev 2 same day) |
| **Status** | Draft � brainstorm — design (rev 2) |
| **Repo** | `C:\Users\argit\Documents\_PROGRAMMING\soemdsp-sandbox` |
| **Related** | `docs/PARAM_SURFACES.md` (DOMAIN vs unit 0�1), existing keyboard / pitch-reference UI |

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
- Store and apply **DOMAIN** values only (Hz, st, dB, domain floats) � never 0�1 slider normals as the source of truth.
- Diff on snapshot: only params that changed (epsilon) enter the keyframe, unless manually pinned.
- Manual include / exclude of which params participate � no automatic spread of one key's edits onto all keys.
- Interpolate between nearest keyframes along the MIDI axis for continuous params; hold for enums / discrete.
- Blue Note In / Out / Thru (+ mask) so a Keyboard module can drive play-key morph and continue the note chain.
- Clear poly story: graph-local shared morph vs metamodule Voice DOMAIN rack (per-voice apply).

### Non-Goals (rev 1)

- Full graph clone per key (nodes, cables, module presence).
- Auto-detecting every knob touch into a global automap across the keyboard.
- Replacing Patch Pitch / `0.1V/Oct` / voice pitch plumbing � Key Patcher morphs DOMAIN and can **route** blue notes (In/Out/Thru) without owning oscillator pitch math.
- Perfect musical models of every curve on day one (start lin / log / hold).
- Native audio-rate morph of every param (block-rate / control-rate apply is enough for MVP).

---

## Parameter value contract (critical)

Align with `docs/PARAM_SURFACES.md`:

| Layer | Role for Key Patcher |
|-------|----------------------|
| **DOMAIN** | **SSOT for keyframes.** Snapshot stores DOMAIN; play writes DOMAIN via the same host paths as knobs (`set_param` / patch params). |
| **Unit 0�1** | UI mapping only. **Never** persist keyframes as unit positions � nonlinear sliders would corrupt Hz/st across keys. |
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

**Epsilon for diffs:** domain-aware (relative for Hz-like, absolute for 0�1 knobs that are already domain). Never diff in unit space.

---

## User interaction (keyboard face)

Separate module (working title: **Key Patcher**), keyboard display as the main face.

| Input | Mode | Behavior |
|-------|------|----------|
| **Click** | Play | Select key. Apply morph toward that key's keyframe (and optionally arm "current play key" for MIDI/QWERTY later). |
| **Alt+click** | Snapshot | Diff current graph DOMAIN vs base (see below) ? create/update keyframe for that key. Only included params. |
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

- Store a **base DOMAIN snapshot** of the **include list** (or of all continuous params on included modules � product choice; default = include list only).
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

- Empty include + snapshot — either no-op or prompt; **do not** silently keyframe the whole patch.
- User pins params (UI: "pin from last touched", or pick from a list).
- Exclude always wins.

No automatic "you moved X so every key now has X."

---

## Morph / apply

### Axis

MIDI note number as X (semitone-linear). Example: keyframes at 24 (C0) and 84 (C5); play at 60 — interpolate t = (60-24)/(84-24).

### Per-param interpolation

| Domain kind | Default curve |
|-------------|---------------|
| `kind: "frequency"` / Hz-like | **log** (lerp in log2 space) |
| Most continuous (reso, morph, drive, �) | **lin** |
| Enum / discrete / choice | **hold** (nearest keyframe) |
| Semitone offsets (`unit: "st"`) | **lin** in st |

Override per param in `curves` when needed.

### Apply path

1. Resolve play MIDI (click or later MIDI in).
2. Find surrounding keyframes (or exact).
3. For each param in the **union** of neighboring keyframes n include list, compute DOMAIN value.
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
- Optional: output MIDI or gate later � not required for param morph MVP.

**I/O (later):** `MIDI` / note in, `Gate`, maybe `Morph` CV 0�1 across a fixed key range. Rev 1 can be mouse-only on the face.

---


---

## Blue play-key note I/O (rev 2)

Key Patcher is not mouse-only. It carries **blue** music-note jacks so a Keyboard (or MIDI) module can drive play-key selection the same way other note routers work.

| Jack | Direction | Role |
|------|-----------|------|
| **Note In** | In | Play-key / morph driver. Note-on selects the play MIDI; morph DOMAIN apply follows that note. |
| **Note Out** | Out | Emits the active play note (from face click or from Note In). Lets the Key Patcher sit mid-chain as the �tuned� note source. |
| **Note Thru** | Out | Pass-through of Note In (masked), so the patch can keep a parallel un-morphed path if needed. |
| **Note mask** (param or face) | � | Which pitches Key Patcher responds to / re-emits (range, white-keys-only, custom set � exact mask UI TBD; behavior is �filter the blue note stream�). |

**MVP rule:** face click and Note In share one **playMidi**. Alt/Ctrl edit grammar stays pointer-based on the face; blue notes do not snapshot by themselves.

Gate / velocity: optional later jacks; rev 2 only requires note identity for morph + thru.

---

## Polyphony & metamodules (rev 2)

### The confusion (real)

A **polyphony metamodule** is a self-contained child universe: voice instances clone a template graph with their own node IDs and DOMAIN state. An outer Key Patcher that writes `passiveFilter-2|lowFrequency` on the **parent** canvas cannot address �voice 3�s filter� � that node does not exist on the parent.

So: **per-key timbre for poly voices cannot be �reach into the metamodule from outside with parent nodeIds.�**

### Recommended split

| Placement | What it morphs | Polyphony |
|-----------|----------------|-----------|
| **A. Graph-local Key Patcher** | DOMAIN on modules **in the same canvas** | One shared morph (last/lowest/play note). All voices hear the same knob values if they only share parent-level FX � fine for mono or global FX. |
| **B. Voice-local keyframes** | DOMAIN **inside the voice template** | Each voice applies keyframes for **its own** note at note-on / note change. This is the poly path. |

**B is where metamodule needs its own parameter hook** � your instinct is right.

### Metamodule Voice DOMAIN rack (hook)

Treat keyframe storage as a **metamodule-owned** table, not a parent-graph poke API:

1. Authoring UI can still be the Key Patcher keyboard face (placed **on the metamodule shell**, or **inside** the template for editing).
2. Include list uses **template-relative** refs (`templatePath|paramKey` or stable child ids inside the template), never live voice instance ids.
3. Keyframes store **DOMAIN** (same contract as � Parameter value contract).
4. At **voice start** (and on legato note change if allowed), the metamodule runtime:
   - reads the voice�s MIDI note
   - morphs the Voice DOMAIN rack
   - writes DOMAIN into **that voice instance�s** child controls (same sticky `set_param` path, voice-scoped)

Parent blue notes: Keyboard ? (optional outer Key Patcher thru) ? metamodule Note In. Outer Key Patcher is **not** required for poly timbre if the rack lives on the metamodule; outer Key Patcher remains useful for **parent-canvas** modules (master filter, FX) with a mono play-key.

### What not to build

- Parent Key Patcher walking into metamodule internals by cloned node id.
- Duplicating the entire child patch JSON per MIDI key.
- Auto-syncing parent include lists into child racks.

### Authoring UX sketch (poly)

1. Enter metamodule template; pin include params; Alt+click keys to snapshot DOMAIN inside the template (or on shell while �edit template� is active).
2. Save rack on the metamodule node.
3. Perform: notes enter metamodule; each voice gets its own morph apply; no global stomping of sibling voices.

---
## Persistence

Store `KeyPatcherState` on the module node params / module-private blob in the patch JSON (same pattern as other modules with structured state). Save/load with the patch.

Migrations: if `nodeId` missing on load, drop those entries and warn once.

---

## Prototype plan

### Phase 0 � Design lock (this doc)

Agree: DOMAIN-only storage, click grammar, absolute keyframes, manual include, lin/log/hold.

### Phase 1 � Data + apply (no fancy UI)

- Module stub + state helpers (get/set DOMAIN by `nodeId|paramKey`).
- Two hard-pinned params in a test patch; programmatic keyframes at two MIDI notes; verify morph writes real Hz.

### Phase 2 � Keyboard face + click grammar

- Click / Alt+click / Ctrl+click as specified.
- Markers for keyed / edit / play.

### Phase 3 � Include UX + curves

- Pin last-touched; per-param curve; rebase base.

### Phase 4 � Blue note I/O

- Note In / Out / Thru + basic mask; face click and Note In share playMidi.

### Phase 5 � Metamodule Voice DOMAIN rack

- Template-relative include refs; apply on voice start; poly path separate from graph-local Key Patcher.

---

## Open questions

1. **Snapshot diff vs absolute include:** default Alt+click = only changed-vs-base, or always write full include list at current DOMAIN?
2. **Rebase:** when base is recaptured, keep absolute keyframe DOMAINs as-is (recommended) or reinterpret as deltas?
3. **Module name** in the shop: Key Patcher vs Keyframe Keyboard vs Pitch Scene?
4. **Note mask UI:** range knobs vs per-key toggle vs reuse an existing mask control pattern?
5. **Legato inside a voice:** re-morph DOMAIN on note change while gated, or only at voice steal / note-on?
6. **Shell vs inside-template authoring:** is Key Patcher face on the metamodule shell enough, or must authoring happen inside the child canvas?

---

## Success criteria (MVP)

- Snapshot at C0 and C5 stores real Hz/st values for included filter params.
- Play between them morphs DOMAIN continuously; readout / DSP hear the morph.
- Widening include list is manual; no surprise keyframes.
- Patch save/load restores keyframes.
- Never round-trips through 0�1 unit space for storage.
- Blue Note In selects play key; Note Out / Thru behave as documented (graph-local MVP).
- Design-level clarity: poly timbre uses metamodule Voice DOMAIN rack, not parent poke-into-child.

---

## References

- `docs/PARAM_SURFACES.md` � DOMAIN SSOT, unit map is UI-only.
- Pitch-tracking bandpass work (Passive Filter / Dual Ladder `sweep` in semitones) � example consumer of per-register DOMAIN settings.
