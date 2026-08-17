// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function applySabrinaDspBindingIfDirty(native, state, params, runtime, nodeId) {
  const safeParams = {
    delaySize: Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.delaySize, runtime, nodeId, null, "Sabrina delay size"))),
    diffusionAmount: Math.max(0, Math.min(0.98, nodeGraphSafeFilterNumber(params.diffusionAmount, runtime, nodeId, null, "Sabrina diffusion amount"))),
    diffusionSize: Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.diffusionSize, runtime, nodeId, null, "Sabrina diffusion size"))),
    lfoAmplitude: Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.lfoAmplitude, runtime, nodeId, null, "Sabrina lfo amplitude"))),
    lfoBaseSpeed: Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.lfoBaseSpeed, runtime, nodeId, null, "Sabrina lfo speed"))),
    lfoVariation: Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.lfoVariation, runtime, nodeId, null, "Sabrina lfo variation"))),
    mix: Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.mix, runtime, nodeId, null, "Sabrina mix"))),
    recycle: Math.max(0, Math.min(0.98, nodeGraphSafeFilterNumber(params.recycle, runtime, nodeId, null, "Sabrina recycle"))),
    seed: Math.max(0, Math.min(99999, Math.round(nodeGraphSafeFilterNumber(params.seed, runtime, nodeId, null, "Sabrina seed")))),
  };
  const paramKey = [
    safeParams.mix,
    safeParams.diffusionSize,
    safeParams.diffusionAmount,
    safeParams.delaySize,
    safeParams.recycle,
    safeParams.lfoAmplitude,
    safeParams.lfoBaseSpeed,
    safeParams.lfoVariation,
  ].map((value) => Math.round(value * 1000000)).join(":") + `:${safeParams.seed}`;
  if (!native.soemdsp_sabrina_reverb_set_params) {
    return;
  }
  if (paramKey === state.nativeParamKey) {
    return;
  }
  state.nativeParamKey = paramKey;
  native.soemdsp_sabrina_reverb_set_params(
    state.nativeHandle,
    safeParams.mix,
    safeParams.diffusionSize,
    safeParams.diffusionAmount,
    safeParams.delaySize,
    safeParams.recycle,
    safeParams.lfoAmplitude,
    safeParams.lfoBaseSpeed,
    safeParams.lfoVariation,
    safeParams.seed,
  );
}


function createNodeGraphSabrinaReverbState() {
  return {
    nativeHandle: 0,
    nativeParamKey: "",
    nativeSampleRate: 0,
  };
}

function nodeGraphSabrinaReverbSample(state, leftInput, rightInput, params, sampleRate, runtime = null, nodeId = "") {
  const dryLeft = nodeGraphSafeFilterNumber(leftInput, runtime, nodeId, null, "Sabrina left input");
  const dryRight = nodeGraphSafeFilterNumber(rightInput, runtime, nodeId, null, "Sabrina right input");
  // Dry = pure input; Mix = dry/wet blend (no wet-only outs).
  const dry = { "Dry L": dryLeft, "Dry R": dryRight, "Mix L": dryLeft, "Mix R": dryRight };
  const native = runtime?.nativeSabrinaReverbReady ? runtime?.nativeSabrinaReverb : null;
  if (!native?.soemdsp_sabrina_reverb_create || !native?.soemdsp_sabrina_reverb_process) {
    return dry;
  }
  try {
    const safeRate = Math.max(1, Math.round(Number(sampleRate) || 44100));
    if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
      if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
        native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
      }
      state.nativeHandle = native.soemdsp_sabrina_reverb_create(safeRate) || 0;
      state.nativeSampleRate = safeRate;
      state.nativeParamKey = "";
    }
    if (!state.nativeHandle) {
      return dry;
    }
    applySabrinaDspBindingIfDirty(native, state, params, runtime, nodeId);
    native.soemdsp_sabrina_reverb_process(state.nativeHandle, dryLeft, dryRight);
    const mixLeft = nodeGraphSafeFilterNumber(native.soemdsp_sabrina_reverb_left?.(state.nativeHandle), runtime, nodeId, null, "Sabrina mix left");
    const mixRight = nodeGraphSafeFilterNumber(native.soemdsp_sabrina_reverb_right?.(state.nativeHandle), runtime, nodeId, null, "Sabrina mix right");
    return { "Dry L": dryLeft, "Dry R": dryRight, "Mix L": mixLeft, "Mix R": mixRight };
  } catch (error) {
    if (runtime) {
      runtime.nativeSabrinaReverbReady = false;
    }
    if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
      native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
    }
    state.nativeHandle = 0;
    state.nativeParamKey = "";
    return dry;
  }
}


// Registers the offline/render-time dispatch handler for reverbEffect into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.reverbEffect = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.reverbEffectStates.get(nodeId) || createNodeGraphSabrinaReverbState();
  runtime.reverbEffectStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  // Match worklet: mono In feeds both channels; Left/Right are true stereo.
  const monoInput = mixInput(nodeId, "In");
  const leftInput = mixInput(nodeId, "Left") + monoInput;
  const rightInput = (hasInput(nodeId, "Right") ? mixInput(nodeId, "Right") : mixInput(nodeId, "Left")) + monoInput;
  return nodeGraphSabrinaReverbSample(
    state,
    leftInput,
    rightInput,
    {
      delaySize: read("delaySize", 0.02),
      diffusionAmount: read("diffusionAmount", 0.70),
      diffusionSize: read("diffusionSize", 0.35),
      lfoAmplitude: read("lfoAmplitude", 0.07),
      lfoBaseSpeed: read("lfoBaseSpeed", 0.83),
      lfoVariation: read("lfoVariation", 0.001),
      mix: read("mix", 0.43),
      recycle: read("recycle", 0.70),
      seed: read("seed", 0),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
