// Vector RGB — 3-channel phosphor drawer. Color is the R/G/B analog streams,
// not a brightness LUT. Trail fades the RGB residual toward black.

const nodeGraphVectorRgbSettingsDefaults = Object.freeze({
  background: "#000000",
  burn: 0.82,
  dot1Brightness: 1,
  dot1Size: 0.08,
  pixelDensity: 1,
  scale: 1,
  trail: 0.86,
});

function normalizeNodeGraphVectorRgbSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const d = nodeGraphVectorRgbSettingsDefaults;
  const num = (key, fallback) => {
    const n = Number(source[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const background = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(source.background ?? source.backgroundColor, d.background)
    : String(source.background || d.background);
  return {
    background,
    burn: Math.max(0, Math.min(1, num("burn", d.burn))),
    dot1Brightness: Math.max(0, Math.min(1, num("dot1Brightness", d.dot1Brightness))),
    dot1Size: Math.max(0, Math.min(1, num("dot1Size", d.dot1Size))),
    pixelDensity: Math.max(0, Math.min(1, num("pixelDensity", d.pixelDensity))),
    scale: Math.max(0.05, Math.min(8, num("scale", d.scale))),
    trail: Math.max(0, Math.min(1, num("trail", d.trail))),
  };
}

function nodeGraphVectorRgbSettingsForNode(node) {
  return normalizeNodeGraphVectorRgbSettings(node?.traceDisplaySettings);
}

function nodeGraphRgbPickPortBuffer(slot, port) {
  const local = typeof nodeGraphModuleScopeState === "object"
    ? nodeGraphModuleScopeState.buffers.get(`${slot.nodeId}:${port}`)
    : null;
  const connected = typeof nodeGraphModuleScopeConnectedSourceBuffer === "function"
    ? nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, port)
    : null;
  if (typeof nodeGraphScope2dPickRicherBuffer === "function") {
    return nodeGraphScope2dPickRicherBuffer(local, connected);
  }
  return connected || local || null;
}

function nodeGraphRgbAlignedCapture(slot, ports, historySeconds) {
  const rings = ports.map((port) => nodeGraphRgbPickPortBuffer(slot, port));
  const lengths = rings.map((ring) => (ring?.length ? ring.length : 0));
  const present = lengths.filter((n) => n > 0);
  const available = present.length ? Math.min(...present) : 0;
  if (!(available > 0)) {
    return null;
  }
  const sampleRate = Math.max(
    1,
    Number(nodeGraphModuleScopeState?.sampleRate) || Number(nodeGraphMvp?.sampleRate) || 44100,
  );
  const want = Number.isFinite(historySeconds)
    ? Math.min(available, Math.max(1, Math.ceil(Math.max(0, historySeconds) * sampleRate)))
    : available;
  const frames = Math.min(available, want);
  const out = { length: frames };
  for (let p = 0; p < ports.length; p += 1) {
    const ring = rings[p];
    const channel = new Float32Array(frames);
    if (ring?.length) {
      const start = ring.length - frames;
      for (let i = 0; i < frames; i += 1) {
        channel[i] = Number(ring[start + i]) || 0;
      }
    }
    out[ports[p]] = channel;
  }
  return out;
}

function nodeGraphVectorRgbUnitToPx(value, origin, span, scale) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return origin + (0.5 + 0.5 * Math.max(-1, Math.min(1, n * scale))) * span;
}

function drawNodeGraphVectorRgbFaceItem(_renderer, item, pixelRatio) {
  const slot = item?.slot;
  const face = item?.screenElement || slot?.scopeElement;
  if (!slot || !face) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  if (!canvas || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function") {
    return;
  }
  const settings = nodeGraphVectorRgbSettingsForNode(nodeGraphModuleScopeNodeForSlot?.(slot));
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, 1)
    : 1;
  if (!syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, face, pixelRatio, density)) {
    return;
  }
  canvas.style.imageRendering = density < 0.999 ? "pixelated" : "";
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();
  const bg = settings.background;
  if (typeof nodeGraphFacePlateApplyCss === "function") {
    nodeGraphFacePlateApplyCss(face, bg);
  }
  if (!canvas._vectorRgbPrimed) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas._vectorRgbPrimed = true;
  }
  if (frozen) {
    return;
  }

  const source = nodeGraphRgbPickPortBuffer(slot, "X");
  const abs = Math.max(0, Math.floor(Number(source?.nodeGraphScopeTotalSampleCount) || 0));
  const prev = Number(canvas._vectorRgbAbs || 0);
  const history = prev > 0 ? Math.min(0.25, Math.max(1, abs - prev) / 44100) : 0.05;
  const captured = nodeGraphRgbAlignedCapture(slot, ["X", "Y", "R", "G", "B", "Blank"], Math.max(0.004, history));
  if (abs) {
    canvas._vectorRgbAbs = abs;
  }
  const w = canvas.width;
  const h = canvas.height;
  const side = Math.min(w, h);
  const ox = (w - side) * 0.5;
  const oy = (h - side) * 0.5;
  const scale = settings.scale;
  const fade = 1 - settings.trail * 0.97;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(0,0,0,${Math.max(0.02, fade)})`;
  ctx.fillRect(0, 0, w, h);
  if (!captured?.length) {
    ctx.restore();
    return;
  }
  const radius = Math.max(0.6, side * settings.dot1Size * 0.5);
  const gain = settings.dot1Brightness;
  const connectionsTo = typeof nodeGraphModuleScopeConnectionsTo === "function"
    ? nodeGraphModuleScopeConnectionsTo
    : () => [];
  const blankWired = connectionsTo(slot.nodeId, "Blank").length > 0;
  const rgbWired = ["R", "G", "B"].some((port) => connectionsTo(slot.nodeId, port).length > 0);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < captured.length; i += 1) {
    // CRT blanking: high hides the beam. Unwired Blk = always draw.
    if (blankWired && Number(captured.Blank[i]) >= 0.5) {
      continue;
    }
    const x = nodeGraphVectorRgbUnitToPx(captured.X[i], ox, side, scale);
    const y = nodeGraphVectorRgbUnitToPx(-captured.Y[i], oy, side, scale);
    if (x == null || y == null) {
      continue;
    }
    const r = (rgbWired ? Math.max(0, Math.min(1, Number(captured.R[i]) || 0)) : 1) * gain;
    const g = (rgbWired ? Math.max(0, Math.min(1, Number(captured.G[i]) || 0)) : 1) * gain;
    const b = (rgbWired ? Math.max(0, Math.min(1, Number(captured.B[i]) || 0)) : 1) * gain;
    if (r + g + b <= 1e-6) {
      continue;
    }
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.vectorRgbFace = drawNodeGraphVectorRgbFaceItem;
}
