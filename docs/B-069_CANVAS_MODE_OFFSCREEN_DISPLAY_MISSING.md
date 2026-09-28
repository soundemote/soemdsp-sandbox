# B-069 - Canvas mode omits displays that are not in view

Report ID: B-069  
Status: open  
Severity: see  
Source: user 2026-09-28  
Related: B-068 (canvas-mode slider/knob/text display scaling; shared canvas display path may be involved)

## User symptom

A display that is not currently in view does not appear when the workspace is shown in canvas mode. The canvas-mode result appears to depend on current viewport visibility.

## Repro

1. Place a module with a display outside the current viewport, or pan/zoom so the display is not in view.
2. Enter or refresh canvas mode.
3. Observe that the display is missing from the canvas-mode result.
4. Bring the display into view and compare the canvas-mode result.

## Expected behavior

Canvas mode should include configured displays consistently, regardless of whether a display happened to be in the current viewport when canvas mode was entered or refreshed.

## Investigation / fix shape

- Audit canvas-mode display collection, viewport culling, and lazy-render/visibility gating.
- Do not drop an off-screen display from the canvas-mode result merely because it was not visible at capture time.
- Cross-check B-068 for shared transform/display handling.
- This report is docs-only; no code fix is included.