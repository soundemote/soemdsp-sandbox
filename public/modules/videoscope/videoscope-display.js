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
  const paramBrightness = Math.max(0, Math.min(1, Number(node?.params?.brightness) || 1));
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

  // Amplitude zoom: 1 = ±1 fills the face (same contract as scope2d / Trace).
  const ampScale = (() => {
    const raw = Number(face.scale);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 1;
    }
    return typeof clampNodeSliderValue === "function"
      ? clampNodeSliderValue(raw, 0.01, 100)
      : Math.max(0.01, Math.min(100, raw));
  })();

  let pathPoints = [];
  if (mode === 2) {
    pathPoints = nodeGraphVideoscopeBuildXyPath(canvas, nodeId, ampScale);
  } else {
    pathPoints = nodeGraphVideoscopeBuildTracePath(canvas, nodeId, mode === 0, ampScale);
  }

  // No fresh bus data this frame — re-draw last capture so phosphor does not
  // fade to black while the worklet is mid plan-sync / burst drain.
  if (!pathPoints.length) {
    const held = nodeGraphVideoscopeLastCapture.get(String(nodeId));
    if (held && held.mode === mode) {
      if (mode === 2 && held.xyA?.length && held.xyB?.length) {
        pathPoints = nodeGraphVideoscopePathFromXy(canvas, held.xyA, held.xyB, ampScale);
      } else if (held.colMinA?.length && held.colMaxA?.length) {
        pathPoints = nodeGraphVideoscopePathFromColumns(
          canvas,
          held.colMinA,
          held.colMaxA,
          held.colMinB,
          held.colMaxB,
          mode === 0,
          ampScale,
        );
      }
    }
  }

  const look = typeof nodeGraphScopePhosphorLookDefaults !== "undefined"
    ? nodeGraphScopePhosphorLookDefaults
    : null;
  const defaultSize = look?.size ?? 0.0385;
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const settings = {
    background: face.background || look?.background || "#000004",
    ghost: Residual && typeof Residual.migrateGhost === "function"
      ? Residual.migrateGhost(face, look?.ghost ?? 0.55)
      : (Number.isFinite(Number(face.ghost))
        ? Number(face.ghost)
        : (look?.ghost ?? 0.55)),
    trail: Residual && typeof Residual.migrateTrail === "function"
      ? Residual.migrateTrail(face, look?.trail ?? 0.5175)
      : (Number.isFinite(Number(face.trail))
        ? Number(face.trail)
        : (Number.isFinite(Number(face.decay))
          ? 1 - Number(face.decay)
          : (look?.trail ?? 0.5175))),
    burn: Residual && typeof Residual.migrateBurn === "function"
      ? Residual.migrateBurn(face, 0)
      : (
        Number(face.residualSchema) >= 2
          ? Math.max(0, Math.min(1, Number(face.burn) || 0))
          : 0
      ),
    residualSchema: Residual?.RESIDUAL_SCHEMA || 2,
    // Brightness only for deposit (no burn gain coupling).
    dot1Brightness: Number.isFinite(Number(face.dot1Brightness))
      ? Number(face.dot1Brightness) * (paramBrightness / 1)
      : (look?.brightness ?? 1) * (paramBrightness / 1),
    dot1Color: face.dot1Color || look?.peakColor || "#fcfdbf",
    dot1Enabled: true,
    dot1Size: Number.isFinite(Number(face.dot1Size)) ? Number(face.dot1Size) : defaultSize,
    lineThickness: Number.isFinite(Number(face.lineThickness))
      ? Number(face.lineThickness)
      : (look?.blur ?? 0.1062),
    pixelDensity: density,
    dotBudget: Number.isFinite(Number(face.dotBudget))
      ? Number(face.dotBudget)
      : (look?.dotBudget ?? 2048),
    fullDotEconomy: face.fullDotEconomy !== false,
    gradientStops: face.gradientStops || look?.gradientStops || null,
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

function nodeGraphVideoscopeBuildTracePath(canvas, nodeId, dotMode, ampScale = 1) {
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
  return nodeGraphVideoscopePathFromColumns(
    canvas, colMinA, colMaxA, colMinB, colMaxB, dotMode, ampScale,
  );
}

function nodeGraphVideoscopePathFromColumns(
  canvas, colMinA, colMaxA, colMinB, colMaxB, dotMode, ampScale = 1,
) {
  if (!canvas || !colMinA?.length || !colMaxA?.length) {
    return [];
  }
  const gain = Number.isFinite(Number(ampScale)) && Number(ampScale) > 0
    ? Number(ampScale)
    : 1;
  // Soft headroom so peaks can overshoot the face slightly before hard clamp.
  const clampLimit = 1.5 / Math.max(0.25, Math.min(gain, 4));
  const pathPoints = [];
  const centerY = canvas.height * 0.5;
  const halfHeight = canvas.height * 0.5;
  const columns = colMinA.length;
  const colWidth = canvas.width / columns;
  const spacing = Math.max(1.0, canvas.height / 80);
  const drawer = typeof PhosphorDrawer !== "undefined" ? PhosphorDrawer : null;

  const mapY = (sample) => {
    const v = clampNodeSliderValue(sample, -clampLimit, clampLimit) * gain;
    return centerY - v * halfHeight;
  };

  const addChannel = (colMin, colMax) => {
    if (!colMin?.length || !colMax?.length) {
      return;
    }
    const count = Math.min(colMin.length, colMax.length, columns);
    for (let col = 0; col < count; col += 1) {
      const x = (col + 0.5) * colWidth;
      const yMin = mapY(colMin[col]);
      const yMax = mapY(colMax[col]);
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

function nodeGraphVideoscopeBuildXyPath(canvas, nodeId, ampScale = 1) {
  const xyA = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "XyA"));
  const xyB = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "XyB"));
  if (!xyA?.length || !xyB?.length) {
    return [];
  }
  nodeGraphVideoscopeRememberCapture(nodeId, { mode: 2, xyA, xyB });
  return nodeGraphVideoscopePathFromXy(canvas, xyA, xyB, ampScale);
}

function nodeGraphVideoscopePathFromXy(canvas, xyA, xyB, ampScale = 1) {
  if (!canvas || !xyA?.length || !xyB?.length) {
    return [];
  }
  const gain = Number.isFinite(Number(ampScale)) && Number(ampScale) > 0
    ? Number(ampScale)
    : 1;
  const clampLimit = 1.5 / Math.max(0.25, Math.min(gain, 4));
  const centerX = canvas.width * 0.5;
  const centerY = canvas.height * 0.5;
  const halfWidth = canvas.width * 0.5;
  const halfHeight = canvas.height * 0.5;
  const count = Math.min(xyA.length, xyB.length);
  const pathPoints = [];
  for (let i = 0; i < count; i += 1) {
    const ax = clampNodeSliderValue(xyA[i], -clampLimit, clampLimit) * gain;
    const ay = clampNodeSliderValue(xyB[i], -clampLimit, clampLimit) * gain;
    pathPoints.push({
      x: centerX + ax * halfWidth,
      y: centerY - ay * halfHeight,
    });
  }
  return pathPoints;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.videoscopeBurn = drawNodeGraphVideoscopeItem;
}
