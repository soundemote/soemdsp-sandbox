// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphPllState() {
  return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
}

function nodeGraphPllSample(state, signalIn, cvIn, cvConnected, params, sampleRate, runtime = null, nodeId = "") {
  const silent = { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
  const native = runtime?.nativePllReady ? runtime?.nativePll : null;
  if (!native?.soemdsp_pll_create || !native?.soemdsp_pll_process) return silent;
  try {
    const safeRate = Math.max(1, Math.round(Number(sampleRate) || 44100));
    if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
      if (state.nativeHandle && native.soemdsp_pll_destroy) {
        native.soemdsp_pll_destroy(state.nativeHandle);
      }
      state.nativeHandle = native.soemdsp_pll_create(safeRate) || 0;
      state.nativeSampleRate = safeRate;
      state.nativeParamKey = "";
    }
    if (!state.nativeHandle) return silent;
    const range  = Math.max(0, Math.min(2, Math.round(Number(params.range)  || 1)));
    const offset = Math.max(0, Math.min(10, Number(params.offset) || 5));
    const type   = Math.max(0, Math.min(2, Math.round(Number(params.type)   || 1)));
    const frequ  = Math.max(0.1, Number(params.frequ) || 10);
    const paramKey = `${range}:${Math.round(offset * 1000)}:${type}:${Math.round(frequ * 1000)}`;
    if (paramKey !== state.nativeParamKey && native.soemdsp_pll_set_params) {
      state.nativeParamKey = paramKey;
      native.soemdsp_pll_set_params(state.nativeHandle, safeRate, range, offset, type, frequ);
    }
    const safeSig = nodeGraphSafeFilterNumber(signalIn, runtime, nodeId, null, "PLL signal in");
    const safeCv  = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(cvIn, runtime, nodeId, null, "PLL cv in")));
    native.soemdsp_pll_process(state.nativeHandle, safeSig, safeCv, cvConnected);
    return {
      "VCO Out": nodeGraphSafeFilterNumber(native.soemdsp_pll_vco_out?.(state.nativeHandle), runtime, nodeId, null, "PLL vco out"),
      "PC Out":  nodeGraphSafeFilterNumber(native.soemdsp_pll_pc_out?.(state.nativeHandle),  runtime, nodeId, null, "PLL pc out"),
      "LPF Out": nodeGraphSafeFilterNumber(native.soemdsp_pll_lpf_out?.(state.nativeHandle), runtime, nodeId, null, "PLL lpf out"),
      Locked:    nodeGraphSafeFilterNumber(native.soemdsp_pll_locked?.(state.nativeHandle),   runtime, nodeId, null, "PLL locked"),
    };
  } catch {
    if (runtime) runtime.nativePllReady = false;
    if (state.nativeHandle && native.soemdsp_pll_destroy) native.soemdsp_pll_destroy(state.nativeHandle);
    state.nativeHandle = 0;
    return silent;
  }
}


// Registers the offline/render-time dispatch handler for pll into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.pll = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.pllStates?.get(nodeId) || createNodeGraphPllState();
  if (runtime.pllStates) runtime.pllStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const cvConnected = hasInput(nodeId, "VCO CV In") ? 1 : 0;
  return nodeGraphPllSample(
    state,
    mixInput(nodeId, "Signal In"),
    mixInput(nodeId, "VCO CV In"),
    cvConnected,
    {
      range:  read("range",  1),
      offset: read("offset", 5),
      type:   read("type",   1),
      frequ:  read("frequ",  10),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
