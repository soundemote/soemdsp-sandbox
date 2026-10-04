# B-088 — 1D Phosphor / 1D Trace regular gap at low frequency

Report ID: B-088  
Status: open  
Severity: see  
Source: user 2026-10-04 (ArchIV)  
Related: B-081 (scope1dTrace size/thickness), B-084 (1D Trace gradient LUT), B-086 (1D Trace sync glitches)

## User symptom

The 1D Phosphor and 1D Trace faces show a regular gap at low frequency. The cause is not established.

## Repro

Desktop file: `trace and phosphor 1d broken lines.json`

1. Use both 1D faces in the repro patch.
2. Keep both faces source-synced and enable Skip Discontinuities.
3. Set Sweep to 4 Hz / 4 cycles.
4. Use the filtered approximately 50.8 Hz saw signal.
5. Observe the regular gap in both faces.

## Expected behavior

Both source-synced 1D faces should draw a continuous trace without a regular low-frequency gap.

## Tried (all failed; no visible improvement)

1. **Sweep pen.** Both 1D faces on the repro patch are source-synced, skip discontinuities, sweep 4 Hz / 4 cycles, on a filtered approximately 50.8 Hz saw. The overlap sample was being stamped one phase step to the right of the point already on the face. A change in `public/node-graph-module-scope-paint-helpers.js` and `public/node-graph-module-scope-1d-trace.js` made a forward continuous step one stroke and rewound the phasor onto a repeated sample (not on wipe/retrace). Cache: `sweep-face-join-1`. Result: no visible improvement. **Not the cause.**
2. **Widen `nodeGraphOneDimensionalBurnUndrawnWindow` by one sample.** The change was in `paint-helpers.js?v=trace-join-1` so the new stroke begins on the last drawn sample; `endFrame` was unchanged. Result: no visible improvement.

## Notes

No cause has been confirmed. The next look remains open; do not treat either attempted mechanism as the cause.

## Investigation / fix shape

Not started. Compare the 1D Phosphor and 1D Trace sample/frame cursors, sweep phase progression, and gap timing on the pinned repro without changing display code as part of this report. This is a docs-only bug report; leave the current code as-is and do not commit or push.