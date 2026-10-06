# B-090 — Keypad: turning latch off does not end an active latch

Report ID: B-090  
Status: open  
Severity: hear  
Source: user 2026-10-05 (ArchIV)  

## User symptom

On the keypad, if latch is on, you press a key, then turn latch off, the latch does not end with that change — the latched key stays engaged.

## Repro

1. Turn latch on.
2. Press a key (key latches).
3. Turn latch off.
4. Observe: the latch does not end; the key remains latched.

## Expected behavior

Turning latch off should end any active latch so the previously latched key releases with that control change.

## Notes

User report only. No cause investigated or confirmed.

## Investigation / fix shape

Not started. Logged only; do not tackle. This is a docs-only bug report; no code change is included.