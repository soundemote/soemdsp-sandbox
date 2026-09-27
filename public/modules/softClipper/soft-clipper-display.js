// Soft Clipper face -- observer-only transfer curve (Threshold / Knee visual).
// Mirrors native soft_clipper.cpp shaping for display; does not process audio.

function createNodeGraphSoftClipperCurveDisplay(nodeId, type) {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-soft-clipper-curve-display";
  section.dataset.node = id;
  section.dataset.nodeType = type || "softClipper";
  section.dataset.parameterVisual = "true";
  section.syncFromParameters = () => {
    section._softClipForceDraw = true;
    if (typeof syncFaceMetrics === "function") {
      syncFaceMetrics(section);
    }
    drawNodeGraphSoftClipperCurveDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-soft-clipper-curve-canvas";
  section.append(canvas);
  if (typeof ResizeObserver === "function" && !section._softClipResizeObs) {
    const ro = new ResizeObserver(() => {
      if (!section.isConnected) return;
      if (typeof syncFaceMetrics === "function") syncFaceMetrics(section);
      section._softClipForceDraw = true;
      drawNodeGraphSoftClipperCurveDisplay(section);
    });
    try {
      ro.observe(section);
      section._softClipResizeObs = ro;
    } catch (_error) {
      // Ignore.
    }
  }
  requestAnimationFrame(() => drawNodeGraphSoftClipperCurveDisplay(section));
  return section;
}

function nodeGraphSoftClipperLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

// Display twin of soft_clipper.cpp shape_one (params only -- not audio DSP).
function nodeGraphSoftClipperTransferY(x, drive, threshold, knee, amplitude) {
  const d = Math.max(0, Number.isFinite(drive) ? drive : 1);
  let thr = Number.isFinite(threshold) ? threshold : 1;
  thr = thr < 0 ? 0 : thr > 1 ? 1 : thr;
  let kn = Number.isFinite(knee) ? knee : 0.5;
  kn = kn < 0 ? 0 : kn > 1 ? 1 : kn;
  let amp = Number.isFinite(amplitude) ? amplitude : 1;
  amp = amp < 0 ? 0 : amp > 1 ? 1 : amp;
  const xin = x * d;
  const ax = Math.abs(xin);
  const sign = xin < 0 ? -1 : 1;
  if (ax <= thr) return amp * xin;
  if (kn <= 1e-4) return amp * sign * thr;
  const span = Math.max(1e-6, 1 - thr);
  const knSafe = Math.max(1e-4, kn);
  const width = 2 * span * knSafe;
  const safeWidth = Math.abs(width) > 1e-6 ? Math.abs(width) : 2;
  const sx = 2 / safeWidth;
  const shx = -1 - (sx * (0 - 0.5 * safeWidth));
  const sy = 1 / sx;
  const shy = -shx * sy;
  const excess = ax - thr;
  const u = sx * excess + shx;
  const r = Math.sqrt(1 + u * u);
  const tanhApprox = r <= 0 ? 0 : u / r;
  const y = shy + sy * tanhApprox;
  const shaped = sy > 1e-12 ? y * (span / sy) : 0;
  return amp * sign * (thr + shaped);
}

function drawNodeGraphSoftClipperCurveDisplay(section) {
  try {
    drawNodeGraphSoftClipperCurveDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[soft-clipper-curve] draw failed", detail, error);
  }
}

function drawNodeGraphSoftClipperCurveDisplayInner(section) {
  const node = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(section?.dataset?.node || "")
    : null;
  const canvas = section?.querySelector?.(".node-soft-clipper-curve-canvas");
  if (!node || !canvas) return;

  const metrics = typeof nodeGraphSizeDisplayCanvas === "function"
    ? nodeGraphSizeDisplayCanvas(section, canvas)
    : null;
  if (!metrics) return;
  const { context, cssHeight: height, cssWidth: width, pixelRatio } = metrics;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const drive = nodeGraphSoftClipperLiveParam(node, "drive", 1);
  const threshold = nodeGraphSoftClipperLiveParam(node, "threshold", 1);
  const knee = nodeGraphSoftClipperLiveParam(node, "knee", 0.5);
  const amplitude = nodeGraphSoftClipperLiveParam(node, "amplitude", 1);
  const signature = `${drive}|${threshold}|${knee}|${amplitude}|${width}|${height}`;
  if (
    section._softClipSignature === signature
    && !section._softClipForceDraw
  ) {
    return;
  }

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
  context.beginPath();
  context.moveTo(width * 0.5, 0);
  context.lineTo(width * 0.5, height);
  context.stroke();
  context.beginPath();
  context.moveTo(0, height * 0.5);
  context.lineTo(width, height * 0.5);
  context.stroke();

  const xMin = -1.25;
  const xMax = 1.25;
  const yMin = -1.25;
  const yMax = 1.25;
  const toX = (x) => ((x - xMin) / (xMax - xMin)) * width;
  const toY = (y) => (1 - (y - yMin) / (yMax - yMin)) * height;

  const thr = Math.max(0, Math.min(1, threshold));
  const kn = Math.max(0, Math.min(1, knee));
  context.strokeStyle = "rgba(226, 168, 109, 0.55)";
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(toX(thr), 0);
  context.lineTo(toX(thr), height);
  context.stroke();
  context.beginPath();
  context.moveTo(toX(-thr), 0);
  context.lineTo(toX(-thr), height);
  context.stroke();
  const kneeEnd = thr + (1 - thr) * kn;
  if (kn > 1e-4 && Math.abs(kneeEnd - thr) > 1e-4) {
    context.strokeStyle = "rgba(160, 255, 180, 0.4)";
    context.beginPath();
    context.moveTo(toX(kneeEnd), 0);
    context.lineTo(toX(kneeEnd), height);
    context.stroke();
    context.beginPath();
    context.moveTo(toX(-kneeEnd), 0);
    context.lineTo(toX(-kneeEnd), height);
    context.stroke();
  }
  context.setLineDash([]);

  context.strokeStyle = "rgba(127, 199, 217, 0.28)";
  context.beginPath();
  context.moveTo(toX(xMin), toY(xMin));
  context.lineTo(toX(xMax), toY(xMax));
  context.stroke();

  const pts = Math.max(64, Math.floor(width));
  context.strokeStyle = "rgb(160, 255, 180)";
  context.lineWidth = typeof nodeGraphFaceStrokeWidth === "function"
    ? nodeGraphFaceStrokeWidth(section, 1.5)
    : 1.5;
  context.beginPath();
  for (let i = 0; i < pts; i += 1) {
    const t = i / (pts - 1);
    const x = xMin + t * (xMax - xMin);
    const y = nodeGraphSoftClipperTransferY(x, drive, threshold, knee, amplitude);
    const px = toX(x);
    const py = toY(y);
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();

  section._softClipSignature = signature;
  section._softClipForceDraw = false;
}
