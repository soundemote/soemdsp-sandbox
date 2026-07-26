// Registers the offline/render-time dispatch handler for graph modules
// (graph2 = Graph, graphCopy = Graph_Copy) into nodeGraphLiveModuleEvaluators.
// graphOutputValue is a per-frame local closure in the evaluator's outer
// scope, threaded through the dispatch call's context bundle since a
// registry function built once can't close over it directly.
function nodeGraphGraphTypeLiveEvaluator({ node, nodeId, graphOutputValue }) {
  return graphOutputValue(node, nodeId);
}
nodeGraphLiveModuleEvaluators.graph2 = nodeGraphGraphTypeLiveEvaluator;
nodeGraphLiveModuleEvaluators.graphCopy = nodeGraphGraphTypeLiveEvaluator;
