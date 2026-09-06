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
  context.imageSmoothingEnabled = false;

  const drawConnectedStroke = (lineWidth, _shadowBlurIgnored, rgb, alpha) => {
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = lineWidth;
    // No ad-hoc canvas shadow glow — brightness is stroke alpha only.
    context.shadowBlur = 0;
    context.strokeStyle = nodeGraphModuleScopeCanvasRgba(rgb, alpha);
    let pathOpen = false;
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
          pathOpen = false;
          continue;
        }
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
    const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
      ? nodeGraphModuleDisplayRendererForSlot(item?.slot)
      : "";
    if (renderer === "vectorDot" || renderer === "pulseDot" || renderer === "lcdDot" || renderer === "dot") {
      continue;
    }
    drawNodeGraphModuleScopeLightDisplay(context, item.scopeRect, item.buffer, pixelRatio, item.slot);
  }
}


function drawNodeGraphTraceDisplayItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  if (!slot) {
    return;
  }
  if (!buffer?.length) {
    if (typeof paintNodeGraphTraceDisplayColdPlate === "function") {
      paintNodeGraphTraceDisplayColdPlate(slot, pixelRatio);
    }
    return;
  }
  renderNodeGraphModuleScopeAnalyzer(slot, buffer);
  const painted = drawNodeGraphTraceDisplayCanvasItem(item, pixelRatio);
  if (painted === false && typeof paintNodeGraphTraceDisplayColdPlate === "function") {
    paintNodeGraphTraceDisplayColdPlate(slot, pixelRatio);
  }
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


function nodeGraphPhosphorDotLutCss(settings, amount01) {
  const t = Math.max(0, Math.min(0.999, Number(amount01) || 0));
  const stops = Array.isArray(settings?.gradientStops) ? settings.gradientStops : null;
  if (stops?.length >= 2) {
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 1; i < stops.length; i += 1) {
      if (t <= Number(stops[i].t)) {
        a = stops[i - 1];
        b = stops[i];
        break;
      }
    }
    const span = Math.max(1e-6, Number(b.t) - Number(a.t));
    const u = (t - Number(a.t)) / span;
    const mixHex = (ha, hb) => {
      const pa = /^#?([0-9a-f]{6})$/i.exec(String(ha || ""));
      const pb = /^#?([0-9a-f]{6})$/i.exec(String(hb || ""));
      if (!pa || !pb) {
        return hb || ha || "#75ebff";
      }
      const na = Number.parseInt(pa[1], 16);
      const nb = Number.parseInt(pb[1], 16);
      const ch = (shift) => {
        const ca = (na >> shift) & 255;
        const cb = (nb >> shift) & 255;
        return Math.round(ca + (cb - ca) * u);
      };
      return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
    };
    return mixHex(a.color, b.color);
  }
  return settings?.dot1Color || "#75ebff";
}

function drawNodeGraphDotOscilloscopeItem(renderer, item, pixelRatio) {
  // Phosphor Dot: cached smoothstep sprite (same kernel as Vector Dot).
  // Bright 1 × |sample| 1 = full LUT peak — no 2D-stamp depositGain (that
  // scaled a single dab to ~8% and looked dead at Bright 1).
  const buffer = item?.buffer;
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
  if (buffer && typeof renderNodeGraphModuleScopeAnalyzer === "function") {
    renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
  }
  const bg = nodeGraphFacePlateBackground(settings);
  nodeGraphFacePlateApplyCss(screenElement, bg);
  canvas.style.mixBlendMode = "normal";
  const width = canvas.width;
  const height = canvas.height;
  const minSide = Math.max(1, Math.min(width, height));
  const size01 = clampNodeSliderValue(settings.dot1Size, 0, 1);
  const radius = minSide * 0.5 * size01;
  const blur = nodeGraphTraceDisplayClampStampBlur(settings.lineThickness);
  const trail = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateTrail
    ? PhosphorResidual.migrateTrail(settings, 0.78)
    : clampNodeSliderValue(Number(settings.trail ?? 0.78), 0, 1);
  const ghost = typeof PhosphorResidual !== "undefined" && PhosphorResidual.migrateGhost
    ? PhosphorResidual.migrateGhost(settings, 0.4)
    : clampNodeSliderValue(Number(settings.ghost) || 0, 0, 1);
  const lampBright = clampNodeSliderValue(Number(settings.dot1Brightness) || 0, 0, 1);
  const energy = nodeGraphVectorDotFrameEnergy01(buffer, canvas);
  const amount = Math.max(0, Math.min(1, energy * lampBright));
  const frozen0d = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();

  // Plate is a solid fill every frame (BG hue/bright is not residual).
  // Ghost/Trail live on a separate ink bitmap so semi-transparent skirts
  // cannot pile up into the background.
  nodeGraphFacePlateFillCanvas(context, canvas, bg);
  let ink = canvas._phosphorDotInk;
  if (!ink || ink.width !== width || ink.height !== height) {
    ink = document.createElement("canvas");
    ink.width = width;
    ink.height = height;
    canvas._phosphorDotInk = ink;
  }
  const inkCtx = ink.getContext("2d");
  if (inkCtx && !frozen0d) {
    const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
    const keeps = Residual?.residualKeeps
      ? Residual.residualKeeps(trail, ghost)
      : { fade: 0.25 };
    const fade = Math.max(0.04, Math.min(1, Number(keeps.fade)));
    inkCtx.save();
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.globalCompositeOperation = "destination-out";
    inkCtx.globalAlpha = fade;
    inkCtx.fillStyle = "#000000";
    inkCtx.fillRect(0, 0, width, height);
    inkCtx.restore();
    if (amount > 0.001 && radius > 0.05) {
      if (typeof TraceDotSprite !== "undefined" && typeof TraceDotSprite.draw === "function") {
        TraceDotSprite.draw(inkCtx, width * 0.5, height * 0.5, radius, blur, {
          amount,
          colorAt: (b) => nodeGraphPhosphorDotLutCss(settings, b),
        }, 1);
      } else {
        nodeGraphDrawVectorDotDisc(
          inkCtx,
          width * 0.5,
          height * 0.5,
          radius,
          blur,
          nodeGraphPhosphorDotLutCss(settings, amount),
        );
      }
    }
  }
  if (ink) {
    context.save();
    context.globalCompositeOperation = "source-over";
    context.drawImage(ink, 0, 0);
    context.restore();
  }
  recordNodeGraphModuleScopeRenderMetrics(1, 1);
}


/**
 * Value Line — TraceStroke on a face-local canvas (same space as the module
 * face). Must NOT use the shared viewport WebGL beam: that path tracks pan/zoom
 * while paused and the line drifts off the scope.
 */
function drawNodeGraphValueOscilloscopeItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  if (!slot) {
    return;
  }
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null;
  const settings = typeof nodeGraphTraceDisplaySettingsForNode === "function"
    ? nodeGraphTraceDisplaySettingsForNode(node)
    : null;
  const safeSettings = settings && typeof settings === "object"
    ? settings
    : (typeof normalizeNodeGraphValueOscilloscopeSettings === "function"
      ? normalizeNodeGraphValueOscilloscopeSettings()
      : {});

  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  {
    const densityRaw = Number(safeSettings.pixelDensity);
    const density = Number.isFinite(densityRaw) ? densityRaw : 1;
    if (!syncNodeGraphModuleScopeLocalFallbackCanvas(
      canvas,
      screenElement,
      pixelRatio,
      density,
    )) {
      return;
    }
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  if (typeof renderNodeGraphModuleScopeAnalyzer === "function") {
    renderNodeGraphModuleScopeAnalyzer(slot, item.buffer);
  }

  const bg = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground(safeSettings)
    : "#000004";
  if (typeof nodeGraphFacePlateApplyCss === "function" && screenElement) {
    nodeGraphFacePlateApplyCss(screenElement, bg);
  }
  canvas.style.mixBlendMode = "normal";

  const width = canvas.width;
  const height = canvas.height;
  const faceMinSide = Math.max(1, Math.min(width, height));
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();

  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(context, canvas, bg);
  } else {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
  }

  let ink = canvas._valueLineInk;
  if (!ink || ink.width !== width || ink.height !== height) {
    ink = document.createElement("canvas");
    ink.width = width;
    ink.height = height;
    canvas._valueLineInk = ink;
  }

  if (!frozen) {
    const inkCtx = ink.getContext("2d");
    if (!inkCtx) {
      return;
    }
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(0, 0, width, height);

    const amp = typeof nodeGraphDisplaySettingsAmplitudeScale === "function"
      ? nodeGraphDisplaySettingsAmplitudeScale(safeSettings)
      : 1;
    const value = clampNodeSliderValue(
      (typeof nodeGraphOscilloscopeLatestSample === "function"
        ? nodeGraphOscilloscopeLatestSample(item?.buffer, 0)
        : 0) * amp,
      -1,
      1,
    );
    // 0 is a real setting — never use `x || default` (that snaps 0 back to default).
    const finiteUnit = (raw, fallback) => {
      const n = Number(raw);
      return clampNodeSliderValue(Number.isFinite(n) ? n : fallback, 0, 1);
    };
    const lineLength = finiteUnit(safeSettings.lineLength, 1);
    const brightness = finiteUnit(
      safeSettings.brightness ?? safeSettings.dot1Brightness,
      0.72,
    );
    if (!(brightness > 0.001) || safeSettings.dot1Enabled === false) {
      if (typeof recordNodeGraphModuleScopeRenderMetrics === "function") {
        recordNodeGraphModuleScopeRenderMetrics(1, 0);
      }
      return;
    }

    const halfLine = width * 0.5 * lineLength;
    const x1 = width * 0.5 - halfLine;
    const x2 = width * 0.5 + halfLine;
    const y = height * 0.5 - value * height * 0.44;

    let rgb = [115, 235, 255];
    const colorHex = safeSettings.color || safeSettings.dot1Color || "";
    if (colorHex && typeof nodeGraphScopeHexColorToRgb === "function") {
      const parsed = nodeGraphScopeHexColorToRgb(colorHex);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        rgb = parsed[0] <= 1.01
          ? [
            Math.round(parsed[0] * 255),
            Math.round(parsed[1] * 255),
            Math.round(parsed[2] * 255),
          ]
          : [
            Math.round(parsed[0]),
            Math.round(parsed[1]),
            Math.round(parsed[2]),
          ];
      }
    }

    const size01 = finiteUnit(safeSettings.dot1Size, 0);
    if (!(size01 > 0)) {
      return;
    }
    const blur01 = Math.max(0.12, finiteUnit(safeSettings.lineThickness, 0));
    const strokeOpts = {
      blur: blur01,
      brightness,
      color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
      faceMinSide,
      rgb,
      size: size01,
    };

    if (typeof TraceStroke !== "undefined" && typeof TraceStroke.draw === "function") {
      TraceStroke.draw(inkCtx, [{ x: x1, y }, { x: x2, y }], strokeOpts);

      if (safeSettings.capEnabled !== false) {
        const capLen01 = finiteUnit(safeSettings.capLength, 0.16);
        if (capLen01 > 0.001) {
          const capHalf = height * capLen01 * 0.5;
          const capSize01 = finiteUnit(
            safeSettings.capSize ?? safeSettings.dot1Size,
            size01,
          );
          const lineCoreR = typeof TraceStroke.radiusPx === "function"
            ? TraceStroke.radiusPx(faceMinSide, size01)
            : faceMinSide * size01 * 0.5;
          const capCoreR = typeof TraceStroke.radiusPx === "function"
            ? TraceStroke.radiusPx(faceMinSide, capSize01)
            : faceMinSide * capSize01 * 0.5;
          const edgeAlign = capCoreR - lineCoreR;
          const capPad01 = finiteUnit(safeSettings.capPadding, 0);
          const padPx = halfLine * capPad01;
          const midX = (x1 + x2) * 0.5;
          let leftCapX = x1 + edgeAlign + padPx;
          let rightCapX = x2 - edgeAlign - padPx;
          if (leftCapX > midX) leftCapX = midX;
          if (rightCapX < midX) rightCapX = midX;
          const capOpts = { ...strokeOpts, size: capSize01 };
          TraceStroke.draw(
            inkCtx,
            [{ x: leftCapX, y: y - capHalf }, { x: leftCapX, y: y + capHalf }],
            capOpts,
          );
          TraceStroke.draw(
            inkCtx,
            [{ x: rightCapX, y: y - capHalf }, { x: rightCapX, y: y + capHalf }],
            capOpts,
          );
        }
      }
    }
  }

  context.drawImage(ink, 0, 0);
  if (typeof recordNodeGraphModuleScopeRenderMetrics === "function") {
    recordNodeGraphModuleScopeRenderMetrics(1, 1);
  }
}


function nodeGraphVectorDotFrameEnergy01(buffer, canvas) {
  if (!buffer || !buffer.length) {
    return 0;
  }
  const abs = Math.max(
    0,
    Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount || buffer.nodeGraphScopeAbsoluteFrame) || 0),
  );
  const prevAbs = Number(canvas?._vectorDotEnergyAbs || 0);
  let n = 0;
  if (prevAbs > 0 && abs > prevAbs) {
    n = Math.min(buffer.length, abs - prevAbs);
  } else if (typeof nodeGraphScopeBufferRecentSampleCount === "function") {
    const recent = nodeGraphScopeBufferRecentSampleCount(buffer);
    if (recent != null && recent > 0) {
      n = Math.min(buffer.length, recent);
    }
  }
  if (!(n > 0)) {
    const sr = typeof nodeGraphScopeSampleRate === "function"
      ? nodeGraphScopeSampleRate(buffer)
      : 44100;
    n = Math.min(buffer.length, Math.max(1, Math.ceil(Math.max(1, sr) / 60)));
  }
  if (canvas) {
    canvas._vectorDotEnergyAbs = abs || prevAbs;
  }
  let sum = 0;
  let count = 0;
  const start = Math.max(0, buffer.length - n);
  for (let i = start; i < buffer.length; i += 1) {
    const sample = Number(buffer[i]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += Math.max(0, Math.min(1, Math.abs(sample)));
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function nodeGraphVectorDotStampExtents(width, height, size01, pill01) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const size = Math.max(0, Math.min(1, Number(size01) || 0));
  const pill = Math.max(0, Math.min(1, Number(pill01) || 0));
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const r = minSide * 0.5 * size;
  const rLong = r + (maxSide * 0.5 * size - r) * pill;
  if (w >= h) {
    return { rx: rLong, ry: r, radius: r };
  }
  return { rx: r, ry: rLong, radius: r };
}

function nodeGraphDrawVectorDotDisc(context, cx, cy, radius, blur01, style) {
  if (!context || !(radius > 0.05)) {
    return;
  }
  if (typeof TraceDotSprite !== "undefined" && typeof TraceDotSprite.draw === "function") {
    TraceDotSprite.draw(context, cx, cy, radius, blur01, style, 1);
    return;
  }
  const color = typeof style === "string"
    ? style
    : (typeof nodeGraphHueBrightnessCss === "function" && Number.isFinite(Number(style?.hue))
      ? nodeGraphHueBrightnessCss(style.hue, style.amount)
      : style?.color);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fillStyle = color || "#ffffff";
  context.fill();
  context.restore();
}

/**
 * Vector Dot — companion to Phosphor Dot. Cheap 2D disc, smoothstep edge blur,
 * hue+brightness, one energy gather per frame. No residual FBO, no gradients.
 */
function drawNodeGraphVectorDotItem(renderer, item, pixelRatio) {
  const buffer = item?.buffer;
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(item?.slot)
    : null;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(
    canvas,
    screenElement,
    pixelRatio,
    1,
  )) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  if (buffer) {
    if (typeof renderNodeGraphModuleScopeAnalyzer === "function") {
      renderNodeGraphModuleScopeAnalyzer(item.slot, buffer);
    }
  }
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(item?.slot)
    : null;
  const settings = typeof nodeGraphVectorDotSettingsForNode === "function"
    ? nodeGraphVectorDotSettingsForNode(node)
    : {};
  const energy = nodeGraphVectorDotFrameEnergy01(buffer, canvas);
  const lcd = node?.type === "lcdDot"
    || settings.faceStyle === "lcd"
    || renderer === "lcdDot";
  const lampBright = clampNodeSliderValue(
    Number(settings.dot1Brightness ?? settings.brightness) || 0,
    0,
    1,
  );
  const hue = typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(settings.dot1Color || settings.color || "")
    : (Number.isFinite(Number(settings.hue)) ? Number(settings.hue) : 25);
  let bg;
  if (lcd && typeof nodeGraphNumberReadoutLcdBgCss === "function") {
    bg = nodeGraphNumberReadoutLcdBgCss(settings);
  } else {
    const bgHue = typeof nodeGraphHueDegFromHex === "function"
      ? nodeGraphHueDegFromHex(settings.backgroundColor || settings.background)
      : 220;
    const bgAmt = clampNodeSliderValue(Number(settings.backgroundBrightness) || 0, 0, 1);
    bg = typeof nodeGraphHueBrightnessCss === "function"
      ? nodeGraphHueBrightnessCss(bgHue, bgAmt)
      : "#000000";
  }
  if (typeof nodeGraphFacePlateApplyCss === "function" && screenElement) {
    nodeGraphFacePlateApplyCss(screenElement, bg);
  }
  nodeGraphFacePlateFillCanvas(context, canvas, bg);
  const width = canvas.width;
  const height = canvas.height;
  const size01 = clampNodeSliderValue(Number(settings.dot1Size) || 0, 0, 1);
  const stampShape = typeof normalizeTraceStampShape === "function"
    ? normalizeTraceStampShape(settings.shape)
    : String(settings.shape || "circle");
  const shapeParam = clampNodeSliderValue(
    Number(settings.shapeParam ?? (stampShape === "oval" ? settings.pill : settings.squircle)) || 0,
    0,
    1,
  );
  const stretch = stampShape === "oval" ? shapeParam : 0;
  const extents = nodeGraphVectorDotStampExtents(width, height, size01, stretch);
  const radius = extents.radius;
  const blur = clampNodeSliderValue(
    Number(settings.lineThickness ?? settings.blur) || 0,
    0,
    1,
  );
  const blend = typeof nodeGraphScopeStereoBlendMode === "function"
    ? nodeGraphScopeStereoBlendMode(settings.stereoBlend)
    : (settings.stereoBlend || (lcd ? "source-over" : "combine"));
  const composite = lcd
    ? "source-over"
    : (typeof nodeGraphScopeStereoBlendComposite === "function"
      ? nodeGraphScopeStereoBlendComposite(blend)
      : (blend === "combine" ? "lighter" : blend));
  const e = Math.max(0, Math.min(1, energy));
  const amount = Math.max(0, Math.min(1, e * lampBright));
  const shape = {
    rx: extents.rx,
    ry: extents.ry,
    shape: stampShape,
    shapeParam,
  };
  const cx = width * 0.5;
  const cy = height * 0.5;
  if (lcd) {
    const ghostAmt = clampNodeSliderValue(Number(settings.unlitSegments) || 0, 0, 1);
    let inkCss = settings.dot1Color || settings.color || "#1a2216";
    let ghostCss = inkCss;
    if (typeof nodeGraphNumberReadoutLcdInkRgb === "function") {
      const rgb = nodeGraphNumberReadoutLcdInkRgb(settings);
      inkCss = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
      if (typeof nodeGraphNumberReadoutLcdGhostRgb === "function") {
        const g = nodeGraphNumberReadoutLcdGhostRgb(rgb, settings);
        ghostCss = `rgb(${g[0]} ${g[1]} ${g[2]})`;
      }
    }
    if (ghostAmt > 0.001 && radius > 0.05) {
      context.save();
      context.globalAlpha = ghostAmt;
      nodeGraphDrawVectorDotDisc(context, cx, cy, radius, blur, {
        ...shape,
        color: ghostCss,
        amount: 1,
      });
      context.restore();
    }
    if (e > 0.001 && radius > 0.05) {
      context.save();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = e;
      nodeGraphDrawVectorDotDisc(context, cx, cy, radius, blur, {
        ...shape,
        color: inkCss,
        amount: 1,
      });
      context.restore();
    }
    if (typeof nodeGraphNumberReadoutDrawLcdInnerShadow === "function") {
      nodeGraphNumberReadoutDrawLcdInnerShadow(
        context,
        0,
        0,
        width,
        height,
        settings.innerShadowDistance,
        settings.innerShadowSharpness,
        settings.innerShadowOffsetX,
        settings.innerShadowOffsetY,
      );
    }
    if (typeof nodeGraphNumberReadoutApplyLcdLightCutout === "function") {
      nodeGraphNumberReadoutApplyLcdLightCutout(screenElement, canvas);
    }
  } else if (amount > 0 && radius > 0.05) {
    context.save();
    context.globalCompositeOperation = composite;
    nodeGraphDrawVectorDotDisc(context, cx, cy, radius, blur, {
      ...shape,
      hue,
      amount,
    });
    context.restore();
  }
  const punch = lcd
    ? (typeof nodeGraphLcdDisplayLightStrength === "number" ? nodeGraphLcdDisplayLightStrength : 2 / 3)
    : amount;
  if (screenElement?.dataset) {
    screenElement.dataset.lightSource = "screen";
    screenElement.dataset.lightStrength = String(punch);
  }
  if (typeof setNodeGraphLightStrength === "function" && screenElement) {
    setNodeGraphLightStrength(screenElement, punch);
  }
  if (typeof recordNodeGraphModuleScopeRenderMetrics === "function") {
    recordNodeGraphModuleScopeRenderMetrics(1, 1);
  }
}

function drawNodeGraphCustomDisplayItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!node || !screenElement) {
    return;
  }
  // Music Player paints its own phosphor face. Running the custom-display
  // compiler here every RAF is why spawning a player pegged CPU.
  if (slot?.type === "audioPlayer" || node?.type === "audioPlayer") {
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

