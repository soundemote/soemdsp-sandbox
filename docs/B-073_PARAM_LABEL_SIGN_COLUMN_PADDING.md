# B-073 — Parameter label left padding vs number (sign column)

Report ID: B-073  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28  
Related: commit `44f69817` (Align slider labels with value sign column); B-061 (slider readout formatting)

## User symptom

Text on parameters (labels/names) appears to have padding that offsets them rightward compared to the number (readout/value).

## Repro

1. Open a module with Bias / slider parameters that show both a label and a numeric readout (default stacked label-over-value layout).
2. Compare the left edge of the parameter name with the left edge of the value (especially negative values, or values with an explicit `+` when showSign is on).
3. Observe the label sits ~1ch to the right of the number’s leading glyph.

## Expected behavior

Label and number share the same left text edge. Sign-column reservation belongs only in the formatted value string, not as extra CSS padding on the label.

## Root cause

`.node-slider-readout.reserves-sign-column .node-slider-readout-label { padding-left: 1ch; }` (added in `44f69817`) indented every numeric/choice label. Values already reserve the sign column in text via `formatNodeSliderNumber(..., { reserveSignSpace: true })` (leading space) or an explicit `+`/`−`. When the value starts with a real sign character, the label padding made the name sit right of the number.

Several alternate slider layouts already forced `padding-left: 0` on the label, which was a partial workaround for the same rule.

## Fix

- Removed the `padding-left: 1ch` rule from `public/styles.css`.
- Left a short CSS comment (B-073) so the sign-column pad is not reintroduced.
- UI/CSS only; no JS audio path changes. The `reserves-sign-column` class toggle in `node-graph-slider-readout.js` remains (harmless; no longer styles the label).

## Verify

1. Hard-reload Live UI.
2. Module with stacked label + value: label left edge matches the value string left edge for positive (leading space), negative (`−`), and showSign (`+`) cases.
3. Spot-check layouts that already zeroed label padding (`label-value-slider`, `label-outside`, `value-outside`) — unchanged / still flush.
4. No audio / DSP behavior change expected.