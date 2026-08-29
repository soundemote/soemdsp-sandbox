// MVEP GraphEngine host (PR-E4): setPlan → native compile; process → one
// soemdsp_graph_process_block per quantum. Control smoothers → set_param once
// per quantum; Live ƒ / CV ports map into the native graph; scope taps from
// node_port_ptr (no evaluateFrame).
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
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_MIX = 40;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE = 41;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT = 42;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_DELAY_SIZE = 43;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_RECYCLE = 44;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE = 45;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED = 46;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_VARIATION = 47;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SEED = 48;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_FEEDBACK = 50;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LEVEL = 51;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TIME_NUMERATOR = 52;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR = 53;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TIMING_MODE = 54;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OFFSET_MS = 55;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_STYLE = 56;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_RATE = 57;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SATURATE = 58;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LPF_FREQUENCY = 59;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_HPF_FREQUENCY = 60;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TEMPO_BPM = 61;

// Ports: 0 Mono/Out, 1 Left/Mix L, 2 Right/Mix R, 3 Saw/Dry L, 4 Ramp/Dry R, 5–7 taps.
// Live SIGNAL IN (not audio buses): 16 ƒ, 17 0.1V/Oct, 18 Increment, 19 Reset.
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO = 0;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT = 1;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT = 2;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW = 3;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP = 4;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE = 5;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI = 6;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE = 7;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_L = 3;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_R = 4;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_F = 16;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_PITCH_CV = 17;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_INCREMENT = 18;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RESET = 19;

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
  // Live absolute-Hz jack (must not fall through to Mono — would inject CV into audio).
  if (p === "f" || p === "ƒ" || p === "freq" || p === "frequency") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_F;
  }
  if (p === "0.1v/oct" || p === "0.1v" || p === "v/oct" || p === "pitch") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_PITCH_CV;
  }
  if (p === "increment" || p === "inc." || p === "inc") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_INCREMENT;
  }
  if (p === "reset") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RESET;
  }
  if (p === "left" || p === "l" || p === "mix l" || p === "wet l" || p === "left mix") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (p === "right" || p === "r" || p === "mix r" || p === "wet r" || p === "right mix") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (p === "dry l" || p === "left dry" || p === "mono dry") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_L;
  }
  if (p === "dry r" || p === "right dry") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_R;
  }
  if (p === "saw" || p === "mod l") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  if (p === "ramp" || p === "mod r") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  if (p === "square") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
  if (p === "tri" || p === "triangle") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
  if (p === "sine" || p === "sin") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
  // Mono / Out / In / Wave Out / Noise / Mono Mix / empty → mono bus
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
    && n?.soemdsp_graph_set_param
    && n?.soemdsp_graph_set_sample_rate
    && n?.soemdsp_graph_compile
    && n?.soemdsp_graph_process_block
    && n?.soemdsp_graph_block_output_left_ptr
    && n?.soemdsp_graph_block_output_right_ptr
    && n?.soemdsp_graph_node_port_ptr
    && n?.soemdsp_graph_max_block_frames
  );
};

/**
 * Efficient compile owns allowlist natives. Release leftover per-module
 * evaluator handles so pools are not double-allocated after full→efficient
 * toggles without a session restart (sabrina pool is only 2).
 */
NodeLiveAudioProcessor.prototype.releaseEfficientLegacyNativeHandles =
  function releaseEfficientLegacyNativeHandles() {
    if (this.polyBlepStates instanceof Map) {
      for (const state of this.polyBlepStates.values()) {
        this.destroyPolyBlepNativeState?.(state);
        if (state) state.blockCache = null;
      }
      this.polyBlepStates.clear();
    }
    if (this.ladderFilterStates instanceof Map) {
      for (const state of this.ladderFilterStates.values()) {
        this.destroyStereoFilterNativeState?.(state, (s) => this.destroyLadderFilterNativeState?.(s));
        this.resetLadderBlockCache?.(state?.mono);
        this.resetLadderBlockCache?.(state?.left);
        this.resetLadderBlockCache?.(state?.right);
      }
      this.ladderFilterStates.clear();
    }
    if (this.softClipperStates instanceof Map) {
      for (const state of this.softClipperStates.values()) {
        this.destroySoftClipperState?.(state);
      }
      this.softClipperStates.clear();
    }
    if (this.reverbEffectStates instanceof Map) {
      for (const state of this.reverbEffectStates.values()) {
        this.destroySabrinaReverbState?.(state);
      }
      this.reverbEffectStates.clear();
    }
    if (this.pingPongDelayStates instanceof Map) {
      for (const state of this.pingPongDelayStates.values()) {
        this.destroyPingPongDelayNativeState?.(state);
      }
      this.pingPongDelayStates.clear();
    }
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

/**
 * Sample worklet smoothers (+ MOD) once and push into native set_param.
 * Call after runActiveSmoothers each quantum so knobs ramp instead of step.
 */
NodeLiveAudioProcessor.prototype.syncNativeGraphParams = function syncNativeGraphParams(frames = 128) {
  if (!this.efficientProduct || !this.nativeGraphCompiled || !this.nativeGraphHandle) {
    return;
  }
  const native = this.nativeGraph;
  if (!native?.soemdsp_graph_set_param) {
    return;
  }
  const P = NodeLiveAudioProcessor;
  const safeFrames = Math.max(1, Number(frames) || 128);
  // Previous-quantum nodeOutputs feed MOD; Live ƒ is handled inside C++.
  const frameValues = this.nodeOutputs;
  const read = (node, key, fallback) => {
    if (typeof this.readEffectiveParameter === "function") {
      const v = this.readEffectiveParameter(node, key, fallback, 0, safeFrames, frameValues);
      return Number.isFinite(v) ? v : fallback;
    }
    if (typeof this.readSmoothedParameter === "function") {
      const v = this.readSmoothedParameter(node, key, fallback, 0, safeFrames);
      return Number.isFinite(v) ? v : fallback;
    }
    const raw = Number(node?.params?.[key]);
    return Number.isFinite(raw) ? raw : fallback;
  };
  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(P.NATIVE_GRAPH_TYPE_IDS, type)) continue;
    const hash = this.fnv1aHash32(id);
    if (type === "output") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_VOLUME_DB, read(node, "volume", -3));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_PAN, read(node, "pan", 0));
      continue;
    }
    if (type === "polyBlep") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_FREQUENCY, read(node, "frequency", 220));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_WAVEFORM, read(node, "waveform", 0));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_AMPLITUDE, read(node, "amplitude", 1));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_SHAPE, read(node, "shape", 0.5));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_PHASE, read(node, "phase", 0));
      continue;
    }
    if (type === "ladderFilter") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_FREQUENCY, read(node, "frequency", 1000));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_RESONANCE, read(node, "resonance", 0.2));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_MODE, read(node, "mode", 1));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_STAGES, read(node, "stages", 4));
      continue;
    }
    if (type === "softClipper") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_CENTER, read(node, "center", 0));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_WIDTH, read(node, "width", 2));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_OVERSAMPLE, read(node, "oversample", 2));
      continue;
    }
    if (type === "reverbEffect") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_MIX, read(node, "mix", 0.43));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, read(node, "diffusionSize", 0.35));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, read(node, "diffusionAmount", 0.7));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_DELAY_SIZE, read(node, "delaySize", 0.02));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_RECYCLE, read(node, "recycle", 0.7));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE, read(node, "lfoAmplitude", 0.07));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED, read(node, "lfoBaseSpeed", 0.83));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LFO_VARIATION, read(node, "lfoVariation", 0.001));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_SEED, read(node, "seed", 0));
      continue;
    }
    if (type === "pingPongDelay") {
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_FEEDBACK, read(node, "feedback", 0.35));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_MIX, read(node, "mix", 0.35));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LEVEL, read(node, "level", 1));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, read(node, "timeNumerator", 1));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, read(node, "timeDenominator", 4));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_TIMING_MODE, read(node, "timingMode", 0));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_OFFSET_MS, read(node, "offsetMs", 0));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LFO_STYLE, read(node, "lfoStyle", 0));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LFO_RATE, read(node, "lfoRate", 0.35));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LFO_VARIATION, read(node, "lfoVariation", 0.25));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_SATURATE, read(node, "saturate", 1));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, read(node, "lpfFrequency", 8000));
      this.pushNativeGraphParam(native, hash, P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, read(node, "hpfFrequency", 20));
      const bpm = Number(this.timing?.tempoBpm);
      this.pushNativeGraphParam(
        native,
        hash,
        P.NATIVE_GRAPH_PARAM_TEMPO_BPM,
        Number.isFinite(bpm) && bpm > 0 ? bpm : 120,
      );
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
    // Graph owns the only native DSP instances in efficient mode.
    this.releaseEfficientLegacyNativeHandles();

    native.soemdsp_graph_clear(this.nativeGraphHandle);
    native.soemdsp_graph_set_sample_rate(
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
        const poolMsg = rc === -5
          ? `native instance pool exhausted for ${id}`
          : `add_node failed (${rc}) for ${id}`;
        this.postNativeGraphStatus("error", poolMsg);
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

/** Map native audio port id → face port name(s) for nodeOutputs / scopes. */
NodeLiveAudioProcessor.prototype.nativeGraphPortNames = function nativeGraphPortNames(type, portId) {
  const P = NodeLiveAudioProcessor;
  if (portId === P.NATIVE_GRAPH_PORT_LEFT) {
    return type === "reverbEffect" || type === "pingPongDelay"
      ? ["Left", "Mix L", "Wet L"]
      : ["Left"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_RIGHT) {
    return type === "reverbEffect" || type === "pingPongDelay"
      ? ["Right", "Mix R", "Wet R"]
      : ["Right"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_MONO) {
    if (type === "polyBlep") return ["Out", "Wave Out", "Noise"];
    return ["Out", "Mono", "In"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SAW) {
    return type === "reverbEffect" ? ["Dry L"] : type === "pingPongDelay" ? ["Mod L", "Saw"] : ["Saw"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_RAMP) {
    return type === "reverbEffect" ? ["Dry R"] : type === "pingPongDelay" ? ["Mod R", "Ramp"] : ["Ramp"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SQUARE) return ["Square"];
  if (portId === P.NATIVE_GRAPH_PORT_TRI) return ["Tri"];
  if (portId === P.NATIVE_GRAPH_PORT_SINE) return ["Sine"];
  return [];
};

NodeLiveAudioProcessor.prototype.bindNativeGraphNodePortView = function bindNativeGraphNodePortView(
  hash,
  portId,
  frames,
) {
  const native = this.nativeGraph;
  const memory = native?.memory;
  if (!memory?.buffer || !this.nativeGraphHandle || !native.soemdsp_graph_node_port_ptr) {
    return null;
  }
  let ptr = 0;
  try {
    ptr = native.soemdsp_graph_node_port_ptr(this.nativeGraphHandle, hash, portId) | 0;
  } catch (_e) {
    return null;
  }
  if (!ptr) return null;
  return new Float64Array(memory.buffer, ptr, frames);
};

/**
 * Publish last-sample port values + append block samples into scope rings.
 * Observe-only — never walks JS DSP evaluators.
 */
NodeLiveAudioProcessor.prototype.publishNativeGraphScopeTaps = function publishNativeGraphScopeTaps(
  frames,
  options = {},
) {
  if (!this.nativeGraphCompiled || !this.nativeGraphHandle || frames < 1) return;
  const fillRings = options.fillRings !== false;
  const stressed = Boolean(options.stressed);
  const P = NodeLiveAudioProcessor;
  const audioPorts = [
    P.NATIVE_GRAPH_PORT_MONO,
    P.NATIVE_GRAPH_PORT_LEFT,
    P.NATIVE_GRAPH_PORT_RIGHT,
    P.NATIVE_GRAPH_PORT_SAW,
    P.NATIVE_GRAPH_PORT_RAMP,
    P.NATIVE_GRAPH_PORT_SQUARE,
    P.NATIVE_GRAPH_PORT_TRI,
    P.NATIVE_GRAPH_PORT_SINE,
  ];

  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(P.NATIVE_GRAPH_TYPE_IDS, type)) continue;
    const hash = this.fnv1aHash32(id);
    const out = Object.create(null);
    let any = false;
    for (let pi = 0; pi < audioPorts.length; pi += 1) {
      const portId = audioPorts[pi];
      const view = this.bindNativeGraphNodePortView(hash, portId, frames);
      if (!view || !view.length) continue;
      const last = Number(view[frames - 1]);
      const sample = Number.isFinite(last) ? last : 0;
      const names = this.nativeGraphPortNames(type, portId);
      for (let ni = 0; ni < names.length; ni += 1) {
        out[names[ni]] = sample;
        any = true;
      }
    }
    if (any) {
      this.nodeOutputs.set(id, out);
    }
  }

  // Speaker bus already ear-protected in processNativeGraphQuantum — keep last L/R.
  const outputNodeId = this.outputNode || "output";
  const existing = this.nodeOutputs.get(outputNodeId);
  if (!existing || typeof existing !== "object") {
    this.nodeOutputs.set(outputNodeId, { Left: 0, Right: 0, Mono: 0, Out: 0 });
  }

  if (!fillRings || typeof this.appendScopeBufferSample !== "function") {
    return;
  }
  if (!Array.isArray(this.compiledVisualSinks) || !Array.isArray(this.compiledScopeNodes)) {
    this.compileScopeCapture?.();
  }

  // Module face rings: one sample per quantum (last), unless stressed then skip.
  if (!stressed && Array.isArray(this.compiledScopeNodes)) {
    for (let i = 0; i < this.compiledScopeNodes.length; i += 1) {
      const entry = this.compiledScopeNodes[i];
      const nodeId = entry?.nodeId;
      if (!nodeId || !this.nodeOutputs.has(nodeId)) continue;
      this.captureModuleScopeOutput?.(nodeId, this.nodeOutputs.get(nodeId));
    }
  }

  // Visual sinks (scope/monitor): append block samples from native port buffers.
  const sinks = this.compiledVisualSinks;
  if (!Array.isArray(sinks) || !sinks.length) return;
  const stride = stressed ? 8 : 1;
  const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
  for (let s = 0; s < sinks.length; s += 1) {
    const sink = sinks[s];
    const inputs = sink?.inputs;
    if (!Array.isArray(inputs) || !inputs.length) continue;
    for (let frame = 0; frame < frames; frame += stride) {
      let aggregate = 0;
      for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        const connections = input?.connections;
        let inputValue = 0;
        if (Array.isArray(connections)) {
          for (let c = 0; c < connections.length; c += 1) {
            const connection = connections[c];
            const portId = this.mapNativeGraphPortId(connection.sourcePort);
            const hash = this.fnv1aHash32(connection.sourceNode);
            const view = this.bindNativeGraphNodePortView(hash, portId, frames);
            if (view && frame < view.length) {
              const v = Number(view[frame]);
              inputValue += Number.isFinite(v) ? v : 0;
            } else {
              inputValue += Number(this.readRuntimePortOutput?.(
                this.nodeOutputs,
                connection.sourceNode,
                connection.sourcePort,
                frame,
                frames,
              )) || 0;
            }
          }
        }
        aggregate += inputValue;
        if (input.buffered && input.port) {
          this.writeVisualInputBufferSample?.(
            sink.nodeId,
            input.port,
            inputValue,
            sink.bufferSampleLimit,
            {
              sampleStride: stride,
              sourceSampleRate: engineRate,
              writeSampleRate: engineRate / stride,
            },
          );
        }
        if (input.portId && !input.buffered) {
          this.appendScopeBufferSample(input.portId, inputValue);
        }
      }
      if (!sink.skipAggregate) {
        this.appendScopeBufferSample(sink.nodeId, aggregate);
      }
    }
  }
};

/**
 * Efficient-mode quantum: native process_block (chunked at max_block_frames),
 * copy to speakers + ear protect. Timing/meter posts stay in process().
 * Returns true when this path handled audio (caller must not evaluateFrame).
 *
 * Contract: graph + orchestrated natives hard-cap at 128 frames. Host chunks
 * larger quanta so the efficient path never trailing-silences mid-quantum.
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

  // Advance Control smoothers, then sample into native set_param (Issue 8).
  this.runActiveSmoothers?.(frames);
  this.syncNativeGraphParams?.(frames);

  const native = this.nativeGraph;
  const maxBlock = Math.max(1, Number(native.soemdsp_graph_max_block_frames()) || 128);
  let written = 0;
  const stressed = Boolean(this.audioThreadStressed);

  while (written < frames) {
    const chunk = Math.min(maxBlock, frames - written);
    let processed = 0;
    try {
      processed = native.soemdsp_graph_process_block(this.nativeGraphHandle, chunk) | 0;
    } catch (_e) {
      processed = -1;
    }
    // Invalidate view cache size when chunk length changes across iterations.
    if (this.nativeGraphBlockViews) this.nativeGraphBlockViews.frames = -1;
    if (processed < 1 || !this.bindNativeGraphBlockViews(chunk)) {
      for (let frame = written; frame < frames; frame += 1) {
        for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
          output[channelIndex][frame] = 0;
        }
      }
      this.nativeGraphCompiled = false;
      this.postNativeGraphStatus("error", "process_block failed");
      return true;
    }

    const leftView = this.nativeGraphBlockViews.left;
    const rightView = this.nativeGraphBlockViews.right;
    const outCount = Math.min(chunk, leftView.length, rightView.length);
    for (let i = 0; i < outCount; i += 1) {
      const frame = written + i;
      let left = Number(leftView[i]);
      let right = Number(rightView[i]);
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
    for (let i = outCount; i < chunk; i += 1) {
      const frame = written + i;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex][frame] = 0;
      }
    }

    // Scope taps from this chunk's native node buffers (no JS DSP walk).
    this.publishNativeGraphScopeTaps(chunk, { fillRings: true, stressed });

    written += chunk;
  }

  // Publish ear-protected speaker bus for output observers.
  const outputNodeId = this.outputNode || "output";
  if (frames > 0) {
    const lastL = Number(output[0]?.[frames - 1]) || 0;
    const lastR = Number(output[1]?.[frames - 1] ?? output[0]?.[frames - 1]) || 0;
    this.nodeOutputs.set(outputNodeId, {
      Left: lastL,
      Right: lastR,
      Mono: (lastL + lastR) * 0.5,
      Out: (lastL + lastR) * 0.5,
    });
  }

  return true;
};
