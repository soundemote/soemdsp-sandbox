// XY Pad's custom body -- solid-module center face (inputs left / pad /
// outputs right) with quantize + phase sliders below. Hidden x/y/gate drive
// the worklet; visible X/Y Phase sliders are value-mirrors of pad x/y (same
// control, two surfaces). Quantize only coarsens the lattice (no separate
// phase offset — phase IS position).

const nodeGraphXyPadResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      drawNodeGraphXyPad(entry.target.closest(".node-xy-pad"));
    }
  })
  : null;

function nodeGraphXyPadDivisions(quantize) {
  return typeof nodeGraphXyPadDspDivisions === "function"
    ? nodeGraphXyPadDspDivisions(quantize)
    : (Math.max(0, Math.min(1, Number(quantize) || 0)) <= 0
      ? 1
      : 1 + Math.max(1, Math.round(Math.max(0, Math.min(1, Number(quantize) || 0)) * 16)));
}

// Lattice snap for puck/grid only (audio uses the same math in xy-pad-dsp.js).
function nodeGraphXyPadQuantizeValue(value, quantize) {
  return typeof nodeGraphXyPadDspQuantizeUnit === "function"
    ? nodeGraphXyPadDspQuantizeUnit(value, quantize)
    : Math.max(0, Math.min(1, Number(value) || 0));
}

function nodeGraphXyPadSnapUnit(pad, unitX, unitY) {
  return {
    x: nodeGraphXyPadQuantizeValue(unitX, nodeGraphXyPadParam(pad, "xQuantize", 0)),
    y: nodeGraphXyPadQuantizeValue(unitY, nodeGraphXyPadParam(pad, "yQuantize", 0)),
  };
}

function nodeGraphXyPadSlider(pad, key) {
  return document.getElementById(`node-${pad.dataset.node}-${key}`);
}

function nodeGraphXyPadParam(pad, key, fallback) {
  // Prefer live drag position for x/y so the puck still tracks when hidden
  // range inputs lag or are missing mid-interaction.
  if ((key === "x" || key === "y") && pad?._xyPadPos) {
    const live = Number(pad._xyPadPos[key]);
    if (Number.isFinite(live)) {
      return live;
    }
  }
  const value = Number(nodeGraphXyPadSlider(pad, key)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function nodeGraphXyPadReadAxes(pad) {
  return {
    x: nodeGraphXyPadParam(pad, "x", 0.5),
    y: nodeGraphXyPadParam(pad, "y", 0.5),
    xPhase: nodeGraphXyPadParam(pad, "xPhase", 0.5),
    yPhase: nodeGraphXyPadParam(pad, "yPhase", 0.5),
  };
}

function nodeGraphXyPadRememberAxes(pad, axes = nodeGraphXyPadReadAxes(pad)) {
  pad._xyPadLastAxes = {
    x: axes.x,
    y: axes.y,
    xPhase: axes.xPhase,
    yPhase: axes.yPhase,
  };
  return pad._xyPadLastAxes;
}

/**
 * Write pad position and the visible Phase sliders together so they stay the
 * same values (two faces of one control).
 *
 * Drag path avoids setNodeSliderValue ×4: that path rewrites paramMeta, schedules
 * full module-scope redraws, and flushes readouts mid-event — which stuttered the
 * whole app when dragging the pad.
 */
function nodeGraphXyPadWritePosition(pad, x, y, options = {}) {
  // Use Number.isFinite — `Number(x) || 0` turns legitimate 0 into 0 incorrectly
  // only when NaN; keep clamp explicit so left/bottom edges stay reachable.
  const nx = Number(x);
  const ny = Number(y);
  const clampedX = Math.max(0, Math.min(1, Number.isFinite(nx) ? nx : 0));
  const clampedY = Math.max(0, Math.min(1, Number.isFinite(ny) ? ny : 0));
  const interaction = options.interaction || "drag";
  const isDrag = interaction === "drag";
  const pairs = [
    ["x", clampedX],
    ["y", clampedY],
    ["xPhase", clampedX],
    ["yPhase", clampedY],
  ];
  // Authoritative UI position (draw reads this first).
  pad._xyPadPos = { x: clampedX, y: clampedY };
  pad._xyPadMirroring = true;
  try {
    for (const [key, value] of pairs) {
      const slider = nodeGraphXyPadSlider(pad, key);
      if (!slider) {
        continue;
      }
      delete slider.dataset.unboundedValue;
      slider.value = String(value);
      if (isDrag && typeof scheduleNodeSliderReadoutUpdate === "function") {
        scheduleNodeSliderReadoutUpdate(slider, value);
      } else if (typeof syncNodeSliderReadout === "function") {
        syncNodeSliderReadout(slider);
      } else if (typeof setNodeSliderValue === "function") {
        setNodeSliderValue(slider, value, { interaction });
      }
    }

    const nodeId = String(pad.dataset.node || "");
    const patchNode = nodeId && typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(nodeId)
      : null;
    if (patchNode) {
      const nextParams = { ...(patchNode.params || {}) };
      for (const [key, value] of pairs) {
        nextParams[key] = typeof normalizeNodeGraphPatchParameter === "function"
          ? normalizeNodeGraphPatchParameter(
            patchNode.type,
            key,
            value,
            patchNode.paramMeta?.[key],
          )
          : value;
      }
      patchNode.params = nextParams;
      if (isDrag && nodeGraphMvp) {
        nodeGraphMvp.patchDirtyState = "edited";
        nodeGraphMvp._needsHeaderSync = true;
        if (typeof scheduleNodeSliderDragAutosave === "function") {
          scheduleNodeSliderDragAutosave();
        }
      }
      if (typeof scheduleNodeGraphLiveParameterSync === "function") {
        scheduleNodeGraphLiveParameterSync();
      }
    }

    if (options.commit) {
      const status = options.commitStatus || "XY pad moved";
      for (const [key] of pairs) {
        const slider = nodeGraphXyPadSlider(pad, key);
        if (slider && typeof commitNodeSliderDragValue === "function") {
          commitNodeSliderDragValue(slider, status);
        }
      }
    }
  } finally {
    pad._xyPadMirroring = false;
  }
  nodeGraphXyPadRememberAxes(pad, {
    x: clampedX,
    y: clampedY,
    xPhase: clampedX,
    yPhase: clampedY,
  });
  return { x: clampedX, y: clampedY };
}

/** One phosphor/puck paint per animation frame while the pointer is hot. */
function nodeGraphXyPadScheduleDraw(pad, options = {}) {
  pad._xyPadDrawOptions = { ...(pad._xyPadDrawOptions || {}), ...options };
  if (pad._xyPadDrawRaf) {
    return;
  }
  pad._xyPadDrawRaf = window.requestAnimationFrame(() => {
    pad._xyPadDrawRaf = 0;
    const opts = pad._xyPadDrawOptions || {};
    pad._xyPadDrawOptions = null;
    drawNodeGraphXyPad(pad, opts);
  });
}

function nodeGraphXyPadCancelScheduledDraw(pad) {
  if (pad?._xyPadDrawRaf) {
    window.cancelAnimationFrame(pad._xyPadDrawRaf);
    pad._xyPadDrawRaf = 0;
  }
  pad._xyPadDrawOptions = null;
}

function nodeGraphXyPadAxesSlidersReady(pad) {
  return Boolean(
    nodeGraphXyPadSlider(pad, "x")
    && nodeGraphXyPadSlider(pad, "y")
    && nodeGraphXyPadSlider(pad, "xPhase")
    && nodeGraphXyPadSlider(pad, "yPhase"),
  );
}

/**
 * Keep hidden x/y and visible xPhase/yPhase locked. Detects which side moved
 * since the last snapshot so pad drag and phase sliders both drive the pair.
 */
function nodeGraphXyPadReconcileMirroredAxes(pad) {
  if (pad._xyPadMirroring || pad._xyPadDragging) {
    return;
  }
  // Body mounts before parameter rows — wait until all four sliders exist.
  if (!nodeGraphXyPadAxesSlidersReady(pad)) {
    return;
  }
  const cur = nodeGraphXyPadReadAxes(pad);
  const last = pad._xyPadLastAxes;
  if (!last) {
    // First sync: pad position is canonical (migrate old phase=0 patches).
    nodeGraphXyPadWritePosition(pad, cur.x, cur.y, { interaction: "drag" });
    return;
  }
  const eps = 1e-9;
  const xPosChanged = Math.abs(cur.x - last.x) > eps;
  const yPosChanged = Math.abs(cur.y - last.y) > eps;
  const xPhaseChanged = Math.abs(cur.xPhase - last.xPhase) > eps;
  const yPhaseChanged = Math.abs(cur.yPhase - last.yPhase) > eps;
  // Phase sliders are the visible twins — when only they move, push into x/y.
  // When pad/position moves (or both / neither), position wins.
  const phaseIsSource = (xPhaseChanged && !xPosChanged) || (yPhaseChanged && !yPosChanged);
  if (phaseIsSource) {
    nodeGraphXyPadWritePosition(pad, cur.xPhase, cur.yPhase, { interaction: "drag" });
    return;
  }
  if (
    Math.abs(cur.x - cur.xPhase) > eps
    || Math.abs(cur.y - cur.yPhase) > eps
    || xPosChanged
    || yPosChanged
  ) {
    nodeGraphXyPadWritePosition(pad, cur.x, cur.y, { interaction: "drag" });
    return;
  }
  nodeGraphXyPadRememberAxes(pad, cur);
}

function nodeGraphXyPadInputConnected(pad, port) {
  const nodeId = String(pad?.dataset?.node || "");
  return Boolean(nodeId && (nodeGraphMvp.patch.connections || []).some((connection) =>
    connection.destinationNode === nodeId && connection.destinationPort === port
  ));
}

/**
 * Sum CV into a pad input port (same mix as worklet mixInput for that port).
 * Samples the latest live buffer from each wired source.
 */
function nodeGraphXyPadMixCv(nodeId, port) {
  const id = String(nodeId || "");
  const portName = String(port || "");
  if (!id || !portName) {
    return 0;
  }
  let sum = 0;
  for (const connection of (nodeGraphMvp?.patch?.connections || [])) {
    if (connection.destinationNode !== id || connection.destinationPort !== portName) {
      continue;
    }
    let sample = Number.NaN;
    if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
      sample = Number(nodeGraphModuleScopeLatestOutputValue(
        connection.sourceNode,
        connection.sourcePort,
        Number.NaN,
      ));
    }
    if (!Number.isFinite(sample) && nodeGraphModuleScopeState?.buffers) {
      const buf = nodeGraphModuleScopeState.buffers.get(
        `${connection.sourceNode}:${connection.sourcePort}`,
      ) || nodeGraphModuleScopeState.buffers.get(connection.sourceNode);
      if (buf?.length) {
        for (let i = buf.length - 1; i >= 0; i -= 1) {
          const n = Number(buf[i]);
          if (Number.isFinite(n)) {
            sample = n;
            break;
          }
        }
      }
    }
    if (Number.isFinite(sample)) {
      sum += sample;
    }
  }
  return sum;
}

/**
 * Latest Out X/Y in unit space, or null if scope has not captured the pad yet.
 * Live outs already include Phase+CV → Smoothing (Papoulis) ↔ lattice.
 */
function nodeGraphXyPadLatestOutUnit(pad) {
  const nodeId = String(pad?.dataset?.node || "");
  if (!nodeId || typeof nodeGraphModuleScopeLatestOutputValue !== "function") {
    return null;
  }
  const ox = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "X", Number.NaN));
  const oy = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "Y", Number.NaN));
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) {
    return null;
  }
  return {
    x: nodeGraphXyPadNormalizeGhostUnit(ox, 0.5),
    y: nodeGraphXyPadNormalizeGhostUnit(oy, 0.5),
    fromOut: true,
  };
}

/**
 * New Out X/Y samples since the last phosphor deposit, as canvas-space points.
 * Prefers dense live scope history so Papoulis curves are not re-polygonized
 * into UI-frame elbows (last→current only).
 */
function nodeGraphXyPadPhosphorOutPathPoints(pad, width, height) {
  const nodeId = String(pad?.dataset?.node || "");
  const buffers = nodeGraphModuleScopeState?.buffers;
  if (!nodeId || !buffers) {
    return null;
  }
  const xBuf = buffers.get(`${nodeId}:X`);
  const yBuf = buffers.get(`${nodeId}:Y`);
  const len = Math.min(xBuf?.length || 0, yBuf?.length || 0);
  if (len < 1) {
    return null;
  }
  const xTotal = Math.max(0, Math.floor(Number(xBuf.nodeGraphScopeTotalSampleCount) || len));
  const yTotal = Math.max(0, Math.floor(Number(yBuf.nodeGraphScopeTotalSampleCount) || len));
  const absoluteFrame = Math.min(xTotal, yTotal);
  if (absoluteFrame < 1) {
    return null;
  }
  let lastFrame = Number(pad._xyPadPhosLastAbsFrame);
  if (!Number.isFinite(lastFrame) || lastFrame < 0) {
    lastFrame = Math.max(0, absoluteFrame - 1);
  }
  const newCount = Math.max(0, absoluteFrame - lastFrame);
  // Cap deposit density per UI frame (scope captures ~12kHz).
  const take = Math.min(len, Math.max(2, Math.min(newCount || 1, 512)));
  const start = len - take;
  const points = [];
  let prevX = Number.NaN;
  let prevY = Number.NaN;
  for (let i = start; i < len; i += 1) {
    const ox = Number(xBuf[i]);
    const oy = Number(yBuf[i]);
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) {
      continue;
    }
    const ux = nodeGraphXyPadNormalizeGhostUnit(ox, 0.5);
    const uy = nodeGraphXyPadNormalizeGhostUnit(oy, 0.5);
    const x = ux * width;
    const y = (1 - uy) * height;
    if (Number.isFinite(prevX) && Math.hypot(x - prevX, y - prevY) < 0.15) {
      continue;
    }
    points.push({ x, y });
    prevX = x;
    prevY = y;
  }
  pad._xyPadPhosLastAbsFrame = absoluteFrame;
  if (!points.length) {
    return null;
  }
  return {
    points,
    tip: points[points.length - 1],
    fromOut: true,
  };
}

/**
 * Phosphor / Out target in unit space (0..1).
 *
 * Same path as audio outs:
 *   sig = bipolar(Phase X/Y) + X/Y Input CV
 *   → Smoothing (Papoulis) ↔ lattice by Filter Order
 *   → Out X/Y  (and phosphor deposit)
 *
 * Prefer live Out samples (includes native Papoulis). Dry lattice-only fallback
 * only when the pad is not in the live schedule / audio is stopped.
 */
function nodeGraphXyPadPhosphorTargetUnit(pad) {
  const live = nodeGraphXyPadLatestOutUnit(pad);
  if (live) {
    return live;
  }

  const nodeId = String(pad?.dataset?.node || "");
  const phaseX = nodeGraphXyPadParam(pad, "x", 0.5);
  const phaseY = nodeGraphXyPadParam(pad, "y", 0.5);
  const sigX = (typeof nodeGraphXyPadDspUnitToBipolar === "function"
    ? nodeGraphXyPadDspUnitToBipolar(phaseX)
    : phaseX * 2 - 1) + nodeGraphXyPadMixCv(nodeId, "X");
  const sigY = (typeof nodeGraphXyPadDspUnitToBipolar === "function"
    ? nodeGraphXyPadDspUnitToBipolar(phaseY)
    : phaseY * 2 - 1) + nodeGraphXyPadMixCv(nodeId, "Y");
  const order = Math.max(0, Math.min(1, Math.round(nodeGraphXyPadParam(pad, "filterOrder", 0)) || 0));
  const qX = nodeGraphXyPadParam(pad, "xQuantize", 0);
  const qY = nodeGraphXyPadParam(pad, "yQuantize", 0);
  // Native Papoulis only lives in the worklet — dry preview is lattice side only.
  const process = typeof nodeGraphXyPadDspProcessAxis === "function"
    ? nodeGraphXyPadDspProcessAxis
    : (sig, opts) => {
      const q = Number(opts?.quantizeAmt) || 0;
      if (q <= 0 || typeof nodeGraphXyPadDspQuantizeBipolar !== "function") {
        return sig;
      }
      return nodeGraphXyPadDspQuantizeBipolar(sig, q);
    };
  const outX = process(sigX, { cutoff: 0, order, quantizeAmt: qX, filterSample: null });
  const outY = process(sigY, { cutoff: 0, order, quantizeAmt: qY, filterSample: null });
  return {
    x: nodeGraphXyPadNormalizeGhostUnit(outX, phaseX),
    y: nodeGraphXyPadNormalizeGhostUnit(outY, phaseY),
    fromOut: false,
  };
}

// Shared mono-energy phosphor (same device as 2D Phosphor / scope2d burn).
// Host canvas is the pad face; residual lives in the WebGL energy FBO.
const nodeGraphXyPadPhosphorKey = "_xyPadPhosphorEnergyGl";

function nodeGraphXyPadPeakRgbBytes(hex) {
  if (
    typeof nodeGraphScopeHexColorToRgb === "function"
    && typeof nodeGraphScopeRgbFloatsToCanvasRgb === "function"
  ) {
    return nodeGraphScopeRgbFloatsToCanvasRgb(
      nodeGraphScopeHexColorToRgb(hex || "#7fc7d9"),
    );
  }
  const { r, g, b } = nodeGraphXyPadParseHexColor(hex, { r: 127, g: 199, b: 217 });
  return [r, g, b];
}

function nodeGraphXyPadDestroyPhosphor(canvas) {
  if (!canvas) {
    return;
  }
  const face = canvas[nodeGraphXyPadPhosphorKey];
  if (face && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
    try {
      nodeGraphPhosphorEnergyGlDestroy(face);
    } catch (_error) {
      // Best-effort.
    }
  }
  canvas[nodeGraphXyPadPhosphorKey] = null;
  if (canvas._phosphorEnergyGl === face) {
    canvas._phosphorEnergyGl = null;
  }
}

/**
 * Step + present the pad phosphor via the shared energy drawer
 * (mono FBO + LUT beams — same path as 2D Phosphor / scope2d).
 * liveDeposit: fade + deposit a continuous beam ribbon; false = hold FBO.
 */
function nodeGraphXyPadStepPhosphor(pad, canvas, ctx, width, height, options = {}) {
  const drawer = typeof PhosphorDrawer !== "undefined"
    ? PhosphorDrawer
    : (typeof nodeGraphPhosphorDrawer !== "undefined" ? nodeGraphPhosphorDrawer : null);
  const ensure = drawer?.ensure
    || (typeof nodeGraphPhosphorEnergyGlEnsure === "function"
      ? (host, w, h) => nodeGraphPhosphorEnergyGlEnsure(host, w, h, nodeGraphXyPadPhosphorKey)
      : null);
  if (!ensure || !ctx || !canvas) {
    return false;
  }

  const face = ensure(canvas, width, height, nodeGraphXyPadPhosphorKey);
  if (!face) {
    return false;
  }
  // Alias so live-stop / clear paths that scan _phosphorEnergyGl also find us.
  canvas._phosphorEnergyGl = face;

  const bgHex = options.background || "#000000";
  // Multi-stop energy→color LUT from shared gradient editor (preferred).
  const gradientStops = Array.isArray(options.gradientStops) && options.gradientStops.length >= 2
    ? options.gradientStops
    : (typeof nodeGraphPhosphorGradientStopsFromSettings === "function"
      ? nodeGraphPhosphorGradientStopsFromSettings({
        gradientStops: options.gradientStops,
        background: bgHex,
        dot1Color: options.phosphorColor || "#7fc7d9",
      }, options.phosphorColor || "#7fc7d9")
      : null);
  // Rebuild LUT only when stops / peak color change (hot path while dragging).
  const lutKey = gradientStops
    ? `stops:${gradientStops.map((s) => `${s.t}|${s.color}`).join(";")}`
    : `peak:${options.phosphorColor || "#7fc7d9"}|${bgHex}`;
  if (face._xyPadLutKey !== lutKey) {
    let lutOk = false;
    if (gradientStops) {
      if (drawer?.setLutStops) {
        lutOk = drawer.setLutStops(face, gradientStops);
      } else if (typeof nodeGraphPhosphorEnergyGlSetLutFromStops === "function") {
        lutOk = Boolean(nodeGraphPhosphorEnergyGlSetLutFromStops(face, gradientStops));
      } else if (typeof nodeGraphPhosphorApplyGradientLut === "function") {
        lutOk = nodeGraphPhosphorApplyGradientLut(face, {
          gradientStops,
          background: bgHex,
          dot1Color: options.phosphorColor,
        }, options.phosphorColor || "#7fc7d9");
      }
    }
    if (!lutOk) {
      const peakRgb = nodeGraphXyPadPeakRgbBytes(options.phosphorColor || "#7fc7d9");
      if (drawer?.setLut) {
        drawer.setLut(face, peakRgb, bgHex);
      } else if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
        nodeGraphPhosphorEnergyGlSetLutFromPeak(face, peakRgb, bgHex);
      }
    }
    face._xyPadLutKey = lutKey;
  }

  const decay = Math.max(0, Math.min(1, Number(options.decay) || 0.12));
  const burn = Math.max(0, Math.min(1, Number(options.burn) || 0.82));
  const brightness01 = Math.max(0, Number(options.brightness) || 0.78);
  const minSide = Math.max(1, Math.min(width, height));
  // Full 0–1 size range (was capped at 0.2 — blocked large hard discs).
  const size01 = Math.max(0, Math.min(1, Number(options.size01) || 0.07));
  const blur = drawer?.normalizeBlur
    ? drawer.normalizeBlur(options.blur, 0)
    : Math.max(0, Math.min(1, Number(options.blur) || 0));
  const radius = Math.max(
    0.5,
    Number(options.radius) || (drawer?.radiusFromSize
      ? drawer.radiusFromSize(minSide, size01)
      : minSide * size01 * 0.5),
  );
  // Energy deposit gain (not raw 0..1 UX) — matches scope2d burn ribbons.
  const deposit = drawer?.depositGain
    ? drawer.depositGain(burn, brightness01, size01)
    : brightness01 * (0.022 + Math.pow(burn, 0.78) * 0.1) * (1.12 - size01 * 0.42);
  const liveDeposit = Boolean(options.liveDeposit);
  let pathPoints = Array.isArray(options.pathPoints) ? options.pathPoints : null;
  // Beam segments need ≥2 points; a dwell stamp is a near-zero segment.
  if (liveDeposit && pathPoints && pathPoints.length === 1 && pathPoints[0]) {
    pathPoints = [pathPoints[0], pathPoints[0]];
  }
  const maxDots = Math.max(
    64,
    Math.min(8192, Math.round(Number(options.maxDots) || 2048)),
  );
  // Default ON: spend dense packing up to Dot budget (hard solid trails).
  const fullDotEconomy = options.fullDotEconomy !== false;
  // Hard end: almost no bleed; soft end: charge diffusion halo.
  const bleed = blur * blur * (0.04 + blur * 0.14);

  if (liveDeposit && deposit > 1e-8) {
    face._xyPadPresentedIdle = false;
    // Prefer continuous beam segments so Papoulis-smoothed Out paths stay
    // curved; dots mode re-stamps sparse UI elbows as hard corners.
    const mode = options.mode === "dots" ? "dots" : "segments";
    if (typeof nodeGraphPhosphorEnergyGlStepBeams === "function") {
      nodeGraphPhosphorEnergyGlStepBeams(face, {
        decay,
        pathPoints,
        radius,
        brightness: deposit,
        blur,
        mode,
        maxDots,
        fullDotEconomy,
        bleed,
      });
    } else if (mode === "dots" && drawer?.stepDots) {
      drawer.stepDots(face, {
        decay,
        pathPoints,
        radius,
        brightness: deposit,
        blur,
        maxDots,
        burn,
        fullDotEconomy,
      });
    } else if (drawer?.stepBeams) {
      drawer.stepBeams(face, {
        decay,
        pathPoints,
        radius,
        brightness: deposit,
        blur,
        mode,
        maxDots,
        fullDotEconomy,
        bleed,
      });
    } else if (drawer?.stepDots) {
      drawer.stepDots(face, {
        decay,
        pathPoints,
        radius,
        brightness: deposit,
        blur,
        maxDots,
        burn,
        fullDotEconomy,
      });
    }
  }
  // Idle hold: do not step (no extra fade) — residual freezes until next drag.
  // Still present once so a cleared 2d canvas can show the frozen residual;
  // skip redundant present GPU work when energy is already idle-dark.
  if (!liveDeposit && face.energyActive === false && face._xyPadPresentedIdle) {
    return true;
  }

  const exposure = drawer?.exposure
    ? drawer.exposure(burn)
    : 1.85 + burn * 2.1;
  if (typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    if (!nodeGraphPhosphorEnergyGlPresent(face, 1, { exposure })) {
      face._xyPadPresentedIdle = true;
      return false;
    }
    face._xyPadPresentedIdle = !liveDeposit;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(face.canvas, 0, 0, width, height);
    ctx.restore();
    return true;
  }
  if (drawer?.presentTo) {
    const ok = drawer.presentTo(face, ctx, {
      exposure,
      width,
      height,
      smooth: true,
      composite: "lighter",
    });
    face._xyPadPresentedIdle = !liveDeposit;
    return ok;
  }
  return false;
}

function drawNodeGraphXyPad(pad, options = {}) {
  const canvas = pad?.querySelector(".node-xy-pad-canvas");
  if (!canvas) {
    return;
  }
  const display = nodeGraphXyPadDisplaySettings(pad);
  // Layout CSS size × devicePixelRatio — same contract as scope faces.
  // Do NOT use getBoundingClientRect × dpr: that is screen-space and grows
  // with workspace zoom, so a fixed-radius puck stayed constant on screen
  // instead of scaling with the module.
  const size = typeof nodeGraphModuleScopeFaceBackingSize === "function"
    ? nodeGraphModuleScopeFaceBackingSize(canvas)
    : null;
  let layoutW;
  let layoutH;
  let dpr;
  if (size && size.width >= 2 && size.height >= 2) {
    layoutW = size.width;
    layoutH = size.height;
    dpr = size.pixelRatio || Math.max(1, window.devicePixelRatio || 1);
  } else {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return;
    }
    const zoom = Math.max(0.01, typeof nodeGraphZoom === "function" ? nodeGraphZoom() : 1);
    dpr = Math.max(1, window.devicePixelRatio || 1);
    layoutW = Math.round((rect.width / zoom) * dpr);
    layoutH = Math.round((rect.height / zoom) * dpr);
  }
  // Pixel density 0–4 (same as 2D Phosphor): 0 → 1×1, 1 → layout×dpr, 4 AA.
  const densityRaw = typeof nodeGraphFacePlateDensity === "function"
    ? nodeGraphFacePlateDensity(display, 1)
    : Number(display.pixelDensity);
  const density = Number.isFinite(densityRaw) ? Math.max(0, Math.min(4, densityRaw)) : 1;
  const width = Math.max(1, Math.round(layoutW * density));
  const height = Math.max(1, Math.round(layoutH * density));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  // Clear any inline style so CSS 100% + workspace zoom scale the bitmap.
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Floor / peak follow gradientStops (shared gradient editor).
  const gradientStops = Array.isArray(display.gradientStops) && display.gradientStops.length >= 2
    ? display.gradientStops
    : (typeof nodeGraphPhosphorGradientStopsFromSettings === "function"
      ? nodeGraphPhosphorGradientStopsFromSettings(display, "#7fc7d9")
      : null);
  const bgHex = gradientStops?.[0]?.color || display.background || "#000000";
  const phosphorHex = gradientStops?.[gradientStops.length - 1]?.color
    || display.dot1Color
    || "#7fc7d9";
  // Face = phosphor of Out X/Y (same idea as wiring Out → scope2d) + vector UI.
  const brightness = Math.max(0, Number(display.dot1Brightness) || 0.78);
  const decayUx = Math.max(0, Math.min(1, Number(display.decay) || 0.35));
  const burn = Math.max(0, Math.min(1, Number(display.burn) || 0.82));
  // Phosphor beam stamp size (unit face); not multiplied by a global scale.
  const beamSize01 = Math.max(0.005, Math.min(1, Number(display.dot1Size) || 0.07));
  const blur = typeof nodeGraphTraceDisplayClampStampBlur === "function"
    ? nodeGraphTraceDisplayClampStampBlur(display.lineThickness)
    : Math.max(0, Math.min(1, Number(display.lineThickness) || 0.42));
  const puckSize01 = Math.max(0.005, Math.min(0.25, Number(display.puckSize) || 0.045));
  const dotBudget = Math.max(
    64,
    Math.min(8192, Math.round(Number(display.dotBudget) || 2048)),
  );
  const fullDotEconomy = display.fullDotEconomy !== false;
  const minSide = Math.max(1, Math.min(width, height));

  // Positions first (no canvas writes) so a static frame can skip entirely.
  // UI puck = Phase / mouse (unit 0..1, same space as Out after bipolar map).
  const targetX = Math.max(0, Math.min(1, nodeGraphXyPadParam(pad, "x", 0.5)));
  const targetY = Math.max(0, Math.min(1, nodeGraphXyPadParam(pad, "y", 0.5)));
  const puck = nodeGraphXyPadSnapUnit(pad, targetX, targetY);
  const px = puck.x * width;
  const py = (1 - puck.y) * height;
  // Phosphor deposits from Out path (Phase+CV → Smoothing ↔ lattice).
  const outPath = nodeGraphXyPadPhosphorOutPathPoints(pad, width, height);
  const phosphor = outPath
    ? {
      x: outPath.tip.x / Math.max(1, width),
      y: 1 - (outPath.tip.y / Math.max(1, height)),
      fromOut: true,
    }
    : nodeGraphXyPadPhosphorTargetUnit(pad);
  const trailX = outPath
    ? outPath.tip.x
    : Math.max(0, Math.min(1, phosphor.x)) * width;
  const trailY = outPath
    ? outPath.tip.y
    : (1 - Math.max(0, Math.min(1, phosphor.y))) * height;
  const ghostConnected = nodeGraphXyPadInputConnected(pad, "X")
    || nodeGraphXyPadInputConnected(pad, "Y");
  const dragging = Boolean(options.dragging || pad._xyPadDragging);
  if (!dragging && !options.force) {
    const fp = `${width}x${height}:${Math.round(px)},${Math.round(py)},${Math.round(trailX)},${Math.round(trailY)},${ghostConnected ? 1 : 0},${phosphor.fromOut ? 1 : 0}:${outPath?.points?.length || 0}:${beamSize01.toFixed(3)}:${puckSize01.toFixed(3)}`;
    if (pad._xyPadLastDrawFp === fp) {
      return;
    }
    pad._xyPadLastDrawFp = fp;
  } else {
    pad._xyPadLastDrawFp = null;
  }

  // ── Phosphor screen (energy residual of Out X/Y) ─────────────────────
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, width, height);

  let pathPoints = null;
  let liveDeposit = false;
  if (outPath?.points?.length) {
    const last = pad._xyPadTrailLast;
    pathPoints = last && Number.isFinite(last.x) && Number.isFinite(last.y)
      ? [last, ...outPath.points]
      : outPath.points;
    pad._xyPadTrailLast = outPath.tip;
    liveDeposit = true;
  } else {
    const trailPoint = { x: trailX, y: trailY };
    const last = pad._xyPadTrailLast;
    const moved = !last
      || !Number.isFinite(last.x)
      || !Number.isFinite(last.y)
      || Math.hypot(trailX - last.x, trailY - last.y) > 0.35;
    if (moved) {
      pathPoints = last && Number.isFinite(last.x)
        ? [last, trailPoint]
        : [trailPoint];
      pad._xyPadTrailLast = trailPoint;
      liveDeposit = true;
    }
  }
  nodeGraphXyPadStepPhosphor(pad, canvas, ctx, width, height, {
    liveDeposit,
    pathPoints,
    phosphorColor: phosphorHex,
    background: bgHex,
    gradientStops,
    decay: decayUx,
    brightness,
    burn,
    blur,
    size01: beamSize01,
    maxDots: dotBudget,
    fullDotEconomy,
    dpr,
    mode: "segments",
  });

  // ── Cheap vector UI overlay (not part of the energy residual) ────────
  // Quantize grid (controller chrome).
  const drawGrid = (quantKey, vertical) => {
    const divisions = nodeGraphXyPadDivisions(nodeGraphXyPadParam(pad, quantKey, 0));
    if (divisions <= 1) {
      return;
    }
    const step = 1 / divisions;
    const strength = Math.max(0, Math.min(1, nodeGraphXyPadParam(pad, quantKey, 0)));
    ctx.strokeStyle = `rgba(127, 199, 217, ${0.10 + strength * 0.16})`;
    ctx.lineWidth = Math.max(1, dpr * 0.75);
    ctx.beginPath();
    for (let i = 0; i <= divisions; i += 1) {
      const t = i * step;
      if (vertical) {
        const x = Math.round(t * width) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      } else {
        const y = Math.round((1 - t) * height) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
    }
    ctx.stroke();
  };
  drawGrid("xQuantize", true);
  drawGrid("yQuantize", false);

  if (ghostConnected) {
    // Out tip when CV is patched (same unit space as phosphor tip).
    const ghostR = Math.max(2, puckSize01 * minSide * 0.55);
    ctx.beginPath();
    ctx.arc(trailX, trailY, ghostR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(177, 132, 255, 0.48)";
    ctx.fill();
  }

  // Phase puck: solid vector disc (re-drawn each paint — trivial vs phosphor).
  const puckR = Math.max(2.5, puckSize01 * minSide);
  ctx.beginPath();
  ctx.arc(px, py, puckR * 1.15, 0, Math.PI * 2);
  ctx.strokeStyle = nodeGraphXyPadRgba(phosphorHex, 0.22);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, puckR, 0, Math.PI * 2);
  ctx.fillStyle = nodeGraphXyPadRgba(phosphorHex, 0.55 + brightness * 0.4);
  ctx.fill();
  ctx.strokeStyle = nodeGraphXyPadRgba(phosphorHex, 0.12);
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  ctx.beginPath();
  ctx.moveTo(px, 0); ctx.lineTo(px, height);
  ctx.moveTo(0, py); ctx.lineTo(width, py);
  ctx.stroke();
}

/**
 * Absolute (click-to-place / follow cursor) is the default XY pad mode.
 * Hold Shift for relative drag (with app-wide fine/coarse multipliers).
 * Alt alone is NOT absolute here — that used to force Alt for any placement
 * and made the pad feel immovable for normal mouse use.
 */
function nodeGraphXyPadAbsolutePointerMode(event) {
  // Relative only while Shift is held (fine drag). Otherwise absolute.
  // Keep Alt out of the absolute gate so plain click/drag always places the puck.
  return !Boolean(event?.shiftKey);
}

function nodeGraphXyPadDragMultiplier(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function nodeGraphXyPadReanchorDrag(pad, drag, event) {
  drag.startClientX = event.clientX;
  drag.startClientY = event.clientY;
  const pos = pad?._xyPadPos;
  drag.startX = Number.isFinite(pos?.x) ? pos.x : nodeGraphXyPadParam(pad, "x", 0.5);
  drag.startY = Number.isFinite(pos?.y) ? pos.y : nodeGraphXyPadParam(pad, "y", 0.5);
}

function nodeGraphXyPadDisplaySettings(pad) {
  const nodeId = String(pad?.dataset?.node || "");
  const node = nodeId && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (typeof nodeGraphXyPadDisplaySettingsForNode === "function") {
    return nodeGraphXyPadDisplaySettingsForNode(node);
  }
  if (typeof normalizeNodeGraphXyPadDisplaySettings === "function") {
    return normalizeNodeGraphXyPadDisplaySettings(node?.traceDisplaySettings);
  }
  return {
    background: "#000000",
    burn: 0.82,
    decay: 0.35,
    dot1Brightness: 0.78,
    dot1Color: "#7fc7d9",
    dot1Size: 0.07,
    dotBudget: 2048,
    fullDotEconomy: true,
    gradientStops: [
      { t: 0, color: "#000000" },
      { t: 0.18, color: "#0a2830" },
      { t: 0.55, color: "#3a8899" },
      { t: 1, color: "#7fc7d9" },
    ],
    lineThickness: 0.42,
    pixelDensity: 1,
    puckSize: 0.045,
  };
}

/** Parse #rgb / #rrggbb to {r,g,b} 0..255. */
function nodeGraphXyPadParseHexColor(hex, fallback = { r: 127, g: 199, b: 217 }) {
  const raw = String(hex || "").trim();
  const m6 = raw.match(/^#?([0-9a-f]{6})$/i);
  if (m6) {
    const n = Number.parseInt(m6[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m3 = raw.match(/^#?([0-9a-f]{3})$/i);
  if (m3) {
    const s = m3[1];
    return {
      r: Number.parseInt(s[0] + s[0], 16),
      g: Number.parseInt(s[1] + s[1], 16),
      b: Number.parseInt(s[2] + s[2], 16),
    };
  }
  return fallback;
}

function nodeGraphXyPadRgba(hex, alpha) {
  const { r, g, b } = nodeGraphXyPadParseHexColor(hex);
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Wipe phosphor residual for one pad / node (Display Settings → Reset canvas). */
function nodeGraphXyPadResetCanvas(nodeId) {
  const id = String(nodeId || "").trim();
  for (const pad of document.querySelectorAll(".node-xy-pad")) {
    if (id && pad.dataset.node !== id) {
      continue;
    }
    pad._xyPadTrailLast = null;
    pad._xyPadLastDrawFp = null;
    pad._xyPadPhosLastAbsFrame = null;
    const canvas = pad.querySelector(".node-xy-pad-canvas");
    if (canvas) {
      nodeGraphXyPadDestroyPhosphor(canvas);
    }
    drawNodeGraphXyPad(pad, { force: true });
  }
}

function nodeGraphXyPadRedrawAll() {
  for (const pad of document.querySelectorAll(".node-xy-pad")) {
    drawNodeGraphXyPad(pad);
  }
}

function nodeGraphXyPadApplyPointer(pad, event, drag, options = {}) {
  const canvas = pad.querySelector(".node-xy-pad-canvas");
  if (!canvas || !drag) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const absolute = nodeGraphXyPadAbsolutePointerMode(event);
  const multiplier = nodeGraphXyPadDragMultiplier(event);

  if (!absolute && (drag.absolute || multiplier !== drag.multiplier)) {
    nodeGraphXyPadReanchorDrag(pad, drag, event);
  }
  drag.absolute = absolute;
  drag.multiplier = multiplier;

  // Client rect includes workspace CSS zoom — ratio still correct for 0..1.
  const rawX = absolute
    ? (event.clientX - rect.left) / width
    : drag.startX + ((event.clientX - drag.startClientX) / width) * multiplier;
  const rawY = absolute
    ? 1 - ((event.clientY - rect.top) / height)
    : drag.startY - ((event.clientY - drag.startClientY) / height) * multiplier;
  const x = Math.max(0, Math.min(1, Number.isFinite(rawX) ? rawX : 0));
  const y = Math.max(0, Math.min(1, Number.isFinite(rawY) ? rawY : 0));
  drag.lastX = x;
  drag.lastY = y;
  nodeGraphXyPadWritePosition(pad, x, y, {
    interaction: "drag",
    commit: Boolean(options.commit),
    commitStatus: "XY pad moved",
  });
  nodeGraphXyPadScheduleDraw(pad, { dragging: true });
}

/** Finish drag: commit history without re-sampling the pointer. */
function nodeGraphXyPadCommitDrag(pad, drag) {
  const hasApplied = Number.isFinite(drag?.lastX) && Number.isFinite(drag?.lastY);
  if (!hasApplied) {
    // Click without move: keep start coords, still commit history + live sync.
    const x = Number.isFinite(drag?.startX) ? drag.startX : 0.5;
    const y = Number.isFinite(drag?.startY) ? drag.startY : 0.5;
    nodeGraphXyPadWritePosition(pad, x, y, {
      interaction: "drag",
      commit: true,
      commitStatus: "XY pad moved",
    });
  } else {
    // Position already matches last drag sample — only finalize commit (history).
    const status = "XY pad moved";
    for (const key of ["x", "y", "xPhase", "yPhase"]) {
      const slider = nodeGraphXyPadSlider(pad, key);
      if (slider && typeof commitNodeSliderDragValue === "function") {
        commitNodeSliderDragValue(slider, status);
      }
    }
    if (typeof scheduleNodeGraphLiveParameterSync === "function") {
      scheduleNodeGraphLiveParameterSync();
    }
  }
  // Idle redraw freezes phosphor residual (no further deposit/decay).
  nodeGraphXyPadCancelScheduledDraw(pad);
  drawNodeGraphXyPad(pad);
}

function nodeGraphXyPadSetGate(pad, high) {
  const gateSlider = nodeGraphXyPadSlider(pad, "gate");
  if (!gateSlider) {
    return;
  }
  // Immediate param push (not drag-batched) so Gate rises on pointerdown
  // and falls on pointerup without waiting for a later commit.
  setNodeSliderValue(gateSlider, high ? 1 : 0);
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
}

/** Map bipolar CV/out (−1…+1) into pad unit space (0…1) for phosphor/ghost. */
function nodeGraphXyPadNormalizeGhostUnit(value, fallbackUnit = 0.5) {
  if (typeof nodeGraphXyPadDspBipolarToUnit === "function" && Number.isFinite(Number(value))) {
    return nodeGraphXyPadDspBipolarToUnit(value);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return Math.max(0, Math.min(1, Number(fallbackUnit) || 0.5));
  }
  return Math.max(0, Math.min(1, (n + 1) * 0.5));
}

function createNodeGraphXyPadBody(node, type) {
  const pad = document.createElement("div");
  pad.className = "node-xy-pad";
  pad.dataset.node = node;
  pad.dataset.nodeType = type;
  pad.dataset.parameterVisual = "true";
  const canvas = document.createElement("canvas");
  canvas.className = "node-xy-pad-canvas";
  canvas.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} XY pad`);
  // Ensure the face is a hit target even if a parent toggles pointer-events.
  canvas.style.touchAction = "none";
  canvas.style.pointerEvents = "auto";
  pad.append(canvas);

  let drag = null;

  const detachWindowDrag = () => {
    window.removeEventListener("pointermove", onWindowPointerMove, true);
    window.removeEventListener("pointerup", onWindowPointerUp, true);
    window.removeEventListener("pointercancel", onWindowPointerUp, true);
  };

  const onWindowPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
    if (Math.abs(event.clientX - drag.startClientX) > 1 || Math.abs(event.clientY - drag.startClientY) > 1) {
      drag.moved = true;
    }
    nodeGraphXyPadApplyPointer(pad, event, drag);
  };

  const onWindowPointerUp = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) {
      return;
    }
    // Capture once — pointerup and lostpointercapture both fire; only the
    // first must run (second sees drag === null).
    const completedDrag = drag;
    drag = null;
    detachWindowDrag();
    try {
      if (canvas.hasPointerCapture?.(completedDrag.pointerId)) {
        canvas.releasePointerCapture(completedDrag.pointerId);
      }
    } catch (_) {
      // Best-effort.
    }
    // Keep _xyPadDragging true through finalize so syncFromParameters cannot
    // reconcile/mirror and nudge axes mid-commit.
    try {
      nodeGraphXyPadSetGate(pad, false);
      if (completedDrag.resetToDefault && !completedDrag.moved) {
        const xSlider = nodeGraphXyPadSlider(pad, "x");
        const ySlider = nodeGraphXyPadSlider(pad, "y");
        const defaultX = Number(xSlider?.dataset?.default);
        const defaultY = Number(ySlider?.dataset?.default);
        nodeGraphXyPadWritePosition(
          pad,
          Number.isFinite(defaultX) ? defaultX : 0.5,
          Number.isFinite(defaultY) ? defaultY : 0.5,
          { interaction: "drag", commit: true, commitStatus: "XY pad reset to default" },
        );
        drawNodeGraphXyPad(pad);
        return;
      }
      nodeGraphXyPadCommitDrag(pad, completedDrag);
    } finally {
      pad._xyPadDragging = false;
    }
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // Drop any stale window listeners from a previous incomplete drag.
    detachWindowDrag();
    pad._xyPadDragging = true;
    // Start a new beam stroke so tails do not bridge long gaps.
    pad._xyPadTrailLast = null;
    const startX = Number.isFinite(pad._xyPadPos?.x)
      ? pad._xyPadPos.x
      : nodeGraphXyPadParam(pad, "x", 0.5);
    const startY = Number.isFinite(pad._xyPadPos?.y)
      ? pad._xyPadPos.y
      : nodeGraphXyPadParam(pad, "y", 0.5);
    drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX,
      startY,
      absolute: nodeGraphXyPadAbsolutePointerMode(event),
      multiplier: nodeGraphXyPadDragMultiplier(event),
      moved: false,
      resetToDefault: (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    // Window listeners survive lostpointercapture (module re-layout, focus
    // thrash, etc.) so the puck keeps tracking until button-up.
    window.addEventListener("pointermove", onWindowPointerMove, true);
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("pointercancel", onWindowPointerUp, true);
    if (typeof triggerNodeGraphImpulseButton === "function") {
      triggerNodeGraphImpulseButton(node);
    }
    nodeGraphXyPadSetGate(pad, true);
    // Always sample on down: absolute places under cursor; relative is a no-op.
    nodeGraphXyPadApplyPointer(pad, event, drag);
  });
  // Canvas-local move/up still work when capture holds; window handlers above
  // cover the case where capture is lost mid-drag.
  canvas.addEventListener("pointermove", onWindowPointerMove);
  canvas.addEventListener("pointerup", onWindowPointerUp);
  canvas.addEventListener("pointercancel", onWindowPointerUp);
  // Do not end the drag on lostpointercapture while the button is still down —
  // window listeners keep driving the puck until pointerup.
  canvas.addEventListener("lostpointercapture", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (event.buttons & 1) {
      return;
    }
    onWindowPointerUp(event);
  });
  // Right-click face → phosphor Display Settings (color / background / reset).
  // Capture phase so shell/document handlers cannot win first.
  const openPadSettings = (event) => {
    if (event.defaultPrevented && event._xyPadSettingsHandled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    event._xyPadSettingsHandled = true;
    if (typeof openNodeXyPadContextMenu === "function" && openNodeXyPadContextMenu(event)) {
      return;
    }
    const nodeEl = pad.closest(".dsp-node")
      || document.querySelector(`.dsp-node[data-node="${CSS.escape?.(pad.dataset.node) || pad.dataset.node}"]`);
    if (typeof openNodeGraphTraceDisplaySettings === "function" && openNodeGraphTraceDisplaySettings(pad.dataset.node, event)) {
      return;
    }
    if (typeof openNodeGraphModuleSettingsFromContextEvent === "function") {
      openNodeGraphModuleSettingsFromContextEvent(event, nodeEl);
      return;
    }
    if (typeof openNodeModuleActionMenu === "function") {
      openNodeModuleActionMenu(event);
    }
  };
  // Capture phase first so shell/document handlers cannot swallow the event.
  // Pointer target is usually the canvas; pad catches padding around it.
  canvas.addEventListener("contextmenu", openPadSettings, true);
  pad.addEventListener("contextmenu", openPadSettings, true);

  pad.syncFromParameters = () => {
    // Phase sliders ↔ pad x/y stay value-mirrored; then repaint puck.
    // While dragging, applyPointer already schedules a paint.
    nodeGraphXyPadReconcileMirroredAxes(pad);
    if (pad._xyPadDragging) {
      return;
    }
    drawNodeGraphXyPad(pad);
  };
  pad.redrawFromSliders = pad.syncFromParameters;
  if (nodeGraphXyPadResizeObserver) {
    nodeGraphXyPadResizeObserver.observe(canvas);
  }
  // Sliders mount after the body — settle the phase↔position mirror once ready.
  requestAnimationFrame(() => {
    nodeGraphXyPadReconcileMirroredAxes(pad);
    drawNodeGraphXyPad(pad);
  });
  return pad;
}

// Phosphor follows Out X/Y (Phase+CV → filter order). Redraw on every scope
// snapshot so Papoulis glide / CV motion paint even while the mouse is held still.
addNodeGraphModuleScopeSnapshotListener(() => {
  for (const pad of document.querySelectorAll(".node-xy-pad")) {
    nodeGraphXyPadScheduleDraw(pad);
  }
});

registerNodeGraphChromelessModuleUi("xyPad", {
  createBody: createNodeGraphXyPadBody,
});
