# B-060 - Pulse Explosion does not modulate PolyBLEP amplitude

**Status:** open  
**Severity:** hear  
**Source:** user 2026-09-27

## User symptom

Pulse Explosion does not appear to modulate PolyBLEP amplitude. The most likely explanation is that Pulse Explosion is not outputting a signal, so the amplitude modulation cable has no effect. This is a user hypothesis to verify, not a confirmed root cause.

## Repro

1. Place Pulse Explosion and PolyBLEP in a patch.
2. Connect the Pulse Explosion output to PolyBLEP amplitude.
3. Run the patch and observe whether PolyBLEP amplitude changes.
4. Independently check whether Pulse Explosion emits any non-zero signal under ordinary settings.

## Investigation / fix shape

Trace Pulse Explosion signal generation and output first, then verify the cable/port type and PolyBLEP amplitude-modulation path. If Pulse Explosion is silent, restore a valid source signal before judging the downstream modulation path. No code fix is part of this docs-only report.

## Verification

Confirm that Pulse Explosion produces a non-zero signal and that connecting it to PolyBLEP amplitude produces audible or otherwise observable amplitude modulation across representative settings.
