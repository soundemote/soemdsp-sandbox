# B-095 — Slew: S curve looks like a double S instead of one smooth S

Report ID: B-095  
Status: open  
Severity: hear  
Source: user 2026-10-06 (ArchIV)  

## User symptom

The Slew module's S curve looks like a double S curve instead of a single smooth S when slewing between values.

## Repro

1. Add a Slew module and select the S curve.
2. Step the input between two values.
3. Observe: the output transition looks like a double S.

## Expected behavior

One smooth S from start to target.

## Notes

No cause investigated.

## Investigation / fix shape

Not started. Logged only; do not tackle. Docs-only bug report; no code change included.
