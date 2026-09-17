# Smooth / Step Graph + Knob Overhaul Plan

| Field | Value |
|-------|-------|
| **Author** | Sandbox / Argi |
| **Date** | 2026-09-17 |
| **Status** | Draft plan (rev 4) |
| **Repo** | `C:\Users\argit\Documents\_PROGRAMMING\soemdsp-sandbox` |
| **Motivation (user)** | Reliable Knob+Graph editing so you can breadboard Flower Child Filter (and similar) yourself |
| **Out of scope** | Host/plugin ports, rack engine quirks, multi-rate host assumptions — keep this plan **sandbox-generic** |

---

## Overview

Smooth Graph and Step Graph are the curve tools needed to shape control-rate (and audio-rate-friendly) maps for filter breadboarding. Today their **editor UI is unusable**: custom number fields that do not match the rest of the app’s widgets, broken drag, and face handles that stay invisible until you already know where they are.

Knob is the usual X / bias driver into those graphs. It is implemented as a **module-shaped face over a hidden `offset` Control**, and the face does not reliably show the **smoothed** Bias the graph actually hears. That breaks the “turn knob → see graph respond smoothly” loop.

This plan overhauls two engineering tracks:

1. **Knob** — real module semantics; face displays audio/control result (smoothed / target), not a pseudo-parameter twin.
2. **Smooth / Step Graph editor UX** — shared widgets; hover reveals all value + tension handles; fix interaction bugs.

Flower Child Filter breadboarding (Knob → Graph → filter + feedback) is **user patch work** once the tools work — not a build phase in this plan.

Native curve evaluators (`smooth_graph` / `step_graph`) stay; this is primarily **host UI + Knob Control/display contract**, not a DSP rewrite.

---

## Background (current code)

### Graphs

- Types: `smoothGraph`, `stepGraph` (efficient allowlist). Legacy aliases `graph` / `graph2` / `graphCopy` migrate in `node-graph-default-patch.js`.
- Face math / hit-testing: large surface in `public/node-graph-graph-utils.js`.
- Side list editor: `renderNodeGraphGraphNodeList` in `public/node-graph-module-actions.js` builds rows with **`createNodeGraphGraphRowNumberInput` → bare `<input type="number">`**. No Sound Color steppers, no shared drag-number widget, no metadata-style controls.
- Smooth = global Curve + Tension through free dots. Step = segment Shape + optional grid + per-node contour (`c`) empty-circle handles.

### Knob

- Def (`node-graph-module-definitions.js`): `displayType: "knobFace"`, layout `sliderWidget`, outs `Bias`, hidden param `offset` with `linearSmoothing` / internal smooth seconds. Comment: “Plugin Knob… face is the only UI; no param-out twin of Bias.”
- Face lives under `public/modules/knob/` and is both **input gesture** and **display** — easy to desync from Control smoother `target` vs `out`.
- Range/smoothing metaparams via `nodeGraphControllerRangeSmoothingParameters()`.

### Flower Child Filter (motivation only)

- Already on efficient product (`flowerChildFilter`). Breadboard needs trustworthy Knob → Graph → filter CV / feedback so 0…1 curves can be authored by ear. No host-specific requirements in this plan.

---

## Goals

### Knob

- Treat Knob like any other module: DOMAIN Control + smoother + Bias (and/or PARAM OUT) as normal.
- Face is an **interactive display of the module output** (and optionally target): drag sets **target**; arc/readout can show **smoothed out**, **target**, or both (Display Setting).
- Smoothing actually audible/visible when Bias feeds Smooth/Step Graph (or any MOD/SIGNAL sink).
- Kill “half module / half secret parameter” mental model: one SSOT for value (prefer visible or at least first-class Control cell, not orphan face state).

### Smooth / Step Graph UI

- Replace bare number inputs with the **same drag/stepper widgets** used elsewhere (Sound Color / metadata steppers / shared numeric row controls — pick one SSOT and reuse).
- Number drag works (pointer capture, shift-fine, clamp to field min/max).
- **On face hover:** show **all** value points and **all** tension/contour handles (Step empty circles + Smooth tension-related affordances). Idle can stay quiet; hover = full edit chrome.
- Keep existing curve math unless a bug forces a fix; prefer UI/interaction fixes first.
- Context / floating editor stays in sync with face selection and does not fight face drags.
- **Drive readout on the face:** show **input X** as a line and **final sample X** as a line (input + phase offset). User must see both, not only one cream playhead.
- Rename **Phase → Phase Offset** (param key `phase` → `phaseOffset` with patch migration). Slider + MOD is enough to offset drive without an external Knob.

### Skew Offset vs Phase Offset (glossary)

| Control | Where | What it actually does |
|---------|--------|------------------------|
| **Skew Offset** (`skewOffset`; was `curveOffset`) | **Step Graph only** | Global add into each segment's per-node contour: `effective c = c + skewOffset`. Bends segment *shape*. **Not** the X playhead. |
| **Phase Offset** (`phase` → `phaseOffset`) | Smooth + Step | X drive in cycles 0…1 (wrap). Face scrub + LFO/Phasor/Input modes. |

Do not conflate them in labels or overlays.

### Face lines (Input + Phase Offset)

1. **Input line** — mapped In position on X (after In Min/Max), before offset.
2. **Final line** — `wrap(inputX + phaseOffset)` — where the curve is sampled for Out.
3. Keep Y readout at the final X on the curve.

Phase Offset stays a normal module parameter so you can trim drive without a Knob module. Face scrub continues to write Phase Offset.

---

## Non-Goals

- Rewriting Catmull/segment evaluators in C++/JS unless required to fix a proven audio bug.
- VCV / CLAP / DAW packaging, host sample-rate matrices, or rack-only UI.
- Key Patcher (separate design) — may consume graphs later; not blocking this overhaul.
- Redesigning every controller face (pluginSlider, etc.) in the same pass — share widgets, but ship Knob first.

---

## Pain points (from use)

1. Graph number fields: bad UX, cannot drag, not shared widgets.
2. Graph face: tension/value handles not visible on hover as a set.
3. Knob: smoothing not reflected; face behaves like a pseudo-parameter rather than a module display of Bias.
4. Cannot see input vs final drive on the graph face; Phase naming confuses with Skew Offset.
5. That blocks reliable curve authoring for filter breadboards (user-owned).

---

## Design directions

### A. Knob contract (priority)

| Concern | Direction |
|---------|-----------|
| Value SSOT | `offset` (or rename to `value`) remains the Control DOMAIN target; face drag only `set_param` / patch write to that key |
| Audio | Native/worklet Bias = smoothed Control out (+ In if wired), same as today once push path is correct |
| Face | Read **effective Bias** (and optional raw target) from live readout / worklet strip — do not paint only the last pointer DOMAIN |
| Display Settings | e.g. Readout: `smoothed` \| `target` \| `both`; keep Dial/Label/Value size defaults as already set |
| Metaparams | Smoothing seconds / type stay on Knob; verify host pushes smooth meta into Control like other modules |

**Acceptance:** With smoothing ~30–100 ms, spinning the dial shows lag on the face and on a downstream Smooth Graph cursor/Y when Knob Bias drives graph X or a mapped input.

### B. Graph editor widgets

| Concern | Direction |
|---------|-----------|
| Row editors | Replace `type="number"` with shared stepper/drag numeric control used by parameter settings / Sound Color |
| Fields | x, y, (Step) c — same widget; shape stays `<select>` or shared choice control |
| Sync | Face drag updates list; list edit updates face; one normalize path |
| Bugs | Audit pointer handlers that steal drag from inputs; fix focus/selection races |

### C. Face hover chrome

| Concern | Direction |
|---------|-----------|
| Hover | While pointer over graph face (or module display), force-visible: all node dots + Step contour handles (+ Smooth tension UI if any per-point) |
| Leave | Restore default dim/hide policy |
| Hit targets | Hover visibility must not change hit geometry in a way that makes points jump |

### D. Input line + Phase Offset line

| Concern | Direction |
|---------|-----------|
| Naming | UI **Phase Offset**; migrate `phase` → `phaseOffset` (read legacy `phase`) |
| Input line | Distinct style (e.g. dim vertical) at mapped In X |
| Final line | Distinct style (current cream playhead) at `wrap(inputX + phaseOffset)` |
| Modes | Input mode: both lines. LFO/Phasor: final line is the running phase; input line optional/hidden if In unused |
| Skew Offset | Unchanged; Step-only; never drawn as an X playhead |

## Work phases



### Phase 0 — Spike / bug inventory (short)

- Reproduce: number drag fail, handle visibility, Knob smooth vs face.
- Trace Knob: face write → `set_param(offset)` → smoother → Bias sample → graph.
- List shared widget candidate(s) to reuse (file + API).

### Phase 1 — Knob smoothing + face truth

- Fix push/read so Bias is smoothed when meta says so.
- Face shows smoothed (default) with optional target ghost.
- Smoke: headless or scripted Bias lag; manual Graph follow check.

### Phase 2 — Graph numeric UI swap

- Shared widgets in `renderNodeGraphGraphNodeList`.
- Drag / shift-fine / clamp; kill bare number inputs for x/y/c.
- Regression: add/remove points, Step shape rows, undo if present.

### Phase 3 — Hover: all handles visible

- Face render flag `hoverRevealAll`.
- Smooth + Step both; no layout jump.

### Phase 4 — Input + Phase Offset face lines + rename

- Rename Phase → Phase Offset (`phaseOffset` + migration).
- Draw input X line and final X line (`wrap(input + phaseOffset)`).
- Document Skew Offset vs Phase Offset in tooltips (Step).
- Verify Out samples at final X; scrub still edits Phase Offset.

### Phase 5 — Interaction bug sweep

- Known flicker / flat-line issues called out in `graph-utils` comments.
- Pointer capture conflicts between face and floating list.
- Grid snap / Ctrl-free / Shift-fine still match docs in `graph-utils` header.

---


## File touch map (expected)

| Area | Likely files |
|------|----------------|
| Knob face / contract | `public/modules/knob/*`, `node-graph-module-definitions.js` (knob), live readout / native graph param push |
| Graph list UI | `public/node-graph-module-actions.js` (`createNodeGraphGraphRowNumberInput`, `renderNodeGraphGraphNodeList`) |
| Graph face | `public/node-graph-graph-utils.js` (+ any face binder) |
| Shared widgets | existing Sound Color / metadata stepper modules (reuse, don’t fork) |
| Docs | this plan |

---

## Success criteria

1. Knob Bias into a Graph shows visible smoothing on face and on graph response when smoothing > 0.
2. Graph point x/y/(c) use shared drag/stepper widgets; dragging numbers works.
3. Hovering the graph face reveals all value points and all tension/contour handles.
4. Smooth + Step remain editable without the “stupid widgets” path.
5. Face shows input line and final (input + phase offset) line; Phase labeled Phase Offset.
6. Skew Offset remains Step contour bias only — not confused with Phase Offset in UI.
7. No host-specific or rack-specific branches introduced for this work.

---

## Open questions

1. Knob readout default: smoothed-only vs smoothed+target ghost?
2. Which shared numeric widget is the SSOT (metadata stepper vs Sound Color vs face num field)?
3. Hover reveal: module hover vs only display-canvas hover?
4. Should graph list move fully into Display Settings / unified window, or stay context panel with new widgets?
5. Plugin Slider: same face-vs-smooth bug class — fix in Phase 1 or defer?
6. Input/final line colors and whether input line shows in LFO/Phasor modes?
7. Phase Offset wrap: always wrap 0…1, or clamp when Mode = Input?

---

## References

- `public/node-graph-graph-utils.js` — Smooth vs Step contracts, hit testing
- `public/node-graph-module-actions.js` — graph node list / bare number inputs
- `public/node-graph-module-definitions.js` — `knob`, `smoothGraph`, `stepGraph`, `flowerChildFilter`
- `docs/PARAM_SURFACES.md` — DOMAIN / Control stickiness
- `docs/KEY_PATCHER_DESIGN.md` — later consumer of reliable 0…1 maps (not in scope here)
