// Basic scope/trace/value draw helpers from scopes.js (Phase D paint peel).
// Load before scopes.js.

function drawNodeGraphModuleScopeBufferWebGl(renderer, rect, buffer, pixelRatio, slot, options = {}) {
  const { canvas, gl } = renderer;
  const visibleRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const clipRect = nodeGraphModuleScopeClippedPixelRect(canvas, visibleRect, pixelRatio);
  if (!clipRect) {
    return;
  }
  if (buffer?.nodeGraphScopeSpectrum) {
    drawNodeGraphModuleScopeSpectrumBarsWebGl(renderer, rect, buffer, pixelRatio, options);
    return;
  }
  const traceThicknessPx = Math.max(1, Number(options.thicknessPx) || 1);
  const fixedDotSizeRatio = Number(buffer?.nodeGraphScopeFixedDotSizeRatio);
  const fixedDotSizePx = Number.isFinite(fixedDotSizeRatio) && fixedDotSizeRatio > 0
    ? Math.max(1, Math.min(visibleRect.width, visibleRect.height) * clampNodeSliderValue(fixedDotSizeRatio, 0.01, 1))
    : 0;
  const requestedDotSizeScale = Number(options.dotSizeScale);
  const dotSizeScale = Number.isFinite(requestedDotSizeScale) && requestedDotSizeScale > 0
    ? requestedDotSizeScale
    : nodeGraphModuleScopeDotSizeScale();
  const dotThicknessPx = Math.max(
    1,
    fixedDotSizePx || (traceThicknessPx * dotSizeScale),
  );
  const safeDotThicknessPx = Math.min(512, dotThicknessPx * pixelRatio);
  if (nodeGraphModuleDisplayRendererForSlot(slot) === "trace" && !buffer?.nodeGraphScopeXy && !buffer?.nodeGraphScopeSpectrum) {
    const traceGeometry = buildNodeGraphTraceDisplayVertices(buffer, rect, canvas, pixelRatio, slot, options);
    if (!traceGeometry) {
      return;
    }
    recordNodeGraphModuleScopeRenderMetrics(traceGeometry.pointCount, traceGeometry.vertexCount);
    if (options.traceTiming) {
      options.traceTiming.passes += 1;
      options.traceTiming.points += traceGeometry.pointCount;
      options.traceTiming.vertices += traceGeometry.vertexCount;
    }
    gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
    gl.useProgram(renderer.beamProgram);
    gl.uniform2f(renderer.beamCanvasSizeLocation, canvas.width, canvas.height);
    gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(Number(options.blur) || 0, 0, 1));
    gl.uniform1f(renderer.beamSizeLocation, safeDotThicknessPx);
    const intensity = Number(options.intensity);
    gl.uniform1f(renderer.beamIntensityLocation, Number.isFinite(intensity) ? Math.max(0, intensity) : 0.1);
    const color = Array.isArray(options.color) ? options.color : [0.7, 1, 0.9];
    gl.uniform3f(renderer.beamColorLocation, color[0], color[1], color[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
    const glBufferDataStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
    gl.bufferData(
      gl.ARRAY_BUFFER,
      traceGeometry.vertices.subarray(0, traceGeometry.vertexFloatCount),
      gl.STREAM_DRAW,
    );
    if (options.traceTiming) {
      options.traceTiming.glBufferDataMs += Math.max(0, nodeGraphModuleScopeNowMs() - glBufferDataStartMs);
    }
    gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(renderer.beamStartLocation);
    gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(renderer.beamEndLocation);
    gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16);
    gl.enableVertexAttribArray(renderer.beamCornerLocation);
    gl.vertexAttribPointer(renderer.beamPointAgeLocation, 1, gl.FLOAT, false, 24, 20);
    gl.enableVertexAttribArray(renderer.beamPointAgeLocation);
    const drawArraysStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
    gl.drawArrays(gl.TRIANGLES, 0, traceGeometry.vertexCount);
    if (options.traceTiming) {
      options.traceTiming.drawArraysMs += Math.max(0, nodeGraphModuleScopeNowMs() - drawArraysStartMs);
    }
    return;
  }
  const vertices = [];
  let pointCount = 0;
  const xyPoints = nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot);
  if (xyPoints.length >= 4) {
    pointCount += xyPoints.length / 2;
    const vertexStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
    appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices(xyPoints, canvas));
    if (options.traceTiming) {
      options.traceTiming.vertexGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - vertexStartMs);
    }
  } else {
    for (const [start, end] of nodeGraphModuleScopeBufferProgressRanges(buffer)) {
      const points = nodeGraphModuleScopeBufferSegmentPoints(
        buffer,
        rect,
        canvas,
        pixelRatio,
        slot,
        start,
        end,
        options,
      );
      if (points.length >= 4) {
        pointCount += points.length / 2;
        const vertexStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
        appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices(points, canvas));
        if (options.traceTiming) {
          options.traceTiming.vertexGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - vertexStartMs);
        }
      }
    }
  }
  if (vertices.length < 36) {
    return;
  }
  if (options.traceTiming) {
    options.traceTiming.passes += 1;
    options.traceTiming.points += pointCount;
    options.traceTiming.vertices += vertices.length / 6;
  }
  recordNodeGraphModuleScopeRenderMetrics(pointCount, vertices.length / 6);
  gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
  gl.useProgram(renderer.beamProgram);
  gl.uniform2f(renderer.beamCanvasSizeLocation, canvas.width, canvas.height);
  gl.uniform1f(renderer.beamBlurLocation, 1);
  gl.uniform1f(renderer.beamSizeLocation, safeDotThicknessPx);
  const intensity = Number(options.intensity);
  gl.uniform1f(renderer.beamIntensityLocation, Number.isFinite(intensity) ? Math.max(0, intensity) : 0.1);
  const color = Array.isArray(options.color) ? options.color : [0.7, 1, 0.9];
  gl.uniform3f(renderer.beamColorLocation, color[0], color[1], color[2]);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  const glBufferDataStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  if (options.traceTiming) {
    options.traceTiming.glBufferDataMs += Math.max(0, nodeGraphModuleScopeNowMs() - glBufferDataStartMs);
  }
  gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(renderer.beamStartLocation);
  gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(renderer.beamEndLocation);
  gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16);
  gl.enableVertexAttribArray(renderer.beamCornerLocation);
  gl.vertexAttribPointer(renderer.beamPointAgeLocation, 1, gl.FLOAT, false, 24, 20);
  gl.enableVertexAttribArray(renderer.beamPointAgeLocation);
  const drawArraysStartMs = options.traceTiming ? nodeGraphModuleScopeNowMs() : 0;
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  if (options.traceTiming) {
    options.traceTiming.drawArraysMs += Math.max(0, nodeGraphModuleScopeNowMs() - drawArraysStartMs);
  }
}


function drawNodeGraphModuleScopeSpectrumBarsWebGl(renderer, rect, buffer, pixelRatio, options = {}) {
  const { canvas, gl } = renderer;
  const visibleRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const clipRect = nodeGraphModuleScopeClippedPixelRect(canvas, visibleRect, pixelRatio);
  if (!clipRect) {
    return;
  }
  const vertices = nodeGraphModuleScopeSpectrumBarVertices(buffer, {
    height: rect.height * pixelRatio,
    left: rect.left * pixelRatio,
    top: rect.top * pixelRatio,
    width: rect.width * pixelRatio,
  }, canvas, options);
  if (vertices.length < 6) {
    return;
  }
  recordNodeGraphModuleScopeRenderMetrics(vertices.length / 12, vertices.length / 2);
  gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
  gl.useProgram(renderer.colorProgram);
  const color = Array.isArray(options.color) ? options.color : [0.7, 1, 0.9];
  const intensity = clampNodeSliderValue(Number(options.intensity) || 0.1, 0, 4);
  gl.uniform4f(
    renderer.colorLocation,
    color[0] * intensity,
    color[1] * intensity,
    color[2] * intensity,
    intensity,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colorPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  gl.vertexAttribPointer(renderer.colorPositionLocation, 2, gl.FLOAT, false, 8, 0);
  gl.enableVertexAttribArray(renderer.colorPositionLocation);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
}


function drawNodeGraphModuleScopeLightShape(context, shape, centerX, centerY, radius) {
  context.beginPath();
  if (shape === "square") {
    context.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else if (shape === "diamond") {
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX + radius, centerY);
    context.lineTo(centerX, centerY + radius);
    context.lineTo(centerX - radius, centerY);
    context.closePath();
  } else {
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  }
}


function drawNodeGraphModuleScopeCanvasDotPath(context, points, proxyCanvas, pixelRatio, heatmapMode = false, slot = null) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, proxyCanvas);
  if (pixelPoints.length < 4) {
    return false;
  }
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const strokeUnit = Math.max(1, lineThickness * Math.max(1, pixelRatio));
  const rawValues = Array.isArray(points?.nodeGraphScopeRawValues)
    ? points.nodeGraphScopeRawValues
    : null;
  const skippedPoints = Array.isArray(points?.nodeGraphScopeSkippedPoints)
    ? points.nodeGraphScopeSkippedPoints
    : null;
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForPoints(points);
  const colors = heatmapMode ? nodeGraphModuleScopeHeatmapTraceColors() : nodeGraphModuleScopeDotStyle(slot, null);
  const coreBrightness = heatmapMode
    ? (nodeGraphMvp?.moduleScopeDotCore1Enabled === false ? 0 : 1)
    : colors.coreBrightness / nodeGraphModuleScopeDefaultDotCores.dot1.brightness;
  let segmentCount = 0;

  context.save();
  context.globalCompositeOperation = "lighter";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const drawConnectedStroke = (lineWidth, _shadowBlurIgnored, rgb, alpha) => {
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = lineWidth;
    // No ad-hoc canvas shadow glow — brightness is stroke alpha only.
    context.shadowBlur = 0;
    context.strokeStyle = nodeGraphModuleScopeCanvasRgba(rgb, alpha);
    let pathOpen = false;
    let localSkipThroughSegment = -1;
    for (let index = 0; index + 3 < pixelPoints.length; index += 2) {
      const segmentIndex = index / 2;
      if (skippedPoints?.[segmentIndex] || skippedPoints?.[segmentIndex + 1]) {
        pathOpen = false;
        continue;
      }
      if (skipSamples > 0 && rawValues && segmentIndex + 1 < rawValues.length) {
        const previousRaw = Number(rawValues[segmentIndex]);
        const currentRaw = Number(rawValues[segmentIndex + 1]);
        if (
          Number.isFinite(previousRaw) &&
          Number.isFinite(currentRaw) &&
          Math.abs(currentRaw - previousRaw) > nodeGraphModuleScopeDiscontinuityThreshold
        ) {
          localSkipThroughSegment = Math.max(localSkipThroughSegment, segmentIndex + skipSamples - 1);
        }
      }
      if (segmentIndex <= localSkipThroughSegment) {
        pathOpen = false;
        continue;
      }
      const x1 = pixelPoints[index];
      const y1 = pixelPoints[index + 1];
      const x2 = pixelPoints[index + 2];
      const y2 = pixelPoints[index + 3];
      if (Math.hypot(x2 - x1, y2 - y1) < 0.001) {
        continue;
      }
      if (!pathOpen) {
        context.moveTo(x1, y1);
        pathOpen = true;
      }
      context.lineTo(x2, y2);
      segmentCount += 1;
    }
    context.stroke();
  };

  if (coreBrightness > 0) {
    drawConnectedStroke(
      strokeUnit * 1.65,
      strokeUnit * 1.25,
      colors.coreColor ?? colors.core,
      (heatmapMode ? 0.5 : 0.76) * coreBrightness,
    );
  }
  context.restore();
  recordNodeGraphModuleScopeRenderMetrics(points.length / 2, segmentCount);
  return segmentCount > 0;
}


function drawNodeGraphModuleScopeLightDisplay(context, rect, buffer, pixelRatio, slot) {
  if (!context || !buffer?.nodeGraphScopeLightDisplay) {
    return;
  }
  const nodeId = String(slot?.nodeId || "");
  const settings = nodeGraphModuleScopeSetting(nodeId);
  const dt = clampNodeSliderValue(Number(nodeGraphModuleScopeState.animationDeltaSeconds) || (1 / 60), 1 / 240, 1 / 15);
  const target = clampNodeSliderValue(Number(buffer.nodeGraphScopeLightTarget) || 0, 0, 1);
  const releaseSeconds = Number(buffer.nodeGraphScopeLightReleaseSeconds);
  const hasRelease = Number.isFinite(releaseSeconds) && releaseSeconds > 0;
  let brightness = target;
  if (hasRelease) {
    const state = nodeGraphModuleScopeState.lightDisplayStates.get(nodeId) || { brightness: 0 };
    if (target >= state.brightness) {
      state.brightness = target;
    } else {
      const coefficient = 1 - Math.exp(-dt / Math.max(0.001, releaseSeconds));
      state.brightness = clampNodeSliderValue(state.brightness + (target - state.brightness) * coefficient, 0, 1);
    }
    nodeGraphModuleScopeState.lightDisplayStates.set(nodeId, state);
    brightness = state.brightness;
  } else if (!buffer.nodeGraphScopeLightInstant) {
    const state = nodeGraphModuleScopeState.lightDisplayStates.get(nodeId) || { brightness: 0 };
    const tau = target > state.brightness ? 0.008 : 0.018;
    const coefficient = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    state.brightness = clampNodeSliderValue(state.brightness + (target - state.brightness) * coefficient, 0, 1);
    nodeGraphModuleScopeState.lightDisplayStates.set(nodeId, state);
    brightness = state.brightness;
  } else {
    nodeGraphModuleScopeState.lightDisplayStates.delete(nodeId);
  }
  if (brightness <= 0.002) {
    return;
  }

  const lightStyle = nodeGraphModuleScopeLightShaderStyle(slot, buffer);
  const centerColor = lightStyle.centerColor;
  const centerRgb = nodeGraphScopeHexColorToRgb(centerColor)
    .map((component) => Math.round(clampNodeSliderValue(component, 0, 1) * 255));
  const core1Size = lightStyle.centerSize;
  const core1Brightness = lightStyle.centerBrightness;
  const core1Blur = lightStyle.centerBlur;
  const availableSize = Math.max(1, Math.min(rect.width, rect.height));
  const centerSizeRatio = clampNodeSliderValue(core1Size, 0, 1);
  const size = Math.max(1, availableSize * centerSizeRatio);
  const centerX = (rect.left + rect.width * 0.5) * pixelRatio;
  const centerY = (rect.top + rect.height * 0.5) * pixelRatio;
  const radius = size * pixelRatio * 0.5;
  const masterBrightness = nodeGraphModuleScopeTraceBrightness(slot, settings);
  const alpha = clampNodeSliderValue(brightness * masterBrightness, 0, 1);
  const frameBrightnessMode = buffer.nodeGraphScopeFrameBrightness === true;
  const shape = ["circle", "square", "diamond"].includes(buffer.nodeGraphScopeLightShape)
    ? buffer.nodeGraphScopeLightShape
    : "circle";
  const centerAlphaScale = Number.isFinite(Number(buffer.nodeGraphScopeLightCenterAlphaScale))
    ? clampNodeSliderValue(Number(buffer.nodeGraphScopeLightCenterAlphaScale), 0, 4)
    : lightStyle.usesShader ? 1 : 0.5;
  const sharedFrameAlphaFactor = frameBrightnessMode ? 1 : null;
  const centerAlphaFactor = sharedFrameAlphaFactor ?? clampNodeSliderValue(core1Brightness * centerAlphaScale, 0, 1);
  const visibleCenterRgb = lightStyle.usesShader
    ? nodeGraphModuleScopeEmissiveShaderRgb(centerRgb, core1Brightness)
    : centerRgb;
  const sprite = nodeGraphModuleScopeLightSpriteTexture({
    centerAlphaFactor,
    centerBlur: core1Blur,
    centerRgb: visibleCenterRgb,
    radius,
    shape,
    usesShader: lightStyle.usesShader,
  });
  if (!sprite) {
    return;
  }

  context.save();
  context.globalCompositeOperation = lightStyle.usesShader ? "source-over" : "lighter";
  context.globalAlpha = alpha;
  context.drawImage(sprite.canvas, centerX - sprite.size * 0.5, centerY - sprite.size * 0.5);
  context.restore();
}


function drawNodeGraphModuleScopeLightDisplays(items, pixelRatio) {
  const canvas = nodeGraphModuleScopeLightCanvas();
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const item of items || []) {
    drawNodeGraphModuleScopeLightDisplay(context, item.scopeRect, item.buffer, pixelRatio, item.slot);
  }
}


function drawNodeGraphTraceDisplayItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  if (!slot || !buffer?.length) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, buffer);
  drawNodeGraphTraceDisplayCanvasItem(item, pixelRatio);
}


function drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y1, x2, y2, options = {}) {
  const { canvas, gl } = renderer;
  const clipRect = nodeGraphModuleScopeClippedPixelRect(
    canvas,
    item.visibleScopeRect || item.scopeRect,
    pixelRatio,
  );
  if (!clipRect) {
    return;
  }
  const vertices = new Float32Array(36);
  appendNodeGraphTraceDisplayBeamSegment(
    vertices,
    0,
    x1 * pixelRatio,
    y1 * pixelRatio,
    x2 * pixelRatio,
    y2 * pixelRatio,
    1,
  );
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(clipRect.left, canvas.height - clipRect.bottom, clipRect.width, clipRect.height);
  gl.useProgram(renderer.beamProgram);
  gl.uniform2f(renderer.beamCanvasSizeLocation, canvas.width, canvas.height);
  gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(Number(options.blur) || 0, 0, 1));
  gl.uniform1f(renderer.beamSizeLocation, Math.max(1, (Number(options.thicknessPx) || 1) * pixelRatio));
  gl.uniform1f(renderer.beamIntensityLocation, Math.max(0, Number(options.intensity) || 0));
  const color = Array.isArray(options.color) ? options.color : [0.45, 0.92, 1];
  gl.uniform3f(renderer.beamColorLocation, color[0], color[1], color[2]);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.beamBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
  gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(renderer.beamStartLocation);
  gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(renderer.beamEndLocation);
  gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16);
  gl.enableVertexAttribArray(renderer.beamCornerLocation);
  gl.vertexAttribPointer(renderer.beamPointAgeLocation, 1, gl.FLOAT, false, 24, 20);
  gl.enableVertexAttribArray(renderer.beamPointAgeLocation);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  recordNodeGraphModuleScopeRenderMetrics(1, 6);
}


function drawNodeGraphDotOscilloscopeItem(renderer, item, pixelRatio) {
  // Phosphor Dot: one efficient soft stamp on the mono energy drawer.
  // Brightness is pre-averaged over the latest capture window (sub-frame /
  // multi-sample intensity), not a single sample snap.
  const buffer = item?.buffer;
  if (!buffer) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  const settings = nodeGraphZeroDBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot));
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    settings.pixelDensity,
  )) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const brightness01 = clampNodeSliderValue(
    Number(settings.bipolarBrightness ? buffer.nodeGraphScopeBipolarLightTarget : buffer.nodeGraphScopeLightTarget) || 0,
    0,
    1,
  );
  const bg = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  const width = canvas.width;
  const height = canvas.height;
  const minSide = Math.max(1, Math.min(width, height));
  const size01 = clampNodeSliderValue(settings.dot1Size, 0, 1);
  const radius = typeof nodeGraphScopeSize01ToRadiusPx === "function"
    ? nodeGraphScopeSize01ToRadiusPx(minSide, size01)
    : (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.size01ToRadiusPx
      ? PhosphorDrawer.size01ToRadiusPx(minSide, size01)
      : Math.max(0.5, Math.pow(minSide, size01) * 0.5));
  const blur = nodeGraphTraceDisplayClampStampBlur(settings.lineThickness);
  const trail = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateTrail
    ? PhosphorResidual.migrateTrail(settings, 0.78)
    : clampNodeSliderValue(Number(settings.trail ?? (Number.isFinite(Number(settings.decay)) ? 1 - Number(settings.decay) : 0.78)), 0, 1);
  const ghost = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateGhost
    ? PhosphorResidual.migrateGhost(settings, 0.4)
    : clampNodeSliderValue(Number(settings.ghost ?? settings.burn) || 0, 0, 1);

  // Opaque face plate (CSS mix-blend is normal; never screen-tint the module chrome).
  canvas.style.mixBlendMode = "normal";
  // Prefer shared energy phosphor path (same stamps as 2D Phosphor).
  const energyGl = typeof nodeGraphPhosphorEnergyGlEnsure === "function"
    ? nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl")
    : null;
  if (energyGl && typeof nodeGraphPhosphorEnergyGlStepBeams === "function") {
    nodeGraphPhosphorApplyGradientLut(energyGl, settings, "#75ebff");
    const deposit = brightness01 > 0.001 && settings.dot1Brightness > 0
      ? (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.depositGain
        ? PhosphorDrawer.depositGain(settings.dot1Brightness * brightness01, size01)
        : settings.dot1Brightness * brightness01 * 0.1)
      : 0;
    const cx = width * 0.5;
    const cy = height * 0.5;
    // Freeze = hold energy FBO: no deposit, no residual step, no bleed. Still present.
    if (!nodeGraphModuleScopePhosphorFrozen()) {
      nodeGraphPhosphorEnergyGlStepBeams(energyGl, {
        trail,
        ghost,
        pathPoints: deposit > 1e-8 ? [{ x: cx, y: cy }] : [],
        radius,
        brightness: deposit,
        blur,
        mode: "dots",
        maxDots: 8,
      });
    }
    const exposure = typeof PhosphorDrawer !== "undefined" && PhosphorDrawer.exposure
      ? PhosphorDrawer.exposure()
      : 2.9;
    nodeGraphFacePlateFillCanvas(context, canvas, bg);
    if (typeof nodeGraphPhosphorEnergyGlPresent === "function"
      && nodeGraphPhosphorEnergyGlPresent(energyGl, 1, { exposure })) {
      context.save();
      context.globalCompositeOperation = "lighter";
      context.imageSmoothingEnabled = true;
      context.drawImage(energyGl.canvas, 0, 0, width, height);
      context.restore();
    }
    recordNodeGraphModuleScopeRenderMetrics(1, 1);
    return;
  }

  // Fallback: instant TraceStroke disc (no persistence).
  nodeGraphFacePlateFillCanvas(context, canvas, bg);
  if (brightness01 > 0.001 && typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    TraceStroke.draw(context, [{ x: width * 0.5, y: height * 0.5 }], {
      size: size01,
      blur,
      brightness: settings.dot1Brightness * brightness01,
      color: settings.dot1Color,
      faceMinSide: minSide,
    });
  }
  recordNodeGraphModuleScopeRenderMetrics(1, 1);
}


function drawNodeGraphValueOscilloscopeCanvasLine(context, points, color, brightness, thickness, blur) {
  if (!context || !points || !(brightness > 0) || !(thickness > 0)) {
    return;
  }
  const rgb = nodeGraphScopeRgbFloatsToCanvasRgb(color);
  const alpha = clampNodeSliderValue(Number(brightness) || 0, 0, 4);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "butt";
  context.lineJoin = "round";
  context.lineWidth = thickness;
  context.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, alpha).toFixed(4)})`;
  // No shadowBlur glow — thickness/blur are stroke geometry only when needed.
  context.shadowBlur = 0;
  context.beginPath();
  context.moveTo(points.x1, points.y1);
  context.lineTo(points.x2, points.y2);
  context.stroke();
  context.restore();
}


function drawNodeGraphValueOscilloscopeTrail(item, pixelRatio, geometry, settings) {
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    settings?.pixelDensity,
  )) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const bg = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings);
  // Ensure plate under fade holes / first frames.
  nodeGraphFacePlateFillUnder(context, canvas, bg);
  if (!geometry) {
    return;
  }
  const screenRect = item?.screenRect;
  if (!screenRect || !(screenRect.width > 0) || !(screenRect.height > 0)) {
    return;
  }
  // Map workspace/screen face coords → buffer pixels. Multiplying by dpr alone
  // is wrong under zoom (screen rect grows, buffer stays layout×dpr).
  const toCanvas = (x, y) => ({
    x: ((x - screenRect.left) / screenRect.width) * canvas.width,
    y: ((y - screenRect.top) / screenRect.height) * canvas.height,
  });
  const samples = nodeGraphValueOscilloscopeTrailSamples(item?.buffer);
  if (!samples.length) {
    return;
  }
  const amp = nodeGraphDisplaySettingsAmplitudeScale(settings);
  const sampleLines = samples.map((sample) => {
    const v = clampNodeSliderValue(sample * amp, -1, 1);
    const y = geometry.squareTop + geometry.squareHeight * 0.5 - v * geometry.squareHeight * 0.44;
    return {
      end: toCanvas(geometry.x2, y),
      start: toCanvas(geometry.x1, y),
    };
  });
  const lineBase = Math.max(1, Math.min(canvas.width, canvas.height));
  const sizeMap = typeof nodeGraphScopeSize01ToDiameterPx === "function"
    ? nodeGraphScopeSize01ToDiameterPx
    : (side, t) => Math.max(1, Math.pow(Math.max(1, side), clampNodeSliderValue(t, 0, 1)));
  const innerThickness = sizeMap(lineBase, settings.dot1Size);
  const capThickness = sizeMap(lineBase, settings.capSize);
  // Brightness only (decay fades residual above).
  const trailIntensity = 0.12 / Math.max(1, Math.sqrt(sampleLines.length));
  if (settings.dot1Enabled !== false) {
    for (const line of sampleLines) {
      drawNodeGraphValueOscilloscopeCanvasLine(
        context,
        { x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y },
        nodeGraphScopeHexColorToRgb(settings.color),
        settings.brightness * trailIntensity,
        innerThickness,
        settings.lineThickness,
      );
    }
  }
  if (settings.capEnabled === false || !(geometry.capLength > 0) || !(capThickness > 0)) {
    return;
  }
  for (const sample of samples) {
    const v = clampNodeSliderValue(sample * amp, -1, 1);
    const y = geometry.squareTop + geometry.squareHeight * 0.5 - v * geometry.squareHeight * 0.44;
    for (const capX of [geometry.x1, geometry.x2]) {
      const capStart = toCanvas(capX, y - geometry.capLength);
      const capEnd = toCanvas(capX, y + geometry.capLength);
      if (settings.dot1Enabled !== false) {
        drawNodeGraphValueOscilloscopeCanvasLine(
          context,
          { x1: capStart.x, y1: capStart.y, x2: capEnd.x, y2: capEnd.y },
          nodeGraphScopeHexColorToRgb(settings.color),
          settings.brightness * trailIntensity,
          capThickness,
          settings.lineThickness,
        );
      }
    }
  }
}


function drawNodeGraphValueOscilloscopeItem(renderer, item, pixelRatio) {
  const rect = item?.scopeRect;
  if (!rect) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(item.slot, item.buffer);
  const node = nodeGraphModuleScopeNodeForSlot(item.slot);
  const settings = nodeGraphTraceDisplaySettingsForNode(node);
  const amp = nodeGraphDisplaySettingsAmplitudeScale(settings);
  const value = clampNodeSliderValue(
    nodeGraphOscilloscopeLatestSample(item?.buffer, 0) * amp,
    -1,
    1,
  );
  const lineLength = clampNodeSliderValue(settings.lineLength, 0, 1);
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const displayLeft = Number(rect.left) || 0;
  const displayWidth = Math.max(1, Number(rect.width) || 1);
  const centerX = displayLeft + displayWidth * 0.5;
  const halfLine = displayWidth * 0.5 * lineLength;
  const x1 = centerX - halfLine;
  const x2 = centerX + halfLine;
  const y = square.top + square.height * 0.5 - value * square.height * 0.44;
  const span = Math.max(1, x2 - x1);
  const lineBase = Math.max(1, Math.min(square.width, square.height));
  const sizeMap = typeof nodeGraphScopeSize01ToDiameterPx === "function"
    ? nodeGraphScopeSize01ToDiameterPx
    : (side, t) => Math.max(1, Math.pow(Math.max(1, side), clampNodeSliderValue(t, 0, 1)));
  const innerThickness = sizeMap(lineBase, settings.dot1Size);
  const capLength = square.height * clampNodeSliderValue(settings.capLength, 0, 1) * 0.5;
  const capThickness = sizeMap(lineBase, settings.capSize);
  drawNodeGraphValueOscilloscopeTrail(item, pixelRatio, {
    capLength,
    squareTop: square.top,
    squareHeight: square.height,
    squareWidth: square.width,
    x1,
    x2,
    y,
  }, settings);
  if (settings.dot1Enabled !== false && settings.brightness > 0 && innerThickness > 0) {
    const options = {
      blur: settings.lineThickness,
      color: nodeGraphScopeHexColorToRgb(settings.color),
      intensity: settings.brightness,
      thicknessPx: innerThickness,
    };
    drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y, x2, y, options);
  }
  if (settings.capEnabled !== false && capLength > 0 && capThickness > 0) {
    if (settings.dot1Enabled !== false && settings.brightness > 0) {
      const options = {
        blur: settings.lineThickness,
        color: nodeGraphScopeHexColorToRgb(settings.color),
        intensity: settings.brightness,
        thicknessPx: capThickness,
      };
      drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y - capLength, x1, y + capLength, options);
      drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x2, y - capLength, x2, y + capLength, options);
    }
  }
}


function drawNodeGraphCustomDisplayItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!node || !screenElement) {
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, item?.buffer || null);
  const canvas = nodeGraphCustomDisplayCanvasForSlot(slot);
  if (!canvas || !syncNodeGraphCustomDisplayCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const displayScript = normalizeNodeGraphCustomDisplay(node.customDisplay);
  const compiled = compiledNodeGraphCustomDisplayFunction(node);
  if (!compiled?.fn) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.fillStyle = "rgba(255, 126, 126, 0.9)";
    context.font = `${Math.max(10, Math.min(18, canvas.height * 0.12))}px var(--node-mono-font, monospace)`;
    context.fillText(compiled?.error || "compile error", 4 * pixelRatio, 16 * pixelRatio);
    context.restore();
    return;
  }
  try {
    compiled.fn({
      buffer: item?.buffer || new Float32Array(0),
      canvas,
      ctx: context,
      frame: nodeGraphModuleScopeState.frames,
      height: canvas.height,
      inputs: nodeGraphCustomDisplayInputApi(node, displayScript, item?.buffer || null),
      node,
      pixelRatio,
      time: (Number(nodeGraphModuleScopeState.frames) || 0) / 60,
      width: canvas.width,
    }, ...nodeGraphPortScriptHelperValues);
  } catch (error) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.fillStyle = "rgba(255, 126, 126, 0.9)";
    context.font = `${Math.max(10, Math.min(18, canvas.height * 0.12))}px var(--node-mono-font, monospace)`;
    context.fillText(error?.message || "runtime error", 4 * pixelRatio, 16 * pixelRatio);
    context.restore();
  }
}


function drawNodeGraphScopeCanvasSmoothPath(context, points) {
  let subpath = [];
  const flushSubpath = () => {
    if (subpath.length < 2) {
      subpath = [];
      return;
    }
    context.moveTo(subpath[0].x, subpath[0].y);
    if (subpath.length === 2) {
      context.lineTo(subpath[1].x, subpath[1].y);
    } else {
      for (let index = 1; index < subpath.length - 1; index += 1) {
        const point = subpath[index];
        const next = subpath[index + 1];
        context.quadraticCurveTo(point.x, point.y, (point.x + next.x) * 0.5, (point.y + next.y) * 0.5);
      }
      const last = subpath[subpath.length - 1];
      context.lineTo(last.x, last.y);
    }
    subpath = [];
  };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      flushSubpath();
      continue;
    }
    subpath.push(point);
  }
  flushSubpath();
}

