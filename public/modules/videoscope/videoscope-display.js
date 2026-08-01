// Videoscope — column min/max envelope or XY on the canonical mono energy
// phosphor drawer (shared WebGL energy + LUT). Dual-channel traces share one
// phosphor color (green); brightness scales deposit gain.
//
// Last-good envelope/XY is held on the node so brief empty dataPorts ticks
// (plan sync when adding a module, main-thread stalls during zoom) do not
// blank the path and decay the phosphor residual away.

/** @type {Map<string, { mode: number, colMinA?: Float32Array, colMaxA?: Float32Array, colMinB?: Float32Array, colMaxB?: Float32Array, xyA?: Float32Array, xyB?: Float32Array }>} */
const nodeGraphVideoscopeLastCapture = new Map();

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

  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const mode = Math.round(Number(node?.params?.mode) || 0);
  // Module brightness param scales deposit; Display Settings owns burn/decay/pen.
  const paramBrightness = Math.max(0.1, Math.min(2, Number(node?.params?.brightness) || 1));
  const face = typeof normalizeNodeGraphScope2dSettings === "function"
    ? normalizeNodeGraphScope2dSettings(node?.traceDisplaySettings)
    : (node?.traceDisplaySettings || {});

  // Size the face once with the same density the energy path will use, so
  // path points are built in the final canvas pixel space.
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(face, 1)
    : (Number.isFinite(Number(face.pixelDensity)) ? Number(face.pixelDensity) : 1);
  const sync = syncNodeGraphScope2dBurnCanvas(canvas, screenElement, pixelRatio, density);
  if (!sync.synced) {
    return;
  }

  let pathPoints = [];
  if (mode === 2) {
    pathPoints = nodeGraphVideoscopeBuildXyPath(canvas, nodeId);
  } else {
    pathPoints = nodeGraphVideoscopeBuildTracePath(canvas, nodeId, mode === 0);
  }

  // No fresh bus data this frame — re-draw last capture so phosphor does not
  // fade to black while the worklet is mid plan-sync / burst drain.
  if (!pathPoints.length) {
    const held = nodeGraphVideoscopeLastCapture.get(String(nodeId));
    if (held && held.mode === mode) {
      if (mode === 2 && held.xyA?.length && held.xyB?.length) {
        pathPoints = nodeGraphVideoscopePathFromXy(canvas, held.xyA, held.xyB);
      } else if (held.colMinA?.length && held.colMaxA?.length) {
        pathPoints = nodeGraphVideoscopePathFromColumns(
          canvas,
          held.colMinA,
          held.colMaxA,
          held.colMinB,
          held.colMaxB,
          mode === 0,
        );
      }
    }
  }

  const minSide = Math.max(1, Math.min(canvas.width, canvas.height));
  const defaultSize = Math.max(0.008, Math.min(0.04, (mode === 0 ? 3.5 : 2.5) / minSide));
  const settings = {
    burn: Number.isFinite(Number(face.burn)) ? Number(face.burn) : Math.min(1, 0.35 + paramBrightness * 0.35),
    decay: Number.isFinite(Number(face.decay)) ? Number(face.decay) : 0.18,
    dot1Brightness: Number.isFinite(Number(face.dot1Brightness))
      ? Number(face.dot1Brightness) * (paramBrightness / 1)
      : Math.min(2, 0.55 + paramBrightness * 0.45),
    dot1Color: face.dot1Color || "#50e090",
    dot1Enabled: true,
    dot1Size: Number.isFinite(Number(face.dot1Size)) ? Number(face.dot1Size) : defaultSize,
    lineThickness: Number.isFinite(Number(face.lineThickness))
      ? Number(face.lineThickness)
      : (mode === 0 ? 0.15 : 0.28),
    pixelDensity: density,
    dotBudget: Number.isFinite(Number(face.dotBudget)) ? Number(face.dotBudget) : 4096,
    gradientStops: face.gradientStops,
  };

  if (typeof drawNodeGraphScope2dEnergyBurnPath === "function") {
    drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, {
      endFrame: Number(item?.buffer?.nodeGraphScopeAbsoluteFrame),
    });
  }
}

function nodeGraphVideoscopeRememberCapture(nodeId, payload) {
  if (!nodeId || !payload) {
    return;
  }
  nodeGraphVideoscopeLastCapture.set(String(nodeId), payload);
}

function nodeGraphVideoscopeBuildTracePath(canvas, nodeId, dotMode) {
  const colMinA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMinA"));
  const colMaxA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMaxA"));
  const colMinB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMinB"));
  const colMaxB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "ColMaxB"));
  if (!colMinA?.length || !colMaxA?.length) {
    return [];
  }
  nodeGraphVideoscopeRememberCapture(nodeId, {
    mode: dotMode ? 0 : 1,
    colMinA,
    colMaxA,
    colMinB,
    colMaxB,
  });
  return nodeGraphVideoscopePathFromColumns(canvas, colMinA, colMaxA, colMinB, colMaxB, dotMode);
}

function nodeGraphVideoscopePathFromColumns(canvas, colMinA, colMaxA, colMinB, colMaxB, dotMode) {
  if (!canvas || !colMinA?.length || !colMaxA?.length) {
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
  nodeGraphVideoscopeRememberCapture(nodeId, { mode: 2, xyA, xyB });
  return nodeGraphVideoscopePathFromXy(canvas, xyA, xyB);
}

function nodeGraphVideoscopePathFromXy(canvas, xyA, xyB) {
  if (!canvas || !xyA?.length || !xyB?.length) {
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
