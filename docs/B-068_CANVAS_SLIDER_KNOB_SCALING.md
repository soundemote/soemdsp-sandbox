# B-068 — Canvas-mode slider/knob/text display scaling is not WYSIWYG

Report ID: B-068  
Status: open  
Severity: see  
Source: user 2026-09-28  
Related: B-050 (workspace zoom/stutter; separate scaling symptom unless a shared canvas path is confirmed)

## User symptom

The slider display does not scale properly in canvas mode, the knob also does not scale properly, and slider-associated text can be positioned or scaled so badly that it ends up outside the module. The exact WYSIWIS/WYSIWYG intent is: **“what I see is what is scaled” is not being held true in canvas mode for slider/knob display or its text.**

## Repro

1. Enter canvas mode with a module that has a slider and a knob/control display.
2. Change the canvas scale and compare the rendered slider display and knob against the surrounding module chrome and other scaled content.
3. Observe that the slider display and knob do not visually scale consistently with what is shown on the canvas.
4. Check the slider-associated text; observe cases where it is badly positioned or scaled and ends up outside the module.

## Expected behavior

Canvas mode must scale the slider display, knob, and slider-associated text consistently with the rest of the rendered canvas. WYSIWYG must hold: what is visibly rendered is what the canvas scale applies, without a separate or incorrect slider/knob/text scale, and the text must remain positioned within the module bounds.

## Investigation / fix shape

- Audit the canvas-mode transform and the slider/knob/text rendering geometry, including any CSS-pixel versus canvas-unit conversion and text anchoring/positioning.
- Ensure the slider display, knob, and associated text are scaled exactly once by the authoritative canvas scale and remain aligned with their visible bounds inside the module.
- Verify several canvas scales and modules, including slider-only, knob-containing, and text-bearing layouts, without changing audio/DSP behavior.
- This report is docs-only; no code fix is included.