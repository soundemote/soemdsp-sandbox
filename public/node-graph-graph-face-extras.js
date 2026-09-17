// Graph face extras: display-only Zoom Min/Max + bottom point strip.
// Loads after node-graph-graph-utils.js. Code stays Graph->Code one-way.

const nodeGraphGraphFaceDisplaySettingsDefaults = Object.freeze({
  zoomMin: 0,
  zoomMax: 1,
});

let nodeGraphGraphPaintZoom = {
  zoomMin: nodeGraphGraphFaceDisplaySettingsDefaults.zoomMin,
  zoomMax: nodeGraphGraphFaceDisplaySettingsDefaults.zoomMax,
};

function normalizeNodeGraphGraphFaceDisplaySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const rawMin = Number(source.zoomMin);
  const rawMax = Number(source.zoomMax);
  let zoomMin = Number.isFinite(rawMin) ? rawMin : nodeGraphGraphFaceDisplaySettingsDefaults.zoomMin;
  let zoomMax = Number.isFinite(rawMax) ? rawMax : nodeGraphGraphFaceDisplaySettingsDefaults.zoomMax;
  zoomMin = Math.max(-1, Math.min(2, zoomMin));
  zoomMax = Math.max(-1, Math.min(2, zoomMax));
  if (!(zoomMin < zoomMax)) {
    zoomMin = nodeGraphGraphFaceDisplaySettingsDefaults.zoomMin;
    zoomMax = nodeGraphGraphFaceDisplaySettingsDefaults.zoomMax;
  }
  return { zoomMin, zoomMax };
}

function nodeGraphGraphFaceDisplaySettingsForNode(node) {
  return normalizeNodeGraphGraphFaceDisplaySettings(node?.traceDisplaySettings);
}

function nodeGraphGraphZoomFromDisplay(display) {
  if (!display) {
    return normalizeNodeGraphGraphFaceDisplaySettings();
  }
  const min = Number(display._nodeGraphZoomMin);
  const max = Number(display._nodeGraphZoomMax);
  if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
    return { zoomMin: min, zoomMax: max };
  }
  return normalizeNodeGraphGraphFaceDisplaySettings();
}

function nodeGraphGraphStoreZoomOnDisplay(display, zoomSettings) {
  const zoom = normalizeNodeGraphGraphFaceDisplaySettings(zoomSettings);
  if (display) {
    display._nodeGraphZoomMin = zoom.zoomMin;
    display._nodeGraphZoomMax = zoom.zoomMax;
  }
  nodeGraphGraphPaintZoom = zoom;
  return zoom;
}

var nodeGraphGraphPointToSvgBase = typeof nodeGraphGraphPointToSvg === "function"
  ? nodeGraphGraphPointToSvg
  : null;

nodeGraphGraphPointToSvg = function nodeGraphGraphPointToSvg(x, y, zoomSettings = null) {
  const zoom = normalizeNodeGraphGraphFaceDisplaySettings(zoomSettings || nodeGraphGraphPaintZoom);
  const span = zoom.zoomMax - zoom.zoomMin;
  const yMapped = span > 0
    ? (normalizeNodeGraphGraphNumber(y, 0, -Infinity, Infinity) - zoom.zoomMin) / span
    : normalizeNodeGraphGraphNumber(y, 0);
  return {
    x: 8 + normalizeNodeGraphGraphNumber(x, 0) * 84,
    y: 92 - yMapped * 84,
  };
}

var nodeGraphGraphCurvePathBase = typeof nodeGraphGraphCurvePath === "function"
  ? nodeGraphGraphCurvePath
  : null;

nodeGraphGraphCurvePath = function nodeGraphGraphCurvePath(graphValue, sampleCount = 96, smoothingMode, tension = 1, segmentOptions = {}, zoomSettings = null) {
  const zoom = normalizeNodeGraphGraphFaceDisplaySettings(zoomSettings || nodeGraphGraphPaintZoom);
  const prev = nodeGraphGraphPaintZoom;
  nodeGraphGraphPaintZoom = zoom;
  try {
    if (nodeGraphGraphCurvePathBase && nodeGraphGraphCurvePathBase !== nodeGraphGraphCurvePath) {
      // Rebuild with zoom-aware pointToSvg (already overridden).
    }
    const graph = normalizeNodeGraphGraph(graphValue);
    const count = Math.max(2, Math.round(nodeGraphFiniteNumber(sampleCount, 96)));
    const commands = [];
    for (let index = 0; index < count; index += 1) {
      const x = index / (count - 1);
      const y = nodeGraphGraphValueAt(graph, x, smoothingMode, tension, segmentOptions);
      const point = nodeGraphGraphPointToSvg(x, y, zoom);
      commands.push(`${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`);
    }
    return commands.join(" ");
  } finally {
    nodeGraphGraphPaintZoom = prev;
  }
}

nodeGraphGraphControlPolygonPath = function nodeGraphGraphControlPolygonPath(graphValue, zoomSettings = null) {
  const zoom = normalizeNodeGraphGraphFaceDisplaySettings(zoomSettings || nodeGraphGraphPaintZoom);
  const graph = normalizeNodeGraphGraph(graphValue);
  return graph.nodes
    .map((node, index) => {
      const point = nodeGraphGraphPointToSvg(node.x, node.y, zoom);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
    })
    .join(" ");
}

var nodeGraphGraphSvgToGraphPointBase = typeof nodeGraphGraphSvgToGraphPoint === "function"
  ? nodeGraphGraphSvgToGraphPoint
  : null;

nodeGraphGraphSvgToGraphPoint = function nodeGraphGraphSvgToGraphPoint(svg, clientX, clientY, zoomSettings = null) {
  const rect = typeof nodeGraphGraphSvgPlotRect === "function"
    ? nodeGraphGraphSvgPlotRect(svg)
    : svg?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
    return { x: 0, y: 0 };
  }
  const zoom = zoomSettings
    ? normalizeNodeGraphGraphFaceDisplaySettings(zoomSettings)
    : nodeGraphGraphZoomFromDisplay(svg?.closest?.(".node-module-graph-display"));
  const span = zoom.zoomMax - zoom.zoomMin;
  const viewX = ((clientX - rect.left) / rect.width) * 100;
  const viewY = ((clientY - rect.top) / rect.height) * 100;
  const yUnit = (92 - viewY) / 84;
  return {
    x: normalizeNodeGraphGraphNumber((viewX - 8) / 84),
    y: normalizeNodeGraphGraphNumber(zoom.zoomMin + yUnit * span, 0, -Infinity, Infinity),
  };
}

var nodeGraphGraphContourHandlePointBase = typeof nodeGraphGraphContourHandlePoint === "function"
  ? nodeGraphGraphContourHandlePoint
  : null;

nodeGraphGraphContourHandlePoint = function nodeGraphGraphContourHandlePoint(graph, rightIndex, smoothingMode = "segment", segmentOptions = {}, zoomSettings = null) {
  if (!nodeGraphGraphContourHandlePointBase) {
    return null;
  }
  const zoom = normalizeNodeGraphGraphFaceDisplaySettings(zoomSettings || nodeGraphGraphPaintZoom);
  const prev = nodeGraphGraphPaintZoom;
  nodeGraphGraphPaintZoom = zoom;
  try {
    return nodeGraphGraphContourHandlePointBase(graph, rightIndex, smoothingMode, segmentOptions);
  } finally {
    nodeGraphGraphPaintZoom = prev;
  }
}

var nodeGraphGraphRenderDisplayBase = typeof renderNodeGraphGraphDisplay === "function"
  ? renderNodeGraphGraphDisplay
  : null;

renderNodeGraphGraphDisplay = function renderNodeGraphGraphDisplay(element, graphValue, selectedIndex = null, options = {}) {
  if (!element || !nodeGraphGraphRenderDisplayBase) {
    return;
  }
  const nodeId = String(
    element.dataset?.graphNode
    || element.closest?.(".dsp-node")?.dataset?.node
    || "",
  ).trim();
  const ownerNode = nodeId && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  const zoom = nodeGraphGraphStoreZoomOnDisplay(
    element,
    options?.zoomSettings
      || (ownerNode ? nodeGraphGraphFaceDisplaySettingsForNode(ownerNode) : null),
  );
  const prev = nodeGraphGraphPaintZoom;
  nodeGraphGraphPaintZoom = zoom;
  try {
    nodeGraphGraphRenderDisplayBase(element, graphValue, selectedIndex, options);
  } finally {
    nodeGraphGraphPaintZoom = prev;
  }
  if (typeof syncNodeGraphGraphPointStrip === "function") {
    syncNodeGraphGraphPointStrip(element, ownerNode, selectedIndex);
  }
}

function nodeGraphGraphPointStripFieldsForType(type) {
  if (String(type || "").trim() === "smoothGraph") {
    return [
      { key: "x", label: "X", title: "Selected point X (0..1; ends stay pinned)" },
      { key: "y", label: "Y", title: "Selected point Y (0..1)" },
      { key: "tension", label: "Tension", title: "Smooth Graph global Tension (module param)" },
    ];
  }
  return [
    { key: "x", label: "X", title: "Selected point X (0..1; ends stay pinned)" },
    { key: "y", label: "Y", title: "Selected point Y (0..1)" },
    { key: "c", label: "Skew", title: "Selected point contour / skew" },
  ];
}

function buildNodeGraphGraphPointStrip(patchNode) {
  const strip = document.createElement("div");
  strip.className = "node-module-graph-point-strip";
  strip.dataset.graphPointStrip = "true";
  const type = String(patchNode?.type || "").trim();
  for (const field of nodeGraphGraphPointStripFieldsForType(type)) {
    const label = document.createElement("label");
    label.className = "node-module-graph-point-strip-field";
    label.title = field.title;
    const name = document.createElement("span");
    name.className = "node-module-graph-point-strip-label";
    name.textContent = field.label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.inputMode = "decimal";
    input.className = "node-module-graph-point-strip-input";
    input.dataset.graphStripField = field.key;
    input.setAttribute("aria-label", field.title);
    label.append(name, input);
    strip.append(label);
  }
  return strip;
}

function mountNodeGraphGraphPointStrip(faceElement, patchNode) {
  if (!faceElement) {
    return null;
  }
  let strip = faceElement.querySelector(":scope > .node-module-graph-point-strip");
  if (!strip) {
    strip = buildNodeGraphGraphPointStrip(patchNode);
    faceElement.append(strip);
    bindNodeGraphGraphPointStrip(strip);
  }
  syncNodeGraphGraphPointStrip(faceElement, patchNode);
  return strip;
}

function bindNodeGraphGraphPointStrip(strip) {
  if (!strip || strip.dataset.bound === "true") {
    return;
  }
  strip.dataset.bound = "true";
  strip.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitNodeGraphGraphPointStripField(event.target);
      event.target?.blur?.();
    }
  });
  strip.addEventListener("change", (event) => {
    commitNodeGraphGraphPointStripField(event.target);
  });
  strip.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
}

function nodeGraphGraphPointStripOwnerFromStrip(strip) {
  const display = strip?.closest?.(".node-module-graph-face")?.querySelector?.(".node-module-graph-display")
    || strip?.previousElementSibling;
  const nodeId = typeof nodeGraphGraphNodeIdFromDisplay === "function"
    ? nodeGraphGraphNodeIdFromDisplay(display)
    : String(display?.dataset?.graphNode || "").trim();
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  return { display, nodeId, patchNode };
}

function syncNodeGraphGraphPointStrip(faceOrDisplay, patchNode = null, selectedIndex = null) {
  const face = faceOrDisplay?.classList?.contains("node-module-graph-face")
    ? faceOrDisplay
    : faceOrDisplay?.closest?.(".node-module-graph-face");
  const display = face?.querySelector?.(".node-module-graph-display")
    || (faceOrDisplay?.classList?.contains("node-module-graph-display") ? faceOrDisplay : null);
  const strip = face?.querySelector?.(".node-module-graph-point-strip");
  if (!strip) {
    return;
  }
  const nodeId = typeof nodeGraphGraphNodeIdFromDisplay === "function"
    ? nodeGraphGraphNodeIdFromDisplay(display)
    : String(display?.dataset?.graphNode || "").trim();
  const owner = patchNode && String(patchNode.id || "") === nodeId
    ? patchNode
    : (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : patchNode);
  if (!owner || (typeof nodeGraphModuleIsGraphType === "function" && !nodeGraphModuleIsGraphType(owner.type))) {
    return;
  }
  const graph = nodeGraphGraphForNode(owner);
  const index = selectedIndex == null
    ? nodeGraphGraphSelectedNodeIndex(nodeId, graph, 0)
    : nodeGraphGraphNodeIndexFromValue(graph, selectedIndex);
  const node = graph.nodes[index] || graph.nodes[0];
  const values = {
    x: node?.x,
    y: node?.y,
    c: node?.c,
    tension: Number(owner?.params?.tension),
  };
  for (const input of strip.querySelectorAll("input[data-graph-strip-field]")) {
    if (document.activeElement === input) {
      continue;
    }
    const key = input.dataset.graphStripField;
    const raw = values[key];
    const n = Number(raw);
    input.value = Number.isFinite(n) ? String(Number(n.toPrecision(8))) : "";
    if (key === "x") {
      const last = graph.nodes.length - 1;
      input.readOnly = index <= 0 || index >= last;
    } else {
      input.readOnly = false;
    }
  }
  strip.dataset.selectedIndex = String(index);
}

function commitNodeGraphGraphPointStripField(input) {
  if (!input || !input.dataset?.graphStripField) {
    return;
  }
  const strip = input.closest(".node-module-graph-point-strip");
  const { display, nodeId, patchNode: sourceNode } = nodeGraphGraphPointStripOwnerFromStrip(strip);
  if (!sourceNode || (typeof nodeGraphModuleIsGraphType === "function" && !nodeGraphModuleIsGraphType(sourceNode.type))) {
    return;
  }
  const field = input.dataset.graphStripField;
  const raw = String(input.value ?? "").trim();
  if (raw === "" || raw === "-" || raw === "." || raw === "-." || /e$/i.test(raw) || /-$/.test(raw)) {
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    syncNodeGraphGraphPointStrip(display, sourceNode);
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode || (typeof nodeGraphModuleIsGraphType === "function" && !nodeGraphModuleIsGraphType(targetNode.type))) {
    return;
  }
  const graph = nodeGraphGraphForNode(targetNode);
  const index = nodeGraphGraphSelectedNodeIndex(nodeId, graph, Number(strip?.dataset?.selectedIndex) || 0);

  if (field === "tension") {
    if (String(targetNode.type) !== "smoothGraph") {
      return;
    }
    targetNode.params = {
      ...(targetNode.params || {}),
      tension: normalizeNodeGraphGraphNumber(value, Number(targetNode.params?.tension) ?? 1, 0, 1),
    };
    commitNodeGraphPatch(patch, { status: "graph tension edited" });
    if (typeof syncNodeGraphGraphDisplaysForNode === "function") {
      syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
    }
    syncNodeGraphGraphPointStrip(display, targetNode, index);
    const slider = typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(nodeId)?.querySelector?.('input[data-param="tension"]')
      : null;
    if (slider && document.activeElement !== slider) {
      slider.value = String(targetNode.params.tension);
      if (typeof syncNodeSliderReadout === "function") {
        syncNodeSliderReadout(slider);
      }
    }
    return;
  }

  const nodes = graph.nodes.map((node) => ({ ...node }));
  const current = nodes[index];
  if (!current) {
    return;
  }
  if (field === "x") {
    const constrained = nodeGraphGraphConstrainedNodePoint(graph, index, { x: value, y: current.y });
    nodes[index] = normalizeNodeGraphGraphNode({ ...current, x: constrained.x }, index);
  } else if (field === "y") {
    const constrained = nodeGraphGraphConstrainedNodePoint(graph, index, { x: current.x, y: value });
    nodes[index] = normalizeNodeGraphGraphNode({ ...current, y: constrained.y }, index);
  } else if (field === "c") {
    if (!nodeGraphGraphUsesPerNodeContour(targetNode.type)) {
      return;
    }
    nodes[index] = normalizeNodeGraphGraphNode({
      ...current,
      c: nodeGraphGraphNormalizeContour(value, current.c),
    }, index);
  } else {
    return;
  }

  let nextGraph = normalizeNodeGraphGraph({ ...graph, nodes });
  if (typeof nodeGraphGraphEndpointYLockEnabledForNode === "function"
    && nodeGraphGraphEndpointYLockEnabledForNode(targetNode)) {
    nextGraph = nodeGraphGraphWithLockedEndpointY(nextGraph, index);
  }
  targetNode.graph = nextGraph;
  if (typeof syncNodeGraphGraphPhaseParameterFromCursor === "function") {
    syncNodeGraphGraphPhaseParameterFromCursor(targetNode);
  }
  commitNodeGraphPatch(patch, { status: "graph point edited" });
  setNodeGraphGraphSelectedNodeIndex(nodeId, targetNode.graph, index);
  if (typeof syncNodeGraphGraphDisplaysForNode === "function") {
    syncNodeGraphGraphDisplaysForNode(nodeId, targetNode);
  }
  syncNodeGraphGraphPointStrip(display, targetNode, index);
  if (typeof syncNodeGraphGraphControls === "function") {
    syncNodeGraphGraphControls(targetNode.graph, index, { nodeId, face: false });
  }
}
