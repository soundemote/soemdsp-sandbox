// Offline/render-time Chord Pad — Scale / Root / Gate from key, mode, degree
// (Select jack overrides degree when connected).

nodeGraphLiveModuleEvaluators.chordPad = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
}) => {
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const hasSelect = typeof hasInput === "function" && hasInput(nodeId, "Select");
  return nodeGraphChordPadSample(null, {
    key: read("key", 0),
    mode: read("mode", 0),
    degree: read("degree", 0),
    level: read("level", 1),
    hasSelectInput: hasSelect,
    select: mixInput(nodeId, "Select"),
  });
};
