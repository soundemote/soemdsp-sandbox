// Scope paint gate — single source of truth for live / pause / freeze / schedule.
//
// Graphify cannot see worklet postMessage → main draw as a call path. The freeze
// bugs (paint only on Settings / Unpause) came from the same predicates being
// re-implemented in canvas, phosphor, orchestrator, lifecycle, and buffer-io.
// All of those decisions go through this file.
//
// Load after node-graph-state / mvp exists; used by scope-canvas, phosphor,
// draw-orchestrator, lifecycle, buffer-io. Extract-only policy helpers.

/**
 * Engine transport is playing (speed > 0) and a live audio node exists.
 * Does not require AudioContext.state === "running" — suspended can lag resume.
 */
function scopePaintIsEnginePlaying() {
  const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
  if (!live?.node) {
    return false;
  }
  const speed = Number(live.speedMultiplier);
  // Default speed is 1 when unset; only explicit 0 means paused.
  if (Number.isFinite(speed)) {
    return speed > 0;
  }
  return true;
}

/** Display Settings / patch overlay: scopes frozen without stopping audio. */
function scopePaintIsVisualPaused() {
  const visualPause = Number(
    typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.visualControls?.scopePaused : 0,
  ) || 0;
  return visualPause > 0.5;
}

/**
 * Full live paint loop should run (RAF + sample force paints).
 * Live graph never freezes for the magnifier. The lens is a snapshot clone;
 * scopes on the patch keep drawing.
 */
function nodeGraphDisplaysFrozen() {
  return false;
}

function scopePaintIsLive() {
  if (scopePaintIsVisualPaused()) {
    return false;
  }
  return scopePaintIsEnginePlaying();
}

/**
 * Phosphor residual hold: no new deposits / no Instant Trace rewrite.
 * Intentional pause only — never "AudioContext suspended" or missing circuit flag.
 *
 * Full Stop (no live worklet node) is NOT freeze. Stop must cold-boot LCD/LED
 * idle plates. Treating stopped as frozen made play→pause→stop leave faces
 * stuck in the paused residual frame forever (cold boot early-out).
 */
function scopePaintIsFrozen() {
  // Display Settings freeze always holds residual (audio may still run).
  if (scopePaintIsVisualPaused()) {
    return true;
  }
  const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
  // Engine fully down → cold-boot / idle territory, not residual hold.
  if (!live?.node) {
    return false;
  }
  // Worklet still up but transport speed 0 → pause: hold residual.
  return !scopePaintIsEnginePlaying();
}

/**
 * Legacy name used across the codebase. Prefer scopePaintIsLive / scopePaintIsFrozen
 * for new code. "Paused" here means "do not run full live draw unless force".
 */
function scopePaintIsPaused() {
  return !scopePaintIsLive();
}

/**
 * Should this draw entry run the full collect + face paint path?
 * force=true (Clear, Settings, sample snapshot) always allowed for cold plate /
 * rebound even while paused.
 */
function scopePaintShouldFullDraw(force = false) {
  if (force === true) {
    return true;
  }
  return scopePaintIsLive();
}

/**
 * After a successful full draw, should we request another RAF?
 */
function scopePaintShouldKeepLoop() {
  if (!scopePaintIsLive()) {
    return false;
  }
  if (typeof nodeGraphModuleScopeHasDrawableSlots === "function") {
    return nodeGraphModuleScopeHasDrawableSlots();
  }
  return true;
}

/**
 * Instant Trace signature skip: never while live (strip chart must repaint).
 * When idle, callers may still use signature caching for static frames.
 */
function scopePaintShouldSkipUnchangedTrace() {
  return !scopePaintIsLive();
}

/**
 * Arm continuous draw after worklet samples land.
 *
 * Soft schedule only — `{ force: true }` skips the display FPS clock
 * (`nodeGraphModuleScopePhosphorFrameReady`), so every sample batch was painting
 * at audio/rAF rate and ignoring Simulation FPS (phosphor, LCD, LED, 0D, …).
 * Clear / Settings / wipe still pass force when an immediate paint is required.
 * The live RAF loop is kept alive by scopePaintKeepLoopAlive after each frame.
 */
function scopePaintOnSampleSnapshot() {
  if (typeof scheduleNodeGraphModuleScopeDraw !== "function") {
    return;
  }
  scheduleNodeGraphModuleScopeDraw();
}

/**
 * Keep RAF alive during transient failures (no buffer yet, canvas sync, etc.).
 */
function scopePaintKeepLoopAlive() {
  if (!scopePaintShouldKeepLoop()) {
    return;
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

// --- Compatibility shims (existing names) ---------------------------------

function nodeGraphModuleScopeLivePaintActive() {
  return scopePaintIsLive();
}

function nodeGraphModuleScopeEnginePaused() {
  return !scopePaintIsEnginePlaying();
}

function nodeGraphModuleScopePhosphorFrozen() {
  return scopePaintIsFrozen();
}
