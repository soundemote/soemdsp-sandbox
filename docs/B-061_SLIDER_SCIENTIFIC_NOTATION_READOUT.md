# B-061 — Small slider readout strips scientific exponent

**Status:** fixed (2026-09-27)  
**Severity:** see  
**Source:** user 2026-09-27

## User symptom

When sliders hold very small domain values, the value face / readout shows something like `8.0357` instead of the true magnitude (e.g. `0.00000080357`). User suspected exponents being read as literal numbers (stripping `e-7` from scientific notation).

## Repro

1. Set a slider to a domain value with absolute magnitude below `1e-6` (JS `String(n)` then uses scientific notation).
2. Observe the slider value readout / face text.
3. Before the fix: mantissa only (`8.0357`). After: plain decimal with leading fractional zeros (`0.00000080357`).

## Root cause

**Yes — it was the exponent.**

- `formatNodeSliderNumber` fed `String(number)` into `limit_decimals`.
- For `|n| < 1e-6` (or `|n| >= 1e21`), `String(n)` is scientific, e.g. `"8.0357e-7"`.
- `limit_decimals` only regex-parses `whole.fraction` (`/^(\d*)(\.?)(\d*)/`), so the `e-7` is dropped and the display becomes `"8.0357"`.
- Value LED/LCD already expanded via `nodeGraphNumberReadoutPlainDecimalSource`; slider faces did not.

## Fix

- Added `nodeSliderPlainDecimalSource` in `public/node-graph-slider-metadata.js` (expand with `toLocaleString` / `toFixed` fallback).
- `limit_decimals` expands any scientific input at entry (covers all callers).
- `formatNodeSliderNumber` routes through the plain-decimal helper.
- Number-readout plain-decimal helper delegates to the shared one when available.
- Smoke: `scripts/test_b061_slider_sci_notation.js` (includes the `8.0357e-7` → `0.00000080357` case).
- Cache-bust: `node-graph-slider-metadata.js?v=b061-sci-notation-1`.

## Verification

Run `node scripts/test_b061_slider_sci_notation.js`. Manually drag a slider into sub-1e-6 domain and confirm the face shows leading zeros, not a bare mantissa.
