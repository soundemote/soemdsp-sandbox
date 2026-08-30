// Offline/render host for SoEmReverb — same soem_reverb.wasm as worklet.
// Echo base: free seconds OR one tempo-synced time for both echo L/R
// (ping-pong style: 240/BPM × X/Y × Normal|Dotted|Triplet + offset).

const nodeGraphSoemReverbWasm = { promise: null, exports: null, failed: false };

function nodeGraphSoemReverbLoadWasm() {
  if (nodeGraphSoemReverbWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphSoemReverbWasm.promise = fetch("/native_modules/soem_reverb/soem_reverb.wasm")
    .then((r) => {
      if (!r.ok) throw new Error(`soem_reverb wasm HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphSoemReverbWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphSoemReverbWasm.failed = true;
    });
}

function createNodeGraphSoemReverbState() {
  return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
}

function nodeGraphSoemReverbTimingModeMultiplier(mode) {
  const rounded = Math.round(Number(mode) || 0);
  if (rounded === 1) return 1.5; // Dotted
  if (rounded === 2) return 2 / 3; // Triplet
  return 1;
}

function nodeGraphSoemReverbNoteFraction(numerator, denominator) {
  const num = Math.max(0, Number(numerator) || 0);
  if (num === 0) return 0;
  const den = Math.max(0, Number(denominator) || 0);
  return num / Math.max(1, den);
}

/** One echo base in seconds for both echo L/R. */
function nodeGraphSoemReverbEchoSeconds(params, runtime) {
  const offsetSeconds = (Number(params.offsetMs) || 0) / 1000;
  const freeSeconds = Math.max(0.0001, nodeGraphFiniteNumber(params.echoTime, 0.35));
  if (Math.round(Number(params.echoTempoSync) || 0) === 0) {
    return freeSeconds + offsetSeconds;
  }
  const timing = typeof normalizeNodeGraphPatchTiming === "function"
    ? normalizeNodeGraphPatchTiming(runtime?.timing)
    : { tempoBpm: 120 };
  const bpm = Math.max(1, Number(timing.tempoBpm) || 120);
  // Whole-note seconds at this BPM (4 quarter notes per whole × 60/bpm).
  const secondsPerWholeNote = 240 / bpm;
  const fraction = nodeGraphSoemReverbNoteFraction(params.timeNumerator, params.timeDenominator);
  const synced = secondsPerWholeNote * fraction * nodeGraphSoemReverbTimingModeMultiplier(params.timingMode);
  const raw = synced + offsetSeconds;
  return Number.isFinite(raw) ? Math.max(0.0001, raw) : freeSeconds;
}

function applySoemReverbParams(wasm, state, p) {
  const key = [
    p.mix, p.volume, p.echoTime, p.recycle, p.numDelays, p.diffusionSize,
    p.diffusionAmount, p.seed, p.lfoAmp, p.lfoFrequency, p.lfoVariation, p.lfoStyle,
    p.echoMode, p.pingPong, p.doModulateEcho, p.saturate, p.lpfFrequency, p.hpfFrequency,
    p.bandFrequency, p.bandDecibels, p.bandQ, p.lpfStages, p.bandStages,
    p.duckLimit, p.duckRelease,
  ].map((v) => Math.round(Number(v) * 1e6)).join(":");
  if (key === state.nativeParamKey) return;
  state.nativeParamKey = key;
  wasm.soemdsp_soem_reverb_set_params(
    state.nativeHandle,
    p.mix, p.volume, p.echoTime, p.recycle, p.numDelays, p.diffusionSize,
    p.diffusionAmount, p.seed, p.lfoAmp, p.lfoFrequency, p.lfoVariation, p.lfoStyle,
    p.echoMode, p.pingPong, p.doModulateEcho, p.saturate, p.lpfFrequency, p.hpfFrequency,
    p.bandFrequency, p.bandDecibels, p.bandQ, p.lpfStages, p.bandStages,
    p.duckLimit, p.duckRelease,
  );
}

function nodeGraphSoemReverbSample(state, left, right, params, sampleRate, runtime = null) {
  nodeGraphSoemReverbLoadWasm();
  const wasm = nodeGraphSoemReverbWasm.exports;
  const inL = Number(left) || 0;
  const inR = Number(right) || 0;
  // Dry = pure input; Mix = full dry/wet blend (native left/right). No wet-only.
  const silent = {
    "Dry L": inL,
    "Dry R": inR,
    "Mix L": inL,
    "Mix R": inR,
  };
  if (!wasm?.soemdsp_soem_reverb_create || !wasm?.soemdsp_soem_reverb_process) {
    return silent;
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  if (!state.nativeHandle || state.nativeSampleRate !== rate) {
    if (state.nativeHandle) wasm.soemdsp_soem_reverb_destroy?.(state.nativeHandle);
    state.nativeHandle = wasm.soemdsp_soem_reverb_create(rate) || 0;
    state.nativeSampleRate = rate;
    state.nativeParamKey = "";
  }
  if (!state.nativeHandle) {
    return silent;
  }
  // Host resolves free vs tempo sync → one echoTime seconds for native (both L/R).
  const echoSeconds = nodeGraphSoemReverbEchoSeconds(params, runtime);
  const nativeParams = { ...params, echoTime: echoSeconds };
  applySoemReverbParams(wasm, state, nativeParams);
  wasm.soemdsp_soem_reverb_process(state.nativeHandle, inL, inR);
  const mixL = Number(wasm.soemdsp_soem_reverb_left(state.nativeHandle));
  const mixR = Number(wasm.soemdsp_soem_reverb_right(state.nativeHandle));
  return {
    "Dry L": inL,
    "Dry R": inR,
    "Mix L": Number.isFinite(mixL) ? mixL : inL,
    "Mix R": Number.isFinite(mixR) ? mixR : inR,
  };
}

nodeGraphLiveModuleEvaluators.soemReverb = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.soemReverbStates.get(nodeId) || createNodeGraphSoemReverbState();
  runtime.soemReverbStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  let left = 0;
  let right = 0;
  if (hasInput(nodeId, "Left") || hasInput(nodeId, "Right")) {
    left = nodeGraphSafeFilterNumber(mixInput(nodeId, "Left"), runtime, nodeId, 0, "soem reverb L");
    right = nodeGraphSafeFilterNumber(mixInput(nodeId, "Right"), runtime, nodeId, 0, "soem reverb R");
  } else if (hasInput(nodeId, "Mono")) {
    const m = nodeGraphSafeFilterNumber(mixInput(nodeId, "Mono"), runtime, nodeId, 0, "soem reverb M");
    left = right = m;
  }
  return nodeGraphSoemReverbSample(state, left, right, {
    mix: read("mix", 0.43),
    volume: read("volume", 1),
    echoTempoSync: read("echoTempoSync", 0),
    echoTime: read("echoTime", 0.35),
    timeNumerator: read("timeNumerator", 1),
    timeDenominator: read("timeDenominator", 4),
    timingMode: read("timingMode", 0),
    offsetMs: read("offsetMs", 0),
    recycle: read("recycle", 0.5),
    numDelays: read("numDelays", 10),
    diffusionSize: read("diffusionSize", 0.35),
    diffusionAmount: read("diffusionAmount", 0.7),
    seed: read("seed", 500),
    lfoAmp: read("lfoAmp", 0.002),
    lfoFrequency: read("lfoFrequency", 0.5),
    lfoVariation: read("lfoVariation", 1),
    lfoStyle: read("lfoStyle", 0),
    echoMode: read("echoMode", 0),
    pingPong: read("pingPong", 0),
    doModulateEcho: read("doModulateEcho", 1),
    saturate: read("saturate", 1),
    lpfFrequency: read("lpfFrequency", 8000),
    hpfFrequency: read("hpfFrequency", 20),
    bandFrequency: read("bandFrequency", 1000),
    bandDecibels: read("bandDecibels", 0),
    bandQ: read("bandQ", 1),
    lpfStages: read("lpfStages", 2),
    bandStages: read("bandStages", 2),
    duckLimit: read("duckLimit", 1),
    duckRelease: read("duckRelease", 0.04),
  }, sampleRate, runtime);
};
