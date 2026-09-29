// 1D Waterfall — classic strip chart (mono / stereo / XYZ / RGB).
// Contract: solid filled peak-to-peak vertical rects (min..max Y per column bin).
// New columns stamp on the RIGHT; history scrolls LEFT. Never redraw the whole
// face — only scroll existing pixels and fillRect new column(s) on the right.
// History (seconds) = freerun window across the face (0 / below eps = PAUSE, keep hold).
// Sync On uses the same incremental scroll+stamp path (no full-face rebuild).
// Canvas2D hold plate. Instant Waterfall only — no Hz dual-path.

function nodeGraphWaterfallNowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

/** History seconds at or below this is freeze (no scroll). Do not invent a nonzero window.
 * SSOT const lives in normalize.js (loads first). Do NOT redeclare here — classic
 * scripts share one scope; a second const aborts this whole file (paint ReferenceError).
 */

/**
 * Freerun History window in seconds (Instant Waterfall only).
 * Reads historySeconds only — normalize migrates legacy historyHz once on load.
 * 0 / non-positive / below eps = pause. Missing → default 0.25.
 */
function nodeGraphWaterfallHistorySeconds(settings) {
  const n = Number(settings?.historySeconds);
  if (Number.isFinite(n)) {
    // Explicit 0 / non-positive = pause (do not consult legacy historyHz).
    return n > 0 ? n : 0;
  }
  // Raw bags that skip normalize may still carry historyHz only.
  const hz = Number(settings?.historyHz);
  if (Number.isFinite(hz)) {
    return hz > 0 ? 1 / hz : 0;
  }
  const z = Number(settings?.zoomSeconds);
  if (Number.isFinite(z)) {
    return z > 0 ? z : 0;
  }
  return 0.25;
}

/** Sync-on cycles in view (not historySeconds — that bug made Cycles feel broken). */
function nodeGraphWaterfallHistoryCycles(settings) {
  const n = Number(settings?.historyCycles);
  if (Number.isFinite(n) && n > 0) {
    return Math.max(0.05, Math.min(100, n));
  }
  return 4;
}

/** True when History (seconds) is 0 / below eps — display must pause, not invent a window. */
function nodeGraphWaterfallHistoryIsFrozen(settings) {
  return !(nodeGraphWaterfallHistorySeconds(settings) > NODE_GRAPH_WATERFALL_HISTORY_SEC_EPS);
}

/** @deprecated Use nodeGraphWaterfallHistoryIsFrozen — 0 s pauses; it does not wipe to a now-line. */
function nodeGraphWaterfallIsNowLine(settings) {
  return nodeGraphWaterfallHistoryIsFrozen(settings);
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
    periodSamples = nodeGraphFiniteNumber(triggers?.periodSamples);
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

/** Bipolar +/-1 reaches the face edges. No vertical inset. RMS dB guides use the same full span. */
function nodeGraphWaterfallHalfHeight(height, _slot, _settings, _amp) {
  return nodeGraphFiniteNumber(height, 0) * 0.5;
}

function nodeGraphWaterfallY(raw, gain, offset, midY, halfHeight, amp = null) {
  let bipolar;
  if (amp && typeof amp === "object" && amp.mode === "rmsDb") {
    const useLut = amp.useLogLut !== false;
    const db = typeof nodeGraphRmsLinearToDb === "function"
      ? nodeGraphRmsLinearToDb(raw, useLut)
      : (Number(raw) > 0 ? 20 * Math.log10(Math.max(Number(raw), 1e-10)) : -120);
    bipolar = typeof nodeGraphRmsDbToFaceBipolar === "function"
      ? nodeGraphRmsDbToFaceBipolar(db, amp.minDb, amp.maxDb)
      : 0;
  } else {
    bipolar = (Number.isFinite(Number(raw)) ? Number(raw) : 0) * (nodeGraphFiniteNumber(gain, 1)) + (nodeGraphFiniteNumber(offset));
  }
  return midY - bipolar * halfHeight;
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
  // RMS meter face: dB-linear, Min dB → bottom, Max dB → top (defaults −48…0).
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[slot?.type]
    : null;
  // Vibrato face ring is already y * depthEnv (pre Amplitude). Gain stays 1.
  if (slot?.type === "vibratoGenerator") {
    return { gain: 1, offset: 0 };
  }
  if (def?.rmsDbGuides) {
    if (typeof nodeGraphRmsFaceRangeFromSlot === "function") {
      return nodeGraphRmsFaceRangeFromSlot(slot);
    }
    return {
      mode: "rmsDb",
      gain: 1,
      offset: 0,
      minDb: typeof NODE_GRAPH_RMS_DB_DEFAULT_MIN === "number" ? NODE_GRAPH_RMS_DB_DEFAULT_MIN : -48,
      maxDb: typeof NODE_GRAPH_RMS_DB_CEIL === "number" ? NODE_GRAPH_RMS_DB_CEIL : 0,
    };
  }
  const view = typeof nodeGraphTraceDisplayBufferView === "function"
    ? nodeGraphTraceDisplayBufferView(buffer, slot, { forceSyncOff: true })
    : null;
  return { gain: nodeGraphFiniteNumber(view?.gain, 1), offset: nodeGraphFiniteNumber(view?.offset) };
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
  const recent = Math.max(0, Math.floor(nodeGraphFiniteNumber(buffer.nodeGraphScopeRecentSampleCount)));
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
  const halfHeight = nodeGraphWaterfallHalfHeight(height, slot, settings, amp);
  const raw = Number(live[live.length - 1]);
  if (!Number.isFinite(raw)) return Number.NaN;
  return nodeGraphWaterfallY(
    raw,
    amp.gain,
    amp.offset,
    height * 0.5,
    halfHeight,
    amp,
  );
}

/** Fresh peak-to-peak accumulator (raw sample units). */
function nodeGraphWaterfallAccMake() {
  return { min: Infinity, max: -Infinity, has: false };
}

/** Fold samples into a running min/max. Does not scan beyond [start, end). */
function nodeGraphWaterfallAccPush(acc, buffer, start, end, settings = null, slot = null) {
  if (!acc || !buffer?.length) {
    return acc;
  }
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(buffer.length, Math.max(from, Math.floor(end)));
  if (to <= from) {
    return acc;
  }
  // Fixed peak-tip inspect budget (Detail control removed).
  const maxInspect = 8192;
  const spanN = to - from;
  const step = spanN > maxInspect ? Math.ceil(spanN / maxInspect) : 1;
  for (let i = from; i < to; i += step) {
    const v = Number(buffer[i]);
    if (!Number.isFinite(v)) {
      continue;
    }
    if (!acc.has) {
      acc.min = v;
      acc.max = v;
      acc.has = true;
    } else {
      if (v < acc.min) {
        acc.min = v;
      }
      if (v > acc.max) {
        acc.max = v;
      }
    }
  }
  // Always include the true last sample so the bar tip tracks the newest value.
  if (step > 1 && to > from) {
    const last = Number(buffer[to - 1]);
    if (Number.isFinite(last)) {
      if (!acc.has) {
        acc.min = last;
        acc.max = last;
        acc.has = true;
      } else {
        if (last < acc.min) {
          acc.min = last;
        }
        if (last > acc.max) {
          acc.max = last;
        }
      }
    }
  }
  return acc;
}

function nodeGraphWaterfallAccReset(acc) {
  if (!acc) {
    return nodeGraphWaterfallAccMake();
  }
  acc.min = Infinity;
  acc.max = -Infinity;
  acc.has = false;
  return acc;
}

/** Map a peak-to-peak accumulator to face Y extents (scale stays a display setting). */
function nodeGraphWaterfallAccToYs(acc, buffer, slot, settings, height) {
  if (!acc?.has) {
    return null;
  }
  const live = nodeGraphWaterfallPrepare(buffer, settings) || buffer;
  const amp = nodeGraphWaterfallAmp(live, slot);
  const midY = height * 0.5;
  const halfHeight = nodeGraphWaterfallHalfHeight(height, slot, settings, amp);
  const yMin = nodeGraphWaterfallY(acc.min, amp.gain, amp.offset, midY, halfHeight, amp);
  const yMax = nodeGraphWaterfallY(acc.max, amp.gain, amp.offset, midY, halfHeight, amp);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return null;
  }
  return { y0: Math.min(yMin, yMax), y1: Math.max(yMin, yMax) };
}

/** One vertical peak-to-peak bar as a 2-point TraceTape path. */
function nodeGraphWaterfallBarPoints(x, y0, y1) {
  if (!Number.isFinite(x) || !Number.isFinite(y0) || !Number.isFinite(y1)) {
    return [];
  }
  if (Math.abs(y1 - y0) < 0.5) {
    return [{ x, y: y0 }];
  }
  return [{ x, y: y0 }, { x, y: y1 }];
}

/**
 * Peak-to-peak filled-bar specs per pixel column across [start, end).
 * Each entry is a solid vertical rect in face Y (min sample .. max sample).
 * seedAcc (optional): merge freerun fractional-column remainder into column 0.
 * @returns {{ x:number, y0:number, y1:number }[]}
 */
function nodeGraphWaterfallColumnBars(buffer, slot, columns, height, settings, start, end, seedAcc) {
  const live = nodeGraphWaterfallPrepare(buffer, settings);
  const cols = Math.max(1, Math.floor(nodeGraphFiniteNumber(columns, 1)));
  if (!live?.length || cols < 1) {
    return [];
  }
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(live.length, Math.max(from + 1, Math.floor(end)));
  const amp = nodeGraphWaterfallAmp(live, slot);
  const midY = height * 0.5;
  const halfHeight = nodeGraphWaterfallHalfHeight(height, slot, settings, amp);
  const span = Math.max(1, to - from);
  const bars = [];
  for (let c = 0; c < cols; c += 1) {
    const lo = from + Math.floor((c / cols) * span);
    const hi = from + Math.min(span, Math.floor(((c + 1) / cols) * span));
    const rangeStart = Math.max(from, lo);
    const rangeEnd = Math.max(rangeStart + 1, Math.min(to, hi === lo ? lo + 1 : hi));
    let minV = Infinity;
    let maxV = -Infinity;
    let has = false;
    const spanN = rangeEnd - rangeStart;
    // Fixed peak-tip inspect budget (Detail control removed).
    const maxInspect = 8192;
    const step = spanN > maxInspect ? Math.ceil(spanN / maxInspect) : 1;
    for (let i = rangeStart; i < rangeEnd; i += step) {
      const v = Number(live[i]);
      if (!Number.isFinite(v)) {
        continue;
      }
      if (!has) {
        minV = v;
        maxV = v;
        has = true;
      } else {
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    if (step > 1 && rangeEnd > rangeStart) {
      const last = Number(live[rangeEnd - 1]);
      if (Number.isFinite(last)) {
        if (!has) {
          minV = last;
          maxV = last;
          has = true;
        } else {
          if (last < minV) minV = last;
          if (last > maxV) maxV = last;
        }
      }
    }
    if (c === 0 && seedAcc?.has) {
      if (!has) {
        minV = seedAcc.min;
        maxV = seedAcc.max;
        has = true;
      } else {
        if (seedAcc.min < minV) minV = seedAcc.min;
        if (seedAcc.max > maxV) maxV = seedAcc.max;
      }
    }
    if (!has || !(minV <= maxV)) {
      continue;
    }
    // Vibrato is usually slow: one layout column holds a one-sided lobe.
    // Fill from rest (0) to the accumulated peaks so the bar is the
    // excursion (0..1 or 0..-1), not a 1px speck at the sample. Fast
    // peaks still come from min/max of every sample in the column.
    // Other modules keep the raw min..max sample range.
    if (slot?.type === "vibratoGenerator") {
      if (minV > 0) minV = 0;
      if (maxV < 0) maxV = 0;
    }
    const yMin = nodeGraphWaterfallY(minV, amp.gain, amp.offset, midY, halfHeight, amp);
    const yMax = nodeGraphWaterfallY(maxV, amp.gain, amp.offset, midY, halfHeight, amp);
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      continue;
    }
    let y0 = Math.min(yMin, yMax);
    let y1 = Math.max(yMin, yMax);
    if (y1 - y0 < 1) {
      const mid = (y0 + y1) * 0.5;
      y0 = mid - 0.5;
      y1 = mid + 0.5;
    }
    bars.push({ x: c, y0, y1 });
  }
  return bars;
}

function nodeGraphWaterfallSizePx(face, size01) {
  if (typeof TraceStroke !== "undefined" && typeof TraceStroke.diameterPx === "function") {
    return Math.max(0, TraceStroke.diameterPx(face, size01));
  }
  if (typeof faceInkPx === "function" && typeof clampAuthoredInkPx === "function") {
    return Math.max(0, faceInkPx(clampAuthoredInkPx(size01, 0), face));
  }
  return Math.max(0, nodeGraphFiniteNumber(size01, 0));
}

function nodeGraphWaterfallGlRadius(faceMin, size01) {
  return Math.max(0.5, nodeGraphWaterfallSizePx(faceMin, size01) * 0.5);
}

function nodeGraphWaterfallMargin(radiusPx) {
  return Math.max(1, Math.ceil(Math.max(0.5, nodeGraphFiniteNumber(radiusPx, 0.5))));
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
      Math.max(0, Math.min(255, Math.round(nodeGraphFiniteNumber(color[0])))),
      Math.max(0, Math.min(255, Math.round(nodeGraphFiniteNumber(color[1])))),
      Math.max(0, Math.min(255, Math.round(nodeGraphFiniteNumber(color[2])))),
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
  const r = Math.max(0.5, nodeGraphFiniteNumber(radius, 0.5));
  const w = Math.max(1, nodeGraphFiniteNumber(width, 1));
  const h = Math.max(1, nodeGraphFiniteNumber(height, 1));
  return {
    x: Math.max(r, Math.min(w - r, nodeGraphFiniteNumber(x))),
    y: Math.max(r, Math.min(h - r, nodeGraphFiniteNumber(y))),
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
  return Math.max(0.5, nodeGraphFiniteNumber(radius, 0.5));
}

/**
 * Radial alpha: blur 0 = hard disc at R; blur 1 = smoothstep center → edge at R.
 * Same profile as TraceTape (Size-normalized, no skirt growth).
 */
function nodeGraphWaterfallBlurAlpha(dist, radius, blur01) {
  const r = Math.max(0.5, nodeGraphFiniteNumber(radius, 0.5));
  const soft = nodeGraphWaterfallClamp01(blur01, 0);
  const t = Math.max(0, nodeGraphFiniteNumber(dist)) / r;
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
  const rQ = Math.round(Math.max(0.5, nodeGraphFiniteNumber(radius, 0.5)) * 4) / 4;
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
  const r = Math.max(0.5, nodeGraphFiniteNumber(radius, 0.5));
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
  const ox = nodeGraphFiniteNumber(x0);
  if (!ox || !Array.isArray(points)) return points || [];
  return points.map((p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return null;
    }
    return { x: p.x + ox, y: p.y };
  });
}

/** Polyline length in px (null breaks reset). Used for stamp budget vs Scale. */
function nodeGraphWaterfallPathLength(points) {
  if (!Array.isArray(points) || !points.length) {
    return 0;
  }
  let len = 0;
  let prev = null;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      prev = null;
      continue;
    }
    if (prev) {
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
    }
    prev = p;
  }
  return len;
}

function nodeGraphWaterfallChannelList(spec, settings) {
  const size = settings.dot1Size ?? 2;
  const enabled = settings.dot1Enabled !== false;
  const color = settings.color || settings.dot1Color || "#ff3333";
  const blur = nodeGraphWaterfallClamp01(settings.blur ?? settings.lineThickness, 0);
  const bright = nodeGraphWaterfallClamp01(settings.dot1Brightness ?? settings.brightness, 1);
  const secondaryBright = nodeGraphWaterfallClamp01(
    settings.secondaryBrightness ?? settings.dot1Brightness ?? settings.brightness,
    bright,
  );
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
      bright,
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
        bright,
        lastYKey: "_waterfallLastLeftY",
      },
      {
        buffer: spec.stereoBuffers.right,
        color: settings.secondaryColor || "#0000ff",
        size: settings.secondarySize ?? size,
        enabled: settings.secondaryEnabled !== false,
        blur,
        bright: secondaryBright,
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
    bright,
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

/**
 * Persistent 2D plate that scrolls with the waterfall. New columns on the
 * right are filled with the *current* background so bg color changes travel
 * left with the ink (old canvas drawImage hold path).
 */
function nodeGraphWaterfallEnsureHold(canvas, width, height, bg) {
  if (!canvas) {
    return null;
  }
  let hold = canvas._waterfallHold;
  if (!hold) {
    hold = document.createElement("canvas");
    canvas._waterfallHold = hold;
  }
  const w = Math.max(1, Math.floor(nodeGraphFiniteNumber(width, 1)));
  const h = Math.max(1, Math.floor(nodeGraphFiniteNumber(height, 1)));
  if (hold.width === w && hold.height === h) {
    return hold;
  }
  const prevW = hold.width;
  const prevH = hold.height;
  let prev = null;
  if (prevW > 0 && prevH > 0) {
    prev = document.createElement("canvas");
    prev.width = prevW;
    prev.height = prevH;
    prev.getContext("2d").drawImage(hold, 0, 0);
  }
  hold.width = w;
  hold.height = h;
  const ctx = hold.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (prev) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(prev, 0, 0, w, h);
  } else {
    ctx.fillStyle = bg || "#000000";
    ctx.fillRect(0, 0, w, h);
  }
  return hold;
}

function nodeGraphWaterfallResetHold(canvas, bg) {
  const hold = canvas?._waterfallHold;
  if (!hold || hold.width <= 0 || hold.height <= 0) {
    return;
  }
  const ctx = hold.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg || "#000000";
  ctx.fillRect(0, 0, hold.width, hold.height);
}

function nodeGraphWaterfallScrollHold(hold, scrollPx, bg) {
  const n = Math.max(0, Math.round(nodeGraphFiniteNumber(scrollPx)));
  if (!hold || n <= 0 || hold.width <= 0 || hold.height <= 0) {
    return;
  }
  const ctx = hold.getContext("2d");
  const w = hold.width;
  const h = hold.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = false;
  // Content moves left; print current bg into the newly revealed right edge.
  ctx.drawImage(hold, -n, 0);
  ctx.fillStyle = bg || "#000000";
  ctx.fillRect(Math.max(0, w - n), 0, n, h);
}

/** Blit scrolled hold (bg + baked filled bars) to the face. */
function nodeGraphWaterfallPresentHold(destCtx, destCanvas, bg) {
  const w = destCanvas.width;
  const h = destCanvas.height;
  const hold = nodeGraphWaterfallEnsureHold(destCanvas, w, h, bg || "#000000");
  if (!hold) {
    return;
  }
  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  destCtx.globalCompositeOperation = "source-over";
  destCtx.globalAlpha = 1;
  destCtx.imageSmoothingEnabled = false;
  destCtx.drawImage(hold, 0, 0);
  destCtx.restore();
}

/** Fill-style for a channel bar (honors brightness). */
function nodeGraphWaterfallBarFillStyle(color, bright01) {
  const rgb = nodeGraphWaterfallParseInkRgb(color);
  const a = Math.max(0, Math.min(1, nodeGraphWaterfallClamp01(bright01, 1)));
  if (a >= 0.999) {
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }
  return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
}

/** Stamp solid filled peak-to-peak column rects. No polyline, no Blur, no Stretch. */
function nodeGraphWaterfallStampFilledBars(holdCtx, bars, x0, color, bright01, composite, barPx = 1) {
  if (!holdCtx || !Array.isArray(bars) || !bars.length) {
    return;
  }
  const ox = nodeGraphFiniteNumber(x0);
  const w = Math.max(1, nodeGraphFiniteNumber(barPx, 1));
  const fill = nodeGraphWaterfallBarFillStyle(color, bright01);
  holdCtx.save();
  holdCtx.setTransform(1, 0, 0, 1, 0, 0);
  holdCtx.imageSmoothingEnabled = false;
  holdCtx.globalCompositeOperation = composite || "source-over";
  holdCtx.shadowBlur = 0;
  holdCtx.globalAlpha = 1;
  holdCtx.fillStyle = fill;
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    if (!b) continue;
    const x = ox + nodeGraphFiniteNumber(b.x) * w;
    const y0 = nodeGraphFiniteNumber(b.y0);
    const y1 = nodeGraphFiniteNumber(b.y1);
    if (!Number.isFinite(x) || !Number.isFinite(y0) || !Number.isFinite(y1)) {
      continue;
    }
    const top = Math.min(y0, y1);
    const h = Math.max(1, Math.abs(y1 - y0));
    holdCtx.fillRect(x, top, w, h);
  }
  holdCtx.shadowBlur = 0;
  holdCtx.restore();
}

/**
 * Classic strip ink: scroll history left, stamp filled P2P bars on the right.
 * Never rebuilds the whole face — only scrollPx + new columns.
 * Freerun seeds options.barAcc into column 0; Sync uses the same path.
 */
function nodeGraphWaterfallInk(destCtx, destCanvas, spec, x0, columns, bg, sampleStart, sampleEnd, options) {
  const width = destCanvas.width;
  const height = destCanvas.height;
  const settings = spec.settings || {};
  // n is layout-pixel columns. scrollPx is the backing-store strip they occupy
  // (column width comes from the face pixel density, not 1 device px).
  let n = Math.max(1, Math.floor(columns));
  const barPxIn = Math.max(1e-6, nodeGraphFiniteNumber(options?.barPx, 1));
  let strip = Math.max(0, Math.round(nodeGraphFiniteNumber(options?.scrollPx)));
  if (strip < 1) strip = Math.max(1, Math.round(n * barPxIn));
  if (strip > width) strip = width;
  if (n > strip) n = strip;
  let x = Math.floor(nodeGraphFiniteNumber(x0));
  if (!(x >= 0) || x + strip > width) {
    x = Math.max(0, width - strip);
  }
  if (n < 1 || x >= width) return 0;
  const barPx = strip / n;

  const scrollPx = strip;
  const mode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const count = Math.max(0, Math.floor(sampleEnd) - Math.floor(sampleStart));
  const channels = nodeGraphWaterfallChannelList(spec, settings).filter((ch) => ch.enabled !== false);
  if (!channels.length) return n;

  const plateBg = mode === "multiply" ? "#ffffff" : (bg || "#000000");
  const hold = nodeGraphWaterfallEnsureHold(destCanvas, width, height, plateBg);
  if (!hold) {
    nodeGraphWaterfallFillPlate(destCtx, destCanvas, bg);
    return n;
  }
  const holdCtx = hold.getContext("2d");
  if (!holdCtx) {
    nodeGraphWaterfallFillPlate(destCtx, destCanvas, bg);
    return n;
  }

  // Scroll existing pixels left; reveal right edge with current bg (no full redraw).
  if (options?.resetHold) {
    nodeGraphWaterfallResetHold(destCanvas, plateBg);
  } else if (scrollPx > 0) {
    nodeGraphWaterfallScrollHold(hold, scrollPx, plateBg);
  }

  const barAccMap = options?.barAcc || null;
  let stampComposite = "source-over";
  if (mode === "lighter" || mode === "screen") stampComposite = mode;
  else if (mode === "multiply" || mode === "difference" || mode === "exclusion" || mode === "xor") {
    stampComposite = mode;
  } else if (mode === "combine" || mode === "meet") {
    // Meet without GPU tapes: additive overlap of solid bars.
    stampComposite = "lighter";
  }

  for (let i = 0; i < channels.length; i += 1) {
    const ch = channels[i];
    const buf = nodeGraphWaterfallPrepare(ch.buffer, settings);
    const bufLen = buf?.length || 0;
    const argStart = Math.floor(Number(sampleStart));
    const argEnd = Math.floor(Number(sampleEnd));
    const useArgs = Number.isFinite(argStart) && Number.isFinite(argEnd) && argEnd > argStart;
    const end = useArgs ? Math.min(bufLen, argEnd) : bufLen;
    const start = useArgs
      ? Math.max(0, Math.min(end - 1, argStart))
      : Math.max(0, end - count);

    let seed = null;
    if (barAccMap) {
      seed = barAccMap[ch.lastYKey] || null;
    }
    const bars = nodeGraphWaterfallColumnBars(
      ch.buffer, spec.slot, n, height, settings, start, end, seed,
    );
    if (seed) {
      nodeGraphWaterfallAccReset(seed);
    }
    if (!bars.length) {
      continue;
    }
    const last = bars[bars.length - 1];
    if (last && Number.isFinite(last.y1)) {
      destCanvas[ch.lastYKey] = last.y1;
    }
    // First channel source-over into cleared right edge; further channels blend.
    const layerComposite = (i === 0 && stampComposite !== "multiply")
      ? "source-over"
      : stampComposite;
    nodeGraphWaterfallStampFilledBars(
      holdCtx, bars, x, ch.color, ch.bright ?? 1, layerComposite, barPx,
    );
  }

  nodeGraphWaterfallPresentHold(destCtx, destCanvas, plateBg);
  return n;
}

function nodeGraphWaterfallSyncSource(spec) {
  const channel = typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(spec?.settings)
    : "off";
  if (channel === "off") return null;
  const inputSync = typeof nodeGraphModuleTraceInputSyncBuffer === "function"
    ? nodeGraphModuleTraceInputSyncBuffer(spec?.slot?.nodeId, spec?.slot?.type)
    : null;
  if (inputSync?.length) {
    return inputSync;
  }
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
  if (canvas._waterfall) {
    canvas._waterfall.barAcc = Object.create(null);
  }
  canvas._waterfall = null;
  canvas._traceScroll = null;
  canvas._waterfallHold = null;
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
    barAcc: Object.create(null),
  });
  if (!st.barAcc) {
    st.barAcc = Object.create(null);
  }
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
    st.barAcc = Object.create(null);
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
    // Fresh mode → fresh scrolled bg plate (filled with current bg).
    nodeGraphWaterfallEnsureHold(canvas, width, height, bg);
    nodeGraphWaterfallResetHold(canvas, bg);
  } else if (resized) {
    st.lastW = width;
    st.lastH = height;
    // Scale-preserve hold + tapes.
    nodeGraphWaterfallEnsureHold(canvas, width, height, bg);
  }
  return st;
}

function nodeGraphWaterfallFinishOutputInk(spec, context, canvas, scrollPx) {
  if (typeof paintNodeGraphOutputInkFrame === "function") {
    const px = Math.round(nodeGraphFiniteNumber(scrollPx));
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
  const mode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const plateBg = mode === "multiply" ? "#ffffff" : (bg || "#000000");
  nodeGraphWaterfallEnsureHold(canvas, width, height, plateBg);
  nodeGraphWaterfallResetHold(canvas, plateBg);
  const hold = canvas._waterfallHold;
  const holdCtx = hold?.getContext("2d");
  if (!holdCtx) {
    nodeGraphWaterfallFillPlate(context, canvas, bg);
    return true;
  }
  const channelList = nodeGraphWaterfallChannelList(spec, settings).filter((ch) => ch.enabled !== false);
  let stampComposite = "source-over";
  if (mode === "lighter" || mode === "screen") stampComposite = mode;
  else if (mode === "multiply") stampComposite = "multiply";
  else if (mode === "combine" || mode === "meet") stampComposite = "lighter";
  for (let idx = 0; idx < channelList.length; idx += 1) {
    const ch = channelList[idx];
    const y = nodeGraphWaterfallLatestY(ch.buffer, spec.slot, settings, height);
    if (!Number.isFinite(y)) continue;
    const layerComposite = (idx === 0 && stampComposite !== "multiply")
      ? "source-over"
      : stampComposite;
    holdCtx.save();
    holdCtx.setTransform(1, 0, 0, 1, 0, 0);
    holdCtx.globalCompositeOperation = layerComposite;
    holdCtx.fillStyle = nodeGraphWaterfallBarFillStyle(ch.color, ch.bright ?? 1);
    // 1px filled now-line across the face (not a stroked TraceTape path).
    holdCtx.fillRect(0, Math.floor(y), width, 1);
    holdCtx.restore();
  }
  nodeGraphWaterfallPresentHold(context, canvas, plateBg);
  return true;
}


/**
 * History column count from the circuit-builder face, not from a fixed
 * frame sample and not from device pixels.
 * columns = round(layoutCssWidth * pixelDensity). pixelDensity is the
 * module-face plate density (0..1) that sizes the layout canvas.
 * barPx = backingStoreWidth / columns (one bar per layout pixel).
 */
function nodeGraphWaterfallLayoutColumns(spec, canvas, settings) {
  const density = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(settings, nodeGraphFiniteNumber(spec?.density, 1))
    : Math.max(0, Math.min(1, nodeGraphFiniteNumber(
      spec?.density,
      nodeGraphFiniteNumber(settings?.pixelDensity, 1),
    )));
  const screen = spec?.item?.screenElement || spec?.slot?.scopeElement || null;
  let cssW = 0;
  if (screen && typeof ensureFaceMetrics === "function") {
    const metrics = ensureFaceMetrics(screen, { observe: false });
    cssW = Number(metrics?.cssW || metrics?.cssWidth || 0);
  }
  const dpr = Math.max(1, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const backing = Math.max(1, Math.floor(nodeGraphFiniteNumber(canvas?.width, 1)));
  if (!(cssW > 0)) {
    const den = density > 1e-6 ? density : 1;
    cssW = backing / (dpr * den);
  }
  cssW = Math.max(1, cssW);
  const columns = Math.max(1, Math.round(cssW * density));
  const barPx = backing / columns;
  return { columns, barPx, density, cssW };
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

  // 0 / below eps History (seconds) = PAUSE (keep hold). Never wipe to a now-line or invent a window.
  const historyFrozen = nodeGraphWaterfallHistoryIsFrozen(settings);
  const syncOn = !historyFrozen && nodeGraphWaterfallSyncIsOn(settings);
  const blendMode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const st = nodeGraphWaterfallState(
    canvas, width, height, syncOn, false, spec.bg, context, blendMode,
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

  const frozen = typeof scopePaintIsFrozen === "function" && scopePaintIsFrozen();
  const window = nodeGraphWaterfallUndrawn(live, st.lastAbs);
  if (!Number.isFinite(st.lastAbs) && Number.isFinite(window.absEnd) && window.count > 0) {
    st.lastAbs = Math.max(0, window.absEnd - window.count);
  }
  // Transport freeze OR History (seconds) <= eps: keep last scrolled plate (no advance).
  if (frozen || historyFrozen) {
    nodeGraphWaterfallPresentHold(context, canvas, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }

  const history = nodeGraphWaterfallHistorySeconds(settings);
  // Only advance when history seconds > eps — never invent a fake nonzero window.
  if (!(history > NODE_GRAPH_WATERFALL_HISTORY_SEC_EPS)) {
    nodeGraphWaterfallPresentHold(context, canvas, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }
  const hz = nodeGraphWaterfallVisualHz(live);

  // Sync On uses the same incremental scroll+stamp path as freerun (no full-face
  // rebuild). Period/Cycles measurement is retained for state but does not wipe ink.
  // Time bucket = history / layout-pixel columns (face CSS width * pixel density).
  // Not canvas.width (device px) and not one sample per animation frame.
  const faceCols = nodeGraphWaterfallLayoutColumns(spec, canvas, settings);
  const columnCount = Math.max(1, faceCols.columns);
  const barPx = Math.max(1e-6, faceCols.barPx);
  const samplesPerColumn = Math.max(1e-9, (hz * history) / columnCount);
  const columnsFloat = window.count / samplesPerColumn + (nodeGraphFiniteNumber(st.frac));
  let columns = Math.floor(columnsFloat);

  // Fractional-column remainder only: push into barAcc when we cannot stamp yet.
  // When columns >= 1, ColumnBars bins the undrawn window itself — do not also
  // fold those samples into barAcc or column 0 would absorb the whole span.
  const channels = nodeGraphWaterfallChannelList(writeSpec, settings)
    .filter((ch) => ch.enabled !== false);

  if (columns < 1) {
    for (const ch of channels) {
      let acc = st.barAcc[ch.lastYKey];
      if (!acc) {
        acc = nodeGraphWaterfallAccMake();
        st.barAcc[ch.lastYKey] = acc;
      }
      const buf = nodeGraphWaterfallPrepare(ch.buffer, settings);
      const bufLen = buf?.length || 0;
      const end = bufLen;
      const start = Math.max(0, end - Math.max(0, window.count));
      nodeGraphWaterfallAccPush(acc, buf, start, end, settings, spec.slot);
    }
    // Carry fractional column progress across frames. After History->seconds,
    // multi-second windows make samplesPerColumn larger than a single undrawn
    // chunk; dropping st.frac here left columnsFloat < 1 forever (blank Wave/Out).
    // Stamp only when History advances at least one column (no same-pixel stack).
    st.frac = columnsFloat;
    if (Number.isFinite(window.absEnd) && window.count > 0) {
      st.lastAbs = window.absEnd;
    }
    nodeGraphWaterfallPresentHold(context, canvas, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }

  let sampleStart = window.start;
  let sampleEnd = window.end;
  if (columns >= columnCount) {
    columns = columnCount > 1 ? columnCount - 1 : 1;
    const consume = Math.min(live.length, Math.max(1, Math.round(columns * samplesPerColumn)));
    sampleEnd = live.length;
    sampleStart = Math.max(0, sampleEnd - consume);
    if (Number.isFinite(window.absEnd)) st.lastAbs = window.absEnd;
    st.frac = 0;
  } else if (Number.isFinite(window.absEnd)) {
    st.lastAbs = window.absEnd;
    st.frac = columnsFloat - columns;
  }

  // Scroll left + stamp solid filled P2P bars on the right (seed barAcc into column 0).
  const scrollPx = Math.max(1, Math.min(Math.max(1, width - 1), Math.round(columns * barPx)));
  nodeGraphWaterfallInk(
    context, canvas, writeSpec, width - scrollPx, columns, spec.bg, sampleStart, sampleEnd,
    { scrollPx, barPx, barAcc: st.barAcc },
  );
  nodeGraphWaterfallFinishOutputInk(spec, context, canvas, scrollPx);
  remember();
  return true;
}
