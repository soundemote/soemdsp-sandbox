// Registers the offline/render-time dispatch handler for graph2 into
// nodeGraphLiveModuleEvaluators (declared in
// node-graph-live-frame-evaluator.js). Extracted from the inline
// if/else-if branch that used to live in that file, matched via
// nodeGraphModuleIsGraphType (a layout: "graph" predicate -- graph2 is now
// the only module definition with that layout; the legacy "graph" type,
// which had per-point curve shape/contour controls, has been retired).
// graphOutputValue is a per-frame local closure in the evaluator's outer
// scope, threaded through the dispatch call's context bundle since a
// registry function built once can't close over it directly.
function nodeGraphGraphTypeLiveEvaluator({ node, nodeId, graphOutputValue }) {
  return graphOutputValue(node, nodeId);
}
nodeGraphLiveModuleEvaluators.graph2 = nodeGraphGraphTypeLiveEvaluator;
