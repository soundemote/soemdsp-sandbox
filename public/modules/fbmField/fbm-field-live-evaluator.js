// Offline / render-time dispatch for fbmField.
// Prefer pure JS (parity with offline); native offline glue optional.
nodeGraphLiveModuleEvaluators.fbmField = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.fbmFieldStates) {
    runtime.fbmFieldStates = new Map();
  }
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const opts = {
    contrast: read("contrast", 1),
    frequency: read("frequency", 0.5),
    lacunarity: read("lacunarity", 2),
    level: read("level", 1),
    octaves: read("octaves", 4),
    panX: read("panX", 0),
    panY: read("panY", 0),
    persistence: read("persistence", 0.5),
    rotate: read("rotate", 0),
    scale: read("scale", 1),
    seed: read("seed", 1),
    smoothness: read("smoothness", 0.55),
    speed: read("speed", 0.15),
    zoom: read("zoom", 1),
    reset: mixInput(nodeId, "Reset"),
    sampleRate,
  };

  // Prefer pure math (matches face character; always available offline).
  // Native worklet path is the realtime hot path.
  if (typeof nodeGraphFbmFieldVector === "function" && typeof createNodeGraphFbmFieldState === "function") {
    let state = runtime.fbmFieldStates.get(nodeId);
    if (!state || state.nativeHandle) {
      // Don't reuse native-only state objects for JS time base.
      state = createNodeGraphFbmFieldState();
      runtime.fbmFieldStates.set(nodeId, state);
    }
    return nodeGraphFbmFieldVector(state, opts, sampleRate, opts.reset);
  }

  if (typeof nodeGraphFbmFieldNativeSample === "function") {
    if (!runtime.fbmFieldNativeStates) {
      runtime.fbmFieldNativeStates = new Map();
    }
    let nativeState = runtime.fbmFieldNativeStates.get(nodeId);
    if (!nativeState) {
      nativeState = createNodeGraphFbmFieldNativeState();
      runtime.fbmFieldNativeStates.set(nodeId, nativeState);
    }
    const nativeOut = nodeGraphFbmFieldNativeSample({ ...opts, state: nativeState });
    if (nativeOut) {
      return nativeOut;
    }
  }

  return { X: 0, Y: 0, "X Raw": 0, "Y Raw": 0 };
};
