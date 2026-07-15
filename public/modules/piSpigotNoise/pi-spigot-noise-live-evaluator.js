// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

// Unlike node-live-audio-worklet-core.js, this evaluator runs on the main
// thread (module groups / offline render), which does have fetch -- so
// rather than duplicate the 333,333-sample pi-digit dataset in JS, it
// just loads the same pi_spigot_noise.wasm the worklet uses and calls
// its exports directly. See pi_spigot_noise.cpp for what that dataset is
// and why it replaced computing every sample live.
const nodeGraphPiSpigotNoiseWasm = { promise: null, exports: null, failed: false };

function applyNodeGraphPiSpigotSmoothing(channel, x, smoothing) {
  const safeSmoothing = clampNodeSliderValue(Number(smoothing) || 0, 0, 1);
  if (safeSmoothing <= 0) return x;
  const lnSmoothMinG = -3.912023005428146; // ln(0.02)
  const g = Math.exp(safeSmoothing * lnSmoothMinG);
  let y = x;
  for (let i = 0; i < 4; i++) {
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
    const out = (state.pink[0] + state.pink[1] + state.pink[2] +
      state.pink[3] + state.pink[4] + state.pink[5] + state.pink[6] + white * 0.5362) * 0.11;
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
  let result = 1;
  let base = a % m;
  while (b > 0.5) {
    if (b % 2 >= 1) {
      result = (result * base) % m;
    }
    b = Math.floor(b / 2);
    base = (base * base) % m;
  }
  return result;
}
function nodeGraphPiSpigotSeries(m, n) {
  let s = 0;
  for (let k = 0; k <= n; k++) {
    const ak = 8 * k + m;
    const t = nodeGraphPiSpigotPowMod(16, n - k, ak);
    s += t / ak;
    s -= Math.floor(s);
  }
  for (let k = n + 1; k < n + 100; k++) {
    const ak = 8 * k + m;
    const t = Math.pow(16, n - k);
    if (t < 1e-17) break;
    s += t / ak;
  }
  const frac = s - Math.floor(s);
  return frac < 0 ? frac + 1 : frac;
}
function nodeGraphPiSpigotBipolar(n) {
  let x = 4 * nodeGraphPiSpigotSeries(1, n) - 2 * nodeGraphPiSpigotSeries(4, n)
    - nodeGraphPiSpigotSeries(5, n) - nodeGraphPiSpigotSeries(6, n);
  x -= Math.floor(x);
  if (x < 0) x += 1;
  return x * 2 - 1;
}
function fillNodeGraphPiSpigotNoiseCacheFallback(state, start) {
  const cacheSize = 1024;
  const maxStart = 256;
  const safeStart = clampNodeSliderValue(Math.floor(Number(start) || 0), 0, maxStart);
  const cache = new Float64Array(cacheSize);
  for (let i = 0; i < cacheSize; i++) {
    cache[i] = nodeGraphPiSpigotBipolar(safeStart + i);
  }
  state.cache = cache;
  state.readIndex = 0;
  state.cacheStart = safeStart;
}


function createNodeGraphPiSpigotNoiseChannelState() {
  return {
    cache: null,
    readIndex: 0,
    cacheStart: null,
    pink: [0, 0, 0, 0, 0, 0, 0],
    brown: 0,
    prevWhite1: 0,
    prevWhite2: 0,
    smoothLp: [0, 0, 0, 0],
  };
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

function nodeGraphPiSpigotNoiseChannelSampleFallback(channel, seedFraction, color, smoothing, level) {
  // Fallback range is the small BBP-computed cache, not the full
  // 1-second buffer the wasm path reads from -- the normalized seed
  // still spreads across it.
  const fallbackStart = clampNodeSliderValue(Math.round(seedFraction * 256), 0, 256);
  if (!channel.cache || channel.cacheStart !== fallbackStart) {
    fillNodeGraphPiSpigotNoiseCacheFallback(channel, fallbackStart);
    resetNodeGraphPiSpigotColorFilters(channel);
  }
  const white = channel.cache[channel.readIndex];
  channel.readIndex = (channel.readIndex + 1) % channel.cache.length;
  const colored = applyNodeGraphPiSpigotColor(channel, white, color);
  return applyNodeGraphPiSpigotSmoothing(channel, colored, smoothing);
}


function createNodeGraphPiSpigotNoiseState() {
  return {
    left: createNodeGraphPiSpigotNoiseChannelState(),
    right: createNodeGraphPiSpigotNoiseChannelState(),
    wasmHandle: 0,
    wasmSeedLeft: null,
    wasmSeedRight: null,
  };
}

function nodeGraphPiSpigotNoiseSample(state, params, runtime = null, nodeId = "") {
  const seedLeft = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.seedLeft, runtime, nodeId, null, "pi spigot noise seed L"), 0, 1);
  const seedRight = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.seedRight, runtime, nodeId, null, "pi spigot noise seed R"), 0, 1);
  const color = clampNodeSliderValue(Math.round(nodeGraphSafeFilterNumber(params.color, runtime, nodeId, null, "pi spigot noise color")), 0, 4);
  const smoothing = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.smoothing, runtime, nodeId, null, "pi spigot noise smoothing"), 0, 1);
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "pi spigot noise level");

  nodeGraphPiSpigotNoiseLoadWasm();
  const wasm = nodeGraphPiSpigotNoiseWasm.exports;
  if (wasm?.soemdsp_pi_spigot_noise_create && wasm?.soemdsp_pi_spigot_noise_sample) {
    if (!state.wasmHandle) {
      state.wasmHandle = wasm.soemdsp_pi_spigot_noise_create();
    }
    if (state.wasmHandle) {
      if (state.wasmSeedLeft !== seedLeft || state.wasmSeedRight !== seedRight) {
        state.wasmSeedLeft = seedLeft;
        state.wasmSeedRight = seedRight;
        wasm.soemdsp_pi_spigot_noise_reset_seed(state.wasmHandle, seedLeft, seedRight);
      }
      wasm.soemdsp_pi_spigot_noise_sample(state.wasmHandle, color, smoothing, level);
      return {
        "Left Out": nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_left(state.wasmHandle), runtime, nodeId, null, "pi spigot noise left"),
        "Right Out": nodeGraphSafeFilterNumber(wasm.soemdsp_pi_spigot_noise_right(state.wasmHandle), runtime, nodeId, null, "pi spigot noise right"),
      };
    }
  }

  return {
    "Left Out": nodeGraphSafeFilterNumber(
      nodeGraphPiSpigotNoiseChannelSampleFallback(state.left, seedLeft, color, smoothing, level) * level,
      runtime, nodeId, null, "pi spigot noise left",
    ),
    "Right Out": nodeGraphSafeFilterNumber(
      nodeGraphPiSpigotNoiseChannelSampleFallback(state.right, seedRight, color, smoothing, level) * level,
      runtime, nodeId, null, "pi spigot noise right",
    ),
  };
}


// Registers the offline/render-time dispatch handler for piSpigotNoise into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.piSpigotNoise = ({ runtime, node, nodeId, frame, frames, frameValues }) => {
  const state = runtime.piSpigotNoiseStates.get(nodeId) || createNodeGraphPiSpigotNoiseState();
  runtime.piSpigotNoiseStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphPiSpigotNoiseSample(
    state,
    {
      seedLeft: read("seedLeft", 0),
      seedRight: read("seedRight", 0.5),
      color: read("color", 0),
      smoothing: read("smoothing", 0),
      level: read("level", 1),
    },
    runtime,
    nodeId,
  );
};
