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
  const q = Math.max(0, Math.min(1, Number(quantize) || 0));
  // 0 -> 1 division (free, no grid); (0..1] -> 2..17 divisions.
  return q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
}

// Same snap math as the live/worklet evaluators — one source of truth for
// puck position, grid, trail, and outputs. Phase is not a grid offset;
// pad x/y and the Phase sliders share the same 0..1 position values.
function nodeGraphXyPadQuantizeValue(value, quantize) {
  const divisions = nodeGraphXyPadDivisions(quantize);
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  if (divisions <= 1) {
    return v;
  }
  const step = 1 / divisions;
  return Math.max(0, Math.min(1, Math.round(v / step) * step));
}

/**
 * Quantize Input modes (targets written by UI; Papoulis only in audio smoother):
 *  0 Off          — free targets → shared Papoulis
 *  1 After smooth — free targets → Papoulis → lattice on X/Y outs
 *  2 Then smooth  — lattice targets → shared Papoulis (glide between cells)
 */
function nodeGraphXyPadQuantizeInputMode(pad) {
  const m = Math.round(Number(nodeGraphXyPadParam(pad, "quantizeInput", 0)) || 0);
  return Math.max(0, Math.min(2, m));
}

/** Snap unit coords with the pad's X/Y Quantize amounts. */
function nodeGraphXyPadSnapUnit(pad, unitX, unitY) {
  return {
    x: nodeGraphXyPadQuantizeValue(unitX, nodeGraphXyPadParam(pad, "xQuantize", 0)),
    y: nodeGraphXyPadQuantizeValue(unitY, nodeGraphXyPadParam(pad, "yQuantize", 0)),
  };
}

/**
 * Unit targets only (no main-thread Papoulis). Mode 2 snaps before write;
 * modes 0/1 write free (mode 1 snaps after smooth on the audio outs).
 */
function nodeGraphXyPadResolveInputPath(pad, rawX, rawY) {
  const clampedX = Math.max(0, Math.min(1, Number(rawX) || 0));
  const clampedY = Math.max(0, Math.min(1, Number(rawY) || 0));
  if (nodeGraphXyPadQuantizeInputMode(pad) === 2) {
    return nodeGraphXyPadSnapUnit(pad, clampedX, clampedY);
  }
  return { x: clampedX, y: clampedY };
}

/**
 * Mouse Smooth amount 0..1 → internal smoothingSeconds (sample count).
 * Same cutoff map as the old host mouse filter (60 Hz light → 2 Hz heavy),
 * but applied only via the shared audio param smoother.
 */
function nodeGraphXyPadSmoothingSamplesFromAmount(amount, sampleRate) {
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  if (a <= 1e-4) {
    return 0;
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const logMin = Math.log(2);
  const logMax = Math.log(60);
  const cutoffHz = Math.exp(logMax + a * (logMin - logMax));
  return Math.max(1, Math.round(rate / Math.max(0.5, cutoffHz)));
}

/**
 * Push Papoulis smoothingSeconds for x/y/phase from Mouse Smooth amount so
 * audio uses one shared chase filter (not a second main-thread Papoulis).
 */
function nodeGraphXyPadSyncSharedSmoothingMeta(pad) {
  const nodeId = String(pad?.dataset?.node || "");
  if (!nodeId || typeof nodeGraphPatchNode !== "function") {
    return;
  }
  const node = nodeGraphPatchNode(nodeId);
  if (!node) {
    return;
  }
  const amount = nodeGraphXyPadParam(pad, "mouseSmoothing", 0.35);
  const samples = nodeGraphXyPadSmoothingSamplesFromAmount(
    amount,
    nodeGraphMvp?.sampleRate || 44100,
  );
  // Mouse Smooth is not the dragged axis — skip full meta rewrite on every move.
  if (pad._xyPadSmoothSamples === samples) {
    return;
  }
  pad._xyPadSmoothSamples = samples;
  node.paramMeta = node.paramMeta && typeof node.paramMeta === "object" ? node.paramMeta : {};
  for (const key of ["x", "y", "xPhase", "yPhase"]) {
    const prev = node.paramMeta[key] && typeof node.paramMeta[key] === "object"
      ? node.paramMeta[key]
      : {};
    node.paramMeta[key] = {
      ...prev,
      linearSmoothing: true,
      smoothingMode: "internal",
      smoothingSeconds: samples,
      smoothingType: "papoulis",
    };
  }
}

function nodeGraphXyPadSlider(pad, key) {
  return document.getElementById(`node-${pad.dataset.node}-${key}`);
}

function nodeGraphXyPadParam(pad, key, fallback) {
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
  const clampedX = Math.max(0, Math.min(1, Number(x) || 0));
  const clampedY = Math.max(0, Math.min(1, Number(y) || 0));
  const interaction = options.interaction || "drag";
  const isDrag = interaction === "drag";
  const pairs = [
    ["x", clampedX],
    ["y", clampedY],
    ["xPhase", clampedX],
    ["yPhase", clampedY],
  ];
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
  // Phase / pad writes: re-snap targets only in "Then smooth" (mode 2).
  if (phaseIsSource) {
    const path = nodeGraphXyPadResolveInputPath(pad, cur.xPhase, cur.yPhase);
    nodeGraphXyPadWritePosition(pad, path.x, path.y, { interaction: "drag" });
    return;
  }
  if (
    Math.abs(cur.x - cur.xPhase) > eps
    || Math.abs(cur.y - cur.yPhase) > eps
    || xPosChanged
    || yPosChanged
  ) {
    const path = nodeGraphXyPadResolveInputPath(pad, cur.x, cur.y);
    nodeGraphXyPadWritePosition(pad, path.x, path.y, { interaction: "drag" });
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

// Shared mono-energy phosphor (same device as 2D Phosphor / scope2d burn).
// Host canvas is the pad face; residual lives in the WebGL energy FBO.
const nodeGraphXyPadPhosphorKey = "_xyPadPhosphorEnergyGl";

function nodeGraphXyPadTrailNodeId(pad) {
  return String(pad?.dataset?.node || "").trim();
}

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
    // Legacy peak ramp if gradient helpers are unavailable.
    const peakRgb = nodeGraphXyPadPeakRgbBytes(options.phosphorColor || "#7fc7d9");
    if (drawer?.setLut) {
      drawer.setLut(face, peakRgb, bgHex);
    } else if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
      nodeGraphPhosphorEnergyGlSetLutFromPeak(face, peakRgb, bgHex);
    }
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
    // Hard discs need dots mode (true hard profile). Segments also support
    // hard/soft morph now, but pad trails are stamp economy driven.
    if (typeof nodeGraphPhosphorEnergyGlStepBeams === "function") {
      nodeGraphPhosphorEnergyGlStepBeams(face, {
        decay,
        pathPoints,
        radius,
        brightness: deposit,
        blur,
        mode: "dots",
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

  const exposure = drawer?.exposure
    ? drawer.exposure(burn)
    : 1.85 + burn * 2.1;
  if (typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    if (!nodeGraphPhosphorEnergyGlPresent(face, 1, { exposure })) {
      return false;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(face.canvas, 0, 0, width, height);
    ctx.restore();
    return true;
  }
  if (drawer?.presentTo) {
    return drawer.presentTo(face, ctx, {
      exposure,
      width,
      height,
      smooth: true,
      composite: "lighter",
    });
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
  const brightness = Math.max(0, Number(display.dot1Brightness) || 0.78);
  const decayUx = Math.max(0, Math.min(1, Number(display.decay) || 0.35));
  const burn = Math.max(0, Math.min(1, Number(display.burn) || 0.82));
  const size01 = Math.max(0, Math.min(1, Number(display.dot1Size) || 0.07));
  const blur = typeof nodeGraphTraceDisplayClampStampBlur === "function"
    ? nodeGraphTraceDisplayClampStampBlur(display.lineThickness)
    : Math.max(0, Math.min(1, Number(display.lineThickness) || 0.42));
  const scale = Math.max(0, Number(display.scale) || 1);
  const sizeScaled = Math.max(0.005, Math.min(1, size01 * Math.max(0.05, scale)));
  const dotBudget = Math.max(
    64,
    Math.min(8192, Math.round(Number(display.dotBudget) || 2048)),
  );
  // Default ON when unset (matches normalize defaults).
  const fullDotEconomy = display.fullDotEconomy !== false;
  // Always paint an opaque phosphor plate (display background color).
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, width, height);

  // Dim quantize grid — one axis at a time so X and Y stay independent.
  // Lattice is fixed (phase sliders mirror pad position, not grid offset).
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

  // Prefer live X/Y outs (shared audio chase + quantize + CV) over raw targets.
  const targetX = Math.max(0, Math.min(1, nodeGraphXyPadParam(pad, "x", 0.5)));
  const targetY = Math.max(0, Math.min(1, nodeGraphXyPadParam(pad, "y", 0.5)));
  const nodeId = String(pad.dataset.node || "");
  let x = targetX;
  let y = targetY;
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function" && nodeId) {
    const ox = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "X", Number.NaN));
    const oy = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "Y", Number.NaN));
    if (Number.isFinite(ox)) {
      x = nodeGraphXyPadNormalizeGhostUnit(ox, targetX);
    }
    if (Number.isFinite(oy)) {
      y = nodeGraphXyPadNormalizeGhostUnit(oy, targetY);
    }
  }
  const px = x * width;
  const py = (1 - y) * height;

  const dragging = Boolean(options.dragging || pad._xyPadDragging);
  const ghostConnected = nodeGraphXyPadInputConnected(pad, "X")
    || nodeGraphXyPadInputConnected(pad, "Y");
  const liveTrail = dragging || ghostConnected;
  const trailPoint = { x: px, y: py };
  let pathPoints = null;
  if (liveTrail) {
    const last = pad._xyPadTrailLast;
    if (
      last
      && Number.isFinite(last.x)
      && Number.isFinite(last.y)
      && Math.hypot(px - last.x, py - last.y) < Math.max(width, height) * 0.55
    ) {
      pathPoints = [last, trailPoint];
    } else {
      pathPoints = [trailPoint];
    }
    pad._xyPadTrailLast = trailPoint;
  } else {
    pad._xyPadTrailLast = null;
  }
  nodeGraphXyPadStepPhosphor(pad, canvas, ctx, width, height, {
    liveDeposit: liveTrail,
    pathPoints,
    phosphorColor: phosphorHex,
    background: bgHex,
    gradientStops,
    decay: decayUx,
    brightness,
    burn,
    blur,
    size01: sizeScaled,
    maxDots: dotBudget,
    fullDotEconomy,
    dpr,
  });

  if (ghostConnected) {
    // Phantom at CV-modulated out (same stream as puck; no link line).
    ctx.beginPath();
    ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(177, 132, 255, 0.48)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(px, py, 7 * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = nodeGraphXyPadRgba(phosphorHex, 0.22);
  ctx.lineWidth = dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, 5.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = nodeGraphXyPadRgba(phosphorHex, 0.55 + brightness * 0.4);
  ctx.fill();
  ctx.strokeStyle = nodeGraphXyPadRgba(phosphorHex, 0.12);
  ctx.lineWidth = dpr * 0.75;
  ctx.beginPath();
  ctx.moveTo(px, 0); ctx.lineTo(px, height);
  ctx.moveTo(0, py); ctx.lineTo(width, py);
  ctx.stroke();
}

function nodeGraphXyPadAbsolutePointerMode(event) {
  return Boolean(event?.altKey) && !(event?.shiftKey && (event.ctrlKey || event.metaKey));
}

function nodeGraphXyPadDragMultiplier(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function nodeGraphXyPadReanchorDrag(pad, drag, event) {
  drag.startClientX = event.clientX;
  drag.startClientY = event.clientY;
  drag.startX = nodeGraphXyPadParam(pad, "x", 0.5);
  drag.startY = nodeGraphXyPadParam(pad, "y", 0.5);
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
    scale: 1,
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
    const canvas = pad.querySelector(".node-xy-pad-canvas");
    if (canvas) {
      nodeGraphXyPadDestroyPhosphor(canvas);
    }
    drawNodeGraphXyPad(pad);
  }
}

function nodeGraphXyPadRedrawAll() {
  for (const pad of document.querySelectorAll(".node-xy-pad")) {
    drawNodeGraphXyPad(pad);
  }
}

function nodeGraphXyPadApplyPointer(pad, event, drag, options = {}) {
  const canvas = pad.querySelector(".node-xy-pad-canvas");
  const rect = canvas.getBoundingClientRect();
  const absolute = nodeGraphXyPadAbsolutePointerMode(event);
  const multiplier = nodeGraphXyPadDragMultiplier(event);

  if (!absolute && (drag.absolute || multiplier !== drag.multiplier)) {
    nodeGraphXyPadReanchorDrag(pad, drag, event);
  }
  drag.absolute = absolute;
  drag.multiplier = multiplier;

  // Client rect includes workspace CSS zoom — ratio still correct for 0..1.
  const rawX = absolute
    ? (event.clientX - rect.left) / Math.max(1, rect.width)
    : drag.startX + ((event.clientX - drag.startClientX) / Math.max(1, rect.width)) * multiplier;
  const rawY = absolute
    ? 1 - ((event.clientY - rect.top) / Math.max(1, rect.height))
    : drag.startY - ((event.clientY - drag.startClientY) / Math.max(1, rect.height)) * multiplier;
  const { x, y } = nodeGraphXyPadResolveInputPath(pad, rawX, rawY);
  drag.lastX = x;
  drag.lastY = y;
  nodeGraphXyPadWritePosition(pad, x, y, {
    interaction: "drag",
    commit: Boolean(options.commit),
    commitStatus: "XY pad moved",
  });
  nodeGraphXyPadScheduleDraw(pad, { dragging: true });
}

/**
 * Finish a pad drag without re-sampling the pointer and without re-writing
 * coordinates that were already applied on the last move (that re-write was
 * an extra “step” after release when param smoothers / live sync re-targeted).
 */
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

/** Map bipolar CV (-1..+1) into pad unit space (0..1) for ghost display. */
function nodeGraphXyPadNormalizeGhostUnit(value, fallbackUnit = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return Math.max(0, Math.min(1, Number(fallbackUnit) || 0.5));
  }
  // Pad outputs are bipolar: center 0 → unit 0.5, edges ±1 → 0/1.
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
  pad.append(canvas);

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pad._xyPadDragging = true;
    // Start a new beam stroke so tails do not bridge long gaps.
    pad._xyPadTrailLast = null;
    const startX = nodeGraphXyPadParam(pad, "x", 0.5);
    const startY = nodeGraphXyPadParam(pad, "y", 0.5);
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
    // Refresh Papoulis time constant once at drag start (not every move).
    pad._xyPadSmoothSamples = undefined;
    nodeGraphXyPadSyncSharedSmoothingMeta(pad);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    if (typeof triggerNodeGraphImpulseButton === "function") {
      triggerNodeGraphImpulseButton(node);
    }
    nodeGraphXyPadSetGate(pad, true);
    if (drag.absolute) {
      nodeGraphXyPadApplyPointer(pad, event, drag);
    } else {
      nodeGraphXyPadScheduleDraw(pad, { dragging: true });
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
    if (Math.abs(event.clientX - drag.startClientX) > 1 || Math.abs(event.clientY - drag.startClientY) > 1) {
      drag.moved = true;
    }
    nodeGraphXyPadApplyPointer(pad, event, drag);
  });
  const release = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) {
      return;
    }
    // Capture once — pointerup and lostpointercapture both fire; only the
    // first must run (second sees drag === null).
    const completedDrag = drag;
    drag = null;
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
  canvas.addEventListener("pointerup", release);
  // lostpointercapture can fire after pointerup already cleared drag — ignore
  // the second event (guarded by drag === null above).
  canvas.addEventListener("lostpointercapture", release);
  // Swallow a trailing pointermove that some browsers emit on release after
  // capture ends (would otherwise be ignored once drag is null — keep guard).
  canvas.addEventListener("pointercancel", release);
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
    // Phase sliders ↔ pad x/y stay value-mirrored; then repaint.
    // While the pointer is driving the pad, applyPointer already steps phosphor
    // once per event — skip here so we do not double-deposit / double-decay.
    nodeGraphXyPadReconcileMirroredAxes(pad);
    nodeGraphXyPadSyncSharedSmoothingMeta(pad);
    if (pad._xyPadDragging) {
      return;
    }
    // "Then smooth": re-snap targets when lattice / mode changes idle.
    if (nodeGraphXyPadQuantizeInputMode(pad) === 2) {
      const cur = nodeGraphXyPadReadAxes(pad);
      const snapped = nodeGraphXyPadSnapUnit(pad, cur.x, cur.y);
      if (
        Math.abs(snapped.x - cur.x) > 1e-9
        || Math.abs(snapped.y - cur.y) > 1e-9
      ) {
        nodeGraphXyPadWritePosition(pad, snapped.x, snapped.y, { interaction: "drag" });
      }
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

// Ghost + phosphor residual track live CV; only redraw when inputs are patched
// (parameter changes go through syncFromParameters).
addNodeGraphModuleScopeSnapshotListener(() => {
  for (const pad of document.querySelectorAll(".node-xy-pad")) {
    if (nodeGraphXyPadInputConnected(pad, "X") || nodeGraphXyPadInputConnected(pad, "Y")) {
      drawNodeGraphXyPad(pad);
    }
  }
});

registerNodeGraphChromelessModuleUi("xyPad", {
  createBody: createNodeGraphXyPadBody,
});
