// Scope vertices / textures / fallback canvas helpers (Phase D).
// Load after scopes.js (+ geometry). Extract-only.

function nodeGraphTraceDisplayScratchForSlot(slot, requiredFloats) {
  const nodeId = String(slot?.nodeId || "traceDisplay");
  const scratch = nodeGraphModuleScopeState.traceDisplayScratch;
  let entry = scratch.get(nodeId);
  const required = Math.max(0, Math.floor(Number(requiredFloats) || 0));
  if (!entry || entry.vertices.length < required) {
    let capacity = Math.max(1024, entry?.vertices?.length || 0);
    while (capacity < required) {
      capacity *= 2;
    }
    entry = {
      vertices: new Float32Array(capacity),
    };
    scratch.set(nodeId, entry);
  }
  return entry;
}

function appendNodeGraphTraceDisplayBeamSegment(vertices, offset, x1, y1, x2, y2, age) {
  const corners = [0, 1, 2, 2, 1, 3];
  let cursor = offset;
  for (let index = 0; index < corners.length; index += 1) {
    vertices[cursor] = x1;
    vertices[cursor + 1] = y1;
    vertices[cursor + 2] = x2;
    vertices[cursor + 3] = y2;
    vertices[cursor + 4] = corners[index];
    vertices[cursor + 5] = age;
    cursor += 6;
  }
  return cursor;
}

function nodeGraphTraceDisplayVisualPointCount(rect, buffer) {
  const visualWidth = Math.max(1, Number(rect?.width) || 0);
  const visualPointLimit = Math.max(
    2,
    Math.min(32768, Math.floor(Number(buffer?.nodeGraphScopeVisualPointLimit) || 32768)),
  );
  return Math.max(2, Math.min(visualPointLimit, Math.ceil(visualWidth * 2)));
}

function buildNodeGraphTraceDisplayVertices(buffer, rect, canvas, pixelRatio, slot, options = {}) {
  const clippedRange = nodeGraphModuleScopeProgressRangeIntersection([0, 1], options.visibleProgressRange);
  if (!buffer?.length || rect.width <= 1 || rect.height <= 1 || !clippedRange) {
    return null;
  }
  const timing = options.traceTiming || null;
  const [start, end] = clippedRange;
  const drawSpan = end - start;
  if (drawSpan <= 0.001) {
    return null;
  }
  const bufferViewStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  const view = nodeGraphModuleScopeBufferView(buffer, slot);
  if (timing) {
    timing.bufferViewMs += Math.max(0, nodeGraphModuleScopeNowMs() - bufferViewStartMs);
  }
  if (view.end <= view.start) {
    const sampleIndex = Math.max(0, Math.min(buffer.length - 1, buffer.length - 1));
    const sampleInfo = nodeGraphModuleScopeSampleInfo(buffer, sampleIndex);
    const rawValue = Number.isFinite(Number(sampleInfo.value)) ? Number(sampleInfo.value) : 0;
    const value = clampNodeSliderValue((rawValue * view.gain) + view.offset, -1, 1);
    const midY = rect.top + rect.height * 0.5;
    const halfHeight = rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect);
    const y = (midY - value * halfHeight) * pixelRatio;
    const scratch = nodeGraphTraceDisplayScratchForSlot(slot, 36);
    const vertices = scratch.vertices;
    const vertexOffset = appendNodeGraphTraceDisplayBeamSegment(
      vertices,
      0,
      rect.left * pixelRatio,
      y,
      (rect.left + rect.width) * pixelRatio,
      y,
      0,
    );
    return {
      pointCount: 1,
      vertexCount: vertexOffset / 6,
      vertices,
      vertexFloatCount: vertexOffset,
    };
  }
  const midY = rect.top + rect.height * 0.5;
  const halfHeight = rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect);
  const metricRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const pointCountHint = nodeGraphTraceDisplayVisualPointCount(metricRect, buffer);
  const scratch = nodeGraphTraceDisplayScratchForSlot(slot, Math.max(0, pointCountHint - 1) * 36);
  const vertices = scratch.vertices;
  const pointGenerationStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  let previousX = 0;
  let previousY = 0;
  let hasPrevious = false;
  let vertexOffset = 0;
  let segmentCount = 0;
  const skipSamples = typeof nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot === "function"
    ? nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer)
    : 0;
  const pathPoints = typeof TraceWaveform !== "undefined" && typeof TraceWaveform.buildPoints === "function"
    ? TraceWaveform.buildPoints({
      buffer,
      start: view.start + start * Math.max(0, view.end - view.start),
      end: view.start + end * Math.max(0, view.end - view.start),
      width: rect.width,
      height: rect.height,
      midY,
      halfHeight,
      gain: view.gain,
      offset: view.offset,
      skipDiscontinuities: skipSamples > 0,
      discontinuityThreshold: typeof nodeGraphModuleScopeDiscontinuityThreshold === "number"
        ? nodeGraphModuleScopeDiscontinuityThreshold
        : 0.85,
    })
    : [];
  const usable = pathPoints.length
    ? pathPoints
    : (buildNodeGraphTraceDisplaySamples(
      buffer,
      slot,
      pointCountHint,
      (index, count) => start + ((index + 0.5) / count) * drawSpan,
      ((view.end - view.start) * drawSpan) / Math.max(1, pointCountHint),
    ) || []).map((s) => (
      s.breakBefore
        ? null
        : {
          x: rect.left + s.progress * rect.width,
          y: midY - s.value * halfHeight,
        }
    ));
  const pointCount = usable.filter((p) => p).length;
  for (let pointIndex = 0; pointIndex < usable.length; pointIndex += 1) {
    const p = usable[pointIndex];
    if (!p) {
      hasPrevious = false;
      continue;
    }
    const x = (p.x || 0) + (pathPoints.length ? rect.left : 0);
    const y = p.y;
    if (hasPrevious) {
      const segmentIndex = Math.max(0, segmentCount);
      const x1 = previousX * pixelRatio;
      const y1 = previousY * pixelRatio;
      const x2 = x * pixelRatio;
      const y2 = y * pixelRatio;
      if (Math.hypot(x2 - x1, y2 - y1) >= 0.001) {
        const age = segmentIndex / Math.max(1, pointCount - 1);
        vertexOffset = appendNodeGraphTraceDisplayBeamSegment(vertices, vertexOffset, x1, y1, x2, y2, age);
        segmentCount += 1;
      }
    }
    previousX = x;
    previousY = y;
    hasPrevious = true;
  }
  if (timing) {
    timing.pointGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - pointGenerationStartMs);
  }
  if (vertexOffset < 36) {
    return null;
  }
  return {
    pointCount,
    vertexCount: vertexOffset / 6,
    vertices,
    vertexFloatCount: vertexOffset,
  };
}

function nodeGraphModuleScopeXyBeamVertices(points, canvas, sparkSizePx = 2) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, canvas);
  const vertices = [];
  const radius = clampNodeSliderValue(Number(sparkSizePx) || 2, 1, 10) * 0.5;
  for (let index = 0; index + 1 < pixelPoints.length; index += 2) {
    const x = pixelPoints[index];
    const y = pixelPoints[index + 1];
    appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices([
      (((x - radius) / canvas.width) * 2) - 1,
      1 - ((y / canvas.height) * 2),
      (((x + radius) / canvas.width) * 2) - 1,
      1 - ((y / canvas.height) * 2),
    ], canvas));
  }
  return vertices;
}

function nodeGraphModuleScopeDotVertices(points, canvas, ageStart = 0, ageEnd = 1) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, canvas);
  const vertices = [];
  const count = Math.max(1, (pixelPoints.length / 2) - 1);
  const start = clampNodeSliderValue(Number(ageStart) || 0, 0, 1);
  const end = clampNodeSliderValue(Number(ageEnd) || 0, 0, 1);
  const skippedPoints = Array.isArray(points?.nodeGraphScopeSkippedPoints)
    ? points.nodeGraphScopeSkippedPoints
    : null;
  for (let index = 0; index + 1 < pixelPoints.length; index += 2) {
    const pointIndex = index / 2;
    if (skippedPoints?.[pointIndex]) {
      continue;
    }
    const progress = pointIndex / count;
    const age = start + (end - start) * progress;
    vertices.push(pixelPoints[index], pixelPoints[index + 1], clampNodeSliderValue(age, 0, 1));
  }
  return vertices;
}

function nodeGraphModuleScopeBufferDotVertices(buffer, rect, canvas, pixelRatio, slot, options = {}) {
  const vertices = [];
  const xyPoints = nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot);
  if (xyPoints.length >= 2) {
    appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeDotVertices(xyPoints, canvas, 0.72, 1));
    return vertices;
  }
  for (const [start, end] of nodeGraphModuleScopeBufferProgressRanges(buffer)) {
    const points = nodeGraphModuleScopeBufferSegmentPoints(buffer, rect, canvas, pixelRatio, slot, start, end, options);
    if (points.length >= 2) {
      appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeDotVertices(points, canvas, start, end));
    }
  }
  return vertices;
}

function nodeGraphModuleScopeSpectrumBarVertices(buffer, rect, canvas, options = {}) {
  const vertices = [];
  const length = Math.max(0, buffer?.length || 0);
  if (!buffer?.nodeGraphScopeSpectrum || length <= 0 || rect.width <= 1 || rect.height <= 1) {
    return vertices;
  }
  const visibleRange = Array.isArray(options.visibleProgressRange)
    ? [
      clampNodeSliderValue(Number(options.visibleProgressRange[0]) || 0, 0, 1),
      clampNodeSliderValue(Number(options.visibleProgressRange[1]) || 0, 0, 1),
    ]
    : [0, 1];
  if (visibleRange[1] - visibleRange[0] <= 0.001) {
    return vertices;
  }
  const left = Number(rect.left) || 0;
  const right = left + (Number(rect.width) || 0);
  const bottom = (Number(rect.top) || 0) + (Number(rect.height) || 0);
  const top = Number(rect.top) || 0;
  const pushVertex = (x, y) => {
    vertices.push(
      ((x / canvas.width) * 2) - 1,
      1 - ((y / canvas.height) * 2),
    );
  };
  const firstIndex = Math.max(0, Math.floor(length * visibleRange[0]));
  const lastIndex = Math.min(length, Math.ceil(length * visibleRange[1]));
  for (let index = firstIndex; index < lastIndex; index += 1) {
    const value = clampNodeSliderValue(Number(buffer[index]) || 0, 0, 1);
    const x1 = left + (index / length) * (right - left);
    const x2 = left + ((index + 1) / length) * (right - left);
    const y = bottom - value * (bottom - top);
    pushVertex(x1, bottom);
    pushVertex(x1, y);
    pushVertex(x2, y);
    pushVertex(x1, bottom);
    pushVertex(x2, y);
    pushVertex(x2, bottom);
  }
  return vertices;
}

function applyNodeGraphModuleScopeTraceBlendMode(gl, blendMode = "laser") {
  switch (String(blendMode || "laser").trim().toLowerCase()) {
    case "solid":
      gl.blendFunc(gl.ONE, gl.ZERO);
      break;
    case "paint":
    case "led":
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      break;
    case "light":
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      break;
    case "heatmap":
    case "laser":
    default:
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
  }
}

function nodeGraphModuleScopeTraceBlendMode(slot) {
  return nodeGraphModuleScopeShaderConfigForSlot(slot).blendMode || "laser";
}

function nodeGraphModuleScopeHeatmapEnabled(slot) {
  return nodeGraphModuleScopeTraceBlendMode(slot) === "heatmap";
}

function nodeGraphModuleScopeTraceBrightness(slot, settings) {
  const brightness = settings?.brightness ?? settings?.dot1Brightness ?? nodeGraphModuleScopeDefaultSettings.brightness;
  // Display Bright is 0…1 app-wide (1 = full).
  return clampNodeSliderValue(brightness, 0, 1);
}

function nodeGraphModuleScopeTraceLineThickness(slot, settings) {
  const masterLineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const lineThickness = settings?.lineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness;
  return clampNodeSliderValue(lineThickness * masterLineThickness, 0.25, 32);
}

function invalidateNodeGraphModuleScopeTraceImageTexture() {
  const state = nodeGraphModuleScopeState.traceImageTexture;
  state.dataUrl = "";
  state.generatedKey = "";
  state.image = null;
}

function nodeGraphModuleScopeDotTextureOptions(
  core1SizeValue,
  core1BrightnessValue,
  size = 64,
  core1ColorValue = nodeGraphModuleScopeDefaultDotCores.dot1.color,
  core1BlurValue = 0,
  lineThicknessValue = nodeGraphMvp?.moduleScopeLineThickness,
) {
  if (core1SizeValue && typeof core1SizeValue === "object" && !Array.isArray(core1SizeValue)) {
    return core1SizeValue;
  }
  return {
    core1Blur: core1BlurValue,
    core1Brightness: core1BrightnessValue,
    core1Color: core1ColorValue,
    core1Size: core1SizeValue,
    lineThickness: lineThicknessValue,
    size,
  };
}

function nodeGraphModuleScopeGeneratedDotTextureData(...args) {
  const options = nodeGraphModuleScopeDotTextureOptions(...args);
  const core1Size = normalizeNodeGraphModuleScopeDotCoreSize(options.core1Size, nodeGraphModuleScopeDefaultDotCores.dot1.size);
  const core1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(options.core1Brightness, nodeGraphModuleScopeDefaultDotCores.dot1.brightness);
  const core1Color = nodeGraphScopeHexColorToRgb(
    normalizeNodeGraphModuleScopeDotCoreColor(
      options.core1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color,
      nodeGraphModuleScopeDefaultDotCores.dot1.color,
    ),
  );
  const core1Blur = normalizeNodeGraphModuleScopeDotBlur(options.core1Blur, 0);
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    options.lineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const size = Math.max(1, Math.min(512, Math.round(Number(options.size) || 64)));
  const finalCore1Size = core1Size * lineThickness;
  const pixels = new Uint8Array(size * size * 4);
  const center = (size - 1) * 0.5;
  const dotDiameterPx = Math.max(1, core1Size);
  const core1Radius = clampNodeSliderValue(finalCore1Size * 0.5, 0.005, 20);
  const core1Falloff = 2.6 / Math.max(0.0001, core1Radius * core1Radius);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x - center) / center) * dotDiameterPx * 0.5;
      const dy = ((y - center) / center) * dotDiameterPx * 0.5;
      const distanceSquared = dx * dx + dy * dy;
      const core1Mask = nodeGraphModuleScopeDotBlurMask(distanceSquared, core1Radius, core1Blur);
      const core1Energy = Math.exp(-distanceSquared * core1Falloff) * core1Brightness * core1Mask;
      const energy = clampNodeSliderValue(core1Energy, 0, 1);
      const red = clampNodeSliderValue(core1Color[0], 0, 1);
      const green = clampNodeSliderValue(core1Color[1], 0, 1);
      const blue = clampNodeSliderValue(core1Color[2], 0, 1);
      const alpha = Math.round(energy * 255);
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(red * 255);
      pixels[index + 1] = Math.round(green * 255);
      pixels[index + 2] = Math.round(blue * 255);
      pixels[index + 3] = alpha;
    }
  }
  return pixels;
}

function nodeGraphModuleScopeGeneratedDotTexture(renderer) {
  const state = nodeGraphModuleScopeState.traceImageTexture;
  const core1Enabled = nodeGraphMvp?.moduleScopeDotCore1Enabled !== false;
  const core1Size = normalizeNodeGraphModuleScopeDotCoreSize(
    nodeGraphMvp?.moduleScopeDotCore1Size ?? nodeGraphModuleScopeDefaultDotCores.dot1.size,
    nodeGraphModuleScopeDefaultDotCores.dot1.size,
  );
  const core1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(
    nodeGraphMvp?.moduleScopeDotCore1Brightness ?? nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
    nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
  );
  const core1Color = normalizeNodeGraphModuleScopeDotCoreColor(
    nodeGraphMvp?.moduleScopeDotCore1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color,
    nodeGraphModuleScopeDefaultDotCores.dot1.color,
  );
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  const core1Blur = 0;
  const key = `generated:${core1Enabled}:${core1Size.toFixed(3)}:${core1Brightness.toFixed(3)}:${core1Color}:${core1Blur.toFixed(3)}:${lineThickness.toFixed(3)}`;
  if (state.generatedKey === key && state.texture) {
    return state.texture;
  }
  const { gl } = renderer;
  if (!state.texture) {
    state.texture = gl.createTexture();
  }
  state.dataUrl = "";
  state.generatedKey = key;
  state.image = null;
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    64,
    64,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    nodeGraphModuleScopeGeneratedDotTextureData({
      core1Blur,
      core1Brightness: core1Enabled ? core1Brightness : 0,
      core1Color,
      core1Size,
      lineThickness,
      size: 64,
    }),
  );
  return state.texture;
}

function nodeGraphModuleScopeTraceImageTexture(renderer) {
  const dataUrl = typeof nodeGraphTraceImageDataUrl === "function" ? nodeGraphTraceImageDataUrl() : "";
  const state = nodeGraphModuleScopeState.traceImageTexture;
  if (!dataUrl) {
    return nodeGraphModuleScopeGeneratedDotTexture(renderer);
  }
  const { gl } = renderer;
  state.generatedKey = "";
  if (state.dataUrl === dataUrl && state.texture && state.image?.complete) {
    return state.texture;
  }
  if (state.dataUrl !== dataUrl) {
    state.dataUrl = dataUrl;
    state.image = new Image();
    state.image.onload = () => {
      if (state.dataUrl !== dataUrl) {
        return;
      }
      if (!state.texture) {
        state.texture = gl.createTexture();
      }
      gl.bindTexture(gl.TEXTURE_2D, state.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.image);
      scheduleNodeGraphModuleScopeDraw();
    };
    state.image.src = dataUrl;
  }
  return state.image?.complete ? state.texture : null;
}

function nodeGraphModuleScopeDotSizeScale() {
  const core1Size = normalizeNodeGraphModuleScopeDotCoreSize(
    nodeGraphMvp?.moduleScopeDotCore1Size ?? nodeGraphModuleScopeDefaultDotCores.dot1.size,
    nodeGraphModuleScopeDefaultDotCores.dot1.size,
  );
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  return clampNodeSliderValue(core1Size * lineThickness, 0.01, 40);
}

function nodeGraphModuleScopeTraceDotSizeScale(dotSize, fallback = 1) {
  const size = normalizeNodeGraphModuleScopeDotCoreSize(dotSize, fallback);
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(
    nodeGraphMvp?.moduleScopeLineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness,
  );
  return clampNodeSliderValue(size * lineThickness, 0.01, 40);
}

function nodeGraphModuleScopeDotBlurMask(distanceSquared, radius, blurValue = 0) {
  const radiusValue = Math.max(0.0001, Number(radius) || 0.0001);
  const blur = normalizeNodeGraphModuleScopeDotBlur(blurValue, 0);
  const normalizedDistance = Math.sqrt(Math.max(0, Number(distanceSquared) || 0)) / radiusValue;
  if (normalizedDistance >= 1) {
    return 0;
  }
  if (blur <= 0) {
    return 1;
  }
  const crispEdge = Math.max(0.0001, blur * 0.35);
  const crispStart = 1 - crispEdge;
  const edgeProgress = clampNodeSliderValue((normalizedDistance - crispStart) / crispEdge, 0, 1);
  const crisp = 1 - (edgeProgress * edgeProgress * (3 - 2 * edgeProgress));
  const gaussianSharpness = 2.2 + (1 - blur) * 10;
  const edgeEnergy = Math.exp(-gaussianSharpness);
  const gaussian = clampNodeSliderValue(
    (Math.exp(-gaussianSharpness * normalizedDistance * normalizedDistance) - edgeEnergy) /
      Math.max(0.0001, 1 - edgeEnergy),
    0,
    1,
  );
  return crisp * (1 - blur) + gaussian * blur;
}

function nodeGraphModuleScopeClippedPixelRect(canvas, rect, pixelRatio = window.devicePixelRatio || 1) {
  const rectLeft = Number(rect?.left) || 0;
  const rectTop = Number(rect?.top) || 0;
  const rectRight = rectLeft + (Number(rect?.width) || 0);
  const rectBottom = rectTop + (Number(rect?.height) || 0);
  const left = Math.max(0, Math.min(canvas.width, Math.floor(rectLeft * pixelRatio)));
  const top = Math.max(0, Math.min(canvas.height, Math.floor(rectTop * pixelRatio)));
  const right = Math.max(0, Math.min(canvas.width, Math.ceil(rectRight * pixelRatio)));
  const bottom = Math.max(0, Math.min(canvas.height, Math.ceil(rectBottom * pixelRatio)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    bottom,
    height,
    left,
    right,
    top,
    width,
  };
}

// drawNodeGraphModuleScopeBufferWebGl → node-graph-module-scope-draw-basic.js
// drawNodeGraphModuleScopeSpectrumBarsWebGl → node-graph-module-scope-draw-basic.js
// drawNodeGraphModuleScopeLightShape → node-graph-module-scope-draw-basic.js
function nodeGraphModuleScopeLightFillStyle(context, centerX, centerY, radius, rgb, alpha, blurValue = 0) {
  const alphaValue = clampNodeSliderValue(Number(alpha) || 0, 0, 1);
  const blur = normalizeNodeGraphModuleScopeDotBlur(blurValue, 0);
  if (blur <= 0) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alphaValue})`;
  }
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(0.0001, radius));
  const middleStop = clampNodeSliderValue(0.22 + (1 - blur) * 0.58, 0.22, 0.8);
  gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alphaValue})`);
  gradient.addColorStop(middleStop, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alphaValue})`);
  gradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  return gradient;
}

// Persistent canvas cache — canvases survive DOM rebuilds (parameter changes,
// module re-renders). Keyed by nodeId so when a module's DOM is torn down and
// rebuilt, the same canvas is re-attached instead of creating a fresh blank one.
const nodeGraphModuleScopePersistentCanvases = new Map();

// Watch for canvas removals (module DOM rebuilds) and immediately re-attach
// so there's no visual gap between rebuild and next scope snapshot.
// Videoscope / scope2d burn faces use the same canvas class + cache.
(function setupNodeGraphModuleScopeCanvasRescue() {
  if (typeof MutationObserver === "undefined") return;
  const rescue = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        // Find any cached canvases that were just removed
        for (const el of [node, ...(node.querySelectorAll?.(".node-module-scope-local-fallback-canvas") || [])]) {
          if (el.className !== "node-module-scope-local-fallback-canvas" && el.nodeName !== "CANVAS") continue;
          for (const [nid, cached] of nodeGraphModuleScopePersistentCanvases) {
            if (cached !== el) continue;
            // Live modules use data-node (not data-node-id); face is
            // .node-module-scope-window (not .node-module-scope).
            const host = document.querySelector(
              `.dsp-node[data-node="${nid}"], [data-node="${nid}"].dsp-node, [data-node-id="${nid}"]`,
            );
            const scopeEl = host?.querySelector?.(
              ".node-module-scope-window, .node-module-scope-window-surface, .node-module-scope",
            );
            if (scopeEl && cached.parentNode !== scopeEl) {
              scopeEl.appendChild(cached);
            }
            break;
          }
        }
      }
    }
  });
  // Observe the wiring panel (workspace root) for any DOM changes
  const root = document.getElementById("nodeWiringPanel")
    || document.getElementById("nodeGraphWorkspace")
    || document.body;
  rescue.observe(root, { childList: true, subtree: true });
})();

function nodeGraphModuleScopeLocalFallbackCanvas(slot) {
  const screenElement = slot?.scopeElement;
  const nodeId = slot?.nodeId;
  if (!screenElement) {
    return null;
  }
  // Try to find an existing canvas in the DOM first.
  let canvas = screenElement.querySelector(":scope > .node-module-scope-local-fallback-canvas");
  if (canvas) {
    return canvas;
  }
  // DOM rebuild may have destroyed the old canvas — re-attach the cached one.
  if (nodeId && nodeGraphModuleScopePersistentCanvases.has(nodeId)) {
    canvas = nodeGraphModuleScopePersistentCanvases.get(nodeId);
    screenElement.appendChild(canvas);
    return canvas;
  }
  // Brand new canvas — create and cache it.
  canvas = document.createElement("canvas");
  canvas.className = "node-module-scope-local-fallback-canvas";
  // Opaque face (never screen-blend — that made black plates go green/teal).
  canvas.style.mixBlendMode = "normal";
  canvas.setAttribute("aria-hidden", "true");
  screenElement.appendChild(canvas);
  if (nodeId) {
    nodeGraphModuleScopePersistentCanvases.set(nodeId, canvas);
  }
  return canvas;
}

/**
 * Size a local face canvas to layout×dpr × pixelDensity.
 *
 * TRACE: still a vector polyline into this buffer; density only sets how coarse
 * the backing store is (0 = chunky lo-fi, 1 = full face, 4 = supersample).
 * PHOSPHOR: same knob on energy grids — different product, same sizing helper.
 * Never use density as an excuse for strip-chart / column-paint Trace models.
 */
function syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  if (!canvas || !screenElement) {
    return false;
  }
  const size = nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio);
  if (!size) {
    return false;
  }
  const resolved = typeof nodeGraphScope2dResolvePixelDensity === "function"
    ? nodeGraphScope2dResolvePixelDensity(pixelDensity, size.width, size.height)
    : { density: 1, effective: 1 };
  // 0 is valid (1×1 pixel). Never use `|| 1` — that snaps density 0 up to full res.
  const densityRaw = Number(resolved.effective);
  const density = Number.isFinite(densityRaw) ? Math.max(0, densityRaw) : 1;
  let width = Math.max(1, Math.round(size.width * density));
  let height = Math.max(1, Math.round(size.height * density));
  // Subpixel hops while paused must not assign canvas.width (browser wipe).
  const frozen = typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : (typeof nodeGraphModuleScopePhosphorFrozen === "function"
      && nodeGraphModuleScopePhosphorFrozen());
  if (frozen && canvas.width >= 2 && canvas.height >= 2) {
    const dw = Math.abs(width - canvas.width);
    const dh = Math.abs(height - canvas.height);
    if (dw <= 1 && dh <= 1) {
      width = canvas.width;
      height = canvas.height;
    }
  }
  if (canvas.width !== width || canvas.height !== height) {
    const previousWidth = canvas.width;
    const previousHeight = canvas.height;
    let previousCanvas = null;
    if (previousWidth > 0 && previousHeight > 0) {
      previousCanvas = document.createElement("canvas");
      previousCanvas.width = previousWidth;
      previousCanvas.height = previousHeight;
      const previousContext = previousCanvas.getContext("2d");
      if (previousContext) {
        previousContext.drawImage(canvas, 0, 0);
      }
    }
    canvas.width = width;
    canvas.height = height;
    // Stale pixel-space bridge anchors must not survive a face buffer resize.
    canvas._nodeGraphScope2dLastDrawnPoint = null;
    const context = previousCanvas ? canvas.getContext("2d") : null;
    if (context) {
      // Nearest when going chunky; smooth when supersampling up.
      context.imageSmoothingEnabled = density >= 0.999;
      context.drawImage(previousCanvas, 0, 0, previousWidth, previousHeight, 0, 0, width, height);
    }
  }
  // Below 1: intentional chunky CSS upscale. At/above 1: smooth scale.
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return true;
}

