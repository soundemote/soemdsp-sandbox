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
    for (const key of ["Bias", "Out", "Mono", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
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

NodeLiveAudioProcessor.prototype.visualWriteStride = function visualWriteStride(writeHz, engineRate) {
    const rate = Math.max(1, Number(engineRate) || 44100);
    const hz = Number(writeHz);
    // 0 / missing / ≥ engine → every sample (waveform rings).
    if (!Number.isFinite(hz) || hz <= 0 || hz >= rate) {
      return 1;
    }
    // Positive writeHz is "latest-value" (LCD). Follow Simulation FPS, not 60.
    const fps = Number(this.displayFps);
    if (!(fps > 0)) {
      return 0;
    }
    return Math.max(1, Math.floor(rate / fps));
};

// Bake scope capture lists on setPlan — sample loop must not walk plan objects.
NodeLiveAudioProcessor.prototype.compileScopeCapture = function compileScopeCapture() {
    const rates = this.scopeCaptureRates || Object.create(null);
    const captureNodeIds = Array.isArray(this.scopeCaptureNodeIds) && this.scopeCaptureNodeIds.length
      ? this.scopeCaptureNodeIds
      : (this.order || []);
    const nodes = [];
    for (let i = 0; i < captureNodeIds.length; i += 1) {
      const nodeId = captureNodeIds[i];
      const captureType = String(this.nodes.get(nodeId)?.type || "");
      // Output Instant Trace uses visual-sink L/R rings (same as 1D Stereo Trace).
      if (captureType === "output") {
        continue;
      }
      nodes.push({ nodeId, writeHz: rates[nodeId] });
    }
    this.compiledScopeNodes = nodes;

    const sinks = this.visualSinks || [];
    const compiled = new Array(sinks.length);
    let sinkCount = 0;
    for (let s = 0; s < sinks.length; s += 1) {
      const sink = sinks[s];
      const nodeId = String(sink?.nodeId || "");
      if (!nodeId) {
        continue;
      }
      const sinkType = String(sink.type || this.nodes.get(nodeId)?.type || "");
      const multiBuffered = (sink.bufferedInputs || []).length > 1;
      const rawInputs = sink.inputs || [];
      const inputs = [];
      for (let i = 0; i < rawInputs.length; i += 1) {
        const input = rawInputs[i];
        if (!input?.connected) {
          continue;
        }
        const inputPort = String(input.port || "").trim();
        const connections = input.connections || [];
        const compiledConnections = new Array(connections.length);
        for (let c = 0; c < connections.length; c += 1) {
          compiledConnections[c] = {
            sourceNode: connections[c].sourceNode,
            sourcePort: connections[c].sourcePort,
          };
        }
        inputs.push({
          buffered: Boolean(input.buffered),
          port: inputPort,
          portId: inputPort ? `${nodeId}:${inputPort}` : "",
          connections: compiledConnections,
        });
      }
      compiled[sinkCount] = {
        nodeId,
        writeHz: sink.visualWriteHz,
        bufferSampleLimit: sink.bufferSampleLimit,
        skipAggregate: multiBuffered || sinkType === "output",
        inputs,
      };
      sinkCount += 1;
    }
    compiled.length = sinkCount;
    this.compiledVisualSinks = compiled;
};

NodeLiveAudioProcessor.prototype.captureModuleScopeFrame = function captureModuleScopeFrame(frameValues = null, frame = 0, frames = 1) {
    const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    this.scopeSampleStride = 1;
    if (!Array.isArray(this.compiledScopeNodes) || !Array.isArray(this.compiledVisualSinks)) {
      this.compileScopeCapture();
    }
    const scopeNodes = this.compiledScopeNodes;
    if (Array.isArray(scopeNodes)) {
      for (let i = 0; i < scopeNodes.length; i += 1) {
        const entry = scopeNodes[i];
        const nodeId = entry.nodeId;
        if (!this.nodeOutputs.has(nodeId)) {
          continue;
        }
        const stride = this.visualWriteStride(entry.writeHz, engineRate);
        if (!(stride > 0) || (this.scopeCounter % stride) !== 0) {
          continue;
        }
        this.captureModuleScopeOutput(nodeId, this.nodeOutputs.get(nodeId));
      }
    }
    const sinks = this.compiledVisualSinks;
    if (!Array.isArray(sinks) || !sinks.length) {
      return;
    }
    for (let s = 0; s < sinks.length; s += 1) {
      const sink = sinks[s];
      const visualStride = this.visualWriteStride(sink.writeHz, engineRate);
      if (!(visualStride > 0) || (this.scopeCounter % visualStride) !== 0) {
        continue;
      }
      let value = 0;
      const inputs = sink.inputs;
      for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        let inputValue = 0;
        const connections = input.connections;
        for (let c = 0; c < connections.length; c += 1) {
          const connection = connections[c];
          inputValue += this.readRuntimePortOutput(
            frameValues,
            connection.sourceNode,
            connection.sourcePort,
            frame,
            frames,
          );
        }
        value += inputValue;
        if (input.buffered && input.port) {
          this.writeVisualInputBufferSample(
            sink.nodeId,
            input.port,
            inputValue,
            sink.bufferSampleLimit,
            {
              sampleStride: visualStride,
              sourceSampleRate: engineRate,
              writeSampleRate: engineRate / visualStride,
            },
          );
        }
        if (input.portId && !input.buffered) {
          this.appendScopeBufferSample(input.portId, inputValue);
        }
      }
      if (inputs.length && !sink.skipAggregate) {
        this.appendScopeBufferSample(sink.nodeId, value);
      }
    }
};

NodeLiveAudioProcessor.prototype.appendScopeBufferSample = function appendScopeBufferSample(id, value) {
    const key = String(id || "");
    if (!key) {
      return;
    }
    const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    const fps = Math.max(1, Number(this.displayFps) || 60);
    const limit = Math.max(4096, Math.ceil(engineRate / fps) + 256);
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
    samples.nodeGraphScopeTotalWritten = (Number(samples.nodeGraphScopeTotalWritten) || 0) + 1;
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
    const visualKeys = this.visualInputBuffers || new Map();
    const hasVisualPorts = [...visualKeys.keys()].some((key) => String(key).startsWith(`${id}:`));
    // Stereo/XYZ waterfall already write Left/Right or X/Y/Z visual rings.
    // Posting the same keys from outputs doubled samples → tape ran ~2× vs Mono (In≠Thru).
    if (!hasVisualPorts) {
      this.appendScopeBufferSample(id, output);
    }
    if (!output || typeof output !== "object") {
      return;
    }
    for (const [port, value] of Object.entries(output)) {
      if (!port || !Number.isFinite(Number(value))) {
        continue;
      }
      const portId = `${id}:${port}`;
      if (visualKeys.has(portId)) {
        continue;
      }
      this.appendScopeBufferSample(portId, value);
    }
};

