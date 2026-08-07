// Face geometry / 1D burn / late scope2d path helpers peeled from module-scopes.js (Phase D).
// Load after node-graph-module-scopes.js, before draw-orchestrator. Extract-only.

function nodeGraphOneDimensionalBurnSampleToY(sample, height, settings = null) {
  const h = Math.max(1, Number(height) || 1);
  const amp = nodeGraphDisplaySettingsAmplitudeScale(settings);
  return h * 0.5 - clampNodeSliderValue((Number(sample) || 0) * amp, -1, 1) * h * 0.44;
}

function nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings) {
  if (!context || !canvas?.width || !canvas?.height) {
    return;
  }
  const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1);
  if (decay <= 0) {
    return;
  }
  // Decay only — no burn term (burn is not a second brightness/gain).
  const fadeAlpha = clampNodeSliderValue(0.012 + decay * 0.3, 0.002, 0.34);
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha.toFixed(4)})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function nodeGraphScopeRgbFloatsToCanvasRgb(color) {
  const rgb = Array.isArray(color) ? color : [1, 1, 1];
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(clampNodeSliderValue(Number(value) || 0, 0, 1) * 255))));
}

/** Rising-edge threshold for 1D Burn Dot Reset (same family as osc Reset jacks). */
const nodeGraphLineBurnResetThreshold = 0.5;

/**
 * Heart-monitor 1D burn: free-running left→right pen with its own phasor.
 *
 * Position is NOT derived from absoluteFrame / duration (that jumps when you
 * change Sweep). Each face keeps canvas._lineBurnPhasor in [0, 1) and advances
 * it sample-by-sample:
 *   phasor += 1 / (sweepSeconds * sampleRate)
 * so changing duration mid-sweep continues from the current X.
 * Wrap or rising-edge Reset (≥ 0.5) snaps to 0 and breaks the path.
 */
function nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count) {
  const endFrame = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const startFrame = Number(buffer?.nodeGraphScopeStartFrame);
  if (
    Number.isFinite(startFrame) &&
    Number.isFinite(endFrame) &&
    endFrame > startFrame
  ) {
    return { startFrame, endFrame };
  }
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const totalSamples = Number(buffer?.nodeGraphScopeTotalSampleCount);
  if (Number.isFinite(totalSamples) && totalSamples > 0) {
    return {
      startFrame: Math.max(0, totalSamples - safeCount),
      endFrame: totalSamples,
    };
  }
  const fallbackEndFrame = Number(buffer?.nodeGraphScopeVersion);
  const end = Number.isFinite(fallbackEndFrame) ? fallbackEndFrame : 0;
  return {
    startFrame: Math.max(0, end - safeCount),
    endFrame: end,
  };
}

function nodeGraphOneDimensionalBurnDrawStartIndex(canvas, buffer, count) {
  const frameInfo = nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count);
  const lastFrame = Number(
    canvas?._nodeGraphOneDimensionalBurnLastDrawnFrame
    ?? canvas?._nodeGraphScope2dLastDrawnFrame,
  );
  if (
    !Number.isFinite(frameInfo.startFrame) ||
    !Number.isFinite(frameInfo.endFrame) ||
    !Number.isFinite(lastFrame) ||
    frameInfo.endFrame <= frameInfo.startFrame
  ) {
    return 0;
  }
  if (lastFrame >= frameInfo.endFrame) {
    return count;
  }
  if (lastFrame <= frameInfo.startFrame) {
    return 0;
  }
  // Bridge one sample into previous frame so the trail stays continuous.
  const frameOffset = Math.max(0, Math.floor(lastFrame - frameInfo.startFrame) - 1);
  return Math.min(Math.max(0, Math.floor(Number(count) || 0) - 1), frameOffset);
}

/**
 * Sample Reset at the same time as In[index] in the current draw window.
 *
 * Visual-input ports each keep their own absoluteFrame counters, so if Reset
 * was wired later the two windows do not share frame numbers. Always align
 * by distance-from-end of the recent tails (both streams are written together
 * each engine sample while both are connected).
 *
 * inIndex: 0 .. inCount-1 within In's recent window (0 = oldest of the window).
 */
function nodeGraphOneDimensionalBurnResetSample(resetBuffer, inIndex, inCount) {
  if (!resetBuffer?.length || !(inCount > 0)) {
    return 0;
  }
  const safeInCount = Math.max(1, Math.floor(Number(inCount) || 1));
  const safeIndex = Math.max(0, Math.min(safeInCount - 1, Math.floor(Number(inIndex) || 0)));
  // Prefer Reset's recent window; fall back to full buffer.
  const rRecent = Math.floor(Number(resetBuffer.nodeGraphScopeRecentSampleCount) || 0);
  const rCount = Math.max(1, Math.min(
    resetBuffer.length,
    rRecent > 0 ? rRecent : resetBuffer.length,
  ));
  // Align ends: last sample of In window ↔ last sample of Reset window.
  const fromEnd = (safeInCount - 1) - safeIndex;
  const rIndex = (resetBuffer.length - 1) - fromEnd;
  // If Reset has a shorter recent tail, clamp into that tail.
  const rStart = resetBuffer.length - rCount;
  if (rIndex < rStart || rIndex >= resetBuffer.length) {
    // Still try absolute-frame overlap when both streams share a clock range
    // (same absoluteFrame counters when both ports ran from the start).
    return 0;
  }
  return Number(resetBuffer[rIndex]) || 0;
}

function nodeGraphOneDimensionalBurnBreakPath(points) {
  if (typeof breakNodeGraphScope2dPath === "function") {
    breakNodeGraphScope2dPath(points);
  } else {
    points.push(null);
  }
}

function nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, settings, resetBuffer = null) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
    return [];
  }
  const count = Math.max(1, Math.min(
    buffer.length,
    Math.floor(Number(buffer.nodeGraphScopeRecentSampleCount) || 1),
  ));
  const start = Math.max(0, buffer.length - count);
  const drawStartIndex = nodeGraphOneDimensionalBurnDrawStartIndex(canvas, buffer, count);
  if (drawStartIndex >= count) {
    return [];
  }
  const sampleRate = Math.max(1, Number(nodeGraphScopeSampleRate(buffer)) || 44100);
  // Seconds to cross the face → phase advance per sample.
  let sweepSeconds = Number(settings?.sweepSeconds);
  if (!Number.isFinite(sweepSeconds) || sweepSeconds <= 0) {
    // Legacy patches that still only have sweepHz.
    const legacyHz = Number(settings?.sweepHz);
    sweepSeconds = Number.isFinite(legacyHz) && legacyHz > 0
      ? 1 / legacyHz
      : nodeGraphLineBurnSettingsDefaults.sweepSeconds;
  }
  sweepSeconds = Math.max(0.01, Math.min(10, sweepSeconds));
  const phaseInc = 1 / (sweepSeconds * sampleRate);
  const width = canvas.width;
  const height = canvas.height;

  // Persistent free-run phasor on this face — survives Sweep (s) changes.
  let phasor = Number(canvas._lineBurnPhasor);
  if (!Number.isFinite(phasor) || phasor < 0 || phasor >= 1) {
    phasor = 0;
  }
  let resetWasHigh = canvas._lineBurnResetWasHigh === true;

  const stepPhasorAndReset = (resetSample) => {
    const resetHigh = Number(resetSample) >= nodeGraphLineBurnResetThreshold;
    const snapped = resetHigh && !resetWasHigh;
    if (snapped) {
      phasor = 0;
    }
    resetWasHigh = resetHigh;
    phasor += phaseInc;
    if (phasor >= 1) {
      phasor -= Math.floor(phasor);
      if (phasor < 0 || phasor >= 1) {
        phasor = 0;
      }
    }
    return snapped;
  };

  // Samples already consumed still update phasor + Reset so edges are not missed.
  for (let index = 0; index < drawStartIndex; index += 1) {
    stepPhasorAndReset(nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, count));
  }

  const points = [];
  let hadPoint = false;
  for (let index = drawStartIndex; index < count; index += 1) {
    const resetSample = nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, count);
    const resetHigh = Number(resetSample) >= nodeGraphLineBurnResetThreshold;
    if (resetHigh && !resetWasHigh) {
      // Rising edge Reset: snap to left edge for this sample.
      if (hadPoint) {
        nodeGraphOneDimensionalBurnBreakPath(points);
      }
      phasor = 0;
      hadPoint = false;
    }
    resetWasHigh = resetHigh;

    // Draw at current phasor, then advance — so changing Sweep keeps X.
    points.push({
      x: phasor * width,
      y: nodeGraphOneDimensionalBurnSampleToY(buffer[start + index], height, settings),
    });
    hadPoint = true;

    phasor += phaseInc;
    if (phasor >= 1) {
      // Completed a pass — break path; residual starts the next pass at left.
      nodeGraphOneDimensionalBurnBreakPath(points);
      phasor -= Math.floor(phasor);
      if (phasor < 0 || phasor >= 1) {
        phasor = 0;
      }
      hadPoint = false;
    }
  }

  canvas._lineBurnPhasor = phasor;
  canvas._lineBurnResetWasHigh = resetWasHigh;
  delete canvas._lineBurnSweepOriginFrame;
  return points;
}

function nodeGraphOneDimensionalBurnPointBudget(canvas) {
  const width = Math.max(1, Number(canvas?.width) || 1);
  // Soft ceiling for callers that still thin paths before deposit.
  // lineBurn itself no longer pre-thins — energy-GL spreads by maxDots.
  return Math.max(256, Math.min(8192, Math.ceil(width * 8)));
}

/**
 * Thin a 1D burn subpath to `budget` points with even spacing.
 * (Old min/max-per-bucket sampling preserved peaks but turned sines into
 * jagged envelope zigzags — wrong for continuous phosphor beams.)
 */
function reduceNodeGraphOneDimensionalBurnSubpath(points, start, end, budget, output) {
  const length = end - start;
  if (length <= 0) {
    return;
  }
  if (length <= budget) {
    for (let index = start; index < end; index += 1) {
      output.push(points[index]);
    }
    return;
  }
  const cap = Math.max(2, Math.floor(Number(budget) || 2));
  const last = end - 1;
  let prev = -1;
  for (let i = 0; i < cap; i += 1) {
    const index = Math.min(last, start + Math.round((i * (length - 1)) / (cap - 1)));
    if (index === prev) {
      continue;
    }
    output.push(points[index]);
    prev = index;
  }
}

function reduceNodeGraphOneDimensionalBurnPoints(points, budget) {
  if (!Array.isArray(points) || points.length <= budget) {
    return points;
  }
  const reduced = [];
  let subpathStart = 0;
  const flushSubpath = (end) => {
    reduceNodeGraphOneDimensionalBurnSubpath(points, subpathStart, end, budget, reduced);
  };
  for (let index = 0; index < points.length; index += 1) {
    if (points[index]) {
      continue;
    }
    flushSubpath(index);
    reduced.push(null);
    subpathStart = index + 1;
  }
  flushSubpath(points.length);
  return reduced;
}

// drawNodeGraphScopeCanvasSmoothPath → node-graph-module-scope-draw-basic.js
function nodeGraphScope2dStrokeSpace(canvas) {
  return Math.min(canvas?.width || 0, canvas?.height || 0);
}

// Energy mono + LUT present (shared phosphor device). Soft GPU segment beams
// unchanged — only storage/composite moved off RGB burn.
const nodeGraphScope2dBurnRendererVersion = "energy-mono-lut-soft-beam-1";

// Explicit, deterministic teardown of a burn-renderer's GL resources
// (buffers, programs, framebuffers, textures) instead of waiting on GC.
// The canvas itself is left to the WeakMap + GC to reclaim -- forcing
// WEBGL_lose_context here was tried and reliably stalled for multiple
// seconds per call in some environments, which is worse than the leak it
// was meant to speed up; freeing the individual resources plus not holding
// the canvas alive in a strong Map is enough to keep the live-context count
// bounded.
// disposeNodeGraphScope2dBurnRendererForCanvas → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnCanvasForSlot → node-graph-module-scope-draw-burn.js
/**
 * Resolve face pixel density 0–4 to an effective scale.
 * Full range: 0 → single pixel (1×1), 1 → layout×dpr, 4 → supersample AA.
 * (No lo-fi floor — user wants the whole dial.)
 */
function nodeGraphScope2dResolvePixelDensity(pixelDensity, layoutWidth = 1, layoutHeight = 1) {
  const raw = Number(pixelDensity);
  const density = Number.isFinite(raw) ? Math.max(0, Math.min(4, raw)) : 1;
  // effective === density; canvas size uses max(1, round(layout * density)).
  return { density, effective: density, minDensity: 0 };
}

/** Default face plate — pure black (no teal/CRT tint in the plate color). */
const nodeGraphFacePlateDefaultBackground = "#000000";

/** Resolve face plate color from any display settings object. */
function nodeGraphFacePlateBackground(settings, fallback = nodeGraphFacePlateDefaultBackground) {
  return normalizeNodeGraphTraceDisplayColor(
    settings?.background ?? settings?.backgroundColor,
    fallback,
  );
}

/**
 * Pixel density 0–4 from settings. Preserves 0 (never `|| 1`).
 * 0 → 1×1 buffer; 1 → layout×dpr; 4 → supersample.
 */
function nodeGraphFacePlateDensity(settings, fallback = 1) {
  const n = Number(settings?.pixelDensity);
  if (!Number.isFinite(n)) {
    const fb = Number(fallback);
    return Number.isFinite(fb) ? Math.max(0, Math.min(4, fb)) : 1;
  }
  return Math.max(0, Math.min(4, n));
}

function nodeGraphFacePlateApplyCss(screenElement, bg) {
  if (screenElement?.style) {
    screenElement.style.setProperty(
      "--node-scope-background",
      bg || nodeGraphFacePlateDefaultBackground,
    );
    // Plate under the face canvas is solid CSS; keep it true to settings.
    if (screenElement.classList?.contains("node-module-scope-window")
      || screenElement.classList?.contains("node-module-scope-window-surface")) {
      screenElement.style.background = bg || nodeGraphFacePlateDefaultBackground;
    }
  }
}

function nodeGraphFacePlateFillCanvas(context, canvas, bg) {
  if (!context || !canvas) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.fillStyle = bg || nodeGraphFacePlateDefaultBackground;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

/** Paint plate under existing pixels (e.g. after putImageData / transparent energy). */
function nodeGraphFacePlateFillUnder(context, canvas, bg) {
  if (!context || !canvas) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = bg || nodeGraphFacePlateDefaultBackground;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

// syncNodeGraphScope2dBurnCanvas → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnTextureFormats → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnTexture → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnFramebuffer → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnSurface → node-graph-module-scope-draw-burn.js
// deleteNodeGraphScope2dBurnSurface → node-graph-module-scope-draw-burn.js
// createNodeGraphScope2dBurnRenderer → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnRendererForCanvas → node-graph-module-scope-draw-burn.js
// resizeNodeGraphScope2dBurnRenderer → node-graph-module-scope-draw-burn.js
function bindNodeGraphScope2dQuad(renderer, program, positionLocation) {
  const gl = renderer.gl;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 8, 0);
}

// copyNodeGraphScope2dBurnSurface → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnDecayValues → node-graph-module-scope-draw-burn.js
// decayNodeGraphScope2dBurn → node-graph-module-scope-draw-burn.js
// nodeGraphScope2dBurnLayers → node-graph-module-scope-draw-burn.js
// appendNodeGraphScope2dBurnSegment → node-graph-module-scope-draw-burn.js
// buildNodeGraphScope2dBurnVertices → node-graph-module-scope-draw-burn.js
// drawNodeGraphScope2dBurnBeamLayer → node-graph-module-scope-draw-burn.js
// compositeNodeGraphScope2dBurn → node-graph-module-scope-draw-burn.js
/**
 * Beautiful soft-beam retained burn on mono energy + gradient LUT.
 * Same continuous gaussian segment ribbons as classic scope2d; storage is
 * scalar energy (shared phosphor device), color only at present via LUT.
 * Returns true if handled (caller should not run legacy RGB WebGL burn).
 */
// drawNodeGraphScope2dEnergyBurnPath → node-graph-module-scope-draw-burn.js
// drawNodeGraphScope2dRetainedBurn → node-graph-module-scope-draw-burn.js
// drawNodeGraphRetainedBurnPath → node-graph-module-scope-draw-burn.js
// drawNodeGraphLineBurnOscilloscopeItem → node-graph-module-scope-draw-burn.js
// Draws one vertical line per Hypersaw voice, at x = that voice's current
// phase (0..1) across the face. Canonical mono energy phosphor drawer
// (same soft/hard stamps as 2D Burn / Lorenz).
// drawNodeGraphHypersawBurnItem → node-graph-module-scope-draw-burn.js
// Oscilloscope Bank -- a standalone, reusable "phase x amplitude" scope for
// any voice-bank-shaped source (Hypersaw today, anything else that
// publishes the same {phases, amplitudes, pans} snapshot shape later).
// Unlike hypersawBurn (a fixed 1D dispersion-position display hardcoded to
// Hypersaw), this node discovers ITS source at render time by looking at
// what's actually wired into its own Phases/Amplitudes/Pans input ports --
// "1 wire per major data array" is the whole patching model: the wire's
// existence tells this renderer which node's published snapshot to read,
// the real array payload rides the same lightweight scope-state relay
// Hypersaw's own display already uses (worklet -> main thread), not the
// per-sample audio-rate signal graph.
//
// x = phase (0..1 across the canvas), y = amplitude (bipolar stem around
// vertical center), color = pan (red at -1/left, green at 0/center, blue
// at +1/right), additive blending so overlapping voices actually brighten
// rather than overpaint, and phosphor persistence via painting a
// translucent black rect instead of clearing -- so the ghost of where
// each line has been stays visible while it fades, same technique as
// hypersawBurn and lineBurn.
// oscilloscopeBankBurn's renderer moved to
// public/modules/oscilloscopeBank/oscilloscope-bank-display.js (self-registers
// onto nodeGraphModuleScopeCustomRenderers on load).

function nodeGraphScope2dFiniteSample(value) {
  const sample = Number(value);
  return Number.isFinite(sample) ? sample : null;
}

function nodeGraphScope2dPointFromSamples(square, x, y, settings = {}) {
  const sampleX = nodeGraphScope2dFiniteSample(x);
  const sampleY = nodeGraphScope2dFiniteSample(y);
  if (sampleX === null || sampleY === null) {
    return null;
  }
  const scale = Math.max(0, Number(settings?.scale) || 1);
  return {
    x: square.left + square.width * 0.5 + sampleX * scale * square.width * 0.5,
    y: square.top + square.height * 0.5 - sampleY * scale * square.height * 0.5,
  };
}

function nodeGraphScope2dTracePointFromSamples(square, x, y, settings) {
  const sampleX = nodeGraphScope2dFiniteSample(x);
  const sampleY = nodeGraphScope2dFiniteSample(y);
  if (sampleX === null || sampleY === null) {
    return null;
  }
  const scale = Math.max(0, Number(settings?.scale) || 1);
  return {
    x: square.left + square.width * 0.5 + sampleX * scale * square.width * 0.5,
    y: square.top + square.height * 0.5 - sampleY * scale * square.height * 0.5,
  };
}

function nodeGraphScope2dSampleIsFinite(x, y) {
  return nodeGraphScope2dFiniteSample(x) !== null && nodeGraphScope2dFiniteSample(y) !== null;
}

/**
 * Map a face-local canvas into a centered square in **buffer pixels**.
 * Do NOT use workspace/screen rects here — those scale with zoom while the
 * local-fallback canvas buffer is layout×dpr (fixed under zoom). Mixing the
 * two made 2D Trace walk outside the face and clip into the walls.
 */
function nodeGraphScope2dTraceCanvasSquare(canvas) {
  return nodeGraphScope2dBurnCanvasSquare(canvas);
}

// nodeGraphScope2dBurnCanvasSquare → node-graph-module-scope-draw-burn.js
// Continuity gate for downsampled X/Y polylines. Too tight (old 8% of face)
// broke closed orbits into dashed scraps when history held multiple cycles
// and the point budget skipped large angular steps.
function nodeGraphScope2dTraceMaxSegmentPixels(square) {
  const size = Math.max(1, Math.min(Number(square?.width) || 0, Number(square?.height) || 0));
  return Math.max(24, size * 0.55);
}

/**
 * Size 0–1 → radius px (c1091b4 best phosphor linear map).
 * diameter = size * faceMinSide, radius = half. Blur handles softness.
 */
function nodeGraphScopeSize01ToRadiusPx(faceMinSide, size01) {
  if (typeof PhosphorDrawer !== "undefined" && typeof PhosphorDrawer.size01ToRadiusPx === "function") {
    return PhosphorDrawer.size01ToRadiusPx(faceMinSide, size01);
  }
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.radiusPx === "function") {
    return TraceStroke.radiusPx(faceMinSide, size01);
  }
  const side = Math.max(1, Number(faceMinSide) || 1);
  const t = clampNodeSliderValue(Number(size01) || 0.08, 0, 1);
  return Math.max(0.35, side * t * 0.5);
}

/** Size 0–1 → diameter/line-width px (linear: size * face min side). */
function nodeGraphScopeSize01ToDiameterPx(faceMinSide, size01) {
  if (typeof PhosphorDrawer !== "undefined" && typeof PhosphorDrawer.size01ToDiameterPx === "function") {
    return PhosphorDrawer.size01ToDiameterPx(faceMinSide, size01);
  }
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.diameterPx === "function") {
    return TraceStroke.diameterPx(faceMinSide, size01);
  }
  const side = Math.max(1, Number(faceMinSide) || 1);
  const t = clampNodeSliderValue(Number(size01) || 0.08, 0, 1);
  return Math.max(0.7, side * t);
}

function nodeGraphScope2dLayerRadiusPx(settings, dotSpace) {
  if (settings?.dot1Enabled === false) {
    return 0;
  }
  const sizeValue = Number(settings?.dot1Size);
  const size = Number.isFinite(sizeValue) ? clampNodeSliderValue(sizeValue, 0, 1) : 0;
  return nodeGraphScopeSize01ToRadiusPx(dotSpace, size);
}

function nodeGraphScope2dContinuitySpacingPx(settings, dotSpace) {
  const rawRadius = nodeGraphScope2dLayerRadiusPx(settings, dotSpace);
  const radius = rawRadius > 0 ? rawRadius : 1;
  return Math.max(0.5, radius * 0.18);
}

function nodeGraphScope2dTraceSegmentIsContinuous(previousPoint, point, maxSegmentPixels) {
  if (!previousPoint || !point) {
    return true;
  }
  const dx = point.x - previousPoint.x;
  const dy = point.y - previousPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= Math.max(1, Number(maxSegmentPixels) || 1);
}

function buildNodeGraphScope2dTraceCanvasPoints(canvasSquare, buffer, settings) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!canvasSquare || count <= 0) {
    return [];
  }
  // Control-point budget only — canvas stroke fills segments (no densify loop).
  const budget = typeof TraceStroke !== "undefined" && TraceStroke.pointBudget
    ? TraceStroke.pointBudget(canvasSquare.width, canvasSquare.height)
    : Math.max(256, Math.min(4096, Math.floor(Math.sqrt(canvasSquare.width * canvasSquare.height) * 8)));
  const indices = typeof nodeGraphScope2dEvenSampleIndices === "function"
    ? nodeGraphScope2dEvenSampleIndices(count, budget)
    : null;
  const points = [];
  // Do NOT break the polyline by pixel distance. At many frequencies the
  // history window holds multiple orbits; even-index downsampling then
  // produces large chords. Gating those as “discontinuities” left only
  // single-point segments — and a 1-pt stroke is invisible → blank face.
  // Only break on non-finite / missing samples.
  const visit = (index) => {
    const point = nodeGraphScope2dTracePointFromSamples(
      canvasSquare,
      buffer.x[index],
      buffer.y[index],
      settings,
    );
    if (!point) {
      breakNodeGraphScope2dPath(points);
      return;
    }
    points.push(point);
  };
  if (indices && indices.length) {
    for (let i = 0; i < indices.length; i += 1) {
      visit(indices[i]);
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      visit(index);
    }
  }
  return points;
}

// drawNodeGraphScope2dTraceLayer → node-graph-module-scope-draw-burn.js
// drawNodeGraphScope2dTraceItem → node-graph-module-scope-draw-burn.js
function buildNodeGraphTraceDisplaySamples(buffer, slot, pointCount, progressFn, samplesPerPoint, viewOverride = null) {
  const view = viewOverride || nodeGraphTraceDisplayBufferView(buffer, slot);
  if (!view || view.end <= view.start) {
    return null;
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  const spPt = Number.isFinite(Number(samplesPerPoint))
    ? samplesPerPoint
    : visibleSamples / Math.max(1, pointCount - 1);
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer);
  const samples = [];
  let previousRaw = null;
  let skipThroughIndex = -1;
  for (let index = 0; index < pointCount; index += 1) {
    const progress = progressFn(index, pointCount);
    const samplePosition = view.start + progress * Math.max(0, visibleSamples - 1);
    const sampleInfo = nodeGraphTraceDisplaySampleInfo(buffer, samplePosition, spPt);
    const raw = Number.isFinite(Number(sampleInfo.value)) ? Number(sampleInfo.value) : 0;
    const value = clampNodeSliderValue((raw * view.gain) + view.offset, -1, 1);
    if (skipSamples > 0 && previousRaw !== null) {
      if (sampleInfo.discontinuity) {
        skipThroughIndex = Math.max(skipThroughIndex, index + skipSamples);
      }
      if (Math.abs(raw - previousRaw) > nodeGraphModuleScopeDiscontinuityThreshold) {
        skipThroughIndex = Math.max(skipThroughIndex, index + skipSamples - 1);
      }
    }
    samples.push({ progress, samplePosition, raw, value, breakBefore: index <= skipThroughIndex });
    previousRaw = raw;
  }
  return samples;
}

function buildNodeGraphTraceDisplayCanvasPoints(buffer, canvas, slot, viewOverride = null) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
    return [];
  }
  const width = Math.max(1, canvas.width);
  // VECTOR: continuous sample window → continuous face coords (no pixel lock / column snap).
  const view = viewOverride || nodeGraphTraceDisplayBufferView(buffer, slot);
  const halfHeight = canvas.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, { height: canvas.height });
  if (!view || view.end <= view.start) {
    const sample = nodeGraphModuleScopeInterpolatedSample(buffer, Math.max(0, buffer.length - 1));
    const value = clampNodeSliderValue((sample * (Number(view?.gain) || 1)) + (Number(view?.offset) || 0), -1, 1);
    return [{
      x: 0,
      y: (canvas.height * 0.5) - value * halfHeight,
    }, {
      x: canvas.width,
      y: (canvas.height * 0.5) - value * halfHeight,
    }];
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  // Control-point budget is sample/CPU limited — NOT min(canvas.width) (that is a pixel paradigm).
  const budget = typeof TraceStroke !== "undefined" && TraceStroke.pointBudget
    ? TraceStroke.pointBudget(canvas.width, canvas.height, nodeGraphTraceDisplayRenderPointBudget())
    : Math.max(256, Math.min(4096, nodeGraphTraceDisplayRenderPointBudget()));
  const pointCount = Math.max(2, Math.min(visibleSamples, budget));
  const midY = canvas.height * 0.5;
  const samplesPerPoint = visibleSamples / Math.max(1, pointCount - 1);
  const progressFn = (index, count) => count <= 1 ? 0 : index / (count - 1);
  const samples = buildNodeGraphTraceDisplaySamples(
    buffer,
    slot,
    pointCount,
    progressFn,
    samplesPerPoint,
    view,
  );
  if (!samples) {
    return [];
  }
  const points = [];
  for (const s of samples) {
    if (s.breakBefore) {
      if (points.length > 0 && points[points.length - 1] !== null) {
        points.push(null);
      }
    } else {
      // Continuous face coordinates — GPU/canvas antialiases the stroke.
      points.push({
        x: s.progress * width,
        y: midY - s.value * halfHeight,
      });
    }
  }
  return points;
}

function drawNodeGraphTraceDisplayCanvasLayer(context, points, layer, canvas, options = {}) {
  if (!context || !Array.isArray(points) || points.length < 1 || !canvas) {
    return;
  }
  if (layer.enabled === false) {
    return;
  }
  const face = Math.min(canvas.width, canvas.height);
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    // VECTOR polyline: opaque source-over (not additive pixel glow).
    TraceStroke.draw(context, points, {
      size: layer.size,
      blur: 0,
      brightness: layer.brightness,
      color: layer.color,
      faceMinSide: face,
      composite: "source-over",
    });
    return;
  }
  const size = clampNodeSliderValue(layer.size, 0, 1);
  const brightness = Math.max(0, Number(layer.brightness) || 0);
  if (size <= 0 || brightness <= 0) {
    return;
  }
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(layer.color));
  const gain = Math.min(1, brightness);
  const lineWidth = Math.max(1, face * size);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.imageSmoothingEnabled = true;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  context.strokeStyle = `rgb(${Math.round(rgb[0] * gain)}, ${Math.round(rgb[1] * gain)}, ${Math.round(rgb[2] * gain)})`;
  context.shadowBlur = 0;
  context.beginPath();
  drawNodeGraphScopeCanvasSmoothPath(context, points);
  context.stroke();
  context.restore();
}

// Stereo Trace (Output / pluginOutput / modules with stereoTracePorts):
// L/R colors + blend modes. Meet (combine): m=min(L,R);
// pixel=(L-m)·C_L+(R-m)·C_R+m·C_meet (complement → red+blue→green).

/** @returns {{ left: string, right: string } | null} */
function nodeGraphModuleStereoTracePorts(type) {
  const t = String(type || "").trim();
  if (!t) return null;
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[t]
    : null;
  const ports = def?.stereoTracePorts;
  if (ports && ports.left != null && ports.right != null) {
    return { left: String(ports.left), right: String(ports.right) };
  }
  // Classic stereo bus sinks.
  if (def?.output === true || t === "output" || t === "pluginOutput") {
    return { left: "Left", right: "Right" };
  }
  return null;
}

function nodeGraphModuleUsesStereoTraceDisplay(type) {
  return Boolean(nodeGraphModuleStereoTracePorts(type));
}

/**
 * Trace faces that store look/sync on the node (not the shared global Trace
 * bucket). Must stay aligned across form load, form save, and draw:
 * editingTraceDefaults / CurrentSettingsForFormType / SettingsForSlot.
 *
 * - output / pluginOutput: stereo bus sinks
 * - visualOscilloscope: multi-mode Display with its own Trace page
 * - stereoTracePorts modules (Ping Pong, Sabrina, …): dual-channel Trace faces
 */
function nodeGraphModuleKeepsPerNodeTraceDisplaySettings(type) {
  const t = String(type || "").trim();
  if (!t) {
    return false;
  }
  if (t === "output" || t === "pluginOutput" || t === "visualOscilloscope") {
    return true;
  }
  return nodeGraphModuleUsesStereoTraceDisplay(t);
}

function nodeGraphStereoTraceBuffers(nodeId, type) {
  const id = String(nodeId || "");
  const ports = nodeGraphModuleStereoTracePorts(type);
  if (!id || !ports) {
    return null;
  }
  const left = nodeGraphModuleScopeState.buffers.get(`${id}:${ports.left}`);
  const right = nodeGraphModuleScopeState.buffers.get(`${id}:${ports.right}`);
  if (!left?.length || !right?.length) {
    return null;
  }
  return { left, right };
}

/** @deprecated Prefer nodeGraphStereoTraceBuffers(nodeId, type). */
function nodeGraphOutputStereoTraceBuffers(nodeId) {
  return nodeGraphStereoTraceBuffers(nodeId, "output");
}

function nodeGraphTraceDisplayPrimaryLayer(settings, color) {
  return {
    enabled: settings.dot1Enabled,
    size: settings.dot1Size,
    brightness: settings.brightness,
    // Trace is hard-stroke only — soft skirts don't fit line ribbons.
    blur: 0,
    color,
  };
}

function drawNodeGraphTraceDisplayCanvasItem(item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!slot || !buffer?.length || !screenElement) {
    return false;
  }
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(slot);
  // VECTOR polyline into density-scaled face buffer (default 1 = current look).
  const density = nodeGraphFacePlateDensity(settings, 1);
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    density,
  )) {
    return false;
  }
  // Vector class: normal blend (not screen). Density < 1 always chunky;
  // density ≥ 1 defers to CSS (smooth at 1:1, pixelated under zoom ≥ 2.5).
  canvas.classList.add("node-module-scope-vector-trace");
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else {
    canvas.style.imageRendering = "";
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  // At lo-fi density, keep nearest-neighbor presentation; at ≥1, smooth AA into buffer.
  context.imageSmoothingEnabled = density >= 0.999;
  if ("imageSmoothingQuality" in context && density >= 0.999) {
    context.imageSmoothingQuality = "high";
  }
  const bg = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  const fillTraceBackground = () => nodeGraphFacePlateFillCanvas(context, canvas, bg);
  // putImageData (combine/Meet) replaces pixels — paint plate *under* with destination-over after.
  const paintBackgroundUnder = () => nodeGraphFacePlateFillUnder(context, canvas, bg);
  const stereoBuffers = nodeGraphModuleUsesStereoTraceDisplay(slot?.type)
    ? nodeGraphStereoTraceBuffers(slot.nodeId, slot.type)
    : null;
  if (stereoBuffers) {
    const leftBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.left, settings);
    const rightBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.right, settings);
    const views = nodeGraphTraceDisplayStereoBufferViews(leftBuffer, rightBuffer, slot);
    const leftPoints = buildNodeGraphTraceDisplayCanvasPoints(leftBuffer, canvas, slot, views.left);
    const rightPoints = buildNodeGraphTraceDisplayCanvasPoints(rightBuffer, canvas, slot, views.right);
    const leftColor = settings.color || settings.dot1Color || "#ff0000";
    const rightColor = settings.secondaryColor || "#0000ff";
    const leftLayer = nodeGraphTraceDisplayPrimaryLayer(settings, leftColor);
    const rightLayer = {
      enabled: settings.secondaryEnabled !== false,
      size: settings.secondarySize,
      brightness: settings.secondaryBrightness,
      blur: 0,
      color: rightColor,
    };
    context.clearRect(0, 0, canvas.width, canvas.height);
    const face = Math.min(canvas.width, canvas.height);
    let painted = 0;
    const blend = settings.stereoBlend || "combine";
    if (blend !== "combine") {
      // Canvas composites: plate first, then strokes.
      fillTraceBackground();
    }
    if (typeof TraceStroke !== "undefined" && TraceStroke.drawStereo) {
      painted = TraceStroke.drawStereo(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: 0,
          brightness: leftLayer.brightness,
          color: leftColor,
          faceMinSide: face,
        },
        {
          size: rightLayer.size,
          blur: 0,
          brightness: rightLayer.brightness,
          color: rightColor,
          faceMinSide: face,
        },
        {
          blend,
          leftColor,
          rightColor,
          meetColor: "auto",
        },
      );
    } else if (typeof TraceStroke !== "undefined" && TraceStroke.drawStereoRedBlueGreen) {
      painted = TraceStroke.drawStereoRedBlueGreen(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: 0,
          brightness: leftLayer.brightness,
          faceMinSide: face,
        },
        {
          size: rightLayer.size,
          blur: 0,
          brightness: rightLayer.brightness,
          faceMinSide: face,
        },
      );
    } else {
      fillTraceBackground();
      // Fallback: layered RGB (overlap may look like additive mix, not meet).
      drawNodeGraphTraceDisplayCanvasLayer(context, rightPoints, rightLayer, canvas, { glow: false });
      drawNodeGraphTraceDisplayCanvasLayer(context, leftPoints, leftLayer, canvas, { glow: false });
      painted = leftPoints.length + rightPoints.length;
    }
    // Meet putImageData leaves transparent holes — plate goes underneath.
    if (blend === "combine") {
      paintBackgroundUnder();
    }
    recordNodeGraphModuleScopeRenderMetrics(painted, painted);
    rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
    return true;
  }
  // Mono 1D Trace = VECTOR polyline (not a pixel strip / energy grid).
  const prepared = prepareNodeGraphTraceDisplayBuffer(buffer, settings);
  fillTraceBackground();
  const points = buildNodeGraphTraceDisplayCanvasPoints(prepared || buffer, canvas, slot);
  const layer = nodeGraphTraceDisplayPrimaryLayer(settings, settings.color);
  drawNodeGraphTraceDisplayCanvasLayer(context, points, layer, canvas, { glow: false });
  recordNodeGraphModuleScopeRenderMetrics(points.length, points.length);
  rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
  return true;
}

function appendNodeGraphScope2dInterpolatedPoint(points, point, spacingPx = 0.5) {
  if (!point) {
    return;
  }
  const previous = points[points.length - 1];
  if (!previous) {
    points.push(point);
    return;
  }
  const dx = point.x - previous.x;
  const dy = point.y - previous.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(distance)) {
    return;
  }
  const safeSpacing = Math.max(0.25, Number(spacingPx) || 0.5);
  if (distance < safeSpacing) {
    points.push(point);
    return;
  }
  const steps = Math.max(1, Math.ceil(distance / safeSpacing));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    points.push({
      x: previous.x + dx * t,
      y: previous.y + dy * t,
    });
  }
}

function appendNodeGraphScope2dSegment(points, previousPoint, point, spacingPx = 0.5) {
  if (!point) {
    return point || previousPoint;
  }
  if (!previousPoint) {
    points.push(point);
    return point;
  }
  const segmentPoints = [previousPoint];
  appendNodeGraphScope2dInterpolatedPoint(segmentPoints, point, spacingPx);
  if (segmentPoints.length <= 1) {
    return previousPoint;
  }
  points.push(...segmentPoints.slice(1));
  return point;
}

function nodeGraphScope2dInterpolationSpacingPx(settings = {}, dotSpace = 1) {
  return nodeGraphScope2dContinuitySpacingPx(settings, dotSpace);
}

function breakNodeGraphScope2dPath(points) {
  if (Array.isArray(points) && points.length && points[points.length - 1] !== null) {
    points.push(null);
  }
}

function firstNodeGraphScope2dPathPoint(points) {
  if (!Array.isArray(points)) {
    return null;
  }
  return points.find(Boolean) || null;
}

function lastNodeGraphScope2dPathPoint(points) {
  if (!Array.isArray(points)) {
    return null;
  }
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index]) {
      return points[index];
    }
  }
  return null;
}

function nodeGraphScope2dPointDistance(a, b) {
  if (!a || !b) {
    return Infinity;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return Number.isFinite(distance) ? distance : Infinity;
}

function bridgeNodeGraphScope2dAdjacentFramePath(canvas, pathPoints, maxDistancePx, spacingPx) {
  const previousPoint = canvas?._nodeGraphScope2dLastDrawnPoint || null;
  const firstPoint = firstNodeGraphScope2dPathPoint(pathPoints);
  if (!previousPoint || !firstPoint) {
    return pathPoints;
  }
  // Bridge gate stays tight even when the vector-trace discontinuity gate is
  // loose (multi-orbit history). A long adjacent-frame bridge after a cursor
  // glitch or residual desync paints a bright wrong chord across the face.
  const faceMin = Math.min(
    Math.max(1, Number(canvas?.width) || 1),
    Math.max(1, Number(canvas?.height) || 1),
  );
  const bridgeMax = Math.min(
    Math.max(1, Number(maxDistancePx) || 1),
    Math.max(12, faceMin * 0.12),
  );
  if (nodeGraphScope2dPointDistance(previousPoint, firstPoint) > bridgeMax) {
    return pathPoints;
  }
  // One bridge vertex only — soft GPU beam segments already fill the gap
  // (prettyscope/woscope style). Dense CPU interpolation here multiplies
  // segment count and tanks FPS at high speed without improving softness.
  void spacingPx;
  return [previousPoint, ...pathPoints];
}

/**
 * Hard cap path control points / stamps per visual frame for retained 2D burn.
 * Cost stays O(budget); quality for slow orbits comes from even coverage of the
 * full history window, not from densifying one short arc of newest samples.
 */
function nodeGraphScope2dMaxSamplesPerFrame(canvas) {
  const area = Math.max(1, (canvas?.width || 1) * (canvas?.height || 1));
  return Math.max(768, Math.min(4096, Math.floor(Math.sqrt(area) * 6)));
}

/**
 * Evenly pick up to maxPoints indices across [0, count) for path geometry.
 * This is a control-point cap for the polyline — stamp count is decided later
 * by ideal spacing (may be far below maxPoints).
 */
function nodeGraphScope2dEvenSampleIndices(count, maxPoints) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount <= 0) {
    return [];
  }
  const cap = Math.max(2, Math.floor(Number(maxPoints) || 2));
  if (safeCount <= cap) {
    const all = new Array(safeCount);
    for (let i = 0; i < safeCount; i += 1) {
      all[i] = i;
    }
    return all;
  }
  const indices = new Array(cap);
  const last = safeCount - 1;
  for (let i = 0; i < cap; i += 1) {
    indices[i] = Math.min(last, Math.round((i * last) / (cap - 1)));
  }
  return indices;
}

/**
 * Build path polyline from the capture window. Prefer enough control points to
 * follow the curve; do NOT force maxPoints when fewer samples exist.
 * Stamp budget is applied separately (ideal spacing, stop when empty).
 */
function buildNodeGraphScope2dEvenPathPoints(square, buffer, maxPoints, settings) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count || !square) {
    return [];
  }
  // Control points: use all samples if modest; otherwise even-subsample.
  // Cap control verts so we don't iterate 44k points — stamps are budgeted later.
  const controlCap = Math.min(
    count,
    Math.max(256, Math.min(Math.floor(Number(maxPoints) || 2048) * 2, 8192)),
  );
  const indices = nodeGraphScope2dEvenSampleIndices(count, controlCap);
  const pathPoints = [];
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index])) {
      breakNodeGraphScope2dPath(pathPoints);
      continue;
    }
    const point = nodeGraphScope2dPointFromSamples(
      square,
      buffer.x[index],
      buffer.y[index],
      settings,
    );
    if (!point) {
      breakNodeGraphScope2dPath(pathPoints);
      continue;
    }
    pathPoints.push(point);
  }
  return pathPoints;
}

/**
 * If more samples arrived than we can afford this frame, skip the middle and
 * start from the newest window so we never fall into a catch-up death spiral.
 * (Used by segment / incremental modes.)
 */
function nodeGraphScope2dClampDrawStartIndex(startIndex, count, maxSamples) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const safeStart = Math.max(0, Math.min(safeCount, Math.floor(Number(startIndex) || 0)));
  const cap = Math.max(64, Math.floor(Number(maxSamples) || 2048));
  if (safeCount - safeStart <= cap) {
    return safeStart;
  }
  return Math.max(0, safeCount - cap);
}

function nodeGraphScope2dCanvasSettingsSignature(settings) {
  const safeSettings = normalizeNodeGraphScope2dSettings(settings);
  return [
    safeSettings.background,
    safeSettings.ghost,
    safeSettings.trail,
    safeSettings.dot1Enabled ? 1 : 0,
    safeSettings.dot1Size,
    safeSettings.dot1Brightness,
    safeSettings.dot1Color,
    safeSettings.lineThickness,
    Number.isFinite(Number(safeSettings.pixelDensity)) ? Number(safeSettings.pixelDensity) : 1,
  ].join("|");
}

function nodeGraphScope2dDrawStartIndex(state, buffer, count) {
  const startFrame = Number(buffer?.nodeGraphScopeStartFrame);
  const endFrame = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const lastFrame = Number(state?._nodeGraphScope2dLastDrawnFrame);
  if (
    !Number.isFinite(startFrame) ||
    !Number.isFinite(endFrame) ||
    !Number.isFinite(lastFrame) ||
    endFrame <= startFrame
  ) {
    return 0;
  }
  if (lastFrame >= endFrame) {
    return count;
  }
  if (lastFrame <= startFrame) {
    return 0;
  }
  const frameOffset = Math.max(0, Math.floor(lastFrame - startFrame) - 1);
  return Math.min(Math.max(0, Math.floor(Number(count) || 0) - 1), frameOffset);
}

function buildNodeGraphScope2dPathPoints(square, buffer, startIndex = 0, options = {}) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count) {
    return [];
  }
  const pathPoints = [];
  const interpolationSpacingPx = nodeGraphScope2dInterpolationSpacingPx(
    options.settings,
    Math.min(Number(square?.width) || 1, Number(square?.height) || 1),
  );
  const interpolate = options.interpolate !== false;
  let previousPoint = null;
  for (let index = Math.max(0, Math.floor(Number(startIndex) || 0)); index < count; index += 1) {
    if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index])) {
      breakNodeGraphScope2dPath(pathPoints);
      previousPoint = null;
      continue;
    }
    const point = nodeGraphScope2dPointFromSamples(square, buffer.x[index], buffer.y[index], options.settings);
    if (!point) {
      breakNodeGraphScope2dPath(pathPoints);
      previousPoint = null;
      continue;
    }
    if (interpolate) {
      previousPoint = appendNodeGraphScope2dSegment(pathPoints, previousPoint, point, interpolationSpacingPx);
    } else {
      pathPoints.push(point);
      previousPoint = point;
    }
  }
  return pathPoints;
}

// drawNodeGraphScope2dItem → node-graph-module-scope-draw-burn.js
// Registry of displayType -> renderer function, checked by
// drawNodeGraphModuleScopeTypedItem below. New bespoke display types (e.g.
// a module's own dedicated file) can call
// nodeGraphModuleScopeCustomRenderers.yourType = yourRenderFn to register
// without editing this file, once they've also been added to the
// nodeGraphDisplayModeRenderers allow-list above (that list stays a
// separate validation step, not a dispatch mechanism).
/**
 * Modules that paint their own face canvas (Matrix Display, Asciiscope XY, …).
 * Scope slot stays registered so visualSink buffer capture + room-dimmer light
 * punches still work — but we must never mount a Trace local-fallback canvas
 * over the custom UI (that painted a grey baseline bar across the module).
 */
// Draw orchestrator → node-graph-module-scope-draw-orchestrator.js
