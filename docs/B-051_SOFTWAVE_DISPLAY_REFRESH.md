# B-051 - Softwave oscillator display needs unrelated EQ Frequency refresh

**Status:** open  
**Severity:** see  
**Source:** user 2026-09-27  
**Related:** B-026 and B-054 - possible shared display invalidation/rearm family, not duplicates unless the same root is confirmed. **B-063** (fixed) is Robin Oscillator *audible* Morph MOD ParamModEdge WIDTH vs SHAPE — not this Softwave display symptom.

## User symptom

The Softwave oscillator display/UI does not appear to live-update on its own. It only updates after the user moves **Frequency** on an EQ filter, suggesting that an unrelated parameter edit is accidentally providing the display refresh/invalidation that the Softwave face should receive directly.

This may be a larger display-refresh problem. Similar live displays - scopes, value/faces, and waterfalls - should be checked rather than treating Softwave as an isolated module issue.

## Repro

1. Show a Softwave oscillator display in a live patch.
2. Let the signal or displayed state change while making no unrelated UI edits.
3. Observe whether the Softwave display remains stale.
4. Move **Frequency** on an EQ filter and observe whether the Softwave display/UI updates immediately.
5. Repeat with other scopes, faces, and waterfalls that should update continuously; record which ones need an unrelated control change.

## Expected behavior

- A live display updates from current audio/state without requiring an unrelated parameter edit.
- EQ Frequency changes refresh the EQ as needed, but are not an accidental global display-refresh trigger.
- All display families that promise live updates - scopes, faces, and waterfalls - follow the same refresh contract.

## Investigation / fix shape

- Trace the authoritative frame/display invalidation path and the Softwave face update path.
- Determine whether a scheduler, dirty flag, transport edge, or render gate is suppressing display updates until another parameter edit occurs.
- Audit scopes, value/faces, and waterfalls for the same stale-frame behavior.
- Compare the refresh/rearm path with B-026 and B-054, while keeping this live-refresh symptom independently verifiable.
- No code fix is part of this report; this document records the bug and audit scope only.

## Verification

Use a live Softwave patch and confirm its display updates without touching EQ Frequency. Repeat with representative scopes, faces, and waterfalls, including pause/stop/play sequences covered by B-026/B-054, and confirm that any remaining stale-display issue is tracked separately.

## Current hypothesis

Softwave **Morph** is modulated via **RobinSinusoid**. The working hypothesis is that the display update path does not account for that modulation when deciding whether to refresh, so the display remains stale until an unrelated edit such as moving EQ **Frequency** forces a refresh.

Audible Robin Morph MOD silence under the Softwave-default SHAPE ParamModEdge map is tracked separately as **B-063** (fixed); do not close B-051 from that wiring fix alone.
