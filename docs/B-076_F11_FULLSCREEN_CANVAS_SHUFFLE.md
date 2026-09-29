# B-076 — F11 fullscreen shuffles the canvas; F F F recycles the view

Report ID: B-076  
Status: fixed  
Severity: see  
Source: user 2026-09-28  
Related: layout-canvas F-cycle (off→perform→edit→off); B-050 (workspace camera symptom, separate)

## User symptom

Pressing **F11** to enter fullscreen shuffles the canvas badly. While still in fullscreen, pressing **F**, **F**, **F** recycles the view and resets/corrects the canvas arrangement.

## Repro

1. Pin displays to canvas and open canvas (**F** → perform).
2. Press **F11** to enter browser fullscreen.
3. Observe the canvas shuffle.
4. Press **F**, **F**, **F** while remaining fullscreen (perform→edit→off→perform).
5. Observe that the view resets/corrects.

## Expected behavior

Entering or leaving fullscreen should preserve the canvas arrangement and view state. No manual **F** recycle should be needed.

## Root cause

Layout canvas reuses the screen-solo stage with freeform absolute tiles and `session.fit ""`. On window resize (what F11 triggers), `handleNodeGraphScreenSoloResize` still called `applyNodeGraphScreenSoloFit(session.fit || "contain")`, which applied the classic solo **grid / contain** layout and shuffled the freeform tiles. The F-cycle path that corrects it is `nodeGraphLayoutCanvasRefreshOpenStage` (full reopen).

## Fix

- `public/node-graph-screen-solo.js`: skip solo fit/resize when `session.layoutCanvas` / layout canvas is active.
- `public/node-graph-layout-canvas.js`: `nodeGraphLayoutCanvasHandleViewportChange` — light deferred tile re-apply on resize; `fullscreenchange` deferred rebuild via `RefreshOpenStage` (same as F recycle).

UI/layout only. No audio-path changes.

## Verify

1. Open a patch with canvas pins; **F** into canvas perform.
2. Arrange tiles if needed (**F** arrange, then **F** back to perform).
3. Press **F11** enter fullscreen — tiles keep their freeform layout (no grid shuffle).
4. Press **F11** exit fullscreen — same.
5. Optional: classic screen solo (no canvas) still F-cycles fit→stretch→off on resize correctly.
