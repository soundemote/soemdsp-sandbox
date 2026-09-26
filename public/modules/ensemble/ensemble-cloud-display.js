// Ensemble cloud: delay-ms on X, time waterfalls up, pan as red (L) / blue (R).
// Ink sizes follow APP_POLICY §15 (faceInkPx vs face min-edge). Pixel
// density only changes backing store, not authored CSS size.

function normalizeNodeGraphEnsembleCloudSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const n = Number(src.cloudSpeed);
  return {
    cloudSpeed: Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 1,
  };
}

function nodeGraphEnsembleCloudSettings(node) {
  return normalizeNodeGraphEnsembleCloudSettings(node?.traceDisplaySettings);
}

function drawNodeGraphEnsembleCloudItem(_renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(item.slot)
    : null;
  const settings = nodeGraphEnsembleCloudSettings(node);
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(item?.slot)
    : null;
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : Math.max(0, Math.min(1, Number(settings.pixelDensity) || 1));
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio, density)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const delays = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(String(nodeId), "Delays"))
    : null;
  const pans = typeof nodeGraphDataBus !== "undefined"
    ? nodeGraphDataBus.get(nodeGraphDataBusKey(String(nodeId), "Pans"))
    : null;
  const bgHex = "#000000";
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(screenElement, bgHex);
  }
  const w = canvas.width;
  const h = canvas.height;
  if (!(w > 0) || !(h > 0)) {
    return;
  }
  const metrics = typeof ensureFaceMetrics === "function"
    ? ensureFaceMetrics(screenElement, { observe: true })
    : null;
  const cssW = Math.max(1, Number(metrics?.cssW) || w);
  const cssH = Math.max(1, Number(metrics?.cssH) || h);
  const minSide = faceMinSide(cssW, cssH);
  const bufPerCss = w / cssW;
  const ink = (px) => Math.max(1, Math.round(faceInkPx(px, minSide) * bufPerCss));
  const speed = Math.max(0, Number(settings.cloudSpeed));
  let scrollPx = Math.round(ink(1.5) * speed);
  if (speed > 0 && scrollPx < 1) {
    scrollPx = 1;
  }
  const sparkW = Math.max(2, ink(2));
  const sparkH = Math.max(1, scrollPx);

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  if (scrollPx > 0) {
    context.globalCompositeOperation = "copy";
    context.drawImage(canvas, 0, -scrollPx);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = bgHex;
    context.fillRect(0, h - scrollPx, w, scrollPx);
  }

  if (!Array.isArray(delays) || !delays.length || scrollPx <= 0) {
    context.restore();
    return;
  }

  context.globalCompositeOperation = "lighter";
  const y = h - scrollPx;
  const n = delays.length;
  for (let i = 0; i < n; i += 1) {
    const x01 = Math.max(0, Math.min(1, Number(delays[i]) || 0));
    const pan = Math.max(0, Math.min(1, Number(pans && pans[i]) || 0.5));
    const x = Math.round(x01 * Math.max(1, w - sparkW));
    const r = Math.round(242 * (1 - pan));
    const b = Math.round(77 + (178 * pan));
    context.fillStyle = `rgb(${r},40,${b})`;
    context.fillRect(x, y, sparkW, sparkH);
  }
  context.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.ensembleCloud = drawNodeGraphEnsembleCloudItem;
}
