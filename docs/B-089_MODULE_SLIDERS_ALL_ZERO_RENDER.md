# B-089 — Intermittent module slider positions all show at 0 (render race)

Report ID: B-089  
Status: open  
Severity: see  
Source: user 2026-10-05 (ArchIV)  

## User symptom

Intermittently all slider positions on a module show at 0. This is a visual/render issue; the values are not confirmed wrong underneath. Not reliable to reproduce.

## Repro

Not pinned. Intermittent; cannot recreate reliably.

## Workaround

Repositioning the module forces an update and corrects the display.

## Expected behavior

Slider faces should keep showing the real parameter positions without needing a module move to refresh.

## Notes

Suspected race condition in rendering. No cause has been investigated or confirmed. Do not treat the race guess as fact until checked.

## Investigation / fix shape

Not started. Logged only; do not tackle. This is a docs-only bug report; no code change is included.
