// Scope capture pipeline extracted from node-graph-module-scopes.js (Phase D).
// Load after phosphor, before scopes.js.

function nodeGraphModuleScopeCaptureMonitors(patch = nodeGraphMvp?.patch) {
  const monitors = normalizeNodeGraphPatchMonitors(patch?.monitors, patch);
  return monitors.length ? monitors : nodeGraphDefaultModuleScopeMonitors(patch);
}


function beginNodeGraphRenderedScopeCapture(options = {}) {
  const patch = options.patch || nodeGraphMvp?.patch;
  const monitors = nodeGraphModuleScopeCaptureMonitors(patch);
  const frames = Math.max(0, Math.floor(Number(options.frames) || 0));
  if (!monitors.length || frames <= 0) {
    // Do not wipe painted phosphor faces on empty offline capture re-arms.
    clearNodeGraphModuleScopeBuffers({ preserveDisplay: true });
    return null;
  }

  const groups = new Map();
  for (const monitor of monitors) {
    const group = groups.get(monitor.node) || [];
    group.push(monitor);
    groups.set(monitor.node, group);
  }

  const buffers = new Map(
    [...groups.keys()].map((nodeId) => [nodeId, new Float32Array(frames)]),
  );
  return {
    buffers,
    frames,
    groups,
    monitorFingerprint: nodeGraphModuleScopeMonitorFingerprint(monitors),
    patchFingerprint: String(options.patchFingerprint || ""),
    sampleRate: Number(options.sampleRate) || 0,
  };
}


function captureNodeGraphRenderedScopeFrame(
  capture,
  runtime,
  frameValues,
  bufferFrame,
  evaluationFrame,
  evaluationFrames,
) {
  if (!capture) {
    return;
  }
  for (const [nodeId, monitors] of capture.groups) {
    const buffer = capture.buffers.get(nodeId);
    if (!buffer || bufferFrame < 0 || bufferFrame >= buffer.length) {
      continue;
    }
    const sum = monitors.reduce(
      (total, monitor) => total + nodeGraphRenderedScopeMonitorValue(
        monitor,
        runtime,
        frameValues,
        evaluationFrame,
        evaluationFrames,
      ),
      0,
    );
    buffer[bufferFrame] = sum / Math.max(1, monitors.length);
  }
}


function finishNodeGraphRenderedScopeCapture(capture) {
  if (!capture) {
    return;
  }
  nodeGraphModuleScopeState.buffers = capture.buffers;
  nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
  nodeGraphModuleScopeState.traceDisplayScratch.clear();
  nodeGraphModuleScopeState.frames = capture.frames;
  nodeGraphModuleScopeState.monitorFingerprint = capture.monitorFingerprint;
  nodeGraphModuleScopeState.mode = "rendered";
  nodeGraphModuleScopeState.patchFingerprint = capture.patchFingerprint;
  nodeGraphModuleScopeState.sampleRate = capture.sampleRate;
  scheduleNodeGraphModuleScopeDraw();
}


function beginNodeGraphLiveModuleScopeCapture(plan = {}, options = {}) {
  const frozen = typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : (typeof nodeGraphModuleScopePhosphorFrozen === "function"
      && nodeGraphModuleScopePhosphorFrozen());
  if (frozen && nodeGraphModuleScopeState.buffers?.size > 0) {
    // Pause must not rebuild/replace rings (empty order from a control
    // re-render dropped X/Y history and 2D Trace went blank).
    return;
  }
  if (!nodeGraphModuleScopeHasDrawableSlots() || nodeGraphModuleScopeTracesOff()) {
    // Transient re-arm / no slots must never cold-boot wipe residual faces
    // (pause + wire connect was killing Pitch Detector / Value LED ghosts).
    // Keep painted plates; drop rings only when scopes are explicitly off.
    clearNodeGraphModuleScopeBuffers({
      preserveDisplay: true,
      preserveBuffers: !nodeGraphModuleScopeTracesOff(),
    });
    return;
  }
  const ids = Array.isArray(plan.order) && plan.order.length
    ? plan.order
    : (Array.isArray(plan.nodes) ? plan.nodes.map((node) => node.id) : []);
  const frameCapacity = nodeGraphLiveModuleScopeFrameCapacity({ ...options, patch: options.patch || nodeGraphMvp?.patch });
  const patchFingerprint = String(plan.patchFingerprint || nodeGraphPatchFingerprint());
  const topologyFingerprint = nodeGraphLiveModuleScopeFingerprint(plan);
  // Full patch fingerprint includes layout (gx/gy) and cosmetic UI. Moving a
  // module must NOT wipe sample history, sync locks, or phosphor windows.
  // Reuse by live mode + same capture node set (topology), not full hash.
  const topologyUnchanged = nodeGraphModuleScopeState.mode === "live"
    && nodeGraphModuleScopeState.monitorFingerprint === topologyFingerprint;
  // Always try per-id reuse while already live — never allocate empty rings
  // just because the patch text hash changed.
  const preferReuse = nodeGraphModuleScopeState.mode === "live";
  const nextBuffers = new Map();
  for (const id of ids.map((candidate) => String(candidate || "")).filter(Boolean)) {
    const previous = preferReuse ? nodeGraphModuleScopeState.buffers.get(id) : null;
    nextBuffers.set(id, resizeNodeGraphLiveModuleScopeBuffer(previous, frameCapacity));
  }
  if (preferReuse) {
    for (const [key, previous] of nodeGraphModuleScopeState.buffers) {
      if (!String(key || "").includes(":")) {
        continue;
      }
      const nodeId = String(key).split(":")[0];
      if (nextBuffers.has(nodeId)) {
        nextBuffers.set(key, resizeNodeGraphLiveModuleScopeBuffer(previous, frameCapacity));
      }
    }
  }
  if (!topologyUnchanged) {
    // Topology (which nodes are captured) actually changed — drop draw caches.
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
    nodeGraphModuleScopeState.traceDisplayScratch.clear();
    nodeGraphModuleScopeState.traceDisplaySyncLocks.clear();
  }
  nodeGraphModuleScopeState.buffers = nextBuffers;
  nodeGraphModuleScopeState.frames = frameCapacity;
  nodeGraphModuleScopeState.monitorFingerprint = topologyFingerprint;
  nodeGraphModuleScopeState.mode = "live";
  nodeGraphModuleScopeState.patchFingerprint = patchFingerprint;
  nodeGraphModuleScopeState.sampleRate = Number(options.sampleRate) || Number(nodeGraphModuleScopeState.sampleRate) || 0;
  scheduleNodeGraphModuleScopeDraw();
}


function nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  for (let index = capturedBuffer.length - 1; index >= 0; index -= 1) {
    const sample = Number(capturedBuffer[index]);
    if (Number.isFinite(sample)) {
      return clampNodeSliderValue(Math.abs(sample), 0, 1);
    }
  }
  return null;
}


function nodeGraphModuleScopeCapturedCurrentPositiveLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  for (let index = capturedBuffer.length - 1; index >= 0; index -= 1) {
    const sample = Number(capturedBuffer[index]);
    if (Number.isFinite(sample)) {
      return clampNodeSliderValue(sample, 0, 1);
    }
  }
  return null;
}


function nodeGraphModuleScopeCapturedFrameLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  let sum = 0;
  let count = 0;
  for (let index = 0; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += Math.abs(sample);
    count += 1;
  }
  return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null;
}


function nodeGraphModuleScopeCapturedFramePositiveLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  const recentCount = Math.max(0, Math.floor(Number(capturedBuffer.nodeGraphScopeRecentSampleCount) || 0));
  const startIndex = recentCount > 0
    ? Math.max(0, capturedBuffer.length - Math.min(capturedBuffer.length, recentCount))
    : 0;
  let sum = 0;
  let count = 0;
  for (let index = startIndex; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += clampNodeSliderValue(sample, 0, 1);
    count += 1;
  }
  return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null;
}


function nodeGraphModuleScopeCapturedFrameBipolarLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  const recentCount = Math.max(0, Math.floor(Number(capturedBuffer.nodeGraphScopeRecentSampleCount) || 0));
  const startIndex = recentCount > 0
    ? Math.max(0, capturedBuffer.length - Math.min(capturedBuffer.length, recentCount))
    : 0;
  let sum = 0;
  let count = 0;
  for (let index = startIndex; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    sum += clampNodeSliderValue(Math.abs(sample), 0, 1);
    count += 1;
  }
  return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null;
}


function nodeGraphModuleScopeCapturedGateLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  let previousState = null;
  let transitions = 0;
  for (let index = 0; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (!Number.isFinite(sample)) {
      continue;
    }
    const state = Math.abs(sample) >= 0.5;
    if (previousState !== null && state !== previousState) {
      transitions += 1;
    }
    previousState = state;
    if (transitions > 2) {
      return nodeGraphModuleScopeCapturedFrameLightTarget(capturedBuffer);
    }
  }
  return nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer);
}


function nodeGraphModuleScopeCapturedPulseLightTarget(capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  let peak = 0;
  for (let index = 0; index < capturedBuffer.length; index += 1) {
    const sample = Number(capturedBuffer[index]);
    if (Number.isFinite(sample)) {
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  return clampNodeSliderValue(peak, 0, 1);
}


function nodeGraphModuleScopeCapturedBufferForSlot(slot) {
  const nodeId = String(slot?.nodeId || "");
  if (!nodeId) {
    return null;
  }
  const renderer = nodeGraphModuleDisplayRendererForSlot(slot);
  if (
    typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    && nodeGraphModuleUsesStereoTraceDisplay(slot?.type)
  ) {
    const ports = typeof nodeGraphModuleStereoTracePorts === "function"
      ? nodeGraphModuleStereoTracePorts(slot.type)
      : { left: "Left", right: "Right" };
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:${ports?.left}`)
      || nodeGraphModuleScopeState.buffers.get(`${nodeId}:${ports?.right}`)
      || nodeGraphModuleScopeState.buffers.get(nodeId)
      || null;
  }
  if (["scope2d", "scope2dTrace", "phosphorLight"].includes(renderer)) {
    const source = nodeGraphModuleScopeSlotUsesWiredInputs(slot)
      ? null
      : nodeGraphModuleDisplaySourceForSlot(slot);
    const captureOpts = source
      ? { xPort: source.x, yPort: source.y }
      : {};
    // Vector 2D Trace redraws the whole window each frame (no energy FBO).
    // Without historySeconds it only pulled “new samples since last draw”
    // (phosphor deposit style) → incomplete / dashed Lissajous. Phosphor
    // burn keeps the short window intentionally.
    if (renderer === "scope2dTrace") {
      const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
        ? nodeGraphModuleScopeNodeForSlot(slot)
        : null;
      const settings = typeof nodeGraphScope2dTraceSettingsForNode === "function"
        ? nodeGraphScope2dTraceSettingsForNode(node)
        : null;
      const history = Number(settings?.historySeconds);
      if (Number.isFinite(history)) {
        captureOpts.historySeconds = Math.max(0, history);
      }
    }
    return nodeGraphModuleScopeCapturedScope2dBuffer(slot, captureOpts);
  }
  if (["traceDisplay", "dotOscilloscope", "valueOscilloscope", "numberReadout", "valueLcd", "lineBurnOscilloscope", "led"].includes(slot?.type)) {
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:In`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "In") ||
      null;
  }
  if (/^t([1-9]|10)?$/.test(String(slot?.type || ""))) {
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:0`) ||
      nodeGraphModuleScopeState.buffers.get(`${nodeId}:In`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "In") ||
      null;
  }
  // Pitch Detector LCD: own Frequency out (not an external In wire).
  if (slot?.type === "helmholtzPitch") {
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:Frequency`) ||
      nodeGraphModuleScopeState.buffers.get(nodeId) ||
      null;
  }
  // Multi-mode Display (visualOscilloscope): mono modes feed from In.
  if (slot?.type === "visualOscilloscope" && (renderer === "trace" || renderer === "dot")) {
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:In`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "In") ||
      null;
  }
  if (slot?.type === "customDisplay") {
    const displayScript = normalizeNodeGraphCustomDisplay(nodeGraphModuleScopeNodeForSlot(slot)?.customDisplay);
    const primaryPort = displayScript.inputs[0] || "In1";
    return nodeGraphModuleScopeState.buffers.get(`${nodeId}:${primaryPort}`) ||
      nodeGraphModuleScopeConnectedSourceBuffer(nodeId, primaryPort) ||
      new Float32Array([0]);
  }
  const source = nodeGraphModuleDisplaySourceForSlot(slot);
  const sourcePort = String(source?.value || "").trim();
  if (sourcePort) {
    const sourceBuffer = nodeGraphModuleScopeState.buffers.get(`${nodeId}:${sourcePort}`);
    if (sourceBuffer?.length) {
      return sourceBuffer;
    }
  }
  const selectedPort = nodeGraphModuleScopeShaderOutputPortForSlot(slot);
  if (selectedPort) {
    const selectedBuffer = nodeGraphModuleScopeState.buffers.get(`${nodeId}:${selectedPort}`);
    if (selectedBuffer?.length) {
      return selectedBuffer;
    }
  }
  return nodeGraphModuleScopeState.buffers.get(nodeId) || null;
}


function nodeGraphModuleScopeClockCapturedLightTarget(slot, capturedBuffer) {
  if (!capturedBuffer?.length) {
    return null;
  }
  const selectedPort = nodeGraphModuleScopeShaderOutputPortForSlot(slot);
  if (selectedPort === "Analog Out") {
    return nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer);
  }
  if (selectedPort === "Pulse" || selectedPort === "T") {
    return nodeGraphModuleScopeCapturedPulseLightTarget(capturedBuffer);
  }
  return nodeGraphModuleScopeCapturedGateLightTarget(capturedBuffer);
}


function nodeGraphModuleScopeXyTraceFrameCount(length) {
  const safeLength = Math.max(2, Math.floor(Number(length) || 0));
  return safeLength;
}


function nodeGraphModuleScopeCapturedXyTraceFrameCount(slot, length) {
  const frames = nodeGraphModuleScopeXyTraceFrameCount(length);
  return slot?.type === "audioPlayer"
    ? Math.min(frames, 256)
    : frames;
}


/**
 * Absolute sample counter for a live scope buffer.
 * Prefer nodeGraphScopeAbsoluteFrame (visual input rings); fall back to
 * totalSampleCount (module port streams).
 */
function nodeGraphScopeBufferAbsoluteFrame(buffer) {
  const abs = Math.floor(Number(buffer?.nodeGraphScopeAbsoluteFrame) || 0);
  if (abs > 0) {
    return abs;
  }
  return Math.max(0, Math.floor(Number(buffer?.nodeGraphScopeTotalSampleCount) || 0));
}

/**
 * Read one sample from a retained scope buffer at an absolute frame index.
 * Live buffers keep the newest samples at the end of the array.
 * Returns null when that frame is outside the retained window.
 */
function nodeGraphScopeBufferSampleAtAbsoluteFrame(buffer, absoluteFrame) {
  if (!buffer?.length) {
    return null;
  }
  const abs = nodeGraphScopeBufferAbsoluteFrame(buffer);
  const retained = nodeGraphScopeAvailableSampleCount(buffer);
  const frame = Math.floor(Number(absoluteFrame) || 0);
  if (abs <= 0 || retained <= 0 || frame < abs - retained || frame >= abs) {
    return null;
  }
  // Newest sample (abs-1) sits at index length-1; age 0 = newest.
  const age = abs - 1 - frame;
  const index = buffer.length - 1 - age;
  if (index < 0 || index >= buffer.length) {
    return null;
  }
  const value = Number(buffer[index]);
  return Number.isFinite(value) ? value : 0;
}

/** Prefer denser / higher-rate of two scope buffers (wired sink vs source). */
function nodeGraphScope2dPickRicherBuffer(local, connected) {
  if (!local) {
    return connected || null;
  }
  if (!connected) {
    return local;
  }
  const localAvail = typeof nodeGraphScopeAvailableSampleCount === "function"
    ? nodeGraphScopeAvailableSampleCount(local)
    : (local.length || 0);
  const connAvail = typeof nodeGraphScopeAvailableSampleCount === "function"
    ? nodeGraphScopeAvailableSampleCount(connected)
    : (connected.length || 0);
  const localRate = Number(local.nodeGraphScopeSampleRate) || 0;
  const connRate = Number(connected.nodeGraphScopeSampleRate) || 0;
  // Prefer higher sample rate; then more retained samples.
  if (connRate > localRate * 1.05) {
    return connected;
  }
  if (localRate > connRate * 1.05) {
    return local;
  }
  return connAvail > localAvail ? connected : local;
}

function nodeGraphModuleScopeCapturedScope2dBuffer(slot, options = {}) {
  if (!["scope2d", "scope2dTrace", "phosphorLight"].includes(nodeGraphModuleDisplayRendererForSlot(slot))) {
    return null;
  }
  const xPort = String(options.xPort || "X").trim() || "X";
  const yPort = String(options.yPort || "Y").trim() || "Y";
  const localX = nodeGraphModuleScopeState.buffers.get(`${slot.nodeId}:${xPort}`);
  const localY = nodeGraphModuleScopeState.buffers.get(`${slot.nodeId}:${yPort}`);
  const connX = typeof nodeGraphModuleScopeConnectedSourceBuffer === "function"
    ? nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, xPort)
    : null;
  const connY = typeof nodeGraphModuleScopeConnectedSourceBuffer === "function"
    ? nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, yPort)
    : null;
  // Wired 2D Phosphor sinks: don't silently use a thin local ring when the
  // connected generator has a richer buffer (same data Lorenz face draws).
  const xBuffer = nodeGraphScope2dPickRicherBuffer(localX, connX);
  const yBuffer = nodeGraphScope2dPickRicherBuffer(localY, connY);
  const length = Math.min(xBuffer?.length || 0, yBuffer?.length || 0);
  if (length <= 0) {
    return null;
  }
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : 60;
  const xRecentSamples = nodeGraphScopeBufferRecentSampleCount(xBuffer);
  const yRecentSamples = nodeGraphScopeBufferRecentSampleCount(yBuffer);
  const hasRecentSampleMetadata = xRecentSamples !== null || yRecentSamples !== null;
  const historySeconds = Number(options.historySeconds);
  const historyWindow = Number.isFinite(historySeconds);
  // Phosphor: skip when this visual post has no new samples (energy FBO holds).
  // Vector 2D Trace passes historySeconds and must still copy the retained
  // window — otherwise FPS 1 returns null and the face is wiped blank.
  if (
    !historyWindow
    && hasRecentSampleMetadata
    && !(xRecentSamples > 0 && yRecentSamples > 0)
  ) {
    return null;
  }
  // Match soundemote.io / site sandbox capture: end-aligned X/Y pairs, continuous
  // path (no absolute-frame NaN holes that broke the polyline into dots).
  const validLength = Math.min(
    nodeGraphScopeAvailableSampleCount(xBuffer),
    nodeGraphScopeAvailableSampleCount(yBuffer),
    length,
  );
  const xTotal = Math.max(0, Math.floor(Number(xBuffer.nodeGraphScopeTotalSampleCount) || 0));
  const yTotal = Math.max(0, Math.floor(Number(yBuffer.nodeGraphScopeTotalSampleCount) || 0));
  const absoluteFrame = Math.min(xTotal, yTotal);
  const canvas = nodeGraphScope2dBurnCanvasForSlot(slot);
  const lastDrawnFrame = Number(canvas?._nodeGraphScope2dLastDrawnFrame);
  const newSinceLastDraw = Number.isFinite(lastDrawnFrame) && absoluteFrame > lastDrawnFrame
    ? absoluteFrame - lastDrawnFrame
    : 0;
  const minWindowFrames = nodeGraphScope2dSourceFrameCount(sampleRate, fps, validLength);
  // Capture only what we need to deposit this frame (new samples + a small
  // pad). The energy FBO holds the trail via decay — re-capturing ~1s and
  // re-stamping it every frame painted a lagging "second path" behind the beam.
  // Vector 2D Trace passes historySeconds and needs a real contiguous window.
  // Use the buffer's own sample rate (visual hop), not engine 44100, so a
  // 1 s window is 1 s of ring data. Missing samples stay NaN (path break),
  // never 0,0 — that drew chords through the origin.
  const bufferRate = typeof nodeGraphScopeSampleRate === "function"
    ? nodeGraphScopeSampleRate(xBuffer)
    : 0;
  const windowRate = bufferRate > 0 ? bufferRate : sampleRate;
  const frames = Number.isFinite(historySeconds)
    ? (historySeconds <= 0
      ? 1
      : Math.min(
        validLength,
        Math.max(1, Math.ceil(historySeconds * windowRate)),
      ))
    : Math.min(
      validLength,
      Math.max(minWindowFrames, newSinceLastDraw, 1),
    );
  const start = Math.max(0, length - frames);
  const startFrame = Math.max(0, absoluteFrame - frames);
  const x = new Float32Array(frames);
  const y = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    const xv = Number(xBuffer[start + index]);
    const yv = Number(yBuffer[start + index]);
    x[index] = Number.isFinite(xv) ? xv : Number.NaN;
    y[index] = Number.isFinite(yv) ? yv : Number.NaN;
  }
  return {
    length: frames,
    nodeGraphScopeAbsoluteFrame: absoluteFrame,
    nodeGraphScopeCapturedOutput: true,
    nodeGraphScopeDrawProgress: 1,
    nodeGraphScopeStartFrame: startFrame,
    nodeGraphScopeUseFullWindow: true,
    nodeGraphScopeXy: true,
    x,
    y,
  };
}


function captureNodeGraphLiveModuleScopeOutput(runtime, nodeId, output) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  const samples = runtime.scopeBuffers.get(id) || [];
  samples.push(nodeGraphModuleScopeScalarValue(output));
  runtime.scopeBuffers.set(id, samples);
  if (!output || typeof output !== "object") {
    return;
  }
  for (const [port, value] of Object.entries(output)) {
    if (!port || !Number.isFinite(Number(value))) {
      continue;
    }
    const portId = `${id}:${port}`;
    const portSamples = runtime.scopeBuffers.get(portId) || [];
    portSamples.push(nodeGraphModuleScopeScalarValue(value));
    runtime.scopeBuffers.set(portId, portSamples);
  }
}


function captureNodeGraphLiveModuleScopeFrame(runtime, sampleRate) {
  if (!runtime?.nodeOutputs?.size || !nodeGraphModuleScopeHasDrawableSlots() || nodeGraphModuleScopeTracesOff()) {
    return;
  }
  const interval = Math.max(1, Math.floor((Number(sampleRate) || nodeGraphMvp.sampleRate || 44100) / 30));
  runtime.scopeBuffers ||= new Map();
  const visibleScopeNodeIds = Array.isArray(runtime.scopeCaptureNodeIds) && runtime.scopeCaptureNodeIds.length
    ? new Set(runtime.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean))
    : nodeGraphVisibleModuleScopeNodeIds();
  for (const nodeId of visibleScopeNodeIds) {
    if (!runtime.nodeOutputs.has(nodeId)) {
      continue;
    }
    captureNodeGraphLiveModuleScopeOutput(runtime, nodeId, runtime.nodeOutputs.get(nodeId));
  }
  for (const sink of runtime.visualSinks || []) {
    const nodeId = String(sink?.nodeId || "");
    if (!nodeId) {
      continue;
    }
    if (!visibleScopeNodeIds.has(nodeId)) {
      continue;
    }
    let value = 0;
    for (const input of sink.inputs || []) {
      if (!input?.connected) {
        continue;
      }
      const inputValue = (input.connections || []).reduce(
        (connectionSum, connection) => connectionSum + readNodeGraphRuntimePortOutput(
          runtime,
          null,
          connection.sourceNode,
          connection.sourcePort,
          0,
          1,
        ),
        0,
      );
      value += inputValue;
      const inputPort = String(input.port || "").trim();
      if (input?.buffered && inputPort) {
        writeNodeGraphVisualInputBufferSample(runtime, nodeId, inputPort, inputValue, sink.bufferSampleLimit);
      }
      if (inputPort) {
        const portId = `${nodeId}:${inputPort}`;
        const portSamples = runtime.scopeBuffers.get(portId) || [];
        portSamples.push(nodeGraphModuleScopeScalarValue(inputValue));
        runtime.scopeBuffers.set(portId, portSamples);
      }
    }
    const samples = runtime.scopeBuffers.get(nodeId) || [];
    samples.push(nodeGraphModuleScopeScalarValue(value));
    runtime.scopeBuffers.set(nodeId, samples);
  }
  runtime.scopeCounter = (runtime.scopeCounter || 0) + 1;
  if (runtime.scopeCounter < interval) {
    return;
  }
  runtime.scopeCounter = 0;
  pushNodeGraphLiveModuleScopeSnapshot(runtime.scopeBuffers, {
    patchFingerprint: nodeGraphPatchFingerprint(),
    sampleRate,
  });
  runtime.scopeBuffers = new Map();
}

