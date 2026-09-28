# B-058 — Voice parameter modulation misses active and idle voice updates

**Status:** open  
**Severity:** hear  
**Source:** user 2026-09-27  

## User symptom

Voices are not responding correctly to parameter modulation. The likely issue is that the voice dirty-state system is not being used consistently across voice lifecycles.

## Intended behavior

- Available (idle) voices should be marked dirty when parameter modulation changes and refreshed with the current value when they are next played.
- Sustaining voices should receive the modulation immediately while they are sounding.
- Releasing voices should also receive the modulation immediately; they should not wait for a retrigger or a later allocation.

No currently sounding voice should remain on stale parameter state merely because it was already allocated, and a newly played voice should not inherit stale state from its idle period.

## Repro

1. Use a polyphonic patch with a parameter that can be modulated.
2. Modulate the parameter while some voices are idle, some are sustaining, and some are releasing.
3. Play an idle voice and check that it uses the current parameter state.
4. Listen to or inspect the sustaining and releasing voices while modulation changes, without retriggering them.
5. Note any voice that updates only after a retrigger or remains on the previous value.

## Investigation / fix shape

Trace parameter-modulation propagation through voice allocation and the dirty-state lifecycle. Mark idle/available voices dirty for their next play or refresh, and apply current modulation immediately to sustaining and releasing voices. Confirm that allocation, sustain, and release do not leave stale per-voice parameter state. No code fix is part of this docs-only report.

## Verification

Repeat the repro with multiple simultaneous voices and modulation changes during idle, sustain, and release. Confirm that newly played voices use the current value and that sustaining/releasing voices respond without retriggering. Check that the behavior remains consistent when voices are reused.