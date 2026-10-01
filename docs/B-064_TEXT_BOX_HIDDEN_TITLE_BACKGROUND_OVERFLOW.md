# B-064 - Text Box background overflows outline when title is hidden

**Status:** fixed (2026-10-01)  
**Severity:** see  
**Source:** user 2026-09-28; reopen 2026-10-01 (face vs stroke + perform bg)  
**Related:** B-032 (Text Box resize/text clipping); B-055 (Text Box wire z-order, fixed)

## User symptom

When the Text Box title is hidden, the background extends beyond the module outline/border. Face fill, plate fill, and stroke disagree. Perform / layout-canvas also dropped the background color (plate stayed in the editor).

## Repro

1. Add or open a Text Box.
2. Hide the title (typically with buttons already hidden).
3. Inspect the background at each edge of the module outline/border.
4. Restore the title and compare the bounds.
5. Show in canvas / Perform: background color should match the plate face.

## Expected behavior

The background remains inside the Text Box module outline/border regardless of title visibility. Hiding the title may reclaim its layout track, but it must not expand the painted background beyond the outer bounds. Perform/canvas uses the same face background SSOT.

## Root cause

- Article CSS height is `(outerGu × grid) − plate inset-y`. Title-hidden Text Box set face gu to `outer − header` and grew with `minmax(scope-height, 1fr)`, so the face min height exceeded the article and painted past the rounded stroke.
- Plate `::before` used `--node-module-fill` while the face used `--node-text-box-bg*`. Empty/`transparent` bg writes cleared face vars (defined empty beats CSS fallback); editor still looked painted via the plate, perform/canvas only has the face.

## Fix

- Text Box face band: `fillsPlate` → track `minmax(0, 1fr)`; face gu subtracts plate inset.
- Title+buttons hidden: face inherits plate `border-radius` / `corner-shape`.
- Face + plate share `--node-text-box-bg-color` / alpha; widget defaults empty color to `#020407` instead of writing blank vars.
- Layout-canvas / screen-solo face keeps the same background paint.
