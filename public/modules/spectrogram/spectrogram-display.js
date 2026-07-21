// Spectrogram SG-1 style scrolling waterfall display renderer.
// Uses a persistent off-screen canvas per nodeId so accumulated history
// survives module DOM re-renders (parameter changes, resizes, etc.).
// Colors: black → dark blue → cyan → yellow → white-hot.

const spectrogramColorRamp = (function buildSpectrogramColorRamp() {
  const lut = new Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r, g, b;
    if (t < 0.25) {
      const s = t / 0.25;
      r = 0; g = 0; b = Math.floor(64 + 128 * s);
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      r = 0; g = Math.floor(128 + 127 * s); b = 192 + Math.floor(63 * (1 - s));
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      r = Math.floor(255 * s); g = 255; b = Math.floor(63 * (1 - s));
    } else {
      const s = (t - 0.75) / 0.25;
      r = 255; g = 255 - Math.floor(128 * s); b = Math.floor(255 * s * 0.5);
    }
    lut[i] = `rgb(${r},${g},${b})`;
  }
  return lut;
})();

// Persistent off-screen canvases — one per nodeId, survives DOM rebuilds.
const spectrogramHistory = new Map();

function drawNodeGraphSpectrogramItem(renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) return;

  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !screenElement) return;

  // Resize DOM canvas if needed (this clears it — we don't care, we composite from history)
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const node = nodeGraphPatchNode(nodeId);
  const brightness = Math.max(0.1, Math.min(2, Number(node?.params?.brightness) || 1));

  // Get or create persistent history canvas, resized to match DOM canvas
  let hist = spectrogramHistory.get(nodeId);
  const domWidth = canvas.width;
  const domHeight = canvas.height;
  const colWidth = Math.max(2, Math.ceil(domWidth / 200));

  if (!hist || hist.width !== domWidth || hist.height !== domHeight) {
    // Resize history: preserve old content into new canvas
    const newHist = document.createElement("canvas");
    newHist.width = domWidth;
    newHist.height = domHeight;
    const newCtx = newHist.getContext("2d");
    if (hist && newCtx) {
      newCtx.drawImage(hist, 0, 0, hist.width, hist.height, 0, 0, domWidth, domHeight);
    }
    hist = newHist;
    spectrogramHistory.set(nodeId, hist);
  }

  const histCtx = hist.getContext("2d");
  if (!histCtx) return;

  // Get latest spectrum data
  const spectrum = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "Spectrum"));
  const bins = (spectrum instanceof Float32Array) ? spectrum.length : 0;

  if (bins > 0) {
    // Scroll history canvas left by colWidth
    histCtx.globalCompositeOperation = "copy";
    histCtx.drawImage(hist, -colWidth, 0);

    // Draw new column on the right edge
    histCtx.globalCompositeOperation = "source-over";
    const columnX = domWidth - colWidth;

    const barHeight = Math.max(1, domHeight / bins);
    let maxVal = 0.01;
    for (let i = 0; i < bins; i++) {
      if (spectrum[i] > maxVal) maxVal = spectrum[i];
    }
    for (let i = 0; i < bins; i++) {
      const normalized = Math.min(1, (spectrum[i] / maxVal) * brightness);
      const colorIdx = Math.floor(normalized * 255);
      histCtx.fillStyle = spectrogramColorRamp[Math.min(255, colorIdx)];
      const y = domHeight - Math.floor((i + 1) * barHeight);
      const h = Math.max(1, Math.ceil(barHeight));
      histCtx.fillRect(columnX, Math.max(0, y), colWidth, Math.max(1, h));
    }
  }

  // Composite persistent history onto DOM canvas
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(hist, 0, 0);
}

// Self-register
nodeGraphModuleScopeCustomRenderers.spectrogramBurn = drawNodeGraphSpectrogramItem;
