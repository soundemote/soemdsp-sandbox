// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphHelmholtzPitchView(frequencyHz) {
  if (!(frequencyHz > 0)) return -1;
  const minHz = 80;
  const octaves = 4;
  const clampedHz = Math.max(minHz, Math.min(minHz * Math.pow(2, octaves), frequencyHz));
  const norm = Math.log2(clampedHz / minHz) / octaves;
  return norm * 2 - 1;
}


function createNodeGraphHelmholtzState() {
  return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
}

function nodeGraphHelmholtzSample(state, input, params, inputConnected, sampleRate, runtime = null, nodeId = "") {
  const silent = { Frequency: 0, Fidelity: 0, "Pitch View": -1 };
  if (!inputConnected) {
    if (state.nativeHandle && runtime?.nativeHelmholtz?.soemdsp_helmholtz_destroy) {
      runtime.nativeHelmholtz.soemdsp_helmholtz_destroy(state.nativeHandle);
    }
    state.nativeHandle = 0;
    state.nativeSampleRate = 0;
    state.nativeParamKey = "";
    return silent;
  }
  const native = runtime?.nativeHelmholtzReady ? runtime?.nativeHelmholtz : null;
  if (!native?.soemdsp_helmholtz_create || !native?.soemdsp_helmholtz_process) return silent;
  try {
    const safeRate = Math.max(1, Math.round(Number(sampleRate) || 44100));
    if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
      if (state.nativeHandle && native.soemdsp_helmholtz_destroy) {
        native.soemdsp_helmholtz_destroy(state.nativeHandle);
      }
      state.nativeHandle = native.soemdsp_helmholtz_create(safeRate) || 0;
      state.nativeSampleRate = safeRate;
      state.nativeParamKey = "";
    }
    if (!state.nativeHandle) return silent;
    const windowSize = Math.max(128, Math.min(1024, Math.round(Number(params.windowSize) || 512)));
    const threshold = Math.max(0.5, Math.min(0.999, Number(params.threshold) || 0.93));
    const paramKey = `${windowSize}:${Math.round(threshold * 1000)}`;
    if (paramKey !== state.nativeParamKey && native.soemdsp_helmholtz_set_params) {
      state.nativeParamKey = paramKey;
      native.soemdsp_helmholtz_set_params(state.nativeHandle, safeRate, windowSize, threshold);
    }
    const safeIn = nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "pitch detector input");
    native.soemdsp_helmholtz_process(state.nativeHandle, safeIn);
    const frequency = nodeGraphSafeFilterNumber(native.soemdsp_helmholtz_frequency?.(state.nativeHandle), runtime, nodeId, null, "pitch detector frequency");
    return {
      Frequency: frequency,
      Fidelity: nodeGraphSafeFilterNumber(native.soemdsp_helmholtz_fidelity?.(state.nativeHandle), runtime, nodeId, null, "pitch detector fidelity"),
      "Pitch View": nodeGraphHelmholtzPitchView(frequency),
    };
  } catch {
    if (runtime) runtime.nativeHelmholtzReady = false;
    if (state.nativeHandle && native.soemdsp_helmholtz_destroy) native.soemdsp_helmholtz_destroy(state.nativeHandle);
    state.nativeHandle = 0;
    return silent;
  }
}


// Registers the offline/render-time dispatch handler for helmholtzPitch into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.helmholtzPitch = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.helmholtzStates?.get(nodeId) || createNodeGraphHelmholtzState();
  if (runtime.helmholtzStates) runtime.helmholtzStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphHelmholtzSample(
    state,
    mixInput(nodeId, "In"),
    {
      windowSize: read("windowSize", 512),
      threshold: read("threshold", 0.93),
    },
    hasInput(nodeId, "In"),
    sampleRate,
    runtime,
    nodeId,
  );
};
