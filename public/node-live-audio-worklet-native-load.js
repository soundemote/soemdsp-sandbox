// Extracted from node-live-audio-worklet-core.js (Phase D — native wasm load + gpu additive).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.setNativeModuleWasm = async function setNativeModuleWasm(message) {
    if (!(message.bytes instanceof ArrayBuffer)) {
      return;
    }
    const name = String(message.name || "");
    const targetType = String(message.targetType || "");
    let exports = null;
    try {
      const result = await WebAssembly.instantiate(message.bytes, {});
      exports = result?.instance?.exports || null;
    } catch (error) {
      // For the combined binary, report per-module errors (so Module
      // Diagnostics names what's affected) plus one under "combined" (so
      // the main thread's retry handler un-marks it for the next plan
      // update).
      const failed = name === "combined" && Array.isArray(message.modules)
        ? [...message.modules, { name: "combined" }]
        : [{ name, targetType }];
      for (const entry of failed) {
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: String(entry?.name || name),
          status: "error",
          message: String(error?.message || error || "native module load failed"),
        });
      }
      return;
    }
    if (name === "combined") {
      // One instance, one shared linear memory, every module's exports on
      // the same object (all prefix-namespaced) -- apply it to each module
      // slot in turn. See scripts/build_native_modules.ps1 for why.
      const entries = Array.isArray(message.modules) ? message.modules : [];
      for (const entry of entries) {
        const entryName = String(entry?.name || "");
        try {
          this.applyNativeModuleExports(entryName, String(entry?.targetType || ""), exports);
        } catch (error) {
          this.port.postMessage({
            type: "nativeModuleStatus",
            name: entryName,
            status: "error",
            message: String(error?.message || error || "native module apply failed"),
          });
        }
      }
      return;
    }
    try {
      this.applyNativeModuleExports(name, targetType, exports);
    } catch (error) {
      this.port.postMessage({
        type: "nativeModuleStatus",
        name,
        status: "error",
        message: String(error?.message || error || "native module apply failed"),
      });
    }
};

NodeLiveAudioProcessor.prototype.pushGpuAdditiveChunk = function pushGpuAdditiveChunk(message = {}) {
    if (message.sessionId !== this.sessionId || message.planSerial !== this.planSerial) {
      return;
    }
    const nodeId = String(message.nodeId || "");
    const samples = message.samples instanceof Float32Array
      ? message.samples
      : new Float32Array(message.samples || []);
    if (!nodeId || samples.length <= 0) {
      return;
    }
    const queue = this.gpuAdditiveQueues.get(nodeId) || {
      backend: "",
      chunks: [],
      droppedChunks: 0,
      expectedSequence: 0,
      heldGain: 1,
      heldSamples: 0,
      lastSample: 0,
      readIndex: 0,
      resetCount: 0,
      version: "",
    };
    queue.backend = String(message.backend || queue.backend || "");
    const version = String(message.version || "");
    if (queue.version !== version) {
      queue.chunks = [];
      queue.droppedChunks = 0;
      queue.expectedSequence = 0;
      queue.readIndex = 0;
      queue.resetCount += 1;
      queue.version = version;
    }
    const sequence = Number(message.sequence);
    if (Number.isFinite(sequence)) {
      if (sequence < queue.expectedSequence) {
        return;
      }
      if (sequence > queue.expectedSequence) {
        queue.droppedChunks += sequence - queue.expectedSequence;
        queue.chunks = [];
        queue.readIndex = 0;
      }
      queue.expectedSequence = sequence + 1;
    }
    queue.chunks.push(samples);
    while (queue.chunks.length > 12) {
      queue.chunks.shift();
      queue.droppedChunks += 1;
      queue.readIndex = 0;
    }
    this.gpuAdditiveQueues.set(nodeId, queue);
};

NodeLiveAudioProcessor.prototype.postGpuAdditiveStatus = function postGpuAdditiveStatus() {
    const queues = [];
    for (const [nodeId, queue] of this.gpuAdditiveQueues) {
      queues.push({
        nodeId,
        backend: queue.backend,
        chunks: queue.chunks.length,
        droppedChunks: queue.droppedChunks,
        expectedSequence: queue.expectedSequence,
        heldGain: queue.heldGain,
        heldSamples: queue.heldSamples,
        resetCount: queue.resetCount,
        samples: queue.chunks.reduce((sum, chunk) => sum + chunk.length, 0) - queue.readIndex,
        version: queue.version,
      });
    }
    this.port.postMessage({
      queues,
      sessionId: this.sessionId,
      type: "gpuAdditiveStatus",
      underruns: this.gpuAdditiveUnderruns,
    });
    this.gpuAdditiveUnderruns = 0;
};

