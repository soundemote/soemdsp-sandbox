// Offline/render Pi Spigot — same revolving BBP as the native module.

const nodeGraphPiSpigotNoiseWasm = { promise: null, exports: null, failed: false };
const NODE_GRAPH_PI_SPIGOT_MAX_N = 2048;
const NODE_GRAPH_PI_SPIGOT_TAIL = 16;
const NODE_GRAPH_PI_SPIGOT_SERIES_M = [1, 4, 5, 6];
const NODE_GRAPH_PI_SPIGOT_SERIES_C = [4, -2, -1, -1];

function applyNodeGraphPiSpigotSmoothing(channel, x, smoothing) {
  const safeSmoothing = clampNodeSliderValue(Number(smoothing) || 0, 0, 1);
  if (safeSmoothing <= 0) return x;
  const g = Math.exp(safeSmoothing * -3.912023005428146);
  let y = x;
  for (let i = 0; i < 4; i += 1) {
    channel.smoothLp[i] += g * (y - channel.smoothLp[i]);
    y = channel.smoothLp[i];
  }
  return y;
}

function applyNodeGraphPiSpigotColor(state, white, color) {
  if (color === 1) {
    state.pink[0] = 0.99886 * state.pink[0] + white * 0.0555179;
    state.pink[1] = 0.99332 * state.pink[1] + white * 0.0750759;
    state.pink[2] = 0.969 * state.pink[2] + white * 0.153852;
    state.pink[3] = 0.8665 * state.pink[3] + white * 0.3104856;
    state.pink[4] = 0.55 * state.pink[4] + white * 0.5329522;
    state.pink[5] = -0.7616 * state.pink[5] - white * 0.016898;
    const out = (state.pink[0] + state.pink[1] + state.pink[2]
      + state.pink[3] + state.pink[4] + state.pink[5] + state.pink[6] + white * 0.5362) * 0.11;
    state.pink[6] = white * 0.115926;
    return out;
  }
  if (color === 2) {
    state.brown = clampNodeSliderValue(state.brown + white * 0.05, -1, 1);
    return state.brown;
  }
  if (color === 3) {
    const out = (white - state.prevWhite1) * 0.5;
    state.prevWhite1 = white;
    return out;
  }
  if (color === 4) {
    const out = (white - 2 * state.prevWhite1 + state.prevWhite2) * 0.25;
    state.prevWhite2 = state.prevWhite1;
    state.prevWhite1 = white;
    return out;
  }
  return white;
}

function resetNodeGraphPiSpigotColorFilters(state) {
  state.pink[0] = 0; state.pink[1] = 0; state.pink[2] = 0; state.pink[3] = 0;
  state.pink[4] = 0; state.pink[5] = 0; state.pink[6] = 0;
  state.brown = 0;
  state.prevWhite1 = 0;
  state.prevWhite2 = 0;
  state.smoothLp[0] = 0; state.smoothLp[1] = 0; state.smoothLp[2] = 0; state.smoothLp[3] = 0;
}

function nodeGraphPiSpigotPowMod(a, b, m) {
  if (!(m > 0)) return 0;
  let result = 1;
  let base = a % m;
  if (base < 0) base += m;
  let expn = b < 0 ? 0 : b;
  while (expn > 0.5) {
    if (expn % 2 >= 1) result = (result * base) % m;
    expn = Math.floor(expn / 2);
    base = (base * base) % m;
  }
  return result;
}

function nodeGraphPiSpigotSeriesTerm(m, k, n) {
  const ak = 8 * k + m;
  if (ak <= 0) return 0;
  if (k <= n) return nodeGraphPiSpigotPowMod(16, n - k, ak) / ak;
  let t = 1;
  for (let i = 0; i < k - n; i += 1) t *= 0.0625;
  return t / ak;
}

function createNodeGraphPiSpigotNoiseChannelState() {
  return {
    pink: [0, 0, 0, 0, 0, 0, 0],
    brown: 0,
    prevWhite1: 0,
    prevWhite2: 0,
    smoothLp: [0, 0, 0, 0],
  };
}

function createNodeGraphPiSpigotNoiseState() {
  return {
    startN: 0,
    stride: 1,
    n: 0,
    k: 0,
    phase: 0,
    S: 0,
    lastTerm: 0,
    hex: 0,
    pulse: 0,
    sumCh: createNodeGraphPiSpigotNoiseChannelState(),
    termCh: createNodeGraphPiSpigotNoiseChannelState(),
    wasmHandle: 0,
    wasmStart: null,
    wasmStride: null,
  };
}

function nodeGraphPiSpigotRestartDigit(state) {
  state.k = 0;
  state.phase = 0;
  state.S = 0;
  state.lastTerm = 0;
}

function nodeGraphPiSpigotApplyStartStride(state, start, stride) {
  const startN = clampNodeSliderValue(Math.round((Number(start) || 0) * NODE_GRAPH_PI_SPIGOT_MAX_N), 0, NODE_GRAPH_PI_SPIGOT_MAX_N);
  const st = clampNodeSliderValue(Math.round(Number(stride) || 1), 1, 16);
  if (startN === state.startN && st === state.stride) return;
  state.startN = startN;
  state.stride = st;
  state.n = startN;
  state.hex = 0;
  state.pulse = 0;
  nodeGraphPiSpigotRestartDigit(state);
  resetNodeGraphPiSpigotColorFilters(state.sumCh);
  resetNodeGraphPiSpigotColorFilters(state.termCh);
}

function nodeGraphPiSpigotStepEquation(state) {
  const m = NODE_GRAPH_PI_SPIGOT_SERIES_M[state.phase];
  const c = NODE_GRAPH_PI_SPIGOT_SERIES_C[state.phase];
  const term = c * nodeGraphPiSpigotSeriesTerm(m, state.k, state.n);
  state.lastTerm = term;
  state.S += term;
  state.S -= Math.floor(state.S);
  if (state.S < 0) state.S += 1;
  state.pulse = 0;
  state.phase += 1;
  if (state.phase < 4) return;
  state.phase = 0;
  state.k += 1;
  if (state.k <= state.n + NODE_GRAPH_PI_SPIGOT_TAIL) return;
  let hex = Math.floor(state.S * 16);
  if (hex > 15) hex = 15;
  if (hex < 0) hex = 0;
  state.hex = hex;
  state.pulse = 1;
  state.n += state.stride;
  if (state.n > NODE_GRAPH_PI_SPIGOT_MAX_N) state.n = state.startN;
  nodeGraphPiSpigotRestartDigit(state);
}

function nodeGraphPiSpigotNoiseLoadWasm() {
  if (nodeGraphPiSpigotNoiseWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphPiSpigotNoiseWasm.promise = fetch("/native_modules/pi_spigot_noise/pi_spigot_noise.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphPiSpigotNoiseWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphPiSpigotNoiseWasm.failed = true;
    });
}

function nodeGraphPiSpigotPortsFromState(state, color, smoothing, level) {
  nodeGraphPiSpigotStepEquation(state);
  const sum = state.S * 2 - 1;
  const term = clampNodeSliderValue(state.lastTerm * 0.25, -1, 1);
  return {
    Left: applyNodeGraphPiSpigotSmoothing(state.sumCh, applyNodeGraphPiSpigotColor(state.sumCh, sum, color), smoothing) * level,
    Right: applyNodeGraphPiSpigotSmoothing(state.termCh, applyNodeGraphPiSpigotColor(state.termCh, term, color), smoothing) * level,
    Hex: state.hex / 15,
    N: state.n / NODE_GRAPH_PI_SPIGOT_MAX_N,
    T: state.pulse ? 1 : 0,
    B3: (state.hex & 8) ? 1 : 0,
    B2: (state.hex & 4) ? 1 : 0,
    B1: (state.hex & 2) ? 1 : 0,
    B0: (state.hex & 1) ? 1 : 0,
  };
}

function nodeGraphPiSpigotNoiseSample(state, params, runtime = null, nodeId = "") {
  const start = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.start ?? params.seedLeft, runtime, nodeId, null, "pi spigot start"), 0, 1);
  const stride = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.stride, runtime, nodeId, null, "pi spigot stride") || 1, 1, 16);
  const color = clampNodeSliderValue(Math.round(nodeGraphSafeFilterNumber(params.color, runtime, nodeId, null, "pi spigot noise color")), 0, 4);
  const smoothing = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.smoothing, runtime, nodeId, null, "pi spigot noise smoothing"), 0, 1);
  const level = nodeGraphSafeFilterNumber(params.amplitude ?? params.level, runtime, nodeId, null, "pi spigot noise level");

  nodeGraphPiSpigotNoiseLoadWasm();
  const wasm = nodeGraphPiSpigotNoiseWasm.exports;
  if (wasm?.soemdsp_pi_spigot_noise_create && wasm?.soemdsp_pi_spigot_noise_sample) {
    if (!state.wasmHandle) {
      state.wasmHandle = wasm.soemdsp_pi_spigot_noise_create();
    }
    if (state.wasmHandle) {
      if (state.wasmStart !== start || state.wasmStride !== stride) {
        state.wasmStart = start;
        state.wasmStride = stride;
        wasm.soemdsp_pi_spigot_noise_reset_seed(state.wasmHandle, start, stride);
      }
      wasm.soemdsp_pi_spigot_noise_sample(state.wasmHandle, color, smoothing, level);
      const h = state.wasmHandle;
      return {
        Left: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_left(h), runtime, nodeId, null, "pi spigot sum"),
        Right: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_right(h), runtime, nodeId, null, "pi spigot term"),
        Hex: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_hex?.(h) ?? 0, runtime, nodeId, null, "pi spigot hex"),
        N: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_n?.(h) ?? 0, runtime, nodeId, null, "pi spigot n"),
        T: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_t?.(h) ?? 0, runtime, nodeId, null, "pi spigot t"),
        B3: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_b3?.(h) ?? 0, runtime, nodeId, null, "pi spigot b3"),
        B2: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_b2?.(h) ?? 0, runtime, nodeId, null, "pi spigot b2"),
        B1: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_b1?.(h) ?? 0, runtime, nodeId, null, "pi spigot b1"),
        B0: nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_b0?.(h) ?? 0, runtime, nodeId, null, "pi spigot b0"),
      };
    }
  }

  nodeGraphPiSpigotApplyStartStride(state, start, stride);
  const ports = nodeGraphPiSpigotPortsFromState(state, color, smoothing, level);
  return {
    Left: nodeGraphSafeFilterNumber(ports.Left ?? ports["Left Out"], runtime, nodeId, null, "pi spigot sum"),
    Right: nodeGraphSafeFilterNumber(ports.Right ?? ports["Right Out"], runtime, nodeId, null, "pi spigot term"),
    Hex: ports.Hex,
    N: ports.N,
    T: ports.T,
    B3: ports.B3,
    B2: ports.B2,
    B1: ports.B1,
    B0: ports.B0,
  };
}

nodeGraphLiveModuleEvaluators.piSpigotNoise = ({ runtime, node, nodeId, frame, frames, frameValues }) => {
  const state = runtime.piSpigotNoiseStates.get(nodeId) || createNodeGraphPiSpigotNoiseState();
  runtime.piSpigotNoiseStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphPiSpigotNoiseSample(
    state,
    {
      start: read("start", read("seedLeft", 0)),
      stride: read("stride", 1),
      color: read("color", 0),
      smoothing: read("smoothing", 0),
      level: read("amplitude", 1),
    },
    runtime,
    nodeId,
  );
};
