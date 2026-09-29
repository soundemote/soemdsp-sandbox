# B-081 — scope1dTrace Size does not drive TraceWoscope thickness

Report ID: B-081  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28 (Vibrato Generator / all 1D Trace faces)  
Related: B-072 (phosphor Size persist); Tube Sat crt-amber / Bright to intensity polish

## What

Vibrato Generator (and other **1D Trace** faces) could not set beam **thickness**. Display Settings **Size** for scope1dTrace must bind into TraceWoscope the same way **Bright** binds to uIntensity. Quiet / sub-unit Display **Scale** also shrank Y so the face signal looked undersized.

## Repro

1. Spawn Vibrato Generator (or Tube Saturation / catalog 1D Trace).
2. Open Display Settings and drag **Size**.
3. Expect: beam thickness changes (TraceWoscope uSize via authored CSS px at a 96px face).
4. Set Scale below 1 — Y must stay full-height (unit amp); Scale may still boost at or above 1.

## Root cause

- Vibrato was locked on Instant Waterfall (settingsSchema: waterfall), which dropped Trace **Size** after the premium waterfall redesign — no thickness control.
- scope1dTrace paint already passed dot1Size, but Size lacked a Bright-style SSOT helper into TraceWoscope (size / intensity aliases + normalize).
- Y used 
odeGraphDisplaySettingsAmplitudeScale as-is, so Scale below 1 shrank the heart-monitor stroke.

## Fix

- Vibrato Generator to displayType / mode / schema **scope1dTrace** (Wave source).
- 
odeGraphScope1dTraceSizePx SSOT (like Bright01) to TraceWoscope size + explicit intensity: brightness.
- Full-height Y: when Scale is below 1, force scale: 1 for SampleToY (boost at or above 1 still allowed).
- Draw signature includes dot1Size / secondarySize; Size field tip names TraceWoscope binding.
- Cache-bust 081-1dtrace-size-1.

## Files

- public/node-graph-module-definitions.js
- public/node-graph-module-scope-1d-trace.js
- public/node-graph-module-scope-metrics.js
- public/node-graph-module-scope-settings-form.js
- public/index.html
- docs/BUG_PLAN.md / progress.md

## Verify

Manual: Vibrato + Tube Sat Display Settings Size thickens beam; Bright still works; Scale 0.5 does not shrink Y; Scale 2 still zooms. Local, no push.
