// Phone Tone face: cheap split-screen ƒ1 | ƒ2 Hz readout.
// Font + colors match Pitch Detector's 8ve/meta strip (Cascadia Mono),
// not DSEG / LED / LCD.

const NODE_GRAPH_PHONE_TONE_FACE_FONT =
  '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace';

function nodeGraphPhoneToneFaceFormatHz(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return "—";
  }
  if (Math.abs(n - Math.round(n)) < 0.05) {
    return String(Math.round(n));
  }
  return n.toFixed(1);
}

function drawNodeGraphPhoneToneFacePane(ctx, cx, maxW, label, hz, labelSize, valueSize, unitSize, labelY, valueY, unitY) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = Math.max(2, labelSize * 0.35);
  ctx.shadowOffsetY = 1;

  ctx.font = `700 ${labelSize}px ${NODE_GRAPH_PHONE_TONE_FACE_FONT}`;
  ctx.fillStyle = "rgba(160, 167, 176, 0.9)";
  ctx.fillText(label, cx, labelY, maxW);

  ctx.font = `700 ${valueSize}px ${NODE_GRAPH_PHONE_TONE_FACE_FONT}`;
  ctx.fillStyle = "rgba(160, 214, 228, 0.98)";
  ctx.fillText(hz, cx, valueY, maxW);

  ctx.font = `700 ${unitSize}px ${NODE_GRAPH_PHONE_TONE_FACE_FONT}`;
  ctx.fillStyle = "rgba(160, 167, 176, 0.82)";
  ctx.fillText("Hz", cx, unitY, maxW);
}

function nodeGraphPhoneToneFaceHasInput(nodeId, port) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return false;
  }
  return nodeGraphModuleScopeConnectionsTo(nodeId, port).some(
    (candidate) => candidate?.sourceNode && candidate?.sourcePort,
  );
}

function nodeGraphPhoneToneFaceInputValue(nodeId, port) {
  if (typeof nodeGraphModuleScopeConnectedSourceBuffer !== "function") {
    return 0;
  }
  const buffer = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port);
  if (!buffer?.length) {
    return 0;
  }
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const value = Number(buffer[index]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function nodeGraphPhoneToneFaceHzPair(nodeId) {
  const reported1 = typeof nodeGraphModuleScopeLatestOutputValue === "function"
    ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Df1", Number.NaN)
    : Number.NaN;
  const reported2 = typeof nodeGraphModuleScopeLatestOutputValue === "function"
    ? nodeGraphModuleScopeLatestOutputValue(nodeId, "Df2", Number.NaN)
    : Number.NaN;
  if (Number.isFinite(reported1) && Number.isFinite(reported2) && (reported1 > 0 || reported2 > 0)) {
    return [reported1, reported2];
  }
  const hasAnalog = nodeGraphPhoneToneFaceHasInput(nodeId, "Analog");
  const hasDigital = nodeGraphPhoneToneFaceHasInput(nodeId, "Digital");
  const analogSlot = hasAnalog && typeof nodeGraphPhoneToneAnalogSlot === "function"
    ? nodeGraphPhoneToneAnalogSlot(nodeGraphPhoneToneFaceInputValue(nodeId, "Analog"))
    : null;
  const digitalSlot = hasDigital && typeof nodeGraphPhoneToneDigitalSlot === "function"
    ? nodeGraphPhoneToneDigitalSlot(nodeGraphPhoneToneFaceInputValue(nodeId, "Digital"))
    : null;
  const slot = digitalSlot != null ? digitalSlot : analogSlot;
  if (slot == null || typeof nodeGraphPhoneTonePair !== "function") {
    return [0, 0];
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const offset = Number(node?.params?.freqOffset);
  const freqOffset = Number.isFinite(offset) ? offset : 0;
  const pair = nodeGraphPhoneTonePair(slot);
  return [pair[0] + freqOffset, pair[1] + freqOffset];
}

function drawNodeGraphPhoneToneFaceItem(_renderer, item, pixelRatio) {
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
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const pair = nodeGraphPhoneToneFaceHzPair(nodeId);
  const f1 = pair[0];
  const f2 = pair[1];
  const left = nodeGraphPhoneToneFaceFormatHz(f1);
  const right = nodeGraphPhoneToneFaceFormatHz(f2);
  if (
    canvas._phoneToneFaceLeft === left
    && canvas._phoneToneFaceRight === right
    && canvas._phoneToneFaceW === canvas.width
    && canvas._phoneToneFaceH === canvas.height
  ) {
    return;
  }
  canvas._phoneToneFaceLeft = left;
  canvas._phoneToneFaceRight = right;
  canvas._phoneToneFaceW = canvas.width;
  canvas._phoneToneFaceH = canvas.height;

  const w = canvas.width;
  const h = canvas.height;
  const mid = Math.round(w * 0.5);
  const paneW = Math.max(8, mid - 8);
  ctx.save();
  ctx.fillStyle = "#000004";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(127, 199, 217, 0.22)";
  ctx.fillRect(mid, Math.round(h * 0.12), 1, Math.round(h * 0.76));

  const labelSize = Math.max(9, Math.min(h * 0.18, w * 0.07));
  const valueSize = Math.max(12, Math.min(h * 0.36, (w * 0.5) * 0.24));
  const unitSize = Math.max(8, Math.min(h * 0.16, w * 0.055));
  const labelY = h * 0.2;
  const valueY = h * 0.54;
  const unitY = h * 0.82;

  drawNodeGraphPhoneToneFacePane(
    ctx, w * 0.25, paneW, "ƒ1", left, labelSize, valueSize, unitSize, labelY, valueY, unitY,
  );
  drawNodeGraphPhoneToneFacePane(
    ctx, w * 0.75, paneW, "ƒ2", right, labelSize, valueSize, unitSize, labelY, valueY, unitY,
  );
  ctx.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.phoneToneFace = drawNodeGraphPhoneToneFaceItem;
}
