# B-064 - Text Box background overflows outline when title is hidden

**Status:** open  
**Severity:** see  
**Source:** user 2026-09-28  
**Related:** B-032 (Text Box resize/text clipping); B-055 (Text Box wire z-order, fixed)

## User symptom

When the Text Box title is hidden, the background extends beyond the module outline/border. The title-visible state should be compared with the title-hidden state to isolate the geometry change.

## Repro

1. Add or open a Text Box.
2. Hide the title.
3. Inspect the background at each edge of the module outline/border.
4. Restore the title and compare the bounds.

## Expected behavior

The background remains inside the Text Box module outline/border regardless of title visibility. Hiding the title may reclaim its layout track, but it must not expand the painted background beyond the outer bounds.

## Investigation / fix shape

- Trace the title-hidden layout path, including outer height, face/content bounds, and background clipping.
- Keep the background clipped to the module outer bounds in both title states.
- Recheck B-032 resize/text clipping and B-055 wire layering after any layout or host change.
- This report is docs-only; no code fix is included.
