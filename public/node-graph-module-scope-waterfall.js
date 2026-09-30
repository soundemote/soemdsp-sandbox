// 1D Waterfall — WebGL strip chart (mono / stereo / XYZ / RGB).
// Contract: solid filled peak-to-peak columns (min..max Y per column bin).
// Detail below 1: each column is an independent flat rect. That pitch is the
// bar width, not the scroll step. History moves by time (sub-texel uSub).
// Detail 1 (default): neighboring columns share a continuous edge. Values are
// interpolated from the previous column to this one, across frames, and when
// one sample covers many pixels. Sample plateaus stay flat. A smooth sine
// does not become stairs.
// New columns stamp on the RIGHT; history scrolls LEFT. Never redraw the whole
// face — only scroll existing pixels and fill the new column(s) on the right.
// History (seconds) = freerun window across the face (0 / below eps = PAUSE, keep hold).
// No source sync. A zero-crossing lock fights the scroll+stamp strip.
// WebGL history texture. Instant Waterfall only — no Hz dual-path.

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

/** True when History (seconds) is 0 / below eps — display must pause, not invent a window. */
function nodeGraphWaterfallHistoryIsFrozen(settings) {
  return !(nodeGraphWaterfallHistorySeconds(settings) > NODE_GRAPH_WATERFALL_HISTORY_SEC_EPS);
}

/** Planck amplitude. Same constant as nodeGraphPlanck / NODE_GRAPH_PLANCK. */
function nodeGraphWaterfallPlanck() {
  if (typeof nodeGraphPlanck === "function") {
    const n = Number(nodeGraphPlanck());
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const n = typeof NODE_GRAPH_PLANCK === "number" ? Number(NODE_GRAPH_PLANCK) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 1e-7;
}

/** Display option. Off by default. History at 0 still pauses on its own. */
function nodeGraphWaterfallPauseOnSilence(settings) {
  return settings?.pauseOnSilence === true;
}

/**
 * Raw linear extent never leaves rest. Checked before dB mapping, so a real
 * negative-dB RMS reading is not silence. At or below Planck is no excursion.
 */
function nodeGraphWaterfallExtentIsSilent(minV, maxV) {
  const lo = Number(minV);
  const hi = Number(maxV);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true;
  return Math.max(Math.abs(lo), Math.abs(hi)) <= nodeGraphWaterfallPlanck();
}

/** True when buf's newest count samples include a linear amp above Planck. */
function nodeGraphWaterfallTailIsLoud(buffer, count, planck) {
  const end = buffer?.length || 0;
  const n = Math.max(0, Math.floor(count));
  if (!end || !(n > 0)) return false;
  const start = Math.max(0, end - n);
  for (let s = start; s < end; s += 1) {
    const v = Number(buffer[s]);
    if (Number.isFinite(v) && Math.abs(v) > planck) return true;
  }
  return false;
}

/**
 * Undrawn window is silence on every enabled channel that actually has samples.
 * Empty, missing, or disabled channels are not silence: Output's unwired side,
 * a zero-length ring, or a channel that is not enabled must not latch the hold.
 * The face buffer is included so a loud mono or Wave Raw tail is not ignored
 * because another enabled channel is an empty or quiet ring.
 * Nothing new (count 0) is not silence, so a cursor that has not moved is not eaten.
 */
function nodeGraphWaterfallIncomingIsSilent(spec, settings, window, liveBuffer) {
  const planck = nodeGraphWaterfallPlanck();
  const count = Math.max(0, Math.floor(nodeGraphFiniteNumber(window?.count)));
  if (!(count > 0)) return false;
  const channels = nodeGraphWaterfallChannelList(spec, settings)
    .filter((ch) => ch.enabled !== false && ch.buffer && (ch.buffer.length || 0) > 0);
  const buffers = [];
  const seen = new Set();
  const push = (buf) => {
    if (!buf || !(buf.length > 0) || seen.has(buf)) return;
    seen.add(buf);
    buffers.push(buf);
  };
  for (let i = 0; i < channels.length; i += 1) push(channels[i].buffer);
  push(liveBuffer);
  push(spec?.buffer);
  if (!buffers.length) return false;
  let examined = false;
  for (let i = 0; i < buffers.length; i += 1) {
    const buf = nodeGraphWaterfallPrepare(buffers[i], settings) || buffers[i];
    if (nodeGraphWaterfallTailIsLoud(buf, count, planck)) return false;
    if ((buf?.length || 0) > 0) examined = true;
  }
  return examined;
}

/** @deprecated Use nodeGraphWaterfallHistoryIsFrozen — 0 s pauses; it does not wipe to a now-line. */
function nodeGraphWaterfallIsNowLine(settings) {
  return nodeGraphWaterfallHistoryIsFrozen(settings);
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
  const recentN = recent > 0 ? Math.min(end, recent) : Math.min(end, 1);
  if (Number.isFinite(absEnd) && absEnd > 0 && Number.isFinite(lastAbs) && lastAbs > 0) {
    // Cursor ahead of this ring (pause/stop rewind, or a new session).
    // count 0 here left the plate looking paused after Play even though samples exist.
    if (lastAbs > absEnd) {
      return { count: recentN, absEnd, start: Math.max(0, end - recentN), end };
    }
    if (lastAbs >= absEnd) return { count: 0, absEnd, start: end, end };
    const undrawn = Math.min(end, Math.max(0, Math.floor(absEnd - lastAbs)));
    return { count: undrawn, absEnd, start: Math.max(0, end - undrawn), end };
  }
  return { count: recentN, absEnd, start: Math.max(0, end - recentN), end };
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
 * Sample-unit column extents for a filled bar.
 * One-sided columns expand to rest (0) so Output does not collapse to a 1px speck.
 * Vibrato peaks that already span both sides stay raw min..max.
 * RMS dB faces keep their own scale (linear 0 is not the meter floor).
 * @returns {{ min:number, max:number }}
 */
function nodeGraphWaterfallExcursionBar(minV, maxV, amp) {
  let min = Number(minV);
  let max = Number(maxV);
  if (!(amp && amp.mode === "rmsDb")) {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
  }
  return { min, max };
}


/**
 * Linear sample at a fractional buffer index.
 * Used when detail 1 maps one sample across several columns.
 */
function nodeGraphWaterfallLerpSample(buffer, index) {
  const n = buffer?.length || 0;
  if (!(n > 0) || !Number.isFinite(index)) return NaN;
  if (!(index > 0)) return Number(buffer[0]);
  if (index >= n - 1) return Number(buffer[n - 1]);
  const i0 = Math.floor(index);
  const i1 = i0 + 1;
  const a = Number(buffer[i0]);
  const b = Number(buffer[i1]);
  const frac = index - i0;
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : NaN;
  if (!Number.isFinite(b)) return a;
  return a + (b - a) * frac;
}

/**
 * Peak-to-peak filled-bar specs per pixel column across [start, end).
 * Each entry is a vertical extent in face Y (min sample .. max sample).
 * Detail 1 stores a point sample when a column is narrower than one sample
 * so later stamps can interpolate instead of holding a stair.
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
  const continuous = nodeGraphWaterfallDetailConnects(settings);
  const bars = [];
  for (let c = 0; c < cols; c += 1) {
    const rel0 = (c / cols) * span;
    const rel1 = ((c + 1) / cols) * span;
    let minV = Infinity;
    let maxV = -Infinity;
    let has = false;
    // Detail 1 and this column is narrower than one sample: repeating the
    // held sample across the pixel run is the stair. Take the value at the
    // column's right edge so the next column continues the same line.
    if (continuous && (rel1 - rel0) < 1) {
      const v = nodeGraphWaterfallLerpSample(live, from + rel1);
      if (Number.isFinite(v)) {
        minV = v;
        maxV = v;
        has = true;
      }
    } else {
      const lo = from + Math.floor(rel0);
      const hi = from + Math.min(span, Math.floor(rel1));
      const rangeStart = Math.max(from, lo);
      const rangeEnd = Math.max(rangeStart + 1, Math.min(to, hi === lo ? lo + 1 : hi));
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
    // Exact rest (and Planck-silent) used to map to mid-face, then the <1px
    // pad fillRect'd a 1px hairline. Skip the column. RMS dB stays on its
    // scale: only this linear silence is dropped, not a negative dB reading.
    if (nodeGraphWaterfallExtentIsSilent(minV, maxV)) {
      continue;
    }
    // Shared excursion: one-sided -> rest (0); both sides stay raw min..max.
    const excursion = nodeGraphWaterfallExcursionBar(minV, maxV, amp);
    minV = excursion.min;
    maxV = excursion.max;
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
  if (typeof nodeGraphWaterfallGlReset === "function") {
    nodeGraphWaterfallGlReset(canvas, bg);
  }
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
  // Fractional pixels: low detail must not wait for a whole fat column.
  const n = Math.max(0, nodeGraphFiniteNumber(scrollPx));
  if (!hold || !(n > 1e-4) || hold.width <= 0 || hold.height <= 0) {
    return;
  }
  const w = hold.width;
  const h = hold.height;
  let scratch = hold._wfScrollScratch;
  if (!scratch) {
    scratch = document.createElement("canvas");
    hold._wfScrollScratch = scratch;
  }
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const sctx = scratch.getContext("2d");
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = "copy";
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(hold, -n, 0);
  const ctx = hold.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg || "#000000";
  ctx.fillRect(Math.max(0, w - n), 0, n + 1, h);
}

/** Blit scrolled hold (bg + baked filled bars) to the face. */
function nodeGraphWaterfallPresentHold(destCtx, destCanvas, bg) {
  if (typeof nodeGraphWaterfallGlPresent === "function"
    && nodeGraphWaterfallGlPresent(destCanvas, bg)) {
    return;
  }
  if (!destCtx || !destCanvas) return;
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

/**
 * Integer device-pixel span for one column. Body stays filled peak-to-peak.
 * fillW is the full column (left of this column through left of the next).
 * A 1 device-px column stays 1px. Wider columns are not shrunk by a gutter.
 */
function nodeGraphWaterfallBarDeviceSpan(x0, columnIndex, pitch) {
  const col = nodeGraphFiniteNumber(columnIndex);
  const step = Math.max(1e-6, nodeGraphFiniteNumber(pitch, 1));
  const left = Math.floor(nodeGraphFiniteNumber(x0) + col * step);
  const right = Math.floor(nodeGraphFiniteNumber(x0) + (col + 1) * step);
  const span = Math.max(1, right - left);
  return { x: left, fillW: span };
}

function nodeGraphWaterfallBarThickness(settings) {
  const n = Number(settings?.barThickness);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/**
 * Horizontal ink inside a column. 1 = full device span (current look).
 * 0 = nothing. In between, that fraction of the column, centered.
 */
function nodeGraphWaterfallBarInkRect(span, thickness01) {
  if (!span || !(span.fillW > 0) || !Number.isFinite(span.x)) {
    return null;
  }
  const t = Number(thickness01);
  const thick = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1;
  if (!(thick > 0)) {
    return null;
  }
  if (thick >= 0.999) {
    return { x: span.x, w: span.fillW };
  }
  const w = span.fillW * thick;
  if (!(w > 0)) {
    return null;
  }
  return { x: span.x + (span.fillW - w) * 0.5, w };
}

/** Stamp solid filled peak-to-peak columns. No polyline, no Blur, no Stretch.
 * Detail 1 (edgeOpts.connect): each column is a trapezoid from the previous
 * column's edge to this column's edge, so a slow sine is a continuous fill.
 * Below detail 1, or when bar thickness opens a gutter, columns stay flat rects.
 */
function nodeGraphWaterfallStampConnectedRun(ctx, bars, i0, i1, ox, pitch, prevEdge) {
  const first = bars[i0];
  if (!first) return;
  const usePrev = !!(prevEdge
    && first.x === 0
    && Number.isFinite(prevEdge.y0)
    && Number.isFinite(prevEdge.y1));
  const tops = [];
  const bots = [];
  const xs = [];
  const firstSpan = nodeGraphWaterfallBarDeviceSpan(ox, first.x, pitch);
  xs.push(firstSpan.x);
  if (usePrev) {
    tops.push(Math.min(prevEdge.y0, prevEdge.y1));
    bots.push(Math.max(prevEdge.y0, prevEdge.y1));
  } else {
    tops.push(Math.min(first.y0, first.y1));
    bots.push(Math.max(first.y0, first.y1));
  }
  for (let k = i0; k < i1; k += 1) {
    const b = bars[k];
    if (!b || !Number.isFinite(b.y0) || !Number.isFinite(b.y1)) continue;
    const span = nodeGraphWaterfallBarDeviceSpan(ox, b.x, pitch);
    xs.push(span.x + span.fillW);
    tops.push(Math.min(b.y0, b.y1));
    bots.push(Math.max(b.y0, b.y1));
  }
  if (xs.length < 2) return;
  for (let s = 0; s < xs.length - 1; s += 1) {
    const xL = xs[s];
    const xR = xs[s + 1];
    const w = xR - xL;
    if (!(w > 0)) continue;
    const yT0 = tops[s];
    const yT1 = tops[s + 1];
    const yB0 = bots[s];
    const yB1 = bots[s + 1];
    for (let x = xL; x < xR; x += 1) {
      const f = (x + 0.5 - xL) / w;
      const yT = yT0 + (yT1 - yT0) * f;
      const yB = yB0 + (yB1 - yB0) * f;
      const top = Math.min(yT, yB);
      const h = Math.max(1, Math.abs(yB - yT));
      ctx.fillRect(x, top, 1, h);
    }
  }
}

function nodeGraphWaterfallStampFilledBars(holdCtx, bars, x0, color, bright01, composite, barPx = 1, thickness01 = 1, edgeOpts = null) {
  if (!holdCtx || !Array.isArray(bars) || !bars.length) {
    return;
  }
  const ox = nodeGraphFiniteNumber(x0);
  const pitch = Math.max(1e-6, nodeGraphFiniteNumber(barPx, 1));
  const fill = nodeGraphWaterfallBarFillStyle(color, bright01);
  const thickN = Number(thickness01);
  const thick = Number.isFinite(thickN) ? Math.max(0, Math.min(1, thickN)) : 1;
  const connect = !!(edgeOpts && edgeOpts.connect) && thick >= 0.999;
  const prevEdge = connect ? edgeOpts.prevEdge : null;
  holdCtx.save();
  holdCtx.setTransform(1, 0, 0, 1, 0, 0);
  holdCtx.imageSmoothingEnabled = false;
  holdCtx.globalCompositeOperation = composite || "source-over";
  holdCtx.shadowBlur = 0;
  holdCtx.globalAlpha = 1;
  holdCtx.fillStyle = fill;
  if (!connect) {
    for (let i = 0; i < bars.length; i += 1) {
      const b = bars[i];
      if (!b) continue;
      const y0 = nodeGraphFiniteNumber(b.y0);
      const y1 = nodeGraphFiniteNumber(b.y1);
      if (!Number.isFinite(y0) || !Number.isFinite(y1)) {
        continue;
      }
      const span = nodeGraphWaterfallBarDeviceSpan(ox, b.x, pitch);
      const ink = nodeGraphWaterfallBarInkRect(span, thickness01);
      if (!ink) {
        continue;
      }
      const top = Math.min(y0, y1);
      const h = Math.max(1, Math.abs(y1 - y0));
      holdCtx.fillRect(ink.x, top, ink.w, h);
    }
  } else {
    let i = 0;
    while (i < bars.length) {
      let j = i + 1;
      while (
        j < bars.length
        && bars[j]
        && bars[j - 1]
        && bars[j].x === bars[j - 1].x + 1
      ) {
        j += 1;
      }
      nodeGraphWaterfallStampConnectedRun(holdCtx, bars, i, j, ox, pitch, prevEdge);
      i = j;
    }
  }
  holdCtx.shadowBlur = 0;
  holdCtx.restore();
}

/**
 * Classic strip ink: scroll history left, stamp filled P2P bars on the right.
 * Never rebuilds the whole face. Only scrollPx plus new columns.
 * Freerun seeds options.barAcc into column 0.
 * Detail 1 interpolates column edges (including the previous frame's right edge).
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

  if (options?.resetHold && destCanvas._waterfall) {
    destCanvas._waterfall.edge = Object.create(null);
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
    const continuousEdge = nodeGraphWaterfallDetailConnects(settings);
    const barThick = nodeGraphWaterfallBarThickness(settings);
    const connectEdge = continuousEdge && barThick >= 0.999;
    const edgeMap = connectEdge && destCanvas._waterfall
      ? (destCanvas._waterfall.edge || (destCanvas._waterfall.edge = Object.create(null)))
      : null;
    if (!bars.length) {
      if (edgeMap) delete edgeMap[ch.lastYKey];
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
    // Prev edge is the right side of the last stamp, now scrolled to the left
    // of this strip. Use it only when this strip's first column is drawn
    // (no silent gap) so a slow sine does not step between frames.
    const prevEdge = (edgeMap && bars[0] && bars[0].x === 0)
      ? edgeMap[ch.lastYKey]
      : null;
    nodeGraphWaterfallStampFilledBars(
      holdCtx, bars, x, ch.color, ch.bright ?? 1, layerComposite, barPx,
      barThick,
      connectEdge ? { connect: true, prevEdge } : null,
    );
    if (edgeMap) {
      if (last && last.x === n - 1 && Number.isFinite(last.y0) && Number.isFinite(last.y1)) {
        edgeMap[ch.lastYKey] = { y0: last.y0, y1: last.y1 };
      } else {
        delete edgeMap[ch.lastYKey];
      }
    }
  }

  nodeGraphWaterfallPresentHold(destCtx, destCanvas, plateBg);
  return n;
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

function nodeGraphWaterfallState(canvas, width, height, nowLine, bg, context, blendMode) {
  const st = canvas._waterfall || (canvas._waterfall = {
    started: false,
    lastMs: Number.NaN,
    frac: 0,
    lastAbs: Number.NaN,
    nowLine: false,
    blend: "",
    lastW: 0,
    lastH: 0,
    barAcc: Object.create(null),
    edge: Object.create(null),
  });
  if (!st.barAcc) {
    st.barAcc = Object.create(null);
  }
  canvas._traceScroll = st;
  const blend = String(blendMode || "");
  const resized = Math.abs((st.lastW || 0) - width) > 2 || Math.abs((st.lastH || 0) - height) > 2;
  const modeChanged = st.nowLine !== nowLine || st.blend !== blend;
  if (!st.started || modeChanged) {
    if (typeof nodeGraphFacePlateFillCanvas === "function") {
      nodeGraphFacePlateFillCanvas(context, canvas, bg);
    }
    st.started = true;
    st.lastMs = nodeGraphWaterfallNowMs();
    st.frac = 0;
    st.colPx = 0;
    st.pxCarry = 0;
    st.lastAbs = Number.NaN;
    st.lastW = width;
    st.lastH = height;
    st.nowLine = nowLine;
    st.blend = blend;
    st.barAcc = Object.create(null);
    st.edge = Object.create(null);
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
    st.edge = Object.create(null);
    // Scale-preserve hold + tapes.
    nodeGraphWaterfallEnsureHold(canvas, width, height, bg);
  }
  return st;
}

function nodeGraphWaterfallFaceBlur(settings) {
  const n = Number(settings?.faceBlur);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function nodeGraphWaterfallFinishOutputInk(spec, context, canvas, scrollPx) {
  const face = spec?.canvas || canvas;
  const overlay = typeof nodeGraphWaterfallInkOverlay === "function"
    ? nodeGraphWaterfallInkOverlay(face)
    : null;
  const inkCtx = overlay && overlay.getContext("2d");
  if (inkCtx) {
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(0, 0, overlay.width, overlay.height);
  }
  const destCtx = inkCtx || context;
  const dest = overlay || canvas;
  if (typeof paintNodeGraphOutputInkFrame === "function" && destCtx && dest) {
    const px = Math.round(nodeGraphFiniteNumber(scrollPx));
    paintNodeGraphOutputInkFrame(
      destCtx, dest, spec?.slot, spec?.settings, spec?.density,
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
 * base = round(layoutCssWidth * pixelDensity). pixelDensity is the
 * module-face plate density (0..1) that sizes the layout canvas.
 * Detail (0..1, default 1) scales that: columns = max(1, round(base * detail)).
 * 1 = one bar per layout pixel (max). barPx = backingStoreWidth / columns.
 * The bar fillRects that column times barThickness (1 = full, 0 = none).
 * At detail 1 the stamp interpolates between those column values.
 */
function nodeGraphWaterfallDetail(settings) {
  const raw = Number(settings?.detail);
  const detail = Number.isFinite(raw) ? raw : 1;
  const lo = typeof NODE_GRAPH_WATERFALL_DETAIL_MIN === "number" ? NODE_GRAPH_WATERFALL_DETAIL_MIN : 0;
  const hi = typeof NODE_GRAPH_WATERFALL_DETAIL_MAX === "number" ? NODE_GRAPH_WATERFALL_DETAIL_MAX : 1;
  return Math.max(lo, Math.min(hi, detail));
}

/** Detail 1 joins column edges. Below 1, columns stay independent flat bars. */
function nodeGraphWaterfallDetailConnects(settings) {
  return nodeGraphWaterfallDetail(settings) >= 0.999;
}

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
  const baseColumns = Math.max(1, Math.round(cssW * density));
  const detail = nodeGraphWaterfallDetail(settings);
  const columns = Math.max(1, Math.round(baseColumns * detail));
  const barPx = backing / columns;
  return { columns, barPx, density, cssW, detail };
}


/** Peak-to-peak Y for one open column accumulator. Silent columns draw nothing. */
function nodeGraphWaterfallAccBarYs(acc, buffer, slot, settings, height) {
  if (!acc?.has || nodeGraphWaterfallExtentIsSilent(acc.min, acc.max)) {
    return null;
  }
  const live = nodeGraphWaterfallPrepare(buffer, settings) || buffer;
  const amp = nodeGraphWaterfallAmp(live, slot);
  const excursion = nodeGraphWaterfallExcursionBar(acc.min, acc.max, amp);
  const midY = height * 0.5;
  const halfHeight = nodeGraphWaterfallHalfHeight(height, slot, settings, amp);
  const yMin = nodeGraphWaterfallY(excursion.min, amp.gain, amp.offset, midY, halfHeight, amp);
  const yMax = nodeGraphWaterfallY(excursion.max, amp.gain, amp.offset, midY, halfHeight, amp);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return null;
  }
  let y0 = Math.min(yMin, yMax);
  let y1 = Math.max(yMin, yMax);
  if (y1 - y0 < 1) {
    const mid = (y0 + y1) * 0.5;
    y0 = mid - 0.5;
    y1 = mid + 0.5;
  }
  return { y0, y1 };
}

/**
 * Move history by `advancePx` (sub-column / fractional). Stamp filled bars on
 * the right. Only the open detail column is repainted — not the whole face.
 * Returns the pixel fill of the still-open column (0 if one just completed).
 */
function nodeGraphWaterfallSmoothAdvance(destCtx, destCanvas, spec, options) {
  const width = destCanvas.width;
  const height = destCanvas.height;
  const settings = spec.settings || {};
  const advancePx = Math.max(0, nodeGraphFiniteNumber(options?.advancePx));
  const barPx = Math.max(1e-6, nodeGraphFiniteNumber(options?.barPx, 1));
  const sampleStart = Math.floor(nodeGraphFiniteNumber(options?.sampleStart));
  const sampleEnd = Math.floor(nodeGraphFiniteNumber(options?.sampleEnd));
  let colPx = Math.max(0, nodeGraphFiniteNumber(options?.colPx));
  if (colPx >= barPx) colPx = 0;
  const barAccMap = options?.barAcc || Object.create(null);
  const mode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const plateBg = mode === "multiply" ? "#ffffff" : (spec.bg || "#000000");
  const hold = nodeGraphWaterfallEnsureHold(destCanvas, width, height, plateBg);
  if (!hold) {
    nodeGraphWaterfallFillPlate(destCtx, destCanvas, spec.bg);
    return colPx;
  }
  const holdCtx = hold.getContext("2d");
  if (!holdCtx) {
    nodeGraphWaterfallFillPlate(destCtx, destCanvas, spec.bg);
    return colPx;
  }
  if (advancePx > 1e-4) {
    if (typeof nodeGraphWaterfallGlScroll === "function") {
      nodeGraphWaterfallGlScroll(destCanvas, advancePx, plateBg);
    } else {
      nodeGraphWaterfallScrollHold(hold, advancePx, plateBg);
    }
  }
  const channels = nodeGraphWaterfallChannelList(spec, settings).filter((ch) => ch.enabled !== false);
  if (!channels.length || !(advancePx > 1e-4)) {
    nodeGraphWaterfallPresentHold(destCtx, destCanvas, plateBg);
    return colPx;
  }
  let stampComposite = "source-over";
  if (mode === "lighter" || mode === "screen") stampComposite = mode;
  else if (mode === "multiply" || mode === "difference" || mode === "exclusion" || mode === "xor") {
    stampComposite = mode;
  } else if (mode === "combine" || mode === "meet") {
    stampComposite = "lighter";
  }
  const connectEdge = nodeGraphWaterfallDetailConnects(settings)
    && nodeGraphWaterfallBarThickness(settings) >= 0.999;
  const edgeMap = connectEdge
    ? (destCanvas._waterfall.edge || (destCanvas._waterfall.edge = Object.create(null)))
    : null;
  const sampleSpan = Math.max(0, sampleEnd - sampleStart);
  const leadPx = Math.max(0, nodeGraphFiniteNumber(options?.leadPx));
  const samplePx = Math.max(advancePx - leadPx, 1e-9);
  let pxLeft = advancePx;
  let columnLeft = width - colPx - advancePx;
  while (pxLeft > 1e-4) {
    const room = Math.max(1e-6, barPx - colPx);
    const take = Math.min(pxLeft, room);
    const pxFromStart = advancePx - pxLeft;
    const sample0 = Math.max(0, pxFromStart - leadPx);
    const sample1 = Math.max(0, pxFromStart + take - leadPx);
    const s0 = sampleStart + (sampleSpan * sample0) / samplePx;
    const s1 = sampleStart + (sampleSpan * sample1) / samplePx;
    const repaintW = colPx + take;
    const finishing = colPx + take >= barPx - 1e-3;
    if (typeof nodeGraphWaterfallGlClearColumn === "function") {
      nodeGraphWaterfallGlClearColumn(
        destCanvas, columnLeft, Math.max(1e-3, repaintW), plateBg,
      );
    }
    for (let i = 0; i < channels.length; i += 1) {
      const ch = channels[i];
      let acc = barAccMap[ch.lastYKey];
      if (!acc) {
        acc = nodeGraphWaterfallAccMake();
        barAccMap[ch.lastYKey] = acc;
      }
      const buf = nodeGraphWaterfallPrepare(ch.buffer, settings);
      nodeGraphWaterfallAccPush(acc, buf, s0, Math.max(s0 + 1e-6, s1), settings, spec.slot);
      const ys = nodeGraphWaterfallAccBarYs(acc, ch.buffer, spec.slot, settings, height);
      const layerComposite = (i === 0 && stampComposite !== "multiply")
        ? "source-over"
        : stampComposite;
      if (!ys) {
        if (finishing && edgeMap) delete edgeMap[ch.lastYKey];
        continue;
      }
      if (typeof nodeGraphWaterfallGlStampBar === "function") {
        const prevEdge = connectEdge && edgeMap ? edgeMap[ch.lastYKey] : null;
        nodeGraphWaterfallGlStampBar(
          destCanvas,
          columnLeft,
          Math.max(1e-6, repaintW),
          ys,
          prevEdge,
          connectEdge,
          nodeGraphWaterfallScaleRgb(
            nodeGraphWaterfallParseInkRgb(ch.color),
            nodeGraphWaterfallClamp01(ch.bright ?? 1, 1),
          ),
          layerComposite,
          nodeGraphWaterfallBarThickness(settings),
        );
      }
      if (finishing && edgeMap) {
        edgeMap[ch.lastYKey] = { y0: ys.y0, y1: ys.y1 };
      }
    }
    if (finishing) {
      for (let i = 0; i < channels.length; i += 1) {
        nodeGraphWaterfallAccReset(barAccMap[channels[i].lastYKey]);
      }
      columnLeft += repaintW;
      colPx = 0;
    } else {
      colPx += take;
    }
    pxLeft -= take;
  }
  nodeGraphWaterfallPresentHold(destCtx, destCanvas, plateBg);
  return colPx;
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
  const blendMode = nodeGraphWaterfallBlendMode(settings, { rgbGuns: Boolean(spec?.rgbBuffers) });
  const st = nodeGraphWaterfallState(
    canvas, width, height, false, spec.bg, context, blendMode,
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
  // Transport pause holds the plate. The first playing frame drops the cursor:
  // leaving lastAbs glued at the pre-pause absolute frame made the undrawn
  // count stay 0 after Play, so Output and Vibrato looked stuck in pause.
  // History-at-0 is not a transport hold and must not clear the cursor.
  if (frozen) st.transportHeld = true;
  if (!frozen && st.transportHeld) {
    st.transportHeld = false;
    st.lastAbs = Number.NaN;
    st.frac = 0;
    st.colPx = 0;
    st.pxCarry = 0;
    st.barAcc = Object.create(null);
  }
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
  // Pause on silence: keep the hold. No scroll, no new columns.
  // Eat the silent window so it does not burst-scroll when sound returns.
  if (nodeGraphWaterfallPauseOnSilence(settings)
    && nodeGraphWaterfallIncomingIsSilent(writeSpec, settings, window, live)) {
    if (Number.isFinite(window.absEnd) && window.count > 0) {
      st.lastAbs = window.absEnd;
    }
    nodeGraphWaterfallPresentHold(context, canvas, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }
  const hz = nodeGraphWaterfallVisualHz(live);

  // Time bucket = history / layout-pixel columns (face CSS width * pixel density).
  // Not canvas.width (device px) and not one sample per animation frame.
  const faceCols = nodeGraphWaterfallLayoutColumns(spec, canvas, settings);
  const columnCount = Math.max(1, faceCols.columns);
  const barPx = Math.max(1e-6, faceCols.barPx);
  const samplesPerColumn = Math.max(1e-9, (hz * history) / columnCount);
  const columnsFloat = window.count / samplesPerColumn + (nodeGraphFiniteNumber(st.frac));
  // Pixel step is time across the face, not one detail-column. Detail still
  // sets bar width (barPx); it must not quantize the scroll.
  let advancePx = columnsFloat * barPx;
  const maxPx = Math.max(1, width - 1);
  if (advancePx > maxPx) advancePx = maxPx;
  // Time step is advancePx. The plate commits whole texels; the remainder
  // is uSub so a fat detail column is not the scroll quantum.
  const framePx = advancePx;
  st.pxCarry = nodeGraphFiniteNumber(st.pxCarry) + framePx;
  let movePx = Math.floor(st.pxCarry + 1e-6);
  if (movePx < 0) movePx = 0;
  if (movePx > maxPx) movePx = maxPx;
  const leadPx = Math.max(0, movePx - framePx);
  st.pxCarry = Math.max(0, st.pxCarry - movePx);
  canvas._wfSubPx = st.pxCarry;
  canvas._wfBlur = nodeGraphWaterfallFaceBlur(settings);

  if (!(movePx >= 1)) {
    const channels = nodeGraphWaterfallChannelList(writeSpec, settings)
      .filter((ch) => ch.enabled !== false);
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
    st.frac = 0;
    if (Number.isFinite(window.absEnd) && window.count > 0) {
      st.lastAbs = window.absEnd;
    }
    nodeGraphWaterfallPresentHold(context, canvas, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    remember();
    return true;
  }

  st.frac = 0;
  if (Number.isFinite(window.absEnd) && window.count > 0) {
    st.lastAbs = window.absEnd;
  }
  st.colPx = nodeGraphWaterfallSmoothAdvance(context, canvas, writeSpec, {
    advancePx: movePx,
    barPx,
    sampleStart: window.start,
    sampleEnd: window.end,
    colPx: st.colPx,
    barAcc: st.barAcc,
    leadPx,
  });
  nodeGraphWaterfallFinishOutputInk(spec, context, canvas, movePx);
  remember();
  return true;
}
