// Universe laws + tiny math (sandbox port of soemdsp/seconstant.hpp).
// Compile-time only. Never assign these at runtime. Never a user knob.
//
// 1.0 is home. First real step is 1 + NODE_GRAPH_PLANCK (1.0000001).

var NODE_GRAPH_PLANCK = 1e-7;
var NODE_GRAPH_NUMERIC_PRECISION = NODE_GRAPH_PLANCK;

function nodeGraphPlanck() {
  const n = Number(NODE_GRAPH_PLANCK);
  return Number.isFinite(n) && n >= 0 ? n : 1e-7;
}

function nodeGraphIsNear(a, b, epsilon) {
  const eps = Number.isFinite(Number(epsilon)) ? Number(epsilon) : nodeGraphPlanck();
  return Math.abs(Number(a) - Number(b)) < eps;
}

function nodeGraphAboveUnity(peak) {
  return Number(peak) >= 1 + nodeGraphPlanck();
}

function nodeGraphOutsideUnity(value) {
  return nodeGraphAboveUnity(Math.abs(Number(value)));
}
