// Extracted from node-live-audio-worklet-core.js (Phase D — scope capture IO).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.scopeScalarValue = function scopeScalarValue(value) {
    // Sanitize non-finite values only. Do NOT clamp to ±1: analysis outs
    // (Pitch Detector Frequency in Hz, transport BPM, etc.) are written
    // through the same scope ring. Clamping made the LCD show only 0 or 1.
    // Waveform faces re-clamp on draw when they need a bipolar audio range.
    const readNumber = (candidate) => {
      const number = Number(candidate);
      if (this.badValueReason(number)) {
        return null;
      }
      // Soft cap against pathological values flooding the postMessage path.
      if (number > 1e8) {
        return 1e8;
      }
      if (number < -1e8) {
        return -1e8;
      }
      return number;
    };
    if (typeof value === "number") {
      return readNumber(value) ?? 0;
    }
    if (!value || typeof value !== "object") {
      return 0;
    }
    for (const key of ["Bias", "Out", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
      const number = readNumber(value[key]);
      if (number !== null) {
        return number;
      }
    }
    for (const candidate of Object.values(value)) {
      const number = readNumber(candidate);
      if (number !== null) {
        return number;
      }
    }
    return 0;
};

NodeLiveAudioProcessor.prototype.captureModuleScopeFrame = function captureModuleScopeFrame(frameValues = null, frame = 0, frames = 1) {
    const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    // Scope posts + visual ring writes: hop engine samples (~12 kHz), not full rate.
    // Full-rate visual writes were starving the audio thread on multi-face patches.
    this.scopeSampleStride = Math.max(1, Math.floor(engineRate / 12000));
    const captureDebugScope = (this.scopeCounter % this.scopeSampleStride) === 0;
    if (captureDebugScope) {
      const captureNodeIds = Array.isArray(this.scopeCaptureNodeIds)
        ? this.scopeCaptureNodeIds
        : this.order;
      const captured = new Set();
      for (const nodeId of captureNodeIds) {
        if (!this.nodeOutputs.has(nodeId)) {
          continue;
        }
        this.captureModuleScopeOutput(nodeId, this.nodeOutputs.get(nodeId));
        captured.add(String(nodeId));
      }
      // Speaker Output publishes {Left,Right,Mono} after evaluateFrame — always
      // capture it when present so the Output Trace face is not stuck on a cold
      // plate waiting for a plan that omitted the sink from scopeCaptureNodeIds.
      const outId = String(this.outputNode || "output");
      if (!captured.has(outId) && this.nodes.has(outId) && this.nodeOutputs.has(outId)) {
        this.captureModuleScopeOutput(outId, this.nodeOutputs.get(outId));
      }
    }
    // No visual sinks planned (all faces hidden) → skip the whole loop.
    const sinks = this.visualSinks || [];
    if (!sinks.length) {
      return;
    }
    for (const sink of sinks) {
      const nodeId = String(sink?.nodeId || "");
      if (!nodeId) {
        continue;
      }
      // Per-sink hop (plan may request different write rates later).
      const writeHz = Math.max(1, Math.min(engineRate, Number(sink.visualWriteHz) || 12000));
      const visualStride = Math.max(1, Math.floor(engineRate / writeHz));
      const writeBufferedThisSample = (this.scopeCounter % visualStride) === 0;
      let value = 0;
      let hasConnected = false;
      for (const input of sink.inputs || []) {
        if (!input?.connected) {
          continue;
        }
        hasConnected = true;
        const inputValue = (input.connections || []).reduce(
          (connectionSum, connection) => connectionSum + this.readRuntimePortOutput(
            frameValues,
            connection.sourceNode,
            connection.sourcePort,
            frame,
            frames,
          ),
          0,
        );
        value += inputValue;
        const inputPort = String(input.port || "").trim();
        // Buffered rings: only at visual hop — not every engine sample.
        if (input?.buffered && inputPort && writeBufferedThisSample) {
          this.writeVisualInputBufferSample(
            nodeId,
            inputPort,
            inputValue,
            sink.bufferSampleLimit,
            {
              sampleStride: visualStride,
              sourceSampleRate: engineRate,
              writeSampleRate: engineRate / visualStride,
            },
          );
        }
        if (captureDebugScope && inputPort && !input?.buffered) {
          const portId = `${nodeId}:${inputPort}`;
          this.appendScopeBufferSample(portId, inputValue);
        }
      }
      if (captureDebugScope && hasConnected) {
        this.appendScopeBufferSample(nodeId, value);
      }
    }
};

NodeLiveAudioProcessor.prototype.appendScopeBufferSample = function appendScopeBufferSample(id, value) {
    const key = String(id || "");
    if (!key) {
      return;
    }
    const limit = 4096;
    let samples = this.scopeBuffers.get(key);
    if (!(samples instanceof Float32Array)) {
      samples = new Float32Array(limit);
      samples.nodeGraphScopeWriteIndex = 0;
      samples.nodeGraphScopeLength = 0;
      this.scopeBuffers.set(key, samples);
    }
    const writeIndex = Math.max(0, Math.min(limit - 1, Number(samples.nodeGraphScopeWriteIndex) || 0));
    samples[writeIndex] = this.scopeScalarValue(value);
    samples.nodeGraphScopeWriteIndex = (writeIndex + 1) % limit;
    samples.nodeGraphScopeLength = Math.min(limit, (Number(samples.nodeGraphScopeLength) || 0) + 1);
};

NodeLiveAudioProcessor.prototype.createVisualInputBuffer = function createVisualInputBuffer(capacity = 262144) {
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    return {
      absoluteFrame: 0,
      buffer: new Float32Array(safeCapacity),
      capacity: safeCapacity,
      length: 0,
      postedFrame: 0,
      writeIndex: 0,
      // Write hop metadata — absoluteFrame counts *written* samples (after hop).
      // sampleRate posted to the UI must be the effective write rate, not engine rate.
      sampleStride: 1,
      sourceSampleRate: 0,
      writeSampleRate: 0,
    };
};

NodeLiveAudioProcessor.prototype.normalizeVisualInputBufferCapacity = function normalizeVisualInputBufferCapacity(capacity = 262144) {
    return Math.max(1, Math.round(Number(capacity) || 262144));
};

NodeLiveAudioProcessor.prototype.resizeVisualInputBufferState = function resizeVisualInputBufferState(state, capacity = 262144) {
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    if (!state || state.capacity !== safeCapacity || !(state.buffer instanceof Float32Array)) {
      const next = this.createVisualInputBuffer(safeCapacity);
      if (!state?.buffer?.length || !state?.length) {
        return next;
      }
      const oldCapacity = state.capacity || state.buffer.length;
      const oldLength = Math.min(Number(state.length) || 0, oldCapacity);
      const copyCount = Math.min(oldLength, safeCapacity);
      const first = ((Number(state.writeIndex) || 0) - oldLength + oldCapacity) % oldCapacity;
      for (let index = 0; index < copyCount; index += 1) {
        const oldIndex = (first + oldLength - copyCount + index) % oldCapacity;
        next.buffer[index] = state.buffer[oldIndex] || 0;
      }
      next.length = copyCount;
      next.writeIndex = copyCount % safeCapacity;
      next.absoluteFrame = Math.max(Number(state.absoluteFrame) || 0, copyCount);
      next.postedFrame = Math.min(Math.max(Number(state.postedFrame) || 0, 0), next.absoluteFrame);
      next.sampleStride = Math.max(1, Math.round(Number(state.sampleStride) || 1));
      next.sourceSampleRate = Math.max(0, Number(state.sourceSampleRate) || 0);
      next.writeSampleRate = Math.max(0, Number(state.writeSampleRate) || 0);
      return next;
    }
    return state;
};

NodeLiveAudioProcessor.prototype.syncVisualInputBuffers = function syncVisualInputBuffers() {
    const expected = new Map();
    for (const sink of this.visualSinks || []) {
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
        const key = `${nodeId}:${port}`;
        expected.set(key, this.normalizeVisualInputBufferCapacity(sink.bufferSampleLimit));
      }
    }
    for (const [key, capacity] of expected) {
      const current = this.visualInputBuffers.get(key);
      if (!current || current.capacity !== capacity) {
        this.visualInputBuffers.set(key, this.resizeVisualInputBufferState(current, capacity));
      }
    }
    for (const key of [...this.visualInputBuffers.keys()]) {
      if (!expected.has(key)) {
        this.visualInputBuffers.delete(key);
      }
    }
};

NodeLiveAudioProcessor.prototype.writeVisualInputBufferSample = function writeVisualInputBufferSample(
  nodeId,
  port,
  value,
  capacity = 262144,
  rateMeta = null,
) {
    const key = `${nodeId}:${port}`;
    let buffer = this.visualInputBuffers.get(key);
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    if (!buffer || buffer.capacity !== safeCapacity) {
      buffer = this.resizeVisualInputBufferState(buffer, safeCapacity);
      this.visualInputBuffers.set(key, buffer);
    }
    // Tag hop so scope posts report the true samples/sec of this ring
    // (not engine rate). 1D Phosphor Sweep(s) and Trace history depend on it.
    if (rateMeta && typeof rateMeta === "object") {
      const stride = Math.max(1, Math.round(Number(rateMeta.sampleStride) || 1));
      const sourceRate = Math.max(1, Number(rateMeta.sourceSampleRate) || 0);
      const writeRate = Math.max(1, Number(rateMeta.writeSampleRate) || 0);
      buffer.sampleStride = stride;
      if (sourceRate > 0) {
        buffer.sourceSampleRate = sourceRate;
      }
      if (writeRate > 0) {
        buffer.writeSampleRate = writeRate;
      } else if (sourceRate > 0) {
        buffer.writeSampleRate = sourceRate / stride;
      }
    }
    buffer.buffer[buffer.writeIndex] = this.scopeScalarValue(value);
    buffer.writeIndex = (buffer.writeIndex + 1) % buffer.capacity;
    buffer.length = Math.min(buffer.capacity, buffer.length + 1);
    buffer.absoluteFrame += 1;
};

NodeLiveAudioProcessor.prototype.captureModuleScopeOutput = function captureModuleScopeOutput(nodeId, output) {
    const id = String(nodeId || "");
    if (!id) {
      return;
    }
    this.appendScopeBufferSample(id, output);
    if (!output || typeof output !== "object") {
      return;
    }
    for (const [port, value] of Object.entries(output)) {
      if (!port || !Number.isFinite(Number(value))) {
        continue;
      }
      const portId = `${id}:${port}`;
      this.appendScopeBufferSample(portId, value);
    }
};

