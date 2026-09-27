# B-056 - Default filter drawer pollutes basic displays / Softclipper display jitters

**Status:** open  
**Severity:** see  
**Source:** user 2026-09-27  

## User symptom

The default filter drawer appears to pollute basic displays. **Softclipper** jitters between an unused filter display and its intended display instead of keeping the intended display stable.

## Repro

1. Open a basic display containing or associated with Softclipper while the default filter drawer is present but unused.
2. Observe display ownership/selection.
3. Confirm whether Softclipper alternates or jitters between the unused filter display and its intended display.

## Expected behavior

An unused/default filter drawer must not claim, overwrite, or pollute a basic display. Softclipper should remain on its intended display without visual switching or jitter.

## Investigation / fix shape

Trace default filter-drawer registration, display ownership, and the Softclipper display-selection/render path. Make selection deterministic and ensure unused filter displays are excluded from basic-display routing. No code fix is part of this docs-only report.

## Verification

Re-run the Softclipper/basic-display repro with the default filter drawer present and unused. Confirm the intended display remains stable; repeat with other basic displays to check that the drawer does not pollute them.
