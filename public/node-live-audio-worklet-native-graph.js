// MVEP GraphEngine host (PR-E2): setPlan → native compile; process → one
// soemdsp_graph_process_block per quantum (polyBlep/ladder/softClip/output).
// Efficient mode has no evaluateFrame fallback.
// Node id hashing: FNV-1a 32-bit (offset 2166136261, prime 16777619).

NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS = Object.freeze({
  polyBlep: 1,
  ladderFilter: 2,
  softClipper: 3,
  reverbEffect: 4,
  pingPongDelay: 5,
  output: 6,
});

// Param IDs — keep in sync with graph_engine.cpp kParam*.
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_VOLUME_DB = 0;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_PAN = 1;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_FREQUENCY = 10;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_WAVEFORM = 11;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_AMPLITUDE = 12;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SHAPE = 13;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_PHASE = 14;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_RESONANCE = 20;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_MODE = 21;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_STAGES = 22;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_CENTER = 30;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_WIDTH = 31;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OVERSAMPLE = 32;

// Ports: 0 Mono/Out, 1 Left, 2 Right, 3–7 polyBlep taps.
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO = 0;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT = 1;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT = 2;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW = 3;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP = 4;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE = 5;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI = 6;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE = 7;

NodeLiveAudioProcessor.prototype.fnv1aHash32 = function fnv1aHash32(text) {
  let hash = 2166136261 >>> 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

NodeLiveAudioProcessor.prototype.mapNativeGraphTypeId = function mapNativeGraphTypeId(type) {
  const id = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS[String(type || "").trim()];
  return Number.isFinite(id) ? id : 0;
};

NodeLiveAudioProcessor.prototype.mapNativeGraphPortId = function mapNativeGraphPortId(port) {
  const raw = String(port || "").trim();
  const p = raw.toLowerCase();
  if (p === "left" || p === "l") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  if (p === "right" || p === "r") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  if (p === "saw") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  if (p === "ramp") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  if (p === "square") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
  if (p === "tri" || p === "triangle") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
  if (p === "sine" || p === "sin") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
  // Mono / Out / In / Wave Out / Noise / empty → mono bus
  return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
};

NodeLiveAudioProcessor.prototype.pushNativeGraphParam = function pushNativeGraphParam(
  native,
  hash,
  paramId,
  value,
) {
  if (!native?.soemdsp_graph_set_param || !this.nativeGraphHandle) return;
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  try {
    native.soemdsp_graph_set_param(this.nativeGraphHandle, hash, paramId, v);
  } catch (_e) { /* ignore */ }
};

NodeLiveAudioProcessor.prototype.nativeGraphExportsReady = function nativeGraphExportsReady() {
  const n = this.nativeGraph;
  return Boolean(
    this.nativeGraphReady
    && n?.soemdsp_graph_create
    && n?.soemdsp_graph_clear
    && n?.soemdsp_graph_add_node
    && n?.soemdsp_graph_connect
    && n?.soemdsp_graph_compile
    && n?.soemdsp_graph_process_block
    && n?.soemdsp_graph_block_output_left_ptr
    && n?.soemdsp_graph_block_output_right_ptr
  );
};

NodeLiveAudioProcessor.prototype.destroyNativeGraphHandle = function destroyNativeGraphHandle() {
  if (this.nativeGraphHandle && this.nativeGraph?.soemdsp_graph_destroy) {
    try {
      this.nativeGraph.soemdsp_graph_destroy(this.nativeGraphHandle);
    } catch (_e) { /* ignore */ }
  }
  this.nativeGraphHandle = 0;
  this.nativeGraphCompiled = false;
  this.nativeGraphStatus = "";
  this.nativeGraphStatusMessage = "";
  this.nativeGraphBlockViews = null;
};

NodeLiveAudioProcessor.prototype.postNativeGraphStatus = function postNativeGraphStatus(status, message = "") {
  const next = String(status || "");
  const msg = String(message || "");
  // Skip no-op re-posts (idle silence path must not flood the message port).
  if (next === this.nativeGraphStatus && msg === (this.nativeGraphStatusMessage || "")) {
    return;
  }
  this.nativeGraphStatus = next;
  this.nativeGraphStatusMessage = msg;
  try {
    this.port.postMessage({
      type: "nativeGraphStatus",
      status: this.nativeGraphStatus,
      message: msg,
      compiled: Boolean(this.nativeGraphCompiled),
      handle: Number(this.nativeGraphHandle) || 0,
      planSerial: this.planSerial,
      sessionId: this.sessionId,
    });
  } catch (_e) { /* ignore */ }
};

/** Push Control params for allowlisted nodes into a compiled native graph. */
NodeLiveAudioProcessor.prototype.syncNativeGraphParams = function syncNativeGraphParams() {
  if (!this.efficientProduct || !this.nativeGraphCompiled || !this.nativeGraphHandle) {
    return;
  }
  const native = this.nativeGraph;
  if (!native?.soemdsp_graph_set_param) {
    return;
  }
  const P = NodeLiveAudioProcessor;
  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(P.NATIVE_GRAPH_TYPE_IDS, type)) continue;
    const hash = this.fnv1aHash32(id);
    const params = node.params || {};
    if (type === "output") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_VOLUME_DB, params.volume);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_PAN, params.pan);
      continue;
    }
    if (type === "polyBlep") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_FREQUENCY, params.frequency);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_WAVEFORM, params.waveform);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_AMPLITUDE, params.amplitude);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_SHAPE, params.shape);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_PHASE, params.phase);
      continue;
    }
    if (type === "ladderFilter") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_FREQUENCY, params.frequency);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_RESONANCE, params.resonance);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_MODE, params.mode);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_STAGES, params.stages);
      continue;
    }
    if (type === "softClipper") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_CENTER, params.center);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_WIDTH, params.width);
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_OVERSAMPLE, params.oversample);
    }
  }
};

/**
 * Rebuild the native graph from the current plan (DSP allowlist types only).
 * Returns true when compile succeeded.
 */
NodeLiveAudioProcessor.prototype.compileNativeGraphFromPlan = function compileNativeGraphFromPlan() {
  this.nativeGraphCompiled = false;
  this.nativeGraphBlockViews = null;

  if (!this.efficientProduct) {
    return false;
  }
  if (!this.nativeGraphExportsReady()) {
    this.postNativeGraphStatus("missing", "graph_engine exports not loaded");
    return false;
  }

  const native = this.nativeGraph;
  if (!this.nativeGraphHandle) {
    try {
      this.nativeGraphHandle = native.soemdsp_graph_create() | 0;
    } catch (_e) {
      this.nativeGraphHandle = 0;
    }
  }
  if (!this.nativeGraphHandle) {
    this.postNativeGraphStatus("error", "soemdsp_graph_create failed");
    return false;
  }

  try {
    native.soemdsp_graph_clear(this.nativeGraphHandle);
    native.soemdsp_graph_set_sample_rate?.(
      this.nativeGraphHandle,
      Number(this.engineSampleRate) || Number(this.hostSampleRate) || sampleRate || 44100,
    );

    const audioTypes = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS;
    const nodes = [];
    for (const [id, node] of this.nodes) {
      const typeId = this.mapNativeGraphTypeId(node?.type);
      if (!typeId) continue;
      // Skip non-allowlist DSP (observers/chrome never get typeIds here).
      if (!Object.prototype.hasOwnProperty.call(audioTypes, String(node?.type || ""))) continue;
      const hash = this.fnv1aHash32(id);
      const rc = native.soemdsp_graph_add_node(this.nativeGraphHandle, hash, typeId) | 0;
      if (rc !== 0) {
        this.postNativeGraphStatus("error", `add_node failed (${rc}) for ${id}`);
        return false;
      }
      nodes.push({ id, hash, type: node.type, params: node.params || {} });
    }

    const idSet = new Set(nodes.map((n) => n.id));
    const hashById = new Map(nodes.map((n) => [n.id, n.hash]));
    const connections = Array.isArray(this._planConnections) ? this._planConnections : [];
    for (const c of connections) {
      const src = String(c?.sourceNode || "");
      const dst = String(c?.destinationNode || "");
      if (!idSet.has(src) || !idSet.has(dst)) continue;
      const rc = native.soemdsp_graph_connect(
        this.nativeGraphHandle,
        hashById.get(src),
        this.mapNativeGraphPortId(c?.sourcePort),
        hashById.get(dst),
        this.mapNativeGraphPortId(c?.destinationPort),
      ) | 0;
      if (rc !== 0) {
        this.postNativeGraphStatus("error", `connect failed (${rc}) ${src}->${dst}`);
        return false;
      }
    }

    const crc = native.soemdsp_graph_compile(this.nativeGraphHandle) | 0;
    if (crc !== 0) {
      this.postNativeGraphStatus("error", `compile failed (${crc})`);
      return false;
    }

    this.nativeGraphCompiled = true;
    this.syncNativeGraphParams();
    this.postNativeGraphStatus("compiled", `nodes=${nodes.length}`);
    return true;
  } catch (error) {
    this.nativeGraphCompiled = false;
    this.postNativeGraphStatus("error", String(error?.message || error || "compile threw"));
    return false;
  }
};

NodeLiveAudioProcessor.prototype.bindNativeGraphBlockViews = function bindNativeGraphBlockViews(frames) {
  const native = this.nativeGraph;
  const memory = native?.memory;
  if (!memory?.buffer || !this.nativeGraphHandle || frames < 1) {
    return false;
  }
  const cache = this.nativeGraphBlockViews || (this.nativeGraphBlockViews = {});
  if (cache.left && cache.memory === memory.buffer && cache.frames === frames) {
    return true;
  }
  const leftPtr = native.soemdsp_graph_block_output_left_ptr(this.nativeGraphHandle);
  const rightPtr = native.soemdsp_graph_block_output_right_ptr(this.nativeGraphHandle);
  if (!leftPtr || !rightPtr) {
    return false;
  }
  cache.left = new Float64Array(memory.buffer, leftPtr, frames);
  cache.right = new Float64Array(memory.buffer, rightPtr, frames);
  cache.memory = memory.buffer;
  cache.frames = frames;
  return true;
};

/**
 * Efficient-mode quantum: one native process_block, copy to speakers + ear protect.
 * Timing/meter posts stay in process(). Returns true when this path handled audio
 * (caller must not evaluateFrame).
 */
NodeLiveAudioProcessor.prototype.processNativeGraphQuantum = function processNativeGraphQuantum(
  output,
  frames,
) {
  if (!this.efficientProduct) {
    return false;
  }

  const fillSilence = () => {
    for (const channel of output) {
      if (channel) channel.fill(0);
    }
  };

  if (!this.nativeGraphCompiled) {
    // Honest silence — no JS evaluateFrame fallback in efficient mode.
    fillSilence();
    // postNativeGraphStatus dedupes identical status/message (no per-quantum spam).
    if (this.nativeGraphExportsReady()) {
      this.postNativeGraphStatus("idle", "graph not compiled");
    } else {
      this.postNativeGraphStatus("missing", "graph_engine exports not loaded");
    }
    return true;
  }

  const native = this.nativeGraph;
  const n = Math.min(
    frames,
    Number(native.soemdsp_graph_max_block_frames?.()) || 128,
  );
  let processed = 0;
  try {
    processed = native.soemdsp_graph_process_block(this.nativeGraphHandle, n) | 0;
  } catch (_e) {
    processed = -1;
  }
  if (processed < 1 || !this.bindNativeGraphBlockViews(n)) {
    fillSilence();
    this.nativeGraphCompiled = false;
    this.postNativeGraphStatus("error", "process_block failed");
    return true;
  }

  const leftView = this.nativeGraphBlockViews.left;
  const rightView = this.nativeGraphBlockViews.right;
  const outCount = Math.min(frames, n, leftView.length, rightView.length);

  for (let frame = 0; frame < outCount; frame += 1) {
    let left = Number(leftView[frame]);
    let right = Number(rightView[frame]);
    if (!Number.isFinite(left)) left = 0;
    if (!Number.isFinite(right)) right = 0;
    if (this.outputSampleClipped?.(left)) this.meterClipCount += 1;
    if (this.outputSampleClipped?.(right)) this.meterClipCount += 1;
    if (
      this.outputSampleTripsEarProtection?.(left)
      || this.outputSampleTripsEarProtection?.(right)
    ) {
      this.speakerProtectionPeak = Math.max(
        Number(this.speakerProtectionPeak) || 0,
        Math.abs(left),
        Math.abs(right),
      );
      this.speakerProtectionNodeId = "output";
    }
    const protectedFrame = this.earProtector.protect(left, right);
    if (protectedFrame.engaged || protectedFrame.muted) {
      this.meterProtectionMuteCount += 1;
    }
    this.protectionEngaged = Boolean(protectedFrame.engaged);
    this.protectionGain = Number(protectedFrame.gain);
    const pl = Number.isFinite(Number(protectedFrame.left)) ? Number(protectedFrame.left) : 0;
    const pr = Number.isFinite(Number(protectedFrame.right)) ? Number(protectedFrame.right) : 0;
    this.meterPeak = Math.max(this.meterPeak, Math.abs(pl), Math.abs(pr));
    this.meterSquareSum += (pl * pl + pr * pr) * 0.5;
    this.meterSamples += 1;
    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      output[channelIndex][frame] = channelIndex === 0 ? pl : pr;
    }
  }
  for (let frame = outCount; frame < frames; frame += 1) {
    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      output[channelIndex][frame] = 0;
    }
  }

  // Publish stereo bus for scopes (observe-only; no JS DSP walk).
  const outputNodeId = this.outputNode || "output";
  if (outCount > 0) {
    const lastL = Number(output[0]?.[outCount - 1]) || 0;
    const lastR = Number(output[1]?.[outCount - 1] ?? output[0]?.[outCount - 1]) || 0;
    this.nodeOutputs.set(outputNodeId, {
      Left: lastL,
      Right: lastR,
      Mono: (lastL + lastR) * 0.5,
      Out: (lastL + lastR) * 0.5,
    });
  }

  return true;
};
