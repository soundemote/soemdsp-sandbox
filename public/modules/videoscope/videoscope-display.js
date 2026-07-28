// Videoscope — column min/max envelope or XY on the canonical mono energy
// phosphor drawer (shared WebGL energy + LUT). Dual-channel traces share one
// phosphor color (green); brightness scales deposit gain.

function drawNodeGraphVideoscopeItem(renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = typeof nodeGraphScope2dBurnCanvasForSlot === "function"
    ? nodeGraphScope2dBurnCanvasForSlot(item?.slot)
    : null;
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || typeof syncNodeGraphScope2dBurnCanvas !== "function") {
    return;
  }
  const sync = syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, 1);
  if (!sync.synced) {
    return;
  }

  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const mode = Math.round(Number(node?.params?.mode) || 0);
  const brightness = Math.max(0.1, Math.min(2, Number(node?.params?.brightness) || 1));

  let pathPoints = [];
  if (mode === 2) {
    pathPoints = nodeGraphVideoscopeBuildXyPath(canvas, nodeId);
  } else {
    pathPoints = nodeGraphVideoscopeBuildTracePath(canvas, nodeId, mode === 0);
  }

  const minSide = Math.max(1, Math.min(canvas.width, canvas.height));
  const settings = {
    burn: Math.min(1, 0.35 + brightness * 0.35),
    decay: 0.18,
    dot1Brightness: Math.min(2, 0.55 + brightness * 0.45),
    dot1Color: "#50e090",
    dot1Enabled: true,
    dot1Size: Math.max(0.008, Math.min(0.04, (mode === 0 ? 3.5 : 2.5) / minSide)),
    lineThickness: mode === 0 ? 0.15 : 0.28,
    pixelDensity: 1,
    dotBudget: 4096,
  };

  if (typeof drawNodeGraphScope2dEnergyBurnPath === "function") {
    drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, {
      endFrame: Number(item?.buffer?.nodeGraphScopeAbsoluteFrame),
    });
  }
}

function nodeGraphVideoscopeBuildTracePath(canvas, nodeId, dotMode) {
  const colMinA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMinA"));
  const colMaxA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMaxA"));
  const colMinB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMinB"));
  const colMaxB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMaxB"));
  if (!colMinA?.length || !colMaxA?.length) {
    return [];
  }
  const pathPoints = [];
  const centerY = canvas.height * 0.5;
  const halfHeight = canvas.height * 0.5;
  const columns = colMinA.length;
  const colWidth = canvas.width / columns;
  const spacing = Math.max(1.0, canvas.height / 80);
  const drawer = typeof PhosphorDrawer !== "undefined" ? PhosphorDrawer : null;

  const addChannel = (colMin, colMax) => {
    if (!colMin?.length || !colMax?.length) {
      return;
    }
    const count = Math.min(colMin.length, colMax.length, columns);
    for (let col = 0; col < count; col += 1) {
      const x = (col + 0.5) * colWidth;
      const yMin = centerY - clampNodeSliderValue(colMin[col], -1.5, 1.5) * halfHeight;
      const yMax = centerY - clampNodeSliderValue(colMax[col], -1.5, 1.5) * halfHeight;
      if (dotMode) {
        pathPoints.push({ x, y: (yMin + yMax) * 0.5 });
      } else if (drawer) {
        drawer.appendSegment(pathPoints, x, yMin, x, yMax, spacing);
      } else {
        pathPoints.push({ x, y: yMin }, { x, y: yMax }, null);
      }
    }
  };
  addChannel(colMinA, colMaxA);
  addChannel(colMinB, colMaxB);
  return pathPoints;
}

function nodeGraphVideoscopeBuildXyPath(canvas, nodeId) {
  const xyA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "XyA"));
  const xyB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "XyB"));
  if (!xyA?.length || !xyB?.length) {
    return [];
  }
  const centerX = canvas.width * 0.5;
  const centerY = canvas.height * 0.5;
  const halfWidth = canvas.width * 0.5;
  const halfHeight = canvas.height * 0.5;
  const count = Math.min(xyA.length, xyB.length);
  const pathPoints = [];
  for (let i = 0; i < count; i += 1) {
    pathPoints.push({
      x: centerX + clampNodeSliderValue(xyA[i], -1.5, 1.5) * halfWidth,
      y: centerY - clampNodeSliderValue(xyB[i], -1.5, 1.5) * halfHeight,
    });
  }
  return pathPoints;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.videoscopeBurn = drawNodeGraphVideoscopeItem;
}
