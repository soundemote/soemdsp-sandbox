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

function nodeGraphPluginControlSmoothedOut(runtime, node, frame, frames, frameValues) {
  if (typeof nodeGraphDspApplyControllerLiveSmoothing === "function") {
    nodeGraphDspApplyControllerLiveSmoothing(node);
  }
  const unit = nodeGraphPluginReadParam(runtime, node, "value", 0, frame, frames, frameValues);
  const rangeMin = nodeGraphPluginReadParam(runtime, node, "rangeMin", 0, frame, frames, frameValues);
  const rangeMax = nodeGraphPluginReadParam(runtime, node, "rangeMax", 1, frame, frames, frameValues);
  const out = typeof nodeGraphDspControllerUnitToRange === "function"
    ? nodeGraphDspControllerUnitToRange(unit, rangeMin, rangeMax)
    : unit;
  return { Out: out, value: out };
}

nodeGraphLiveModuleEvaluators.toggleButton = ({
  runtime,
  node,
  frame,
  frames,
  frameValues,
}) => nodeGraphPluginControlSmoothedOut(runtime, node, frame, frames, frameValues);

nodeGraphLiveModuleEvaluators.momentaryButton = ({
  runtime,
  node,
  frame,
  frames,
  frameValues,
}) => nodeGraphPluginControlSmoothedOut(runtime, node, frame, frames, frameValues);

// Same bus math as audioInput / output (shared helpers).
nodeGraphLiveModuleEvaluators.pluginInput = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput,
}) => {
  const amplitude = nodeGraphPluginReadParam(runtime, node, "amplitude", NaN, frame, frames, frameValues);
  const level = Number.isFinite(amplitude)
    ? amplitude
    : nodeGraphPluginReadParam(runtime, node, "level", 1, frame, frames, frameValues);
  const live = nodeGraphDspExternalStereoFrame(
    runtime.externalInput,
    frame,
    level,
  );
  if (typeof nodeGraphDspSandboxIoFrame === "function") {
    return nodeGraphDspSandboxIoFrame(
      live,
      mixInput(nodeId, "Mono"),
      mixInput(nodeId, "Left"),
      mixInput(nodeId, "Right"),
    );
  }
  return live;
};

nodeGraphLiveModuleEvaluators.pluginOutput = ({ nodeId, mixInput }) => {
  const mix = nodeGraphDspStereoMix(
    mixInput(nodeId, "Mono"),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
  );
  return typeof nodeGraphDspSandboxIoTrio === "function"
    ? nodeGraphDspSandboxIoTrio(mix)
    : { Left: mix.Left, Mono: mix.Out, Out: mix.Out, Right: mix.Right };
};

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
