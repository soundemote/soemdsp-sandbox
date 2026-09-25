// Ensemble cloud: delay-ms on X, time waterfalls up, pan as red (L) / blue (R).

function drawNodeGraphEnsembleCloudItem(_renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(item?.slot)
    : null;
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
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
  const bgHex = typeof nodeGraphFacePlateBackground === "function"
    ? nodeGraphFacePlateBackground({ background: "#000004" })
    : "#000004";
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(screenElement, bgHex);
  }
  const w = canvas.width;
  const h = canvas.height;
  if (!(w > 0) || !(h > 0)) {
    return;
  }
  const scrollPx = Math.max(1, Math.round((pixelRatio > 1 ? pixelRatio : 1)));
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  context.globalCompositeOperation = "copy";
  context.drawImage(canvas, 0, -scrollPx);
  context.globalCompositeOperation = "source-over";
  context.fillStyle = bgHex;
  context.fillRect(0, h - scrollPx, w, scrollPx);

  if (!Array.isArray(delays) || !delays.length) {
    context.restore();
    return;
  }

  context.globalCompositeOperation = "lighter";
  const sparkH = Math.max(scrollPx, Math.round(2 * (pixelRatio || 1)));
  const sparkW = Math.max(2, Math.round(2 * (pixelRatio || 1)));
  const y = h - sparkH;
  const n = delays.length;
  for (let i = 0; i < n; i += 1) {
    const x01 = Math.max(0, Math.min(1, Number(delays[i]) || 0));
    const pan = Math.max(0, Math.min(1, Number(pans && pans[i]) || 0.5));
    const x = Math.round(x01 * (w - sparkW));
    const r = Math.round(242 * (1 - pan));
    const b = Math.round(77 + (255 - 77) * pan);
    context.fillStyle = `rgb(${r},40,${b})`;
    context.fillRect(x, y, sparkW, sparkH);
  }
  context.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.ensembleCloud = drawNodeGraphEnsembleCloudItem;
}
