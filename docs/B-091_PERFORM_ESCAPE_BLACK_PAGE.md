# B-091 — Perform page: Escape leads to a black page (app hotkeys not disabled)

Report ID: B-091  
Status: open  
Severity: see  
Source: user 2026-10-05 (ArchIV)  

## User symptom

In performance mode, pressing Escape leads to a black page. This is specifically the Perform page (`public/perform.html`, the page that will become the audio plugin) — NOT the canvas inside the circuit builder and NOT circuit build → canvas.

## Repro

1. Open the Perform page (`public/perform.html`).
2. Press Escape.
3. Observe: the page goes black.

## Expected behavior

- All app hotkeys should be disabled on the Perform page.
- Escape must not close the patch or leave a black page.
- The Perform page does not allow the circuit builder to appear.

## Notes

User report only. No cause investigated or confirmed.

## Investigation / fix shape

Not started. Logged only; do not tackle. This is a docs-only bug report; no code change is included.
