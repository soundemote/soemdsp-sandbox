// Plugin shelf live/offline evaluators — thin wrappers over control-bus helpers.
// Knob (knob) lives in knob-live-evaluator.js (same helpers).
// pluginInput / pluginOutput / pluginMidiIn / pluginMidiOut destroyed.

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
