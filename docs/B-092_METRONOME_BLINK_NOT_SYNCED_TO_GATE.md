# B-092 — Metronome: face indicator still does not blink with the gate

Report ID: B-092  
Status: open  
Severity: see  
Source: user 2026-10-05 (ArchIV)  

## User symptom

"the metronome still doesn't blink with the gate" — the Metronome module's face indicator does not blink in sync with its gate output.

## Repro

1. Add a Metronome module and run it.
2. Watch the face indicator alongside the gate output.
3. Observe: indicator does not blink in sync with the gate.

## Expected behavior

The face indicator blinks on each gate pulse, in sync with the gate output.

## Notes

User says "still", implying an earlier report or fix attempt. No earlier metronome blink entry was found in `docs/BUG_PLAN.md` or `docs/` (grep -i metronome); it may have been reported verbally or in an untracked place. Treat as a regression / unfixed issue. No cause investigated.

## Investigation / fix shape

Not started. Logged only; do not tackle. Docs-only bug report; no code change included.
