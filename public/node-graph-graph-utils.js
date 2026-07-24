const nodeGraphGraphShapes = Object.freeze(["linear", "smooth", "rational", "exponential", "hold"]);
const nodeGraphGraph2SmoothingModes = Object.freeze(["linear", "smooth", "meander", "quadratic", "cubic"]);

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
      Object.freeze({ c: 0, shape: "smooth", x: 0, y: 0.5 }),
      Object.freeze({ c: 0, shape: "smooth", x: 0.25, y: 1 }),
      Object.freeze({ c: 0, shape: "smooth", x: 0.5, y: 0.5 }),
      Object.freeze({ c: 0, shape: "smooth", x: 0.75, y: 0 }),
      Object.freeze({ c: 0, shape: "smooth", x: 1, y: 0.5 }),
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
  graph.cursorX = x;
  graph.nodes.push({
    c: 0,
    shape: "rational",
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

function cycleNodeGraphGraphShapeData(graphValue, selectedIndex = 1) {
  const graph = normalizeNodeGraphGraph(graphValue);
  const index = nodeGraphGraphNodeIndexFromValue(
    graph,
    selectedIndex <= 0 && graph.nodes.length > 1 ? 1 : selectedIndex,
  );
  const node = graph.nodes[index];
  if (!node) {
    return { graph, selectedIndex: index };
  }
  graph.nodes[index] = normalizeNodeGraphGraphNode({
    ...node,
    shape: nodeGraphGraphNextShape(node.shape),
  }, index);
  return {
    graph: normalizeNodeGraphGraph(graph),
    selectedIndex: index,
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
  const shape = String(value || "").trim();
  return nodeGraphGraphShapes.includes(shape) ? shape : "rational";
}

function nodeGraphGraphNextShape(value) {
  const current = normalizeNodeGraphGraphShape(value);
  const index = nodeGraphGraphShapes.indexOf(current);
  return nodeGraphGraphShapes[(index + 1) % nodeGraphGraphShapes.length];
}

function nodeGraphGraphContourShape(value) {
  const shape = normalizeNodeGraphGraphShape(value);
  return shape === "rational" || shape === "exponential" ? shape : "rational";
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
  const graph = normalizeNodeGraphGraph(patchNode?.graph);
  return nodeGraphGraphEndpointYLockEnabledForNode(patchNode)
    ? nodeGraphGraphWithLockedEndpointY(graph, selectedIndex)
    : graph;
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

function nodeGraphGraphExponentialCurve(position, contour = 0) {
  const p = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  const c = normalizeNodeGraphGraphNumber(0.5 * (contour + 1), 0.5, 0.001, 0.999);
  const a = 2 * Math.log((1 - c) / c);
  if (!Number.isFinite(a) || Math.abs(a) < 0.000001) {
    return p;
  }
  const denominator = 1 - Math.exp(a);
  if (Math.abs(denominator) < 0.000001) {
    return p;
  }
  return (1 - Math.exp(p * a)) / denominator;
}

function nodeGraphGraphSmoothCurve(position) {
  const p = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  return p * p * (3 - 2 * p);
}

function normalizeNodeGraphGraph2SmoothingMode(value) {
  if (Number.isFinite(Number(value))) {
    return nodeGraphGraph2SmoothingModes[Math.max(0, Math.min(
      nodeGraphGraph2SmoothingModes.length - 1,
      Math.round(Number(value)),
    ))];
  }
  const mode = String(value || "").trim().toLowerCase();
  return nodeGraphGraph2SmoothingModes.includes(mode) ? mode : "smooth";
}

function nodeGraphGraphMeanderCurve(position, index = 0) {
  const p = nodeGraphGraphSmoothCurve(position);
  const wobblePhase = (index * 0.371) % 1;
  const wobble = Math.sin(Math.PI * p) * Math.sin((p * 1.5 + wobblePhase) * Math.PI * 2) * 0.075;
  return normalizeNodeGraphGraphNumber(p + wobble, p, 0, 1);
}

function nodeGraphGraphBezierPointAt(nodes, position = 0) {
  const t = normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  let points = nodes.map((node) => ({
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

function nodeGraphGraphBezierValueAt(graph, xValue) {
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  if (graph.nodes.length < 2) {
    return graph.nodes[0]?.y ?? 0;
  }
  if (x <= graph.nodes[0].x) {
    return graph.nodes[0].y;
  }
  const last = graph.nodes[graph.nodes.length - 1];
  if (x >= last.x) {
    return last.y;
  }
  let low = 0;
  let high = 1;
  let point = nodeGraphGraphBezierPointAt(graph.nodes, x);
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const t = (low + high) * 0.5;
    point = nodeGraphGraphBezierPointAt(graph.nodes, t);
    if (point.x < x) {
      low = t;
    } else {
      high = t;
    }
  }
  return point.y;
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

function nodeGraphGraphControlPolygonPath(graphValue) {
  const graph = normalizeNodeGraphGraph(graphValue);
  return graph.nodes
    .map((node, index) => {
      const point = nodeGraphGraphPointToSvg(node.x, node.y);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
    })
    .join(" ");
}

function nodeGraphGraphModeCurve(position, mode, index = 0) {
  const normalizedMode = normalizeNodeGraphGraph2SmoothingMode(mode);
  if (normalizedMode === "linear") {
    return normalizeNodeGraphGraphNumber(position, 0, 0, 1);
  }
  if (normalizedMode === "meander") {
    return nodeGraphGraphMeanderCurve(position, index);
  }
  return nodeGraphGraphSmoothCurve(position);
}

function nodeGraphGraphSegmentValue(graph, x, index, smoothingMode = "legacy") {
  const left = graph.nodes[index];
  const right = graph.nodes[index + 1];
  const dx = right.x - left.x;
  if (Math.abs(dx) < 0.000001) {
    return 0.5 * (left.y + right.y);
  }
  const p = normalizeNodeGraphGraphNumber((x - left.x) / dx, 0, 0, 1);
  if (smoothingMode !== "legacy") {
    const shaped = nodeGraphGraphModeCurve(p, smoothingMode, index);
    return left.y + (right.y - left.y) * shaped;
  }
  const contour = normalizeNodeGraphGraphNumber(right.c, 0, -0.999, 0.999);
  const shaped = right.shape === "exponential"
    ? nodeGraphGraphExponentialCurve(p, contour)
    : right.shape === "hold"
      ? (p >= 1 ? 1 : 0)
    : right.shape === "smooth"
      ? nodeGraphGraphSmoothCurve(p)
    : right.shape === "linear"
      ? p
      : nodeGraphGraphRationalCurve(p, contour);
  return left.y + (right.y - left.y) * shaped;
}

function nodeGraphGraphValueAt(graphValue, xValue, smoothingMode = "legacy") {
  const graph = normalizeNodeGraphGraph(graphValue);
  const x = normalizeNodeGraphGraphNumber(xValue, 0, -Infinity, Infinity);
  if (!graph.nodes.length) {
    return 0;
  }
  const normalizedMode = normalizeNodeGraphGraph2SmoothingMode(smoothingMode);
  if (normalizedMode === "meander") {
    return normalizeNodeGraphGraphNumber(nodeGraphGraphBezierValueAt(graph, x), 0, -Infinity, Infinity);
  }
  if (x < graph.nodes[0].x) {
    return graph.nodes[0].y;
  }
  if (x > graph.nodes[graph.nodes.length - 1].x) {
    return graph.nodes[graph.nodes.length - 1].y;
  }
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

function nodeGraphGraphCurvePath(graphValue, sampleCount = 96, smoothingMode = "legacy") {
  const graph = normalizeNodeGraphGraph(graphValue);
  const count = Math.max(2, Math.round(Number(sampleCount) || 96));
  const commands = [];
  for (let index = 0; index < count; index += 1) {
    const x = index / (count - 1);
    const y = nodeGraphGraphValueAt(graph, x, smoothingMode);
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
  const size = Math.max(1, Math.min(rect.width, rect.height));
  return {
    height: size,
    left: rect.left + (rect.width - size) * 0.5,
    top: rect.top + (rect.height - size) * 0.5,
    width: size,
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

function nodeGraphGraphContourHandlePoint(graph, index) {
  const left = graph.nodes[index - 1];
  const right = graph.nodes[index];
  if (!left || !right) {
    return null;
  }
  const x = left.x + (right.x - left.x) * 0.5;
  const y = nodeGraphGraphSegmentValue(graph, x, index - 1);
  return nodeGraphGraphPointToSvg(x, y);
}

function nodeGraphGraphSegmentMidpoint(graph, index) {
  const left = graph.nodes[index - 1];
  const right = graph.nodes[index];
  if (!left || !right) {
    return null;
  }
  return {
    x: left.x + (right.x - left.x) * 0.5,
    y: left.y + (right.y - left.y) * 0.5,
  };
}

function nodeGraphGraphContourFromPoint(graph, index, point) {
  const midpoint = nodeGraphGraphSegmentMidpoint(graph, index);
  const left = graph.nodes[index - 1];
  const right = graph.nodes[index];
  if (!midpoint || !left || !right) {
    return 0;
  }
  const direction = right.y >= left.y ? 1 : -1;
  const range = Math.max(0.08, Math.abs(right.y - left.y));
  return normalizeNodeGraphGraphNumber(((point.y - midpoint.y) / range) * direction * 1.8, 0, -0.999, 0.999);
}

function renderNodeGraphGraphDisplay(element, graphValue, selectedIndex = null, options = {}) {
  if (!element) {
    return;
  }
  const graph = normalizeNodeGraphGraph(graphValue);
  const smoothingMode = options.smoothingMode === undefined
    ? "legacy"
    : normalizeNodeGraphGraph2SmoothingMode(options.smoothingMode);
  const usesGlobalSmoothing = smoothingMode !== "legacy";
  const nodeId = element.dataset.graphNode || "";
  const activeIndex = selectedIndex === null
    ? nodeGraphGraphSelectedNodeIndex(nodeId, graph, 0)
    : nodeGraphGraphNodeIndexFromValue(graph, selectedIndex);
  const cursorValue = nodeGraphGraphValueAt(graph, graph.cursorX, smoothingMode);
  const cursor = nodeGraphGraphPointToSvg(graph.cursorX, 0);
  const cursorPoint = nodeGraphGraphPointToSvg(graph.cursorX, cursorValue);
  element.replaceChildren();
  const svg = createNodeGraphGraphSvgElement("svg", {
    "aria-hidden": "true",
    class: "node-module-graph-svg",
    preserveAspectRatio: "xMidYMid meet",
    viewBox: "0 0 100 100",
  });
  svg.append(createNodeGraphGraphSvgElement("rect", {
    class: "node-module-graph-frame",
    height: "84",
    width: "84",
    x: "8",
    y: "8",
  }));
  [0.25, 0.5, 0.75].forEach((gridValue) => {
    const gridPoint = nodeGraphGraphPointToSvg(gridValue, gridValue);
    svg.append(createNodeGraphGraphSvgElement("line", {
      class: `node-module-graph-grid-line${gridValue === 0.5 ? " major" : ""}`,
      x1: gridPoint.x.toFixed(3),
      x2: gridPoint.x.toFixed(3),
      y1: "8",
      y2: "92",
    }));
    svg.append(createNodeGraphGraphSvgElement("line", {
      class: `node-module-graph-grid-line${gridValue === 0.5 ? " major" : ""}`,
      x1: "8",
      x2: "92",
      y1: gridPoint.y.toFixed(3),
      y2: gridPoint.y.toFixed(3),
    }));
  });
  svg.append(createNodeGraphGraphSvgElement("line", {
    class: "node-module-graph-axis",
    x1: "8",
    x2: "92",
    y1: "50",
    y2: "50",
  }));
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
  // Live playhead -- distinct from the cursor line above (which is only the
  // manually-dragged probe, see nodeGraphGraphSvgToGraphPoint / cursorX).
  // Starts hidden (no "live" class); syncNodeGraphGraphLivePlayheads()
  // repositions and reveals it in place (no full re-render) whenever the
  // worklet posts a fresh "__GraphPhase" scope sample, so Rate/Phase (or an
  // Input-mode CV signal) actually show something moving during playback.
  svg.append(createNodeGraphGraphSvgElement("line", {
    class: "node-module-graph-playhead",
    x1: cursor.x.toFixed(3),
    x2: cursor.x.toFixed(3),
    y1: "8",
    y2: "92",
  }));
  if (smoothingMode === "meander") {
    svg.append(createNodeGraphGraphSvgElement("path", {
      class: "node-module-graph-control-line",
      d: nodeGraphGraphControlPolygonPath(graph),
    }));
  }
  svg.append(createNodeGraphGraphSvgElement("path", {
    class: "node-module-graph-curve",
    d: nodeGraphGraphCurvePath(graph, 96, smoothingMode),
  }));
  if (!usesGlobalSmoothing) {
    graph.nodes.forEach((node, index) => {
      if (index <= 0) {
        return;
      }
      const point = nodeGraphGraphContourHandlePoint(graph, index);
      if (!point) {
        return;
      }
      svg.append(createNodeGraphGraphSvgElement("circle", {
        class: `node-module-graph-contour-handle${index === activeIndex ? " selected" : ""}`,
        cx: point.x.toFixed(3),
        cy: point.y.toFixed(3),
        "data-graph-contour-index": String(index),
        "data-selected": index === activeIndex ? "true" : "false",
        r: "2.7",
      }));
      const shapeBadge = createNodeGraphGraphSvgElement("text", {
        class: `node-module-graph-shape-badge${index === activeIndex ? " selected" : ""}`,
        "data-graph-shape-index": String(index),
        "data-selected": index === activeIndex ? "true" : "false",
        x: Math.min(90, point.x + 4).toFixed(3),
        y: Math.max(12, point.y - 3).toFixed(3),
      });
      shapeBadge.textContent = normalizeNodeGraphGraphShape(node.shape).slice(0, 3);
      svg.append(shapeBadge);
    });
  }
  if (usesGlobalSmoothing) {
    const modeLabel = createNodeGraphGraphSvgElement("text", {
      class: "node-module-graph-shape-badge",
      x: "10",
      y: "14",
    });
    modeLabel.textContent = normalizeNodeGraphGraph2SmoothingMode(smoothingMode).slice(0, 3);
    svg.append(modeLabel);
  }
  graph.nodes.forEach((node, index) => {
    const point = nodeGraphGraphPointToSvg(node.x, node.y);
    svg.append(createNodeGraphGraphSvgElement("circle", {
      class: `node-module-graph-node-hit${index === activeIndex ? " selected" : ""}`,
      cx: point.x.toFixed(3),
      cy: point.y.toFixed(3),
      "data-graph-node-index": String(index),
      "data-selected": index === activeIndex ? "true" : "false",
      r: "5.4",
    }));
    svg.append(createNodeGraphGraphSvgElement("circle", {
      class: `node-module-graph-node${index === activeIndex ? " selected" : ""}`,
      cx: point.x.toFixed(3),
      cy: point.y.toFixed(3),
      "data-graph-node-index": String(index),
      "data-selected": index === activeIndex ? "true" : "false",
      r: "2.2",
    }));
  });
  element.append(svg);
}

function nodeGraphGraphSmoothingModeForNode(patchNode) {
  // The "graph" type (per-point curve shape/contour) has been retired --
  // graph2 (one global smoothing mode) is the only graph type left, so this
  // always resolves to the global-smoothing branch now.
  return normalizeNodeGraphGraph2SmoothingMode(patchNode?.params?.smoothingMode);
}

function syncNodeGraphGraphElement(moduleElement, patchNode) {
  const graph = nodeGraphGraphForNode(patchNode);
  renderNodeGraphGraphDisplay(
    moduleElement?.querySelector?.(".node-module-graph-display"),
    graph,
    nodeGraphGraphSelectedNodeIndex(patchNode?.id || "", graph, 0),
    { smoothingMode: nodeGraphGraphSmoothingModeForNode(patchNode) },
  );
}

function nodeGraphGraphNodeIdFromDisplay(display) {
  return display?.closest?.(".dsp-node")?.dataset?.node || display?.dataset?.graphNode || "";
}

function syncNodeGraphGraphDisplaysForNode(nodeId, patchNode) {
  const id = String(nodeId || patchNode?.id || "").trim();
  if (!id) {
    return;
  }
  const graph = nodeGraphGraphForNode(patchNode);
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(id, graph, 0);
  document
    .querySelectorAll(".node-module-graph-display")
    .forEach((display) => {
      if (nodeGraphGraphNodeIdFromDisplay(display) === id) {
        renderNodeGraphGraphDisplay(display, graph, selectedIndex, {
          smoothingMode: nodeGraphGraphSmoothingModeForNode(patchNode),
        });
      }
    });
}

function nodeGraphGraphDisplayFromEventTarget(target) {
  return target?.closest?.(".node-module-graph-display") || null;
}

function beginNodeGraphGraphNodeDrag(event) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  const shapeBadge = event.target?.closest?.(".node-module-graph-shape-badge");
  if (shapeBadge?.dataset.graphShapeIndex !== undefined) {
    cycleNodeGraphGraphShapeFromDisplayEvent(event, shapeBadge);
    return;
  }
  const contour = event.target?.closest?.(".node-module-graph-contour-handle");
  if (contour) {
    beginNodeGraphGraphContourDrag(event, contour);
    return;
  }
  const cursor = event.target?.closest?.("[data-graph-cursor]");
  if (cursor) {
    beginNodeGraphGraphCursorDrag(event, cursor);
    return;
  }
  const circle = event.target?.closest?.(".node-module-graph-node, .node-module-graph-node-hit");
  if (!circle) {
    addNodeGraphGraphNodeFromDisplayEvent(event);
    return;
  }
  const display = nodeGraphGraphDisplayFromEventTarget(circle);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return;
  }
  const svg = circle.closest(".node-module-graph-svg");
  const graph = nodeGraphGraphForNode(patchNode);
  const index = nodeGraphGraphNodeIndexFromValue(graph, circle.dataset.graphNodeIndex);
  display?.focus?.({ preventScroll: true });
  setNodeGraphGraphSelectedNodeIndex(nodeId, graph, index);
  nodeGraphMvp.graphNodeDragging = {
    display,
    graph,
    index,
    nodeId,
    svg,
  };
  display?.classList.add("dragging");
  circle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphGraphCursorDrag(event, cursorElement) {
  const display = nodeGraphGraphDisplayFromEventTarget(cursorElement);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return;
  }
  const svg = cursorElement.closest(".node-module-graph-svg");
  const graph = nodeGraphGraphForNode(patchNode);
  display?.focus?.({ preventScroll: true });
  nodeGraphMvp.graphNodeDragging = {
    display,
    graph,
    mode: "cursor",
    nodeId,
    svg,
  };
  display?.classList.add("dragging");
  cursorElement.setPointerCapture?.(event.pointerId);
  dragNodeGraphGraphNode(event);
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphGraphContourDrag(event, contour) {
  const display = nodeGraphGraphDisplayFromEventTarget(contour);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!patchNode || patchNode.type !== "graph") {
    return;
  }
  const svg = contour.closest(".node-module-graph-svg");
  const graph = nodeGraphGraphForNode(patchNode);
  const index = nodeGraphGraphNodeIndexFromValue(graph, contour.dataset.graphContourIndex);
  display?.focus?.({ preventScroll: true });
  setNodeGraphGraphSelectedNodeIndex(nodeId, graph, index);
  nodeGraphMvp.graphNodeDragging = {
    display,
    graph,
    index,
    mode: "contour",
    nodeId,
    svg,
  };
  display?.classList.add("dragging");
  contour.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function addNodeGraphGraphNodeFromDisplayEvent(event) {
  const svg = event.target?.closest?.(".node-module-graph-svg");
  if (!svg) {
    return;
  }
  const display = nodeGraphGraphDisplayFromEventTarget(event.target);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const patchNode = nodeGraphPatchNode(nodeId);
  if (!display || !patchNode || !nodeGraphModuleIsGraphType(patchNode.type)) {
    return;
  }
  display?.focus?.({ preventScroll: true });
  const point = nodeGraphGraphSvgToGraphPoint(svg, event.clientX, event.clientY);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return;
  }
  const addition = addNodeGraphGraphNodeData(targetNode.graph, point);
  if (!addition.added) {
    return;
  }
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(addition.graph, addition.selectedIndex)
    : addition.graph;
  commitNodeGraphPatch(patch, { status: "graph node added" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, addition.selectedIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  syncNodeGraphGraphControls(targetNode.graph, addition.selectedIndex);
  event.preventDefault();
  event.stopPropagation();
}

function cycleNodeGraphGraphShapeFromDisplayEvent(event, shapeBadge) {
  const display = nodeGraphGraphDisplayFromEventTarget(shapeBadge);
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || sourceNode.type !== "graph") {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(targetNode);
  const shape = cycleNodeGraphGraphShapeData(graph, shapeBadge.dataset.graphShapeIndex);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(shape.graph, shape.selectedIndex)
    : shape.graph;
  display?.focus?.({ preventScroll: true });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, shape.selectedIndex);
  commitNodeGraphPatch(patch, { status: "graph curve shape changed" });
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  syncNodeGraphGraphControls(targetNode.graph, shape.selectedIndex);
  event?.preventDefault?.();
  event?.stopPropagation?.();
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
    : drag.mode === "contour"
      ? `.node-module-graph-contour-handle[data-graph-contour-index="${drag.index}"]`
      : `.node-module-graph-node-hit[data-graph-node-index="${drag.index}"]`;
  const target = drag.svg.querySelector(selector);
  try {
    target?.setPointerCapture?.(event.pointerId);
  } catch (_error) {
    // Ignore -- worst case capture stays released for this frame and the
    // next pointermove will try again.
  }
}

function dragNodeGraphGraphNode(event) {
  const drag = nodeGraphMvp.graphNodeDragging;
  if (!drag?.svg || !drag?.display) {
    return;
  }
  const smoothingMode = nodeGraphGraphSmoothingModeForNode(nodeGraphPatchNode(drag.nodeId));
  const point = nodeGraphGraphSvgToGraphPoint(drag.svg, event.clientX, event.clientY);
  if (drag.mode === "cursor") {
    drag.graph = normalizeNodeGraphGraph({
      ...drag.graph,
      cursorX: point.x,
    });
    renderNodeGraphGraphDisplay(drag.display, drag.graph, null, { smoothingMode });
    drag.svg = drag.display.querySelector(".node-module-graph-svg");
    reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
    if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
      syncNodeGraphGraphControls(drag.graph);
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (drag.mode === "contour") {
    const current = drag.graph.nodes[drag.index] || normalizeNodeGraphGraphNode({}, drag.index);
    drag.graph.nodes[drag.index] = normalizeNodeGraphGraphNode({
      ...current,
      c: nodeGraphGraphContourFromPoint(drag.graph, drag.index, point),
      shape: nodeGraphGraphContourShape(current.shape),
    }, drag.index);
    drag.graph = normalizeNodeGraphGraph(drag.graph);
    setNodeGraphGraphSelectedNodeIndex(drag.nodeId, drag.graph, drag.index);
    renderNodeGraphGraphDisplay(drag.display, drag.graph, drag.index, { smoothingMode });
    drag.svg = drag.display.querySelector(".node-module-graph-svg");
    reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
    if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
      syncNodeGraphGraphControls(drag.graph, drag.index);
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const constrained = nodeGraphGraphConstrainedNodePoint(drag.graph, drag.index, point);
  const current = drag.graph.nodes[drag.index] || normalizeNodeGraphGraphNode({}, drag.index);
  drag.graph.nodes[drag.index] = normalizeNodeGraphGraphNode({
    ...current,
    x: constrained.x,
    y: constrained.y,
  }, drag.index);
  drag.graph = nodeGraphGraphEndpointYLockEnabledForNode(nodeGraphPatchNode(drag.nodeId))
    ? nodeGraphGraphWithLockedEndpointY(drag.graph, drag.index)
    : normalizeNodeGraphGraph(drag.graph);
  drag.index = nodeGraphGraphNodeIndexFromValue(drag.graph, drag.index);
  setNodeGraphGraphSelectedNodeIndex(drag.nodeId, drag.graph, drag.index);
  renderNodeGraphGraphDisplay(drag.display, drag.graph, drag.index, { smoothingMode });
  drag.svg = drag.display.querySelector(".node-module-graph-svg");
  reacquireNodeGraphGraphPointerCaptureAfterRender(drag, event);
  if (nodeGraphModuleActionTargetNodeId() === drag.nodeId) {
    syncNodeGraphGraphControls(drag.graph, drag.index);
  }
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphGraphNodeDrag(event) {
  const drag = nodeGraphMvp.graphNodeDragging;
  if (!drag) {
    return;
  }
  drag.display?.classList.remove("dragging");
  nodeGraphMvp.graphNodeDragging = null;
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === drag.nodeId);
  if (nodeGraphModuleIsGraphType(targetNode?.type)) {
    targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
      ? nodeGraphGraphWithLockedEndpointY(drag.graph, drag.index ?? 0)
      : normalizeNodeGraphGraph(drag.graph);
    const status = drag.mode === "cursor"
      ? "graph cursor moved"
      : drag.mode === "contour"
        ? "graph curve changed"
        : "graph node moved";
    commitNodeGraphPatch(patch, { status });
    const selectedIndex = nodeGraphGraphSelectedNodeIndex(drag.nodeId, targetNode.graph, drag.index ?? 0);
    setNodeGraphGraphSelectedNodeIndex(drag.nodeId, targetNode.graph, selectedIndex);
    syncNodeGraphGraphDisplaysForNode(drag.nodeId, targetNode);
    syncNodeGraphGraphControls(targetNode.graph, selectedIndex);
  }
  event.preventDefault();
  event.stopPropagation();
}

function removeSelectedNodeGraphGraphNodeFromDisplay(display) {
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return false;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  if (graph.nodes.length <= 2) {
    return false;
  }
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(nodeId, graph, graph.nodes.length - 1);
  graph.nodes.splice(selectedIndex, 1);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return false;
  }
  const fallbackIndex = Math.max(0, selectedIndex - 1);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(graph, fallbackIndex)
    : normalizeNodeGraphGraph(graph);
  const nextIndex = setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, fallbackIndex);
  commitNodeGraphPatch(patch, { status: "graph node removed" });
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  syncNodeGraphGraphControls(targetNode.graph, nextIndex);
  return true;
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
  const addition = addNodeGraphGraphNodeData(targetNode.graph);
  if (!addition.added) {
    return false;
  }
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(addition.graph, addition.selectedIndex)
    : addition.graph;
  commitNodeGraphPatch(patch, { status: "graph node added" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, addition.selectedIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  if (nodeGraphModuleActionTargetNodeId() === nodeId) {
    syncNodeGraphGraphControls(targetNode.graph, addition.selectedIndex);
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

function cycleFocusedNodeGraphGraphShape() {
  const display = document.activeElement?.closest?.(".node-module-graph-display");
  const nodeId = nodeGraphGraphNodeIdFromDisplay(display);
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!display || !sourceNode || sourceNode.type !== "graph") {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || targetNode.type !== "graph") {
    return false;
  }
  const graph = nodeGraphGraphForNode(targetNode);
  const selectedIndex = nodeGraphGraphSelectedNodeIndex(nodeId, graph, graph.nodes.length - 1);
  const shape = cycleNodeGraphGraphShapeData(graph, selectedIndex);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(shape.graph, shape.selectedIndex)
    : shape.graph;
  commitNodeGraphPatch(patch, { status: "graph curve shape changed" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, shape.selectedIndex);
  syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  if (nodeGraphModuleActionTargetNodeId() === nodeId) {
    syncNodeGraphGraphControls(targetNode.graph, shape.selectedIndex);
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

// Repositions each graph/graph2 module's live-playhead line in place --
// deliberately NOT a full renderNodeGraphGraphDisplay() re-render, which
// would tear down and rebuild the whole SVG every time the worklet posts a
// scope snapshot (many times a second, for every visible graph module).
// That churn is exactly what made dragging a dot unreliable (see the
// pointer-capture comment on dragNodeGraphGraphNode above); a live update
// running at the same cadence needs to avoid the same trap by touching only
// the one <line> element's position.
function syncNodeGraphGraphLivePlayheads() {
  const liveAudioRunning = Boolean(nodeGraphMvp?.live?.node);
  for (const display of document.querySelectorAll(".node-module-graph-display")) {
    const line = display.querySelector(".node-module-graph-playhead");
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
      // frozen line that would misleadingly still read as "live".
      line.classList.remove("live");
      continue;
    }
    const point = nodeGraphGraphPointToSvg(liveX, 0);
    line.setAttribute("x1", point.x.toFixed(3));
    line.setAttribute("x2", point.x.toFixed(3));
    line.classList.add("live");
  }
}

addNodeGraphModuleScopeSnapshotListener(syncNodeGraphGraphLivePlayheads);
