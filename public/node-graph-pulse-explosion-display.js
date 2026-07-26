// Node-level display for the Pulse Explosion module: draws the probability
// density curve used by rejection sampling (see the "pulseCurve" layout and
// native_modules/pulse_explosion/pulse_explosion.cpp's header comment for the
// shape's derivation) plus dots at the exact pre-calculated pulse positions
// that a trigger with the node's current seed/parameters will actually play.

function createNodeGraphPulseCurveDisplay(nodeId, type) {
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-pulse-curve-display";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-pulse-curve-canvas";
  section.append(canvas);
  requestAnimationFrame(() => drawNodeGraphPulseCurveDisplay(section));
  return section;
}

function nodeGraphPulseCurveNodeParams(node) {
  return {
    startTime: Number(node?.params?.startTime) || 0,
    centerTime: Number(node?.params?.centerTime) || 0.5,
    endTime: Number(node?.params?.endTime) || 1,
    timeSpread: Number(node?.params?.timeSpread) || 0.3,
    numberOfPulses: Number(node?.params?.numberOfPulses) || 20,
    lowAmplitude: Number(node?.params?.lowAmplitude) || 0.3,
    highAmplitude: Number(node?.params?.highAmplitude) || 1,
    seed: Number(node?.params?.seed) || 0,
  };
}

function drawNodeGraphPulseCurveDisplay(section) {
  const node = nodeGraphPatchNode(section?.dataset?.node || "");
  const canvas = section?.querySelector?.(".node-pulse-curve-canvas");
  if (!node || !canvas) {
    return;
  }
  const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
  if (!metrics) {
    return;
  }
  const { context, cssHeight: height, cssWidth: width, pixelRatio } = metrics;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const params = nodeGraphPulseCurveNodeParams(node);
  const safeStart = Math.max(0, params.startTime);
  let safeEnd = params.endTime;
  if (safeEnd <= safeStart) safeEnd = safeStart + 0.001;
  let safeCenter = Math.max(safeStart, Math.min(safeEnd, params.centerTime));
  if (safeCenter <= safeStart) safeCenter = safeStart + 1e-6;
  if (safeCenter >= safeEnd) safeCenter = safeEnd - 1e-6;
  const skew = -0.99 + 1.98 * Math.max(0, Math.min(1, params.timeSpread));
  const span = Math.max(1e-6, safeEnd - safeStart);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(127, 199, 217, 0.18)";
  context.lineWidth = 1;
  for (let line = 0; line <= 4; line += 1) {
    const y = (line / 4) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const timeToX = (t) => ((t - safeStart) / span) * width;
  const densityToY = (d) => (1 - Math.max(0, Math.min(1, d))) * height;

  // Guide lines at start / center / end.
  context.strokeStyle = "rgba(226, 168, 109, 0.5)";
  context.lineWidth = 1;
  for (const t of [safeStart, safeCenter, safeEnd]) {
    const x = timeToX(t);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  // Density curve.
  context.strokeStyle = "rgba(61, 224, 255, 0.95)";
  context.lineWidth = 1.5;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const t = safeStart + (x / Math.max(1, width - 1)) * span;
    const density = nodeGraphPulseExplosionDensity(t, safeStart, safeCenter, safeEnd, skew);
    const y = densityToY(density);
    if (x === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();

  // Pre-calculated pulse positions: the exact schedule that a trigger with
  // this node's current seed/parameters would produce.
  const schedule = nodeGraphPulseExplosionComputeSchedule(params, nodeGraphPulseExplosionRandomFn(params.seed));
  context.fillStyle = "rgba(255, 214, 102, 0.92)";
  for (const pulse of schedule.pulses) {
    const x = timeToX(pulse.time);
    const density = nodeGraphPulseExplosionDensity(pulse.time, safeStart, safeCenter, safeEnd, skew);
    const y = densityToY(density);
    context.beginPath();
    context.arc(x, y, 2.25, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(229, 238, 242, 0.74)";
  context.font = "600 10px system-ui, sans-serif";
  context.fillText(`${schedule.pulses.length} pulses${params.seed ? ` · seed ${params.seed}` : ""}`, 8, 14);
}
