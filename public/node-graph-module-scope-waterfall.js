// 1D Waterfall — strip chart (mono / stereo / XYZ / RGB).
// Sync Off: scroll left, pen on the right; History is the face width in seconds.
// Sync On: phase-lock to a rising zero-crossing; History is cycles in view
// (smooth — e.g. 1.5 = 1½ periods), always stretched across the full face width.
// History 0: now-line. Ink: TraceTape WebGL discs. Meet/Add on GPU. Canvas2D plate only.

function nodeGraphWaterfallNowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function nodeGraphWaterfallHistorySeconds(settings) {
  const n = Number(settings?.historySeconds ?? settings?.zoomSeconds);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

function nodeGraphWaterfallIsNowLine(settings) {
  return nodeGraphWaterfallHistorySeconds(settings) <= 0;
}

function nodeGraphWaterfallSyncIsOn(settings) {
  return typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(settings) !== "off"
    : false;
}

/** Trimmed-mean period from rising-edge gaps (rejects octave jumps). */
function nodeGraphWaterfallRefinePeriodSamples(edges) {
  if (!Array.isArray(edges) || edges.length < 2) {
    return 0;
  }
  const gaps = [];
  for (let i = 1; i < edges.length; i += 1) {
    const gap = edges[i] - edges[i - 1];
    if (gap >= 2) {
      gaps.push(gap);
    }
  }
  if (!gaps.length) {
    return 0;
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  let sum = 0;
  let count = 0;
  for (const gap of gaps) {
    if (gap > median * 0.82 && gap < median * 1.18) {
      sum += gap;
      count += 1;
    }
  }
  const period = count > 0 ? sum / count : median;
  return period > 1 ? period : 0;
}

/**
 * Measure period from the buffer (rising ZCs only — no module frequency hints).
 * History (when Sync On) is cycles-in-view (smooth), not a time budget that
 * packs more cycles as frequency rises — zoom stretches that window full-width.
 */
function nodeGraphWaterfallMeasureSync(syncBuffer, state, historyCycles = 0, sampleRate = 0) {
  const empty = { periodSamples: 0, edge: Number.NaN, cycles: 0, visibleSamples: 0 };
  if (!syncBuffer?.length || typeof nodeGraphModuleScopeCollectSyncTriggers !== "function") {
    return empty;
  }
  const source = typeof nodeGraphModuleScopeSyncBuffer === "function"
    ? (nodeGraphModuleScopeSyncBuffer(syncBuffer) || syncBuffer)
    : syncBuffer;
  if (!source?.length) {
    return empty;
  }
  const hz = sampleRate > 0 ? sampleRate : nodeGraphWaterfallVisualHz(source);
  const cyclesRaw = Number(historyCycles);
  const cycles = Number.isFinite(cyclesRaw) && cyclesRaw > 0
    ? Math.max(0.05, Math.min(100, cyclesRaw))
    : 2;
  // Search enough ring for several periods of the current cycle zoom.
  const searchSpan = Math.min(
    source.length,
    Math.max(8192, Math.ceil(cycles * 512) + 4096),
  );
  const searchStart = Math.max(0, source.length - searchSpan);
  const triggers = nodeGraphModuleScopeCollectSyncTriggers(
    source,
    searchStart,
    source.length,
    0,
    null,
  );
  const edges = Array.isArray(triggers?.edges) ? triggers.edges : [];
  let periodSamples = nodeGraphWaterfallRefinePeriodSamples(edges);
  if (!(periodSamples > 1)) {
    periodSamples = Number(triggers?.periodSamples) || 0;
  }
  if (periodSamples > 1 && state) {
    const prev = Number(state.periodEma);
    if (Number.isFinite(prev) && prev > 1) {
      const ratio = periodSamples / prev;
      state.periodEma = (ratio < 0.7 || ratio > 1.4)
        ? periodSamples
        : (prev * 0.55 + periodSamples * 0.45);
    } else {
      state.periodEma = periodSamples;
    }
    periodSamples = state.periodEma;
  } else if (!(periodSamples > 1)) {
    const prev = Number(state?.periodEma);
    if (Number.isFinite(prev) && prev > 1) {
      periodSamples = prev;
    } else {
      return empty;
    }
  }
  // Fixed cycle zoom × measured period → sample window (stretched to full face).
  const visible = Math.max(8, Math.min(source.length, Math.round(cycles * periodSamples)));
  let edge = Number.NaN;
  for (let i = edges.length - 1; i >= 0; i -= 1) {
    const at = Number(edges[i]);
    if (Number.isFinite(at) && at >= 0 && at + visible <= source.length) {
      edge = at;
      break;
    }
  }
  if (!Number.isFinite(edge) && edges.length) {
    const idealStart = Math.max(0, source.length - visible);
    let best = Number.NaN;
    let bestDist = Infinity;
    for (let i = edges.length - 1; i >= 0; i -= 1) {
      const at = Number(edges[i]);
      if (!Number.isFinite(at) || at > idealStart) {
        continue;
      }
      const dist = idealStart - at;
      if (dist < bestDist) {
        bestDist = dist;
        best = at;
      }
      if (dist <= periodSamples) {
        break;
      }
    }
    edge = Number.isFinite(best) ? best : Number(edges[edges.length - 1]);
  }
  if (!Number.isFinite(edge)) {
    edge = Math.max(0, source.length - visible);
  }
  return { periodSamples, edge, cycles, visibleSamples: visible };
}

function nodeGraphWaterfallY(raw, gain, offset, midY, halfHeight) {
  const v = Math.max(-1, Math.min(1, (Number.isFinite(Number(raw)) ? Number(raw) : 0) * gain + offset));
  return midY - v * halfHeight;
}

function nodeGraphWaterfallPrepare(buffer, settings) {
  if (typeof prepareNodeGraphTraceDisplayBuffer === "function") {
    return prepareNodeGraphTraceDisplayBuffer(buffer, settings) || buffer;
  }
  return buffer;
}

function nodeGraphWaterfallVisualHz(buffer) {
  if (typeof nodeGraphScopeSampleRate === "function") {
    const hz = nodeGraphScopeSampleRate(buffer);
    if (hz > 0) return hz;
  }
  const engine = Number(nodeGraphModuleScopeState?.sampleRate) || Number(nodeGraphMvp?.sampleRate);
  return engine > 0 ? engine : 44100;
}

function nodeGraphWaterfallAmp(buffer, slot) {
  // RMS meter face: linear amplitude 0→bottom, 1 (0 dB)→mid, 2 (+6 dB)→top.
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[slot?.type]
    : null;
  if (def?.rmsDbGuides) {
    const gain = typeof NODE_GRAPH_RMS_FACE_GAIN === "number" ? NODE_GRAPH_RMS_FACE_GAIN : 1;
    const offset = typeof NODE_GRAPH_RMS_FACE_OFFSET === "number" ? NODE_GRAPH_RMS_FACE_OFFSET : -1;
    return { gain, offset };
  }
  const view = typeof nodeGraphTraceDisplayBufferView === "function"
    ? nodeGraphTraceDisplayBufferView(buffer, slot, { forceSyncOff: true })
    : null;
  return { gain: Number(view?.gain) || 1, offset: Number(view?.offset) || 0 };
}

function nodeGraphWaterfallAbsEnd(buffer) {
  if (typeof nodeGraphScopeBufferAbsoluteFrame === "function") {
    const n = nodeGraphScopeBufferAbsoluteFrame(buffer);
    if (n > 0) return n;
  }
  const abs = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  if (Number.isFinite(abs) && abs > 0) return abs;
  const total = Number(buffer?.nodeGraphScopeTotalSampleCount);
  return Number.isFinite(total) && total > 0 ? total : Number.NaN;
}

function nodeGraphWaterfallUndrawn(buffer, lastAbs) {
  const end = buffer?.length || 0;
  if (!end) return { count: 0, absEnd: Number.NaN, start: 0, end: 0 };
  const absEnd = nodeGraphWaterfallAbsEnd(buffer);
  const recent = Math.max(0, Math.floor(Number(buffer.nodeGraphScopeRecentSampleCount) || 0));
  if (Number.isFinite(absEnd) && absEnd > 0 && Number.isFinite(lastAbs) && lastAbs > 0) {
    if (lastAbs >= absEnd) return { count: 0, absEnd, start: end, end };
    const undrawn = Math.min(end, Math.max(0, Math.floor(absEnd - lastAbs)));
    return { count: undrawn, absEnd, start: Math.max(0, end - undrawn), end };
  }
  const n = recent > 0 ? Math.min(end, recent) : Math.min(end, 1);
  return { count: n, absEnd, start: Math.max(0, end - n), end };
}

function nodeGraphWaterfallLatestY(buffer, slot, settings, height) {
  const live = nodeGraphWaterfallPrepare(buffer, settings);
  if (!live?.length) return Number.NaN;
  const amp = nodeGraphWaterfallAmp(live, slot);
  return nodeGraphWaterfallY(Number(live[live.length - 1]), amp.gain, amp.offset, height * 0.5, height * 0.42);
}

/** Min/max envelope per new pixel column. */
function nodeGraphWaterfallColumnPath(buffer, slot, columns, height, prevY, settings, start, end) {
  const live = nodeGraphWaterfallPrepare(buffer, settings);
  const cols = Math.max(1, Math.floor(Number(columns) || 1));
  if (!live?.length || cols < 1) {
    return Number.isFinite(prevY) ? [{ x: 0, y: prevY }, { x: cols, y: prevY }] : [];
  }
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(live.length, Math.max(from + 1, Math.floor(end)));
  const amp = nodeGraphWaterfallAmp(live, slot);
  const midY = height * 0.5;
  const halfHeight = height * 0.42;
  const span = Math.max(1, to - from);
  const points = [];
  if (Number.isFinite(prevY)) points.push({ x: 0, y: prevY });
  for (let c = 0; c < cols; c += 1) {
    const lo = from + Math.floor((c / cols) * span);
    const hi = from + Math.min(span, Math.floor(((c + 1) / cols) * span));
    const rangeStart = Math.max(from, lo);
    const rangeEnd = Math.max(rangeStart + 1, Math.min(to, hi === lo ? lo + 1 : hi));
    let minV = Infinity;
    let maxV = -Infinity;
    let minI = rangeStart;
    let maxI = rangeStart;
    for (let i = rangeStart; i < rangeEnd; i += 1) {
      const v = Number(live[i]);
      if (!Number.isFinite(v)) continue;
      if (v < minV) { minV = v; minI = i; }
      if (v > maxV) { maxV = v; maxI = i; }
    }
    if (!(minV <= maxV)) continue;
    const x = c + 0.5;
    const yMin = nodeGraphWaterfallY(minV, amp.gain, amp.offset, midY, halfHeight);
    const yMax = nodeGraphWaterfallY(maxV, amp.gain, amp.offset, midY, halfHeight);
    if (minI === maxI || Math.abs(yMin - yMax) < 0.5) points.push({ x, y: yMin });
    else if (minI < maxI) { points.push({ x, y: yMin }); points.push({ x, y: yMax }); }
    else { points.push({ x, y: yMax }); points.push({ x, y: yMin }); }
  }
  return points;
}

function nodeGraphWaterfallSizePx(face, size01) {
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.diameterPx === "function") {
    return Math.max(1, TraceStroke.diameterPx(face, size01));
  }
  return Math.max(1, Math.max(1, Number(face) || 1) * Math.max(0, Math.min(1, Number(size01) || 0)));
}

function nodeGraphWaterfallGlRadius(faceMin, size01) {
  return Math.max(0.5, nodeGraphWaterfallSizePx(faceMin, size01) * 0.5);
}

function nodeGraphWaterfallMargin(radiusPx) {
  return Math.max(1, Math.ceil(Math.max(0.5, Number(radiusPx) || 0.5)));
}

function nodeGraphWaterfallLutRgb(hex, fallback) {
  const fb = fallback || [255, 51, 51];
  if (typeof nodeGraphScopeHexColorToRgb === "function") {
    const rgb = nodeGraphScopeHexColorToRgb(hex);
    if (Array.isArray(rgb) && rgb.length >= 3) {
      if (rgb[0] > 1.01 || rgb[1] > 1.01 || rgb[2] > 1.01) return [rgb[0], rgb[1], rgb[2]];
      return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
    }
  }
  const text = String(hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return [parseInt(text.slice(1, 3), 16), parseInt(text.slice(3, 5), 16), parseInt(text.slice(5, 7), 16)];
  }
  return fb.slice();
}

function nodeGraphWaterfallParseInkRgb(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return [
      Math.max(0, Math.min(255, Math.round(Number(color[0]) || 0))),
      Math.max(0, Math.min(255, Math.round(Number(color[1]) || 0))),
      Math.max(0, Math.min(255, Math.round(Number(color[2]) || 0))),
    ];
  }
  const m = String(color || "").trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    return [
      Math.max(0, Math.min(255, Math.round(Number(m[1])))),
      Math.max(0, Math.min(255, Math.round(Number(m[2])))),
      Math.max(0, Math.min(255, Math.round(Number(m[3])))),
    ];
  }
  return nodeGraphWaterfallLutRgb(color);
}

function nodeGraphWaterfallClampPoint(x, y, radius, width, height) {
  const r = Math.max(0.5, Number(radius) || 0.5);
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  return {
    x: Math.max(r, Math.min(w - r, Number(x) || 0)),
    y: Math.max(r, Math.min(h - r, Number(y) || 0)),
  };
}

function nodeGraphWaterfallClamp01(n, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function nodeGraphWaterfallScaleRgb(rgb, bright01) {
  const b = nodeGraphWaterfallClamp01(bright01, 1);
  if (b >= 0.999) return rgb;
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] * b))),
    Math.max(0, Math.min(255, Math.round(rgb[1] * b))),
    Math.max(0, Math.min(255, Math.round(rgb[2] * b))),
  ];
}

/** Preview pad = Size radius (blur does not grow the disc). */
function nodeGraphWaterfallSoftPad(radius, _blur01) {
  return Math.max(0.5, Number(radius) || 0.5);
}

/**
 * Radial alpha: blur 0 = hard disc at R; blur 1 = smoothstep center → edge at R.
 * Same profile as TraceTape (Size-normalized, no skirt growth).
 */
function nodeGraphWaterfallBlurAlpha(dist, radius, blur01) {
  const r = Math.max(0.5, Number(radius) || 0.5);
  const soft = nodeGraphWaterfallClamp01(blur01, 0);
  const t = Math.max(0, Number(dist) || 0) / r;
  if (soft < 0.02) {
    return t < 0.999 ? 1 : 0;
  }
  const knee = (1 - soft) * (1 - soft) * 0.92;
  if (t <= knee) return 1;
  if (t >= 1) return 0;
  const u = (t - knee) / Math.max(1e-6, 1 - knee);
  const s = u * u * (3 - 2 * u);
  return 1 - s;
}

/** Tiny preview-sprite cache — color drag used to rebuild ImageData every move. */
const nodeGraphWaterfallPreviewDabCache = new Map();
const NODE_GRAPH_WATERFALL_PREVIEW_DAB_MAX = 32;

function nodeGraphWaterfallPreviewDabSprite(radius, blur01, rgb) {
  const rQ = Math.round(Math.max(0.5, Number(radius) || 0.5) * 4) / 4;
  const bQ = Math.round(nodeGraphWaterfallClamp01(blur01, 0) * 64) / 64;
  const key = rQ + ":" + bQ + ":" + rgb[0] + "," + rgb[1] + "," + rgb[2];
  let entry = nodeGraphWaterfallPreviewDabCache.get(key);
  if (entry) {
    nodeGraphWaterfallPreviewDabCache.delete(key);
    nodeGraphWaterfallPreviewDabCache.set(key, entry);
    return entry;
  }
  const rad = Math.ceil(rQ);
  const size = rad * 2 + 1;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext("2d");
  if (!c) return null;
  const img = c.createImageData(size, size);
  const data = img.data;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const a = nodeGraphWaterfallBlurAlpha(Math.hypot(px - rad, py - rad), rQ, bQ);
      if (a <= 0.001) continue;
      const o = (py * size + px) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = Math.round(a * 255);
    }
  }
  c.putImageData(img, 0, 0);
  entry = { canvas, rad };
  nodeGraphWaterfallPreviewDabCache.set(key, entry);
  while (nodeGraphWaterfallPreviewDabCache.size > NODE_GRAPH_WATERFALL_PREVIEW_DAB_MAX) {
    const oldest = nodeGraphWaterfallPreviewDabCache.keys().next().value;
    nodeGraphWaterfallPreviewDabCache.delete(oldest);
  }
  return entry;
}

/** Preview dab — Size-normalized radial smoothstep (matches TraceTape). */
function nodeGraphWaterfallDab(ctx, x, y, radius, rgb, composite, blur01 = 0, alpha01 = 1) {
  if (!ctx) return;
  const r = Math.max(0.5, Number(radius) || 0.5);
  const blur = nodeGraphWaterfallClamp01(blur01, 0);
  const aMul = nodeGraphWaterfallClamp01(alpha01, 1);
  if (aMul <= 0.001) return;
  const c = nodeGraphWaterfallClampPoint(x, y, r, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.globalCompositeOperation = composite || "source-over";
  ctx.globalAlpha = aMul;
  if (blur < 0.02) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sprite = nodeGraphWaterfallPreviewDabSprite(r, blur, rgb);
    if (sprite) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sprite.canvas, c.x - sprite.rad, c.y - sprite.rad);
    }
  }
  ctx.restore();
}

function nodeGraphWaterfallShiftPath(points, x0) {
  const ox = Number(x0) || 0;
  if (!ox || !Array.isArray(points)) return points || [];
  return points.map((p) => (p && Number.isFinite(p.x) ? { x: p.x + ox, y: p.y } : p));
}

function nodeGraphWaterfallChannelList(spec, settings) {
  const size = settings.dot1Size ?? 0.035;
  const enabled = settings.dot1Enabled !== false;
  const color = settings.color || settings.dot1Color || "#ff3333";
  const blur = nodeGraphWaterfallClamp01(settings.lineThickness, 0);
  const bright = spec?.rgbBuffers
    ? nodeGraphWaterfallClamp01(settings.dot1Brightness ?? settings.brightness, 1)
    : 1;
  if (spec?.rgbBuffers) {
    // CMY = subtractive guns (multiply → black). RGB = additive (lighter → white).
    const cmy = settings.cmyMode === true;
    return [
      {
        buffer: spec.rgbBuffers.R,
        color: cmy ? "#00ffff" : "#ff0000",
        size,
        enabled,
        blur,
        bright,
        lastYKey: "_waterfallLastRY",
      },
      {
        buffer: spec.rgbBuffers.G,
        color: cmy ? "#ff00ff" : "#00ff00",
        size,
        enabled,
        blur,
        bright,
        lastYKey: "_waterfallLastGY",
      },
      {
        buffer: spec.rgbBuffers.B,
        color: cmy ? "#ffff00" : "#0000ff",
        size,
        enabled,
        blur,
        bright,
        lastYKey: "_waterfallLastBY",
      },
    ];
  }
  if (spec?.xyzBuffers) {
    const colors = {
      X: settings.dot1Color || settings.color || "#ff0000",
      Y: settings.secondaryColor || "#0000ff",
      Z: settings.tertiaryColor || "#00ff00",
    };
    return ["X", "Y", "Z"].map((port) => ({
      buffer: spec.xyzBuffers[port],
      color: colors[port],
      size,
      enabled,
      blur,
      bright: 1,
      lastYKey: "_waterfallLast" + port + "Y",
    }));
  }
  if (spec?.stereoBuffers) {
    return [
      {
        buffer: spec.stereoBuffers.left,
        color,
        size,
        enabled,
        blur,
        bright: 1,
        lastYKey: "_waterfallLastLeftY",
      },
      {
        buffer: spec.stereoBuffers.right,
        color: settings.secondaryColor || "#0000ff",
        size: settings.secondarySize ?? size,
        enabled: settings.secondaryEnabled !== false,
        blur,
        bright: 1,
        lastYKey: "_waterfallLastRightY",
      },
    ];
  }
  return [{
    buffer: spec?.buffer,
    color,
    size,
    enabled,
    blur,
    bright: 1,
    lastYKey: "_waterfallLastY",
  }];
}

function nodeGraphWaterfallInkRadius(spec, width, height) {
  const face = Math.min(Math.max(1, width), Math.max(1, height));
  let radius = 1;
  for (const ch of nodeGraphWaterfallChannelList(spec, spec?.settings || {})) {
    radius = Math.max(radius, nodeGraphWaterfallSizePx(face, ch.size) * 0.5);
  }
  return radius;
}

/** Stamp packing 0…1 (sparse → dense). Default 0.5. */
function nodeGraphWaterfallStampDensity(settings) {
  const n = Number(settings?.stampDensity ?? settings?.dotDensity);
  return Number.isFinite(n) ? nodeGraphWaterfallClamp01(n, 0.5) : 0.5;
}

function nodeGraphWaterfallBlendMode(settings, options = {}) {
  if (options?.rgbGuns) {
    // CMY checkbox → multiply (darken to black). Else additive lighter → white.
    return settings?.cmyMode === true ? "multiply" : "lighter";
  }
  if (typeof nodeGraphScopeStereoBlendMode === "function") {
    return nodeGraphScopeStereoBlendMode(settings?.stereoBlend);
  }
  return String(settings?.stereoBlend || "combine");
}

function nodeGraphWaterfallHasTraceTape() {
  return typeof TraceTape !== "undefined"
    && typeof TraceTape.ensure === "function"
    && typeof TraceTape.stamp === "function"
    && typeof TraceTape.scroll === "function"
    && typeof TraceTape.presentTo === "function";
}

function nodeGraphWaterfallEnsureTape(host, index, width, height) {
  if (!nodeGraphWaterfallHasTraceTape()) return null;
  return TraceTape.ensure(host, width, height, "_traceTape" + index);
}

function nodeGraphWaterfallClearTapes(host) {
  if (!host || !nodeGraphWaterfallHasTraceTape()) return;
  for (let i = 0; i < 3; i += 1) {
    const tape = host["_traceTape" + i];
    if (tape) TraceTape.clear(tape);
  }
}

function nodeGraphWaterfallColor01(color) {
  if (typeof TraceTape !== "undefined" && TraceTape.hexToRgb01) {
    if (typeof color === "string" && color.charAt(0) === "#") {
      return TraceTape.hexToRgb01(color);
    }
  }
  const rgb = nodeGraphWaterfallParseInkRgb(color);
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

/** Present channel tapes onto the face plate. */
function nodeGraphWaterfallPresentTapes(destCtx, destCanvas, tapes, meta, mode, bg) {
  const w = destCanvas.width;
  const h = destCanvas.height;
  const meet = (mode === "combine" || mode === "meet") && tapes.length >= 2;
  // Mono defaults to stereoBlend "combine", but Meet needs ≥2 tapes. One tape
  // must source-over present or the face stays blank.
  if (meet) {
    destCtx.save();
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.clearRect(0, 0, w, h);
    destCtx.restore();
    if (tapes.length >= 3 && typeof TraceTape.presentMeet3 === "function") {
      TraceTape.presentMeet3(tapes[0], tapes[1], tapes[2], destCtx, {
        width: w,
        height: h,
        colorA: meta[0]?.color,
        colorB: meta[1]?.color,
        colorC: meta[2]?.color,
        rgbA: nodeGraphWaterfallColor01(meta[0]?.color),
        rgbB: nodeGraphWaterfallColor01(meta[1]?.color),
        rgbC: nodeGraphWaterfallColor01(meta[2]?.color),
      });
    } else if (typeof TraceTape.presentMeet === "function") {
      TraceTape.presentMeet(tapes[0], tapes[1], destCtx, {
        width: w,
        height: h,
        leftColor: meta[0]?.color,
        rightColor: meta[1]?.color,
        leftRgb: nodeGraphWaterfallColor01(meta[0]?.color),
        rightRgb: nodeGraphWaterfallColor01(meta[1]?.color),
      });
    }
    if (typeof nodeGraphFacePlateFillUnder === "function") {
      nodeGraphFacePlateFillUnder(destCtx, destCanvas, bg);
    }
    return;
  }

  // Multiply/CMY needs a white underlay so overlaps go black (not invisible on black plate).
  const plateBg = mode === "multiply" ? "#ffffff" : (bg || "#000000");
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(destCtx, destCanvas, plateBg);
  } else {
    destCtx.save();
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.fillStyle = plateBg;
    destCtx.fillRect(0, 0, w, h);
    destCtx.restore();
  }

  let composite = "source-over";
  if (mode === "lighter" || mode === "screen") composite = mode;
  else if (mode === "multiply" || mode === "difference" || mode === "exclusion" || mode === "xor") {
    composite = mode;
  }

  for (let i = 0; i < tapes.length; i += 1) {
    // Multiply: every layer multiplies into the white plate. Add: first source-over then lighter.
    const layerComposite = composite === "multiply"
      ? "multiply"
      : (i === 0 ? "source-over" : composite);
    TraceTape.presentTo(tapes[i], destCtx, {
      width: w,
      height: h,
      composite: layerComposite,
      smooth: false,
    });
  }
}

/**
 * Persistent TraceTape channels: scroll, stamp new path, present.
 */
function nodeGraphWaterfallInk(destCtx, destCanvas, spec, x0, columns, bg, sampleStart, sampleEnd, options) {
  const width = destCanvas.width;
  const height = destCanvas.height;
  const face = Math.min(width, height);
  const settings = spec.settings || {};
  const radius = nodeGraphWaterfallInkRadius(spec, width, height);
  const pad = nodeGraphWaterfallMargin(radius);
  const minX = pad;
  const maxX = Math.max(minX + 1, width - pad);
  let n = Math.max(1, Math.floor(columns));
  let x = Math.floor(Number(x0) || 0);
  if (x + n > maxX) x = maxX - n;
  if (x < minX) {
    x = minX;
    if (x + n > maxX) n = Math.max(1, maxX - x);
  }
  if (n < 1 || x >= width) return 0;
  const scrollPx = Math.max(0, Math.round(Number(options?.scrollPx) || 0));
  const mode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const count = Math.max(0, Math.floor(sampleEnd) - Math.floor(sampleStart));
  const channels = nodeGraphWaterfallChannelList(spec, settings).filter((ch) => ch.enabled !== false);
  if (!channels.length) return n;

  if (!nodeGraphWaterfallHasTraceTape()) {
    nodeGraphWaterfallFillPlate(destCtx, destCanvas, bg);
    return n;
  }

  // Meet coverage stamps only when ≥2 channels will actually Meet-present.
  const meet = (mode === "combine" || mode === "meet") && channels.length >= 2;
  const tapes = [];
  const meta = [];
  const density = nodeGraphWaterfallStampDensity(settings);

  for (let i = 0; i < channels.length; i += 1) {
    const ch = channels[i];
    const tape = nodeGraphWaterfallEnsureTape(destCanvas, i, width, height);
    if (!tape) {
      nodeGraphWaterfallFillPlate(destCtx, destCanvas, bg);
      return n;
    }
    // Positive dx = content moves left (new ink lands on the right), same as
    // the old canvas drawImage(hold, -n, 0) path.
    if (scrollPx > 0) TraceTape.scroll(tape, scrollPx);
    const buf = nodeGraphWaterfallPrepare(ch.buffer, settings);
    const bufLen = buf?.length || 0;
    // Honor caller window when valid (Sync phase-align). Freerun passes the
    // undrawn tail; older callers that only set count still work via fallback.
    const argStart = Math.floor(Number(sampleStart));
    const argEnd = Math.floor(Number(sampleEnd));
    const useArgs = Number.isFinite(argStart) && Number.isFinite(argEnd) && argEnd > argStart;
    const end = useArgs ? Math.min(bufLen, argEnd) : bufLen;
    const start = useArgs
      ? Math.max(0, Math.min(end - 1, argStart))
      : Math.max(0, end - count);
    const prevY = options?.resetPath ? Number.NaN : destCanvas[ch.lastYKey];
    const raw = nodeGraphWaterfallColumnPath(
      ch.buffer, spec.slot, n, height, prevY, settings, start, end,
    );
    const last = raw[raw.length - 1];
    if (Number.isFinite(last?.y)) destCanvas[ch.lastYKey] = last.y;
    const points = nodeGraphWaterfallShiftPath(raw, x);
    const rad = Math.max(0.5, nodeGraphWaterfallSizePx(face, ch.size) * 0.5);
    // Mono (1 ch) always stamps true color even if stereoBlend says combine/Meet.
    const inkColor = meet ? "#ffffff" : ch.color;
    const rgb = nodeGraphWaterfallColor01(inkColor);
    TraceTape.stamp(tape, {
      pathPoints: points,
      radius: rad,
      blur: ch.blur || 0,
      brightness: meet ? 1 : (ch.bright ?? 1),
      color: inkColor,
      rgb,
      stampDensity: density,
    });
    tapes.push(tape);
    meta.push({ color: ch.color, blur: ch.blur || 0, bright: ch.bright ?? 1 });
  }

  nodeGraphWaterfallPresentTapes(destCtx, destCanvas, tapes, meta, mode, bg);
  return n;
}

function nodeGraphWaterfallSyncSource(spec) {
  const channel = typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(spec?.settings)
    : "off";
  if (channel === "off") return null;
  const stereo = spec?.stereoBuffers;
  if (!stereo) return spec?.buffer || null;
  if (channel === "right") return stereo.right || stereo.left;
  if (channel === "mono" && typeof nodeGraphTraceDisplayMonoSyncBuffer === "function") {
    return nodeGraphTraceDisplayMonoSyncBuffer(stereo.left, stereo.right) || stereo.left;
  }
  return stereo.left || stereo.right;
}

function nodeGraphWaterfallAbandonTape(canvas) {
  if (!canvas) return;
  canvas._waterfall = null;
  canvas._traceScroll = null;
  delete canvas._waterfallLastY;
  delete canvas._waterfallLastLeftY;
  delete canvas._waterfallLastRightY;
  delete canvas._waterfallLastXY;
  delete canvas._waterfallLastYY;
  delete canvas._waterfallLastZY;
  delete canvas._waterfallLastRY;
  delete canvas._waterfallLastGY;
  delete canvas._waterfallLastBY;
  for (let i = 0; i < 3; i += 1) {
    const tape = canvas["_traceTape" + i];
    if (tape && typeof TraceTape !== "undefined" && TraceTape.clear) {
      TraceTape.clear(tape);
    }
    delete canvas["_traceTape" + i];
  }
}

function nodeGraphWaterfallState(canvas, width, height, syncOn, nowLine, bg, context, blendMode) {
  const st = canvas._waterfall || (canvas._waterfall = {
    started: false,
    lastMs: Number.NaN,
    frac: 0,
    lastAbs: Number.NaN,
    syncOn: false,
    nowLine: false,
    blend: "",
    periodEma: Number.NaN,
    lastW: 0,
    lastH: 0,
  });
  canvas._traceScroll = st;
  const blend = String(blendMode || "");
  const resized = Math.abs((st.lastW || 0) - width) > 2 || Math.abs((st.lastH || 0) - height) > 2;
  const modeChanged = st.syncOn !== syncOn || st.nowLine !== nowLine || st.blend !== blend;
  if (!st.started || modeChanged) {
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(context, canvas, bg);
    }
    st.started = true;
    st.lastMs = nodeGraphWaterfallNowMs();
    st.frac = 0;
    st.lastAbs = Number.NaN;
    st.lastW = width;
    st.lastH = height;
    st.syncOn = Boolean(syncOn);
    st.nowLine = nowLine;
    st.blend = blend;
    st.periodEma = Number.NaN;
    delete canvas._waterfallLastY;
    delete canvas._waterfallLastLeftY;
    delete canvas._waterfallLastRightY;
    delete canvas._waterfallLastXY;
    delete canvas._waterfallLastYY;
    delete canvas._waterfallLastZY;
    delete canvas._waterfallLastRY;
    delete canvas._waterfallLastGY;
    delete canvas._waterfallLastBY;
    nodeGraphWaterfallClearTapes(canvas);
  } else if (resized) {
    st.lastW = width;
    st.lastH = height;
  }
  return st;
}

function nodeGraphWaterfallFinishOutputInk(spec, context, canvas, scrollPx) {
  if (typeof paintNodeGraphOutputInkFrame === "function") {
    const px = Math.round(Number(scrollPx) || 0);
    paintNodeGraphOutputInkFrame(
      context, canvas, spec?.slot, spec?.settings, spec?.density,
      { scrollPx: px, scrolled: px > 0 },
    );
    return;
  }
  if (typeof paintNodeGraphOutputProtectBannerIfNeeded === "function") {
    paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, spec?.slot, spec?.settings, spec?.density);
  }
}

function nodeGraphWaterfallFillPlate(context, canvas, bg) {
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(context, canvas, bg);
  } else {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = bg || "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
}

function nodeGraphWaterfallPaintNowLine(spec, context, canvas, settings, width, height, bg) {
  const face = Math.min(width, height);
  const pad = nodeGraphWaterfallMargin(nodeGraphWaterfallInkRadius(spec, width, height));
  const x0 = pad;
  const x1 = Math.max(x0 + 1, width - pad);
  const mode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  if (!nodeGraphWaterfallHasTraceTape()) {
    nodeGraphWaterfallFillPlate(context, canvas, bg);
    return true;
  }
  const channelList = nodeGraphWaterfallChannelList(spec, settings).filter((ch) => ch.enabled !== false);
  const meet = (mode === "combine" || mode === "meet") && channelList.length >= 2;
  const tapes = [];
  const meta = [];
  for (let i = 0; i < 3; i += 1) {
    const tape = nodeGraphWaterfallEnsureTape(canvas, i, width, height);
    if (tape) TraceTape.clear(tape);
  }
  const density = nodeGraphWaterfallStampDensity(settings);
  for (let idx = 0; idx < channelList.length; idx += 1) {
    const ch = channelList[idx];
    const y = nodeGraphWaterfallLatestY(ch.buffer, spec.slot, settings, height);
    const tape = nodeGraphWaterfallEnsureTape(canvas, idx, width, height);
    if (!tape || !Number.isFinite(y)) continue;
    const rad = Math.max(0.5, nodeGraphWaterfallSizePx(face, ch.size) * 0.5);
    const inkColor = meet ? "#ffffff" : ch.color;
    TraceTape.stamp(tape, {
      pathPoints: [{ x: x0, y }, { x: x1, y }],
      radius: rad,
      blur: ch.blur || 0,
      brightness: meet ? 1 : (ch.bright ?? 1),
      color: inkColor,
      rgb: nodeGraphWaterfallColor01(inkColor),
      stampDensity: density,
    });
    tapes.push(tape);
    meta.push({ color: ch.color });
  }
  nodeGraphWaterfallPresentTapes(context, canvas, tapes, meta, mode, bg);
  return true;
}

function nodeGraphWaterfallPaint(spec) {
  const canvas = spec?.canvas;
  const context = spec?.context;
  const settings = spec?.settings;
  if (!canvas || !context || !settings) return false;
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const live = spec.rgbBuffers
    ? (nodeGraphWaterfallPrepare(spec.rgbBuffers.R, settings)
      || nodeGraphWaterfallPrepare(spec.rgbBuffers.G, settings)
      || nodeGraphWaterfallPrepare(spec.rgbBuffers.B, settings)
      || spec.buffer)
    : spec.xyzBuffers
      ? (nodeGraphWaterfallPrepare(spec.xyzBuffers.X, settings)
        || nodeGraphWaterfallPrepare(spec.xyzBuffers.Y, settings)
        || nodeGraphWaterfallPrepare(spec.xyzBuffers.Z, settings)
        || spec.buffer)
      : spec.stereoBuffers
        ? (nodeGraphWaterfallPrepare(spec.stereoBuffers.left, settings) || spec.buffer)
        : (nodeGraphWaterfallPrepare(spec.buffer, settings) || spec.buffer);
  if (!live?.length) return false;

  const nowLine = nodeGraphWaterfallIsNowLine(settings);
  const syncOn = !nowLine && nodeGraphWaterfallSyncIsOn(settings);
  const blendMode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const st = nodeGraphWaterfallState(
    canvas, width, height, syncOn, nowLine, spec.bg, context, blendMode,
  );
  const writeSpec = {
    slot: spec.slot,
    settings,
    buffer: live,
    stereoBuffers: spec.stereoBuffers,
    xyzBuffers: spec.xyzBuffers,
    rgbBuffers: spec.rgbBuffers,
  };
  const remember = () => {
    if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
      rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
    }
  };

  if (nowLine) {
    nodeGraphWaterfallPaintNowLine(spec, context, canvas, settings, width, height, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }

  const frozen = typeof scopePaintIsFrozen === "function" && scopePaintIsFrozen();
  const window = nodeGraphWaterfallUndrawn(live, st.lastAbs);
  if (!Number.isFinite(st.lastAbs) && Number.isFinite(window.absEnd) && window.count > 0) {
    st.lastAbs = Math.max(0, window.absEnd - window.count);
  }
  if (frozen) {
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }

  const inkPad = nodeGraphWaterfallMargin(nodeGraphWaterfallInkRadius(writeSpec, width, height));
  const penMin = inkPad;
  const penMax = Math.max(penMin + 1, width - inkPad);
  const usableWidth = Math.max(1, penMax - penMin);

  const history = nodeGraphWaterfallHistorySeconds(settings);
  const hz = nodeGraphWaterfallVisualHz(live);

  // Sync On: History = cycles in view (smooth). Stretch that window across the
  // full face width (zoom only — do not pack more cycles as frequency rises).
  if (syncOn) {
    const syncBuffer = nodeGraphWaterfallSyncSource(writeSpec) || live;
    const measure = nodeGraphWaterfallMeasureSync(syncBuffer, st, history, hz);
    if (measure.periodSamples > 1 && measure.visibleSamples > 0) {
      const visible = Math.min(live.length, Math.max(8, Math.round(measure.visibleSamples)));
      let sampleStart = Number(measure.edge);
      if (!Number.isFinite(sampleStart) || sampleStart < 0) {
        sampleStart = Math.max(0, live.length - visible);
      }
      if (sampleStart + visible > live.length) {
        const periodsBack = Math.ceil(
          (sampleStart + visible - live.length) / measure.periodSamples,
        );
        sampleStart = Math.max(0, sampleStart - periodsBack * measure.periodSamples);
      }
      if (sampleStart + visible > live.length) {
        sampleStart = Math.max(0, live.length - visible);
      }
      const sampleEnd = Math.min(live.length, sampleStart + visible);
      // Always map the lock window across the full usable width (no partial face).
      nodeGraphWaterfallClearTapes(canvas);
      nodeGraphWaterfallInk(
        context, canvas, writeSpec, penMin, usableWidth, spec.bg, sampleStart, sampleEnd,
        { scrollPx: 0, resetPath: true },
      );
      if (Number.isFinite(window.absEnd)) {
        st.lastAbs = window.absEnd;
      }
      st.frac = 0;
      nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
      if (typeof paintNodeGraphOutputProtectOverlay === "function") {
        paintNodeGraphOutputProtectOverlay(context, canvas, spec.density);
      }
      remember();
      return true;
    }
  }
  const samplesPerColumn = Math.max(1e-9, (hz * history) / usableWidth);
  const columnsFloat = window.count / samplesPerColumn + (Number(st.frac) || 0);
  let columns = Math.floor(columnsFloat);
  if (columns < 1) {
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    return true;
  }

  let sampleStart = window.start;
  let sampleEnd = window.end;
  if (columns >= usableWidth) {
    columns = Math.max(1, usableWidth - 1);
    const consume = Math.min(live.length, Math.max(1, Math.round(columns * samplesPerColumn)));
    sampleEnd = live.length;
    sampleStart = Math.max(0, sampleEnd - consume);
    if (Number.isFinite(window.absEnd)) st.lastAbs = window.absEnd;
    st.frac = 0;
  } else if (Number.isFinite(window.absEnd)) {
    st.lastAbs = window.absEnd;
    st.frac = columnsFloat - columns;
  }

  if (columns < 1) {
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    return true;
  }

  nodeGraphWaterfallInk(
    context, canvas, writeSpec, penMax - columns, columns, spec.bg, sampleStart, sampleEnd,
    { scrollPx: columns },
  );
  nodeGraphWaterfallFinishOutputInk(spec, context, canvas, columns);
  if (typeof paintNodeGraphOutputProtectOverlay === "function") {
    paintNodeGraphOutputProtectOverlay(context, canvas, spec.density);
  }
  remember();
  return true;
}
