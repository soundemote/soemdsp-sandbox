# B-057 — Hide unused leaves oversized bottom lip

**Status:** fixed (2026-09-27)  
**Severity:** see  
**Source:** user 2026-09-27  
**Related:** B-036 (shared layout/band recomputation path; separate hide-unused symptom)

## User symptom

Enabling **Hide unused** does not recalculate the module's bottom lip after unused controls or I/O are removed. A Keyboard module can keep a large bottom lip even when only a few I/O remain, leaving unnecessary empty space.

## Repro

1. Show a Keyboard module with unused controls or I/O.
2. Enable **Hide unused** so only a few I/O remain.
3. Observe that the module retains a large bottom lip instead of shrinking to the visible content.

## Root cause

IO section / outer height used the full definition port count. CSS `.unused-hidden` hid unused jack rows, but the IO grid track and `--node-grid-height-units` stayed tall. Chrome sync also did not re-run `applyNodeGraphModuleLayout`, so stack rows could stay stale.

## Fix

- `nodeGraphModuleIoRowCount` counts only connected signal ports when `ui.hideUnused`.
- `nodeGraphModuleIoSectionHeightGu` returns 0 when no rows remain (no min-floor).
- `syncNodeGraphModuleChromeElement` re-applies layout bands after height CSS writes.
- Wire edits refresh hide-unused modules so connect/disconnect resizes the strip.
- Smoke: `scripts/test_b057_hide_unused_io_height.js`.

## Follow-up — empty strip must leave the grid (2026-10-01)

Zero-row hide-unused omitted the IO **band** but CSS still forced `.dsp-node-io-section[hidden]` to `display: grid`, so the orphan strip shared a row with face/params and opened an implicit second column (content left, blank right).

- `nodeGraphModuleStripIoBandVisible` is the strip-IO gate (LayoutA / Metamodule / InletOutlet only; LayoutB always false).
- `applyNodeGraphModuleLayout` toggles `io-strip-collapsed`, sets the section `hidden`, and clears stale `grid-row`.
- CSS paints the strip only when not collapsed / not `[hidden]`; collapsed strips are `display: none`.
- LayoutB shell columns are unchanged.
