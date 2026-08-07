// STFT Blur — offline/render.

nodeGraphLiveModuleEvaluators.stftBlur = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  if (!runtime.stftBlurStates) runtime.stftBlurStates = new Map();
  let state = runtime.stftBlurStates.get(nodeId);
  const fftSize = readNodeGraphLiveEffectiveParam(runtime, node, "fftSize", 2048, frame, frames, frameValues);
  if (!state || state.n !== nodeGraphStftBlurSnapFftSize(fftSize)) {
    state = createNodeGraphStftBlurState(fftSize);
    runtime.stftBlurStates.set(nodeId, state);
  }

  const blurTime = readNodeGraphLiveEffectiveParam(runtime, node, "blurTime", 0.5, frame, frames, frameValues);
  const blurFreq = readNodeGraphLiveEffectiveParam(runtime, node, "blurFreq", 0, frame, frames, frameValues);
  const mix = readNodeGraphLiveEffectiveParam(runtime, node, "mix", 1, frame, frames, frameValues);
  const x = Number(mixInput(nodeId)) || 0;
  const y = nodeGraphStftBlurSample(state, x, blurTime, blurFreq, fftSize, mix);
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "stft blur")
    : y;
};
