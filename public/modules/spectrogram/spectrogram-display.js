// Spectrogram SG-1 style spectrogram display renderer.
// Receives smoothed spectrum data from the worklet via nodeGraphDataBus
// and renders a scrolling waterfall spectrogram with color-ramped frequency bins.
//
// Colors: cool blues/cyans for quiet → hot yellow/red for loud.

const spectrogramColorRamp = (function buildSpectrogramColorRamp() {
  // 256-entry lookup: index 0 = silent (black/transparent), index 255 = loudest
  const lut = new Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r, g, b;
    if (t < 0.25) {
      // Black → dark blue
      const s = t / 0.25;
      r = 0;
      g = 0;
      b = Math.floor(64 + 128 * s);
    } else if (t < 0.5) {
      // Dark blue → cyan
      const s = (t - 0.25) / 0.25;
      r = 0;
      g = Math.floor(128 + 127 * s);
      b = 192 + Math.floor(63 * (1 - s));
    } else if (t < 0.75) {
      // Cyan → yellow
      const s = (t - 0.5) / 0.25;
      r = Math.floor(255 * s);
      g = 255;
      b = Math.floor(63 * (1 - s));
    } else {
      // Yellow → white-hot
      const s = (t - 0.75) / 0.25;
      r = 255;
      g = 255 - Math.floor(128 * s);
      b = Math.floor(255 * s * 0.5);
    }
    lut[i] = `rgb(${r},${g},${b})`;
  }
  return lut;
})();

function drawNodeGraphSpectrogramItem(renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) return;

  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const node = nodeGraphPatchNode(nodeId);
  const brightness = Math.max(0.1, Math.min(2, Number(node?.params?.brightness) || 1));

  // Get latest spectrum data
  const spectrum = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "Spectrum"));
  const meta = nodeGraphDataBus.get(nodeGraphDataBusKey(nodeId, "FftSize"));

  const bins = (spectrum instanceof Float32Array) ? spectrum.length : 0;
  if (!bins) return;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // Scroll existing content left by one column
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(canvas, -1, 0);

  // Draw new column on the right edge
  const columnX = canvasWidth - 1;
  const colWidth = Math.max(2, Math.ceil(canvasWidth / 200)); // ~200 columns visible

  // Fill the new column area with background
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(columnX, 0, colWidth, canvasHeight);

  // Draw each frequency bin as a horizontal bar
  const barHeight = Math.max(1, canvasHeight / bins);

  // Find max value for normalization
  let maxVal = 0.01;
  for (let i = 0; i < bins; i++) {
    if (spectrum[i] > maxVal) maxVal = spectrum[i];
  }

  for (let i = 0; i < bins; i++) {
    const normalized = Math.min(1, (spectrum[i] / maxVal) * brightness);
    const colorIdx = Math.floor(normalized * 255);
    ctx.fillStyle = spectrogramColorRamp[Math.min(255, colorIdx)];

    // Y is inverted: low frequencies at bottom, high at top
    const y = canvasHeight - Math.floor((i + 1) * barHeight);
    const h = Math.max(1, Math.ceil(barHeight));
    ctx.fillRect(columnX, Math.max(0, y), colWidth, h);
  }
}

// Self-register: called from node-graph-module-scopes.js drawNodeGraphModuleScopeTypedItem
nodeGraphModuleScopeCustomRenderers.spectrogramBurn = drawNodeGraphSpectrogramItem;
