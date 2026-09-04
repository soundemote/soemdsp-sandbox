// Registers the offline/render-time dispatch handler for pitchModWheel into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.pitchModWheel = ({ nodeId, mixInput, hasInput }) => {
  const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
  const pitch = resetActive ? 0 : Math.max(-1, Math.min(1, hasInput(nodeId, "Pitch")
    ? Number(mixInput(nodeId, "Pitch")) || 0
    : Number(nodeGraphMvp?.pitchWheelSignal) || 0));
  const mod = resetActive ? 0 : Math.max(0, Math.min(1, hasInput(nodeId, "Mod")
    ? Number(mixInput(nodeId, "Mod")) || 0
    : Number(nodeGraphMvp?.modWheelSignal) || 0));
  return {
    Mod: mod,
    Pitch: pitch,
    // Legacy jack names (pre Pitch/Mod rename).
    "Mod Wheel": mod,
    "Pitch Wheel": pitch,
  };
};
