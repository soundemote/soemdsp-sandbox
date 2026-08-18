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
 * diameter = size * faceMinSide, radius = half. Size 0 → 1px diameter (0.5 radius).
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
  return Math.max(0.5, side * t * 0.5);
}

/** Size 0–1 → diameter/line-width px (linear: size * face min side; min 1px). */
function nodeGraphScopeSize01ToDiameterPx(faceMinSide, size01) {
  if (typeof PhosphorDrawer !== "undefined" && typeof PhosphorDrawer.size01ToDiameterPx === "function") {
    return PhosphorDrawer.size01ToDiameterPx(faceMinSide, size01);
  }
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.diameterPx === "function") {
    return TraceStroke.diameterPx(faceMinSide, size01);
  }
  const side = Math.max(1, Number(faceMinSide) || 1);
  const t = clampNodeSliderValue(Number(size01), 0, 1);
  return Math.max(1, side * t);
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
      width,
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
  const first = Math.max(0, Math.floor(view.start));
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
  const face = Math.min(canvas.width, canvas.height);
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
  context.lineCap = "round";
  context.lineJoin = "round";
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
  let left = nodeGraphModuleScopeState.buffers.get(`${id}:${ports.left}`);
  let right = nodeGraphModuleScopeState.buffers.get(`${id}:${ports.right}`);
  if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
    if (!left?.length) {
      left = nodeGraphModuleScopeConnectedSourceBuffer(id, ports.left);
    }
    if (!right?.length) {
      right = nodeGraphModuleScopeConnectedSourceBuffer(id, ports.right);
    }
  }
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

/**
 * Paint Output / Trace face plate from Display Settings when there is no live
 * capture yet (or audio is silent). Applies --node-scope-background so color
 * changes are visible without waiting for scope samples.
 */
const NODE_GRAPH_OUTPUT_PROTECT_BANNER = "♨️";

function nodeGraphOutputProtectFaceSlot(slot) {
  const type = String(slot?.type || "");
  return type === "output" || type === "pluginOutput";
}

function paintNodeGraphOutputProtectBanner(context, canvas, settings = {}, options = {}) {
  const mute = Math.max(0, Math.min(1, Number(options.mute ?? globalThis.nodeGraphOutputProtectMute) || 0));
  if (!(mute > 0.001) || !context || !(canvas?.width > 0) || !(canvas?.height > 0)) {
    return false;
  }
  void settings;
  const text = NODE_GRAPH_OUTPUT_PROTECT_BANNER;
  const pad = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.06));
  const maxSide = Math.max(8, Math.min(canvas.width, canvas.height) - pad * 2);
  const fontFamily = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  const density = Number(options.density);
  let lo = 8;
  let hi = Math.max(lo, maxSide);
  let best = lo;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) * 0.5;
    context.font = `${mid}px ${fontFamily}`;
    const metrics = context.measureText(text);
    const w = metrics.width;
    const h = (Number(metrics.actualBoundingBoxAscent) || mid * 0.85)
      + (Number(metrics.actualBoundingBoxDescent) || mid * 0.2);
    if (w <= maxSide && h <= maxSide) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  context.font = `${best}px ${fontFamily}`;
  context.imageSmoothingEnabled = !(density < 0.999);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = mute;
  context.fillText(text, canvas.width * 0.5, canvas.height * 0.5);
  context.restore();
  return true;
}

function paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, slot, settings, density) {
  if (!nodeGraphOutputProtectFaceSlot(slot)) {
    return false;
  }
  return paintNodeGraphOutputProtectBanner(context, canvas, settings, { density });
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
  // Frozen + already-backed face: CSS plate only. fillRect here is what
  // made pause+drag look like the capture buffer had been cleared.
  if (frozen && !force && canvas.width > 1 && canvas.height > 1) {
    const holdBg = typeof nodeGraphFacePlateBackground === "function"
      ? nodeGraphFacePlateBackground(settings)
      : "#000000";
    if (typeof nodeGraphFacePlateApplyCss === "function") {
      nodeGraphFacePlateApplyCss(screenElement, holdBg);
    }
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
  paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, slot, settings, density);
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

function nodeGraphTraceDisplayLookSignature(settings, canvas, stereo) {
  return [
    canvas?.width || 0,
    canvas?.height || 0,
    settings?.historySeconds ?? settings?.zoomSeconds,
    settings?.scale,
    settings?.dot1Size,
    settings?.lineThickness,
    settings?.dot1Brightness ?? settings?.brightness,
    settings?.color || settings?.dot1Color,
    settings?.secondarySize,
    settings?.secondaryLineThickness,
    settings?.secondaryBrightness,
    settings?.secondaryColor,
    settings?.stereoBlend,
    settings?.pixelDensity,
    settings?.background,
    settings?.dotBudget,
    stereo ? 1 : 0,
  ].join("|");
}

function nodeGraphTraceDisplayShiftFace(context, canvas, shift, bg) {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const n = Math.max(0, Math.floor(Number(shift) || 0));
  if (n <= 0) {
    return;
  }
  if (n >= w) {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = bg || "#000000";
    context.fillRect(0, 0, w, h);
    context.restore();
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  context.globalCompositeOperation = "copy";
  context.drawImage(canvas, -n, 0);
  context.globalCompositeOperation = "source-over";
  context.fillStyle = bg || "#000000";
  context.fillRect(w - n, 0, n, h);
  context.restore();
}

function nodeGraphTraceDisplayArmScroll(canvas, settings, leftBuffer, rightBuffer) {
  if (!canvas) {
    return;
  }
  let cursor = nodeGraphTraceDisplayBufferCursor(leftBuffer);
  if (rightBuffer) {
    const rightCursor = nodeGraphTraceDisplayBufferCursor(rightBuffer);
    if (Number.isFinite(rightCursor)) {
      cursor = Number.isFinite(cursor) ? Math.max(cursor, rightCursor) : rightCursor;
    }
  }
  if (!Number.isFinite(cursor)) {
    const recent = Math.max(
      0,
      Math.floor(Number(leftBuffer?.nodeGraphScopeRecentSampleCount) || 0),
    );
    cursor = recent;
  }
  const st = canvas._traceScroll || (canvas._traceScroll = {});
  st.sig = nodeGraphTraceDisplayLookSignature(settings, canvas, Boolean(rightBuffer));
  st.lastAbs = cursor;
  st.debtPx = 0;
}

function nodeGraphTraceDisplayTailView(buffer, settings, tailSamples, slot = null) {
  const len = Math.max(0, buffer?.length || 0);
  const count = Math.max(2, Math.min(len, Math.ceil(Number(tailSamples) || 2)));
  const ampScale = Number(settings?.scale);
  const scale = Number.isFinite(ampScale) && ampScale > 0
    ? clampNodeSliderValue(ampScale, 0.01, 100)
    : 1;
  if (slot?.type === "lookaheadLimiter") {
    return {
      start: Math.max(0, len - count),
      end: len,
      gain: scale * 2,
      offset: -scale,
    };
  }
  return {
    start: Math.max(0, len - count),
    end: len,
    gain: scale,
    offset: 0,
  };
}

/**
 * Freerun Instant Trace: scroll retained pixels, stroke only the new strip.
 * Returns false when the caller must remesh the whole window.
 */
function nodeGraphTraceDisplayTryScrollPaint(spec) {
  const {
    item,
    slot,
    buffer,
    canvas,
    context,
    settings,
    bg,
    stereoBuffers,
    density,
  } = spec || {};
  if (!canvas || !context || !settings) {
    return false;
  }
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const leftBuffer = stereoBuffers
    ? (typeof prepareNodeGraphTraceDisplayBuffer === "function"
      ? prepareNodeGraphTraceDisplayBuffer(stereoBuffers.left, settings)
      : stereoBuffers.left)
    : (typeof prepareNodeGraphTraceDisplayBuffer === "function"
      ? prepareNodeGraphTraceDisplayBuffer(buffer, settings)
      : buffer);
  const rightBuffer = stereoBuffers
    ? (typeof prepareNodeGraphTraceDisplayBuffer === "function"
      ? prepareNodeGraphTraceDisplayBuffer(stereoBuffers.right, settings)
      : stereoBuffers.right)
    : null;
  const liveBuffer = leftBuffer || buffer;
  if (!liveBuffer?.length) {
    return false;
  }
  let cursor = nodeGraphTraceDisplayBufferCursor(liveBuffer);
  if (rightBuffer) {
    const rightCursor = nodeGraphTraceDisplayBufferCursor(rightBuffer);
    if (Number.isFinite(rightCursor)) {
      cursor = Number.isFinite(cursor) ? Math.max(cursor, rightCursor) : rightCursor;
    }
  }
  if (!Number.isFinite(cursor)) {
    const recent = Math.max(
      0,
      Math.floor(Number(liveBuffer.nodeGraphScopeRecentSampleCount) || 0),
    );
    if (!(recent > 0)) {
      return false;
    }
    cursor = (Number(canvas._traceScroll?.lastAbs) || 0) + recent;
  }
  const sig = nodeGraphTraceDisplayLookSignature(settings, canvas, Boolean(stereoBuffers));
  const st = canvas._traceScroll || (canvas._traceScroll = {
    lastAbs: Number.NaN,
    debtPx: 0,
    sig: "",
  });
  if (st.sig !== sig || !Number.isFinite(st.lastAbs) || cursor < st.lastAbs) {
    return false;
  }
  const rate = Math.max(1, Number(typeof nodeGraphScopeSampleRate === "function"
    ? nodeGraphScopeSampleRate(liveBuffer)
    : 44100) || 44100);
  const hist = Math.max(
    1e-4,
    Number(settings.historySeconds ?? settings.zoomSeconds) || 0.05,
  );
  const spp = (hist * rate) / width;
  if (!(spp > 0) || !Number.isFinite(spp)) {
    return false;
  }
  const delta = Math.max(0, cursor - st.lastAbs);
  st.debtPx = Math.max(0, Number(st.debtPx) || 0) + delta / spp;
  st.lastAbs = cursor;
  const shift = Math.floor(st.debtPx);
  if (shift < 1) {
    rememberNodeGraphTraceDisplaySignature(slot, item, liveBuffer, settings);
    return true;
  }
  st.debtPx -= shift;
  if (shift >= width) {
    return false;
  }
  nodeGraphTraceDisplayShiftFace(context, canvas, shift, bg);
  const tailSamples = Math.max(2, Math.ceil(shift * spp) + 1);
  const strip = {
    x: width - shift,
    y: 0,
    width: shift,
    height,
  };
  const face = Math.min(width, height);
  const fade = 0;
  const budget = Math.max(8, Math.round(Number(settings.dotBudget) || 2048));
  let painted = 0;
  if (stereoBuffers && leftBuffer && rightBuffer) {
    const leftView = nodeGraphTraceDisplayTailView(leftBuffer, settings, tailSamples, slot);
    const rightView = nodeGraphTraceDisplayTailView(rightBuffer, settings, tailSamples, slot);
    const leftPoints = buildNodeGraphTraceDisplayCanvasPoints(
      leftBuffer,
      canvas,
      slot,
      leftView,
      strip,
      { skipPixelLock: true },
    );
    const rightPoints = buildNodeGraphTraceDisplayCanvasPoints(
      rightBuffer,
      canvas,
      slot,
      rightView,
      strip,
      { skipPixelLock: true },
    );
    const leftColor = settings.color || settings.dot1Color || "#ff0000";
    const rightColor = settings.secondaryColor || "#0000ff";
    const leftSize = Number.isFinite(Number(settings.dot1Size))
      ? Number(settings.dot1Size)
      : 0.035;
    const rightSize = Number.isFinite(Number(settings.secondarySize))
      ? Number(settings.secondarySize)
      : leftSize;
    const leftBlur = Number.isFinite(Number(settings.lineThickness))
      ? Number(settings.lineThickness)
      : 0;
    const rightBlur = Number.isFinite(Number(settings.secondaryLineThickness))
      ? Number(settings.secondaryLineThickness)
      : leftBlur;
    const leftBright = Number.isFinite(Number(settings.dot1Brightness ?? settings.brightness))
      ? Number(settings.dot1Brightness ?? settings.brightness)
      : 1;
    const rightBright = Number.isFinite(Number(settings.secondaryBrightness))
      ? Number(settings.secondaryBrightness)
      : leftBright;
    const blend = settings.stereoBlend || "combine";
    // Do not Meet/getImageData the whole face for a few new pixels.
    const stripBlend = blend === "combine" ? "lighter" : blend;
    if (settings.secondaryEnabled !== false) {
      drawNodeGraphTraceDisplayCanvasLayer(context, rightPoints, {
        enabled: true,
        size: rightSize,
        brightness: rightBright,
        blur: rightBlur,
        fade,
        color: rightColor,
        dotBudget: budget,
      }, canvas, { blend: stripBlend });
    }
    if (settings.dot1Enabled !== false) {
      drawNodeGraphTraceDisplayCanvasLayer(context, leftPoints, {
        enabled: true,
        size: leftSize,
        brightness: leftBright,
        blur: leftBlur,
        fade,
        color: leftColor,
        dotBudget: budget,
      }, canvas, { blend: stripBlend });
    }
    painted = leftPoints.length + rightPoints.length;
  } else {
    const view = nodeGraphTraceDisplayTailView(liveBuffer, settings, tailSamples, slot);
    const points = buildNodeGraphTraceDisplayCanvasPoints(
      liveBuffer,
      canvas,
      slot,
      view,
      strip,
      { skipPixelLock: true },
    );
    const monoColor = settings.color || settings.dot1Color || "#ff3333";
    const monoSize = Number.isFinite(Number(settings.dot1Size))
      ? Number(settings.dot1Size)
      : 0.035;
    drawNodeGraphTraceDisplayCanvasLayer(context, points, {
      enabled: settings.dot1Enabled !== false,
      size: monoSize,
      brightness: Number.isFinite(Number(settings.dot1Brightness ?? settings.brightness))
        ? Number(settings.dot1Brightness ?? settings.brightness)
        : 1,
      blur: Number.isFinite(Number(settings.lineThickness)) ? Number(settings.lineThickness) : 0,
      fade,
      color: monoColor,
      dotBudget: budget,
    }, canvas);
    painted = points.length;
  }
  recordNodeGraphModuleScopeRenderMetrics(painted, painted);
  paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, slot, settings, density);
  rememberNodeGraphTraceDisplaySignature(slot, item, liveBuffer, settings);
  return true;
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
  // Pause freeze: hold face pixels (same as phosphor). A force-draw after
  // Clear-while-paused must NOT re-stroke the capture buffer onto a wiped plate.
  if (typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen()) {
    return true;
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
  const syncChannel = typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(settings)
    : "off";
  // Freerun Instant Trace: scroll the face bitmap and stroke only the new
  // strip. High History used to remesh the whole window every frame (1 FPS).
  // Sync still remeshes so the trigger lock can jump.
  if (syncChannel === "off"
    && nodeGraphTraceDisplayTryScrollPaint({
      item,
      slot,
      buffer,
      canvas,
      context,
      settings,
      bg,
      stereoBuffers,
      density,
    })) {
    return true;
  }
  if (stereoBuffers) {
    const leftBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.left, settings);
    const rightBuffer = prepareNodeGraphTraceDisplayBuffer(stereoBuffers.right, settings);
    const views = nodeGraphTraceDisplayStereoBufferViews(leftBuffer, rightBuffer, slot);
    const leftPoints = buildNodeGraphTraceDisplayCanvasPoints(leftBuffer, canvas, slot, views.left);
    const rightPoints = buildNodeGraphTraceDisplayCanvasPoints(rightBuffer, canvas, slot, views.right);
    // Form stores Left as dot1Color (also mirrored to color) and Right as secondaryColor.
    const leftColor = settings.color || settings.dot1Color || "#ff0000";
    const rightColor = settings.secondaryColor || "#0000ff";
    const leftSize = Number.isFinite(Number(settings.dot1Size))
      ? Number(settings.dot1Size)
      : (Number(settings.size) || 0.035);
    const rightSize = Number.isFinite(Number(settings.secondarySize))
      ? Number(settings.secondarySize)
      : leftSize;
    const leftBlur = Number.isFinite(Number(settings.lineThickness))
      ? Number(settings.lineThickness)
      : 0;
    const rightBlur = Number.isFinite(Number(settings.secondaryLineThickness))
      ? Number(settings.secondaryLineThickness)
      : leftBlur;
    const budget = Math.max(8, Math.round(Number(settings.dotBudget) || 2048));
    // Lengthwise Fade is 2D Instant Trace only.
    const fade = 0;
    const leftBright = Number.isFinite(Number(settings.dot1Brightness ?? settings.brightness))
      ? Number(settings.dot1Brightness ?? settings.brightness)
      : 1;
    const rightBright = Number.isFinite(Number(settings.secondaryBrightness))
      ? Number(settings.secondaryBrightness)
      : leftBright;
    const leftLayer = {
      enabled: settings.dot1Enabled !== false,
      size: leftSize,
      brightness: leftBright,
      blur: leftBlur,
      fade,
      color: leftColor,
      dotBudget: budget,
    };
    const rightLayer = {
      enabled: settings.secondaryEnabled !== false,
      size: rightSize,
      brightness: rightBright,
      blur: rightBlur,
      fade,
      color: rightColor,
      dotBudget: budget,
    };
    context.clearRect(0, 0, canvas.width, canvas.height);
    const face = Math.min(canvas.width, canvas.height);
    let painted = 0;
    const blend = settings.stereoBlend || "combine";
    if (blend !== "combine") {
      // Canvas composites: plate first, then strokes.
      fillTraceBackground();
    }
    if (typeof TraceHistoryDraw !== "undefined" && typeof TraceHistoryDraw.strokeStereo === "function") {
      painted = TraceHistoryDraw.strokeStereo(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: leftBlur,
          brightness: leftBright,
          fade,
          color: leftColor,
          faceMinSide: face,
          dotBudget: budget,
        },
        {
          size: rightLayer.size,
          blur: rightBlur,
          brightness: rightBright,
          fade,
          color: rightColor,
          faceMinSide: face,
          dotBudget: budget,
        },
        { blend, meetColor: "auto" },
      );
    } else if (typeof TraceStroke !== "undefined" && TraceStroke.drawStereo) {
      painted = TraceStroke.drawStereo(
        context,
        leftLayer.enabled === false ? [] : leftPoints,
        rightLayer.enabled === false ? [] : rightPoints,
        {
          size: leftLayer.size,
          blur: leftBlur,
          brightness: leftBright,
          fade,
          color: leftColor,
          faceMinSide: face,
        },
        {
          size: rightLayer.size,
          blur: rightBlur,
          brightness: rightBright,
          fade,
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
    } else {
      fillTraceBackground();
      drawNodeGraphTraceDisplayCanvasLayer(context, rightPoints, rightLayer, canvas, { blend });
      drawNodeGraphTraceDisplayCanvasLayer(context, leftPoints, leftLayer, canvas, { blend });
      painted = leftPoints.length + rightPoints.length;
    }
    // Meet putImageData leaves transparent holes — plate goes underneath.
    if (blend === "combine") {
      paintBackgroundUnder();
    }
    recordNodeGraphModuleScopeRenderMetrics(painted, painted);
    paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, slot, settings, density);
    rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
    nodeGraphTraceDisplayArmScroll(canvas, settings, leftBuffer || stereoBuffers?.left, rightBuffer);
    return true;
  }
  // Mono 1D Trace = VECTOR polyline (not a pixel strip / energy grid).
  const prepared = prepareNodeGraphTraceDisplayBuffer(buffer, settings);
  fillTraceBackground();
  const points = buildNodeGraphTraceDisplayCanvasPoints(prepared || buffer, canvas, slot);
  const monoColor = settings.color || settings.dot1Color || "#ff3333";
  const monoSize = Number.isFinite(Number(settings.dot1Size))
    ? Number(settings.dot1Size)
    : 0.035;
  const layer = {
    enabled: settings.dot1Enabled !== false,
    size: monoSize,
    brightness: Number.isFinite(Number(settings.dot1Brightness ?? settings.brightness))
      ? Number(settings.dot1Brightness ?? settings.brightness)
      : 1,
    blur: Number.isFinite(Number(settings.lineThickness)) ? Number(settings.lineThickness) : 0,
    fade: 0,
    color: monoColor,
    dotBudget: Math.max(8, Math.round(Number(settings.dotBudget) || 2048)),
  };
  drawNodeGraphTraceDisplayCanvasLayer(context, points, layer, canvas);
  recordNodeGraphModuleScopeRenderMetrics(points.length, points.length);
  paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, slot, settings, density);
  rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings);
  nodeGraphTraceDisplayArmScroll(canvas, settings, prepared || buffer, null);
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
