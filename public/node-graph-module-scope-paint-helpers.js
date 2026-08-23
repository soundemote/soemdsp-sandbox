// Face geometry / 1D burn / late scope2d path helpers peeled from module-scopes.js (Phase D).
// Load after node-graph-module-scopes.js, before draw-orchestrator. Extract-only.

function nodeGraphOneDimensionalBurnSampleToY(sample, height, settings = null) {
  const h = Math.max(1, Number(height) || 1);
  const amp = nodeGraphDisplaySettingsAmplitudeScale(settings);
  return h * 0.5 - clampNodeSliderValue((Number(sample) || 0) * amp, -1, 1) * h * 0.44;
}

/**
 * Classic digital-scope envelope for 1D Phosphor.
 *
 * Bucket samples by pixel column: keep min/max Y per column, then emit a
 * left→right polyline. Square edges become ONE vertical stem (column min→max)
 * instead of a staircase of polyblep samples or budget-starved stamp chains.
 * Flats stay a single horizontal at the plateau Y.
 */
function nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings) {
  if (!context || !canvas?.width || !canvas?.height) {
    return;
  }
  // App-wide residual: Ghost = super-exp; Trail = linear blend; Burn = sticky floor.
  // Trail 0 = no trail (wipe); 0.75 = pure linear; 1 = freeze (no erase).
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const trail = Residual && typeof Residual.migrateTrail === "function"
    ? Residual.migrateTrail(settings, Residual.DEFAULT_TRAIL ?? 0.5)
    : clampNodeSliderValue(Number(settings?.trail) || 0, 0, 1);
  const ghost = Residual && typeof Residual.migrateGhost === "function"
    ? Residual.migrateGhost(settings, Residual.DEFAULT_GHOST ?? 0.45)
    : clampNodeSliderValue(Number(settings?.ghost) || 0, 0, 1);
  const burn = Residual && typeof Residual.migrateBurn === "function"
    ? Residual.migrateBurn(settings, Residual.DEFAULT_BURN ?? 0)
    : (
      Number(settings?.residualSchema) >= 2
        ? clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1)
        : 0
    );
  // Burn > 0 needs per-pixel floor; uniform destination-out cannot stick floors.
  if (burn > 0.001 && Residual && typeof Residual.applyResidual === "function") {
    const w = canvas.width | 0;
    const h = canvas.height | 0;
    if (w > 0 && h > 0) {
      const img = context.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        if (a <= 0.0005) continue;
        // Premultiplied-ish energy from max channel × alpha.
        const e = Math.max(d[i], d[i + 1], d[i + 2]) / 255 * a;
        const next = Residual.applyResidual(e, trail, ghost, burn);
        const na = Math.max(0, Math.min(1, next));
        if (na <= 0.0005) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 0;
        } else {
          // Preserve hue of residual ink; scale alpha to next energy.
          const scale = a > 1e-6 ? na / a : na;
          d[i] = Math.max(0, Math.min(255, Math.round(d[i] * scale)));
          d[i + 1] = Math.max(0, Math.min(255, Math.round(d[i + 1] * scale)));
          d[i + 2] = Math.max(0, Math.min(255, Math.round(d[i + 2] * scale)));
          d[i + 3] = Math.max(0, Math.min(255, Math.round(na * 255)));
        }
      }
      context.putImageData(img, 0, 0);
    }
    return;
  }
  let erase = 0;
  if (Residual && typeof Residual.trailFadeAmount === "function") {
    erase = Number(Residual.trailFadeAmount(trail, ghost));
  } else if (Residual && typeof Residual.residualKeep === "function") {
    erase = 1 - Number(Residual.residualKeep(trail, ghost));
  } else {
    // Fallback: simple inverse trail (legacy).
    erase = clampNodeSliderValue(1 - trail, 0, 1) * 0.12;
  }
  erase = clampNodeSliderValue(erase, 0, 1);
  if (erase <= 0.00005) {
    return;
  }
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${erase.toFixed(4)})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function nodeGraphScopeRgbFloatsToCanvasRgb(color) {
  const rgb = Array.isArray(color) ? color : [1, 1, 1];
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(clampNodeSliderValue(Number(value) || 0, 0, 1) * 255))));
}

/** Rising-edge threshold for 1D Phosphor Reset (same family as osc Reset jacks). */
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
  // Trailing retained samples (not recent-only) so multi-post undrawn In
  // windows still line up with Reset history of the same length.
  const rRetained = Math.max(
    0,
    Math.min(
      resetBuffer.length,
      Math.floor(
        Number(resetBuffer.nodeGraphScopeRetainedSampleCount)
        || Number(resetBuffer.nodeGraphScopeRecentSampleCount)
        || resetBuffer.length,
      ),
    ),
  );
  const rCount = Math.min(rRetained || resetBuffer.length, safeInCount);
  if (rCount <= 0) {
    return 0;
  }
  // Align ends: last sample of In window ↔ last sample of Reset window.
  const fromEnd = (safeInCount - 1) - safeIndex;
  if (fromEnd >= rCount) {
    return 0;
  }
  const rIndex = (resetBuffer.length - 1) - fromEnd;
  if (rIndex < 0 || rIndex >= resetBuffer.length) {
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

/**
 * How many trailing samples of `buffer` still need depositing for this face.
 *
 * Prefer absoluteFrame − lastDrawn so multiple scope posts between RAF draws
 * are all stamped (recentSampleCount alone only holds the *latest* post — that
 * dropped earlier chunks and Y-jumped the pen). Falls back to recent-only when
 * absolute frames are missing (legacy / main-thread capture).
 */
function nodeGraphOneDimensionalBurnUndrawnWindow(canvas, buffer) {
  const retained = Math.max(
    0,
    Math.min(
      buffer?.length || 0,
      Math.floor(
        Number(buffer?.nodeGraphScopeRetainedSampleCount)
        || Number(buffer?.length)
        || 0,
      ),
    ),
  );
  const recent = Math.max(0, Math.floor(Number(buffer?.nodeGraphScopeRecentSampleCount) || 0));
  const absEnd = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const totalSamples = Number(buffer?.nodeGraphScopeTotalSampleCount);
  const lastDrawn = Number(
    canvas?._nodeGraphOneDimensionalBurnLastDrawnFrame
    ?? canvas?._nodeGraphScope2dLastDrawnFrame,
  );

  // Worklet visual-input path: absolute sample index is authoritative.
  if (Number.isFinite(absEnd) && absEnd > 0) {
    if (Number.isFinite(lastDrawn) && lastDrawn >= absEnd) {
      return { count: 0, drawStartIndex: 0, endFrame: absEnd };
    }
    const undrawn = Number.isFinite(lastDrawn) && lastDrawn > 0
      ? Math.max(0, Math.floor(absEnd - lastDrawn))
      : Math.max(recent, 0);
    const count = Math.min(retained || buffer.length, undrawn > 0 ? undrawn : Math.max(recent, 1));
    return { count, drawStartIndex: 0, endFrame: absEnd };
  }

  // Legacy: no absoluteFrame — use totalSampleCount cursor when available.
  if (Number.isFinite(totalSamples) && totalSamples > 0 && Number.isFinite(lastDrawn)) {
    if (lastDrawn >= totalSamples) {
      return { count: 0, drawStartIndex: 0, endFrame: totalSamples };
    }
    const undrawn = Math.max(0, Math.floor(totalSamples - lastDrawn));
    const count = Math.min(retained || buffer.length, undrawn > 0 ? undrawn : Math.max(recent, 1));
    return { count, drawStartIndex: 0, endFrame: totalSamples };
  }

  // Cold start / incomplete metadata: draw the latest post only.
  const count = Math.max(1, Math.min(buffer.length, recent || 1));
  const drawStartIndex = nodeGraphOneDimensionalBurnDrawStartIndex(canvas, buffer, count);
  const frameInfo = nodeGraphOneDimensionalBurnBufferFrameInfo(buffer, count);
  return {
    count,
    drawStartIndex,
    endFrame: Number.isFinite(frameInfo.endFrame) ? frameInfo.endFrame : null,
  };
}

function nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, settings, resetBuffer = null) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
    return [];
  }
  const windowInfo = nodeGraphOneDimensionalBurnUndrawnWindow(canvas, buffer);
  const count = Math.max(0, Math.floor(Number(windowInfo.count) || 0));
  const drawStartIndex = Math.max(0, Math.floor(Number(windowInfo.drawStartIndex) || 0));
  if (count <= 0 || drawStartIndex >= count) {
    return [];
  }
  const start = Math.max(0, buffer.length - count);
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
  // Auto-sync (Display Settings → Sync): rising edge of In snaps pen like Reset.
  const autoSync = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
    ? nodeGraphDisplaySettingsToggleIsOn(settings?.sourceSync ?? settings?.sync)
    : Boolean(settings?.sourceSync);
  const skipDisc = typeof nodeGraphDisplaySettingsToggleIsOn === "function"
    ? nodeGraphDisplaySettingsToggleIsOn(settings?.skipDiscontinuities)
    : settings?.skipDiscontinuities === true;
  const discThreshold = typeof nodeGraphModuleScopeDiscontinuityThreshold === "number"
    ? nodeGraphModuleScopeDiscontinuityThreshold
    : 0.85;
  let signalWasHigh = canvas._lineBurnSignalWasHigh === true;
  const syncThreshold = Number.isFinite(Number(nodeGraphLineBurnResetThreshold))
    ? Number(nodeGraphLineBurnResetThreshold)
    : 0.5;

  const snapPen = () => {
    phasor = 0;
  };

  const stepPhasorAndReset = (resetSample, signalSample) => {
    const resetHigh = Number(resetSample) >= syncThreshold;
    let snapped = resetHigh && !resetWasHigh;
    if (autoSync) {
      const signalHigh = Number(signalSample) >= 0;
      if (signalHigh && !signalWasHigh) {
        snapped = true;
      }
      signalWasHigh = signalHigh;
    }
    if (snapped) {
      snapPen();
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
    stepPhasorAndReset(
      nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, count),
      buffer[start + index],
    );
  }

  const points = [];
  let hadPoint = false;
  let prevSample = NaN;
  for (let index = drawStartIndex; index < count; index += 1) {
    const sample = buffer[start + index];
    const resetSample = nodeGraphOneDimensionalBurnResetSample(resetBuffer, index, count);
    const resetHigh = Number(resetSample) >= syncThreshold;
    let snapped = resetHigh && !resetWasHigh;
    if (autoSync) {
      const signalHigh = Number(sample) >= 0;
      if (signalHigh && !signalWasHigh) {
        snapped = true;
      }
      signalWasHigh = signalHigh;
    }
    if (snapped) {
      // Rising edge Reset and/or Sync: snap to left edge for this sample.
      if (hadPoint) {
        nodeGraphOneDimensionalBurnBreakPath(points);
      }
      snapPen();
      hadPoint = false;
    }
    resetWasHigh = resetHigh;

    if (
      skipDisc
      && hadPoint
      && Number.isFinite(prevSample)
      && Math.abs(Number(sample) - prevSample) > discThreshold
    ) {
      nodeGraphOneDimensionalBurnBreakPath(points);
      hadPoint = false;
    }

    // Draw at current phasor, then advance — so changing Sweep keeps X.
    points.push({
      x: phasor * width,
      y: nodeGraphOneDimensionalBurnSampleToY(sample, height, settings),
    });
    hadPoint = true;
    prevSample = Number(sample);

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
  canvas._lineBurnSignalWasHigh = signalWasHigh;
  delete canvas._lineBurnSweepOriginFrame;
  return points;
}

function nodeGraphOneDimensionalBurnPointBudget(canvas) {
  const width = Math.max(1, Number(canvas?.width) || 1);
  return Math.max(64, Math.min(2048, Math.ceil(width * 4)));
}

/**
 * Thin a 1D burn subpath with even index spacing (not min/max envelope).
 * Min/max buckets turn continuous waves into jagged zigzags.
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
  const bucketCount = Math.max(1, Math.floor(budget / 4));
  const bucketStep = length / bucketCount;
  let lastPushedIndex = -1;
  const pushUnique = (index) => {
    if (index < start || index >= end || index === lastPushedIndex) {
      return;
    }
    output.push(points[index]);
    lastPushedIndex = index;
  };
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketStart = start + Math.floor(bucket * bucketStep);
    const bucketEnd = Math.min(end, start + Math.max(1, Math.floor((bucket + 1) * bucketStep)));
    let minIndex = bucketStart;
    let maxIndex = bucketStart;
    for (let index = bucketStart + 1; index < bucketEnd; index += 1) {
      const y = Number(points[index]?.y);
      if (!Number.isFinite(y)) {
        continue;
      }
      if (y < Number(points[minIndex]?.y)) {
        minIndex = index;
      }
      if (y > Number(points[maxIndex]?.y)) {
        maxIndex = index;
      }
    }
    const important = [bucketStart, minIndex, maxIndex, bucketEnd - 1]
      .filter((index) => index >= bucketStart && index < bucketEnd)
      .sort((a, b) => a - b);
    for (const index of important) {
      pushUnique(index);
    }
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
/** Default face plate — pure black (no teal/CRT tint in the plate color). */
const nodeGraphFacePlateDefaultBackground = "#000000";

/** Resolve face plate color from any display settings object. */
function nodeGraphFacePlateBackground(settings, fallback = nodeGraphFacePlateDefaultBackground) {
  const bright = settings?.backgroundBrightness;
  if (bright != null && Number.isFinite(Number(bright))
    && typeof nodeGraphHueBrightnessCss === "function") {
    const hue = typeof nodeGraphHueDegFromHex === "function"
      ? nodeGraphHueDegFromHex(settings.background ?? settings.backgroundColor)
      : 0;
    return nodeGraphHueBrightnessCss(hue, Number(bright));
  }
  return normalizeNodeGraphTraceDisplayColor(
    settings?.background ?? settings?.backgroundColor,
    fallback,
  );
}

/** Pixel density 0…1 from settings. Preserves 0 (never `|| 1`). */
function nodeGraphFacePlateDensity(settings, fallback = 1) {
  if (typeof nodeGraphTraceDisplayClampPixelDensity === "function") {
    const n = Number(settings?.pixelDensity);
    return nodeGraphTraceDisplayClampPixelDensity(Number.isFinite(n) ? n : fallback);
  }
  const n = Number(settings?.pixelDensity);
  if (!Number.isFinite(n)) {
    const fb = Number(fallback);
    return Number.isFinite(fb) ? Math.max(0, Math.min(1, fb)) : 1;
  }
  return Math.max(0, Math.min(1, n));
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
 * Size 0–1 → radius px (linear diameter map).
 * diameter = size * faceMinSide, radius = half. Size 0 → 0.
 */
function nodeGraphScopeSize01ToRadiusPx(faceMinSide, size01) {
  if (typeof PhosphorDrawer !== "undefined" && typeof PhosphorDrawer.size01ToRadiusPx === "function") {
    return PhosphorDrawer.size01ToRadiusPx(faceMinSide, size01);
  }
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.radiusPx === "function") {
    return TraceStroke.radiusPx(faceMinSide, size01);
  }
  const side = Math.max(1, Number(faceMinSide) || 1);
  const t = clampNodeSliderValue(Number(size01), 0, 1);
  return side * t * 0.5;
}

/** Size 0–1 → diameter/line-width px (linear: size * face min side). Size 0 → 0. */
function nodeGraphScopeSize01ToDiameterPx(faceMinSide, size01) {
  if (typeof PhosphorDrawer !== "undefined" && typeof PhosphorDrawer.size01ToDiameterPx === "function") {
    return PhosphorDrawer.size01ToDiameterPx(faceMinSide, size01);
  }
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.diameterPx === "function") {
    return TraceStroke.diameterPx(faceMinSide, size01);
  }
  const side = Math.max(1, Number(faceMinSide) || 1);
  const t = clampNodeSliderValue(Number(size01), 0, 1);
  return side * t;
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

/** Drop 2D Trace verts that sit inside minPx of the last kept point. Keep
 *  path breaks and each piece's first/last so endpoints stay exact. */
function nodeGraphScope2dCollapseTracePoints(points, minPx = 0.5) {
  if (!Array.isArray(points) || points.length < 3) {
    return points || [];
  }
  const minSq = Math.max(0.01, Number(minPx) || 0.5) ** 2;
  const out = [];
  let pieceStart = -1;
  const flushPiece = (from, to) => {
    const first = points[from];
    const last = points[to];
    out.push(first);
    if (to <= from) {
      return;
    }
    let lx = first.x;
    let ly = first.y;
    for (let i = from + 1; i < to; i += 1) {
      const p = points[i];
      const dx = p.x - lx;
      const dy = p.y - ly;
      if ((dx * dx) + (dy * dy) >= minSq) {
        out.push(p);
        lx = p.x;
        ly = p.y;
      }
    }
    const tail = out[out.length - 1];
    if (!tail || tail.x !== last.x || tail.y !== last.y) {
      out.push(last);
    }
  };
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const real = Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (real) {
      if (pieceStart < 0) {
        pieceStart = i;
      }
      continue;
    }
    if (pieceStart >= 0) {
      flushPiece(pieceStart, i - 1);
      pieceStart = -1;
    }
    out.push(p);
  }
  if (pieceStart >= 0) {
    flushPiece(pieceStart, points.length - 1);
  }
  return out;
}

function buildNodeGraphScope2dTraceCanvasPoints(canvasSquare, buffer, settings) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!canvasSquare || count <= 0) {
    return [];
  }
  const points = [];
  // History already windows capture. Walk samples in order so a slow orbit
  // (4 Hz circle) is not an octagon from TraceStroke.pointBudget / even pick.
  // Safety cap only — still hundreds of points per cycle at 4 Hz / 10 s.
  const cap = 16384;
  const skipDisc = nodeGraphScope2dSkipDiscontinuitiesEnabled(settings);
  // Unfilled ring prefix is 0,0 (face center). Stroking that into the orbit
  // draws the curve PLUS chords / an inner hexagon. Break huge spatial jumps;
  // skip a leading dead origin run.
  const maxSeg = typeof nodeGraphScope2dTraceMaxSegmentPixels === "function"
    ? Math.max(12, Math.min(
      nodeGraphScope2dTraceMaxSegmentPixels(canvasSquare),
      Math.min(canvasSquare.width, canvasSquare.height) * 0.12,
    ))
    : Math.max(12, Math.min(canvasSquare.width, canvasSquare.height) * 0.12);
  let prevIndex = -1;
  let prevPoint = null;
  let skippedOrigin = false;
  const visit = (index) => {
    const sx = Number(buffer.x[index]);
    const sy = Number(buffer.y[index]);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      breakNodeGraphScope2dPath(points);
      prevIndex = -1;
      prevPoint = null;
      return;
    }
    if (!skippedOrigin && Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) {
      return;
    }
    skippedOrigin = true;
    const point = nodeGraphScope2dTracePointFromSamples(
      canvasSquare,
      sx,
      sy,
      settings,
    );
    if (!point) {
      breakNodeGraphScope2dPath(points);
      prevIndex = -1;
      prevPoint = null;
      return;
    }
    if (skipDisc && prevIndex >= 0 && nodeGraphScope2dRangeHasDiscontinuity(buffer, prevIndex, index)) {
      breakNodeGraphScope2dPath(points);
      prevPoint = null;
    }
    if (prevPoint && !nodeGraphScope2dTraceSegmentIsContinuous(prevPoint, point, maxSeg)) {
      breakNodeGraphScope2dPath(points);
    }
    points.push(point);
    prevIndex = index;
    prevPoint = point;
  };
  if (count > cap && typeof nodeGraphScope2dEvenSampleIndices === "function") {
    const indices = nodeGraphScope2dEvenSampleIndices(count, cap);
    for (let i = 0; i < indices.length; i += 1) {
      visit(indices[i]);
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      visit(index);
    }
  }
  return nodeGraphScope2dCollapseTracePoints(points, 0.5);
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
  let previousIndex = NaN;
  for (let index = 0; index < pointCount; index += 1) {
    const progress = progressFn(index, pointCount);
    const samplePosition = view.start + progress * Math.max(0, visibleSamples - 1);
    const sampleInfo = nodeGraphTraceDisplaySampleInfo(buffer, samplePosition, spPt);
    const raw = Number.isFinite(Number(sampleInfo.value)) ? Number(sampleInfo.value) : 0;
    const value = clampNodeSliderValue((raw * view.gain) + view.offset, -1, 1);
    // Break the polyline once at a true adjacent-sample wrap. Keep this
    // point — do not drop the next N vertices (that made the line vanish).
    let breakBefore = false;
    if (skipSamples > 0 && Number.isFinite(previousIndex)) {
      const from = Math.floor(previousIndex);
      const to = Math.floor(samplePosition);
      if (to > from) {
        for (let i = from; i < to; i += 1) {
          const a = Number(buffer[i]) || 0;
          const b = Number(buffer[Math.min(buffer.length - 1, i + 1)]) || 0;
          if (Math.abs(b - a) > nodeGraphModuleScopeDiscontinuityThreshold) {
            breakBefore = true;
            break;
          }
        }
      } else if (sampleInfo.discontinuity) {
        breakBefore = true;
      }
    }
    samples.push({ progress, samplePosition, raw, value, breakBefore });
    previousIndex = samplePosition;
  }
  return samples;
}

function buildNodeGraphTraceDisplayCanvasPoints(buffer, canvas, slot, viewOverride = null, rect = null, options = null) {
  if (!buffer?.length || !canvas?.width || !canvas?.height) {
    return [];
  }
  const box = rect && Number.isFinite(Number(rect.width)) && Number.isFinite(Number(rect.height))
    ? {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      width: Math.max(1, Number(rect.width)),
      height: Math.max(1, Number(rect.height)),
    }
    : { x: 0, y: 0, width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) };
  const width = box.width;
  let view = viewOverride || nodeGraphTraceDisplayBufferView(buffer, slot);
  const settings = typeof nodeGraphTraceDisplaySettingsForSlot === "function"
    ? nodeGraphTraceDisplaySettingsForSlot(slot)
    : null;
  const syncChannel = typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(settings)
    : "off";
  // Freerun only: snap the window to whole pixels. Triggered sync stays
  // on the fractional crossing — pixel-lock would undo sub-sample lock.
  // Incremental strip paints pass skipPixelLock (the strip is already 1px steps).
  if (
    syncChannel === "off"
    && !options?.skipPixelLock
    && Number(view?.start) >= 0
    && typeof nodeGraphTraceDisplayPixelLockedView === "function"
  ) {
    view = nodeGraphTraceDisplayPixelLockedView(view, width);
  }
  const halfHeight = box.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, { height: box.height });
  if (!view || view.end <= view.start) {
    const sample = nodeGraphModuleScopeInterpolatedSample(buffer, Math.max(0, buffer.length - 1));
    const value = clampNodeSliderValue((sample * (Number(view?.gain) || 1)) + (Number(view?.offset) || 0), -1, 1);
    return [{
      x: box.x,
      y: box.y + (box.height * 0.5) - value * halfHeight,
    }, {
      x: box.x + box.width,
      y: box.y + (box.height * 0.5) - value * halfHeight,
    }];
  }
  const midY = box.y + box.height * 0.5;
  if (typeof TraceWaveform !== "undefined" && typeof TraceWaveform.buildPoints === "function") {
    const skipSamples = typeof nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot === "function"
      ? nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer)
      : 0;
    const built = TraceWaveform.buildPoints({
      buffer,
      start: view.start,
      end: view.end,
      validStart: view.validStart,
      width,
      // Vertex budget follows the face, not a 1–2px clip rect.
      vertexWidth: Number(options?.vertexWidth) > 0
        ? Number(options.vertexWidth)
        : Math.max(width, Number(canvas.width) || 0),
      height: box.height,
      midY: box.height * 0.5,
      halfHeight,
      gain: view.gain,
      offset: view.offset,
      skipDiscontinuities: skipSamples > 0,
      discontinuityThreshold: typeof nodeGraphModuleScopeDiscontinuityThreshold === "number"
        ? nodeGraphModuleScopeDiscontinuityThreshold
        : 0.85,
    });
    if (!box.x && !box.y) {
      return built;
    }
    return built.map((p) => (p && Number.isFinite(p.x) ? { x: p.x + box.x, y: p.y + box.y } : p));
  }
  // Fallback: sample-accurate polyline (still no i/(n-1) remap).
  const first = Math.max(
    Number.isFinite(Number(view.validStart)) ? Number(view.validStart) : 0,
    Math.max(0, Math.floor(view.start)),
  );
  const last = Math.min(buffer.length - 1, Math.ceil(view.end) - 1);
  const span = Math.max(1e-9, view.end - view.start);
  const points = [];
  for (let i = first; i <= last; i += 1) {
    const raw = Number(buffer[i]) || 0;
    const value = clampNodeSliderValue((raw * view.gain) + view.offset, -1, 1);
    points.push({
      x: box.x + ((i - view.start) / span) * width,
      y: midY - value * halfHeight,
    });
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
  const face = Math.max(
    1,
    Number(options.faceMinSide) || Math.min(canvas.width, canvas.height),
  );
  const blur = Number.isFinite(Number(layer.blur)) ? Number(layer.blur) : 0;
  const blend = typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.normalizeBlend === "function"
    ? TraceHistoryDraw.normalizeBlend(layer.blend || options.blend, "source-over")
    : String(layer.blend || options.blend || "source-over");
  const layerBright = Number.isFinite(Number(layer.brightness)) ? Number(layer.brightness) : 1;
  if (typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.strokeSolid === "function") {
    TraceHistoryDraw.strokeSolid(context, points, {
      size: layer.size,
      blur,
      brightness: layerBright,
      fade: Number.isFinite(Number(layer.fade)) ? Number(layer.fade) : 0,
      color: layer.color,
      blend,
      dotBudget: layer.dotBudget,
      faceMinSide: face,
      lineCap: options.lineCap,
    });
    return;
  }
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    TraceStroke.draw(context, points, {
      size: layer.size,
      blur,
      brightness: layerBright,
      fade: Number.isFinite(Number(layer.fade)) ? Number(layer.fade) : 0,
      color: layer.color,
      faceMinSide: face,
      composite: blend === "combine" ? "source-over" : blend,
      lineCap: options.lineCap,
    });
    return;
  }
  const size = clampNodeSliderValue(layer.size, 0, 1);
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(layer.color));
  const lineWidth = typeof nodeGraphScopeSize01ToDiameterPx === "function"
    ? nodeGraphScopeSize01ToDiameterPx(face, size)
    : Math.max(1, face * size);
  context.save();
  context.globalCompositeOperation = blend === "combine" ? "source-over" : blend;
  context.imageSmoothingEnabled = false;
  context.lineCap = options.lineCap === "butt" ? "butt" : "round";
  context.lineJoin = options.lineCap === "butt" ? "miter" : "round";
  context.lineWidth = lineWidth;
  context.strokeStyle = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
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
  return null;
}

function nodeGraphModuleUsesStereoTraceDisplay(type) {
  return Boolean(nodeGraphModuleStereoTracePorts(type));
}

/** True when L or R jack is actually wired. Unwired L/R rings are silence. */
function nodeGraphStereoTraceLrWired(nodeId, type) {
  const id = String(nodeId || "");
  const ports = nodeGraphModuleStereoTracePorts(type);
  if (!id || !ports || typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return false;
  }
  return nodeGraphModuleScopeConnectionsTo(id, ports.left).length > 0
    || nodeGraphModuleScopeConnectionsTo(id, ports.right).length > 0;
}

/**
 * Instant Trace look (history, colors, sync) is per module/display.
 * The global Trace bucket is only a seed for modules that have never been
 * customized — editing one Sample & Hold must not rewrite every other 1D
 * Trace face.
 *
 * Must stay aligned across form load, form save, and draw:
 * editingTraceDefaults / CurrentSettingsForFormType / SettingsForSlot.
 */
function nodeGraphModuleKeepsPerNodeTraceDisplaySettings(type) {
  return Boolean(String(type || "").trim());
}

function nodeGraphStereoTraceBuffers(nodeId, type) {
  const id = String(nodeId || "");
  const ports = nodeGraphModuleStereoTracePorts(type);
  if (!id || !ports) {
    return null;
  }
  // Mono-only graphs (SinCos → Output Mono) must not use empty L/R rings.
  if (!nodeGraphStereoTraceLrWired(id, type)) {
    return null;
  }
  // Same rings as 1D Stereo Trace: this node's visual L/R only.
  // Do not fall back to the wired source's capture buffer — that clock/rate
  // mix is what made Output Instant Trace blob between 0 and the signal.
  const left = nodeGraphModuleScopeState.buffers.get(`${id}:${ports.left}`);
  const right = nodeGraphModuleScopeState.buffers.get(`${id}:${ports.right}`);
  if (!left?.length && !right?.length) {
    return null;
  }
  return { left, right };
}

/** @deprecated Prefer nodeGraphStereoTraceBuffers(nodeId, type). */
function nodeGraphOutputStereoTraceBuffers(nodeId) {
  return nodeGraphStereoTraceBuffers(nodeId, "output");
}

/**
 * Stereo Instant Trace (traceDisplayStereo SSOT). Meet = red+blue→green.
 */
function paintNodeGraphTraceDisplayStereoStrokes(
  context,
  canvas,
  leftPoints,
  rightPoints,
  leftLayer,
  rightLayer,
  blend,
  faceMinSide = 0,
  lineCap = "",
) {
  if (!context || !canvas) {
    return 0;
  }
  const mode = String(blend || "combine");
  const face = Math.max(
    1,
    Number(faceMinSide) || Math.min(canvas.width, canvas.height),
  );
  const leftPts = leftLayer?.enabled === false ? [] : (leftPoints || []);
  const rightPts = rightLayer?.enabled === false ? [] : (rightPoints || []);
  if (mode === "combine"
    && typeof TraceHistoryDraw !== "undefined"
    && typeof TraceHistoryDraw.strokeStereo === "function") {
    return TraceHistoryDraw.strokeStereo(
      context,
      leftPts,
      rightPts,
      {
        size: leftLayer.size,
        blur: leftLayer.blur,
        brightness: leftLayer.brightness,
        fade: leftLayer.fade || 0,
        color: leftLayer.color,
        faceMinSide: face,
        dotBudget: leftLayer.dotBudget,
      },
      {
        size: rightLayer.size,
        blur: rightLayer.blur,
        brightness: rightLayer.brightness,
        fade: rightLayer.fade || 0,
        color: rightLayer.color,
        faceMinSide: face,
        dotBudget: rightLayer.dotBudget,
      },
      { blend: "combine", meetColor: "auto", lineCap },
    );
  }
  if (mode === "combine"
    && typeof TraceStroke !== "undefined"
    && typeof TraceStroke.drawStereo === "function") {
    return TraceStroke.drawStereo(
      context,
      leftPts,
      rightPts,
      {
        size: leftLayer.size,
        blur: leftLayer.blur,
        brightness: leftLayer.brightness,
        fade: leftLayer.fade || 0,
        color: leftLayer.color,
        faceMinSide: face,
      },
      {
        size: rightLayer.size,
        blur: rightLayer.blur,
        brightness: rightLayer.brightness,
        fade: rightLayer.fade || 0,
        color: rightLayer.color,
        faceMinSide: face,
      },
      {
        blend: "combine",
        leftColor: leftLayer.color,
        rightColor: rightLayer.color,
        meetColor: "auto",
        lineCap,
      },
    );
  }
  const strokeBlend = mode === "combine" ? "source-over" : mode;
  if (rightPts.length) {
    drawNodeGraphTraceDisplayCanvasLayer(context, rightPts, rightLayer, canvas, { blend: strokeBlend });
  }
  if (leftPts.length) {
    drawNodeGraphTraceDisplayCanvasLayer(context, leftPts, leftLayer, canvas, { blend: strokeBlend });
  }
  return leftPts.length + rightPts.length;
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

/**
 * Paint Output / Trace face plate from Display Settings when there is no live
 * capture yet (or audio is silent). Applies --node-scope-background so color
 * changes are visible without waiting for scope samples.
 */
const NODE_GRAPH_OUTPUT_PROTECT_BANNER = "♨️";
const NODE_GRAPH_OUTPUT_PROTECT_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

function nodeGraphOutputProtectFaceSlot(slot) {
  const type = String(slot?.type || "");
  return type === "output" || type === "pluginOutput";
}

function nodeGraphOutputTransportIsPaused() {
  if (typeof nodeGraphLiveEngineIsPaused === "function") {
    return nodeGraphLiveEngineIsPaused();
  }
  const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
  if (!live?.node) {
    return false;
  }
  if (typeof scopePaintIsEnginePlaying === "function") {
    return !scopePaintIsEnginePlaying();
  }
  const speed = Number(live.speedMultiplier);
  return Number.isFinite(speed) && speed <= 0;
}

/** Dest-pixel ink (protect / pause). Lives on a layer that scrolls with Instant Trace. */
const NODE_GRAPH_OUTPUT_INK_FADE_MS = 1100;
const NODE_GRAPH_OUTPUT_PROTECT_REPRINT_MS = 400;
let nodeGraphOutputInkHoldUntil = 0;

function nodeGraphOutputInkNowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function nodeGraphOutputInkArmFrames(extraMs = NODE_GRAPH_OUTPUT_INK_FADE_MS + 1400) {
  const until = nodeGraphOutputInkNowMs() + Math.max(0, Number(extraMs) || 0);
  if (until > nodeGraphOutputInkHoldUntil) {
    nodeGraphOutputInkHoldUntil = until;
  }
}

function nodeGraphOutputInkWantsFrames() {
  if ((Number(globalThis.nodeGraphOutputProtectMute) || 0) > 0.001) {
    return true;
  }
  return nodeGraphOutputInkNowMs() < nodeGraphOutputInkHoldUntil;
}

function nodeGraphOutputInkEnsure(canvas) {
  if (!canvas || !(canvas.width > 0) || !(canvas.height > 0)) {
    return null;
  }
  let layer = canvas._outputInkLayer;
  if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
    const prev = layer;
    layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const ctx = layer.getContext("2d");
    if (!ctx) {
      return null;
    }
    if (prev && prev.width > 0 && prev.height > 0) {
      ctx.drawImage(prev, 0, 0);
    }
    canvas._outputInkLayer = layer;
    canvas._outputInkCtx = ctx;
  }
  return canvas._outputInkCtx
    ? { layer: canvas._outputInkLayer, context: canvas._outputInkCtx }
    : null;
}

function nodeGraphOutputInkScroll(canvas, dxPx) {
  const dx = Math.round(Number(dxPx) || 0);
  if (!dx || !canvas?._outputInkLayer) {
    return;
  }
  const ink = nodeGraphOutputInkEnsure(canvas);
  if (!ink) {
    return;
  }
  const { layer, context } = ink;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "copy";
  context.drawImage(layer, -dx, 0);
  context.globalCompositeOperation = "source-over";
  context.clearRect(dx > 0 ? layer.width - dx : 0, 0, Math.abs(dx), layer.height);
  context.restore();
}

function nodeGraphOutputInkFade(canvas, dtMs) {
  const ink = canvas?._outputInkLayer ? nodeGraphOutputInkEnsure(canvas) : null;
  if (!ink) {
    return;
  }
  const dt = Math.max(0, Number(dtMs) || 0);
  if (!(dt > 0)) {
    return;
  }
  const amount = 1 - Math.exp(-dt / NODE_GRAPH_OUTPUT_INK_FADE_MS);
  if (!(amount > 0.002)) {
    return;
  }
  const { layer, context } = ink;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0,0,0,${Math.min(1, amount).toFixed(4)})`;
  context.fillRect(0, 0, layer.width, layer.height);
  context.restore();
}

function nodeGraphOutputInkComposite(destCtx, canvas) {
  const layer = canvas?._outputInkLayer;
  if (!destCtx || !layer) {
    return;
  }
  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  destCtx.globalCompositeOperation = "source-over";
  destCtx.imageSmoothingEnabled = false;
  destCtx.drawImage(layer, 0, 0);
  destCtx.restore();
}

function paintNodeGraphOutputFaceInk(context, canvas, text, options = {}) {
  if (!context || !(canvas?.width > 0) || !(canvas?.height > 0) || !text) {
    return false;
  }
  const alpha = Math.max(0, Math.min(1, Number(options.alpha ?? 1)));
  if (!(alpha > 0.001)) {
    return false;
  }
  const pad = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.06));
  const maxW = Math.max(8, canvas.width - pad * 2);
  const maxH = Math.max(8, canvas.height - pad * 2);
  const fontFamily = options.fontFamily || NODE_GRAPH_OUTPUT_PROTECT_FONT;
  const fontWeight = options.fontWeight ? `${options.fontWeight} ` : "";
  const density = Number(options.density);
  let lo = 8;
  let hi = Math.max(lo, Math.min(maxW, maxH * 2));
  let best = lo;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) * 0.5;
    context.font = `${fontWeight}${mid}px ${fontFamily}`;
    const metrics = context.measureText(text);
    const w = metrics.width;
    const h = (Number(metrics.actualBoundingBoxAscent) || mid * 0.85)
      + (Number(metrics.actualBoundingBoxDescent) || mid * 0.2);
    if (w <= maxW && h <= maxH) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  context.font = `${fontWeight}${best}px ${fontFamily}`;
  context.imageSmoothingEnabled = !(density < 0.999);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  const x = canvas.width * 0.5;
  const y = canvas.height * 0.5;
  if (options.stroke) {
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.lineWidth = Math.max(1, best * 0.06);
    context.strokeStyle = options.stroke;
    context.strokeText(text, x, y);
  }
  context.fillStyle = options.fill || "#ffffff";
  context.fillText(text, x, y);
  context.restore();
  return true;
}

function paintNodeGraphOutputPauseBars(context, canvas, options = {}) {
  if (!context || !(canvas?.width > 0) || !(canvas?.height > 0)) {
    return false;
  }
  const w = canvas.width;
  const h = canvas.height;
  const fit = Math.max(8, Math.min(w, h) - Math.max(2, Math.round(Math.min(w, h) * 0.08)) * 2);
  const barH = Math.max(8, Math.round(fit * 0.52));
  const barW = Math.max(3, Math.round(fit * 0.2));
  const gap = Math.max(2, Math.round(fit * 0.14));
  const totalW = barW * 2 + gap;
  const x0 = Math.round((w - totalW) * 0.5);
  const y0 = Math.round((h - barH) * 0.5);
  const alpha = Math.max(0, Math.min(1, Number(options.alpha ?? 1)));
  const density = Number(options.density);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = !(density < 0.999);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "rgba(0,0,0,0.85)";
  context.lineWidth = Math.max(1, Math.round(barW * 0.08));
  context.lineJoin = "miter";
  const drawBar = (x) => {
    context.beginPath();
    context.rect(x, y0, barW, barH);
    context.fill();
    context.stroke();
  };
  drawBar(x0);
  drawBar(x0 + barW + gap);
  context.restore();
  return true;
}

function nodeGraphOutputInkPrintPause(canvas, options = {}) {
  const ink = nodeGraphOutputInkEnsure(canvas);
  if (!ink) {
    return false;
  }
  const ok = paintNodeGraphOutputPauseBars(ink.context, ink.layer, options);
  if (ok) {
    nodeGraphOutputInkArmFrames();
  }
  return ok;
}

function nodeGraphOutputInkPrintProtect(canvas, alpha, options = {}) {
  const ink = nodeGraphOutputInkEnsure(canvas);
  if (!ink) {
    return false;
  }
  const ok = paintNodeGraphOutputFaceInk(ink.context, ink.layer, NODE_GRAPH_OUTPUT_PROTECT_BANNER, {
    density: options.density,
    alpha,
    fontFamily: NODE_GRAPH_OUTPUT_PROTECT_FONT,
    fill: "#ffffff",
  });
  if (ok) {
    nodeGraphOutputInkArmFrames();
  }
  return ok;
}

function nodeGraphOutputPausePlateEnsure(canvas) {
  if (!canvas || !(canvas.width > 0) || !(canvas.height > 0)) {
    return null;
  }
  let plate = canvas._outputPausePlate;
  if (!plate || plate.width !== canvas.width || plate.height !== canvas.height) {
    plate = document.createElement("canvas");
    plate.width = canvas.width;
    plate.height = canvas.height;
    canvas._outputPausePlate = plate;
    canvas._outputPausePlateReady = false;
  }
  return plate;
}

function paintNodeGraphOutputInkFrame(destCtx, canvas, slot, settings, density, options = {}) {
  if (!nodeGraphOutputProtectFaceSlot(slot) || !canvas || !destCtx) {
    return false;
  }
  const now = nodeGraphOutputInkNowMs();
  const scrolled = options.scrolled === true || Math.round(Number(options.scrollPx) || 0) > 0;
  const paused = nodeGraphOutputTransportIsPaused();
  if (paused) {
    const plate = nodeGraphOutputPausePlateEnsure(canvas);
    if (plate && !canvas._outputPausePlateReady) {
      const pctx = plate.getContext("2d");
      if (pctx) {
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.globalCompositeOperation = "copy";
        pctx.drawImage(canvas, 0, 0);
        canvas._outputPausePlateReady = true;
        canvas._outputPauseFadeBorn = now;
        nodeGraphOutputInkArmFrames(NODE_GRAPH_OUTPUT_INK_FADE_MS + 400);
      }
    }
    const born = Number(canvas._outputPauseFadeBorn);
    const alpha = Number.isFinite(born)
      ? Math.max(0, 1 - (now - born) / NODE_GRAPH_OUTPUT_INK_FADE_MS)
      : 1;
    if (plate && canvas._outputPausePlateReady) {
      destCtx.save();
      destCtx.setTransform(1, 0, 0, 1, 0, 0);
      destCtx.globalCompositeOperation = "copy";
      destCtx.drawImage(plate, 0, 0);
      destCtx.restore();
    }
    if (alpha > 0.001) {
      paintNodeGraphOutputPauseBars(destCtx, canvas, { density, alpha });
    }
    canvas._outputPauseBannerStamped = true;
  } else {
    canvas._outputPauseBannerStamped = false;
    canvas._outputPausePlateReady = false;
  }

  // soundemote.io: dest canvas is the tape. Stamp ♨️ at mute alpha only when
  // dest actually scrolled so last frame's pixels ride left with the waveform.
  const mute = Math.max(0, Math.min(1, Number(globalThis.nodeGraphOutputProtectMute) || 0));
  if (mute > 0.001 && (scrolled || options.force === true)) {
    paintNodeGraphOutputFaceInk(destCtx, canvas, NODE_GRAPH_OUTPUT_PROTECT_BANNER, {
      density,
      alpha: mute,
      fontFamily: NODE_GRAPH_OUTPUT_PROTECT_FONT,
      fill: "#ffffff",
    });
  }
  canvas._outputProtectLastMute = mute;
  return true;
}

function paintNodeGraphOutputProtectBanner(context, canvas, settings = {}, options = {}) {
  void settings;
  return paintNodeGraphOutputInkFrame(context, canvas, { type: "output" }, settings, options.density, options);
}

function paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, slot, settings, density) {
  return paintNodeGraphOutputInkFrame(context, canvas, slot, settings, density);
}

function paintNodeGraphOutputPauseBanner(context, canvas, settings = {}, options = {}) {
  void settings;
  return nodeGraphOutputInkPrintPause(canvas, options);
}

function paintNodeGraphOutputPauseBannerIfNeeded(context, canvas, slot, settings, density, options = {}) {
  return paintNodeGraphOutputInkFrame(context, canvas, slot, settings, density, options);
}

function nodeGraphTraceDisplayPinWaterfallClocks(nowMs) {
  const now = Number.isFinite(Number(nowMs))
    ? Number(nowMs)
    : ((typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now());
  const pin = (canvas) => {
    if (canvas?._waterfall) {
      canvas._waterfall.lastMs = now;
    }
    if (canvas?._traceScroll) {
      canvas._traceScroll.lastMs = now;
    }
  };
  if (typeof nodeGraphModuleScopePersistentCanvases?.forEach === "function") {
    nodeGraphModuleScopePersistentCanvases.forEach(pin);
  }
  if (typeof nodeGraphModuleScopeSlots === "function") {
    for (const slot of nodeGraphModuleScopeSlots() || []) {
      const existing = slot?.scopeElement?.querySelector?.(
        ":scope > canvas.node-module-scope-local-fallback-canvas",
      );
      pin(existing);
    }
  }
}

function nodeGraphOutputPauseBannerClearStampFlags() {
  const clear = (canvas) => {
    if (canvas) {
      canvas._outputPauseBannerStamped = false;
    }
  };
  if (typeof nodeGraphModuleScopePersistentCanvases?.forEach === "function") {
    nodeGraphModuleScopePersistentCanvases.forEach(clear);
  }
  if (typeof nodeGraphModuleScopeSlots === "function") {
    for (const slot of nodeGraphModuleScopeSlots() || []) {
      if (!nodeGraphOutputProtectFaceSlot(slot)) {
        continue;
      }
      clear(typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
        ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
        : null);
    }
  }
}

function stampNodeGraphOutputPauseBanners(options = {}) {
  if (!nodeGraphOutputTransportIsPaused()) {
    return false;
  }
  const slots = typeof nodeGraphVisibleModuleScopeSlots === "function"
    ? nodeGraphVisibleModuleScopeSlots()
    : (typeof nodeGraphModuleScopeSlots === "function" ? nodeGraphModuleScopeSlots() : []);
  let any = false;
  for (const slot of slots || []) {
    if (!nodeGraphOutputProtectFaceSlot(slot)) {
      continue;
    }
    const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
      ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
      : null;
    if (!canvas || !(canvas.width > 1) || !(canvas.height > 1)) {
      continue;
    }
    let context = null;
    try {
      context = canvas.getContext("2d");
    } catch (_error) {
      context = null;
    }
    if (!context) {
      continue;
    }
    const settings = typeof nodeGraphTraceDisplaySettingsForSlot === "function"
      ? nodeGraphTraceDisplaySettingsForSlot(slot)
      : {};
    const density = typeof nodeGraphFacePlateDensity === "function"
      ? nodeGraphFacePlateDensity(settings, 1)
      : 1;
    if (paintNodeGraphOutputPauseBannerIfNeeded(context, canvas, slot, settings, density, options)) {
      any = true;
    }
  }
  return any;
}

function paintNodeGraphTraceDisplayColdPlate(slot, pixelRatio = window.devicePixelRatio || 1, options = {}) {
  const screenElement = slot?.scopeElement;
  if (!slot || !screenElement) {
    return false;
  }
  const force = options?.force === true;
  const frozen = typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : (typeof nodeGraphModuleScopePhosphorFrozen === "function"
      && nodeGraphModuleScopePhosphorFrozen());
  const settings = typeof nodeGraphTraceDisplaySettingsForSlot === "function"
    ? nodeGraphTraceDisplaySettingsForSlot(slot)
    : (typeof nodeGraphTraceDisplaySettingsDefaults !== "undefined"
      ? nodeGraphTraceDisplaySettingsDefaults
      : {});
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : 1;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    const bg = typeof nodeGraphFacePlateBackground === "function"
      ? nodeGraphFacePlateBackground(settings)
      : "#000000";
    if (typeof nodeGraphFacePlateApplyCss === "function") {
      nodeGraphFacePlateApplyCss(screenElement, bg);
    }
    return false;
  }
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, density)) {
    return false;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  // Waterfall dest is history. Never fillRect a started tape.
  if ((canvas._waterfall?.started || canvas._traceScroll?.started) && canvas.width > 1 && canvas.height > 1) {
    const holdBg = typeof nodeGraphFacePlateBackground === "function"
      ? nodeGraphFacePlateBackground(settings)
      : "#000000";
    if (typeof nodeGraphFacePlateApplyCss === "function") {
      nodeGraphFacePlateApplyCss(screenElement, holdBg);
    }
    const holdCtx = canvas.getContext?.("2d");
    if (holdCtx) {
      paintNodeGraphOutputPauseBannerIfNeeded(holdCtx, canvas, slot, settings, density);
    }
    return true;
  }
  // Frozen + already-backed face: CSS plate only. fillRect here is what
  // made pause+drag look like the capture buffer had been cleared.
  if (frozen && !force && canvas.width > 1 && canvas.height > 1) {
    const holdBg = typeof nodeGraphFacePlateBackground === "function"
      ? nodeGraphFacePlateBackground(settings)
      : "#000000";
    if (typeof nodeGraphFacePlateApplyCss === "function") {
      nodeGraphFacePlateApplyCss(screenElement, holdBg);
    }
    paintNodeGraphOutputPauseBannerIfNeeded(context, canvas, slot, settings, density);
    return true;
  }
  const bg = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(settings)
    : "#000000";
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(screenElement, bg);
  }
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(context, canvas, bg);
  } else {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = bg || "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
  canvas.classList.add("node-module-scope-vector-trace");
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(screenElement, 1);
  }
  paintNodeGraphOutputInkFrame(context, canvas, slot, settings, density);
  return true;
}

function nodeGraphTraceDisplayBufferCursor(buffer) {
  const abs = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  if (Number.isFinite(abs) && abs > 0) {
    return abs;
  }
  const total = Number(buffer?.nodeGraphScopeTotalSampleCount);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }
  return Number.NaN;
}

function nodeGraphTraceDisplayEnsureScratchCanvas(owner, key, width, height) {
  if (!owner) {
    return null;
  }
  let canvas = owner[key];
  if (!canvas) {
    canvas = owner[key] = document.createElement("canvas");
  }
  const w = Math.max(1, Math.floor(Number(width) || 1));
  const h = Math.max(1, Math.floor(Number(height) || 1));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return canvas;
}

function nodeGraphTraceDisplayScratchContext(owner, key, width, height) {
  const canvas = nodeGraphTraceDisplayEnsureScratchCanvas(owner, key, width, height);
  const context = canvas?.getContext("2d");
  if (!context) {
    return null;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas, context };
}

function nodeGraphTraceWaterfallUndrawnWindow(canvas, buffer) {
  const retained = Math.max(
    0,
    Math.min(
      buffer?.length || 0,
      Math.floor(Number(buffer?.nodeGraphScopeRetainedSampleCount) || Number(buffer?.length) || 0),
    ),
  );
  const recent = Math.max(0, Math.floor(Number(buffer?.nodeGraphScopeRecentSampleCount) || 0));
  const absEnd = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const totalSamples = Number(buffer?.nodeGraphScopeTotalSampleCount);
  const lastDrawn = Number(canvas?._traceWaterfallLastDrawnFrame);
  if (Number.isFinite(absEnd) && absEnd > 0) {
    if (Number.isFinite(lastDrawn) && lastDrawn >= absEnd) {
      return { count: 0, endFrame: absEnd };
    }
    const undrawn = Number.isFinite(lastDrawn) && lastDrawn > 0
      ? Math.max(0, Math.floor(absEnd - lastDrawn))
      : Math.max(recent, 0);
    const count = Math.min(retained || buffer.length, undrawn > 0 ? undrawn : Math.max(recent, 1));
    return { count, endFrame: absEnd };
  }
  if (Number.isFinite(totalSamples) && totalSamples > 0 && Number.isFinite(lastDrawn)) {
    if (lastDrawn >= totalSamples) {
      return { count: 0, endFrame: totalSamples };
    }
    const undrawn = Math.max(0, Math.floor(totalSamples - lastDrawn));
    const count = Math.min(retained || buffer.length, undrawn > 0 ? undrawn : Math.max(recent, 1));
    return { count, endFrame: totalSamples };
  }
  return {
    count: Math.max(1, Math.min(buffer?.length || 0, recent || 1)),
    endFrame: Number.isFinite(absEnd) ? absEnd : (Number.isFinite(totalSamples) ? totalSamples : null),
  };
}

function nodeGraphTraceDisplayPaintWaterfall(spec) {
  return typeof nodeGraphWaterfallPaint === "function"
    ? nodeGraphWaterfallPaint(spec)
    : false;
}

function drawNodeGraphTraceDisplayCanvasItem(item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!slot || !screenElement) {
    return false;
  }
  if (!buffer?.length) {
    return paintNodeGraphTraceDisplayColdPlate(slot, pixelRatio);
  }
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(slot);
  const density = nodeGraphFacePlateDensity(settings, 1);
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    density,
  )) {
    return false;
  }
  canvas.classList.add("node-module-scope-vector-trace");
  canvas.style.imageRendering = density < 0.999 ? "pixelated" : "";
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  context.imageSmoothingEnabled = density >= 0.999;
  if ("imageSmoothingQuality" in context && density >= 0.999) {
    context.imageSmoothingQuality = "high";
  }
  const bg = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  const stereoBuffers = nodeGraphModuleUsesStereoTraceDisplay(slot?.type)
    ? nodeGraphStereoTraceBuffers(slot.nodeId, slot.type)
    : null;
  return nodeGraphWaterfallPaint({
    item,
    slot,
    buffer,
    canvas,
    context,
    settings,
    bg,
    stereoBuffers,
    density,
  });
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

function nodeGraphScope2dSkipDiscontinuitiesEnabled(settings) {
  return typeof nodeGraphDisplaySettingsToggleIsOn === "function"
    ? nodeGraphDisplaySettingsToggleIsOn(settings?.skipDiscontinuities)
    : settings?.skipDiscontinuities === true;
}

function nodeGraphScope2dAdjacentSampleIsDiscontinuity(buffer, indexA, indexB, threshold) {
  const t = Number.isFinite(Number(threshold))
    ? Number(threshold)
    : (typeof nodeGraphModuleScopeDiscontinuityThreshold === "number"
      ? nodeGraphModuleScopeDiscontinuityThreshold
      : 0.85);
  const ax = Number(buffer?.x?.[indexA]);
  const ay = Number(buffer?.y?.[indexA]);
  const bx = Number(buffer?.x?.[indexB]);
  const by = Number(buffer?.y?.[indexB]);
  if (![ax, ay, bx, by].every(Number.isFinite)) {
    return true;
  }
  return Math.abs(bx - ax) > t || Math.abs(by - ay) > t;
}

function nodeGraphScope2dRangeHasDiscontinuity(buffer, fromIndex, toIndex, threshold) {
  const from = Math.floor(Number(fromIndex) || 0);
  const to = Math.floor(Number(toIndex) || 0);
  if (!(to > from)) {
    return false;
  }
  for (let i = from; i < to; i += 1) {
    if (nodeGraphScope2dAdjacentSampleIsDiscontinuity(buffer, i, i + 1, threshold)) {
      return true;
    }
  }
  return false;
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
  if (!previousPoint || !firstPoint || nodeGraphScope2dPointDistance(previousPoint, firstPoint) > maxDistancePx) {
    return pathPoints;
  }
  // One bridge sample only when the gap is tiny (continuous motion). Phosphor
  // stamps sample hits — never chord-fill long jumps with intermediate dots or
  // beam segments (that drew sporadic lines across the face).
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
  const skipDisc = nodeGraphScope2dSkipDiscontinuitiesEnabled(settings);
  let prevIndex = -1;
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index])) {
      breakNodeGraphScope2dPath(pathPoints);
      prevIndex = -1;
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
      prevIndex = -1;
      continue;
    }
    if (skipDisc && prevIndex >= 0 && nodeGraphScope2dRangeHasDiscontinuity(buffer, prevIndex, index)) {
      breakNodeGraphScope2dPath(pathPoints);
    }
    pathPoints.push(point);
    prevIndex = index;
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
    safeSettings.burn,
    safeSettings.dot1Enabled ? 1 : 0,
    safeSettings.dot1Size,
    safeSettings.dot1Brightness,
    safeSettings.dot1Color,
    safeSettings.lineThickness,
    Number.isFinite(Number(safeSettings.pixelDensity)) ? Number(safeSettings.pixelDensity) : 1,
    // Packing toggles (Full Dot Economy | Dots only) — must bust face cache.
    safeSettings.fullDotEconomy ? 1 : 0,
    safeSettings.dotsOnly ? 1 : 0,
    safeSettings.skipDiscontinuities ? 1 : 0,
    Math.round(Number(safeSettings.dotBudget) || 2048),
  ].join("|");
}

function nodeGraphScope2dDrawStartIndex(state, buffer, count) {
  const startFrame = Number(buffer?.nodeGraphScopeStartFrame);
  const endFrame = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  const lastFrame = Number(state?._nodeGraphScope2dLastDrawnFrame);
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (
    !Number.isFinite(startFrame) ||
    !Number.isFinite(endFrame) ||
    !Number.isFinite(lastFrame) ||
    endFrame <= startFrame
  ) {
    return 0;
  }
  // Buffer rewound (clear / stop / ring restart) — never leave lastFrame ahead.
  if (lastFrame > endFrame) {
    if (state && typeof state === "object") {
      state._nodeGraphScope2dLastDrawnFrame = endFrame;
    }
    return 0;
  }
  if (lastFrame >= endFrame) {
    return safeCount;
  }
  if (lastFrame <= startFrame) {
    return 0;
  }
  const frameOffset = Math.max(0, Math.floor(lastFrame - startFrame) - 1);
  return Math.min(Math.max(0, safeCount - 1), frameOffset);
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
  const skipDisc = nodeGraphScope2dSkipDiscontinuitiesEnabled(options.settings);
  let previousPoint = null;
  const start = Math.max(0, Math.floor(Number(startIndex) || 0));
  const indexList = Array.isArray(options.indices) ? options.indices : null;
  const visitCount = indexList ? indexList.length : Math.max(0, count - start);
  for (let n = 0; n < visitCount; n += 1) {
    const index = indexList ? Math.floor(Number(indexList[n])) : start + n;
    if (!Number.isFinite(index) || index < 0 || index >= count) {
      continue;
    }
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
    if (skipDisc && index > start && nodeGraphScope2dAdjacentSampleIsDiscontinuity(buffer, index - 1, index)) {
      breakNodeGraphScope2dPath(pathPoints);
      previousPoint = null;
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
