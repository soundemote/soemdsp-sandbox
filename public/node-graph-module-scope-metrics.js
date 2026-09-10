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
  metrics.drawCalls = (nodeGraphFiniteNumber(metrics.drawCalls)) + 1;
  metrics.points += Math.max(0, Math.floor(nodeGraphFiniteNumber(pointCount)));
  metrics.vertices += Math.max(0, Math.floor(nodeGraphFiniteNumber(vertexCount)));
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
  const q = (i) => Math.round((nodeGraphFiniteNumber(buffer[i])) * 1e4);
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
      nodeGraphFiniteNumber(left?.nodeGraphScopeVersion),
      Math.floor(nodeGraphFiniteNumber(left?.nodeGraphScopeTotalSampleCount)),
      nodeGraphTraceDisplayBufferContentFingerprint(left),
      nodeGraphFiniteNumber(right?.nodeGraphScopeVersion),
      Math.floor(nodeGraphFiniteNumber(right?.nodeGraphScopeTotalSampleCount)),
      nodeGraphTraceDisplayBufferContentFingerprint(right),
    ].join(",");
  }
  return [
    nodeGraphFiniteNumber(buffer?.nodeGraphScopeVersion),
    nodeGraphScopeAvailableSampleCount(buffer),
    // Strip chart advances on absolute sample count, not just retained length.
    Math.floor(nodeGraphFiniteNumber(buffer?.nodeGraphScopeTotalSampleCount)),
    nodeGraphTraceDisplayBufferContentFingerprint(buffer),
    stereoSig,
    Math.round(nodeGraphFiniteNumber(item?.scopeRect?.left)),
    Math.round(nodeGraphFiniteNumber(item?.scopeRect?.top)),
    Math.round(nodeGraphFiniteNumber(item?.scopeRect?.width)),
    Math.round(nodeGraphFiniteNumber(item?.scopeRect?.height)),
    Math.round((nodeGraphFiniteNumber(item?.visibleProgressRange?.[0])) * 10000),
    Math.round((nodeGraphFiniteNumber(item?.visibleProgressRange?.[1])) * 10000),
    settings.zoomSeconds,
    Number.isFinite(Number(settings.fade)) ? Number(settings.fade) : 0,
    settings.padding,
    nodeGraphFiniteNumber(settings.scale, 1),
    settings.skipDiscontinuities ? 1 : 0,
    settings.lineThickness,
    settings.brightness,
    settings.color,
    settings.secondaryLineThickness,
    settings.secondaryBrightness,
    settings.secondaryColor,
    settings.stereoBlend || "combine",
    settings.meetColor || "auto",
    // Keep 0 density as 0 (Number(0, 1) would wrongly snap to 1).
    Number.isFinite(Number(settings.pixelDensity)) ? Number(settings.pixelDensity) : 1,
    settings.background || settings.backgroundColor || "",
    settings.sourceSync === false ? 0 : 1,
    settings.syncChannel || "off",
    Math.round((nodeGraphFiniteNumber(globalThis.nodeGraphOutputProtectMute)) * 1000),
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
  if (typeof console !== "undefined" && now - (nodeGraphFiniteNumber(debug.traceDisplayTimingLastLogMs)) > 500) {
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
  debug.skippedFrames = (nodeGraphFiniteNumber(debug.skippedFrames)) + 1;
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
    visibleItems: nodeGraphFiniteNumber(debug.visibleItems),
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
    ageMs: Math.max(0, now - (nodeGraphFiniteNumber(debug.lastFrameEndMs, now))),
    canvasHeight: Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.canvasHeight))),
    canvasWidth: Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.canvasWidth))),
    drawMs: Math.max(0, nodeGraphFiniteNumber(debug.lastDrawMs)),
    error: debug.lastError || "",
    phase: debug.phase || "idle",
    pixelRatio: nodeGraphFiniteNumber(debug.pixelRatio),
    points: Math.max(0, Math.floor(nodeGraphFiniteNumber(nodeGraphModuleScopeState.renderMetrics?.points))),
    reason: String(reason || "frame"),
    skippedFrames: Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.skippedFrames))),
    timeMs: now,
    totalSlots: Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.totalSlots))),
    vertices: Math.max(0, Math.floor(nodeGraphFiniteNumber(nodeGraphModuleScopeState.renderMetrics?.vertices))),
    visibleItems: Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.visibleItems))),
    zoom: nodeGraphFiniteNumber(debug.zoom),
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
  const now = Math.max(0, nodeGraphFiniteNumber(nowSeconds));
  metrics.fpsFrames = (nodeGraphFiniteNumber(metrics.fpsFrames)) + 1;
  debug.committedFrames = (nodeGraphFiniteNumber(debug.committedFrames)) + 1;
  debug.lastFrameEndMs = nodeGraphModuleScopeNowMs();
  debug.lastDrawMs = Math.max(0, debug.lastFrameEndMs - (nodeGraphFiniteNumber(debug.lastFrameStartMs, debug.lastFrameEndMs)));
  const last = nodeGraphFiniteNumber(metrics.fpsLastTime);
  if (!last) {
    metrics.fpsLastTime = now;
  } else if (now - last >= 0.5) {
    metrics.fps = metrics.fpsFrames / Math.max(0.001, now - last);
    metrics.fpsFrames = 0;
    metrics.fpsLastTime = now;
    const samples = Math.max(1, nodeGraphFiniteNumber(metrics.pointsSamples));
    const sum = Math.max(0, nodeGraphFiniteNumber(metrics.pointsSum));
    metrics.pointsAvg = Math.round(sum / samples);
    metrics.pointsSum = 0;
    metrics.pointsSamples = 0;
  }
  // FPS-gate / empty ticks would otherwise flash 0. Average only real draws.
  if ((nodeGraphFiniteNumber(metrics.drawCalls)) > 0 || (nodeGraphFiniteNumber(metrics.points)) > 0) {
    metrics.pointsSum = (nodeGraphFiniteNumber(metrics.pointsSum)) + Math.max(0, nodeGraphFiniteNumber(metrics.points));
    metrics.pointsSamples = (nodeGraphFiniteNumber(metrics.pointsSamples)) + 1;
  }
  pushNodeGraphModuleScopeDebugHistory("commit");
  syncNodeGraphScopeGpuMetricsDisplay();
}

function formatNodeGraphScopeGpuMetricFixedNumber(value, digits = 6) {
  const count = Math.max(0, Math.floor(nodeGraphFiniteNumber(value)));
  const width = Math.max(1, Math.floor(nodeGraphFiniteNumber(digits, 1)));
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
  const fps = nodeGraphFiniteNumber(metrics.fps, nodeGraphFiniteNumber(constraint?.mainFrameRate));
  const points = Math.max(
    0,
    Math.floor(nodeGraphFiniteNumber(metrics.pointsAvg, nodeGraphFiniteNumber(metrics.points))),
  );
  const vertices = Math.max(0, Math.floor(nodeGraphFiniteNumber(metrics.vertices)));
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
  const number = Math.max(0, Math.floor(nodeGraphFiniteNumber(value)));
  return String(number).padStart(Math.max(1, digits), "0");
}

function formatNodeGraphScopeGpuDebugMs(value) {
  const number = Math.max(0, nodeGraphFiniteNumber(value));
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
  const pendingAt = nodeGraphFiniteNumber(nodeGraphModuleScopeState.drawFrameRequestedAt);
  const pendingAge = nodeGraphModuleScopeState.drawFrame && pendingAt > 0 ? Math.max(0, now - pendingAt) : 0;
  const lastEnd = nodeGraphFiniteNumber(debug.lastFrameEndMs);
  const frameAge = lastEnd > 0 ? Math.max(0, now - lastEnd) : 0;
  debug.pendingAgeMs = pendingAge;
  debug.lastHeartbeatMs = now;
  const error = debug.lastError ? ` err:${debug.lastError}` : "";
  const slotSummary = (Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [])
    .filter((slot) => ["scope2d", "scope2dTrace", "traceDisplay", "lineBurnOscilloscope", "dotOscilloscope", "valueOscilloscope"].includes(slot?.type))
    .map((slot) => {
      const id = String(slot.nodeId || slot.type || "?").replace(/Oscilloscope|Display/g, "");
      const length = Math.max(0, Math.floor(nodeGraphFiniteNumber(slot.bufferLength)));
      return `${id}:${slot.displayType || slot.type}:${length}${slot.skip ? `:${slot.skip}` : ""}`;
    })
    .slice(0, 6);
  if (!nodeGraphScopeGpuMetricsVisible(root)) {
    root.dataset.debugSnapshot = "";
    debugElement.textContent = "debug --";
    return;
  }
  const snapshot = {
    canvas: `${Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.canvasWidth)))}x${Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.canvasHeight)))}`,
    drawMs: Math.max(0, nodeGraphFiniteNumber(debug.lastDrawMs)),
    error: debug.lastError || "",
    frameAgeMs: frameAge,
    historyTail: (Array.isArray(debug.debugHistory) ? debug.debugHistory : []).slice(-12),
    pendingAgeMs: pendingAge,
    phase: debug.phase || "idle",
    pixelRatio: nodeGraphFiniteNumber(debug.pixelRatio),
    points: Math.max(0, Math.floor(nodeGraphFiniteNumber(nodeGraphModuleScopeState.renderMetrics?.points))),
    scopeSlots: Array.isArray(debug.scopeSlots) ? debug.scopeSlots : [],
    slots: `${Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.visibleItems)))}/${Math.max(0, Math.floor(nodeGraphFiniteNumber(debug.totalSlots)))}`,
    vertices: Math.max(0, Math.floor(nodeGraphFiniteNumber(nodeGraphModuleScopeState.renderMetrics?.vertices))),
    zoom: nodeGraphFiniteNumber(debug.zoom),
  };
  root.dataset.debugSnapshot = JSON.stringify(snapshot);
  debugElement.textContent = [
    `z${(nodeGraphFiniteNumber(debug.zoom)).toFixed(2)}`,
    `age${formatNodeGraphScopeGpuDebugMs(frameAge)}ms`,
    `draw${formatNodeGraphScopeGpuDebugMs(debug.lastDrawMs)}ms`,
    `pend${formatNodeGraphScopeGpuDebugMs(pendingAge)}ms`,
    `slots${formatNodeGraphScopeGpuDebugNumber(debug.visibleItems, 2)}/${formatNodeGraphScopeGpuDebugNumber(debug.totalSlots, 2)}`,
    `cv${formatNodeGraphScopeGpuDebugNumber(debug.canvasWidth, 4)}x${formatNodeGraphScopeGpuDebugNumber(debug.canvasHeight, 4)}`,
    `pr${(nodeGraphFiniteNumber(debug.pixelRatio)).toFixed(2)}`,
    slotSummary.length ? `scope:${slotSummary.join(",")}` : "",
    `phase:${debug.phase || "idle"}`,
    debug.lastSkipReason ? `skip:${debug.lastSkipReason}` : "",
  ].filter(Boolean).join(" ") + error;
}

