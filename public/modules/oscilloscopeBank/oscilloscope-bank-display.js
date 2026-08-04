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
      const look = typeof nodeGraphScopePhosphorLookDefaults !== "undefined"
        ? nodeGraphScopePhosphorLookDefaults
        : null;
      drawNodeGraphScope2dEnergyBurnPath(item, pixelRatio, [], {
        ghost: look?.ghost ?? 0.55,
        trail: look?.trail ?? 0.5175,
        // Color left alone (bank green).
        dot1Brightness: look?.brightness ?? 1,
        dot1Color: "#5dff9a",
        dot1Size: look?.size ?? 0.0385,
        lineThickness: look?.blur ?? 0.1062,
        pixelDensity: look?.pixelDensity ?? 1,
        dotBudget: look?.dotBudget ?? 2048,
        fullDotEconomy: look?.fullDotEconomy !== false,
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

  const look = typeof nodeGraphScopePhosphorLookDefaults !== "undefined"
    ? nodeGraphScopePhosphorLookDefaults
    : null;
  const settings = {
    ghost: look?.ghost ?? 0.55,
    trail: look?.trail ?? 0.5175,
    // Color left alone (bank green).
    dot1Brightness: look?.brightness ?? 1,
    dot1Color: "#5dff9a",
    dot1Enabled: true,
    dot1Size: look?.size ?? 0.0385,
    lineThickness: look?.blur ?? 0.1062,
    pixelDensity: look?.pixelDensity ?? 1,
    dotBudget: look?.dotBudget ?? 2048,
    fullDotEconomy: look?.fullDotEconomy !== false,
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
