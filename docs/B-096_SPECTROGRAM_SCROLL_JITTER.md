# B-096 — Spectrogram: scroll is uneven (jittery tempo) after GPU shader port

Report ID: B-096  
Status: fixed  
Severity: see  
Source: user 2026-10-06 (ArchIV), reported by Argi via LibraryCleaner  

## User symptom

After the Spectrogram GPU shader port (plan item M1 in `docs/DISPLAY_SHADER_PLAN.md`), the Spectrogram works but its scroll is uneven, like a badly tapped tempo: it alternates slightly fast and slightly slow.

## Repro

1. Add a Spectrogram module and feed it audio.
2. Watch the scroll.
3. Observe: columns advance unevenly, alternating slightly fast and slightly slow.

## Expected behavior

Steady, even scroll.

## Notes

- New file `public/modules/spectrogram/spectrogram-gl.js`; changed `spectrogram-display.js`.
- Draws on the shared picture device. A ring texture holds one column per face pixel; a head uniform marks the oldest column.
- The port deliberately kept whole-pixel scrolling and did not reuse the waterfall's sub-texel `uSub` scroll (`node-graph-module-scope-waterfall-gl.js`).
- Likely cause (unconfirmed): each frame advances a whole number of columns, so when hop/History timing is not an exact multiple of the frame rate the advance alternates (1,2,1,2 or 0,1). Multiple hops landing in one pixel are max-merged.

## Investigation / fix shape

Whole-pixel emit stayed. Leftover hop-time (`scrollDebtSec / secPerBufPx`) is now `uSub`, same leftover-time scroll as Instant Waterfall. No extra clock: hop duration still comes from published hopSize/sampleRate. Past-newest sliver is brightness-0 LUT (`uPlate`). Canvas2D blit uses the same sub-pixel offset. Cache `spectro-sub-1`.
