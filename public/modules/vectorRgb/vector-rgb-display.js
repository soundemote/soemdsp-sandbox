// Vector RGB — 2D vectorscope. Color from R/G/B streams; X/Y aim the beam.
// Paint: DestFade (Residual hang) + delta capture + batched WebGL RGB points.
// No full-history polyline restroke. Canvas2d arcs only if WebGL is unavailable.

const nodeGraphVectorRgbSettingsDefaults = Object.freeze({
  background: "#000000",
  burn: 0,
  dot1Brightness: 1,
  dot1Size: 0.08,
  // Mid Ghost ≈ DestFade erase 0.008 (sweet hang); see PhosphorResidual.destFadeAmount.
  ghost: 0.35,
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
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const trail = Residual?.migrateTrail
    ? Residual.migrateTrail(source, d.trail)
    : Math.max(0, Math.min(1, num("trail", d.trail)));
  const ghost = Residual?.migrateGhost
    ? Residual.migrateGhost(source, d.ghost)
    : Math.max(0, Math.min(1, num("ghost", d.ghost)));
  return {
    background,
    burn: Math.max(0, Math.min(1, num("burn", d.burn))),
    dot1Brightness: Math.max(0, Math.min(1, num("dot1Brightness", d.dot1Brightness))),
    dot1Size: Math.max(0, Math.min(1, num("dot1Size", d.dot1Size))),
    ghost,
    pixelDensity: Math.max(0, Math.min(1, num("pixelDensity", d.pixelDensity))),
    scale: Math.max(0.05, Math.min(8, num("scale", d.scale))),
    trail,
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
  // Cap catch-up after tab sleep — residual is the trail, not a history restroke.
  const maxCatch = Math.min(available, Math.ceil(sampleRate * 0.25));
  const frames = Math.min(available, want, maxCatch);
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

function nodeGraphVectorRgbStampArcs(ctx, packed, count, radius) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i += 1) {
    const o = i * 5;
    const x = packed[o];
    const y = packed[o + 1];
    const r = packed[o + 2];
    const g = packed[o + 3];
    const b = packed[o + 4];
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  const sizeKey = `${canvas.width}x${canvas.height}`;
  if (canvas._vectorRgbSizeKey !== sizeKey) {
    canvas._vectorRgbSizeKey = sizeKey;
    canvas._vectorRgbPrimed = false;
    canvas._vectorRgbAbs = 0;
    canvas._vectorRgbPacked = null;
  }
  if (!canvas._vectorRgbPrimed) {
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(ctx, canvas, bg);
    } else {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    canvas._vectorRgbPrimed = true;
  }
  if (frozen) {
    return;
  }

  // Trail = hot wipe; Ghost = separate dim scorch layer (own hang).
  if (typeof nodeGraphScopeDestFadeTowardPlate === "function") {
    nodeGraphScopeDestFadeTowardPlate(ctx, canvas, bg, settings.trail, settings.ghost);
  } else {
    const fade = Math.max(0.02, 1 - settings.trail * 0.97);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const source = nodeGraphRgbPickPortBuffer(slot, "X");
  const sampleRate = Math.max(
    1,
    Number(source?.nodeGraphScopeSampleRate)
      || Number(nodeGraphModuleScopeState?.sampleRate)
      || Number(nodeGraphMvp?.sampleRate)
      || 44100,
  );
  const abs = Math.max(0, Math.floor(Number(source?.nodeGraphScopeTotalSampleCount) || 0));
  const prev = Number(canvas._vectorRgbAbs || 0);
  const deltaSec = prev > 0 && abs > prev ? (abs - prev) / sampleRate : 0;
  const catchUp = prev > 0
    ? Math.min(0.25, Math.max(0.004, deltaSec))
    : 0.05;
  const captured = nodeGraphRgbAlignedCapture(
    slot,
    ["X", "Y", "R", "G", "B", "Blank"],
    catchUp,
  );
  if (abs) {
    canvas._vectorRgbAbs = abs;
  }
  if (!captured?.length) {
    return;
  }

  const w = canvas.width;
  const h = canvas.height;
  const side = Math.min(w, h);
  const ox = (w - side) * 0.5;
  const oy = (h - side) * 0.5;
  const scale = settings.scale;
  const gain = settings.dot1Brightness;
  const radius = Math.max(0.6, side * settings.dot1Size * 0.5);
  const connectionsTo = typeof nodeGraphModuleScopeConnectionsTo === "function"
    ? nodeGraphModuleScopeConnectionsTo
    : () => [];
  const blankWired = connectionsTo(slot.nodeId, "Blank").length > 0;
  const rgbWired = ["R", "G", "B"].some((port) => connectionsTo(slot.nodeId, port).length > 0);

  const floatsPer = typeof TraceRgbPoints !== "undefined" ? TraceRgbPoints.FLOATS : 5;
  let packed = canvas._vectorRgbPacked;
  const need = captured.length * floatsPer;
  if (!(packed instanceof Float32Array) || packed.length < need) {
    packed = new Float32Array(Math.max(need, 4096 * floatsPer));
    canvas._vectorRgbPacked = packed;
  }
  let count = 0;
  for (let i = 0; i < captured.length; i += 1) {
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
    const o = count * floatsPer;
    packed[o] = x;
    packed[o + 1] = y;
    packed[o + 2] = r;
    packed[o + 3] = g;
    packed[o + 4] = b;
    count += 1;
  }
  if (count <= 0) {
    return;
  }
  const stamped = typeof TraceRgbPoints !== "undefined"
    && typeof TraceRgbPoints.stamp === "function"
    && TraceRgbPoints.stamp(ctx, packed, count, { sizePx: radius * 2 });
  if (!stamped) {
    nodeGraphVectorRgbStampArcs(ctx, packed, count, radius);
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.vectorRgbFace = drawNodeGraphVectorRgbFaceItem;
}
