# B-075 - Pitch Mod Wheel face has no pitch/mod-wheel UI or display control

Report ID: B-075  
Status: open  
Severity: see  
Source: user 2026-09-28  
Related: catalog name "Pitch Mod Wheel"; custom pitch/mod wheel face; display-visibility controls

## User symptom

After dragging out the **Pitch Mod Wheel** module, the module does not show pitch wheel or mod wheel controls. It also has no display and no button/control to show the display.

## Repro

1. Drag **Pitch Mod Wheel** from the module catalog onto the workspace.
2. Inspect the module face and its display-related controls.
3. Observe that the pitch/mod wheel UI, display, and display-show control are missing.

## Expected behavior

The dropped module should show its Pitch and Mod wheel UI, provide its display/face, and expose the normal control to show the display when it is hidden.

## Related modules/files

- Catalog entry: `public/node-graph-module-store.js` (`pitchModWheel`, label **Pitch Mod Wheel**).
- Face definition: `public/node-graph-module-definitions.js` (`pitchModWheel`, custom `pitchModWheel` layout, Pitch/Mod/Reset inputs, Pitch/Mod outputs).
- Custom face factory: `public/node-graph-module-factories.js` (`createNodeGraphPitchModWheelBody`).
- Layout/render route: `public/node-graph-module-rendering.js` (`pitch-mod-wheel-layout`).
- The catalog's implementation reference points to `public/modules/pitchModWheel/pitch-mod-wheel-live-evaluator.js`, but that path is not present in the current working tree; verify whether this is stale or part of the missing-face path.

## Investigation / fix shape

Trace the catalog-to-definition-to-custom-face/rendering path and the display-visibility control wiring. Restore the intended face and display control without changing DSP behavior. Docs only; no code fix in this report.
