// Offline/render-time dispatch for MixStereo2/4. Math: mix-stereo-math.js.

nodeGraphLiveModuleEvaluators.mixStereo4 = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  return nodeGraphMixStereoFrame(
    {
      L1: mixInput(nodeId, "L1"),
      R1: mixInput(nodeId, "R1"),
      L2: mixInput(nodeId, "L2"),
      R2: mixInput(nodeId, "R2"),
      L3: mixInput(nodeId, "L3"),
      R3: mixInput(nodeId, "R3"),
      L4: mixInput(nodeId, "L4"),
      R4: mixInput(nodeId, "R4"),
    },
    {
      volume1: read("volume1", 0),
      pan1: read("pan1", 0),
      volume2: read("volume2", 0),
      pan2: read("pan2", 0),
      volume3: read("volume3", 0),
      pan3: read("pan3", 0),
      volume4: read("volume4", 0),
      pan4: read("pan4", 0),
      amplitude: read("amplitude", 0),
    },
  );
};

nodeGraphLiveModuleEvaluators.mixStereo2 = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  return nodeGraphMixStereoFrame(
    {
      L1: mixInput(nodeId, "L1"),
      R1: mixInput(nodeId, "R1"),
      L2: mixInput(nodeId, "L2"),
      R2: mixInput(nodeId, "R2"),
    },
    {
      volume1: read("volume1", 0),
      pan1: read("pan1", 0),
      volume2: read("volume2", 0),
      pan2: read("pan2", 0),
      volume3: -140,
      pan3: 0,
      volume4: -140,
      pan4: 0,
      amplitude: read("amplitude", 0),
    },
  );
};

// Legacy type id → MixStereo4.
nodeGraphLiveModuleEvaluators.mixStereo = nodeGraphLiveModuleEvaluators.mixStereo4;
