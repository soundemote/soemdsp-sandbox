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

## Verification

Repeat the Keyboard repro with different counts of visible controls and I/O. Confirm that the bottom lip follows the visible content, does not retain the old oversized height, and does not cause slider/jack overlap.
