# Slider buffered modulation (destination control = real effective-param history)

Status: parked design. Do not implement until explicitly asked.  
Captured: 2026-08-14.  
Ship parked under: **0.5.0 RGB**.

Related: `docs/PARAM_SURFACES.md` (DOMAIN / MOD / SIGNAL IN), ghost sliders in `public/node-graph-ghost-sliders.js`, worklet fold in `public/node-live-audio-worklet-smoother.js` (`readEffectiveParameter`).

---

## Intention

Show the **real buffered modulation** inside the destination slider: the same samples DSP already computed after `readEffectiveParameter`, painted in the rectangle you grab.

This is not a prettier fill and not a modulation-amount ring. The control and the proof are the same object.

Claim to protect: **destination slider = live history of the post-fold parameter on the value axis.** Time-on-X inside the row is just Trace in a param row. Plenty of software does that. The rare thing is occupancy on the axis you drag.

No software we know of ships that as the destination control itself. Keep the claim honest: do not ship a mini-scope and call it this.

---

## What exists today (do not confuse)

| Layer | What it actually is |
|--------|---------------------|
| Slider UI | Hidden `input[type=range]` + `.node-slider-readout` (CSS amount, DOM label/value/unit). Drag / type-in / keyboard / metadata hang off the readout. |
| Ghost sliders | CSS tick from **static source knob values** added to the destination base. Only fires when the modulator is itself a parameter output. LFO, audio, and any real buffer never appear. |
| DSP truth | `readEffectiveParameter` every sample: smoothed DOMAIN base + folded MOD sources (`nodeGraphParamFoldModSources` / `applyParameterModulation`). That number is used by evaluators and discarded. UI never sees the stream. |
| Scopes | Separate visual sinks. Worklet hops capture at ~12 kHz because full-rate visual writes starved the audio thread. Browsers hard-cap ~16 WebGL contexts. Scope compositor is already the scarce GPU budget. |

Ghost sliders are the prototype of the **wrong** product. Kill them once the tap exists. Do not draw both.

---

## Visual contract (first ship: live update)

Slider length stays **parameter range** (DOMAIN unit after the same map the handle uses). Not time.

Three layers in one box:

1. **Base** — the value you drag. Handle does not dance with the LFO.
2. **Now** — latest effective sample, mapped onto the same min/max. Caret.
3. **Buffer** — recent effective samples as **occupancy** on that axis (brightness / thickness where the signal spends time).

First visual pass: **occupancy smear + current caret + static handle.**

Later optional (not first): a thin time strip *inside* the box under the occupancy. Only if it does not steal the grab axis.

Readings this should make obvious:

- Sine LFO into cutoff → bar that breathes between two points.
- Audio-rate into a slider → filled occupancy smear.
- Gate → blink between two ticks.
- Stacked mods → one folded stream (same fold DSP uses), not N ghost ticks.

---

## Non-goals

- One WebGL context per slider (Chrome ~16 context cap; scopes already consume it).
- Hosting this paint on the phosphor / scope compositor. Scopes stay a neighbor. A bad slider frame must not stall a scope; scope context loss must not blank param rows.
- Time-on-X as the primary reading.
- Recomputing `readEffectiveParameter` for visuals.
- Visualizing hidden params, bypassed destinations, or unwired rows.
- Growing WASM / visual pools “because every slider could subscribe.”
- Changing DSP, clamping, folding, or “helping” audio so the paint looks nicer. Draw what DSP used, including out-of-range when policy allows it (`docs/PARAM_SURFACES.md`).
- Replacing drag, type-in, keyboard, metadata, number-only, or the hidden range as source of truth for the **base**.

---

## Data path

Tap the value already returned. Do not compute it twice.

```text
worklet evaluateFrame
  → effective = readEffectiveParameter(...)   // already paid
  → if subscribed: write hop-rate sample into that param's ring
  → post snapshot with other visual rings (or a sibling channel)
main
  → paint occupancy + caret into that readout's strip
```

Subscribe only when **all** of:

- param has at least one active modulation
- destination is not bypassed
- row is not hidden
- control is on screen (and, later, not zoom-culled if we already cull faces)

Zero cost otherwise. Same hop family as scopes (~12 kHz visual write, not engine rate). Do not `postMessage` 48 kHz × N params.

Ring content: **normalized to the slider’s value axis** (same unit map as the handle), plus enough metadata to draw out-of-range if the effective value left min/max.

Normalize on write using the same DOMAIN helpers as `PARAM_SURFACES.md`. Do not invent a second map.

---

## Paint path

Keep the current interaction contract:

- hidden range = base value source of truth
- `beginNodeSliderDrag` = interaction
- double-click = type-in
- readout = hit target

Replace only **paint** of amount / ghost with a strip:

1. First implementation: one 2D canvas (or one shared 2D compositor) behind or inside the readout. DOM text can stay.
2. Shared workspace 2D compositor when more than one row is live.
3. WebGL **only** if occupancy / phosphor-in-the-track needs a shader. New context, not the scope compositor.

Do not start by restyling every param row in CSS.

---

## Phased work (when we return)

### P0 — Prove the tap (one destination)

- Publish a ring of hop-rate effective samples for **one** wired, visible param.
- Prove against: LFO, audio-rate, stacked mods.
- No compositor yet; a single debug strip or one readout is enough.

### P1 — Live update in one real control

- Occupancy + caret + static handle on **one** surface: Slider module face **or** a single Bias-style param row.
- Ghost off for that control.
- Confirm drag still sets base; paint still shows effective.

### P2 — Subscribe policy + cost

- Visible + modulated + not hidden only.
- Drop rings when unwired, hidden, off-screen, or module bypassed.
- Measure audio-thread cost. If it shows up like the old unconditional `readEffectiveParameter` tax (Sabrina underruns), cut write rate or subscriber count before expanding.

### P3 — Shared 2D compositor for every modulated on-screen row

- Same painter for param rows, Slider face, macros, plugin strips.
- Kill remaining ghost sliders.

### P4 — Optional later

- Thin time strip inside the box.
- Promote painter to WebGL if 2D occupancy is visibly not enough.
- Never merge into the scope compositor unless a later design pass justifies one GPU camera for the whole workspace.

---

## First cut when implementing (scope lock)

**P0 + P1 only.** One destination. Occupancy + caret + handle. 2D strip. Scopes untouched.

Not in the first cut: all sliders, WebGL, time-on-X, macros/plugins, CSS box restyle of the whole app.

---

## Constraints already in force

- App-wide L/M/R colors and analog/digital jack chrome do not apply to this paint unless a later pass defines a stereo param strip.
- No secret clip/limit of audio. Visualization is not a clipper.
- Do not raise delay/reverb WASM pools if memory is tight.
- Hidden params stay default-hidden.
- Do not commit/push unless asked.

---

## Open decisions (resolve at implement time, not now)

- Occupancy window length (start from Trace-like “last N seconds,” but keep it short — a slider is not a scope face).
- How far past min/max to draw when `modClamp` is false.
- Whether the numeric readout shows **base** (today) or **now** (effective). Recommendation: keep the number as base while dragging / type-in; optional dim effective number later.
- Slider face first vs Bias row first. Recommendation: Bias-style param row, because that is the app-wide control.

---

## Key files (for the implementer)

| Area | Files |
|------|--------|
| Fold / effective | `public/node-live-audio-worklet-smoother.js`, `public/node-graph-stdlib/node-graph-param-surface-helpers.js` |
| Surfaces policy | `docs/PARAM_SURFACES.md` |
| Ghost (replace) | `public/node-graph-ghost-sliders.js`, `public/styles.css` (`.has-ghost-slider`) |
| Readout / drag | `public/node-graph-slider-readout.js`, `public/node-graph-slider-readout-controls.js`, `public/node-graph-slider-dragging.js` |
| Scope hop (do not host here; copy the hop lesson) | `public/node-live-audio-worklet-scope-io.js`, `public/node-graph-module-scopes.js` (context-cap comment) |
