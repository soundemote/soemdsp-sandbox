// Live scope buffer + visual-input buffer I/O peeled from module-scopes.js (Phase D).
// Load after module-scopes.js. Extract-only.

function nodeGraphScope2dSourceFrameCount(sampleRate, fps, validLength) {
  const safeSampleRate = Math.max(1, Number(sampleRate) || 44100);
  const safeFps = Math.max(1, Number(fps) || 60);
  const safeValidLength = Math.max(0, Math.floor(Number(validLength) || 0));
  return Math.min(safeValidLength, Math.max(1, Math.ceil(safeSampleRate / safeFps)));
}

function nodeGraphScopeBufferRecentSampleCount(buffer) {
  if (!buffer || !Object.prototype.hasOwnProperty.call(buffer, "nodeGraphScopeRecentSampleCount")) {
    return null;
  }
  return Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRecentSampleCount) || 0));
}

function nodeGraphScopeAvailableSampleCount(buffer) {
  if (!buffer?.length) {
    return 0;
  }
  const retainedSamples = Math.floor(Number(buffer.nodeGraphScopeRetainedSampleCount) || 0);
  if (retainedSamples > 0) {
    return Math.min(buffer.length, retainedSamples);
  }
  const absoluteFrame = Math.floor(Number(buffer.nodeGraphScopeAbsoluteFrame) || 0);
  return absoluteFrame > 0
    ? Math.min(buffer.length, absoluteFrame)
    : buffer.length;
}

function nodeGraphScopeSampleRate(buffer) {
  // Prefer the rate of *samples in the buffer* (after any visual/scope hop).
  const bufferRate = Number(buffer?.nodeGraphScopeSampleRate);
  if (Number.isFinite(bufferRate) && bufferRate > 0) {
    // Safety: if metadata still claims engine rate but stride > 1, fix it.
    // (Older worklets posted visual rings as engineRate + stride 1.)
    const stride = Number(buffer?.nodeGraphScopeSampleStride);
    const source = Number(buffer?.nodeGraphScopeSourceSampleRate);
    if (
      Number.isFinite(stride) && stride > 1.5
      && Number.isFinite(source) && source > 0
      && Math.abs(bufferRate - source) < 1
    ) {
      return source / stride;
    }
    return bufferRate;
  }
  const source = Number(buffer?.nodeGraphScopeSourceSampleRate);
  const stride = Number(buffer?.nodeGraphScopeSampleStride);
  if (Number.isFinite(source) && source > 0 && Number.isFinite(stride) && stride > 0) {
    return source / Math.max(1, stride);
  }
  const stateRate = Number(nodeGraphModuleScopeState.sampleRate);
  if (Number.isFinite(stateRate) && stateRate > 0) {
    return stateRate;
  }
  const appRate = Number(nodeGraphMvp?.sampleRate);
  return Number.isFinite(appRate) && appRate > 0 ? appRate : 44100;
}

function nodeGraphScopeContiguousSampleCount(buffer) {
  const recentSamples = nodeGraphScopeBufferRecentSampleCount(buffer);
  if (recentSamples !== null) {
    return Math.min(buffer?.length || 0, recentSamples);
  }
  return nodeGraphScopeAvailableSampleCount(buffer);
}

// nodeGraphModuleScopeCapturedScope2dBuffer → node-graph-module-scope-capture.js
// captureNodeGraphLiveModuleScopeOutput → node-graph-module-scope-capture.js
function resizeNodeGraphLiveModuleScopeBuffer(buffer, frameCapacity) {
  const capacity = Math.max(0, Math.floor(Number(frameCapacity) || 0));
  if (capacity <= 0) {
    return new Float32Array(0);
  }
  if (buffer instanceof Float32Array && buffer.length === capacity) {
    return buffer;
  }
  const next = new Float32Array(capacity);
  if (!buffer?.length) {
    return next;
  }
  const sourceStart = Math.max(0, buffer.length - capacity);
  const copyCount = Math.min(capacity, buffer.length - sourceStart);
  const targetStart = capacity - copyCount;
  next.set(buffer.subarray(sourceStart, sourceStart + copyCount), targetStart);
  next.nodeGraphScopeRetainedSampleCount = Math.min(
    copyCount,
    Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRetainedSampleCount) || 0)),
  );
  next.nodeGraphScopeTotalSampleCount = Math.max(0, Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount) || 0));
  next.nodeGraphScopeBurnSweepStart = buffer.nodeGraphScopeBurnSweepStart;
  next.nodeGraphScopeBurnSweepLength = buffer.nodeGraphScopeBurnSweepLength;
  next.nodeGraphScopeBurnCrossings = buffer.nodeGraphScopeBurnCrossings;
  next.nodeGraphScopeBurnLastSample = buffer.nodeGraphScopeBurnLastSample;
  next.nodeGraphScopeBurnArmed = buffer.nodeGraphScopeBurnArmed;
  if (Number.isFinite(Number(buffer.nodeGraphScopeSampleRate)) && Number(buffer.nodeGraphScopeSampleRate) > 0) {
    next.nodeGraphScopeSampleRate = Number(buffer.nodeGraphScopeSampleRate);
  }
  if (Number.isFinite(Number(buffer.nodeGraphScopeSourceSampleRate)) && Number(buffer.nodeGraphScopeSourceSampleRate) > 0) {
    next.nodeGraphScopeSourceSampleRate = Number(buffer.nodeGraphScopeSourceSampleRate);
  }
  if (Number.isFinite(Number(buffer.nodeGraphScopeSampleStride)) && Number(buffer.nodeGraphScopeSampleStride) > 0) {
    next.nodeGraphScopeSampleStride = Number(buffer.nodeGraphScopeSampleStride);
  }
  return next;
}

function pushNodeGraphLiveModuleScopeSamples(nodeId, values, metadata = null) {
  const id = String(nodeId || "");
  if (!id) {
    return;
  }
  const frameCapacity = nodeGraphLiveModuleScopeFrameCapacity();
  nodeGraphModuleScopeState.frames = frameCapacity;
  let buffer = nodeGraphModuleScopeState.buffers.get(id);
  if (!buffer || buffer.length !== frameCapacity) {
    buffer = resizeNodeGraphLiveModuleScopeBuffer(buffer, frameCapacity);
    nodeGraphModuleScopeState.buffers.set(id, buffer);
  }
  const samples = Array.isArray(values) || ArrayBuffer.isView(values)
    ? [...values].map(nodeGraphModuleScopeScalarValue)
    : [nodeGraphModuleScopeScalarValue(values)];
  const count = Math.min(buffer.length, samples.length);
  if (count <= 0) {
    return;
  }
  if (count < buffer.length) {
    buffer.copyWithin(0, count);
  }
  const start = samples.length - count;
  for (let index = 0; index < count; index += 1) {
    buffer[buffer.length - count + index] = samples[start + index] || 0;
  }
  buffer.nodeGraphScopeRecentSampleCount = count;
  buffer.nodeGraphScopeTotalSampleCount = Math.max(
    0,
    Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount) || 0),
  ) + count;
  buffer.nodeGraphScopeRetainedSampleCount = Math.min(
    buffer.length,
    Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRetainedSampleCount) || 0)) + count,
  );
  if (metadata && typeof metadata === "object") {
    const absoluteFrame = Number(metadata.absoluteFrame);
    const startFrame = Number(metadata.startFrame);
    const sampleRate = Number(metadata.sampleRate);
    const sourceSampleRate = Number(metadata.sourceSampleRate);
    const sampleStride = Number(metadata.sampleStride);
    if (Number.isFinite(absoluteFrame)) {
      buffer.nodeGraphScopeAbsoluteFrame = absoluteFrame;
    }
    if (Number.isFinite(startFrame)) {
      buffer.nodeGraphScopeStartFrame = startFrame;
    }
    if (Number.isFinite(sampleRate) && sampleRate > 0) {
      buffer.nodeGraphScopeSampleRate = sampleRate;
    }
    if (Number.isFinite(sourceSampleRate) && sourceSampleRate > 0) {
      buffer.nodeGraphScopeSourceSampleRate = sourceSampleRate;
    }
    if (Number.isFinite(sampleStride) && sampleStride > 0) {
      buffer.nodeGraphScopeSampleStride = sampleStride;
    }
  }
  // Scope-ring posts (Output Instant Trace) often omit absoluteFrame. Drive a
  // monotonic cursor from totalSampleCount so 1D Phosphor undrawn-window and
  // Instant Trace never stall on a missing/stale abs frame.
  const totalSamples = Math.max(0, Math.floor(Number(buffer.nodeGraphScopeTotalSampleCount) || 0));
  if (totalSamples > 0) {
    const prevAbs = Number(buffer.nodeGraphScopeAbsoluteFrame);
    if (!Number.isFinite(prevAbs) || totalSamples > prevAbs) {
      buffer.nodeGraphScopeAbsoluteFrame = totalSamples;
      buffer.nodeGraphScopeStartFrame = Math.max(0, totalSamples - count);
    }
  }
  nodeGraphModuleScopeState.versionSerial = (Number(nodeGraphModuleScopeState.versionSerial) || 0) + 1;
  buffer.nodeGraphScopeVersion = nodeGraphModuleScopeState.versionSerial;
  // Invalidate Instant Trace draw cache for this node so the next RAF paints
  // new ring samples (Output stereo keys are "id:Left" / "id:Right").
  const baseId = id.includes(":") ? id.split(":")[0] : id;
  if (baseId && nodeGraphModuleScopeState.traceDisplayDrawCache) {
    nodeGraphModuleScopeState.traceDisplayDrawCache.delete(baseId);
  }
}

function pushNodeGraphLiveModuleScopeSnapshot(values, options = {}) {
  if (!values) {
    return;
  }
  const patchFingerprint = String(options.patchFingerprint || nodeGraphPatchFingerprint());
  if (nodeGraphModuleScopeState.mode !== "live") {
    beginNodeGraphLiveModuleScopeCapture({
      nodes: [],
      order: values instanceof Map ? [...values.keys()] : values.map?.((entry) => entry?.[0]) || [],
      patchFingerprint,
    });
  }
  if (nodeGraphModuleScopeState.patchFingerprint !== patchFingerprint) {
    updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint);
  }
  if (Number.isFinite(Number(options.sampleRate)) && Number(options.sampleRate) > 0) {
    nodeGraphModuleScopeState.sampleRate = Number(options.sampleRate);
  }
  const defaultSampleRate = Number(options.sampleRate);
  const defaultSourceSampleRate = Number(options.sourceSampleRate);
  const defaultSampleStride = Number(options.sampleStride);
  const defaultMetadata = {
    sampleRate: Number.isFinite(defaultSampleRate) && defaultSampleRate > 0 ? defaultSampleRate : null,
    sourceSampleRate: Number.isFinite(defaultSourceSampleRate) && defaultSourceSampleRate > 0 ? defaultSourceSampleRate : null,
    sampleStride: Number.isFinite(defaultSampleStride) && defaultSampleStride > 0 ? defaultSampleStride : null,
  };
  const entries = values instanceof Map ? values.entries() : values;
  for (const entry of entries || []) {
    if (!entry) {
      continue;
    }
    const entryMetadata = entry[2] && typeof entry[2] === "object" ? entry[2] : null;
    const metadata = {
      ...defaultMetadata,
      ...(entryMetadata || {}),
    };
    pushNodeGraphLiveModuleScopeSamples(entry[0], entry[1], metadata);
  }
  notifyNodeGraphModuleScopeSnapshotListeners();
  // Soft schedule only — force bypasses display FPS (see paint-gate.js).
  if (typeof scopePaintOnSampleSnapshot === "function") {
    scopePaintOnSampleSnapshot();
  } else if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

// captureNodeGraphLiveModuleScopeFrame → node-graph-module-scope-capture.js
function createNodeGraphVisualInputBuffer(capacity = nodeGraphBufferedInputSampleLimit) {
  const safeCapacity = normalizeNodeGraphVisualInputBufferCapacity(capacity);
  return {
    absoluteFrame: 0,
    buffer: new Float32Array(safeCapacity),
    capacity: safeCapacity,
    length: 0,
    writeIndex: 0,
  };
}

function normalizeNodeGraphVisualInputBufferCapacity(capacity = nodeGraphBufferedInputSampleLimit) {
  return Math.max(1, Math.round(Number(capacity) || nodeGraphBufferedInputSampleLimit));
}

function resizeNodeGraphVisualInputBufferState(state, capacity = nodeGraphBufferedInputSampleLimit) {
  const safeCapacity = normalizeNodeGraphVisualInputBufferCapacity(capacity);
  if (!state || state.capacity !== safeCapacity || !(state.buffer instanceof Float32Array)) {
    const next = createNodeGraphVisualInputBuffer(safeCapacity);
    if (!state?.buffer?.length || !state?.length) {
      return next;
    }
    const oldLength = Math.min(Number(state.length) || 0, state.capacity || state.buffer.length);
    const copyCount = Math.min(oldLength, safeCapacity);
    const chronological = new Float32Array(copyCount);
    const first = ((Number(state.writeIndex) || 0) - oldLength + (state.capacity || state.buffer.length)) % (state.capacity || state.buffer.length);
    for (let index = 0; index < copyCount; index += 1) {
      const oldIndex = (first + oldLength - copyCount + index) % (state.capacity || state.buffer.length);
      chronological[index] = state.buffer[oldIndex] || 0;
    }
    next.buffer.set(chronological, 0);
    next.length = copyCount;
    next.writeIndex = copyCount % safeCapacity;
    next.absoluteFrame = Math.max(Number(state.absoluteFrame) || 0, copyCount);
    return next;
  }
  return state;
}

function syncNodeGraphVisualInputBuffers(runtime) {
  if (!runtime) {
    return;
  }
  runtime.visualInputBuffers ||= new Map();
  const expected = new Map();
  for (const sink of runtime.visualSinks || []) {
    const nodeId = String(sink?.nodeId || "");
    if (!nodeId) {
      continue;
    }
    for (const input of sink.inputs || []) {
      if (!input?.buffered) {
        continue;
      }
      const port = String(input.port || "").trim();
      if (!port) {
        continue;
      }
      expected.set(`${nodeId}:${port}`, normalizeNodeGraphVisualInputBufferCapacity(sink.bufferSampleLimit));
    }
  }
  for (const [key, capacity] of expected) {
    const current = runtime.visualInputBuffers.get(key);
    if (!current || current.capacity !== capacity) {
      runtime.visualInputBuffers.set(key, resizeNodeGraphVisualInputBufferState(current, capacity));
    }
  }
  for (const key of [...runtime.visualInputBuffers.keys()]) {
    if (!expected.has(key)) {
      runtime.visualInputBuffers.delete(key);
    }
  }
}

function writeNodeGraphVisualInputBufferSample(runtime, nodeId, port, value, capacity = nodeGraphBufferedInputSampleLimit) {
  if (!runtime || !nodeId || !port) {
    return;
  }
  runtime.visualInputBuffers ||= new Map();
  const safeCapacity = normalizeNodeGraphVisualInputBufferCapacity(capacity);
  const key = `${nodeId}:${port}`;
  let state = runtime.visualInputBuffers.get(key);
  if (!state || state.capacity !== safeCapacity) {
    state = resizeNodeGraphVisualInputBufferState(state, safeCapacity);
    runtime.visualInputBuffers.set(key, state);
  }
  state.buffer[state.writeIndex] = nodeGraphModuleScopeScalarValue(value);
  state.writeIndex = (state.writeIndex + 1) % state.capacity;
  state.length = Math.min(state.capacity, state.length + 1);
  state.absoluteFrame += 1;
}

function writeVisualInputBufferSample(runtime, nodeId, port, value, capacity = nodeGraphBufferedInputSampleLimit) {
  writeNodeGraphVisualInputBufferSample(runtime, nodeId, port, value, capacity);
}

