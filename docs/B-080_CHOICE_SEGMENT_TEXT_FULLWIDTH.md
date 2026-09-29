# B-080 — Choice segment text ellipsizes before full track width

Report ID: B-080  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28 (Tube Saturation / choices-divided repro context)  
Related: B-073 (sign-column label pad); B-079 (choice subset dividers)

## User symptom

On a Choices parameter (divided/segmented slider), the choice name text does not use the full available slider/segment track width and ellipsizes (`...`) too early (e.g. long names like "Analog Square", "Trisaw Center").

## Repro

1. Open a module with a divided choices param (e.g. PolyBLEP Waveform with `divideChoicesVisibly`, or any choices-divided readout in a Tube Saturation patch).
2. Select a long choice label.
3. Observe the value text truncates with `...` while unused empty space remains on the right of the track (unit column ghost).

## Expected behavior

Choice label text may use the full track width (minus normal overflow/ellipsis only when the name truly exceeds the track). Empty unit column must not steal width from the label.

## Root cause

Default readout grid is `minmax(0, 1fr) auto` with `column-gap: 7px`. `.node-slider-readout-unit` keeps `min-width: var(--node-slider-unit-width)` (2.5em). `.is-empty` only set `visibility: hidden`, so the unit column still reserved ~2.5em + gap. Choice params almost never have a unit, so labels ellipsized early.

## Fix

- Toggle `.displays-choices` on the readout when `usesChoices` (`node-graph-slider-readout.js`).
- When `.displays-choices` and unit `.is-empty`: `display: none` the unit, `column-gap: 0`, and `grid-template-columns: minmax(0, 1fr)` so a spanning label cannot keep the auto unit track alive; value `width/max-width: 100%` (`public/styles.css`).
- Keep two columns for `value-outside` / `label-value-slider` (label|value side-by-side).
- Cache-bust: `styles.css` + `node-graph-slider-readout.js` → `b080-choice-fullwidth-2`.
- UI/CSS only; no audio/DSP path change.

## Verify

1. Hard-reload Live UI.
2. PolyBLEP (or any choices-divided) Waveform → long names show without early `...` when they fit the track; still ellipsize only if longer than the full track.
3. Numeric params with empty unit unchanged in behavior except choices path; choice params that somehow carry a unit keep the unit column.
4. Spot-check `value-outside` / `label-value-slider` layouts — value placement unchanged.
5. `node scripts/test_b080_choice_label_fullwidth.js`
