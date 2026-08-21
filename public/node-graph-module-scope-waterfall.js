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
  const visual = typeof NODE_GRAPH_VISUAL_WAVEFORM_WRITE_HZ === "number"
    ? NODE_GRAPH_VISUAL_WAVEFORM_WRITE_HZ
    : 12000;
  return visual;
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

/** Time-forward polyline of undrawn samples stretched across `columns` pixels. */
function nodeGraphWaterfallColumnPath(buffer, slot, columns, height, prevY, settings, start, end) {
  const live = nodeGraphWaterfallPrepare(buffer, settings);
  if (!live?.length || columns < 1) {
    return Number.isFinite(prevY) ? [{ x: 0, y: prevY }, { x: columns, y: prevY }] : [];
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
  const maxPts = Math.max(columns * 8, 32);
  const step = span > maxPts ? span / maxPts : 1;
  for (let i = 0; i < span; i += step) {
    const idx = from + Math.min(span - 1, Math.floor(i));
    const x = ((idx - from + 0.5) / span) * columns;
    points.push({
      x,
      y: nodeGraphWaterfallY(live[idx], amp.gain, amp.offset, midY, halfHeight),
    });
  }
  const lastY = nodeGraphWaterfallY(live[to - 1], amp.gain, amp.offset, midY, halfHeight);
  const last = points[points.length - 1];
  if (!last || Math.abs(last.x - columns) > 0.05 || last.y !== lastY) {
    points.push({ x: columns, y: lastY });
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
  context.lineCap = "butt";
  context.lineJoin = "miter";
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
  if (typeof TraceStroke !== "undefined" && TraceStroke.draw) {
    TraceStroke.draw(context, points, {
      size: layer.size,
      blur: 0,
      brightness: layer.brightness,
      fade: 0,
      color: layer.color,
      faceMinSide: face,
      composite: "source-over",
      lineCap: "butt",
    });
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
  } else if (resized) {
    st.lastW = width;
    st.lastH = height;
  }
  return st;
}

function nodeGraphWaterfallPaintNowLine(spec, context, canvas, settings, width, height, bg) {
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(context, canvas, bg);
  } else {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = bg || "#000000";
    context.fillRect(0, 0, width, height);
    context.restore();
  }
  const face = Math.min(width, height);
  const stereo = spec.stereoBuffers;
  if (stereo) {
    const yL = nodeGraphWaterfallLatestY(stereo.left, spec.slot, settings, height);
    const yR = nodeGraphWaterfallLatestY(stereo.right, spec.slot, settings, height);
    const left = Number.isFinite(yL) ? [{ x: 0, y: yL }, { x: width, y: yL }] : [];
    const right = Number.isFinite(yR) ? [{ x: 0, y: yR }, { x: width, y: yR }] : [];
    const leftLayer = nodeGraphWaterfallPrimaryLayer(settings);
    const rightLayer = nodeGraphWaterfallSecondaryLayer(settings, leftLayer);
    const blend = settings.stereoBlend || "combine";
    if (blend === "combine") {
      const scratch = typeof nodeGraphTraceDisplayScratchContext === "function"
        ? nodeGraphTraceDisplayScratchContext(canvas, "_waterfallPen", width, height)
        : null;
      if (scratch) {
        scratch.context.setTransform(1, 0, 0, 1, 0, 0);
        scratch.context.clearRect(0, 0, width, height);
        nodeGraphWaterfallDrawLayers(
          scratch.context, left, right, leftLayer, rightLayer, blend, face,
        );
        if (typeof nodeGraphFacePlateFillUnder === "function") {
          nodeGraphFacePlateFillUnder(scratch.context, scratch.canvas, bg);
        }
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalCompositeOperation = "source-over";
        context.drawImage(scratch.canvas, 0, 0);
        context.restore();
      }
    } else {
      nodeGraphWaterfallDrawLayers(context, left, right, leftLayer, rightLayer, blend, face);
    }
  } else {
    const y = nodeGraphWaterfallLatestY(spec.buffer, spec.slot, settings, height);
    if (Number.isFinite(y)) {
      nodeGraphWaterfallDrawMono(
        context,
        [{ x: 0, y }, { x: width, y }],
        settings,
        face,
      );
    }
  }
  return true;
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
    if (typeof paintNodeGraphOutputProtectBannerIfNeeded === "function") {
      paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, spec.slot, settings, spec.density);
    }
    if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
      rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
    }
    return true;
  }

  const hold = typeof nodeGraphTraceDisplayScratchContext === "function"
    ? nodeGraphTraceDisplayScratchContext(canvas, "_waterfallHold", width, height)
    : null;
  if (!hold) {
    return false;
  }

  const writeSpec = {
    slot: spec.slot,
    settings,
    buffer: live,
    stereoBuffers: spec.stereoBuffers,
  };

  const window = nodeGraphWaterfallUndrawn(live, st.lastAbs);
  // Pin the cursor to the start of this batch so a later short frame
  // (columns < 1) still accumulates instead of re-reading only `recent`.
  if (!Number.isFinite(st.lastAbs) && Number.isFinite(window.absEnd) && window.count > 0) {
    st.lastAbs = Math.max(0, window.absEnd - window.count);
  }

  if (sweep) {
    nodeGraphWaterfallArmPen(st, writeSpec);
    if (st.waiting) {
      if (Number.isFinite(window.absEnd)) {
        st.lastAbs = window.absEnd;
      }
      st.frac = 0;
      return true;
    }
  }

  const history = nodeGraphWaterfallHistorySeconds(settings);
  const hz = nodeGraphWaterfallVisualHz(live);
  const samplesPerColumn = Math.max(1e-9, (hz * history) / width);
  const columnsFloat = window.count / samplesPerColumn + (Number(st.frac) || 0);
  let columns = Math.floor(columnsFloat);
  if (columns < 1) {
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
    return true;
  }

  if (sweep) {
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
  } else {
    nodeGraphWaterfallScrollLeft(context, canvas, hold, columns, spec.bg);
    nodeGraphWaterfallInk(
      context, canvas, writeSpec, width - columns, columns, spec.bg, sampleStart, sampleEnd,
    );
  }

  if (typeof paintNodeGraphOutputProtectBannerIfNeeded === "function") {
    paintNodeGraphOutputProtectBannerIfNeeded(context, canvas, spec.slot, settings, spec.density);
  }
  if (typeof rememberNodeGraphTraceDisplaySignature === "function") {
    rememberNodeGraphTraceDisplaySignature(spec.slot, spec.item, live, settings);
  }
  return true;
}
