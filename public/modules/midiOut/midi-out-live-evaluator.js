// MIDI Out — Full Value + Normalized (Plugin MIDI Out adds Gate via same helper).
nodeGraphLiveModuleEvaluators.midiOut = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const midiInputKey = `${nodeId}.MIDI Number`;
  const hasMidiInput = runtime.inputConnections.has(midiInputKey);
  const midiNumber = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "midiNumber",
    60,
    frame,
    frames,
    frameValues,
  );
  const resolved = nodeGraphDspResolveMidiNumber(
    midiNumber,
    mixInput(nodeId, "MIDI Number"),
    hasMidiInput,
  );
  return nodeGraphDspMidiNumberPorts(resolved);
};
