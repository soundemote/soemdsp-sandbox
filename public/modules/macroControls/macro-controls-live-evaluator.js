// Registers the offline/render-time dispatch handler for macroControls into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.macroControls = ({ nodeId, mixInput, hasInput }) => {
  const macros = Array.isArray(nodeGraphMvp?.macroControls) ? nodeGraphMvp.macroControls : [];
  const value = {};
  for (let index = 0; index < 8; index += 1) {
    const port = `M${index + 1} In`;
    value[`M${index + 1}`] = Math.max(
      0,
      Math.min(1, hasInput(nodeId, port) ? Number(mixInput(nodeId, port)) || 0 : Number(macros[index]) || 0),
    );
  }
  return value;
};
