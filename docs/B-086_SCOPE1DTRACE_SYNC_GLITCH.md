# B-086 — 1D Trace sync glitches more than phosphor

Report ID: B-086  
Status: open  
Severity: see  
Source: user 2026-09-29  
Related: B-081 (scope1dTrace size/thickness), B-084 (1D gradient LUT)

## User symptom

1D Trace (woscope-style scope) glitches in sync mode a lot more than phosphor scope in sync mode. Something is wrong with the 1D sync path. Not investigated.

## Repro

Not pinned. Compare 1D Trace with sync on against a phosphor scope with sync on, on the same signal. 1D jumps or tears; phosphor holds.

## Expected behavior

Sync on 1D Trace should hold as steadily as phosphor sync on the same signal.

## Notes (user, not confirmed)

Could be a zero-crossing issue. Maybe zero crossings are sent per quantum, and that is what glitches the trace. Do not treat that as the cause until it is checked.

## Investigation / fix shape

Not started. Do not fix in this report. Compare the 1D Trace sync trigger (woscope) with the phosphor sync trigger, especially how zero crossings are detected and whether they are emitted once per audio quantum instead of once per crossing.

This report is docs-only; no code fix is included.
