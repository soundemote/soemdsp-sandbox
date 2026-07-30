// Per-segment curve styles (Step Graph / legacy point-to-point).
//   linear      — straight; contour ignored
//   rational    — contour bends the chord (0 = straight)
//   exponential — always curved; contour sets amount / direction
//   log         — always curved (complement family); contour sets amount
//   smoothstep  — hermite S-curve (p²(3−2p)); contour ignored
//   hold        — step until next point; contour ignored
// Legacy "smooth" still normalizes → smoothstep.
//
// Step Graph (graphCopy) vs Smooth Graph (graph2):
//   Smooth: one global curve through free dots (smoothingMode + tension params).
//   Step:   points = step boundaries; empty circle = bar height (left+right Y)
//           or Shift+drag = contour. Normal node drag snaps X; Ctrl = free point.
const nodeGraphGraphShapes = Object.freeze([
  "linear",
  "rational",
  "exponential",
  "log",
  "smoothstep",
  "hold",
]);
// Smooth Graph global curve modes (canonical keys).
// "catmull" = guide-tension curve through the free dots (start/end on-curve;
// interior points pull the path; tension scales the pull).
// Legacy labels smooth / bezier / catmullRom all map → "catmull".
const nodeGraphGraph2SmoothingModes = Object.freeze(["linear", "catmull", "quadratic", "cubic"]);
// Pre-collapse Curve param indices: Linear, Smooth, Bezier, Quadratic, Cubic, Catmull.
const nodeGraphGraph2SmoothingModeLegacySix = Object.freeze([
  "linear",
  "catmull",
  "catmull",
  "quadratic",
  "cubic",
  "catmull",
]);

const nodeGraphDefaultGraphData = Object.freeze({
  cursorX: 0.5,
  nodes: Object.freeze([
    Object.freeze({ c: 0, shape: "linear", x: 0, y: 0 }),
    Object.freeze({ c: 0, shape: "rational", x: 1, y: 1 }),
  ]),
});

const nodeGraphGraphPresets = Object.freeze({
  envelope: Object.freeze({
    cursorX: 0,
    nodes: Object.freeze([
      Object.freeze({ c: 0, shape: "linear", x: 0, y: 0 }),
      Object.freeze({ c: 0.45, shape: "exponential", x: 0.12, y: 1 }),
      Object.freeze({ c: -0.25, shape: "rational", x: 0.48, y: 0.48 }),
      Object.freeze({ c: 0.25, shape: "exponential", x: 0.82, y: 0.48 }),
      Object.freeze({ c: -0.35, shape: "exponential", x: 1, y: 0 }),
    ]),
  }),
  ramp: Object.freeze({
    cursorX: 0,
    nodes: Object.freeze([
      Object.freeze({ c: 0, shape: "linear", x: 0, y: 0 }),
      Object.freeze({ c: 0, shape: "linear", x: 1, y: 1 }),
    ]),
  }),
  sine: Object.freeze({
    cursorX: 0,
    nodes: Object.freeze([
      Object.freeze({ c: 0, shape: "smoothstep", x: 0, y: 0.5 }),
      Object.freeze({ c: 0, shape: "smoothstep", x: 0.25, y: 1 }),
      Object.freeze({ c: 0, shape: "smoothstep", x: 0.5, y: 0.5 }),
      Object.freeze({ c: 0, shape: "smoothstep", x: 0.75, y: 0 }),
      Object.freeze({ c: 0, shape: "smoothstep", x: 1, y: 0.5 }),
    ]),
  }),
  steps: Object.freeze({
    cursorX: 0,
    nodes: Object.freeze([
      Object.freeze({ c: 0, shape: "linear", x: 0, y: 0.2 }),
      Object.freeze({ c: 0, shape: "hold", x: 0.25, y: 0.72 }),
      Object.freeze({ c: 0, shape: "hold", x: 0.5, y: 0.4 }),
      Object.freeze({ c: 0, shape: "hold", x: 0.75, y: 0.88 }),
      Object.freeze({ c: 0, shape: "hold", x: 1, y: 0.88 }),
    ]),
  }),
  triangle: Object.freeze({
    cursorX: 0,
    nodes: Object.freeze([
      Object.freeze({ c: 0, shape: "linear", x: 0, y: 0 }),
      Object.freeze({ c: 0, shape: "linear", x: 0.5, y: 1 }),
      Object.freeze({ c: 0, shape: "linear", x: 1, y: 0 }),
    ]),
  }),
});

function nodeGraphGraphPresetData(name) {
  return normalizeNodeGraphGraph(nodeGraphGraphPresets[String(name || "").trim()] || nodeGraphDefaultGraphData);
}

function nodeGraphGraphTransformedData(graphValue, transform) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const type = String(transform || "").trim();
  if (type === "flipY") {
    return normalizeNodeGraphGraph({
      cursorX: graph.cursorX,
      nodes: graph.nodes.map((node) => ({
        ...node,
        y: 1 - node.y,
      })),
    });
  }
  if (type === "reverseX") {
    const nodes = graph.nodes.map((node, index) => {
      const segmentSource = graph.nodes[index + 1] || node;
      return {
        c: -normalizeNodeGraphGraphNumber(segmentSource.c, 0, -0.999, 0.999),
        shape: segmentSource.shape,
        x: 1 - node.x,
        y: node.y,
      };
    });
    return normalizeNodeGraphGraph({
      cursorX: 1 - graph.cursorX,
      nodes,
    });
  }
  return graph;
}

function addNodeGraphGraphNodeData(graphValue, pointValue = {}) {
  const graph = normalizeNodeGraphGraph(graphValue);
  if (graph.nodes.length >= 32) {
    return { added: false, graph, selectedIndex: nodeGraphGraphNodeIndexFromValue(graph, graph.nodes.length - 1) };
  }
  const source = pointValue && typeof pointValue === "object" ? pointValue : {};
  const x = normalizeNodeGraphGraphNumber(source.x, graph.cursorX);
  const y = Number.isFinite(Number(source.y))
    ? normalizeNodeGraphGraphNumber(source.y, 0)
    : normalizeNodeGraphGraphNumber(nodeGraphGraphValueAt(graph, x), 0);
  // Do NOT move cursorX/phase when placing a control point — only the phase
  // scrub gesture should change the cream phase line.
  // Prefer caller shape; default hold for step-bar workflows (caller can pass).
  const shape = source.shape != null
    ? normalizeNodeGraphGraphShape(source.shape)
    : "rational";
  graph.nodes.push({
    c: 0,
    shape,
    x,
    y,
  });
  const normalized = normalizeNodeGraphGraph(graph);
  const selectedIndex = normalized.nodes.reduce((bestIndex, node, index) => (
    Math.abs(node.x - x) < Math.abs(normalized.nodes[bestIndex].x - x)
      ? index
      : bestIndex
  ), 0);
  return {
    added: true,
    graph: normalized,
    selectedIndex,
    selectedX: x,
  };
}

function duplicateNodeGraphGraphNodeData(graphValue, selectedIndex = 0) {
  const graph = normalizeNodeGraphGraph(graphValue);
  if (graph.nodes.length >= 32) {
    return { graph, duplicated: false, selectedIndex: nodeGraphGraphNodeIndexFromValue(graph, selectedIndex) };
  }
  const index = nodeGraphGraphNodeIndexFromValue(graph, selectedIndex);
  const sourceNode = graph.nodes[index] || graph.nodes.at(-1);
  const previousX = graph.nodes[Math.max(0, index - 1)]?.x ?? 0;
  const nextX = graph.nodes[Math.min(graph.nodes.length - 1, index + 1)]?.x ?? 1;
  const baseX = normalizeNodeGraphGraphNumber(sourceNode.x, 0.5);
  const offset = 0.025;
  const duplicateX = index >= graph.nodes.length - 1
    ? Math.max(previousX + 0.001, baseX - offset)
    : Math.min(nextX - 0.001, baseX + offset);
  const x = normalizeNodeGraphGraphNumber(duplicateX, baseX, 0.001, 0.999);
  graph.nodes.push({
    c: sourceNode.c,
    shape: sourceNode.shape,
    x,
    y: sourceNode.y,
  });
  const normalized = normalizeNodeGraphGraph(graph);
  const duplicateIndex = normalized.nodes.reduce((bestIndex, node, nodeIndex) => {
    const best = normalized.nodes[bestIndex];
    return Math.abs(node.x - x) < Math.abs(best.x - x) ? nodeIndex : bestIndex;
  }, 0);
  return {
    duplicated: true,
    graph: normalized,
    selectedIndex: duplicateIndex,
    selectedX: x,
  };
}

function serializeNodeGraphGraphClipboard(graphValue) {
  return JSON.stringify({
    graph: normalizeNodeGraphGraph(graphValue),
    type: "soemdsp.graph",
    version: 1,
  }, null, 2);
}

function parseNodeGraphGraphClipboard(text) {
  try {
    const payload = JSON.parse(String(text || ""));
    if (payload?.type !== "soemdsp.graph") {
      return null;
    }
    return normalizeNodeGraphGraph(payload.graph);
  } catch (_error) {
    return null;
  }
}

function normalizeNodeGraphGraphShape(value) {
  const shape = String(value || "").trim().toLowerCase();
  if (shape === "logarithmic") {
    return "log";
  }
  // Old "smooth" name → smoothstep (same hermite S-curve).
  if (shape === "smooth" || shape === "smoothstep") {
    return "smoothstep";
  }
  return nodeGraphGraphShapes.includes(shape) ? shape : "rational";
}

function normalizeNodeGraphGraphNumber(value, fallback = 0, min = 0, max = 1) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : fallback;
}

function normalizeNodeGraphGraphNode(value = {}, index = 0) {
  const source = value && typeof value === "object" ? value : {};
  const fallback = nodeGraphDefaultGraphData.nodes[Math.min(index, nodeGraphDefaultGraphData.nodes.length - 1)];
  return {
    c: normalizeNodeGraphGraphNumber(source.c, fallback.c, -0.999, 0.999),
    shape: normalizeNodeGraphGraphShape(source.shape ?? fallback.shape),
    x: normalizeNodeGraphGraphNumber(source.x, fallback.x),
    y: normalizeNodeGraphGraphNumber(source.y, fallback.y),
  };
}

function normalizeNodeGraphGraph(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const inputNodes = Array.isArray(source.nodes) && source.nodes.length >= 2
    ? source.nodes
    : nodeGraphDefaultGraphData.nodes;
  const nodes = inputNodes
    .slice(0, 32)
    .map((node, index) => normalizeNodeGraphGraphNode(node, index))
    .sort((left, right) => left.x - right.x);
  if (nodes.length < 2) {
    nodes.push(...nodeGraphDefaultGraphData.nodes.map((node, index) => normalizeNodeGraphGraphNode(node, index)));
  }
  return {
    cursorX: normalizeNodeGraphGraphNumber(source.cursorX, nodeGraphDefaultGraphData.cursorX),
    nodes,
  };
}

function nodeGraphGraphWithPhaseCursor(patchNode, graphValue = patchNode?.graph) {
  const graph = normalizeNodeGraphGraph(graphValue);
  if (!nodeGraphModuleIsGraphType(patchNode?.type)) {
    return graph;
  }
  return normalizeNodeGraphGraph({
    ...graph,
    cursorX: normalizeNodeGraphGraphNumber(patchNode?.params?.phase, graph.cursorX),
  });
}

function syncNodeGraphGraphPhaseParameterFromCursor(patchNode, graphValue = patchNode?.graph) {
  if (!patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return normalizeNodeGraphGraph(graphValue);
  }
  const graph = normalizeNodeGraphGraph(graphValue);
  patchNode.graph = graph;
  patchNode.params = {
    ...(patchNode.params || {}),
    phase: graph.cursorX,
  };
  return graph;
}

function syncNodeGraphGraphPhaseSliderForNode(nodeId, phase) {
  const slider = nodeGraphNodeElement(nodeId)?.querySelector('input[data-param="phase"]');
  if (!slider) {
    return;
  }
  slider.value = String(normalizeNodeGraphGraphNumber(phase, Number(slider.value) || 0));
  syncNodeSliderReadout(slider);
}

function nodeGraphGraphEndpointYLockEnabledForNode(patchNode) {
  return nodeGraphModuleIsGraphType(patchNode?.type) && Number(patchNode?.params?.lockEndpointY) >= 0.5;
}

function nodeGraphGraphWithLockedEndpointY(graphValue, selectedIndex = 0) {
  const graph = normalizeNodeGraphGraph(graphValue);
  if (graph.nodes.length < 2) {
    return graph;
  }
  const lastIndex = graph.nodes.length - 1;
  const endpointIndex = nodeGraphGraphNodeIndexFromValue(graph, selectedIndex);
  const anchorIndex = endpointIndex >= lastIndex ? lastIndex : 0;
  const anchorY = normalizeNodeGraphGraphNumber(graph.nodes[anchorIndex]?.y, graph.nodes[0]?.y ?? 0);
  const nodes = graph.nodes.map((node, index) => (
    index === 0 || index === lastIndex
      ? normalizeNodeGraphGraphNode({ ...node, y: anchorY }, index)
      : node
  ));
  return normalizeNodeGraphGraph({ ...graph, nodes });
}

function nodeGraphGraphForNode(patchNode, selectedIndex = 0) {
  const graph = nodeGraphGraphWithPhaseCursor(patchNode);
  return nodeGraphGraphEndpointYLockEnabledForNode(patchNode)
    ? nodeGraphGraphWithLockedEndpointY(graph, selectedIndex)
    : graph;
}

function nodeGraphGraphSmoothCurve(position) {
  const p = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  return p * p * (3 - 2 * p);
}

// Step Graph (and legacy "graph"): per-segment hold/shape/contour.
// Smooth Graph (graph2): one global curve through dots — no per-node UI.
function nodeGraphGraphUsesPerNodeShapes(type) {
  return type === "graphCopy" || type === "graph";
}

function nodeGraphGraphUsesGlobalSmoothing(type) {
  return type === "graph2" || (nodeGraphModuleIsGraphType(type) && !nodeGraphGraphUsesPerNodeShapes(type));
}

function nodeGraphGraphRationalCurve(position, contour = 0) {
  const p = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  const c = normalizeNodeGraphGraphNumber(contour, 0, -0.999, 0.999);
  if (Math.abs(c) < 0.000001) {
    return p;
  }
  return c < 0
    ? (p * (1 + c)) / (1 + c * p)
    : p / (1 - c + c * p);
}

/**
 * Exponential ease: (e^{k p} − 1) / (e^k − 1).
 * Contour 0 → clear mid curve (not a line). Positive = stronger bow; negative flips.
 */
function nodeGraphGraphExponentialCurve(position, contour = 0) {
  const p = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  const t = normalizeNodeGraphGraphNumber(contour, 0, -0.999, 0.999);
  // |k| from ~1.2 (mild, always visible) to ~8 (hard).
  const mag = 1.2 + 6.8 * Math.abs(t);
  const k = t < 0 ? -mag : mag;
  if (Math.abs(k) < 0.05) {
    return p;
  }
  const ek = Math.exp(k);
  const denom = ek - 1;
  if (Math.abs(denom) < 1e-9) {
    return p;
  }
  return (Math.exp(k * p) - 1) / denom;
}

/**
 * Log ease: log(1 + p (b − 1)) / log(b) — complement family to exponential.
 * Contour 0 → clear mid curve. Sign flips which way it bows.
 */
function nodeGraphGraphLogarithmicCurve(position, contour = 0) {
  const p = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  const t = normalizeNodeGraphGraphNumber(contour, 0, -0.999, 0.999);
  // b > 1 always; larger |t| → stronger log bend.
  const b = Math.exp(1.2 + 5.5 * Math.abs(t));
  if (!Number.isFinite(b) || b <= 1.000001) {
    return p;
  }
  const denom = Math.log(b);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) {
    return p;
  }
  const y = Math.log(1 + p * (b - 1)) / denom;
  // Negative contour mirrors the ease (log-down vs log-up).
  return t < 0 ? 1 - Math.log(1 + (1 - p) * (b - 1)) / denom : y;
}

function normalizeNodeGraphGraph2SmoothingMode(value) {
  if (value === "legacy") {
    return "legacy";
  }
  const raw = String(value ?? "").trim().toLowerCase();
  // Old Curve labels that all used the same guide-tension path.
  if (raw === "smooth" || raw === "bezier" || raw === "catmullrom" || raw === "catmull") {
    return "catmull";
  }
  if (nodeGraphGraph2SmoothingModes.includes(raw)) {
    return raw;
  }
  if (Number.isFinite(Number(value))) {
    const n = Math.round(Number(value));
    // Orphan high indices from the old 6-choice Curve param.
    if (n === 4) {
      return "cubic";
    }
    if (n === 5) {
      return "catmull";
    }
    return nodeGraphGraph2SmoothingModes[Math.max(0, Math.min(
      nodeGraphGraph2SmoothingModes.length - 1,
      n,
    ))];
  }
  return "catmull";
}

/** Map old 6-choice Curve index → current 4-choice index (Linear/Catmull/Quadratic/Cubic). */
function nodeGraphGraph2SmoothingModeFourIndexFromLegacy(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "smooth" || raw === "bezier" || raw === "catmullrom" || raw === "catmull") {
    return 1;
  }
  if (nodeGraphGraph2SmoothingModes.includes(raw)) {
    return nodeGraphGraph2SmoothingModes.indexOf(raw);
  }
  if (Number.isFinite(Number(value))) {
    const n = Math.round(Number(value));
    if (n >= 0 && n < nodeGraphGraph2SmoothingModeLegacySix.length) {
      const legacyMode = nodeGraphGraph2SmoothingModeLegacySix[n];
      return Math.max(0, nodeGraphGraph2SmoothingModes.indexOf(legacyMode));
    }
  }
  return 1;
}

function nodeGraphGraphMeanderCurve(position, index = 0) {
  const p = nodeGraphGraphSmoothCurve(position);
  const wobblePhase = (index * 0.371) % 1;
  const wobble = Math.sin(Math.PI * p) * Math.sin((p * 1.5 + wobblePhase) * Math.PI * 2) * 0.075;
  return normalizeNodeGraphGraphNumber(p + wobble, p, 0, 1);
}

// de Casteljau on an explicit control polygon (x,y).
function nodeGraphGraphBezierPointAt(controls, position = 0) {
  const t = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  let points = controls.map((node) => ({
    x: normalizeNodeGraphGraphNumber(node.x, 0),
    y: normalizeNodeGraphGraphNumber(node.y, 0),
  }));
  if (!points.length) {
    return { x: 0, y: 0 };
  }
  while (points.length > 1) {
    points = points.slice(0, -1).map((point, index) => {
      const next = points[index + 1];
      return {
        x: point.x + (next.x - point.x) * t,
        y: point.y + (next.y - point.y) * t,
      };
    });
  }
  return points[0];
}

// Guide-point curve: ALWAYS starts at first node and ends at last node.
// Interior nodes are GUIDES (the curve approaches them, does not have to
// pass through them — no hard corners at interior dots).
//
// Tension 0 → pure start→end line (guides ignored).
// Tension mid → soft meander, guides pull gently.
// Tension 1 → strong pull toward the guide polygon (still C∞ Bezier, no kinks).
// Scale can exceed 1 so "tight" can sit closer to the guides than textbook
// Bezier-of-the-dots (which many people still find too gradual).
function nodeGraphGraphGuideBezierControls(nodes, tension = 1) {
  const count = nodes.length;
  if (count < 2) {
    return nodes.map((node) => ({ x: node.x, y: node.y }));
  }
  const u = normalizeNodeGraphGraphNumber(tension, 1, 0, 1);
  if (u <= 1e-6) {
    return [
      { x: nodes[0].x, y: nodes[0].y },
      { x: nodes[count - 1].x, y: nodes[count - 1].y },
    ];
  }
  // 0 → nearly ignore guides; 1 → past full guide offset (tighter than plain Bezier).
  const pull = 0.08 + 1.42 * (u ** 0.6);
  const first = nodes[0];
  const last = nodes[count - 1];
  return nodes.map((node, index) => {
    if (index === 0 || index === count - 1) {
      return { x: node.x, y: node.y };
    }
    const s = index / (count - 1);
    const chordX = first.x + (last.x - first.x) * s;
    const chordY = first.y + (last.y - first.y) * s;
    return {
      x: chordX + (node.x - chordX) * pull,
      y: chordY + (node.y - chordY) * pull,
    };
  });
}

function nodeGraphGraphGuideBezierValueAt(graph, xValue, tension = 1) {
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  const nodes = graph.nodes;
  if (nodes.length < 2) {
    return nodes[0]?.y ?? 0;
  }
  if (x <= nodes[0].x) {
    return nodes[0].y;
  }
  const last = nodes[nodes.length - 1];
  if (x >= last.x) {
    return last.y;
  }
  const controls = nodeGraphGraphGuideBezierControls(nodes, tension);
  // Dense sample in t, then invert x→y. More reliable than binary search when
  // x(t) is not strictly monotonic (common with aggressive interior guides).
  const samples = 96;
  let prev = nodeGraphGraphBezierPointAt(controls, 0);
  for (let index = 1; index <= samples; index += 1) {
    const point = nodeGraphGraphBezierPointAt(controls, index / samples);
    const minX = Math.min(prev.x, point.x);
    const maxX = Math.max(prev.x, point.x);
    if (x >= minX && x <= maxX) {
      const dx = point.x - prev.x;
      const a = Math.abs(dx) < 1e-12 ? 0 : (x - prev.x) / dx;
      return normalizeNodeGraphGraphNumber(prev.y + (point.y - prev.y) * a, 0, -Infinity, Infinity);
    }
    prev = point;
  }
  // Fallback: nearest sample in x.
  let bestY = nodes[0].y;
  let bestDist = Infinity;
  for (let index = 0; index <= samples; index += 1) {
    const point = nodeGraphGraphBezierPointAt(controls, index / samples);
    const dist = Math.abs(point.x - x);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = point.y;
    }
  }
  return normalizeNodeGraphGraphNumber(bestY, 0, -Infinity, Infinity);
}

// Back-compat names used around the codebase.
function nodeGraphGraphBezierValueAt(graph, xValue, tension = 1) {
  return nodeGraphGraphGuideBezierValueAt(graph, xValue, tension);
}

function nodeGraphGraphInterpolationWindowStart(nodes, x, degree) {
  const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
  let segmentIndex = 0;
  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (x <= nodes[index + 1].x) {
      segmentIndex = index;
      break;
    }
    segmentIndex = index;
  }
  const start = segmentIndex - Math.max(0, Math.floor((targetCount - 2) * 0.5));
  return Math.max(0, Math.min(nodes.length - targetCount, start));
}

function nodeGraphGraphLagrangeValueAt(graph, xValue, degree = 3) {
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  const nodes = graph.nodes;
  if (nodes.length < 2) {
    return nodes[0]?.y ?? 0;
  }
  for (const node of nodes) {
    if (Math.abs(x - node.x) < 0.000001) {
      return node.y;
    }
  }
  const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
  const start = nodeGraphGraphInterpolationWindowStart(nodes, x, degree);
  const windowNodes = nodes.slice(start, start + targetCount);
  let value = 0;
  for (let index = 0; index < windowNodes.length; index += 1) {
    const point = windowNodes[index];
    let basis = 1;
    for (let otherIndex = 0; otherIndex < windowNodes.length; otherIndex += 1) {
      if (otherIndex === index) {
        continue;
      }
      const other = windowNodes[otherIndex];
      const denominator = point.x - other.x;
      if (Math.abs(denominator) < 0.000001) {
        continue;
      }
      basis *= (x - other.x) / denominator;
    }
    value += point.y * basis;
  }
  return value;
}

// Piecewise-linear through all control points (the dotted control polygon).
function nodeGraphGraphPolylineValueAt(graph, xValue) {
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  const nodes = graph.nodes;
  if (!nodes.length) {
    return 0;
  }
  if (nodes.length < 2 || x <= nodes[0].x) {
    return nodes[0].y;
  }
  if (x >= nodes[nodes.length - 1].x) {
    return nodes[nodes.length - 1].y;
  }
  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (x <= nodes[index + 1].x) {
      const left = nodes[index];
      const right = nodes[index + 1];
      const dx = right.x - left.x;
      if (Math.abs(dx) < 0.000001) {
        return 0.5 * (left.y + right.y);
      }
      const t = (x - left.x) / dx;
      return left.y + (right.y - left.y) * t;
    }
  }
  return nodes[nodes.length - 1].y;
}

// Cubic Hermite in segment parameter t ∈ [0,1].
function nodeGraphGraphHermiteY(y1, y2, m1, m2, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y1
    + (t3 - 2 * t2 + t) * m1
    + (-2 * t3 + 3 * t2) * y2
    + (t3 - t2) * m2;
}

// Cardinal / Catmull-Rom family that PASSES THROUGH every point.
// Tangent scale s: 0.5 = classic Catmull-Rom; smaller = tighter (hugs chords);
// larger = looser (more overshoot). Endpoints use reflected ghosts.
function nodeGraphGraphCardinalValueAt(graph, xValue, tension = 1) {
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  const nodes = graph.nodes;
  if (nodes.length < 2) {
    return nodes[0]?.y ?? 0;
  }
  for (const node of nodes) {
    if (Math.abs(x - node.x) < 0.000001) {
      return node.y;
    }
  }
  if (x <= nodes[0].x) {
    return nodes[0].y;
  }
  if (x >= nodes[nodes.length - 1].x) {
    return nodes[nodes.length - 1].y;
  }

  // tension 0 → exact polyline (corners). tension 1 → loose through-points
  // (slightly looser than textbook CR). Mid-range uses small tangent scale so
  // you can get "almost linear but rounded" — which the old Bezier blend
  // never could (global Bezier does not interpolate interior points, and
  // tension blended against first→last line only).
  const u = normalizeNodeGraphGraphNumber(tension, 1, 0, 1);
  if (u <= 1e-6) {
    return nodeGraphGraphPolylineValueAt(graph, x);
  }
  // Power bias puts more of the dial in the "tight" region; s=0.5 is CR.
  const s = 0.5 * (0.12 + 1.55 * (u ** 0.55));

  const yAt = (i) => {
    if (i < 0) {
      return 2 * nodes[0].y - nodes[1].y;
    }
    if (i >= nodes.length) {
      return 2 * nodes[nodes.length - 1].y - nodes[nodes.length - 2].y;
    }
    return nodes[i].y;
  };
  const xAt = (i) => {
    if (i < 0) {
      return 2 * nodes[0].x - nodes[1].x;
    }
    if (i >= nodes.length) {
      return 2 * nodes[nodes.length - 1].x - nodes[nodes.length - 2].x;
    }
    return nodes[i].x;
  };

  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (x > nodes[index + 1].x) {
      continue;
    }
    const x1 = nodes[index].x;
    const x2 = nodes[index + 1].x;
    const y1 = nodes[index].y;
    const y2 = nodes[index + 1].y;
    const dx = x2 - x1;
    if (Math.abs(dx) < 0.000001) {
      return 0.5 * (y1 + y2);
    }
    const t = (x - x1) / dx;
    // Tangents in y-per-segment-t so non-uniform x spacing stays well-behaved.
    const dxIn = xAt(index + 1) - xAt(index - 1);
    const dxOut = xAt(index + 2) - xAt(index);
    const m1 = Math.abs(dxIn) < 1e-9 ? 0 : s * (yAt(index + 1) - yAt(index - 1)) / dxIn * dx;
    const m2 = Math.abs(dxOut) < 1e-9 ? 0 : s * (yAt(index + 2) - yAt(index)) / dxOut * dx;
    return normalizeNodeGraphGraphNumber(nodeGraphGraphHermiteY(y1, y2, m1, m2, t), 0, -Infinity, Infinity);
  }
  return nodes[nodes.length - 1].y;
}

// Back-compat name: Catmull-Rom is the s=0.5 member of the Cardinal family.
function nodeGraphGraphCatmullRomValueAt(graph, xValue, tension = 1) {
  return nodeGraphGraphCardinalValueAt(graph, xValue, tension);
}

function nodeGraphGraphControlPolygonPath(graphValue) {
  const graph = normalizeNodeGraphGraph(graphValue);
  return graph.nodes
    .map((node, index) => {
      const point = nodeGraphGraphPointToSvg(node.x, node.y);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
    })
    .join(" ");
}

function nodeGraphGraphIsStepGraphType(type) {
  return String(type || "").trim() === "graphCopy";
}

/** Step Graph only: empty-circle handles that edit per-segment curvature (`c`). */
function nodeGraphGraphShowsContourHandles(patchNode) {
  return nodeGraphGraphIsStepGraphType(patchNode?.type);
}

/**
 * Step bar for the empty-circle at rightIndex is the segment [left, right]
 * (indices rightIndex-1 and rightIndex). Those two boundaries define the bar.
 */
function nodeGraphGraphStepBarIndicesForSegment(graph, rightIndex) {
  const i = nodeGraphGraphNodeIndexFromValue(graph, rightIndex);
  if (i <= 0) {
    return [0];
  }
  return [i - 1, i];
}

/**
 * Raise/lower the step bar for segment ending at rightIndex by a relative Y delta.
 * Moves left + right boundary Y from their drag-start heights (no vertical quantize).
 * X positions are unchanged. Forces hold on the right node so the plateau stays flat.
 */
function nodeGraphGraphApplyStepBarHeightDelta(graphValue, rightIndex, startLeftY, startRightY, deltaY) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const i = nodeGraphGraphNodeIndexFromValue(graph, rightIndex);
  if (i <= 0) {
    return graph;
  }
  const leftY = normalizeNodeGraphGraphNumber(Number(startLeftY) + Number(deltaY), 0);
  const rightY = normalizeNodeGraphGraphNumber(Number(startRightY) + Number(deltaY), 0);
  const nodes = graph.nodes.map((node, nodeIndex) => {
    if (nodeIndex === i - 1) {
      return normalizeNodeGraphGraphNode({ ...node, y: leftY }, nodeIndex);
    }
    if (nodeIndex === i) {
      return normalizeNodeGraphGraphNode({ ...node, y: rightY, shape: "hold" }, nodeIndex);
    }
    return node;
  });
  return normalizeNodeGraphGraph({ ...graph, nodes });
}

/**
 * Absolute set of both bar endpoints to the same Y (e.g. double-click place).
 */
function nodeGraphGraphApplyStepBarHeight(graphValue, rightIndex, yValue) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const y = normalizeNodeGraphGraphNumber(yValue, 0);
  const i = nodeGraphGraphNodeIndexFromValue(graph, rightIndex);
  if (i <= 0) {
    // No left neighbor — just set this node.
    const nodes = graph.nodes.map((node, nodeIndex) => (
      nodeIndex === i
        ? normalizeNodeGraphGraphNode({ ...node, y }, nodeIndex)
        : node
    ));
    return normalizeNodeGraphGraph({ ...graph, nodes });
  }
  const nodes = graph.nodes.map((node, nodeIndex) => {
    if (nodeIndex === i - 1) {
      return normalizeNodeGraphGraphNode({ ...node, y }, nodeIndex);
    }
    if (nodeIndex === i) {
      return normalizeNodeGraphGraphNode({ ...node, y, shape: "hold" }, nodeIndex);
    }
    return node;
  });
  return normalizeNodeGraphGraph({ ...graph, nodes });
}

/**
 * Contour is stored on the RIGHT node of a segment (outgoing from left → right).
 * Handle sits at the segment mid-x on the actual curve so it tracks the bow.
 */
function nodeGraphGraphContourHandlePoint(graph, rightIndex, smoothingMode = "legacy") {
  const left = graph.nodes[rightIndex - 1];
  const right = graph.nodes[rightIndex];
  if (!left || !right) {
    return null;
  }
  const x = left.x + (right.x - left.x) * 0.5;
  const y = nodeGraphGraphSegmentValue(graph, x, rightIndex - 1, smoothingMode);
  return nodeGraphGraphPointToSvg(x, y);
}

function nodeGraphGraphSegmentChordMidpoint(graph, rightIndex) {
  const left = graph.nodes[rightIndex - 1];
  const right = graph.nodes[rightIndex];
  if (!left || !right) {
    return null;
  }
  return {
    x: left.x + (right.x - left.x) * 0.5,
    y: left.y + (right.y - left.y) * 0.5,
  };
}

/**
 * Map a graph-space pointer position to contour in [-0.999, 0.999].
 * Vertical offset from the chord midpoint drives amount; sign follows segment slope.
 */
function nodeGraphGraphContourFromPoint(graph, rightIndex, point) {
  const midpoint = nodeGraphGraphSegmentChordMidpoint(graph, rightIndex);
  const left = graph.nodes[rightIndex - 1];
  const right = graph.nodes[rightIndex];
  if (!midpoint || !left || !right) {
    return 0;
  }
  const direction = right.y >= left.y ? 1 : -1;
  const range = Math.max(0.08, Math.abs(right.y - left.y) * 0.85 + 0.08);
  return normalizeNodeGraphGraphNumber(
    ((Number(point.y) - midpoint.y) / range) * direction * 1.8,
    0,
    -0.999,
    0.999,
  );
}

/** Dragging contour forces a shape that actually uses contour (hold ignores it). */
function nodeGraphGraphContourEditableShape(value) {
  const shape = normalizeNodeGraphGraphShape(value);
  if (shape === "rational" || shape === "exponential" || shape === "log") {
    return shape;
  }
  return "rational";
}

function nodeGraphGraphModeCurve(position, mode, index = 0) {
  const normalizedMode = normalizeNodeGraphGraph2SmoothingMode(mode);
  if (normalizedMode === "linear") {
    return normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  }
  // Segment fallback (non-guide modes): smoothstep ease between neighbors.
  return nodeGraphGraphSmoothCurve(position);
}

function nodeGraphGraphLegacySegmentShape(p, right) {
  const contour = normalizeNodeGraphGraphNumber(right?.c, 0, -0.999, 0.999);
  const shape = normalizeNodeGraphGraphShape(right?.shape);
  if (shape === "exponential") {
    return nodeGraphGraphExponentialCurve(p, contour);
  }
  if (shape === "log" || shape === "logarithmic") {
    return nodeGraphGraphLogarithmicCurve(p, contour);
  }
  if (shape === "hold") {
    return p >= 1 ? 1 : 0;
  }
  if (shape === "smoothstep" || shape === "smooth") {
    return nodeGraphGraphSmoothCurve(p);
  }
  if (shape === "linear") {
    return p;
  }
  return nodeGraphGraphRationalCurve(p, contour);
}

function nodeGraphGraphSegmentValue(graph, x, index, smoothingMode) {
  const left = graph.nodes[index];
  const right = graph.nodes[index + 1];
  const dx = right.x - left.x;
  if (Math.abs(dx) < 0.000001) {
    return 0.5 * (left.y + right.y);
  }
  const p = normalizeNodeGraphGraphNumber((x - left.x) / dx, 0, 0, 1);
  if (smoothingMode === "legacy") {
    return left.y + (right.y - left.y) * nodeGraphGraphLegacySegmentShape(p, right);
  }
  const shaped = nodeGraphGraphModeCurve(p, smoothingMode, index);
  return left.y + (right.y - left.y) * shaped;
}

function nodeGraphGraphValueAt(graphValue, xValue, smoothingMode, tension = 1) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  if (!graph.nodes.length) {
    return 0;
  }
  const normalizedMode = normalizeNodeGraphGraph2SmoothingMode(smoothingMode);
  if (normalizedMode === "legacy") {
    if (x < graph.nodes[0].x) {
      return graph.nodes[0].y;
    }
    if (x > graph.nodes[graph.nodes.length - 1].x) {
      return graph.nodes[graph.nodes.length - 1].y;
    }
    for (let index = 0; index < graph.nodes.length - 1; index += 1) {
      if (x <= graph.nodes[index + 1].x) {
        return normalizeNodeGraphGraphNumber(nodeGraphGraphSegmentValue(graph, x, index, "legacy"), 0, -Infinity, Infinity);
      }
    }
    return graph.nodes[graph.nodes.length - 1].y;
  }
  // Catmull: guide-tension curve (start+end on-curve; interior dots pull the path).
  // Tension 0 = line, 1 = tight to guides. (Old smooth/bezier aliases → catmull.)
  if (normalizedMode === "catmull") {
    return nodeGraphGraphGuideBezierValueAt(graph, x, tension);
  }
  if (x < graph.nodes[0].x) {
    return graph.nodes[0].y;
  }
  if (x > graph.nodes[graph.nodes.length - 1].x) {
    return graph.nodes[graph.nodes.length - 1].y;
  }
  // Quadratic / Cubic: still true interpolating Lagrange (through all points).
  if (normalizedMode === "quadratic") {
    return normalizeNodeGraphGraphNumber(nodeGraphGraphLagrangeValueAt(graph, x, 2), 0, -Infinity, Infinity);
  }
  if (normalizedMode === "cubic") {
    return normalizeNodeGraphGraphNumber(nodeGraphGraphLagrangeValueAt(graph, x, 3), 0, -Infinity, Infinity);
  }
  for (let index = 0; index < graph.nodes.length - 1; index += 1) {
    if (x <= graph.nodes[index + 1].x) {
      return normalizeNodeGraphGraphNumber(nodeGraphGraphSegmentValue(graph, x, index, smoothingMode), 0, -Infinity, Infinity);
    }
  }
  return graph.nodes[graph.nodes.length - 1].y;
}

function nodeGraphGraphPointToSvg(x, y) {
  return {
    x: 8 + normalizeNodeGraphGraphNumber(x, 0) * 84,
    y: 92 - normalizeNodeGraphGraphNumber(y, 0) * 84,
  };
}

function nodeGraphGraphCurvePath(graphValue, sampleCount = 96, smoothingMode, tension = 1) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const count = Math.max(2, Math.round(Number(sampleCount) || 96));
  const commands = [];
  for (let index = 0; index < count; index += 1) {
    const x = index / (count - 1);
    const y = nodeGraphGraphValueAt(graph, x, smoothingMode, tension);
    const point = nodeGraphGraphPointToSvg(x, y);
    commands.push(`${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`);
  }
  return commands.join(" ");
}

function createNodeGraphGraphSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function nodeGraphGraphSvgPlotRect(svg) {
  const rect = svg?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) {
    return null;
  }
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function nodeGraphGraphScreenRoundRadii(element, radius) {
  const rect = element?.getBoundingClientRect?.();
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  const safeRadius = Math.max(0, Number(radius) || 0);
  if (!(width > 0) || !(height > 0)) {
    return { rx: safeRadius, ry: safeRadius };
  }
  const shortestSide = Math.min(width, height);
  return {
    rx: safeRadius * shortestSide / width,
    ry: safeRadius * shortestSide / height,
  };
}

function nodeGraphGraphSvgToGraphPoint(svg, clientX, clientY) {
  const rect = nodeGraphGraphSvgPlotRect(svg);
  if (!rect) {
    return { x: 0, y: 0 };
  }
  const viewX = ((clientX - rect.left) / rect.width) * 100;
  const viewY = ((clientY - rect.top) / rect.height) * 100;
  return {
    x: normalizeNodeGraphGraphNumber((viewX - 8) / 84),
    y: normalizeNodeGraphGraphNumber((92 - viewY) / 84),
  };
}

function nodeGraphGraphConstrainedNodePoint(graph, index, point) {
  const nodes = graph.nodes || [];
  const lastIndex = nodes.length - 1;
  const margin = 0.001;
  const minX = index <= 0 ? 0 : normalizeNodeGraphGraphNumber(nodes[index - 1]?.x, 0) + margin;
  const maxX = index >= lastIndex ? 1 : normalizeNodeGraphGraphNumber(nodes[index + 1]?.x, 1) - margin;
  return {
    x: index <= 0
      ? 0
      : index >= lastIndex
        ? 1
        : normalizeNodeGraphGraphNumber(point.x, nodes[index]?.x || 0, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: normalizeNodeGraphGraphNumber(point.y, nodes[index]?.y || 0),
  };
}

function nodeGraphGraphNodeIndexFromValue(graph, value) {
  const maxIndex = Math.max(0, (graph?.nodes?.length || 1) - 1);
  const index = Math.round(Number(value));
  return Math.max(0, Math.min(maxIndex, Number.isFinite(index) ? index : maxIndex));
}

function nodeGraphGraphSelectionState() {
  if (!(nodeGraphMvp.graphSelectedNodeIndices instanceof Map)) {
    nodeGraphMvp.graphSelectedNodeIndices = new Map();
  }
  return nodeGraphMvp.graphSelectedNodeIndices;
}

function nodeGraphGraphSelectedNodeIndex(nodeId, graph, fallback = 0) {
  const state = nodeGraphGraphSelectionState();
  return nodeGraphGraphNodeIndexFromValue(graph, state.has(nodeId) ? state.get(nodeId) : fallback);
}

function setNodeGraphGraphSelectedNodeIndex(nodeId, graph, index) {
  const selectedIndex = nodeGraphGraphNodeIndexFromValue(graph, index);
  nodeGraphGraphSelectionState().set(nodeId, selectedIndex);
  return selectedIndex;
}

/** @returns {number} Step count 1..64, or 0 when no step grid should draw. */
function normalizeNodeGraphStepCount(value) {
  const raw = Math.round(Number(value));
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(64, raw));
}

function nodeGraphGraphStepCountForNode(patchNode) {
  // Step grid is Step Graph (graphCopy) only.
  if (String(patchNode?.type || "").trim() !== "graphCopy") {
    return 0;
  }
  const raw = Math.round(Number(patchNode?.params?.steps));
  // Default 8 when unset / invalid (matches parameter defaultValue).
  if (!Number.isFinite(raw) || raw <= 0) {
    return 8;
  }
  return Math.max(1, Math.min(64, raw));
}

/**
 * Snap an x position (0..1) onto the Step Graph vertical grid.
 * steps=1 → only 0 or 1 (whichever is closer).
 * steps=n → i/n for i = 0..n (same lines as the face grid).
 */
function nodeGraphGraphSnapXToStepGrid(x, stepCount) {
  const steps = normalizeNodeGraphStepCount(stepCount);
  if (steps <= 0) {
    return normalizeNodeGraphGraphNumber(x, 0);
  }
  const value = normalizeNodeGraphGraphNumber(x, 0);
  if (steps === 1) {
    return value < 0.5 ? 0 : 1;
  }
  const unit = 1 / steps;
  return normalizeNodeGraphGraphNumber(Math.round(value / unit) * unit, 0);
}

/** Shift = fine (0.1×). On Step Graph, Ctrl is free-point (not fine). */
function nodeGraphGraphPointDragMultiplier(event) {
  return event?.shiftKey ? 0.1 : 1;
}

/**
 * Pixel → unit scale for graph face drags. Same ref for X and Y so left/right
 * and up/down have equal weight (app-wide: no axis-favoring differentiation).
 */
function nodeGraphGraphDragUnitPerPixel(svg) {
  const rect = nodeGraphGraphSvgPlotRect(svg);
  if (!rect) {
    return 1 / 200;
  }
  // Usable plot is the inner 84% of the viewBox mapping; use average side so
  // both axes share one scale (matches 1D travel width spirit of sliders).
  const span = Math.max(1, (rect.width + rect.height) * 0.5 * 0.84);
  return 1 / span;
}

function renderNodeGraphGraphDisplay(element, graphValue, selectedIndex = null, options = {}) {
  if (!element) {
    return;
  }
  const graph = normalizeNodeGraphGraph(graphValue);
  // Prefer the owning module's type for curve mode. Point-to-point graphs
  // (Smooth Graph / Step Graph) must use "legacy" segment shapes. Falling
  // through to the default global catmull guide curve makes hold/step
  // curves look like a flat line through the endpoints (often y=0 → y=0).
  const nodeId = String(
    element.dataset.graphNode
    || element.closest?.(".dsp-node")?.dataset?.node
    || "",
  ).trim();
  if (nodeId && element.dataset.graphNode !== nodeId) {
    element.dataset.graphNode = nodeId;
  }
  const ownerNode = nodeId && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  let smoothingMode = options.smoothingMode;
  let stepCount = options.stepCount;
  let tension = options.tension;
  if (ownerNode && typeof nodeGraphModuleIsGraphType === "function" && nodeGraphModuleIsGraphType(ownerNode.type)) {
    if (typeof nodeGraphGraphUsesPerNodeShapes === "function" && nodeGraphGraphUsesPerNodeShapes(ownerNode.type)) {
      smoothingMode = "legacy";
    } else if (smoothingMode == null || smoothingMode === "") {
      smoothingMode = nodeGraphGraphSmoothingModeForNode(ownerNode);
    }
    if (stepCount == null) {
      stepCount = nodeGraphGraphStepCountForNode(ownerNode);
    }
    if (tension == null) {
      tension = Number(ownerNode.params?.tension) ?? 1;
    }
  }
  smoothingMode = normalizeNodeGraphGraph2SmoothingMode(smoothingMode);
  stepCount = normalizeNodeGraphStepCount(stepCount);
  tension = Number.isFinite(Number(tension)) ? Number(tension) : 1;
  // Selection is tracked for the module panel only — face chrome never lights
  // a “selected” node (hover/drag index is handled separately via .is-hot).
  if (nodeId && selectedIndex !== null && selectedIndex !== undefined) {
    setNodeGraphGraphSelectedNodeIndex(nodeId, graph, selectedIndex);
  }
  const cursorValue = nodeGraphGraphValueAt(graph, graph.cursorX, smoothingMode, tension);
  const cursor = nodeGraphGraphPointToSvg(graph.cursorX, 0);
  const cursorPoint = nodeGraphGraphPointToSvg(graph.cursorX, cursorValue);
  element.replaceChildren();
  const svg = createNodeGraphGraphSvgElement("svg", {
    "aria-hidden": "true",
    class: "node-module-graph-svg",
    preserveAspectRatio: "none",
    viewBox: "0 0 100 100",
  });
  // Step Graph: vertical guides at each step boundary (0..steps inclusive).
  if (stepCount > 0) {
    const stepGroup = createNodeGraphGraphSvgElement("g", {
      class: "node-module-graph-step-grid",
      "aria-hidden": "true",
    });
    for (let step = 0; step <= stepCount; step += 1) {
      const x = nodeGraphGraphPointToSvg(step / stepCount, 0).x;
      stepGroup.append(createNodeGraphGraphSvgElement("line", {
        class: "node-module-graph-step-line",
        x1: x.toFixed(3),
        x2: x.toFixed(3),
        y1: "8",
        y2: "92",
      }));
    }
    svg.append(stepGroup);
  }
  svg.append(createNodeGraphGraphSvgElement("line", {
    class: "node-module-graph-cursor",
    x1: cursor.x.toFixed(3),
    x2: cursor.x.toFixed(3),
    y1: "8",
    y2: "92",
  }));
  svg.append(createNodeGraphGraphSvgElement("line", {
    class: "node-module-graph-cursor-hit",
    "data-graph-cursor": "true",
    x1: cursor.x.toFixed(3),
    x2: cursor.x.toFixed(3),
    y1: "8",
    y2: "92",
  }));
  svg.append(createNodeGraphGraphSvgElement("line", {
    class: "node-module-graph-cursor-value-guide",
    x1: "8",
    x2: "92",
    y1: cursorPoint.y.toFixed(3),
    y2: cursorPoint.y.toFixed(3),
  }));
  // Final-phase ghost -- mirrors the cream phase/cursor line but tracks the
  // engine's actual sample X (__GraphPhase: Rate LFO advance, Phase knob, and
  // Input-mode CV). Same idea as the XY pad's purple ghost puck (final Out tip
  // after modulation). Starts hidden; syncNodeGraphGraphLivePlayheads() moves
  // and reveals it without a full re-render on each scope snapshot.
  svg.append(createNodeGraphGraphSvgElement("line", {
    class: "node-module-graph-playhead node-module-graph-phase-ghost",
    x1: cursor.x.toFixed(3),
    x2: cursor.x.toFixed(3),
    y1: "8",
    y2: "92",
  }));
  // Dotted linear control polygon (the straight-line path through points) —
  // kept in every smoothing mode so you can see the underlying polyline.
  svg.append(createNodeGraphGraphSvgElement("path", {
    class: "node-module-graph-control-line",
    d: nodeGraphGraphControlPolygonPath(graph),
  }));
  svg.append(createNodeGraphGraphSvgElement("path", {
    class: "node-module-graph-curve",
    d: nodeGraphGraphCurvePath(graph, 96, smoothingMode, tension),
  }));
  // Face dots/rings stay invisible until a specific index is hot (hover or drag).
  // No selected styling — panel selection does not lighten face chrome.
  const hitRadii = nodeGraphGraphScreenRoundRadii(element, 5.4);
  const nodeRadii = nodeGraphGraphScreenRoundRadii(element, 1.5);
  const contourRadii = nodeGraphGraphScreenRoundRadii(element, 2.4);
  const showContourHandles = nodeGraphGraphShowsContourHandles(ownerNode);
  if (showContourHandles) {
    for (let index = 1; index < graph.nodes.length; index += 1) {
      const point = nodeGraphGraphContourHandlePoint(graph, index, smoothingMode);
      if (!point) {
        continue;
      }
      svg.append(createNodeGraphGraphSvgElement("ellipse", {
        class: "node-module-graph-contour-handle",
        cx: point.x.toFixed(3),
        cy: point.y.toFixed(3),
        "data-graph-contour-index": String(index),
        rx: contourRadii.rx.toFixed(3),
        ry: contourRadii.ry.toFixed(3),
      }));
    }
  }
  graph.nodes.forEach((node, index) => {
    const point = nodeGraphGraphPointToSvg(node.x, node.y);
    svg.append(createNodeGraphGraphSvgElement("ellipse", {
      class: "node-module-graph-node-hit",
      cx: point.x.toFixed(3),
      cy: point.y.toFixed(3),
      "data-graph-node-index": String(index),
      rx: hitRadii.rx.toFixed(3),
      ry: hitRadii.ry.toFixed(3),
    }));
    svg.append(createNodeGraphGraphSvgElement("ellipse", {
      class: "node-module-graph-node",
      cx: point.x.toFixed(3),
      cy: point.y.toFixed(3),
      "data-graph-node-index": String(index),
      rx: nodeRadii.rx.toFixed(3),
      ry: nodeRadii.ry.toFixed(3),
    }));
  });
  element.append(svg);
  bindNodeGraphGraphFaceHover(element);
  // Preserve hot chrome across re-renders (drag frames, live updates).
  const drag = nodeGraphMvp?.graphNodeDragging;
  const dragOnFace = drag && (drag.display === element || drag.nodeId === nodeId);
  if (dragOnFace && drag.mode === "cursor") {
    clearNodeGraphGraphHotMarks(element);
    setNodeGraphGraphPhaseHot(element, true);
  } else if (dragOnFace && drag.mode === "stepBar" && Number.isFinite(Number(drag.index))) {
    setNodeGraphGraphPhaseHot(element, false);
    setNodeGraphGraphStepBarHot(element, drag.graph || graph, Number(drag.index));
  } else if (dragOnFace && Number.isFinite(Number(drag.index))) {
    setNodeGraphGraphPhaseHot(element, false);
    setNodeGraphGraphHotIndex(element, Number(drag.index));
  } else if (Number.isFinite(Number(element.dataset.hotIndex))) {
    setNodeGraphGraphPhaseHot(element, element.dataset.phaseHot === "true");
    setNodeGraphGraphHotIndex(element, Number(element.dataset.hotIndex));
  } else {
    clearNodeGraphGraphHotMarks(element);
    setNodeGraphGraphPhaseHot(element, element.dataset.phaseHot === "true");
  }
}

/** Clear per-node hot marks (nodes / contour rings). Phase line is separate. */
function clearNodeGraphGraphHotMarks(display) {
  if (!display) {
    return;
  }
  display.querySelectorAll(".is-hot").forEach((el) => el.classList.remove("is-hot"));
  display.dataset.hotIndex = "";
}

/** Phase probe: dim by default; full only when the phase hit is interactive-hot. */
function setNodeGraphGraphPhaseHot(display, hot) {
  if (!display) {
    return;
  }
  const on = Boolean(hot);
  display.dataset.phaseHot = on ? "true" : "false";
  display.querySelectorAll(".node-module-graph-cursor, .node-module-graph-cursor-value-guide").forEach((el) => {
    el.classList.toggle("is-phase-hot", on);
  });
}

function clearNodeGraphGraphPhaseHot(display) {
  setNodeGraphGraphPhaseHot(display, false);
}

/** Dim-highlight both boundaries of the step bar for segment ending at rightIndex. */
function setNodeGraphGraphStepBarHot(display, graph, rightIndex) {
  if (!display) {
    return;
  }
  const bar = nodeGraphGraphStepBarIndicesForSegment(graph, rightIndex);
  clearNodeGraphGraphHotMarks(display);
  display.dataset.hotIndex = String(nodeGraphGraphNodeIndexFromValue(graph, rightIndex));
  for (const barIndex of bar) {
    const key = String(barIndex);
    display.querySelectorAll(`[data-graph-node-index="${CSS.escape(key)}"]`).forEach((el) => {
      el.classList.add("is-hot");
    });
  }
  // Also light the empty-circle handle for this segment.
  display.querySelectorAll(
    `[data-graph-contour-index="${CSS.escape(String(nodeGraphGraphNodeIndexFromValue(graph, rightIndex)))}"]`,
  ).forEach((el) => {
    el.classList.add("is-hot");
  });
}

/**
 * Show only the dim filled node + its empty contour ring for one index.
 * No bright “selected” state — same dim whether idle-hover or drag.
 */
function setNodeGraphGraphHotIndex(display, index) {
  if (!display) {
    return;
  }
  const i = Math.round(Number(index));
  if (!Number.isFinite(i) || i < 0) {
    clearNodeGraphGraphHotMarks(display);
    return;
  }
  const key = String(i);
  if (
    display.dataset.hotIndex === key
    && display.querySelector(`.node-module-graph-node.is-hot[data-graph-node-index="${CSS.escape(key)}"]`)
  ) {
    // Already marked (avoid thrashing classList on every pointermove).
    return;
  }
  clearNodeGraphGraphHotMarks(display);
  display.dataset.hotIndex = key;
  display.querySelectorAll(`[data-graph-node-index="${CSS.escape(key)}"]`).forEach((el) => {
    el.classList.add("is-hot");
  });
  display.querySelectorAll(`[data-graph-contour-index="${CSS.escape(key)}"]`).forEach((el) => {
    el.classList.add("is-hot");
  });
}

function nodeGraphGraphHotIndexFromEventTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const contour = target.closest?.("[data-graph-contour-index]");
  if (contour) {
    const index = Number(contour.dataset.graphContourIndex);
    return Number.isFinite(index) ? index : null;
  }
  const node = target.closest?.("[data-graph-node-index]");
  if (node) {
    const index = Number(node.dataset.graphNodeIndex);
    return Number.isFinite(index) ? index : null;
  }
  return null;
}

function nodeGraphGraphPhaseHitFromEventTarget(target) {
  return target instanceof Element
    ? target.closest?.("[data-graph-cursor], .node-module-graph-cursor-hit")
    : null;
}

/**
 * Hover policy:
 *  • phase line stays dim unless pointer is on the phase hit (or scrubbing it)
 *  • only the node under the pointer (and its contour ring) is dim-visible
 */
function bindNodeGraphGraphFaceHover(display) {
  if (!display || display.dataset.graphHoverBound === "true") {
    return;
  }
  display.dataset.graphHoverBound = "true";
  display.addEventListener("pointermove", (event) => {
    const drag = nodeGraphMvp?.graphNodeDragging;
    const onThisFace = drag && (drag.display === display || drag.nodeId === display.dataset.graphNode);
    if (onThisFace) {
      if (drag.mode === "cursor") {
        clearNodeGraphGraphHotMarks(display);
        setNodeGraphGraphPhaseHot(display, true);
        return;
      }
      setNodeGraphGraphPhaseHot(display, false);
      if (Number.isFinite(Number(drag.index))) {
        setNodeGraphGraphHotIndex(display, drag.index);
      }
      return;
    }
    const onPhase = Boolean(nodeGraphGraphPhaseHitFromEventTarget(event.target));
    setNodeGraphGraphPhaseHot(display, onPhase);
    if (onPhase) {
      clearNodeGraphGraphHotMarks(display);
      return;
    }
    const contour = event.target?.closest?.("[data-graph-contour-index]");
    if (contour) {
      const rightIndex = Number(contour.dataset.graphContourIndex);
      const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
      const patchNode = nodeId ? nodeGraphPatchNode(nodeId) : null;
      const graph = patchNode ? nodeGraphGraphForNode(patchNode) : null;
      if (graph && Number.isFinite(rightIndex) && rightIndex > 0) {
        setNodeGraphGraphStepBarHot(display, graph, rightIndex);
        return;
      }
    }
    const index = nodeGraphGraphHotIndexFromEventTarget(event.target);
    if (index == null) {
      clearNodeGraphGraphHotMarks(display);
      return;
    }
    setNodeGraphGraphHotIndex(display, index);
  });
  display.addEventListener("pointerleave", () => {
    const drag = nodeGraphMvp?.graphNodeDragging;
    if (drag && (drag.display === display || drag.nodeId === display.dataset.graphNode)) {
      if (drag.mode === "cursor") {
        clearNodeGraphGraphHotMarks(display);
        setNodeGraphGraphPhaseHot(display, true);
        return;
      }
      setNodeGraphGraphPhaseHot(display, false);
      if (drag.mode === "stepBar" && Number.isFinite(Number(drag.index))) {
        setNodeGraphGraphStepBarHot(display, drag.graph, drag.index);
        return;
      }
      if (Number.isFinite(Number(drag.index))) {
        setNodeGraphGraphHotIndex(display, drag.index);
      }
      return;
    }
    clearNodeGraphGraphHotMarks(display);
    clearNodeGraphGraphPhaseHot(display);
  });
}

function nodeGraphGraphSmoothingModeForNode(patchNode) {
  // Step Graph / legacy graph: per-segment hold/shape path.
  if (nodeGraphGraphUsesPerNodeShapes(patchNode?.type)) {
    return "legacy";
  }
  // Smooth Graph: one global smoothing algorithm through the dots.
  return normalizeNodeGraphGraph2SmoothingMode(patchNode?.params?.smoothingMode);
}

function syncNodeGraphGraphElement(moduleElement, patchNode) {
  const graph = nodeGraphGraphForNode(patchNode);
  renderNodeGraphGraphDisplay(
    moduleElement?.querySelector?.(".node-module-graph-display"),
    graph,
    nodeGraphGraphSelectedNodeIndex(patchNode?.id || "", graph, 0),
    {
      smoothingMode: nodeGraphGraphSmoothingModeForNode(patchNode),
      stepCount: nodeGraphGraphStepCountForNode(patchNode),
      tension: Number(patchNode?.params?.tension) ?? 1,
    },
  );
}

function nodeGraphGraphNodeIdFromDisplay(display) {
  if (!display) {
    return "";
  }
  const fromParent = String(display.closest?.(".dsp-node")?.dataset?.node || "").trim();
  const fromDataset = String(display.dataset?.graphNode || "").trim();
  // Keep dataset aligned with the live parent so multi-display queries never
  // mismatch after a DOM rebuild.
  if (fromParent && fromDataset !== fromParent) {
    display.dataset.graphNode = fromParent;
  }
  return fromParent || fromDataset;
}

function syncNodeGraphGraphDisplaysForNode(nodeId, patchNode) {
  const id = String(nodeId || patchNode?.id || "").trim();
  if (!id) {
    return;
  }
  // Never paint another module's face while a different graph is mid-drag.
  // That was one path that made Step Graph flicker to a flat 0→0 guide line
  // while Smooth Graph control points were being moved.
  const activeDrag = nodeGraphMvp?.graphNodeDragging;
  if (activeDrag?.nodeId && activeDrag.nodeId !== id) {
    return;
  }
  const owner = patchNode && String(patchNode.id || "").trim() === id
    ? patchNode
    : (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : patchNode);
  const graph = nodeGraphGraphForNode(owner);
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(id, graph, 0);
  const renderOptions = {
    smoothingMode: nodeGraphGraphSmoothingModeForNode(owner),
    stepCount: nodeGraphGraphStepCountForNode(owner),
    tension: Number(owner?.params?.tension) ?? 1,
  };
  // Prefer the live module under #nodeGraphNodes (not camera clones / stale copies).
  const primary = typeof nodeGraphGraphLiveDisplayForNodeId === "function"
    ? nodeGraphGraphLiveDisplayForNodeId(id)
    : null;
  if (primary) {
    renderNodeGraphGraphDisplay(primary, graph, selectedIndex, renderOptions);
    return;
  }
  document
    .querySelectorAll(".node-module-graph-display")
    .forEach((display) => {
      if (nodeGraphGraphNodeIdFromDisplay(display) === id) {
        renderNodeGraphGraphDisplay(display, graph, selectedIndex, renderOptions);
      }
    });
}

function nodeGraphGraphDisplayFromEventTarget(target) {
  return target?.closest?.(".node-module-graph-display") || null;
}

// Resolves the CURRENT, live .node-module-graph-display for a node id by
// querying the document fresh (same approach as syncNodeGraphGraphDisplaysForNode),
// instead of trusting a display reference captured earlier in an event
// handler. applyNodeGraphPatchToDom() can remove+recreate a node's whole DOM
// subtree when a structural signature changes (see its element.remove()
// path), which silently detaches any previously-captured display/svg
// element -- a detached element's getBoundingClientRect() is permanently
// zero, so any drag math built on it collapses to {x: 0, y: 0} forever and
// setPointerCapture throws InvalidStateError. Re-resolving by id sidesteps
// that regardless of why the earlier reference went stale.
function nodeGraphGraphLiveDisplayForNodeId(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return null;
  }
  // Scope to the real workspace tree so camera/minimap clones with the same
  // data-node id cannot steal re-resolve during a drag.
  const workspaceRoot = document.getElementById("nodeGraphNodes")
    || document.getElementById("nodeGraphWorkspace");
  const scope = workspaceRoot || document;
  const article = scope.querySelector?.(`.dsp-node[data-node="${CSS.escape(id)}"]`)
    || (typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(id) : null);
  return article?.querySelector?.(".node-module-graph-display") || null;
}

function nodeGraphGraphNodeCircleFromEventTarget(target) {
  return target?.closest?.(".node-module-graph-node, .node-module-graph-node-hit") || null;
}

function nodeGraphGraphContourHandleFromEventTarget(target) {
  return target?.closest?.(".node-module-graph-contour-handle") || null;
}

// Clamps a single node's target position without touching order: the first
// and last node are pinned to x=0/x=1 (an envelope always spans the full
// width -- only their y moves), and every other node is bounded strictly
// between its CURRENT neighbors (read from `nodes` before this node moves).
function nodeGraphGraphClampedNodeTarget(nodes, index, point) {
  const lastIndex = nodes.length - 1;
  if (index <= 0) {
    return { x: 0, y: normalizeNodeGraphGraphNumber(point.y, nodes[0]?.y ?? 0) };
  }
  if (index >= lastIndex) {
    return { x: 1, y: normalizeNodeGraphGraphNumber(point.y, nodes[lastIndex]?.y ?? 0) };
  }
  const margin = 0.001;
  const minX = normalizeNodeGraphGraphNumber(nodes[index - 1]?.x, 0) + margin;
  const maxX = normalizeNodeGraphGraphNumber(nodes[index + 1]?.x, 1) - margin;
  return {
    x: normalizeNodeGraphGraphNumber(point.x, nodes[index]?.x ?? 0, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: normalizeNodeGraphGraphNumber(point.y, nodes[index]?.y ?? 0),
  };
}

// Moves the node at `index` toward `point`, then re-sorts by x and reports
// the node's new index by RE-LOCATING it (counting how many nodes now sit
// to its left) instead of reusing the old index number.
//
// This is the fix for nodes randomly snapping to x=0/x=1 and "disappearing"
// mid-drag: the previous code kept mutating `drag.index` as a plain integer
// across every render, and after `normalizeNodeGraphGraph` re-sorts the
// array, `nodeGraphGraphNodeIndexFromValue` only clamps that stale integer
// back into range -- it doesn't check whether it still points at the same
// node. Once it silently pointed at a different node, that node could be
// the true endpoint (hard-locked to x=0/x=1 above), which is exactly the
// "flies to the edge" symptom. Since the clamp above already guarantees
// this node can't cross a neighbor, counting neighbors-to-the-left gives
// its exact post-sort position with no ambiguity.
function nodeGraphGraphMoveNode(graphValue, index, point) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const sourceIndex = nodeGraphGraphNodeIndexFromValue(graph, index);
  const nodes = graph.nodes;
  const target = nodeGraphGraphClampedNodeTarget(nodes, sourceIndex, point);
  const moved = normalizeNodeGraphGraphNode({ ...nodes[sourceIndex], ...target }, sourceIndex);
  const remaining = nodes.slice(0, sourceIndex).concat(nodes.slice(sourceIndex + 1));
  let insertAt = 0;
  while (insertAt < remaining.length && remaining[insertAt].x <= moved.x) {
    insertAt += 1;
  }
  remaining.splice(insertAt, 0, moved);
  return {
    graph: normalizeNodeGraphGraph({ ...graph, nodes: remaining }),
    index: insertAt,
  };
}

// Small helper so graph-drag tracing goes through the app's own in-app debug
// console (window.SE, see node-graph-debug-console.js -- the red bug button
// panel) instead of a separate ad hoc logging channel. No-ops harmlessly if
// SE isn't present (e.g. debug console script missing) or dev mode is off;
// SE.INFO entries only show up in the panel once it/dev mode is opened.
function nodeGraphGraphDebugTrace(msg, data) {
  if (typeof window === "undefined" || !window.SE?.INFO) {
    return;
  }
  window.SE.INFO(data === undefined ? msg : `${msg} ${nodeGraphGraphDebugStringify(data)}`);
}

function nodeGraphGraphDebugStringify(value) {
  try {
    return JSON.stringify(value, (key, v) => {
      if (v instanceof Element) {
        return `<${v.tagName.toLowerCase()}${v.className ? `.${String(v.className).replace(/\s+/g, ".")}` : ""}>`;
      }
      return v;
    });
  } catch (_error) {
    return String(value);
  }
}

function beginNodeGraphGraphNodeDrag(event) {
  nodeGraphGraphDebugTrace("graph pointerdown", {
    target: event.target?.className,
    button: event.button,
    detail: event.detail,
  });
  if (event.button !== undefined && event.button !== 0) {
    nodeGraphGraphDebugTrace("graph pointerdown ignored, non-primary button", event.button);
    return;
  }
  // Only graph module faces handle these gestures.
  const display = nodeGraphGraphDisplayFromEventTarget(event.target);
  if (!display) {
    return;
  }
  // Contour handles first (Step Graph empty circles) — not add/remove targets.
  const contourHandle = nodeGraphGraphContourHandleFromEventTarget(event.target);
  if (contourHandle) {
    if (Number(event.detail) >= 2) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    beginNodeGraphGraphContourDrag(event, contourHandle);
    return;
  }

  // Multi-click (2+): perform add/remove here. Relying on the synthetic
  // `dblclick` event is fragile — preventDefault on the first pointerdown and
  // a no-move commit (which re-renders the SVG) both prevent dblclick from
  // firing, or make the second click miss the original hit target.
  if (Number(event.detail) >= 2) {
    event.preventDefault();
    event.stopPropagation();
    // Cancel any drag started on the first click of this multi-click.
    if (nodeGraphMvp.graphNodeDragging) {
      nodeGraphMvp.graphNodeDragging.display?.classList.remove("dragging");
      nodeGraphMvp.graphNodeDragging = null;
    }
    const multiCircle = nodeGraphGraphNodeCircleFromEventTarget(event.target);
    if (multiCircle) {
      const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
      const patchNode = nodeGraphPatchNode(nodeId);
      if (patchNode && nodeGraphModuleIsGraphType(patchNode.type)) {
        const graph = nodeGraphGraphForNode(patchNode);
        const index = nodeGraphGraphNodeIndexFromValue(graph, multiCircle.dataset.graphNodeIndex);
        nodeGraphGraphDebugTrace("graph multi-click on point, removing", { nodeId, index });
        removeNodeGraphGraphNodeAtIndex(nodeId, index);
      }
      return;
    }
    nodeGraphGraphDebugTrace("graph multi-click on empty face, adding point");
    addNodeGraphGraphNodeFromDisplayEvent(event, { startDrag: false });
    return;
  }

  // Gestures (phase policy matches XY pad):
  //   • drag empty face / cursor → relative phase scrub (must actually drag)
  //   • alt+click / alt-drag empty face → absolute jump playhead to pointer
  //   • click-drag control point → move that point
  //   • Step Graph: drag empty-circle contour handle → per-node curvature
  //   • double-click empty → add point
  //   • double-click point → remove point
  const circle = nodeGraphGraphNodeCircleFromEventTarget(event.target);
  if (circle) {
    // Alt on a control point still jumps the playhead (same as empty face).
    // Point removal is double-click only.
    if (event.altKey) {
      nodeGraphGraphDebugTrace("graph alt+click on point, absolute phase jump");
      beginNodeGraphGraphCursorDrag(event, event.target, { absolute: true });
      return;
    }
    const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
    const patchNode = nodeGraphPatchNode(nodeId);
    if (!patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
      nodeGraphGraphDebugTrace("graph pointerdown bailing, patchNode/type check failed", {
        nodeId,
        type: patchNode?.type,
      });
      return;
    }
    const graph = nodeGraphGraphForNode(patchNode);
    const index = nodeGraphGraphNodeIndexFromValue(graph, circle.dataset.graphNodeIndex);
    const svg = circle.closest(".node-module-graph-svg");
    const startNode = graph.nodes[index] || { x: 0, y: 0 };
    display?.focus?.({ preventScroll: true });
    setNodeGraphGraphSelectedNodeIndex(nodeId, graph, index);
    nodeGraphMvp.graphNodeDragging = {
      display,
      graph,
      index,
      nodeId,
      pointerId: event.pointerId ?? null,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startNodeX: Number(startNode.x) || 0,
      startNodeY: Number(startNode.y) || 0,
      // Incremental drag anchors (updated every move) so clamping never builds
      // pointer "debt" — reverse motion off a limit moves the point immediately.
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastNodeX: Number(startNode.x) || 0,
      lastNodeY: Number(startNode.y) || 0,
      fineActive: false,
      moved: false,
      svg,
    };
    nodeGraphGraphDebugTrace("graph started dragging existing node", { nodeId, index });
    display?.classList.add("dragging");
    setNodeGraphGraphHotIndex(display, index);
    circle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // Empty face / cursor line: relative phase drag, or alt = absolute jump.
  const absolutePhase = Boolean(event.altKey);
  nodeGraphGraphDebugTrace(
    absolutePhase
      ? "graph pointerdown empty face, absolute phase jump (alt)"
      : "graph pointerdown empty face, relative phase drag",
  );
  beginNodeGraphGraphCursorDrag(event, event.target, { absolute: absolutePhase });
}

function handleNodeGraphGraphNodeContextMenu(event) {
  const circle = nodeGraphGraphNodeCircleFromEventTarget(event.target);
  if (!circle) {
    return;
  }
  const display = nodeGraphGraphDisplayFromEventTarget(circle);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return;
  }
  const graph = nodeGraphGraphForNode(patchNode);
  const index = nodeGraphGraphNodeIndexFromValue(graph, circle.dataset.graphNodeIndex);
  display?.focus?.({ preventScroll: true });
  removeNodeGraphGraphNodeAtIndex(nodeId, index);
  event.preventDefault();
  event.stopImmediatePropagation();
}

// Double-click empty face → add point. Double-click a control point → remove.
// Always claim the event on the graph face so the solid-shell handler cannot
// steal it and open Module Settings.
function handleNodeGraphGraphNodeDoubleClick(event) {
  const display = nodeGraphGraphDisplayFromEventTarget(event.target);
  if (!display) {
    return;
  }
  // Claim before any early return so shell dblclick never opens settings.
  event.preventDefault();
  event.stopPropagation();
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return;
  }
  display?.focus?.({ preventScroll: true });
  const circle = nodeGraphGraphNodeCircleFromEventTarget(event.target);
  if (circle) {
    const graph = nodeGraphGraphForNode(patchNode);
    const index = nodeGraphGraphNodeIndexFromValue(graph, circle.dataset.graphNodeIndex);
    nodeGraphGraphDebugTrace("graph dblclick on point, removing", { nodeId, index });
    removeNodeGraphGraphNodeAtIndex(nodeId, index);
    return;
  }
  nodeGraphGraphDebugTrace("graph dblclick on empty face, adding point");
  addNodeGraphGraphNodeFromDisplayEvent(event, { startDrag: false });
}

/**
 * Phase / playhead scrub on the graph face.
 * - relative (default): pointerdown does not move the playhead; only drag deltas do
 *   (same “must actually drag” policy as the XY pad’s relative mode).
 * - absolute (alt): jump playhead to the pointer X immediately.
 * @param {PointerEvent} event
 * @param {Element} [sourceElement]
 * @param {{ absolute?: boolean }} [options]
 */
function beginNodeGraphGraphCursorDrag(event, sourceElement, options = {}) {
  const display = nodeGraphGraphDisplayFromEventTarget(sourceElement || event.target);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!display || !patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return;
  }
  const svg = display.querySelector(".node-module-graph-svg")
    || sourceElement?.closest?.(".node-module-graph-svg")
    || null;
  if (!svg) {
    return;
  }
  const graph = nodeGraphGraphForNode(patchNode);
  const absolute = options.absolute === true || Boolean(event.altKey);
  display?.focus?.({ preventScroll: true });
  const startCursorX = Number(graph.cursorX) || 0;
  nodeGraphMvp.graphNodeDragging = {
    absolute,
    display,
    graph,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    lastCursorX: startCursorX,
    mode: "cursor",
    moved: false,
    nodeId,
    pointerId: event.pointerId ?? null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startCursorX,
    svg,
  };
  display?.classList.add("dragging");
  clearNodeGraphGraphHotMarks(display);
  setNodeGraphGraphPhaseHot(display, true);
  // Prefer the cursor hit line for capture; fall back to the svg so empty-face
  // phase scrub still keeps the pointer bound while the display re-renders.
  const captureTarget = display.querySelector("[data-graph-cursor]") || svg || display;
  try {
    captureTarget.setPointerCapture?.(event.pointerId);
  } catch (_error) {
    // Drag still tracks via document-level pointermove.
  }
  // Absolute (alt): place under the pointer now. Relative: wait for a real drag.
  if (absolute) {
    dragNodeGraphGraphNode(event);
  }
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Add a control point under the pointer.
 * @param {Event} event
 * @param {{ startDrag?: boolean }} [options] When startDrag is true (legacy
 *   click-to-add path), continue into a point drag on the new node. Double-click
 *   add uses startDrag: false so the point drops where you clicked.
 * @returns {boolean}
 */
function addNodeGraphGraphNodeFromDisplayEvent(event, options = {}) {
  const startDrag = options.startDrag === true;
  const svg = event.target?.closest?.(".node-module-graph-svg")
    || nodeGraphGraphDisplayFromEventTarget(event.target)?.querySelector?.(".node-module-graph-svg");
  if (!svg) {
    nodeGraphGraphDebugTrace("add-node bailing, click target isn't inside a graph svg", event.target?.className);
    return false;
  }
  const display = nodeGraphGraphDisplayFromEventTarget(event.target) || svg.closest?.(".node-module-graph-display");
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!display || !patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    nodeGraphGraphDebugTrace("add-node bailing, display/patchNode/type check failed", { nodeId, type: patchNode?.type });
    return false;
  }
  display?.focus?.({ preventScroll: true });
  const point = nodeGraphGraphSvgToGraphPoint(svg, event.clientX, event.clientY);
  nodeGraphGraphDebugTrace("add-node computed graph point", point);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    nodeGraphGraphDebugTrace("add-node bailing, targetNode/type check failed", { nodeId });
    return false;
  }
  // Step Graph: snap new boundaries to the step grid and use hold segments.
  const stepCount = nodeGraphGraphStepCountForNode(targetNode);
  const isStep = nodeGraphGraphIsStepGraphType(targetNode.type);
  const placePoint = isStep
    ? {
      x: stepCount > 0 ? nodeGraphGraphSnapXToStepGrid(point.x, stepCount) : point.x,
      y: point.y,
      shape: "hold",
    }
    : point;
  const addition = addNodeGraphGraphNodeData(targetNode.graph, placePoint);
  if (!addition.added) {
    nodeGraphGraphDebugTrace("add-node refused (32-node cap?)", addition);
    return false;
  }
  // New step boundary: apply bar height so the new plateau matches the click Y.
  let nextGraph = addition.graph;
  if (isStep) {
    nextGraph = nodeGraphGraphApplyStepBarHeight(addition.graph, addition.selectedIndex, placePoint.y);
  }
  nodeGraphGraphDebugTrace("add-node added", { selectedIndex: addition.selectedIndex, selectedX: addition.selectedX });
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(nextGraph, addition.selectedIndex)
    : nextGraph;
  // Keep params.phase / cream phase line where they were; adding a point is
  // not a phase scrub.
  commitNodeGraphPatch(patch, { status: "graph node added" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, addition.selectedIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  syncNodeGraphGraphControls(targetNode.graph, addition.selectedIndex, { nodeId });

  if (!startDrag) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  // Optional: pick up drag on the new point (legacy single-click add path).
  // commit/sync can rebuild the DOM — re-resolve the live display by node id.
  const liveDisplay = nodeGraphGraphLiveDisplayForNodeId(nodeId) || display;
  const newSvg = liveDisplay.querySelector(".node-module-graph-svg");
  const newHit = newSvg?.querySelector(
    `.node-module-graph-node-hit[data-graph-node-index="${addition.selectedIndex}"]`,
  );
  nodeGraphMvp.graphNodeDragging = {
    display: liveDisplay,
    graph: targetNode.graph,
    index: addition.selectedIndex,
    nodeId,
    svg: newSvg,
  };
  nodeGraphGraphDebugTrace("add-node picked up drag on freshly added node", {
    foundNewHit: Boolean(newHit),
    index: addition.selectedIndex,
  });
  liveDisplay?.classList.add("dragging");
  try {
    newHit?.setPointerCapture?.(event.pointerId);
  } catch (_error) {
    nodeGraphGraphDebugTrace("add-node setPointerCapture on new node threw", String(_error));
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

// renderNodeGraphGraphDisplay() fully replaces the display's children every
// frame (element.replaceChildren()), which destroys whichever circle/line
// currently holds pointer capture from the pointerdown that started this
// drag. Per the Pointer Events spec, capture is silently released the
// instant its element leaves the DOM -- so after the FIRST pointermove of
// any graph drag, capture was gone: later moves still updated drag.* state
// correctly (this listener reads event.clientX/Y, not event.target), but
// the browser was free to route real hit-testing to whatever now sits under
// the pointer instead of the (rebuilt) hit target. Fast pointer motion could
// land on a neighboring node, the workspace pan/marquee layer, or another
// module's controls, which is what made dragging a graph dot feel like it
// "disappeared" mid-move. Re-acquiring capture on the freshly rendered
// element after every rebuild keeps the pointer bound to this drag for its
// whole lifetime, matching what a single, never-destroyed drag handle would
// have done.
function reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event) {
  if (!drag?.svg || event?.pointerId === undefined) {
    return;
  }
  const selector = drag.mode === "cursor"
    ? "[data-graph-cursor]"
    : (drag.mode === "contour" || drag.mode === "stepBar")
      ? `.node-module-graph-contour-handle[data-graph-contour-index="${drag.index}"]`
      : `.node-module-graph-node-hit[data-graph-node-index="${drag.index}"]`;
  const target = drag.svg.querySelector(selector) || (drag.mode === "cursor" ? drag.svg : null);
  try {
    target?.setPointerCapture?.(event.pointerId);
  } catch (_error) {
    // Ignore -- worst case capture stays released for this frame and the
    // next pointermove will try again.
  }
}

/**
 * Step Graph empty-circle handle:
 *  • normal drag = raise/lower the step bar (left + right boundary Y, relative)
 *  • Shift drag = per-segment contour / curve bend
 */
function beginNodeGraphGraphContourDrag(event, contourHandle) {
  const display = nodeGraphGraphDisplayFromEventTarget(contourHandle || event.target);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!display || !patchNode || !nodeGraphGraphShowsContourHandles(patchNode)) {
    return;
  }
  const svg = contourHandle?.closest?.(".node-module-graph-svg")
    || display.querySelector(".node-module-graph-svg");
  if (!svg) {
    return;
  }
  const graph = nodeGraphGraphForNode(patchNode);
  const index = nodeGraphGraphNodeIndexFromValue(graph, contourHandle?.dataset?.graphContourIndex);
  if (index <= 0) {
    return;
  }
  display?.focus?.({ preventScroll: true });
  setNodeGraphGraphSelectedNodeIndex(nodeId, graph, index);
  const left = graph.nodes[index - 1] || { y: 0 };
  const right = graph.nodes[index] || { c: 0, shape: "hold", y: 0 };
  const pointer = nodeGraphGraphSvgToGraphPoint(svg, event.clientX, event.clientY);
  // Shift = contour curve; otherwise step-bar height.
  const contourMode = Boolean(event.shiftKey);
  nodeGraphMvp.graphNodeDragging = {
    barStartLeftY: Number(left.y) || 0,
    barStartPointerY: Number(pointer.y) || 0,
    barStartRightY: Number(right.y) || 0,
    display,
    graph,
    index,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    lastContour: Number(right.c) || 0,
    mode: contourMode ? "contour" : "stepBar",
    moved: false,
    nodeId,
    pointerId: event.pointerId ?? null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    svg,
  };
  display?.classList.add("dragging");
  if (contourMode) {
    setNodeGraphGraphHotIndex(display, index);
  } else {
    setNodeGraphGraphStepBarHot(display, graph, index);
  }
  try {
    contourHandle?.setPointerCapture?.(event.pointerId);
  } catch (_error) {
    // Synthetic pointer events may not own capture.
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphGraphNode(event) {
  const drag = nodeGraphMvp.graphNodeDragging;
  if (!drag?.svg || !drag?.display) {
    return;
  }
  // Always re-pin to the live workspace face for this node id. Prevents a
  // stale/wrong display reference (detached node, camera clone, or another
  // graph module) from receiving drag paints meant for the active module.
  {
    const liveDisplay = nodeGraphGraphLiveDisplayForNodeId(drag.nodeId);
    if (!liveDisplay) {
      return;
    }
    drag.display = liveDisplay;
    drag.svg = liveDisplay.querySelector(".node-module-graph-svg") || drag.svg;
  }
  if (!drag.svg) {
    return;
  }
  const dragPatchNode = nodeGraphPatchNode(drag.nodeId);
  const smoothingMode = nodeGraphGraphSmoothingModeForNode(dragPatchNode);
  const tension = Number(dragPatchNode?.params?.tension) ?? 1;
  const stepCount = nodeGraphGraphStepCountForNode(dragPatchNode);
  const screenDelta = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(
      Number(drag.lastClientX ?? drag.startClientX) || event.clientX,
      Number(drag.lastClientY ?? drag.startClientY) || event.clientY,
      event.clientX,
      event.clientY,
    )
    : {
      horizontal: event.clientX - (Number(drag.lastClientX ?? drag.startClientX) || event.clientX),
      vertical: (Number(drag.lastClientY ?? drag.startClientY) || event.clientY) - event.clientY,
      combined: 0,
    };
  if (!Number.isFinite(screenDelta.combined)) {
    screenDelta.combined = screenDelta.horizontal + screenDelta.vertical;
  }
  if (
    typeof nodeGraphPointerDragExceededMoveThreshold === "function"
      ? nodeGraphPointerDragExceededMoveThreshold(drag.startClientX, drag.startClientY, event.clientX, event.clientY, 1)
      : (Math.abs(event.clientX - drag.startClientX) > 1 || Math.abs(event.clientY - drag.startClientY) > 1)
  ) {
    drag.moved = true;
  }
  // Alt held mid-drag switches to absolute jump-to-pointer (like XY pad absolute).
  if (event.altKey) {
    drag.absolute = true;
  }
  nodeGraphGraphDebugTrace("graph pointermove", {
    mode: drag.mode,
    index: drag.index,
    absolute: drag.absolute,
    moved: drag.moved,
    screenDelta,
  });
  if (drag.mode === "cursor") {
    // Relative: ignore until the pointer actually moves (plain click keeps phase).
    if (!drag.absolute && !drag.moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    let nextCursorX;
    if (drag.absolute) {
      // Alt: jump phase to pointer X on the plot (absolute placement).
      nextCursorX = nodeGraphGraphSvgToGraphPoint(drag.svg, event.clientX, event.clientY).x;
    } else {
      // Relative phase uses the same diagonal 1D policy as sliders: right+up
      // increases, left+down decreases (not horizontal-only).
      if (!Number.isFinite(Number(drag.lastClientX))) {
        drag.lastClientX = Number(drag.startClientX) || event.clientX;
        drag.lastClientY = Number(drag.startClientY) || event.clientY;
        drag.lastCursorX = Number.isFinite(Number(drag.startCursorX))
          ? Number(drag.startCursorX)
          : (Number(drag.graph?.cursorX) || 0);
      }
      const unitPerPx = nodeGraphGraphDragUnitPerPixel(drag.svg);
      const mult = nodeGraphGraphPointDragMultiplier(event);
      const lastCursorX = Number.isFinite(Number(drag.lastCursorX))
        ? Number(drag.lastCursorX)
        : (Number(drag.graph?.cursorX) || 0);
      const frameDelta = typeof nodeGraphPointerDragScreenDelta === "function"
        ? nodeGraphPointerDragScreenDelta(drag.lastClientX, drag.lastClientY, event.clientX, event.clientY)
        : screenDelta;
      nextCursorX = lastCursorX + frameDelta.combined * unitPerPx * mult;
    }
    nextCursorX = Math.max(0, Math.min(1, Number.isFinite(nextCursorX) ? nextCursorX : 0));
    drag.graph = normalizeNodeGraphGraph({
      ...drag.graph,
      cursorX: nextCursorX,
    });
    // Frame-to-frame anchors: no drag debt at 0/1 phase limits.
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    drag.lastCursorX = nextCursorX;
    syncNodeGraphGraphPhaseSliderForNode(drag.nodeId, drag.graph.cursorX);
    renderNodeGraphGraphDisplay(drag.display, drag.graph, null, { smoothingMode, stepCount, tension });
    // Panel fields only — face is owned by this drag loop. A second face
    // paint via syncNodeGraphGraphControls used nodeGraphNodeElement() which
    // can hit the wrong module and flatten another graph's curve mid-drag.
    if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
      syncNodeGraphGraphControls(drag.graph, undefined, { nodeId: drag.nodeId, face: false });
    }
    drag.svg = drag.display.querySelector(".node-module-graph-svg");
    reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // Step Graph empty-circle: step-bar height (relative Y on left+right ends).
  if (drag.mode === "stepBar") {
    if (
      typeof nodeGraphPointerDragExceededMoveThreshold === "function"
        ? nodeGraphPointerDragExceededMoveThreshold(drag.startClientX, drag.startClientY, event.clientX, event.clientY, 1)
        : (Math.abs(event.clientX - drag.startClientX) > 1 || Math.abs(event.clientY - drag.startClientY) > 1)
    ) {
      drag.moved = true;
    }
    const pointer = nodeGraphGraphSvgToGraphPoint(drag.svg, event.clientX, event.clientY);
    const startPointerY = Number.isFinite(Number(drag.barStartPointerY))
      ? Number(drag.barStartPointerY)
      : pointer.y;
    const deltaY = pointer.y - startPointerY;
    drag.graph = nodeGraphGraphApplyStepBarHeightDelta(
      drag.graph,
      drag.index,
      drag.barStartLeftY,
      drag.barStartRightY,
      deltaY,
    );
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    setNodeGraphGraphSelectedNodeIndex(drag.nodeId, drag.graph, drag.index);
    renderNodeGraphGraphDisplay(drag.display, drag.graph, drag.index, { smoothingMode, stepCount, tension });
    if (drag.display) {
      setNodeGraphGraphStepBarHot(drag.display, drag.graph, drag.index);
    }
    if (typeof scheduleNodeGraphLiveGraphData === "function") {
      scheduleNodeGraphLiveGraphData(drag.nodeId, drag.graph);
    }
    if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
      syncNodeGraphGraphControls(drag.graph, drag.index, { nodeId: drag.nodeId, face: false });
    }
    drag.svg = drag.display.querySelector(".node-module-graph-svg");
    reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // Step Graph empty-circle + Shift: per-segment curvature (`c`).
  if (drag.mode === "contour") {
    if (
      typeof nodeGraphPointerDragExceededMoveThreshold === "function"
        ? nodeGraphPointerDragExceededMoveThreshold(drag.startClientX, drag.startClientY, event.clientX, event.clientY, 1)
        : (Math.abs(event.clientX - drag.startClientX) > 1 || Math.abs(event.clientY - drag.startClientY) > 1)
    ) {
      drag.moved = true;
    }
    const point = nodeGraphGraphSvgToGraphPoint(drag.svg, event.clientX, event.clientY);
    const nodes = [...(drag.graph.nodes || [])];
    const current = nodes[drag.index] || normalizeNodeGraphGraphNode({}, drag.index);
    nodes[drag.index] = normalizeNodeGraphGraphNode({
      ...current,
      c: nodeGraphGraphContourFromPoint(drag.graph, drag.index, point),
      shape: nodeGraphGraphContourEditableShape(current.shape),
    }, drag.index);
    drag.graph = normalizeNodeGraphGraph({ ...drag.graph, nodes });
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    drag.lastContour = Number(drag.graph.nodes[drag.index]?.c) || 0;
    setNodeGraphGraphSelectedNodeIndex(drag.nodeId, drag.graph, drag.index);
    renderNodeGraphGraphDisplay(drag.display, drag.graph, drag.index, { smoothingMode, stepCount, tension });
    if (typeof scheduleNodeGraphLiveGraphData === "function") {
      scheduleNodeGraphLiveGraphData(drag.nodeId, drag.graph);
    }
    if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
      syncNodeGraphGraphControls(drag.graph, drag.index, { nodeId: drag.nodeId, face: false });
    }
    drag.svg = drag.display.querySelector(".node-module-graph-svg");
    reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // Filled control-point drag.
  // Smooth Graph: free delta motion (Shift = fine).
  // Step Graph:
  //   • normal = snap X to step grid, free Y (single boundary)
  //   • Ctrl/Cmd = free single-point (no snap)
  const currentNode = drag.graph?.nodes?.[drag.index] || { x: 0, y: 0 };
  if (!Number.isFinite(Number(drag.lastClientX)) || !Number.isFinite(Number(drag.lastClientY))) {
    drag.lastClientX = Number(drag.startClientX) || event.clientX;
    drag.lastClientY = Number(drag.startClientY) || event.clientY;
    drag.lastNodeX = Number(currentNode.x) || 0;
    drag.lastNodeY = Number(currentNode.y) || 0;
  }
  const fine = Boolean(event.shiftKey);
  const isStepGraph = nodeGraphGraphIsStepGraphType(dragPatchNode?.type);
  const freePoint = Boolean(event.ctrlKey || event.metaKey);
  const stepSnapMode = isStepGraph && !freePoint;
  if (
    fine !== Boolean(drag.fineActive)
    || stepSnapMode !== Boolean(drag.stepSnapActive)
    || freePoint !== Boolean(drag.stepFreeActive)
  ) {
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    drag.lastNodeX = Number(currentNode.x) || 0;
    drag.lastNodeY = Number(currentNode.y) || 0;
    drag.fineActive = fine;
    drag.stepSnapActive = stepSnapMode;
    drag.stepFreeActive = freePoint;
  }

  let moved;
  if (isStepGraph && (stepSnapMode || freePoint)) {
    // Absolute under pointer; snap X only in normal (non-Ctrl) step mode.
    // Y is never quantized — free height for a single boundary if needed.
    const absolute = nodeGraphGraphSvgToGraphPoint(drag.svg, event.clientX, event.clientY);
    let x = absolute.x;
    if (stepSnapMode && stepCount > 0) {
      x = nodeGraphGraphSnapXToStepGrid(x, stepCount);
    }
    moved = nodeGraphGraphMoveNode(drag.graph, drag.index, { x, y: absolute.y });
  } else {
    // Smooth Graph: delta free drag with optional Shift-fine.
    const mult = nodeGraphGraphPointDragMultiplier(event);
    const unitPerPx = nodeGraphGraphDragUnitPerPixel(drag.svg);
    const frameDelta = typeof nodeGraphPointerDragScreenDelta === "function"
      ? nodeGraphPointerDragScreenDelta(drag.lastClientX, drag.lastClientY, event.clientX, event.clientY)
      : screenDelta;
    const lastNodeX = Number.isFinite(Number(drag.lastNodeX))
      ? Number(drag.lastNodeX)
      : (Number(currentNode.x) || 0);
    const lastNodeY = Number.isFinite(Number(drag.lastNodeY))
      ? Number(drag.lastNodeY)
      : (Number(currentNode.y) || 0);
    moved = nodeGraphGraphMoveNode(drag.graph, drag.index, {
      x: lastNodeX + frameDelta.horizontal * unitPerPx * mult,
      y: lastNodeY + frameDelta.vertical * unitPerPx * mult,
    });
  }

  drag.graph = nodeGraphGraphEndpointYLockEnabledForNode(dragPatchNode)
    ? nodeGraphGraphWithLockedEndpointY(moved.graph, moved.index)
    : moved.graph;
  drag.index = moved.index;
  const resultNode = drag.graph?.nodes?.[drag.index] || currentNode;
  drag.lastClientX = event.clientX;
  drag.lastClientY = event.clientY;
  drag.lastNodeX = Number(resultNode.x) || 0;
  drag.lastNodeY = Number(resultNode.y) || 0;
  nodeGraphGraphDebugTrace("graph node moved", {
    newIndex: drag.index,
    nodeCount: drag.graph.nodes.length,
    fine,
    stepSnapMode,
    freePoint,
    stepCount,
  });
  setNodeGraphGraphSelectedNodeIndex(drag.nodeId, drag.graph, drag.index);
  renderNodeGraphGraphDisplay(drag.display, drag.graph, drag.index, { smoothingMode, stepCount, tension });
  if (typeof scheduleNodeGraphLiveGraphData === "function") {
    scheduleNodeGraphLiveGraphData(drag.nodeId, drag.graph);
  }
  if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
    syncNodeGraphGraphControls(drag.graph, drag.index, { nodeId: drag.nodeId, face: false });
  }
  drag.svg = drag.display.querySelector(".node-module-graph-svg");
  reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphGraphNodeDrag(event) {
  const drag = nodeGraphMvp.graphNodeDragging;
  if (!drag) {
    // Bound on `document` (node-graph-scene-menu-event-bindings.js), so this
    // runs on EVERY pointerup/pointercancel anywhere in the app -- clicking a
    // button, closing a menu, releasing a slider. "No active graph drag" is
    // the overwhelmingly normal case, not an anomaly, so tracing it just
    // floods the debug console and buries the traces that matter.
    return;
  }
  nodeGraphGraphDebugTrace("graph pointerup", {
    nodeId: drag.nodeId,
    index: drag.index,
    mode: drag.mode,
    absolute: drag.absolute,
    moved: drag.moved,
  });
  drag.display?.classList.remove("dragging");
  nodeGraphMvp.graphNodeDragging = null;
  // After drag ends, re-evaluate hover from the release target (or clear).
  if (drag.display) {
    const onPhase = Boolean(nodeGraphGraphPhaseHitFromEventTarget(event.target));
    setNodeGraphGraphPhaseHot(drag.display, onPhase);
    const hot = onPhase ? null : nodeGraphGraphHotIndexFromEventTarget(event.target);
    if (hot == null) {
      clearNodeGraphGraphHotMarks(drag.display);
    } else {
      setNodeGraphGraphHotIndex(drag.display, hot);
    }
  }

  // Click with no movement: do not commit. A no-op commit re-renders the SVG
  // and destroys hit targets under the pointer, which breaks double-click
  // remove (second click misses the original point / never sees detail>=2).
  if (!drag.moved && !(drag.mode === "cursor" && drag.absolute)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === drag.nodeId);
  if (nodeGraphModuleIsGraphType(targetNode?.type)) {
    targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
      ? nodeGraphGraphWithLockedEndpointY(drag.graph, drag.index ?? 0)
      : normalizeNodeGraphGraph(drag.graph);
    if (drag.mode === "cursor") {
      syncNodeGraphGraphPhaseParameterFromCursor(targetNode);
    }
    const status = drag.mode === "cursor"
      ? (drag.absolute ? "graph cursor jumped" : "graph cursor moved")
      : drag.mode === "stepBar"
        ? "graph step moved"
        : drag.mode === "contour"
          ? "graph curve changed"
          : "graph node moved";
    commitNodeGraphPatch(patch, { status });
    const selectedIndex = nodeGraphGraphSelectedNodeIndex(drag.nodeId, targetNode.graph, drag.index ?? 0);
    setNodeGraphGraphSelectedNodeIndex(drag.nodeId, targetNode.graph, selectedIndex);
    syncNodeGraphGraphDisplaysForNode(drag.nodeId, targetNode);
    syncNodeGraphGraphControls(targetNode.graph, selectedIndex, { nodeId: drag.nodeId });
  }
  event.preventDefault();
  event.stopPropagation();
}

// Shared removal path for keyboard delete and pointer gestures -- takes an
// explicit index (rather than assuming "whatever's selected") so alt+click /
// double-click can remove whichever node is under the pointer, even if it
// isn't the currently selected one.
function removeNodeGraphGraphNodeAtIndex(nodeId, index) {
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  if (graph.nodes.length <= 2) {
    return false;
  }
  const removeIndex = nodeGraphGraphNodeIndexFromValue(graph, index);
  graph.nodes.splice(removeIndex, 1);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return false;
  }
  const fallbackIndex = Math.max(0, removeIndex - 1);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(graph, fallbackIndex)
    : normalizeNodeGraphGraph(graph);
  const nextIndex = setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, fallbackIndex);
  // If a drag on this node was somehow still in progress (e.g. alt+click
  // landing mid-gesture), drop the stale drag state so
  // dragNodeGraphGraphNode doesn't keep mutating an index that no longer
  // corresponds to anything after this removal.
  if (nodeGraphMvp.graphNodeDragging?.nodeId === nodeId) {
    nodeGraphMvp.graphNodeDragging.display?.classList.remove("dragging");
    nodeGraphMvp.graphNodeDragging = null;
  }
  commitNodeGraphPatch(patch, { status: "graph node removed" });
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  syncNodeGraphGraphControls(targetNode.graph, nextIndex);
  return true;
}

function removeSelectedNodeGraphGraphNodeFromDisplay(display) {
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(nodeId, graph, graph.nodes.length - 1);
  return removeNodeGraphGraphNodeAtIndex(nodeId, selectedIndex);
}

function removeFocusedNodeGraphGraphNode() {
  return removeSelectedNodeGraphGraphNodeFromDisplay(
    document.activeElement?.closest?.(".node-module-graph-display"),
  );
}

function addFocusedNodeGraphGraphNode() {
  const display = document.activeElement?.closest?.(".node-module-graph-display");
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return false;
  }
  const isStep = nodeGraphGraphIsStepGraphType(targetNode.type);
  const stepCount = nodeGraphGraphStepCountForNode(targetNode);
  const place = isStep
    ? {
      x: stepCount > 0
        ? nodeGraphGraphSnapXToStepGrid(Number(targetNode.graph?.cursorX) || 0.5, stepCount)
        : (Number(targetNode.graph?.cursorX) || 0.5),
      shape: "hold",
    }
    : {};
  const addition = addNodeGraphGraphNodeData(targetNode.graph, place);
  if (!addition.added) {
    return false;
  }
  let nextGraph = addition.graph;
  if (isStep) {
    nextGraph = nodeGraphGraphApplyStepBarHeight(
      addition.graph,
      addition.selectedIndex,
      addition.graph.nodes[addition.selectedIndex]?.y,
    );
  }
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(nextGraph, addition.selectedIndex)
    : nextGraph;
  commitNodeGraphPatch(patch, { status: "graph node added" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, addition.selectedIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  if (nodeGraphModuleActionTargetNodeId() === nodeId) {
    syncNodeGraphGraphControls(targetNode.graph, addition.selectedIndex, { nodeId });
  }
  display.focus?.({ preventScroll: true });
  return true;
}

function duplicateFocusedNodeGraphGraphNode() {
  const display = document.activeElement?.closest?.(".node-module-graph-display");
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(targetNode);
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(nodeId, graph, graph.nodes.length - 1);
  const duplicate = duplicateNodeGraphGraphNodeData(graph, selectedIndex);
  if (!duplicate.duplicated) {
    return false;
  }
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(duplicate.graph, duplicate.selectedIndex)
    : duplicate.graph;
  commitNodeGraphPatch(patch, { status: "graph node duplicated" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, duplicate.selectedIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  if (nodeGraphModuleActionTargetNodeId() === nodeId) {
    syncNodeGraphGraphControls(targetNode.graph, duplicate.selectedIndex);
  }
  display.focus?.({ preventScroll: true });
  return true;
}

function selectFocusedNodeGraphGraphNodeOffset(offset) {
  const display = document.activeElement?.closest?.(".node-module-graph-display");
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(nodeId, graph, graph.nodes.length - 1);
  const nextIndex = nodeGraphGraphNodeIndexFromValue(graph, selectedIndex + Number(offset || 0));
  setNodeGraphGraphSelectedNodeIndex(nodeId, graph, nextIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, sourceNode);
  if (nodeGraphModuleActionTargetNodeId() === nodeId) {
    syncNodeGraphGraphControls(graph, nextIndex);
  }
  display.focus?.({ preventScroll: true });
  return nextIndex !== selectedIndex;
}

function nudgeFocusedNodeGraphGraphNode(event) {
  const display = document.activeElement?.closest?.(".node-module-graph-display");
  const moves = {
    ArrowDown: { x: 0, y: -1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: 1 },
  };
  const move = moves[event?.key];
  if (!display || !move || event.ctrlKey || event.metaKey) {
    return false;
  }
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(targetNode);
  const index = nodeGraphGraphSelectedNodeIndex(nodeId, graph, graph.nodes.length - 1);
  const current = graph.nodes[index];
  const step = event.altKey ? 0.001 : event.shiftKey ? 0.05 : 0.01;
  graph.nodes[index] = normalizeNodeGraphGraphNode({
    ...current,
    ...nodeGraphGraphConstrainedNodePoint(graph, index, {
      x: current.x + move.x * step,
      y: current.y + move.y * step,
    }),
  }, index);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(graph, index)
    : normalizeNodeGraphGraph(graph);
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, index);
  commitNodeGraphPatch(patch, { status: "graph node nudged" });
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  if (nodeGraphModuleActionTargetNodeId() === nodeId) {
    syncNodeGraphGraphControls(targetNode.graph, index);
  }
  return true;
}

// Repositions each graph module's purple final-phase ghost in place --
// deliberately NOT a full renderNodeGraphGraphDisplay() re-render, which
// would tear down and rebuild the whole SVG every time the worklet posts a
// scope snapshot (many times a second, for every visible graph module).
// That churn is exactly what made dragging a dot unreliable (see the
// pointer-capture comment on dragNodeGraphGraphNode above); a live update
// running at the same cadence needs to avoid the same trap by touching only
// the ghost <line> element's position.
function syncNodeGraphGraphLivePlayheads() {
  const liveAudioRunning = Boolean(nodeGraphMvp?.live?.node);
  for (const display of document.querySelectorAll(".node-module-graph-display")) {
    const line = display.querySelector(".node-module-graph-phase-ghost, .node-module-graph-playhead");
    if (!line) {
      continue;
    }
    const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
    const patchNode = nodeId ? nodeGraphPatchNode(nodeId) : null;
    const liveX = liveAudioRunning && patchNode && nodeGraphModuleIsGraphType(patchNode.type)
      ? nodeGraphModuleScopeLatestOutputValue(nodeId, "__GraphPhase", null)
      : null;
    if (liveX === null || !Number.isFinite(liveX)) {
      // No live sample yet, or live audio isn't running -- e.g. audio
      // stopped after a stale sample was captured. Hide rather than leave a
      // frozen ghost that would misleadingly still read as "final phase".
      line.classList.remove("live");
      continue;
    }
    const clampedX = Math.max(0, Math.min(1, Number(liveX)));
    const point = nodeGraphGraphPointToSvg(clampedX, 0);
    line.setAttribute("x1", point.x.toFixed(3));
    line.setAttribute("x2", point.x.toFixed(3));
    line.classList.add("live");
  }
}

// Registering this at top-level script scope (rather than inside an init
// function) used to throw ReferenceError: node-graph-module-scopes.js --
// which defines addNodeGraphModuleScopeSnapshotListener -- loads AFTER this
// file in index.html, so the identifier didn't exist yet when this line ran.
// That uncaught exception didn't stop OTHER scripts from loading (each
// <script> tag is its own execution context), but it's still a real crash
// worth not having. Deferring to DOMContentLoaded guarantees every
// synchronous, non-deferred <script> tag (all of them, here) has already
// run by the time this fires.
document.addEventListener("DOMContentLoaded", () => {
  addNodeGraphModuleScopeSnapshotListener(syncNodeGraphGraphLivePlayheads);
});
