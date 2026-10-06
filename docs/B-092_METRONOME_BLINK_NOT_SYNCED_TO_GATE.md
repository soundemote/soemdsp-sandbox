# B-092 — Metronome: face indicator still does not blink with the gate

Report ID: B-092  
Status: fixed (local, uncommitted)  
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

## Fixed (local, uncommitted) — 2026-10-06

Approved by Argi.

- Cause: `public/modules/transport/transport-display.js` computed its own beat phase from `audioContext.currentTime × f` (via `nodeGraphTransportPeriodSeconds`). So the lamp jumped on BPM change, ignored Reset and Mode (Sync/Free), and was forced on when half a beat was shorter than a paint.
- Fix: the lamp copies the engine's published **Gate 0-1** display signal. This is the transport `displaySignals` entry, written by C++ `process_transport` to Mono and named "Gate 0-1" by `nativeGraphPortNames`. It is read with `nodeGraphModuleScopeLatestOutputValue(nodeId, "Gate 0-1")`, the same latest-scope-sample path other faces use (Ellipsoid, Basic Shape, Keypad, Harmonic Series). The lamp is lit while the copied gate is non-zero. The JS phase computation is removed, with no fallback. No C++ change: the signal was already published, and the transportBpm face makes the node a scope-capture node, so it posts at Simulation FPS.
- Caveat: the lamp shows the gate as sampled at Simulation FPS. Gates shorter than a frame can be missed or alias. The old forced-on behaviour is gone.
- Cache: `transport-display.js?v=env-vel-20261006` in index.html and perform.html.
- `nodeGraphTransportPeriodSeconds` (`transport-math.js`) is now used only inside `transport-math.js`, by `nodeGraphTransportCore`, which has no callers outside that file. Reported, not deleted.
