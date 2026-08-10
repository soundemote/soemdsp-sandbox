// Phosphor energy / draw helpers extracted from node-graph-module-scopes.js
// (Phase D). Load after scope-normalize, before scopes.js.

// nodeGraphModuleScopePhosphorFrozen → node-graph-module-scope-paint-gate.js
// (scopePaintIsFrozen / shim). Do not re-define freeze policy here.


function absorbNodeGraphPhosphorDrawCursorOnCanvas(canvas, endFrame) {
  if (!canvas || !Number.isFinite(Number(endFrame))) {
    return;
  }
  const frame = Number(endFrame);
  canvas._nodeGraphScope2dLastDrawnFrame = frame;
  canvas._nodeGraphOneDimensionalBurnLastDrawnFrame = frame;
  canvas._phosphorScope2dLastFrame = frame;
  if (canvas._nodeGraphScope2dBurnRenderer) {
    canvas._nodeGraphScope2dBurnRenderer.lastFrame = frame;
    canvas._nodeGraphScope2dBurnRenderer._nodeGraphScope2dLastDrawnFrame = frame;
  }
}


function absorbNodeGraphModuleScopePhosphorDrawCursors() {
  if (typeof nodeGraphModuleScopeSlots !== "function") {
    return;
  }
  // Stop / empty capture: nothing to absorb — avoid rebuilding display buffers
  // (offline gain analyzers, scope2d capture) every heartbeat while idle.
  const bufferMap = nodeGraphModuleScopeState?.buffers;
  if (!bufferMap || bufferMap.size === 0) {
    return;
  }
  for (const slot of nodeGraphModuleScopeSlots() || []) {
    // Prefer the raw capture map only — do not call DisplayBuffer (can run
    // expensive offline synthesizers just to read absoluteFrame).
    const buffer = nodeGraphModuleScopeCapturedBufferForSlot?.(slot);
    const endFrame = Number(buffer?.nodeGraphScopeAbsoluteFrame);
    if (!Number.isFinite(endFrame)) {
      continue;
    }
    const burnCanvas = typeof nodeGraphScope2dBurnCanvasForSlot === "function"
      ? nodeGraphScope2dBurnCanvasForSlot(slot)
      : null;
    absorbNodeGraphPhosphorDrawCursorOnCanvas(burnCanvas, endFrame);
    const localCanvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
      ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
      : null;
    absorbNodeGraphPhosphorDrawCursorOnCanvas(localCanvas, endFrame);
    const numberCanvas = typeof nodeGraphNumberReadoutCanvasForSlot === "function"
      ? nodeGraphNumberReadoutCanvasForSlot(slot)
      : null;
    absorbNodeGraphPhosphorDrawCursorOnCanvas(numberCanvas, endFrame);
  }
}


function nodeGraphModuleScopePhosphorFrameReady(slot) {
  const key = String(slot?.nodeId || "__default");
  const fps = normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60);
  const now = Math.max(0, Number(nodeGraphModuleScopeState.animationTime) || 0);
  const state = nodeGraphModuleScopeState.phosphorFrame || {
    key: "",
    lastUpdate: 0,
  };
  if (state.key !== key || !Number.isFinite(Number(state.lastUpdate))) {
    nodeGraphModuleScopeState.phosphorFrame = {
      key,
      lastUpdate: now,
    };
    return true;
  }
  const tick = nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps);
  if (!tick.ready) {
    return false;
  }
  nodeGraphModuleScopeState.phosphorFrame = {
    key,
    lastUpdate: tick.lastUpdate,
  };
  return true;
}


function nodeGraphPhosphorEnergyEnsureCanvas(host, key, width, height) {
  if (!host || !(width > 0) || !(height > 0)) {
    return null;
  }
  let canvas = host[key];
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    host[key] = canvas;
  }
  return canvas;
}


function nodeGraphPhosphorEnergyFadeAmount(decay) {
  const d = clampNodeSliderValue(Number(decay) || 0, 0, 1);
  if (d <= 0.001) {
    return 0;
  }
  // Gentler floor so low burn can still accumulate a dim continuous trail
  // (old 0.025 min erase created a dead band near burn ~0.04).
  // At ~60fps: decay 0.3 → ~0.07/frame; decay 1 → dies in a few frames.
  return clampNodeSliderValue(0.006 + d * 0.11 + d * d * 0.32, 0.006, 0.55);
}


function nodeGraphPhosphorEnergyFade(context, width, height, decay) {
  if (!context || !(width > 0) || !(height > 0)) {
    return;
  }
  const fadeAlpha = nodeGraphPhosphorEnergyFadeAmount(decay);
  if (fadeAlpha <= 0) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha.toFixed(4)})`;
  context.fillRect(0, 0, width, height);
  context.restore();
}


function nodeGraphPhosphorEnergySoftnessPx(sizePx, _ignored = 0.5) {
  const size = Math.max(1, Number(sizePx) || 1);
  return Math.max(1.25, size * 0.18);
}


function nodeGraphPhosphorBuildGradientStops(peakRgb, backgroundHex = "#000000") {
  const peak = Array.isArray(peakRgb) ? peakRgb : [120, 255, 170];
  const toByte = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n <= 1 ? Math.round(clampNodeSliderValue(n, 0, 1) * 255) : Math.round(clampNodeSliderValue(n, 0, 255));
  };
  const pr = toByte(peak[0]);
  const pg = toByte(peak[1]);
  const pb = toByte(peak[2]);
  const bg = normalizeNodeGraphTraceDisplayColor(backgroundHex, "#000000");
  const br = parseInt(bg.slice(1, 3), 16) || 0;
  const bg_ = parseInt(bg.slice(3, 5), 16) || 0;
  const bb = parseInt(bg.slice(5, 7), 16) || 0;
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  // No hot-white clip — residual stays in the phosphor hue, not harsh RGB white.
  return Object.freeze([
    Object.freeze({ t: 0, r: br, g: bg_, b: bb }),
    Object.freeze({ t: 0.18, r: mix(br, pr, 0.28), g: mix(bg_, pg, 0.28), b: mix(bb, pb, 0.28) }),
    Object.freeze({ t: 0.55, r: mix(br, pr, 0.7), g: mix(bg_, pg, 0.7), b: mix(bb, pb, 0.7) }),
    Object.freeze({ t: 1, r: pr, g: pg, b: pb }),
  ]);
}


function nodeGraphPhosphorSampleGradient(energy01, stops) {
  const e = clampNodeSliderValue(Number(energy01) || 0, 0, 1);
  const list = Array.isArray(stops) && stops.length ? stops : nodeGraphPhosphorBuildGradientStops([120, 255, 170]);
  if (e <= list[0].t) {
    return list[0];
  }
  const last = list[list.length - 1];
  if (e >= last.t) {
    return last;
  }
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    if (e <= b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const u = (e - a.t) / span;
      return {
        r: Math.round(a.r + (b.r - a.r) * u),
        g: Math.round(a.g + (b.g - a.g) * u),
        b: Math.round(a.b + (b.b - a.b) * u),
      };
    }
  }
  return last;
}


function nodeGraphPhosphorMapEnergyToColorCanvas(energyCanvas, colorCanvas, stops) {
  if (!energyCanvas || !colorCanvas) {
    return false;
  }
  const w = energyCanvas.width;
  const h = energyCanvas.height;
  if (colorCanvas.width !== w || colorCanvas.height !== h) {
    colorCanvas.width = w;
    colorCanvas.height = h;
  }
  const ectx = energyCanvas.getContext("2d", { willReadFrequently: true });
  const cctx = colorCanvas.getContext("2d");
  if (!ectx || !cctx) {
    return false;
  }
  const src = ectx.getImageData(0, 0, w, h);
  let out = colorCanvas._phosphorMappedImageData;
  if (!out || out.width !== w || out.height !== h) {
    out = cctx.createImageData(w, h);
    colorCanvas._phosphorMappedImageData = out;
  }
  const s = src.data;
  const d = out.data;
  const gradient = stops || nodeGraphPhosphorBuildGradientStops([120, 255, 170]);
  for (let i = 0; i < s.length; i += 4) {
    // Mild gamma so mid-energy soft edges stay soft instead of posterizing hot.
    // energy is the gradient coordinate; color may be dark or light at the peak.
    const raw = Math.max(s[i], s[i + 1], s[i + 2]) / 255;
    const energy = Math.pow(raw, 1.15);
    if (energy < 0.006) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }
    const c = nodeGraphPhosphorSampleGradient(energy, gradient);
    // Premultiplied for source-over blit (not additive "lighter").
    const a = Math.min(255, Math.round(energy * 230));
    const af = a / 255;
    d[i] = Math.round(c.r * af);
    d[i + 1] = Math.round(c.g * af);
    d[i + 2] = Math.round(c.b * af);
    d[i + 3] = a;
  }
  cctx.putImageData(out, 0, 0);
  return true;
}

