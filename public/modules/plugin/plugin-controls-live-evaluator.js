// Plugin shelf live/offline evaluators — thin wrappers over control-bus helpers.
// Knob (knob) lives in knob-live-evaluator.js (same helpers).

function nodeGraphPluginReadParam(runtime, node, key, fallback, frame, frames, frameValues) {
  if (typeof readNodeGraphLiveEffectiveParam === "function") {
    return readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  }
  const raw = Number(node?.params?.[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

nodeGraphLiveModuleEvaluators.pluginSlider = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const offset = nodeGraphPluginReadParam(runtime, node, "value", 0, frame, frames, frameValues);
  return nodeGraphDspBiasFromIn(offset, mixInput?.(nodeId, "In"));
};

nodeGraphLiveModuleEvaluators.toggleButton = ({
  runtime,
  node,
  frame,
  frames,
  frameValues,
}) => nodeGraphDspBinaryOut(
  nodeGraphPluginReadParam(runtime, node, "value", 0, frame, frames, frameValues),
);

nodeGraphLiveModuleEvaluators.momentaryButton = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
}) => {
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.pluginMomentary?.[nodeId] > 0.5) {
    return nodeGraphDspBinaryOut(1);
  }
  return nodeGraphDspBinaryOut(
    nodeGraphPluginReadParam(runtime, node, "value", 0, frame, frames, frameValues),
  );
};

// Same bus math as audioInput / output (shared helpers).
nodeGraphLiveModuleEvaluators.pluginInput = ({ runtime, node, frame, frames, frameValues }) =>
  nodeGraphDspExternalStereoFrame(
    runtime.externalInput,
    frame,
    nodeGraphPluginReadParam(runtime, node, "level", 1, frame, frames, frameValues),
  );

nodeGraphLiveModuleEvaluators.pluginOutput = ({ nodeId, mixInput }) =>
  nodeGraphDspStereoMix(
    mixInput(nodeId, "Mono"),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
  );

nodeGraphLiveModuleEvaluators.pluginMidiIn = ({
  runtime,
  node,
  frame,
  frames,
  frameValues,
}) => {
  const signal = (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.live?.midiKeyboardSignal)
    || runtime?.midiKeyboardSignal
    || {};
  const defaultNote = nodeGraphPluginReadParam(runtime, node, "defaultNote", 60, frame, frames, frameValues);
  return nodeGraphDspMidiKeyboardPorts(signal, defaultNote);
};

nodeGraphLiveModuleEvaluators.pluginMidiOut = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
}) => {
  const midiKnob = nodeGraphPluginReadParam(runtime, node, "midiNumber", 60, frame, frames, frameValues);
  const hasMidi = hasInput?.(nodeId, "MIDI Number")
    || runtime?.inputConnections?.has?.(`${nodeId}.MIDI Number`);
  const midi = nodeGraphDspResolveMidiNumber(midiKnob, mixInput?.(nodeId, "MIDI Number"), hasMidi);
  const hasGate = hasInput?.(nodeId, "Gate")
    || runtime?.inputConnections?.has?.(`${nodeId}.Gate`);
  return nodeGraphDspMidiNumberPorts(midi, {
    includeGate: true,
    hasGate,
    gate: mixInput?.(nodeId, "Gate"),
  });
};
