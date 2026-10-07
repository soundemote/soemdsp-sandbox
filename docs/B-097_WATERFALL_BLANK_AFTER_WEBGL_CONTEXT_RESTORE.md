# B-097 — Instant Waterfall: blank after WebGL context lost and restored

Report ID: B-097  
Status: open  
Severity: see  
Source: user 2026-10-06 (ArchIV), reported by Argi via Librarian  

## User symptom

After a WebGL context is lost and restored, 1D Instant Waterfall faces stay blank. The face never rebuilds its GL session.

## Repro

1. Use Instant Waterfall (or other waterfall faces that use `canvas._wfGl`).
2. Cause a WebGL context loss and restore (GPU reset, tab throttle, or browser event).
3. Observe: the face stays blank; drawing does not resume.

## Expected behavior

On context restore, the waterfall face recreates its GL session and draws again.

## Notes

- Path: `public/node-graph-module-scope-waterfall-gl.js` and callers in `public/node-graph-module-scope-waterfall.js`.
- Each waterfall face keeps its own WebGL context (`canvas._wfGl`). When the context is lost, the stamp paths return false, but nothing recreates the session on restore.
- Predates the recent Meet shader work. The Meet stamp (`nodeGraphWaterfallGlStampMeetColumn`) behaves the same as the old bar stamps while the context is lost.
- Related to `docs/DISPLAY_SHADER_PLAN.md` P0a (too many per-face contexts). Spectrogram scroll jitter B-096 is also still open.

## Investigation / fix shape

Not started. Logged only; Argi said do not fix now. Docs-only bug report; no code change included.