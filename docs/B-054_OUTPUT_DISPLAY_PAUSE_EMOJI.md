# B-054 — Output display keeps pause emoji after Stop/Play

**Status:** open  
**Severity:** see  
**Source:** user 2026-09-27  
**Related:** B-026 (Pause → Stop → Play display rearm; waterfall drawers)

## User symptom

Pressing **Pause** and/or **Stop** can leave a pause emoji (`⏸`) stuck on the **Output display**. Pressing **Play** does not reliably restore the normal live display state.

This is a separate UI-chrome symptom from B-026's waterfall drawers staying dark or idle. It may share the same transport/display rearm lifecycle, so the two tickets should be tested together but tracked separately.

## Repro

1. Show an Output display and start playback.
2. Test **Pause → Play**.
3. Test **Stop → Play**.
4. Test **Pause → Stop → Play**.
5. Record whether the Output display still shows `⏸` after Play.

## Expected behavior

- Pause may show `⏸` while the engine is paused.
- Stop must clear stale pause chrome and reset the Output display state.
- Play must remove the pause emoji and restore the live Output display without a manual UI poke.

## Investigation / fix shape

- Locate the Output display's authoritative transport/status glyph path.
- Update that chrome on every Pause, Stop, and Play transition; do not rely only on a 0→1 transport edge.
- Coordinate the rearm with B-026's waterfall path, but verify and close this Output-display symptom independently.

## Verification

Manual only: run the three sequences above with an Output display visible, then repeat with a waterfall face and room dimmer enabled for the B-026 non-regression check. No UI or DSP implementation is part of this docs-only update.