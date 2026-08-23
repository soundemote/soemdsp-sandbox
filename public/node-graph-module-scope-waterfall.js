// 1D Waterfall — strip chart.
//
// The dest canvas is the tape. History (s) is how long that tape is.
// History 0 = infinitely small tape: a full-width "now" line, no scroll.
//
// Sync Off  = tape moves left, pen stays on the right edge.
// Sync On   = tape stays put, pen walks left → right, then waits off-screen
//             until the next rising edge.
//
// New time becomes new PIXEL COLUMNS from NEW samples only (time-forward).
// Dot Budget / TraceHistoryDraw thinning is not used here.

function nodeGraphWaterfallNowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function nodeGraphWaterfallHistorySeconds(settings) {
  const n = Number(settings?.historySeconds ?? settings?.zoomSeconds);
  if (!Number.isFinite(n) || n < 0) {
    return 2;
  }
  return n;
}

function nodeGraphWaterfallIsNowLine(settings) {
  return nodeGraphWaterfallHistorySeconds(settings) <= 0;
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
    if (hz > 0) {
      return hz;
    }
  }
  const engine = Number(nodeGraphModuleScopeState?.sampleRate) || Number(nodeGraphMvp?.sampleRate);
  return engine > 0 ? engine : 44100;
}

function nodeGraphWaterfallAmp(buffer, slot) {
  const view = typeof nodeGraphTraceDisplayBufferView === "function"
    ? nodeGraphTraceDisplayBufferView(buffer, slot, { forceSyncOff: true })
    : null;
  return {
    gain: Number(view?.gain) || 1,
    offset: Number(view?.offset) || 0,
  };
}

function nodeGraphWaterfallAbsEnd(buffer) {
  if (typeof nodeGraphScopeBufferAbsoluteFrame === "function") {
    const n = nodeGraphScopeBufferAbsoluteFrame(buffer);
    if (n > 0) {
      return n;
    }
  }
  const abs = Number(buffer?.nodeGraphScopeAbsoluteFrame);
  if (Number.isFinite(abs) && abs > 0) {
    return abs;
  }
  const total = Number(buffer?.nodeGraphScopeTotalSampleCount);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }
  return Number.NaN;
}

/** New samples since lastAbs. First paint uses this callback's recent count, not the whole ring. */
function nodeGraphWaterfallUndrawn(buffer, lastAbs) {
  const live = buffer;
  const end = live?.length || 0;
  if (!end) {
    return { count: 0, absEnd: Number.NaN, start: 0, end: 0 };
  }
  const absEnd = nodeGraphWaterfallAbsEnd(live);
  const recent = Math.max(0, Math.floor(Number(live.nodeGraphScopeRecentSampleCount) || 0));
  if (Number.isFinite(absEnd) && absEnd > 0 && Number.isFinite(lastAbs) && lastAbs > 0) {
    if (lastAbs >= absEnd) {
      return { count: 0, absEnd, start: end, end };
    }
    const undrawn = Math.min(end, Math.max(0, Math.floor(absEnd - lastAbs)));
    return {
      count: undrawn,
      absEnd,
      start: Math.max(0, end - undrawn),
      end,
    };
  }
  const n = recent > 0 ? Math.min(end, recent) : Math.min(end, 1);
  return {
    count: n,
    absEnd,
    start: Math.max(0, end - n),
    end,
  };
}

function nodeGraphWaterfallLatestY(buffer, slot, settings, height) {
  const live = nodeGraphWaterfallPrepare(buffer, settings);
  if (!live?.length) {
    return Number.NaN;
  }
  const amp = nodeGraphWaterfallAmp(live, slot);
  const raw = Number(live[live.length - 1]);
  return nodeGraphWaterfallY(raw, amp.gain, amp.offset, height * 0.5, height * 0.42);
}

/**
 * Min/max envelope per destination column (every sample in the time bucket).
 * Last-sample-per-column looked downsampled (missed peaks). Plotting every
 * sample as a circular stamp fattened sine crests (slow dY, stamps pile up).
 * Two verts per column, time-ordered extrema, keeps peaks without blobs.
 */
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
  if (Number.isFinite(prevY)) {
    points.push({ x: 0, y: prevY });
  }
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
      if (!Number.isFinite(v)) {
        continue;
      }
      if (v < minV) {
        minV = v;
        minI = i;
      }
      if (v > maxV) {
        maxV = v;
        maxI = i;
      }
    }
    if (!(minV <= maxV)) {
      continue;
    }
    const x = c + 0.5;
    const yMin = nodeGraphWaterfallY(minV, amp.gain, amp.offset, midY, halfHeight);
    const yMax = nodeGraphWaterfallY(maxV, amp.gain, amp.offset, midY, halfHeight);
    if (minI === maxI || Math.abs(yMin - yMax) < 0.5) {
      points.push({ x, y: yMin });
    } else if (minI < maxI) {
      points.push({ x, y: yMin });
      points.push({ x, y: yMax });
    } else {
      points.push({ x, y: yMax });
      points.push({ x, y: yMin });
    }
  }
  return points;
}

function nodeGraphWaterfallStroke(context, points, color, sizePx, composite) {
  if (!context || !points?.length) {
    return;
  }
  context.save();
  context.globalCompositeOperation = composite || "source-over";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1, Number(sizePx) || 1);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    context.lineTo(points[0].x, points[0].y + 0.5);
  } else {
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }
  }
  context.stroke();
  context.restore();
}

function nodeGraphWaterfallSizePx(face, size01) {
  if (typeof nodeGraphScopeSize01ToDiameterPx === "function") {
    return nodeGraphScopeSize01ToDiameterPx(face, size01);
  }
  return Math.max(1, face * Math.max(0.001, Number(size01) || 0.035));
}

function nodeGraphWaterfallLutRgb(hex, fallback = [255, 51, 51]) {
  if (typeof nodeGraphScopeHexColorToRgb === "function") {
    const rgb = nodeGraphScopeHexColorToRgb(hex);
    if (Array.isArray(rgb) && rgb.length >= 3) {
      if (rgb[0] > 1.01 || rgb[1] > 1.01 || rgb[2] > 1.01) {
        return [rgb[0], rgb[1], rgb[2]];
      }
      return [
        Math.round(rgb[0] * 255),
        Math.round(rgb[1] * 255),
        Math.round(rgb[2] * 255),
      ];
    }
  }
  const text = String(hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return [
      parseInt(text.slice(1, 3), 16),
      parseInt(text.slice(3, 5), 16),
      parseInt(text.slice(5, 7), 16),
    ];
  }
  return fallback.slice();
}

function nodeGraphWaterfallTapeAvailable() {
  return typeof TraceTape !== "undefined"
    && typeof TraceTape.ensure === "function"
    && typeof TraceTape.stamp === "function"
    && typeof TraceTape.presentTo === "function";
}

function nodeGraphWaterfallShiftPath(points, x0) {
  const ox = Number(x0) || 0;
  if (!Array.isArray(points) || !ox) {
    return points || [];
  }
  return points.map((p) => (p && Number.isFinite(p.x) ? { x: p.x + ox, y: p.y } : p));
}

function nodeGraphWaterfallStampLayer(tape, layer, faceMin, blur, coverage) {
  if (!tape || !layer || layer.enabled === false || !layer.points?.length) {
    return;
  }
  const radius = typeof TraceTape.radiusFromSize === "function"
    ? TraceTape.radiusFromSize(faceMin, layer.size)
    : Math.max(0.35, faceMin * (Number(layer.size) || 0.035) * 0.5);
  TraceTape.stamp(tape, {
    pathPoints: layer.points,
    radius,
    blur,
    brightness: Math.max(0, Number(layer.brightness) || 0),
    color: coverage ? "#ffffff" : layer.color,
    maxDots: 2048,
    // ≥ radius: no overlapping discs at slow dY (sine peaks).
    spacingPx: Math.max(1, radius),
  });
}

function nodeGraphWaterfallAdvanceTape(tape, options) {
  if (!tape || options.frozen === true) {
    return;
  }
  if (options.clear === true) {
    TraceTape.clear(tape);
  }
  const scrollPx = Math.round(Number(options.scrollPx) || 0);
  if (scrollPx) {
    TraceTape.scroll(tape, scrollPx);
  }
}

function nodeGraphWaterfallRunTape(canvas, destCtx, layers, options = {}) {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const list = Array.isArray(layers) ? layers : [];
  const faceMin = Math.min(width, height);
  const blur = Number.isFinite(Number(options.blur)) ? Number(options.blur) : 0.22;
  const blend = String(options.blend || "source-over");
  const leftLayer = list[0] || null;
  const rightLayer = list[1] || null;
  const meet = (blend === "combine" || blend === "meet")
    && leftLayer
    && rightLayer
    && typeof TraceTape.presentMeet === "function";

  if (meet) {
    const leftTape = TraceTape.ensure(canvas, width, height, "_traceTapeL");
    const rightTape = TraceTape.ensure(canvas, width, height, "_traceTapeR");
    if (!leftTape || !rightTape) {
      return false;
    }
    nodeGraphWaterfallAdvanceTape(leftTape, options);
    nodeGraphWaterfallAdvanceTape(rightTape, options);
    if (options.frozen !== true) {
      nodeGraphWaterfallStampLayer(leftTape, leftLayer, faceMin, blur, true);
      nodeGraphWaterfallStampLayer(rightTape, rightLayer, faceMin, blur, true);
    }
    return TraceTape.presentMeet(leftTape, rightTape, destCtx, {
      width,
      height,
      leftColor: leftLayer.color,
      rightColor: rightLayer.color,
      meetColor: options.meetColor || "auto",
      smooth: false,
    });
  }

  const tape = TraceTape.ensure(canvas, width, height, "_traceTapeRgb");
  if (!tape) {
    return false;
  }
  nodeGraphWaterfallAdvanceTape(tape, options);
  if (options.frozen !== true) {
    for (let i = 0; i < list.length; i += 1) {
      nodeGraphWaterfallStampLayer(tape, list[i], faceMin, blur, false);
    }
  }
  return TraceTape.presentTo(tape, destCtx, {
    width,
    height,
    composite: "source-over",
    smooth: false,
  });
}

function nodeGraphWaterfallPrimaryLayer(settings) {
  return {
    enabled: settings.dot1Enabled !== false,
    size: settings.dot1Size ?? 0.035,
    brightness: settings.dot1Brightness ?? settings.brightness ?? 0.95,
    color: settings.color || settings.dot1Color || "#ff3333",
  };
}

function nodeGraphWaterfallSecondaryLayer(settings, leftLayer) {
  return {
    enabled: settings.secondaryEnabled !== false,
    size: settings.secondarySize ?? leftLayer.size,
    brightness: settings.secondaryBrightness ?? leftLayer.brightness,
    color: settings.secondaryColor || "#0000ff",
  };
}

/** Stroke without Dot Budget / TraceHistoryDraw thinning. Meet uses TraceStroke.drawStereo. */
function nodeGraphWaterfallDrawLayers(context, left, right, leftLayer, rightLayer, blend, face) {
  const mode = String(blend || "combine");
  if (mode === "combine"
    && typeof TraceStroke !== "undefined"
    && typeof TraceStroke.drawStereo === "function") {
    TraceStroke.drawStereo(
      context,
      leftLayer.enabled === false ? [] : left,
      rightLayer.enabled === false ? [] : right,
      {
        size: leftLayer.size,
        blur: 0,
        brightness: leftLayer.brightness,
        fade: 0,
        color: leftLayer.color,
        faceMinSide: face,
      },
      {
        size: rightLayer.size,
        blur: 0,
        brightness: rightLayer.brightness,
        fade: 0,
        color: rightLayer.color,
        faceMinSide: face,
      },
      {
        blend: "combine",
        leftColor: leftLayer.color,
        rightColor: rightLayer.color,
        meetColor: "auto",
        lineCap: "butt",
      },
    );
    return;
  }
  const composite = mode === "combine" ? "lighter" : mode;
  if (leftLayer.enabled !== false) {
    if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
      TraceStroke.draw(context, left, {
        size: leftLayer.size,
        blur: 0,
        brightness: leftLayer.brightness,
        fade: 0,
        color: leftLayer.color,
        faceMinSide: face,
        composite,
        lineCap: "butt",
      });
    } else {
      nodeGraphWaterfallStroke(
        context,
        left,
        leftLayer.color,
        nodeGraphWaterfallSizePx(face, leftLayer.size),
        composite,
      );
    }
  }
  if (rightLayer.enabled !== false) {
    if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
      TraceStroke.draw(context, right, {
        size: rightLayer.size,
        blur: 0,
        brightness: rightLayer.brightness,
        fade: 0,
        color: rightLayer.color,
        faceMinSide: face,
        composite,
        lineCap: "butt",
      });
    } else {
      nodeGraphWaterfallStroke(
        context,
        right,
        rightLayer.color,
        nodeGraphWaterfallSizePx(face, rightLayer.size),
        composite,
      );
    }
  }
}

function nodeGraphWaterfallDrawMono(context, points, settings, face) {
  const layer = nodeGraphWaterfallPrimaryLayer(settings);
  if (layer.enabled === false || !points?.length) {
    return;
  }
  nodeGraphWaterfallStroke(
    context,
    points,
    layer.color,
    nodeGraphWaterfallSizePx(face, layer.size),
    "source-over",
  );
}

function nodeGraphWaterfallInk(destCtx, destCanvas, spec, x0, columns, bg, sampleStart, sampleEnd) {
  const width = destCanvas.width;
  const height = destCanvas.height;
  const x = Math.max(0, Math.floor(x0));
  const n = Math.max(1, Math.min(Math.floor(columns), width - x));
  if (n < 1 || x >= width) {
    return 0;
  }
  const scratch = typeof nodeGraphTraceDisplayScratchContext === "function"
    ? nodeGraphTraceDisplayScratchContext(destCanvas, "_waterfallPen", n, height)
    : null;
  if (!scratch) {
    return 0;
  }
  const sc = scratch.context;
  const face = Math.min(width, height);
  const settings = spec.settings || {};
  const blend = settings.stereoBlend || "combine";
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.imageSmoothingEnabled = false;
  if (blend === "combine") {
    sc.clearRect(0, 0, n, height);
  } else {
    sc.globalCompositeOperation = "source-over";
    sc.fillStyle = bg || "#000000";
    sc.fillRect(0, 0, n, height);
  }

  const stereo = spec.stereoBuffers;
  if (stereo) {
    const leftLayer = nodeGraphWaterfallPrimaryLayer(settings);
    const rightLayer = nodeGraphWaterfallSecondaryLayer(settings, leftLayer);
    const leftBuf = nodeGraphWaterfallPrepare(stereo.left, settings);
    const rightBuf = nodeGraphWaterfallPrepare(stereo.right, settings);
    const count = Math.max(0, Math.floor(sampleEnd) - Math.floor(sampleStart));
    const leftRange = {
      start: Math.max(0, (leftBuf?.length || 0) - count),
      end: leftBuf?.length || 0,
    };
    const rightRange = {
      start: Math.max(0, (rightBuf?.length || 0) - count),
      end: rightBuf?.length || 0,
    };
    const left = nodeGraphWaterfallColumnPath(
      stereo.left, spec.slot, n, height, destCanvas._waterfallLastLeftY, settings,
      leftRange.start, leftRange.end,
    );
    const right = nodeGraphWaterfallColumnPath(
      stereo.right, spec.slot, n, height, destCanvas._waterfallLastRightY, settings,
      rightRange.start, rightRange.end,
    );
    nodeGraphWaterfallDrawLayers(sc, left, right, leftLayer, rightLayer, blend, face);
    const lastL = left[left.length - 1];
    const lastR = right[right.length - 1];
    if (Number.isFinite(lastL?.y)) destCanvas._waterfallLastLeftY = lastL.y;
    if (Number.isFinite(lastR?.y)) destCanvas._waterfallLastRightY = lastR.y;
  } else {
    const points = nodeGraphWaterfallColumnPath(
      spec.buffer, spec.slot, n, height, destCanvas._waterfallLastY, settings,
      sampleStart, sampleEnd,
    );
    nodeGraphWaterfallDrawMono(sc, points, settings, face);
    const last = points[points.length - 1];
    if (Number.isFinite(last?.y)) destCanvas._waterfallLastY = last.y;
  }

  if (blend === "combine" && typeof nodeGraphFacePlateFillUnder === "function") {
    nodeGraphFacePlateFillUnder(sc, scratch.canvas, bg);
  }

  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  destCtx.imageSmoothingEnabled = false;
  destCtx.globalCompositeOperation = "source-over";
  destCtx.drawImage(scratch.canvas, x, 0);
  destCtx.restore();
  return n;
}

function nodeGraphWaterfallWaveformEnsure(canvas) {
  if (!canvas || !(canvas.width > 0) || !(canvas.height > 0)) {
    return null;
  }
  let wave = canvas._waterfallWaveform;
  if (!wave || wave.width !== canvas.width || wave.height !== canvas.height) {
    wave = document.createElement("canvas");
    wave.width = canvas.width;
    wave.height = canvas.height;
    canvas._waterfallWaveform = wave;
    const ctx = wave.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(canvas._outputPausePlate || canvas, 0, 0);
    }
  }
  return wave;
}

function nodeGraphWaterfallCaptureWaveform(canvas, source) {
  const wave = nodeGraphWaterfallWaveformEnsure(canvas);
  const src = source || canvas._outputPausePlate || canvas;
  const ctx = wave?.getContext?.("2d");
  if (!wave || !ctx || !src) {
    return null;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(src, 0, 0);
  return wave;
}

function nodeGraphWaterfallTapeSnapEnsure(canvas) {
  if (!canvas || !(canvas.width > 0)) {
    return null;
  }
  let snap = canvas._waterfallTapeSnap;
  if (!snap || snap.width !== canvas.width || snap.height !== canvas.height) {
    snap = document.createElement("canvas");
    snap.width = canvas.width;
    snap.height = canvas.height;
    canvas._waterfallTapeSnap = snap;
  }
  return snap;
}

function nodeGraphWaterfallRestoreTapeSnap(destCtx, canvas) {
  const snap = canvas?._waterfallTapeSnap;
  if (!destCtx || !snap) {
    return false;
  }
  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  destCtx.globalCompositeOperation = "copy";
  destCtx.imageSmoothingEnabled = false;
  destCtx.drawImage(snap, 0, 0);
  destCtx.restore();
  return true;
}

function nodeGraphWaterfallSaveTapeSnap(canvas) {
  const snap = nodeGraphWaterfallTapeSnapEnsure(canvas);
  const ctx = snap?.getContext?.("2d");
  if (!snap || !ctx || !canvas) {
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(canvas, 0, 0);
}

function nodeGraphWaterfallPresentWaveform(destCtx, canvas) {
  const wave = canvas?._waterfallWaveform;
  if (!destCtx || !wave) {
    return;
  }
  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  destCtx.globalCompositeOperation = "copy";
  destCtx.imageSmoothingEnabled = false;
  destCtx.drawImage(wave, 0, 0);
  destCtx.restore();
}

function nodeGraphWaterfallScrollLeft(destCtx, destCanvas, hold, columns, bg) {
  const w = destCanvas.width;
  const h = destCanvas.height;
  const n = Math.max(1, Math.floor(columns));
  const hc = hold.context;
  hc.setTransform(1, 0, 0, 1, 0, 0);
  hc.imageSmoothingEnabled = false;
  hc.globalCompositeOperation = "copy";
  hc.drawImage(destCanvas, 0, 0);
  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  destCtx.imageSmoothingEnabled = false;
  destCtx.globalCompositeOperation = "source-over";
  destCtx.drawImage(hold.canvas, -n, 0);
  destCtx.fillStyle = bg || "#000000";
  destCtx.fillRect(w - n, 0, n, h);
  destCtx.restore();
}

function nodeGraphWaterfallSyncSource(spec) {
  const channel = typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(spec?.settings)
    : "off";
  if (channel === "off") {
    return null;
  }
  const stereo = spec?.stereoBuffers;
  if (!stereo) {
    return spec?.buffer || null;
  }
  if (channel === "right") return stereo.right || stereo.left;
  if (channel === "mono" && typeof nodeGraphTraceDisplayMonoSyncBuffer === "function") {
    return nodeGraphTraceDisplayMonoSyncBuffer(stereo.left, stereo.right) || stereo.left;
  }
  return stereo.left || stereo.right;
}

function nodeGraphWaterfallArmPen(state, spec) {
  if (!state.waiting) {
    return;
  }
  const edge = typeof nodeGraphWaterfallNewestEdgeAbs === "function"
    ? nodeGraphWaterfallNewestEdgeAbs(nodeGraphWaterfallSyncSource(spec))
    : null;
  if (!Number.isFinite(edge)) {
    return;
  }
  if (Number.isFinite(state.lastEdgeAbs) && edge <= state.lastEdgeAbs) {
    return;
  }
  state.lastEdgeAbs = edge;
  state.waiting = false;
  state.penX = 0;
}

function nodeGraphWaterfallAbandonTape(canvas) {
  if (!canvas) {
    return;
  }
  canvas._waterfall = null;
  canvas._traceScroll = null;
  delete canvas._waterfallLastY;
  delete canvas._waterfallLastLeftY;
  delete canvas._waterfallLastRightY;
}

function nodeGraphWaterfallState(canvas, width, height, sweep, nowLine, bg, context) {
  const st = canvas._waterfall || (canvas._waterfall = {
    started: false,
    lastMs: Number.NaN,
    frac: 0,
    lastAbs: Number.NaN,
    sweep: false,
    nowLine: false,
    penX: 0,
    waiting: false,
    lastEdgeAbs: Number.NaN,
    lastW: 0,
    lastH: 0,
  });
  canvas._traceScroll = st;
  const resized = Math.abs((st.lastW || 0) - width) > 2 || Math.abs((st.lastH || 0) - height) > 2;
  const modeChanged = st.sweep !== sweep || st.nowLine !== nowLine;
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
    st.sweep = sweep;
    st.nowLine = nowLine;
    st.waiting = sweep && !nowLine;
    st.penX = sweep && !nowLine ? width : 0;
    delete canvas._waterfallLastY;
    delete canvas._waterfallLastLeftY;
    delete canvas._waterfallLastRightY;
    canvas._waterfallDestHistory = false;
    canvas._waterfallWaveform = null;
    canvas._waterfallTapeSnap = null;
    if (typeof TraceTape !== "undefined" && TraceTape.clear) {
      TraceTape.clear(canvas._traceTapeRgb);
      TraceTape.clear(canvas._traceTapeL);
      TraceTape.clear(canvas._traceTapeR);
    }
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
      context,
      canvas,
      spec?.slot,
      spec?.settings,
      spec?.density,
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

function nodeGraphWaterfallPaintTapes(spec, context, canvas, ink = {}) {
  const settings = spec.settings || {};
  const hasInk = Boolean(
    (ink.points && ink.points.length)
    || (ink.leftPoints && ink.leftPoints.length)
    || (ink.rightPoints && ink.rightPoints.length)
    || ink.clear === true
    || (Number(ink.scrollPx) || 0),
  );
  // Last face pixels stay. Re-presenting the whole tape every idle rAF
  // (fill + GL blit) was the bulk of "animation took too long".
  if (ink.frozen === true && !hasInk) {
    return true;
  }
  nodeGraphWaterfallFillPlate(context, canvas, spec.bg);
  const stereo = spec.stereoBuffers;
  const layers = [];
  if (stereo) {
    const leftLayer = nodeGraphWaterfallPrimaryLayer(settings);
    const rightLayer = nodeGraphWaterfallSecondaryLayer(settings, leftLayer);
    layers.push({ ...leftLayer, points: ink.leftPoints || [] });
    layers.push({ ...rightLayer, points: ink.rightPoints || [] });
  } else {
    const layer = nodeGraphWaterfallPrimaryLayer(settings);
    layers.push({ ...layer, points: ink.points || [] });
  }
  return nodeGraphWaterfallRunTape(canvas, context, layers, {
    frozen: ink.frozen === true,
    clear: ink.clear === true,
    scrollPx: ink.scrollPx || 0,
    blur: 0.22,
    blend: settings.stereoBlend || "combine",
    meetColor: settings.meetColor || "auto",
  });
}

function nodeGraphWaterfallPaintNowLine(spec, context, canvas, settings, width, height, bg) {
  spec.bg = bg;
  spec.settings = settings;
  const stereo = spec.stereoBuffers;
  const frozen = typeof scopePaintIsFrozen === "function" && scopePaintIsFrozen();
  if (stereo) {
    const yL = nodeGraphWaterfallLatestY(stereo.left, spec.slot, settings, height);
    const yR = nodeGraphWaterfallLatestY(stereo.right, spec.slot, settings, height);
    return nodeGraphWaterfallPaintTapes(spec, context, canvas, {
      frozen,
      clear: !frozen,
      leftPoints: Number.isFinite(yL) ? [{ x: 0, y: yL }, { x: width, y: yL }] : [],
      rightPoints: Number.isFinite(yR) ? [{ x: 0, y: yR }, { x: width, y: yR }] : [],
    });
  }
  const y = nodeGraphWaterfallLatestY(spec.buffer, spec.slot, settings, height);
  return nodeGraphWaterfallPaintTapes(spec, context, canvas, {
    frozen,
    clear: !frozen,
    points: Number.isFinite(y) ? [{ x: 0, y }, { x: width, y }] : [],
  });
}

function nodeGraphWaterfallPaint(spec) {
  const canvas = spec?.canvas;
  const context = spec?.context;
  const settings = spec?.settings;
  if (!canvas || !context || !settings) {
    return false;
  }
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const live = spec.stereoBuffers
    ? (nodeGraphWaterfallPrepare(spec.stereoBuffers.left, settings) || spec.buffer)
    : (nodeGraphWaterfallPrepare(spec.buffer, settings) || spec.buffer);
  if (!live?.length) {
    return false;
  }
  const nowLine = nodeGraphWaterfallIsNowLine(settings);
  const sweep = !nowLine && (typeof nodeGraphTraceDisplaySyncChannel === "function"
    ? nodeGraphTraceDisplaySyncChannel(settings) !== "off"
    : false);
  const st = nodeGraphWaterfallState(canvas, width, height, sweep, nowLine, spec.bg, context);

  if (nowLine) {
    nodeGraphWaterfallPaintNowLine(spec, context, canvas, settings, width, height, spec.bg);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
      rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
    }
    return true;
  }

  const useTape = nodeGraphWaterfallTapeAvailable();
  const hold = useTape
    ? true
    : (typeof nodeGraphTraceDisplayScratchContext === "function"
      ? nodeGraphTraceDisplayScratchContext(canvas, "_waterfallHold", width, height)
      : null);
  if (!hold) {
    return false;
  }

  const writeSpec = {
    slot: spec.slot,
    settings,
    buffer: live,
    stereoBuffers: spec.stereoBuffers,
  };
  const frozen = typeof scopePaintIsFrozen === "function" && scopePaintIsFrozen();

  const window = nodeGraphWaterfallUndrawn(live, st.lastAbs);
  // Pin the cursor to the start of this batch so a later short frame
  // (columns < 1) still accumulates instead of re-reading only `recent`.
  if (!Number.isFinite(st.lastAbs) && Number.isFinite(window.absEnd) && window.count > 0) {
    st.lastAbs = Math.max(0, window.absEnd - window.count);
  }

  // Frozen dest is the tape. Do not consume undrawn samples or the first
  // play frame scrolls a full face and dumps pause/protect dest pixels.
  if (frozen) {
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
      rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
    }
    return true;
  }

  if (sweep) {
    nodeGraphWaterfallArmPen(st, writeSpec);
    if (st.waiting) {
      if (Number.isFinite(window.absEnd)) {
        st.lastAbs = window.absEnd;
      }
      st.frac = 0;
      nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
      return true;
    }
  }

  const history = nodeGraphWaterfallHistorySeconds(settings);
  const hz = nodeGraphWaterfallVisualHz(live);
  const samplesPerColumn = Math.max(1e-9, (hz * history) / width);
  const columnsFloat = window.count / samplesPerColumn + (Number(st.frac) || 0);
  let columns = Math.floor(columnsFloat);
  if (columns < 1) {
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    return true;
  }

  let sampleStart = window.start;
  let sampleEnd = window.end;
  if (sweep) {
    const remain = Math.max(0, width - Math.max(0, Math.floor(st.penX)));
    if (remain < 1) {
      st.waiting = true;
      st.penX = width;
      if (Number.isFinite(window.absEnd)) {
        st.lastAbs = window.absEnd;
      }
      st.frac = 0;
      nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
      return true;
    }
    if (columns > remain) {
      columns = remain;
      const consume = Math.min(window.count, Math.max(1, Math.round(columns * samplesPerColumn)));
      sampleStart = window.start;
      sampleEnd = window.start + consume;
      st.lastAbs = (Number.isFinite(st.lastAbs) ? st.lastAbs : 0) + consume;
      st.frac = 0;
    } else if (Number.isFinite(window.absEnd)) {
      st.lastAbs = window.absEnd;
      st.frac = columnsFloat - columns;
    }
  } else if (columns >= width) {
    columns = width - 1;
    const consume = Math.min(live.length, Math.max(1, Math.round(columns * samplesPerColumn)));
    sampleEnd = live.length;
    sampleStart = Math.max(0, sampleEnd - consume);
    if (Number.isFinite(window.absEnd)) {
      st.lastAbs = window.absEnd;
    }
    st.frac = 0;
  } else if (Number.isFinite(window.absEnd)) {
    st.lastAbs = window.absEnd;
    st.frac = columnsFloat - columns;
  }

  if (columns < 1) {
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
    return true;
  }

  const destHistory = canvas._waterfallDestHistory === true && !sweep;
  if (destHistory) {
    // Tape is dest minus HUD overlay. Restore last snap so engaged ♨️
    // never lives in Instant Trace history.
    if (!frozen) {
      nodeGraphWaterfallRestoreTapeSnap(context, canvas);
      const destHold = typeof nodeGraphTraceDisplayScratchContext === "function"
        ? nodeGraphTraceDisplayScratchContext(canvas, "_waterfallHold", width, height)
        : hold;
      if (destHold) {
        nodeGraphWaterfallScrollLeft(context, canvas, destHold, columns, spec.bg);
        nodeGraphWaterfallInk(
          context, canvas, writeSpec, width - columns, columns, spec.bg, sampleStart, sampleEnd,
        );
      }
    }
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, frozen ? 0 : columns);
    nodeGraphWaterfallSaveTapeSnap(canvas);
    if (typeof paintNodeGraphOutputProtectOverlay === "function") {
      paintNodeGraphOutputProtectOverlay(context, canvas, spec.density);
    }
    if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
      rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
    }
    return true;
  }

  if (useTape) {
    let x0 = width - columns;
    let n = columns;
    let scrollPx = frozen ? 0 : columns;
    if (sweep) {
      const fromX = Math.max(0, Math.floor(st.penX));
      st.penX += columns;
      n = Math.min(width, Math.floor(st.penX)) - fromX;
      x0 = fromX;
      scrollPx = 0;
      if (st.penX >= width) {
        st.waiting = true;
        st.penX = width;
        st.frac = 0;
      }
    }
    const stereo = spec.stereoBuffers;
    const ink = {
      frozen,
      scrollPx,
      clear: false,
    };
    if (n > 0) {
      if (stereo) {
        const leftBuf = nodeGraphWaterfallPrepare(stereo.left, settings);
        const rightBuf = nodeGraphWaterfallPrepare(stereo.right, settings);
        const count = Math.max(0, Math.floor(sampleEnd) - Math.floor(sampleStart));
        ink.leftPoints = nodeGraphWaterfallShiftPath(
          nodeGraphWaterfallColumnPath(
            stereo.left, spec.slot, n, height, canvas._waterfallLastLeftY, settings,
            Math.max(0, (leftBuf?.length || 0) - count), leftBuf?.length || 0,
          ),
          x0,
        );
        ink.rightPoints = nodeGraphWaterfallShiftPath(
          nodeGraphWaterfallColumnPath(
            stereo.right, spec.slot, n, height, canvas._waterfallLastRightY, settings,
            Math.max(0, (rightBuf?.length || 0) - count), rightBuf?.length || 0,
          ),
          x0,
        );
        const lastL = ink.leftPoints[ink.leftPoints.length - 1];
        const lastR = ink.rightPoints[ink.rightPoints.length - 1];
        if (Number.isFinite(lastL?.y)) canvas._waterfallLastLeftY = lastL.y;
        if (Number.isFinite(lastR?.y)) canvas._waterfallLastRightY = lastR.y;
      } else {
        ink.points = nodeGraphWaterfallShiftPath(
          nodeGraphWaterfallColumnPath(
            spec.buffer, spec.slot, n, height, canvas._waterfallLastY, settings,
            sampleStart, sampleEnd,
          ),
          x0,
        );
        const last = ink.points[ink.points.length - 1];
        if (Number.isFinite(last?.y)) canvas._waterfallLastY = last.y;
      }
    }
    nodeGraphWaterfallPaintTapes(spec, context, canvas, ink);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, scrollPx);
    nodeGraphWaterfallSaveTapeSnap(canvas);
    if (typeof paintNodeGraphOutputProtectOverlay === "function") {
      paintNodeGraphOutputProtectOverlay(context, canvas, spec.density);
    }
    if (!sweep) {
      canvas._waterfallDestHistory = true;
    }
  } else if (sweep) {
    const fromX = Math.max(0, Math.floor(st.penX));
    st.penX += columns;
    const n = Math.min(width, Math.floor(st.penX)) - fromX;
    if (n > 0 && fromX < width) {
      nodeGraphWaterfallInk(
        context, canvas, writeSpec, fromX, n, spec.bg, sampleStart, sampleEnd,
      );
    }
    if (st.penX >= width) {
      st.waiting = true;
      st.penX = width;
      st.frac = 0;
    }
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, 0);
  } else {
    const wave = nodeGraphWaterfallWaveformEnsure(canvas);
    const waveCtx = wave?.getContext?.("2d") || context;
    const waveCanvas = wave || canvas;
    nodeGraphWaterfallScrollLeft(waveCtx, waveCanvas, hold, columns, spec.bg);
    nodeGraphWaterfallInk(
      waveCtx, waveCanvas, writeSpec, width - columns, columns, spec.bg, sampleStart, sampleEnd,
    );
    nodeGraphWaterfallPresentWaveform(context, canvas);
    nodeGraphWaterfallFinishOutputInk(spec, context, canvas, frozen ? 0 : columns);
    nodeGraphWaterfallSaveTapeSnap(canvas);
    if (typeof paintNodeGraphOutputProtectOverlay === "function") {
      paintNodeGraphOutputProtectOverlay(context, canvas, spec.density);
    }
    canvas._waterfallDestHistory = true;
  }
  if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
    rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
  }
  return true;
}
