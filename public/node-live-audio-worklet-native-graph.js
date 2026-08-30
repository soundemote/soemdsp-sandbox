// MVEP GraphEngine host (PR-E4): setPlan → native compile; process → one
// soemdsp_graph_process_block per quantum. Efficient path: write Control
// targets (+ smooth times) only — native SmootherManager chases. Live ƒ / CV
// ports map into the native graph; scope taps from node_port_ptr.
// Node id hashing: FNV-1a 32-bit (offset 2166136261, prime 16777619).

NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS = Object.freeze({
  polyBlep: 1,
  ladderFilter: 2,
  softClipper: 3,
  reverbEffect: 4,
  pingPongDelay: 5,
  output: 6,
  attenuverter: 7,
  range: 8,
  inv: 9,
  u2b: 10,
  b2u: 11,
  bias: 12,
  gain: 13,
  noiseGenerator: 14,
  robinSinusoid: 15,
  robinSupersaw: 16,
  slewLimiter: 17,
  comparator: 18,
  sampleDelay: 19,
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
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_ATT_AMPLITUDE = 70;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_ATT_OFFSET = 71;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_IN_LOW = 80;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_IN_HIGH = 81;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OUT_LOW = 82;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OUT_HIGH = 83;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_DB = 90;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_LEFT_DB = 91;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_RIGHT_DB = 92;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_MONO_SUM = 93;

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

/** Audio tap ports only (0–7). Never maps Live aliases — those are destination-only.
 *  Optional `type` disambiguates module-local names that reuse tap slots (Thru, etc.).
 */
NodeLiveAudioProcessor.prototype.mapNativeGraphSrcPortId = function mapNativeGraphSrcPortId(
  port,
  type,
) {
  const raw = String(port || "").trim();
  const p = raw.toLowerCase();
  const t = String(type || "").trim();
  if (
    p === "left" || p === "l" || p === "mix l" || p === "wet l" || p === "left mix"
    || p === "left out"
  ) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (
    p === "right" || p === "r" || p === "mix r" || p === "wet r" || p === "right mix"
    || p === "right out"
  ) {
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
  // Comparator named outs (reuse tap slots; see graph_engine kPortCmp*).
  if (p === "up") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  if (p === "down") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  if (p === "change") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
  if (p === "steady") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
  if (p === "sign") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
  if (p === "delayed") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "thru") {
    // comparator Thru → Mono; sampleDelay Thru → Dry L.
    return t === "sampleDelay"
      ? NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_L
      : NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  // Mono / Out / In / Wave Out / Noise / Frequency (MIDI out) / empty → mono bus
  return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
};

/** Destination ports: audio buses + Live SIGNAL IN (ƒ / 0.1V / Inc / Reset). */
NodeLiveAudioProcessor.prototype.mapNativeGraphDstPortId = function mapNativeGraphDstPortId(
  port,
  type,
) {
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
  return this.mapNativeGraphSrcPortId(port, type);
};

/** @deprecated Prefer mapNativeGraphSrcPortId / mapNativeGraphDstPortId. */
NodeLiveAudioProcessor.prototype.mapNativeGraphPortId = function mapNativeGraphPortId(port) {
  return this.mapNativeGraphDstPortId(port);
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

/**
 * Jump every native Control out → target (clears chase list).
 * Call after compile + initial param sync so the first audible sample is
 * on-patch. Do NOT call on pause→play — frozen mid-ramps must resume.
 */
NodeLiveAudioProcessor.prototype.snapNativeGraphControls = function snapNativeGraphControls() {
  if (!this.efficientProduct || !this.nativeGraphHandle) return false;
  const native = this.nativeGraph;
  if (typeof native?.soemdsp_graph_snap_controls !== "function") return false;
  try {
    return (native.soemdsp_graph_snap_controls(this.nativeGraphHandle) | 0) === 0;
  } catch (_e) {
    return false;
  }
};

NodeLiveAudioProcessor.prototype.pushNativeGraphSmoothTime = function pushNativeGraphSmoothTime(
  native,
  hash,
  paramId,
  timeSamples,
) {
  if (!native?.soemdsp_graph_set_smooth_time || !this.nativeGraphHandle) return;
  const t = Number(timeSamples);
  if (!Number.isFinite(t) || t < 0) return;
  try {
    native.soemdsp_graph_set_smooth_time(this.nativeGraphHandle, hash, paramId, t);
  } catch (_e) { /* ignore */ }
};

NodeLiveAudioProcessor.prototype.pushNativeGraphSmoothMode = function pushNativeGraphSmoothMode(
  native,
  hash,
  paramId,
  mode,
) {
  if (!native?.soemdsp_graph_set_smooth_mode || !this.nativeGraphHandle) return;
  const m = Number(mode);
  if (!Number.isFinite(m)) return;
  try {
    native.soemdsp_graph_set_smooth_mode(this.nativeGraphHandle, hash, paramId, m | 0);
  } catch (_e) { /* ignore */ }
};

NodeLiveAudioProcessor.prototype.pushNativeGraphSmoothType = function pushNativeGraphSmoothType(
  native,
  hash,
  paramId,
  type,
) {
  if (!native?.soemdsp_graph_set_smooth_type || !this.nativeGraphHandle) return;
  const t = Number(type);
  if (!Number.isFinite(t)) return;
  try {
    native.soemdsp_graph_set_smooth_type(this.nativeGraphHandle, hash, paramId, t | 0);
  } catch (_e) { /* ignore */ }
};

/** paramMeta.smoothingSeconds → samples (same rules as worklet smoother). */
NodeLiveAudioProcessor.prototype.nativeGraphSmoothTimeSamplesFromMeta = function nativeGraphSmoothTimeSamplesFromMeta(
  metadata = {},
) {
  const value = Number(metadata?.smoothingSeconds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rate = Math.max(1, Number(this.engineSampleRate || sampleRate) || 44100);
  if (value > 0 && value < 1) {
    return Math.max(1, Math.round(value * rate));
  }
  return Math.max(0, Math.round(value));
};

/** Map patch smoothingMode → native enum (0 internal, 1 global, 2 internalGlobal, 3 off). */
NodeLiveAudioProcessor.prototype.nativeGraphSmoothModeFromMeta = function nativeGraphSmoothModeFromMeta(
  metadata = {},
) {
  const raw = metadata?.smoothingMode;
  const mode = typeof nodeSmoothingModeNormalize === "function"
    ? nodeSmoothingModeNormalize(raw)
    : String(raw || "internal");
  if (mode === "global") return 1;
  if (mode === "internalGlobal") return 2;
  if (mode === "off") return 3;
  return 0; // internal (default)
};

/** Map patch smoothingType → native (0 1P, 1 L, 2 2P, 3 none, 4 Π, 5 3P). */
NodeLiveAudioProcessor.prototype.nativeGraphSmoothTypeFromMeta = function nativeGraphSmoothTypeFromMeta(
  metadata = {},
) {
  const raw = metadata?.smoothingType;
  const type = typeof normalizeNodeGraphParameterSmootherFilterType === "function"
    ? normalizeNodeGraphParameterSmootherFilterType(raw)
    : (typeof this.smoothingTypeFromMetadata === "function"
      ? this.smoothingTypeFromMetadata(metadata)
      : String(raw || "onePole"));
  if (type === "linear") return 1;
  if (type === "twoPole") return 2;
  if (type === "none" || type === "off" || type === "instant") return 3;
  if (type === "papoulis") return 4;
  if (type === "threePole") return 5;
  return 0; // onePole
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
    && n?.soemdsp_graph_set_smooth_time
    && n?.soemdsp_graph_set_smooth_mode
    && n?.soemdsp_graph_set_smooth_type
    && n?.soemdsp_graph_set_global_smooth_time
    && n?.soemdsp_graph_set_bypassed
    && n?.soemdsp_graph_set_sample_rate
    && n?.soemdsp_graph_compile
    && n?.soemdsp_graph_process_block
    && n?.soemdsp_graph_block_output_left_ptr
    && n?.soemdsp_graph_block_output_right_ptr
    && n?.soemdsp_graph_node_port_ptr
    && n?.soemdsp_graph_max_block_frames
  );
};

/** Topology fingerprint — bypass-only changes must NOT rebuild natives. */
NodeLiveAudioProcessor.prototype.nativeGraphTopologyKey = function nativeGraphTopologyKey() {
  const audioTypes = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS;
  const nodeParts = [];
  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(audioTypes, type)) continue;
    nodeParts.push(`${id}\0${type}`);
  }
  nodeParts.sort();
  const connParts = [];
  const connections = Array.isArray(this._planConnections) ? this._planConnections : [];
  for (const c of connections) {
    const src = String(c?.sourceNode || "");
    const dst = String(c?.destinationNode || "");
    if (!src || !dst) continue;
    connParts.push(
      `${src}\0${String(c?.sourcePort || "")}\0${dst}\0${String(c?.destinationPort || "")}`,
    );
  }
  connParts.sort();
  return `${nodeParts.join("|")}#${connParts.join("|")}`;
};

NodeLiveAudioProcessor.prototype.syncNativeGraphBypass = function syncNativeGraphBypass() {
  if (!this.efficientProduct || !this.nativeGraphCompiled || !this.nativeGraphHandle) {
    return;
  }
  const native = this.nativeGraph;
  if (!native?.soemdsp_graph_set_bypassed) return;
  const audioTypes = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS;
  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(audioTypes, type)) continue;
    const hash = this.fnv1aHash32(id);
    try {
      native.soemdsp_graph_set_bypassed(
        this.nativeGraphHandle,
        hash,
        node?.bypassed ? 1 : 0,
      );
    } catch (_e) { /* ignore */ }
  }
};

/** Recompile only when nodes/wires change; bypass is a light flag sync. */
NodeLiveAudioProcessor.prototype.syncNativeGraphFromPlan = function syncNativeGraphFromPlan() {
  if (!this.efficientProduct) return false;
  const key = this.nativeGraphTopologyKey();
  if (this.nativeGraphCompiled && key === this._nativeGraphTopologyKey) {
    this.syncNativeGraphBypass();
    if (typeof this.syncNativeGraphParams === "function") {
      this.syncNativeGraphParams();
    }
    return true;
  }
  const ok = this.compileNativeGraphFromPlan();
  if (ok) {
    this._nativeGraphTopologyKey = key;
    this.syncNativeGraphBypass();
  } else {
    this._nativeGraphTopologyKey = "";
  }
  return ok;
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
  this.nativeGraphPortViewCache = null;
  this._nativeGraphParamCache = null;
  this._nativeGraphParamCachePlanSerial = undefined;
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

// Discrete Controls: push snapped targets (avoid fractional enum while ramping).
NodeLiveAudioProcessor.NATIVE_GRAPH_DISCRETE_PARAMS = Object.freeze({
  waveform: true,
  mode: true,
  stages: true,
  voices: true,
  oversample: true,
  timingMode: true,
  lfoStyle: true,
  seed: true,
  monoSum: true,
});

/**
 * Write Control targets (+ smooth times from paramMeta) into native graph.
 * Efficient path must not sample JS smoothers — native SmootherManager chases.
 * Only pushes when the domain target / time changed (dirty cache).
 */
NodeLiveAudioProcessor.prototype.syncNativeGraphParams = function syncNativeGraphParams(_frames = 128) {
  if (!this.efficientProduct || !this.nativeGraphCompiled || !this.nativeGraphHandle) {
    return;
  }
  const native = this.nativeGraph;
  if (!native?.soemdsp_graph_set_param) {
    return;
  }
  const P = NodeLiveAudioProcessor;
  const cacheById = this._nativeGraphParamCache || (this._nativeGraphParamCache = new Map());
  const forceAll = this._nativeGraphParamCachePlanSerial !== this.planSerial;
  this._nativeGraphParamCachePlanSerial = this.planSerial;

  // Optional global time cell from worklet autoSmoothingSeconds.
  if (native.soemdsp_graph_set_global_smooth_time) {
    const rate = Math.max(1, Number(this.engineSampleRate || sampleRate) || 44100);
    const seconds = Math.max(0, Number(this.autoSmoothingSeconds) || 0);
    const globalSamples = seconds > 0 ? Math.max(1, Math.round(seconds * rate)) : 0;
    if (forceAll || this._nativeGraphGlobalSmoothSamples !== globalSamples) {
      this._nativeGraphGlobalSmoothSamples = globalSamples;
      try {
        native.soemdsp_graph_set_global_smooth_time(this.nativeGraphHandle, globalSamples);
      } catch (_e) { /* ignore */ }
    }
  }

  // Raw domain target — no JS chase / MOD sampling on the efficient path.
  const readContinuous = (node, key, fallback) => {
    const raw = Number(node?.params?.[key]);
    return Number.isFinite(raw) ? raw : fallback;
  };
  // Enum / choice knobs: snapped domain target.
  const readDiscrete = (node, key, fallback) => {
    let v = Number(node?.params?.[key]);
    if (!Number.isFinite(v)) v = fallback;
    return Math.round(v);
  };
  const pushChanged = (hash, cache, key, paramId, value, node) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    if (forceAll || cache[key] !== v) {
      cache[key] = v;
      this.pushNativeGraphParam(native, hash, paramId, v);
    }
    if (P.NATIVE_GRAPH_DISCRETE_PARAMS[key]) return;
    const meta = node?.paramMeta?.[key];
    const timeKey = `${key}__smoothTime`;
    const modeKey = `${key}__smoothMode`;
    const typeKey = `${key}__smoothType`;
    const timeSamples = this.nativeGraphSmoothTimeSamplesFromMeta?.(meta) || 0;
    const smoothMode = this.nativeGraphSmoothModeFromMeta?.(meta) ?? 0;
    const smoothType = this.nativeGraphSmoothTypeFromMeta?.(meta) ?? 0;
    if (forceAll || cache[modeKey] !== smoothMode) {
      cache[modeKey] = smoothMode;
      this.pushNativeGraphSmoothMode(native, hash, paramId, smoothMode);
    }
    if (forceAll || cache[typeKey] !== smoothType) {
      cache[typeKey] = smoothType;
      this.pushNativeGraphSmoothType(native, hash, paramId, smoothType);
    }
    if (forceAll || cache[timeKey] !== timeSamples) {
      cache[timeKey] = timeSamples;
      this.pushNativeGraphSmoothTime(native, hash, paramId, timeSamples);
    }
  };

  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(P.NATIVE_GRAPH_TYPE_IDS, type)) continue;
    const hash = this.fnv1aHash32(id);
    let cache = cacheById.get(id);
    if (!cache || forceAll) {
      cache = Object.create(null);
      cacheById.set(id, cache);
    }
    const cont = (key, fallback) => readContinuous(node, key, fallback);
    const disc = (key, fallback) => readDiscrete(node, key, fallback);
    const push = (key, paramId, value) => pushChanged(hash, cache, key, paramId, value, node);

    if (type === "output") {
      push("volume", P.NATIVE_GRAPH_PARAM_VOLUME_DB, cont("volume", -3));
      push("pan", P.NATIVE_GRAPH_PARAM_PAN, cont("pan", 0));
      continue;
    }
    if (type === "polyBlep") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 220));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("shape", P.NATIVE_GRAPH_PARAM_SHAPE, cont("shape", 0.5));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      continue;
    }
    if (type === "ladderFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1000));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 1));
      push("stages", P.NATIVE_GRAPH_PARAM_STAGES, disc("stages", 4));
      continue;
    }
    if (type === "softClipper") {
      push("center", P.NATIVE_GRAPH_PARAM_CENTER, cont("center", 0));
      push("width", P.NATIVE_GRAPH_PARAM_WIDTH, cont("width", 2));
      push("oversample", P.NATIVE_GRAPH_PARAM_OVERSAMPLE, disc("oversample", 2));
      continue;
    }
    if (type === "reverbEffect") {
      push("mix", P.NATIVE_GRAPH_PARAM_MIX, cont("mix", 0.43));
      push("diffusionSize", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("diffusionSize", 0.35));
      push("diffusionAmount", P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, cont("diffusionAmount", 0.7));
      push("delaySize", P.NATIVE_GRAPH_PARAM_DELAY_SIZE, cont("delaySize", 0.02));
      push("recycle", P.NATIVE_GRAPH_PARAM_RECYCLE, cont("recycle", 0.7));
      push("lfoAmplitude", P.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE, cont("lfoAmplitude", 0.07));
      push("lfoBaseSpeed", P.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED, cont("lfoBaseSpeed", 0.83));
      push("lfoVariation", P.NATIVE_GRAPH_PARAM_LFO_VARIATION, cont("lfoVariation", 0.001));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 0));
      continue;
    }
    if (type === "pingPongDelay") {
      push("feedback", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("feedback", 0.35));
      push("mix", P.NATIVE_GRAPH_PARAM_MIX, cont("mix", 0.35));
      push("level", P.NATIVE_GRAPH_PARAM_LEVEL, cont("level", 1));
      push("timeNumerator", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("timeNumerator", 1));
      push("timeDenominator", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("timeDenominator", 4));
      push("timingMode", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("timingMode", 0));
      push("offsetMs", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("offsetMs", 0));
      push("lfoStyle", P.NATIVE_GRAPH_PARAM_LFO_STYLE, disc("lfoStyle", 0));
      push("lfoRate", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("lfoRate", 0.35));
      push("lfoVariation", P.NATIVE_GRAPH_PARAM_LFO_VARIATION, cont("lfoVariation", 0.25));
      push("saturate", P.NATIVE_GRAPH_PARAM_SATURATE, cont("saturate", 1));
      push("lpfFrequency", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("lpfFrequency", 8000));
      push("hpfFrequency", P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, cont("hpfFrequency", 20));
      const bpm = Number(this.timing?.tempoBpm);
      push(
        "tempoBpm",
        P.NATIVE_GRAPH_PARAM_TEMPO_BPM,
        Number.isFinite(bpm) && bpm > 0 ? bpm : 120,
      );
      continue;
    }
    if (type === "attenuverter") {
      push("amplitude", P.NATIVE_GRAPH_PARAM_ATT_AMPLITUDE, cont("amplitude", 0.5));
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 0));
      continue;
    }
    if (type === "bias") {
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 0));
      continue;
    }
    if (type === "gain") {
      push("gainDb", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("gainDb", 0));
      push("leftDb", P.NATIVE_GRAPH_PARAM_GAIN_LEFT_DB, cont("leftDb", 0));
      push("rightDb", P.NATIVE_GRAPH_PARAM_GAIN_RIGHT_DB, cont("rightDb", 0));
      push("monoSum", P.NATIVE_GRAPH_PARAM_GAIN_MONO_SUM, disc("monoSum", 0));
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 0));
      continue;
    }
    if (type === "noiseGenerator") {
      // Reuse existing Control slots: mode, shape, offset=mean, width=deviation,
      // seed, amplitude=level.
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("shape", P.NATIVE_GRAPH_PARAM_SHAPE, cont("shape", 0));
      push("mean", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("mean", 0));
      push("deviation", P.NATIVE_GRAPH_PARAM_WIDTH, cont("deviation", 0.5));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "robinSinusoid") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 440));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      continue;
    }
    if (type === "robinSupersaw") {
      // width = detuneCents, stages = voices
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("detuneCents", P.NATIVE_GRAPH_PARAM_WIDTH, cont("detuneCents", 30));
      push("voices", P.NATIVE_GRAPH_PARAM_STAGES, disc("voices", 7));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "slewLimiter") {
      // timeNumerator=upTime, timeDenominator=downTime, shape, offset=bias
      push("upTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("upTime", 0.05));
      push("downTime", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("downTime", 0.20));
      push("shape", P.NATIVE_GRAPH_PARAM_SHAPE, disc("shape", 0));
      push("bias", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("bias", 0));
      continue;
    }
    // comparator: no Control params
    if (type === "sampleDelay") {
      // timeNumerator=time (s), timeDenominator=samples
      push("time", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("time", 0));
      push("samples", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("samples", 0));
      continue;
    }
    if (type === "range") {
      push("inLow", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("inLow", -1));
      push("inHigh", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("inHigh", 1));
      push("outLow", P.NATIVE_GRAPH_PARAM_OUT_LOW, cont("outLow", 0));
      push("outHigh", P.NATIVE_GRAPH_PARAM_OUT_HIGH, cont("outHigh", 1000));
      continue;
    }
    // inv / u2b / b2u: no Control params
  }
};

/**
 * Rebuild the native graph from the current plan (DSP allowlist types only).
 * Returns true when compile succeeded.
 */
NodeLiveAudioProcessor.prototype.compileNativeGraphFromPlan = function compileNativeGraphFromPlan() {
  this.nativeGraphCompiled = false;
  this._nativeGraphTopologyKey = "";
  this.nativeGraphBlockViews = null;
  this.nativeGraphPortViewCache = null;
  this._nativeGraphParamCache = null;
  this._nativeGraphParamCachePlanSerial = undefined;

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
    const skipped = [];
    for (const [id, node] of this.nodes) {
      const type = String(node?.type || "");
      const typeId = this.mapNativeGraphTypeId(type);
      if (!typeId || !Object.prototype.hasOwnProperty.call(audioTypes, type)) {
        if (type) skipped.push(type);
        continue;
      }
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

    // Never mark compiled with an empty DSP graph — that raced ahead of setPlan
    // (wasm apply while this.nodes was still empty) and left Live silent.
    if (!nodes.length) {
      this.nativeGraphCompiled = false;
      this._nativeGraphTopologyKey = "";
      const skipMsg = skipped.length ? ` skipped=${skipped.join(",")}` : "";
      this.postNativeGraphStatus(
        "idle",
        `nodes=0 (workletNodes=${this.nodes.size}${skipMsg})`,
      );
      return false;
    }

    const idSet = new Set(nodes.map((n) => n.id));
    const hashById = new Map(nodes.map((n) => [n.id, n.hash]));
    const typeById = new Map(nodes.map((n) => [n.id, n.type]));
    const connections = Array.isArray(this._planConnections) ? this._planConnections : [];
    for (const c of connections) {
      const src = String(c?.sourceNode || "");
      const dst = String(c?.destinationNode || "");
      if (!idSet.has(src) || !idSet.has(dst)) continue;
      const rc = native.soemdsp_graph_connect(
        this.nativeGraphHandle,
        hashById.get(src),
        this.mapNativeGraphSrcPortId(c?.sourcePort, typeById.get(src)),
        hashById.get(dst),
        this.mapNativeGraphDstPortId(c?.destinationPort, typeById.get(dst)),
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
    this._nativeGraphTopologyKey = this.nativeGraphTopologyKey();
    this.syncNativeGraphParams();
    // Graph recreate starts Controls at C++ defaults; after targets are
    // written, snap so engine-start does not ramp from defaults → patch.
    this.snapNativeGraphControls();
    this.syncNativeGraphBypass();
    this.postNativeGraphStatus("compiled", `nodes=${nodes.length}`);
    return true;
  } catch (error) {
    this.nativeGraphCompiled = false;
    this._nativeGraphTopologyKey = "";
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
    if (type === "reverbEffect" || type === "pingPongDelay") {
      return ["Left", "Mix L", "Wet L"];
    }
    if (type === "noiseGenerator") return ["Left", "Left Out"];
    return ["Left"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_RIGHT) {
    if (type === "reverbEffect" || type === "pingPongDelay") {
      return ["Right", "Mix R", "Wet R"];
    }
    if (type === "noiseGenerator") return ["Right", "Right Out"];
    return ["Right"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_MONO) {
    if (type === "polyBlep") return ["Out", "Wave Out", "Noise"];
    if (type === "comparator") return ["Thru"];
    if (type === "sampleDelay") return ["Delayed", "Out", "Mono"];
    return ["Out", "Mono", "In"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SAW) {
    if (type === "comparator") return ["Up"];
    if (type === "sampleDelay") return ["Thru"];
    return type === "reverbEffect" ? ["Dry L"] : type === "pingPongDelay" ? ["Mod L", "Saw"] : ["Saw"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_RAMP) {
    if (type === "comparator") return ["Down"];
    return type === "reverbEffect" ? ["Dry R"] : type === "pingPongDelay" ? ["Mod R", "Ramp"] : ["Ramp"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SQUARE) {
    return type === "comparator" ? ["Change"] : ["Square"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_TRI) {
    return type === "comparator" ? ["Steady"] : ["Tri"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SINE) {
    return type === "comparator" ? ["Sign"] : ["Sine"];
  }
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
  const cache = this.nativeGraphPortViewCache || (this.nativeGraphPortViewCache = new Map());
  const key = `${hash >>> 0}:${portId | 0}:${frames | 0}`;
  const hit = cache.get(key);
  if (hit && hit.memory === memory.buffer && hit.view && hit.view.length === frames) {
    return hit.view;
  }
  let ptr = 0;
  try {
    ptr = native.soemdsp_graph_node_port_ptr(this.nativeGraphHandle, hash, portId) | 0;
  } catch (_e) {
    return null;
  }
  if (!ptr) return null;
  const view = new Float64Array(memory.buffer, ptr, frames);
  cache.set(key, { memory: memory.buffer, view });
  return view;
};

/**
 * Publish last-sample port values + append block samples into scope rings.
 * Observe-only — never walks JS DSP evaluators.
 * Output node taps use ear-protected speaker buffers when provided (options.protected*).
 */
NodeLiveAudioProcessor.prototype.publishNativeGraphScopeTaps = function publishNativeGraphScopeTaps(
  frames,
  options = {},
) {
  if (!this.nativeGraphCompiled || !this.nativeGraphHandle || frames < 1) return;
  const fillRings = options.fillRings !== false;
  const stressed = Boolean(options.stressed);
  const protectedLeft = options.protectedLeft || null;
  const protectedRight = options.protectedRight || protectedLeft;
  const frameOffset = Math.max(0, Number(options.frameOffset) || 0);
  const outputNodeId = this.outputNode || "output";
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
    // Output nodeOutputs come from ear-protected speaker bus (set after protect).
    if (type === "output") continue;
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

  if (protectedLeft && frames > 0) {
    const lastL = Number(protectedLeft[frameOffset + frames - 1]) || 0;
    const lastR = Number(protectedRight?.[frameOffset + frames - 1] ?? lastL) || 0;
    this.nodeOutputs.set(outputNodeId, {
      Left: lastL,
      Right: lastR,
      Mono: (lastL + lastR) * 0.5,
      Out: (lastL + lastR) * 0.5,
    });
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

  const readSrcSample = (sourceNode, sourcePort, frame) => {
    const srcType = String(this.nodes.get(sourceNode)?.type || "");
    if (srcType === "output" && protectedLeft) {
      const portId = this.mapNativeGraphSrcPortId(sourcePort, srcType);
      const idx = frameOffset + frame;
      if (portId === P.NATIVE_GRAPH_PORT_RIGHT) {
        return Number(protectedRight?.[idx] ?? protectedLeft[idx]) || 0;
      }
      if (portId === P.NATIVE_GRAPH_PORT_LEFT) {
        return Number(protectedLeft[idx]) || 0;
      }
      const l = Number(protectedLeft[idx]) || 0;
      const r = Number(protectedRight?.[idx] ?? l) || 0;
      return (l + r) * 0.5;
    }
    const portId = this.mapNativeGraphSrcPortId(sourcePort, srcType);
    const hash = this.fnv1aHash32(sourceNode);
    const view = this.bindNativeGraphNodePortView(hash, portId, frames);
    if (view && frame < view.length) {
      const v = Number(view[frame]);
      return Number.isFinite(v) ? v : 0;
    }
    return Number(this.readRuntimePortOutput?.(
      this.nodeOutputs,
      sourceNode,
      sourcePort,
      frame,
      frames,
    )) || 0;
  };

  // Visual sinks (scope/monitor): append block samples from native / protected buffers.
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
            inputValue += readSrcSample(connection.sourceNode, connection.sourcePort, frame);
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
    // setPlan often races ahead of combined-wasm instantiate. Retry compile
    // once exports land so we do not stay silent forever after a cold start.
    if (this.nativeGraphExportsReady()) {
      const now = Number(currentFrame) || 0;
      if (!Number.isFinite(this._nativeGraphCompileRetryFrame)
        || now - this._nativeGraphCompileRetryFrame >= 128) {
        this._nativeGraphCompileRetryFrame = now;
        try {
          this.syncNativeGraphFromPlan?.() || this.compileNativeGraphFromPlan?.();
        } catch (_e) { /* status posted by compile */ }
      }
    }
    if (!this.nativeGraphCompiled) {
      fillSilence();
      if (this.nativeGraphExportsReady()) {
        this.postNativeGraphStatus("idle", "graph not compiled");
      } else {
        this.postNativeGraphStatus("missing", "graph_engine exports not loaded");
      }
      return true;
    }
  }

  // Write targets only — native graph_engine SmootherManager chases outs.
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

    // Scope taps: DSP from native bufs; output sinks from ear-protected speakers.
    this.publishNativeGraphScopeTaps(chunk, {
      fillRings: true,
      stressed,
      protectedLeft: output[0],
      protectedRight: output[1] || output[0],
      frameOffset: written,
    });

    written += chunk;
  }

  return true;
};
