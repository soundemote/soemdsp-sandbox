// Registers the offline/render-time dispatch handler for bitConverter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Converts a raw full-scale double (e.g. keyboardController's Held Keys
// bitmask) to/from normalized 0..1 (unipolar) and -1..1 (bipolar) CV,
// using 2^bits - 1 as the full-scale ceiling.
nodeGraphLiveModuleEvaluators.bitConverter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const bits = Math.max(1, Math.min(53, Math.round(
    readNodeGraphLiveEffectiveParam(runtime, node, "bits", 53, frame, frames, frameValues),
  )));
  const maxValue = 2 ** bits - 1;
  const fullScale = Math.max(0, Math.min(maxValue, Number(mixInput(nodeId, "Full Scale")) || 0));
  const unipolar = Math.max(0, Math.min(1, Number(mixInput(nodeId, "Unipolar")) || 0));
  const bipolar = Math.max(-1, Math.min(1, Number(mixInput(nodeId, "Bipolar")) || 0));
  return {
    "Full Scale to Unipolar": maxValue > 0 ? fullScale / maxValue : 0,
    "Full Scale to Bipolar": maxValue > 0 ? (fullScale / maxValue) * 2 - 1 : -1,
    "Unipolar to Full Scale": Math.round(unipolar * maxValue),
    "Bipolar to Full Scale": Math.round(((bipolar + 1) / 2) * maxValue),
  };
};
