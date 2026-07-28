// Oscilloscope Bank — phase × amplitude stems on the canonical mono energy
// phosphor drawer (shared WebGL energy + LUT). Pan no longer recolors each
// stem (energy is monochrome); peak color is fixed cyan-green phosphor.

function drawNodeGraphOscilloscopeBankBurnItem(renderer, item, pixelRatio) {
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

  const phases = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(nodeId, "Phases")
    : null;
  const amplitudes = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(nodeId, "Amplitudes")
    : null;
  if (!Array.isArray(phases) || !phases.length || !Array.isArray(amplitudes) || !amplitudes.length) {
    // Still run energy path so residual fades.
    if (typeof drawNodeGraphScope2dEnergyBurnPath === "function") {
      drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, [], {
        burn: 0.4,
        decay: 0.28,
        dot1Brightness: 0.9,
        dot1Color: "#5dff9a",
        dot1Size: 0.02,
        lineThickness: 0.2,
        pixelDensity: 1,
        dotBudget: 4096,
      });
    }
    return;
  }

  const pathPoints = [];
  const centerY = canvas.height * 0.5;
  const halfHeight = canvas.height * 0.5;
  const spacing = Math.max(1.25, canvas.height / 64);
  const count = Math.min(phases.length, amplitudes.length);
  const drawer = typeof PhosphorDrawer !== "undefined" ? PhosphorDrawer : null;

  for (let i = 0; i < count; i += 1) {
    const phase = Number(phases[i]);
    const amplitude = Number(amplitudes[i]);
    if (!Number.isFinite(phase) || !Number.isFinite(amplitude)) {
      continue;
    }
    const x = clampNodeSliderValue(phase, 0, 1) * canvas.width;
    const y = centerY - clampNodeSliderValue(amplitude, -1.5, 1.5) * halfHeight;
    if (drawer) {
      drawer.appendSegment(pathPoints, x, centerY, x, y, spacing);
    } else {
      pathPoints.push({ x, y: centerY }, { x, y });
      pathPoints.push(null);
    }
  }

  const minSide = Math.max(1, Math.min(canvas.width, canvas.height));
  const settings = {
    burn: 0.62,
    decay: 0.2,
    dot1Brightness: 0.95,
    dot1Color: "#5dff9a",
    dot1Enabled: true,
    dot1Size: Math.max(0.01, Math.min(0.05, 4 / minSide)),
    lineThickness: 0.22,
    pixelDensity: 1,
    dotBudget: 4096,
  };

  if (typeof drawNodeGraphScope2dEnergyBurnPath === "function") {
    drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, pathPoints, settings, {
      endFrame: Number(item?.buffer?.nodeGraphScopeAbsoluteFrame),
    });
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.oscilloscopeBankBurn = drawNodeGraphOscilloscopeBankBurnItem;
}
