// Scope render metrics / GPU debug helpers peeled from module-scopes.js (Phase D).
// Load after scopes.js. Extract-only.

function beginNodeGraphModuleScopeRenderMetricsFrame() {
  const metrics = nodeGraphModuleScopeState.renderMetrics || {};
  metrics.drawCalls = 0;
  metrics.points = 0;
  metrics.vertices = 0;
  nodeGraphModuleScopeState.renderMetrics = metrics;
  return metrics;
}

function recordNodeGraphModuleScopeRenderMetrics(pointCount = 0, vertexCount = 0) {
  const metrics = nodeGraphModuleScopeState.renderMetrics || beginNodeGraphModuleScopeRenderMetricsFrame();
  metrics.drawCalls = (Number(metrics.drawCalls) || 0) + 1;
  metrics.points += Math.max(0, Math.floor(Number(pointCount) || 0));
  metrics.vertices += Math.max(0, Math.floor(Number(vertexCount) || 0));
}

function nodeGraphModuleScopeNowMs() {
  return performance.now?.() || Date.now();
}

function nodeGraphTraceDisplayTimingEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.nodeGraphTraceDisplayTimingEnabled === true ||
    window.localStorage?.getItem?.("nodeGraphTraceDisplayTiming") === "1";
}

function nodeGraphTraceDisplayTimingObject(slot) {
  if (!nodeGraphTraceDisplayTimingEnabled()) {
    return null;
  }
  return {
    bufferViewMs: 0,
    drawArraysMs: 0,
    frameStartMs: nodeGraphModuleScopeNowMs(),
    glBufferDataMs: 0,
    nodeId: String(slot?.nodeId || ""),
    passes: 0,
    pointGenerationMs: 0,
    points: 0,
    totalMs: 0,
    vertexGenerationMs: 0,
    vertices: 0,
  };
}

function nodeGraphTraceDisplayBufferContentFingerprint(buffer) {
  if (!buffer?.length) {
    return "0";
  }
  // Cheap content probe so a full ring that keeps rewriting samples still
  // invalidates the draw cache even if retained count plateaus at capacity.
  const n = buffer.length;
  const i0 = Math.max(0, n - 1);
  const i1 = Math.max(0, n - 2);
  const i2 = Math.max(0, Math.floor(n * 0.5));
  const i3 = 0;
  const q = (i) => Math.round((Number(buffer[i]) || 0) * 1e4);
  return `${q(i0)}:${q(i1)}:${q(i2)}:${q(i3)}`;
}

function nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings) {
  const nodeId = String(slot?.nodeId || "");
  // Output / stereo faces paint from port rings — include those versions so the
  // cache cannot freeze on a stale mono key while L/R keep advancing.
  let stereoSig = "";
  if (
    nodeId
    && typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    && nodeGraphModuleUsesStereoTraceDisplay(slot?.type)
    && typeof nodeGraphModuleScopeState !== "undefined"
    && nodeGraphModuleScopeState?.buffers
  ) {
    const ports = typeof nodeGraphModuleStereoTracePorts === "function"
      ? nodeGraphModuleStereoTracePorts(slot?.type)
      : { left: "Left", right: "Right" };
    const left = ports ? nodeGraphModuleScopeState.buffers.get(`${nodeId}:${ports.left}`) : null;
    const right = ports ? nodeGraphModuleScopeState.buffers.get(`${nodeId}:${ports.right}`) : null;
    stereoSig = [
      Number(left?.nodeGraphScopeVersion) || 0,
      Math.floor(Number(left?.nodeGraphScopeTotalSampleCount) || 0),
      nodeGraphTraceDisplayBufferContentFingerprint(left),
      Number(right?.nodeGraphScopeVersion) || 0,
      Math.floor(Number(right?.nodeGraphScopeTotalSampleCount) || 0),
      nodeGraphTraceDisplayBufferContentFingerprint(right),
    ].join(",");
  }
  return [
    Number(buffer?.nodeGraphScopeVersion) || 0,
    nodeGraphScopeAvailableSampleCount(buffer),
    // Strip chart advances on absolute sample count, not just retained length.
    Math.floor(Number(buffer?.nodeGraphScopeTotalSampleCount) || 0),
    nodeGraphTraceDisplayBufferContentFingerprint(buffer),
    stereoSig,
    Math.round(Number(item?.scopeRect?.left) || 0),
    Math.round(Number(item?.scopeRect?.top) || 0),
    Math.round(Number(item?.scopeRect?.width) || 0),
    Math.round(Number(item?.scopeRect?.height) || 0),
    Math.round((Number(item?.visibleProgressRange?.[0]) || 0) * 10000),
    Math.round((Number(item?.visibleProgressRange?.[1]) || 0) * 10000),
    settings.zoomSeconds,
    Number.isFinite(Number(settings.fade)) ? Number(settings.fade) : 0,
    settings.padding,
    Number(settings.scale) || 1,
    settings.skipDiscontinuities ? 1 : 0,
    settings.lineThickness,
    settings.brightness,
    settings.color,
    settings.secondaryLineThickness,
    settings.secondaryBrightness,
    settings.secondaryColor,
    settings.stereoBlend || "combine",
    settings.meetColor || "auto",
    // Keep 0 density as 0 (Number(0) || 1 would wrongly snap to 1).
    Number.isFinite(Number(settings.pixelDensity)) ? Number(settings.pixelDensity) : 1,
    settings.background || settings.backgroundColor || "",
    settings.sourceSync === false ? 0 : 1,
    settings.syncChannel || "off",
    Math.round((Number(globalThis.nodeGraphOutputProtectMute) || 0) * 1000),
  ].join("|");
}

function nodeGraphTraceDisplaySignatureUnchanged(slot, item, buffer, settings) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return false;
  }
  const signature = nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings);
  return nodeGraphModuleScopeState.traceDisplayDrawCache.get(nodeId) === signature;
}

function rememberNodeGraphTraceDisplaySignature(slot, item, buffer, settings) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return;
  }
  nodeGraphModuleScopeState.traceDisplayDrawCache.set(
    nodeId,
    nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings),
  );
}

function finishNodeGraphTraceDisplayTiming(timing) {
  if (!timing) {
    return;
  }
  timing.totalMs = Math.max(0, nodeGraphModuleScopeNowMs() - timing.frameStartMs);
  const debug = nodeGraphModuleScopeDebugState();
  debug.traceDisplayTiming = {
    bufferViewMs: Number(timing.bufferViewMs.toFixed(3)),
    drawArraysMs: Number(timing.drawArraysMs.toFixed(3)),
    glBufferDataMs: Number(timing.glBufferDataMs.toFixed(3)),
    nodeId: timing.nodeId,
    passes: timing.passes,
    pointGenerationMs: Number(timing.pointGenerationMs.toFixed(3)),
    points: timing.points,
    totalMs: Number(timing.totalMs.toFixed(3)),
    vertexGenerationMs: Number(timing.vertexGenerationMs.toFixed(3)),
    vertices: timing.vertices,
  };
  const now = nodeGraphModuleScopeNowMs();
  if (typeof console !== "undefined" && now - (Number(debug.traceDisplayTimingLastLogMs) || 0) > 500) {
    debug.traceDisplayTimingLastLogMs = now;
    console.table([debug.traceDisplayTiming]);
  }
}

function nodeGraphModuleScopeDebugState() {
  const debug = nodeGraphModuleScopeState.renderDebug || {};
  nodeGraphModuleScopeState.renderDebug = debug;
  return debug;
}

function setNodeGraphModuleScopeDebugPhase(phase, extra = {}) {
  const debug = nodeGraphModuleScopeDebugState();
  debug.phase = String(phase || "idle");
  Object.assign(debug, extra);
  return debug;
}

function markNodeGraphModuleScopeDebugSkip(reason) {
  const debug = setNodeGraphModuleScopeDebugPhase("skip", {
    lastSkipReason: String(reason || "unknown"),
  });
  debug.skippedFrames = (Number(debug.skippedFrames) || 0) + 1;
  pushNodeGraphModuleScopeDebugHistory(`skip:${debug.lastSkipReason}`);
  syncNodeGraphScopeGpuDebugDisplay();
}

function nodeGraphModuleScopeDebugSnapshot() {
  const debug = nodeGraphModuleScopeState.renderDebug || {};
  return {
    buffers: nodeGraphModuleScopeState.buffers.size,
    drawableSlots: nodeGraphVisibleModuleScopeSlots().length,
    enabled: nodeGraphModuleScopesEnabled(),
    lastSkipReason: debug.lastSkipReason || "",
    phase: debug.phase || "",
    scopeSlots: Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [],
    totalSlots: nodeGraphModuleScopeSlots().length,
    visibleItems: Number(debug.visibleItems) || 0,
  };
}

window.nodeGraphModuleScopeDebugSnapshot = nodeGraphModuleScopeDebugSnapshot;

function markNodeGraphModuleScopeDebugError(error) {
  const message = error?.message || String(error || "unknown error");
  setNodeGraphModuleScopeDebugPhase("error", {
    lastError: message.slice(0, 160),
    lastFrameEndMs: nodeGraphModuleScopeNowMs(),
  });
  pushNodeGraphModuleScopeDebugHistory("error");
  syncNodeGraphScopeGpuDebugDisplay();
}

function pushNodeGraphModuleScopeDebugHistory(reason = "frame") {
  const debug = nodeGraphModuleScopeDebugState();
  const history = Array.isArray(debug.debugHistory) ? debug.debugHistory : [];
  const now = nodeGraphModuleScopeNowMs();
  const entry = {
    ageMs: Math.max(0, now - (Number(debug.lastFrameEndMs) || now)),
    canvasHeight: Math.max(0, Math.floor(Number(debug.canvasHeight) || 0)),
    canvasWidth: Math.max(0, Math.floor(Number(debug.canvasWidth) || 0)),
    drawMs: Math.max(0, Number(debug.lastDrawMs) || 0),
    error: debug.lastError || "",
    phase: debug.phase || "idle",
    pixelRatio: Number(debug.pixelRatio) || 0,
    points: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.points) || 0)),
    reason: String(reason || "frame"),
    skippedFrames: Math.max(0, Math.floor(Number(debug.skippedFrames) || 0)),
    timeMs: now,
    totalSlots: Math.max(0, Math.floor(Number(debug.totalSlots) || 0)),
    vertices: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.vertices) || 0)),
    visibleItems: Math.max(0, Math.floor(Number(debug.visibleItems) || 0)),
    zoom: Number(debug.zoom) || 0,
  };
  history.push(entry);
  if (history.length > 120) {
    history.splice(0, history.length - 120);
  }
  debug.debugHistory = history;
  if (typeof window !== "undefined") {
    window.nodeGraphScopeDebugSnapshot = () => ({
      current: { ...nodeGraphModuleScopeDebugState() },
      metrics: { ...(nodeGraphModuleScopeState.renderMetrics || {}) },
      history: [...(nodeGraphModuleScopeDebugState().debugHistory || [])],
    });
  }
  return entry;
}

function commitNodeGraphModuleScopeRenderMetricsFrame(nowSeconds = (performance.now?.() || Date.now()) / 1000) {
  const metrics = nodeGraphModuleScopeState.renderMetrics || beginNodeGraphModuleScopeRenderMetricsFrame();
  const debug = nodeGraphModuleScopeDebugState();
  const now = Math.max(0, Number(nowSeconds) || 0);
  metrics.fpsFrames = (Number(metrics.fpsFrames) || 0) + 1;
  debug.committedFrames = (Number(debug.committedFrames) || 0) + 1;
  debug.lastFrameEndMs = nodeGraphModuleScopeNowMs();
  debug.lastDrawMs = Math.max(0, debug.lastFrameEndMs - (Number(debug.lastFrameStartMs) || debug.lastFrameEndMs));
  const last = Number(metrics.fpsLastTime) || 0;
  if (!last) {
    metrics.fpsLastTime = now;
  } else if (now - last >= 0.5) {
    metrics.fps = metrics.fpsFrames / Math.max(0.001, now - last);
    metrics.fpsFrames = 0;
    metrics.fpsLastTime = now;
    const samples = Math.max(1, Number(metrics.pointsSamples) || 0);
    const sum = Math.max(0, Number(metrics.pointsSum) || 0);
    metrics.pointsAvg = Math.round(sum / samples);
    metrics.pointsSum = 0;
    metrics.pointsSamples = 0;
  }
  // FPS-gate / empty ticks would otherwise flash 0. Average only real draws.
  if ((Number(metrics.drawCalls) || 0) > 0 || (Number(metrics.points) || 0) > 0) {
    metrics.pointsSum = (Number(metrics.pointsSum) || 0) + Math.max(0, Number(metrics.points) || 0);
    metrics.pointsSamples = (Number(metrics.pointsSamples) || 0) + 1;
  }
  pushNodeGraphModuleScopeDebugHistory("commit");
  syncNodeGraphScopeGpuMetricsDisplay();
}

function formatNodeGraphScopeGpuMetricFixedNumber(value, digits = 6) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const width = Math.max(1, Math.floor(Number(digits) || 1));
  const max = (10 ** width) - 1;
  return String(Math.min(count, max)).padStart(width, "0");
}

function formatNodeGraphScopeGpuMetricFps(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    return "---.-";
  }
  return Math.min(999.9, Math.max(0, fps)).toFixed(1).padStart(5, "0");
}

function syncNodeGraphScopeGpuMetricsDisplay() {
  const root = document.getElementById("nodeScopeGpuMetrics");
  if (!root) {
    return;
  }
  const metrics = nodeGraphModuleScopeState.renderMetrics || {};
  const constraint = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.constraintResourceMetrics : null;
  const fps = Number(metrics.fps) || Number(constraint?.mainFrameRate) || 0;
  const points = Math.max(
    0,
    Math.floor(Number(metrics.pointsAvg) || Number(metrics.points) || 0),
  );
  const vertices = Math.max(0, Math.floor(Number(metrics.vertices) || 0));
  const contexts = document.querySelectorAll(
    "#nodeGraphWorkspace canvas, #nodeGraphWorkspace .node-module-scope-webgl",
  ).length;
  const fpsElement = root.querySelector("[data-scope-gpu-metric='fps']");
  const pointsElement = root.querySelector("[data-scope-gpu-metric='points']");
  const ctxElement = root.querySelector("[data-scope-gpu-metric='contexts']");
  if (fpsElement) {
    fpsElement.textContent = Number.isFinite(fps) && fps > 0 ? String(Math.round(Math.min(999, fps))) : "--";
  }
  if (pointsElement) {
    pointsElement.textContent = points > 9999
      ? `${Math.round(points / 1000)}k`
      : String(points);
  }
  if (ctxElement) {
    ctxElement.textContent = String(contexts);
  }
  root.dataset.scopePoints = String(points);
  root.dataset.scopeVertices = String(vertices);
  root.title = `Surfaces: ${contexts} canvas/WebGL faces. Stamps: ~${points} phosphor dabs or trace points per draw (½ s average).`;
}

function nodeGraphScopeGpuMetricsVisible(root = document.getElementById("nodeScopeGpuMetrics")) {
  return Boolean(root && document.body.classList.contains("node-constraint-gpu-active"));
}

function formatNodeGraphScopeGpuDebugNumber(value, digits = 3) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  return String(number).padStart(Math.max(1, digits), "0");
}

function formatNodeGraphScopeGpuDebugMs(value) {
  const number = Math.max(0, Number(value) || 0);
  return Math.min(9999, number).toFixed(number >= 100 ? 0 : 1).padStart(5, "0");
}

function syncNodeGraphScopeGpuDebugDisplay() {
  const root = document.getElementById("nodeScopeGpuMetrics");
  const debugElement = root?.querySelector("[data-scope-gpu-debug='summary']");
  if (!root || !debugElement) {
    return;
  }
  const debug = nodeGraphModuleScopeDebugState();
  const now = nodeGraphModuleScopeNowMs();
  const pendingAt = Number(nodeGraphModuleScopeState.drawFrameRequestedAt) || 0;
  const pendingAge = nodeGraphModuleScopeState.drawFrame && pendingAt > 0 ? Math.max(0, now - pendingAt) : 0;
  const lastEnd = Number(debug.lastFrameEndMs) || 0;
  const frameAge = lastEnd > 0 ? Math.max(0, now - lastEnd) : 0;
  debug.pendingAgeMs = pendingAge;
  debug.lastHeartbeatMs = now;
  const error = debug.lastError ? ` err:${debug.lastError}` : "";
  const slotSummary = (Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [])
    .filter((slot) => ["scope2d", "scope2dTrace", "traceDisplay", "lineBurnOscilloscope", "dotOscilloscope", "valueOscilloscope"].includes(slot?.type))
    .map((slot) => {
      const id = String(slot.nodeId || slot.type || "?").replace(/Oscilloscope|Display/g, "");
      const length = Math.max(0, Math.floor(Number(slot.bufferLength) || 0));
      return `${id}:${slot.displayType || slot.type}:${length}${slot.skip ? `:${slot.skip}` : ""}`;
    })
    .slice(0, 6);
  if (!nodeGraphScopeGpuMetricsVisible(root)) {
    root.dataset.debugSnapshot = "";
    debugElement.textContent = "debug --";
    return;
  }
  const snapshot = {
    canvas: `${Math.max(0, Math.floor(Number(debug.canvasWidth) || 0))}x${Math.max(0, Math.floor(Number(debug.canvasHeight) || 0))}`,
    drawMs: Math.max(0, Number(debug.lastDrawMs) || 0),
    error: debug.lastError || "",
    frameAgeMs: frameAge,
    historyTail: (Array.isArray(debug.debugHistory) ? debug.debugHistory : []).slice(-12),
    pendingAgeMs: pendingAge,
    phase: debug.phase || "idle",
    pixelRatio: Number(debug.pixelRatio) || 0,
    points: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.points) || 0)),
    scopeSlots: Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [],
    slots: `${Math.max(0, Math.floor(Number(debug.visibleItems) || 0))}/${Math.max(0, Math.floor(Number(debug.totalSlots) || 0))}`,
    vertices: Math.max(0, Math.floor(Number(nodeGraphModuleScopeState.renderMetrics?.vertices) || 0)),
    zoom: Number(debug.zoom) || 0,
  };
  root.dataset.debugSnapshot = JSON.stringify(snapshot);
  debugElement.textContent = [
    `z${(Number(debug.zoom) || 0).toFixed(2)}`,
    `age${formatNodeGraphScopeGpuDebugMs(frameAge)}ms`,
    `draw${formatNodeGraphScopeGpuDebugMs(debug.lastDrawMs)}ms`,
    `pend${formatNodeGraphScopeGpuDebugMs(pendingAge)}ms`,
    `slots${formatNodeGraphScopeGpuDebugNumber(debug.visibleItems, 2)}/${formatNodeGraphScopeGpuDebugNumber(debug.totalSlots, 2)}`,
    `cv${formatNodeGraphScopeGpuDebugNumber(debug.canvasWidth, 4)}x${formatNodeGraphScopeGpuDebugNumber(debug.canvasHeight, 4)}`,
    `pr${(Number(debug.pixelRatio) || 0).toFixed(2)}`,
    slotSummary.length ? `scope:${slotSummary.join(",")}` : "",
    `phase:${debug.phase || "idle"}`,
    debug.lastSkipReason ? `skip:${debug.lastSkipReason}` : "",
  ].filter(Boolean).join(" ") + error;
}

