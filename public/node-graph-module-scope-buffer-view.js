// Scope buffer view / interpolate / zoom helpers (Phase D).
// Load after scopes.js. Extract-only.

/**
 * Stable id per buffer object so Hx vs Hy (and any multi-signal) never share
 * one auto-trigger lock. Sharing one lock across different buffers made traces
 * freeze / thrash when several signals had Sync enabled.
 */
function nodeGraphScopeBufferObjectId(buffer) {
  if (!buffer || typeof buffer !== "object") {
    return "none";
  }
  if (buffer.nodeGraphScopeBufferKey != null && String(buffer.nodeGraphScopeBufferKey)) {
    return String(buffer.nodeGraphScopeBufferKey);
  }
  if (!buffer._nodeGraphScopeObjectId) {
    const serial = (nodeGraphModuleScopeState.bufferObjectIdSerial =
      (Number(nodeGraphModuleScopeState.bufferObjectIdSerial) || 0) + 1);
    buffer._nodeGraphScopeObjectId = `b${serial}`;
  }
  return String(buffer._nodeGraphScopeObjectId);
}

/**
 * Per-display, per-trigger-buffer lock key.
 * Must NOT be only `nodeId:channel` — one Soft Fractal Hx + Hy on two Traces
 * (or multi-port views) would clobber a shared lock and freeze.
 */
function nodeGraphTraceDisplaySyncLockKey(slot, syncChannel, displayBuffer, triggerBuffer, options = {}) {
  const nodeId = String(slot?.nodeId || "anon");
  const port = String(
    options.lockPort
    || slot?.port
    || slot?.sourcePort
    || slot?.source?.value
    || slot?.displayType
    || "main",
  );
  const channel = String(syncChannel || "mono");
  const displayId = nodeGraphScopeBufferObjectId(displayBuffer);
  const triggerId = nodeGraphScopeBufferObjectId(triggerBuffer || displayBuffer);
  const suffix = String(options.lockSuffix || "");
  return [nodeId, port, channel, `d:${displayId}`, `t:${triggerId}`, suffix]
    .filter((part) => part !== "")
    .join("|");
}

function nodeGraphTraceDisplayBufferView(buffer, slot, options = {}) {
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const zoomEditActive = Boolean(nodeGraphMvp?.traceDisplayZoomEditActive);
  const syncChannel = options.syncChannel || nodeGraphTraceDisplaySyncChannel(settings);
  const forceOff = options.forceSyncOff === true || syncChannel === "off";
  const syncSourceBuffer = options.syncBuffer || buffer;
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(syncSourceBuffer);
  const availableSamples = nodeGraphScopeAvailableSampleCount(buffer);
  const validEnd = buffer?.length || 0;
  const validStart = availableSamples > 0
    ? Math.max(0, validEnd - Math.min(validEnd, availableSamples))
    : 0;
  const validSamples = Math.max(0, validEnd - validStart);
  const visibleSamples = Math.min(validSamples, nodeGraphTraceDisplayVisibleSamples(buffer, settings));
  let start = Math.max(validStart, validEnd - visibleSamples);
  const syncEligible = !forceOff && !zoomEditActive && visibleSamples < validSamples;
  const estimatedCycle = syncEligible
    ? nodeGraphModuleScopeEstimatedCycle(syncBuffer || syncSourceBuffer)
    : null;
  if (syncEligible && estimatedCycle) {
    const lockKey = nodeGraphTraceDisplaySyncLockKey(
      slot,
      syncChannel,
      buffer,
      syncSourceBuffer,
      options,
    );
    let lock = nodeGraphModuleScopeState.traceDisplaySyncLocks.get(lockKey);
    if (!lock) {
      lock = {};
      nodeGraphModuleScopeState.traceDisplaySyncLocks.set(lockKey, lock);
    }
    // If the trigger buffer object changed, drop stale phase (prevents freeze).
    const triggerId = nodeGraphScopeBufferObjectId(syncSourceBuffer);
    if (lock.triggerId && lock.triggerId !== triggerId) {
      lock = {};
      nodeGraphModuleScopeState.traceDisplaySyncLocks.set(lockKey, lock);
    }
    lock.triggerId = triggerId;
    const triggeredStart = nodeGraphTraceDisplayStabilizedSyncStart(
      lock,
      buffer,
      syncBuffer,
      estimatedCycle,
      visibleSamples,
      validStart,
      validEnd,
    );
    if (triggeredStart !== null && triggeredStart >= validStart) {
      start = triggeredStart;
    }
  }
  if (Number.isFinite(options.forceStart)) {
    start = Math.max(validStart, Math.min(validEnd - visibleSamples, Math.floor(options.forceStart)));
  }
  const ampScale = Number(settings?.scale);
  return {
    end: Math.min(validEnd, start + visibleSamples),
    // Amplitude zoom for Output / Trace drawers (1 = full-scale face).
    gain: Number.isFinite(ampScale) && ampScale > 0
      ? clampNodeSliderValue(ampScale, 0.01, 100)
      : 1,
    offset: 0,
    start,
  };
}

/**
 * Shared window for Output L/R so both channels stay time-aligned.
 * syncChannel: off (each freeruns) | left | right | mono.
 */
function nodeGraphTraceDisplayStereoBufferViews(leftBuffer, rightBuffer, slot) {
  const settings = nodeGraphTraceDisplaySettingsForSlot(slot);
  const syncChannel = nodeGraphTraceDisplaySyncChannel(settings);
  if (syncChannel === "off" || !leftBuffer?.length || !rightBuffer?.length) {
    return {
      left: nodeGraphTraceDisplayBufferView(leftBuffer, slot, { forceSyncOff: true }),
      right: nodeGraphTraceDisplayBufferView(rightBuffer, slot, { forceSyncOff: true }),
      syncChannel: "off",
    };
  }
  let syncBuffer = leftBuffer;
  if (syncChannel === "right") {
    syncBuffer = rightBuffer;
  } else if (syncChannel === "mono") {
    syncBuffer = nodeGraphTraceDisplayMonoSyncBuffer(leftBuffer, rightBuffer) || leftBuffer;
  }
  // One master trigger for the pair — dedicated lock suffix so it never collides
  // with a mono Trace on the same node watching only Left or Right.
  const master = nodeGraphTraceDisplayBufferView(syncBuffer, slot, {
    syncBuffer,
    syncChannel,
    lockSuffix: `stereo-master:${syncChannel}`,
    lockPort: "stereo",
  });
  return {
    left: nodeGraphTraceDisplayBufferView(leftBuffer, slot, {
      forceStart: master.start,
      forceSyncOff: true,
    }),
    right: nodeGraphTraceDisplayBufferView(rightBuffer, slot, {
      forceStart: master.start,
      forceSyncOff: true,
    }),
    syncChannel,
  };
}

function nodeGraphModuleScopeBufferView(buffer, slot) {
  const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot);
  if (nodeGraphModuleDisplayRendererForSlot(slot) === "trace") {
    return nodeGraphTraceDisplayBufferView(buffer, slot);
  }
  if (buffer?.nodeGraphScopeUseFullWindow) {
    return {
      end: buffer.length,
      gain: nodeGraphModuleScopeVisualGain(settings),
      offset: settings.offset,
      start: 0,
    };
  }
  const estimatedCycle = nodeGraphModuleScopeEstimatedCycle(buffer);
  const cycleEstimate = settings.sync ? estimatedCycle : null;
  const visibleSamples = nodeGraphModuleScopeVisibleSamples(buffer, settings, estimatedCycle);
  const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer);
  const defaultStart = Math.max(0, buffer.length - visibleSamples);
  let start = defaultStart;
  if (settings.sync && cycleEstimate && visibleSamples < buffer.length) {
    // Oscilloscope auto-trigger: lock when an edge fits; otherwise freerun
    // (keep defaultStart) so quiet / aperiodic signals never freeze.
    const triggeredStart = nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples);
    if (triggeredStart !== null) {
      start = triggeredStart;
    }
  }
  const rawPanCycles = Number(settings.pan) || 0;
  const panCycles = settings.sync && cycleEstimate
    ? Math.round(rawPanCycles)
    : rawPanCycles;
  const panSamples = panCycles
    ? (cycleEstimate?.periodSamples || visibleSamples) * panCycles
    : 0;
  start = clampNodeSliderValue(start - panSamples, 0, Math.max(0, buffer.length - visibleSamples));
  return {
    end: Math.min(buffer.length, start + visibleSamples),
    gain: nodeGraphModuleScopeVisualGain(settings),
    offset: settings.offset,
    start,
  };
}

function nodeGraphModuleScopeInterpolatedSample(buffer, position) {
  const samplePosition = clampNodeSliderValue(Number(position) || 0, 0, Math.max(0, buffer.length - 1));
  const leftIndex = Math.floor(samplePosition);
  const rightIndex = Math.min(buffer.length - 1, leftIndex + 1);
  const blend = samplePosition - leftIndex;
  const left = Number(buffer[leftIndex]) || 0;
  const right = Number(buffer[rightIndex]) || left;
  return left + (right - left) * blend;
}

function nodeGraphModuleScopeSampleInfo(buffer, position) {
  const samplePosition = clampNodeSliderValue(Number(position) || 0, 0, Math.max(0, buffer.length - 1));
  const leftIndex = Math.floor(samplePosition);
  const rightIndex = Math.min(buffer.length - 1, leftIndex + 1);
  const blend = samplePosition - leftIndex;
  const left = Number(buffer[leftIndex]) || 0;
  const right = Number(buffer[rightIndex]) || left;
  const discontinuity = rightIndex !== leftIndex &&
    Math.abs(right - left) > nodeGraphModuleScopeDiscontinuityThreshold;
  return {
    blend,
    discontinuity,
    left,
    right,
    value: left + (right - left) * blend,
  };
}

function nodeGraphTraceDisplaySampleInfo(buffer, position, _samplesPerPoint = 1) {
  // Point sample only. Never average a span or flag peak-to-peak of a
  // downsampled bucket as a discontinuity — that made Skip treat every
  // zoomed-out sine as a wrap and blank the stroke.
  return nodeGraphModuleScopeSampleInfo(buffer, position);
}

function nodeGraphModuleScopeBufferValue(buffer, position, view) {
  return clampNodeSliderValue((nodeGraphModuleScopeInterpolatedSample(buffer, position) * view.gain) + view.offset, -1, 1);
}

function nodeGraphModuleScopeHeatmapTraceColors() {
  return {
    core: [1, 1, 1],
  };
}

function nodeGraphModuleScopeDotStyle(slot, buffer) {
  const source = nodeGraphModuleScopeShaderSourceForSlot(slot);
  const coreFallback = nodeGraphModuleScopeShaderGlobalColor("dot1");
  const coreSize = nodeGraphMvp?.moduleScopeDotCore1Enabled === false
    ? 0
    : nodeGraphModuleScopeShaderNumber(
      source,
      "dot1",
      "size",
      normalizeNodeGraphModuleScopeDotCoreSize(
        nodeGraphMvp?.moduleScopeDotCore1Size ?? nodeGraphModuleScopeDefaultDotCores.dot1.size,
        nodeGraphModuleScopeDefaultDotCores.dot1.size,
      ),
    );
  const coreBrightness = nodeGraphMvp?.moduleScopeDotCore1Enabled === false
    ? 0
    : nodeGraphModuleScopeShaderNumber(
      source,
      "dot1",
      "brightness",
      normalizeNodeGraphModuleScopeDotCoreBrightness(
        nodeGraphMvp?.moduleScopeDotCore1Brightness ?? nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
        nodeGraphModuleScopeDefaultDotCores.dot1.brightness,
      ),
    );
  return {
    coreBrightness: clampNodeSliderValue(coreBrightness, 0, 40),
    coreColor: nodeGraphScopeHexColorToRgb(
      nodeGraphModuleScopeShaderColor(source, "dot1", coreFallback),
    ),
    coreSize: normalizeNodeGraphModuleScopeDotCoreSize(coreSize, nodeGraphModuleScopeDefaultDotCores.dot1.size),
  };
}

function nodeGraphModuleScopeZoomScale() {
  const zoom = typeof nodeGraphZoom === "function"
    ? nodeGraphZoom()
    : Number(nodeGraphMvp?.zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function nodeGraphModuleScopeStrokeZoomScale() {
  return clampNodeSliderValue(nodeGraphModuleScopeZoomScale(), 0.35, 4);
}

function nodeGraphModuleScopeUnzoomedLength(value, zoomScale = nodeGraphModuleScopeZoomScale()) {
  const length = Number(value);
  const zoom = Number(zoomScale);
  if (!Number.isFinite(length) || length <= 0) {
    return 1;
  }
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return length;
  }
  return Math.max(1, length / zoom);
}

function nodeGraphModuleScopeRenderedSampleWidth(rect, zoomScale = nodeGraphModuleScopeZoomScale()) {
  const width = Number(rect?.width);
  const sampleWidth = Number(rect?.sampleWidth);
  const zoom = Number(zoomScale);
  const renderedWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const zoomedSampleWidth = Number.isFinite(sampleWidth) && sampleWidth > 0 && Number.isFinite(zoom) && zoom > 0
    ? sampleWidth * zoom
    : 0;
  return Math.max(1, renderedWidth, zoomedSampleWidth);
}

function nodeGraphModuleScopeVisibleMetricRect(rect, options = {}) {
  const visibleRect = options?.visibleRect;
  return visibleRect && Number(visibleRect.width) > 1 && Number(visibleRect.height) > 1
    ? visibleRect
    : rect;
}

// nodeGraphModuleScopePhosphorFrameReady → node-graph-module-scope-phosphor.js
// Scope metrics → node-graph-module-scope-metrics.js
