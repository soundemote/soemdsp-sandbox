// Scope draw geometry / vertices helpers peeled from module-scopes.js (Phase D).
// Load after scopes.js (+ sync). Extract-only.

function nodeGraphModuleScopeBufferProgressRanges(buffer) {
  const drawProgress = Number.isFinite(Number(buffer?.nodeGraphScopeDrawProgress))
    ? clampNodeSliderValue(Number(buffer.nodeGraphScopeDrawProgress), 0.002, 1)
    : 1;
  if (buffer?.nodeGraphScopeDrawFullWindow) {
    return [[0, 1]];
  }
  const startProgress = Number(buffer?.nodeGraphScopeDrawStartProgress);
  if (!Number.isFinite(startProgress)) {
    return [[0, drawProgress]];
  }
  const start = clampNodeSliderValue(startProgress, 0, 1);
  if (buffer?.nodeGraphScopeDrawWrap) {
    return [
      [start, 1],
      [0, drawProgress],
    ].filter(([from, to]) => to - from > 0.001);
  }
  const end = Math.max(start + 0.002, drawProgress);
  return [[start, clampNodeSliderValue(end, 0.002, 1)]];
}

function nodeGraphModuleScopeProgressRangeIntersection(range, clipRange) {
  const start = clampNodeSliderValue(Number(range?.[0]) || 0, 0, 1);
  const end = clampNodeSliderValue(Number(range?.[1]) || 0, 0, 1);
  if (!Array.isArray(clipRange)) {
    return end - start > 0.001 ? [start, end] : null;
  }
  const clipStart = clampNodeSliderValue(Number(clipRange[0]) || 0, 0, 1);
  const clipEnd = clampNodeSliderValue(Number(clipRange[1]) || 0, 0, 1);
  const clippedStart = Math.max(start, clipStart);
  const clippedEnd = Math.min(end, clipEnd);
  return clippedEnd - clippedStart > 0.001 ? [clippedStart, clippedEnd] : null;
}

const nodeGraphModuleScopeDiscontinuityFixedSkipCount = 2;

function nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer) {
  if (buffer?.nodeGraphScopeDisableDiscontinuitySkip === true) {
    return 0;
  }
  if (nodeGraphModuleDisplayRendererForSlot(slot) === "trace") {
    const enabled = buffer?.nodeGraphScopeSkipDiscontinuities
      ?? nodeGraphTraceDisplaySettingsForSlot(slot).skipDiscontinuities;
    return enabled ? nodeGraphModuleScopeDiscontinuityFixedSkipCount : 0;
  }
  return typeof normalizeNodeGraphModuleScopeDiscontinuitySkipSamples === "function"
    ? normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(nodeGraphMvp?.moduleScopeDiscontinuitySkipSamples ?? 1)
    : 1;
}

function nodeGraphModuleScopeDiscontinuitySkipSamplesForPoints(points) {
  if (points?.nodeGraphScopeDisableDiscontinuitySkip === true) {
    return 0;
  }
  if (Number.isFinite(Number(points?.nodeGraphScopeDiscontinuitySkipSamples))) {
    return Math.min(nodeGraphModuleScopeDiscontinuityFixedSkipCount, Math.max(0, Math.round(Number(points.nodeGraphScopeDiscontinuitySkipSamples))));
  }
  return typeof normalizeNodeGraphModuleScopeDiscontinuitySkipSamples === "function"
    ? normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(nodeGraphMvp?.moduleScopeDiscontinuitySkipSamples ?? 1)
    : 1;
}

function nodeGraphModuleScopeTraceEdgePaddingRatio(slot, rect) {
  if (nodeGraphModuleDisplayRendererForSlot(slot) !== "trace") {
    return 0.08;
  }
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const activePasses = [];
  if (settings.dot1Enabled !== false && settings.brightness > 0) {
    activePasses.push({
      blur: clampNodeSliderValue(settings.lineThickness, 0, 1),
      size: clampNodeSliderValue(settings.dot1Size, 0, 1),
    });
  }
  const stereoTrace = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    ? nodeGraphModuleUsesStereoTraceDisplay(slot?.type)
    : slot?.type === "output";
  if (stereoTrace && settings.secondaryEnabled !== false && settings.secondaryBrightness > 0) {
    activePasses.push({
      blur: clampNodeSliderValue(settings.secondaryLineThickness, 0, 1),
      size: clampNodeSliderValue(settings.secondarySize, 0, 1),
    });
  }
  // Match exp size map: diameter fraction = side^(t-1) ≈ size face occupancy.
  const faceSide = Math.max(1, Number(rect?.height) || Number(rect?.width) || 256);
  const visualPadding = activePasses.reduce((largest, pass) => {
    const diam = typeof nodeGraphScopeSize01ToDiameterPx === "function"
      ? nodeGraphScopeSize01ToDiameterPx(faceSide, pass.size)
      : Math.max(1, Math.pow(faceSide, clampNodeSliderValue(pass.size, 0, 1)));
    const frac = diam / faceSide;
    const padding = frac * (0.22 + pass.blur * 0.16);
    return Math.max(largest, padding);
  }, 0);
  const pixelPadding = rect?.height > 0 ? 3 / rect.height : 0;
  return clampNodeSliderValue(Math.max(0.06, visualPadding, pixelPadding), 0, 0.24);
}

function nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect = null) {
  if (nodeGraphModuleDisplayRendererForSlot(slot) !== "trace") {
    return 0.42;
  }
  return clampNodeSliderValue(0.5 - nodeGraphModuleScopeTraceEdgePaddingRatio(slot, rect), 0.24, 0.5);
}

function nodeGraphModuleScopeBufferSegmentPoints(
  buffer,
  rect,
  canvas,
  pixelRatio,
  slot,
  startProgress,
  endProgress,
  options = {},
) {
  const points = [];
  if (!buffer?.length || rect.width <= 1 || rect.height <= 1) {
    return points;
  }
  const clippedRange = nodeGraphModuleScopeProgressRangeIntersection(
    [startProgress, endProgress],
    options.visibleProgressRange,
  );
  if (!clippedRange) {
    return points;
  }
  const [start, end] = clippedRange;
  const drawSpan = end - start;
  if (drawSpan <= 0.001) {
    return points;
  }
  const traceDisplayMode = nodeGraphModuleDisplayRendererForSlot(slot) === "trace";
  const timing = traceDisplayMode ? options.traceTiming : null;
  const bufferViewStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  const view = nodeGraphModuleScopeBufferView(buffer, slot);
  if (timing) {
    timing.bufferViewMs += Math.max(0, nodeGraphModuleScopeNowMs() - bufferViewStartMs);
  }
  if (traceDisplayMode && view.end <= view.start) {
    return points;
  }
  const visibleSamples = Math.max(1, view.end - view.start);
  const spectrumMode = buffer?.nodeGraphScopeSpectrum === true;
  const holdPointMode = buffer?.nodeGraphScopeHoldPoint === true;
  const midY = spectrumMode
    ? rect.top + rect.height
    : rect.top + rect.height * 0.5;
  const halfHeight = spectrumMode
    ? rect.height
    : rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect);
  const metricRect = nodeGraphModuleScopeVisibleMetricRect(rect, options);
  const sampleWidth = nodeGraphModuleScopeRenderedSampleWidth(metricRect);
  const metricDrawSpan = metricRect === rect ? drawSpan : 1;
  const visibleSampleWidth = sampleWidth * metricDrawSpan;
  const minPointSpacingPx = clampNodeSliderValue(Number(buffer.nodeGraphScopeMinPointSpacingPx) || 0.5, 0.25, 32);
  const visualPointLimit = Math.max(2, Math.min(32768, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || 32768)));
  const pointCount = spectrumMode
    ? Math.max(2, Math.min(visualPointLimit, Math.ceil(visibleSamples)))
    : holdPointMode
      ? 1
      : Math.max(2, Math.min(
      visualPointLimit,
      Math.ceil(visibleSampleWidth / minPointSpacingPx),
    ));
  const rawValues = [];
  const skippedPoints = [];
  const discontinuitySkipDisabled = buffer?.nodeGraphScopeDisableDiscontinuitySkip === true;
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot(slot, buffer);
  const holdPointX = clampNodeSliderValue(Number(buffer.nodeGraphScopeHoldPointX) || 0.5, 0, 1);
  const holdPointSamplePosition = Number(buffer.nodeGraphScopeHoldPointSamplePosition);
  const holdSample = Number.isFinite(holdPointSamplePosition)
    ? clampNodeSliderValue(holdPointSamplePosition, 0, Math.max(0, buffer.length - 1))
    : view.start;
  const pointGenerationStartMs = timing ? nodeGraphModuleScopeNowMs() : 0;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const progress = holdPointMode
      ? holdPointX
      : spectrumMode
      ? start + (pointIndex / Math.max(1, pointCount - 1)) * drawSpan
      : start + ((pointIndex + 0.5) / pointCount) * drawSpan;
    const samplePosition = holdPointMode
      ? holdSample
      : spectrumMode
      ? view.start + progress * Math.max(0, visibleSamples - 1)
      : view.start + progress * visibleSamples;
    const x = rect.left + progress * rect.width;
    const sampleInfo = nodeGraphModuleScopeSampleInfo(buffer, samplePosition);
    const rawValue = sampleInfo.value;
    const value = spectrumMode
      ? clampNodeSliderValue(rawValue, 0, 1)
      : clampNodeSliderValue((rawValue * view.gain) + view.offset, -1, 1);
    const y = midY - value * halfHeight;
    rawValues.push(Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0);
    skippedPoints.push(!spectrumMode && skipSamples > 0 && sampleInfo.discontinuity);
    points.push(
      ((x * pixelRatio) / canvas.width) * 2 - 1,
      1 - ((y * pixelRatio) / canvas.height) * 2,
    );
  }
  if (timing) {
    timing.pointGenerationMs += Math.max(0, nodeGraphModuleScopeNowMs() - pointGenerationStartMs);
  }
  if (!spectrumMode) {
    points.nodeGraphScopeRawValues = rawValues;
    points.nodeGraphScopeSkippedPoints = skippedPoints;
    points.nodeGraphScopeUniformAge = false;
    points.nodeGraphScopeDisableDiscontinuitySkip = discontinuitySkipDisabled;
    points.nodeGraphScopeDiscontinuitySkipSamples = skipSamples;
  }
  return points;
}

function nodeGraphModuleScopeBufferPoints(buffer, rect, canvas, pixelRatio, slot) {
  const range = nodeGraphModuleScopeBufferProgressRanges(buffer)[0] || [0, 1];
  return nodeGraphModuleScopeBufferSegmentPoints(buffer, rect, canvas, pixelRatio, slot, range[0], range[1]);
}

function nodeGraphModuleScopeCenteredSquareRect(rect) {
  const size = Math.max(1, Math.min(Number(rect?.width) || 0, Number(rect?.height) || 0));
  return {
    height: size,
    left: (Number(rect?.left) || 0) + ((Number(rect?.width) || size) - size) * 0.5,
    top: (Number(rect?.top) || 0) + ((Number(rect?.height) || size) - size) * 0.5,
    width: size,
  };
}

function nodeGraphModuleScopePaddedRect(rect, padding = 0) {
  const width = Math.max(1, Number(rect?.width) || 0);
  const height = Math.max(1, Number(rect?.height) || 0);
  const safePadding = clampNodeSliderValue(Number(padding) || 0, 0, 0.45);
  const inset = Math.min(width, height) * safePadding;
  return {
    height: Math.max(1, height - inset * 2),
    left: (Number(rect?.left) || 0) + inset,
    top: (Number(rect?.top) || 0) + inset,
    width: Math.max(1, width - inset * 2),
  };
}

function nodeGraphModuleScopeDrawingRect(rect, buffer = null, slot = null) {
  const shaderPadding = Number.isFinite(Number(buffer?.nodeGraphScopeShaderPadding))
    ? Number(buffer.nodeGraphScopeShaderPadding)
    : Number(nodeGraphModuleScopeShaderConfigForSlot(slot).padding);
  const paddedRect = nodeGraphModuleScopePaddedRect(rect, shaderPadding);
  if (buffer?.nodeGraphScopeXy) {
    return nodeGraphModuleScopeCenteredSquareRect(paddedRect);
  }
  return paddedRect;
}

function nodeGraphModuleScopeRectIntersection(rect, bounds) {
  const left = Math.max(Number(rect?.left) || 0, Number(bounds?.left) || 0);
  const top = Math.max(Number(rect?.top) || 0, Number(bounds?.top) || 0);
  const right = Math.min(
    (Number(rect?.left) || 0) + (Number(rect?.width) || 0),
    (Number(bounds?.left) || 0) + (Number(bounds?.width) || 0),
  );
  const bottom = Math.min(
    (Number(rect?.top) || 0) + (Number(rect?.height) || 0),
    (Number(bounds?.top) || 0) + (Number(bounds?.height) || 0),
  );
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0
    ? { height, left, top, width }
    : null;
}

function nodeGraphModuleScopeVisibleDrawGeometry(screenRect, drawRect, viewportRect, zoomScale = nodeGraphModuleScopeZoomScale()) {
  const screenW = Number(screenRect?.width) || 0;
  const screenH = Number(screenRect?.height) || 0;
  // 0×0 layout rects (pre-reflow) used to fail intersection and skip the face.
  // Treat tiny/unknown sizes as fully visible so phosphor still deposits.
  if (!(screenW > 0.5) || !(screenH > 0.5)) {
    const fallbackDraw = drawRect && Number(drawRect.width) > 0 && Number(drawRect.height) > 0
      ? drawRect
      : screenRect;
    const fw = Math.max(1, Number(fallbackDraw?.width) || 1);
    const fh = Math.max(1, Number(fallbackDraw?.height) || 1);
    const fl = Number(fallbackDraw?.left) || 0;
    const ft = Number(fallbackDraw?.top) || 0;
    return {
      visibleDrawRect: { left: fl, top: ft, width: fw, height: fh },
      visibleProgressRange: [0, 1],
      visibleScopeRect: {
        height: fh,
        left: fl,
        sampleHeight: nodeGraphModuleScopeUnzoomedLength(fh, zoomScale),
        sampleWidth: nodeGraphModuleScopeUnzoomedLength(fw, zoomScale),
        top: ft,
        width: fw,
      },
    };
  }
  if (
    !nodeGraphModuleScopeRectIntersection(screenRect, viewportRect) ||
    !Number.isFinite(Number(drawRect?.width)) ||
    !Number.isFinite(Number(drawRect?.height))
  ) {
    return null;
  }
  const visibleDrawRect = nodeGraphModuleScopeRectIntersection(drawRect, viewportRect);
  if (!visibleDrawRect) {
    return null;
  }
  const leftProgress = ((visibleDrawRect.left - drawRect.left) / Math.max(1, drawRect.width));
  const rightProgress = (((visibleDrawRect.left + visibleDrawRect.width) - drawRect.left) / Math.max(1, drawRect.width));
  const visibleProgressRange = [
    clampNodeSliderValue(leftProgress, 0, 1),
    clampNodeSliderValue(rightProgress, 0, 1),
  ];
  if (visibleProgressRange[1] - visibleProgressRange[0] <= 0.001) {
    return null;
  }
  return {
    visibleDrawRect,
    visibleProgressRange,
    visibleScopeRect: {
      height: visibleDrawRect.height,
      left: visibleDrawRect.left,
      sampleHeight: nodeGraphModuleScopeUnzoomedLength(visibleDrawRect.height, zoomScale),
      sampleWidth: nodeGraphModuleScopeUnzoomedLength(visibleDrawRect.width, zoomScale),
      top: visibleDrawRect.top,
      width: visibleDrawRect.width,
    },
  };
}

function nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot) {
  const points = [];
  if (!buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length || rect.width <= 1 || rect.height <= 1) {
    return points;
  }
  const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot);
  const gain = nodeGraphModuleScopeVisualGain(settings);
  const length = Math.min(buffer.x.length, buffer.y.length);
  const square = nodeGraphModuleScopeCenteredSquareRect(rect);
  const centerX = square.left + square.width * 0.5;
  const centerY = square.top + square.height * 0.5;
  const radius = Math.max(1, square.width * 0.44);
  for (let index = 0; index < length; index += 1) {
    const x = centerX + clampNodeSliderValue((Number(buffer.x[index]) || 0) * gain, -1, 1) * radius;
    const y = centerY - clampNodeSliderValue((Number(buffer.y[index]) || 0) * gain, -1, 1) * radius;
    points.push(
      ((x * pixelRatio) / canvas.width) * 2 - 1,
      1 - ((y * pixelRatio) / canvas.height) * 2,
    );
  }
  return points;
}

function nodeGraphModuleScopePixelPoints(points, canvas) {
  const pixelPoints = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    pixelPoints.push(
      ((points[index] + 1) * 0.5) * canvas.width,
      ((1 - points[index + 1]) * 0.5) * canvas.height,
    );
  }
  return pixelPoints;
}

function appendNodeGraphModuleScopeVertices(target, source) {
  if (!Array.isArray(target) || !source?.length) {
    return target;
  }
  for (let index = 0; index < source.length; index += 1) {
    target.push(source[index]);
  }
  return target;
}

function nodeGraphModuleScopeBeamVertices(points, canvas) {
  const pixelPoints = nodeGraphModuleScopePixelPoints(points, canvas);
  const vertices = [];
  const segmentCount = Math.max(1, (pixelPoints.length / 2) - 1);
  const corners = [0, 1, 2, 2, 1, 3];
  const rawValues = Array.isArray(points?.nodeGraphScopeRawValues)
    ? points.nodeGraphScopeRawValues
    : null;
  const skippedPoints = Array.isArray(points?.nodeGraphScopeSkippedPoints)
    ? points.nodeGraphScopeSkippedPoints
    : null;
  const skipSamples = nodeGraphModuleScopeDiscontinuitySkipSamplesForPoints(points);
  for (let index = 0; index + 3 < pixelPoints.length; index += 2) {
    const segmentIndex = index / 2;
    if (skippedPoints?.[segmentIndex] || skippedPoints?.[segmentIndex + 1]) {
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
        // Skip only this wrap segment. Do not drop the following vertices.
        continue;
      }
    }
    const x1 = pixelPoints[index];
    const y1 = pixelPoints[index + 1];
    const x2 = pixelPoints[index + 2];
    const y2 = pixelPoints[index + 3];
    const lengthPx = Math.hypot(x2 - x1, y2 - y1);
    if (lengthPx < 0.001) {
      continue;
    }
    const segmentProgress = points?.nodeGraphScopeUniformAge === true ? 1 : (index / 2) / segmentCount;
    for (const corner of corners) {
      vertices.push(x1, y1, x2, y2, corner, segmentProgress);
    }
  }
  return vertices;
}

