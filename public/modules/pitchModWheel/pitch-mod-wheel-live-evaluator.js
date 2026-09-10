// Registers the offline/render-time dispatch handler for pitchModWheel into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.pitchModWheel = ({ nodeId, mixInput, hasInput }) => {
  const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
  const pitch = resetActive ? 0 : (hasInput(nodeId, "Pitch")
    ? nodeGraphFiniteNumber(mixInput(nodeId, "Pitch"))
    : nodeGraphFiniteNumber(nodeGraphMvp?.pitchWheelSignal));
  const mod = resetActive ? 0 : Math.max(0, Math.min(1, hasInput(nodeId, "Mod")
    ? nodeGraphFiniteNumber(mixInput(nodeId, "Mod"))
    : nodeGraphFiniteNumber(nodeGraphMvp?.modWheelSignal)));
  return {
    Mod: mod,
    Pitch: pitch,
    // Legacy jack names (pre Pitch/Mod rename).
    "Mod Wheel": mod,
    "Pitch Wheel": pitch,
  };
};
