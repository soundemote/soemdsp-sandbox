// Expo Pluck Envelope face — cheap Canvas2D curve (cached) + live position dot.
// Same family as Basic Shape (filter-curve layout, frame-rate paint, no phosphor).

function createNodeGraphExpoPluckEnvelopeDisplay(nodeId, type = "expoPluckEnvelope") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  // Own class first for drawer routing; keep envelope/filter plate classes for layout CSS.
  section.className = "node-filter-curve-display node-expo-pluck-display node-envelope-curve-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "expoPluckEnvelope");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.55";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.syncFromParameters = () => {
    section._expoPluckForceDraw = true;
    section._expoPluckLaidOut = false;
    section._expoPluckCurveSig = "";
    drawNodeGraphExpoPluckEnvelopeDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-expo-pluck-canvas node-envelope-curve-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.55";
  section.append(canvas);
  if (typeof nodeGraphInstallDrawingFacePump === "function") {
    nodeGraphInstallDrawingFacePump(section, {
      clockKey: (el) => `expoPluck:${el.dataset?.node || ""}`,
      forceKey: "_expoPluckForceDraw",
      rafKey: "_expoPluckPlayheadRaf",
      paint: drawNodeGraphExpoPluckEnvelopeDisplay,
      onResize: (el) => {
        if (typeof syncFaceMetrics === "function") syncFaceMetrics(el);
        el._expoPluckLaidOut = false;
      },
      paintOnCreate: false,
    });
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawNodeGraphExpoPluckEnvelopeDisplay(section);
      section._startFaceLoop?.();
    });
  });
  return section;
}

function nodeGraphExpoPluckLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function nodeGraphExpoPluckReadEnv(nodeId) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    for (const port of ["Env", "Out", "Mono", "A"]) {
      const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, port, Number.NaN));
      if (Number.isFinite(live)) {
        return Math.max(0, Math.min(1, live));
      }
    }
  }
  return Number.NaN;
}

function drawNodeGraphExpoPluckEnvelopeDisplay(section) {
  try {
    drawNodeGraphExpoPluckEnvelopeDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[expo-pluck] draw failed", detail, error);
    if (section) {
      section._expoPluckForceDraw = true;
      section._expoPluckLaidOut = false;
    }
  }
}

function drawNodeGraphExpoPluckEnvelopeDisplayInner(section) {
  const nodeId = String(section?.dataset?.node || "");
  const node = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  const canvas = section?.querySelector?.(".node-expo-pluck-canvas")
    || section?.querySelector?.(".node-envelope-curve-canvas");
  if (!node || !canvas) {
    return;
  }

  const attack = Math.max(0, nodeGraphExpoPluckLiveParam(node, "attack", 0.002));
  const decay = Math.max(0.01, nodeGraphExpoPluckLiveParam(node, "decay", 5));
  const frequency = Math.max(10, nodeGraphExpoPluckLiveParam(node, "frequency", 110));
  const damping = Math.min(1, Math.max(0, nodeGraphExpoPluckLiveParam(node, "damping", 0)));
  const level = Math.min(1, Math.max(0, nodeGraphExpoPluckLiveParam(node, "level", 1)));

  const faceMetrics = typeof ensureFaceMetrics === "function"
    ? ensureFaceMetrics(section, { observe: true })
    : null;
  const rawW = Math.max(1, faceMetrics
    ? faceMetrics.cssW
    : nodeGraphFiniteNumber(section.clientWidth || section.offsetWidth, 1));
  const rawH = Math.max(1, faceMetrics
    ? faceMetrics.cssH
    : nodeGraphFiniteNumber(section.clientHeight || section.offsetHeight, 1));
  const signature = [
    attack.toFixed(5),
    decay.toFixed(4),
    frequency.toFixed(2),
    damping.toFixed(4),
    level.toFixed(4),
    `${Math.round(rawW)}x${Math.round(rawH)}`,
  ].join("|");

  const livePlaying = typeof nodeGraphRoundShapeLivePlaying === "function"
    ? nodeGraphRoundShapeLivePlaying()
    : Boolean(nodeGraphMvp?.live?.context);

  if (
    !livePlaying
    && section._expoPluckSignature === signature
    && !section._expoPluckForceDraw
    && section._expoPluckLaidOut === true
  ) {
    return;
  }
  if (rawW < 8 || rawH < 8) {
    section._expoPluckLaidOut = false;
    section._expoPluckForceDraw = true;
    return;
  }

  let context;
  let width;
  let height;
  let pixelRatio = 1;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
    if (!metrics) {
      return;
    }
    context = metrics.context;
    width = metrics.cssWidth;
    height = metrics.cssHeight;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    pixelRatio = dpr;
    width = Math.max(1, Math.floor(rawW));
    height = Math.max(1, Math.floor(rawH));
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    context = canvas.getContext("2d");
  }
  if (!context || width < 8 || height < 8) {
    return;
  }

  const curveDirty = section._expoPluckCurveSig !== signature || !section._expoPluckCurveCanvas;
  section._expoPluckSignature = signature;
  section._expoPluckForceDraw = false;
  section._expoPluckLaidOut = true;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const drawW = Math.max(1, canvas.width / pixelRatio);
  const drawH = Math.max(1, canvas.height / pixelRatio);

  if (!curveDirty && section._expoPluckCurveCanvas) {
    context.drawImage(section._expoPluckCurveCanvas, 0, 0, drawW, drawH);
  } else {
    context.clearRect(0, 0, drawW, drawH);
    context.fillStyle = "rgba(2, 6, 9, 0.88)";
    context.fillRect(0, 0, drawW, drawH);

    const preview = typeof expoPluckEnvelopePreviewCurve === "function"
      ? expoPluckEnvelopePreviewCurve({
        attack,
        decay,
        frequency,
        damping,
        level: 1,
      }, Math.max(64, Math.floor(drawW)), 800)
      : { points: [{ t: 0, y: 0 }, { t: 1, y: 0 }], attackEndT: 0.1, level: 1 };

    if (preview.attackEndT > 0 && preview.attackEndT < 1) {
      const gx = preview.attackEndT * drawW;
      context.strokeStyle = "rgba(226, 168, 109, 0.4)";
      context.beginPath();
      context.moveTo(gx, 0);
      context.lineTo(gx, drawH);
      context.stroke();
    }

    const pts = preview.points || [];
    const ampView = Math.min(1, level);
    if (pts.length > 1) {
      context.beginPath();
      for (let i = 0; i < pts.length; i += 1) {
        const x = pts[i].t * drawW;
        const y = (1 - pts[i].y * ampView) * drawH;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "rgba(61, 224, 255, 0.95)";
      context.lineWidth = 1.5;
      context.lineJoin = "round";
      context.stroke();
    }

    context.fillStyle = "rgba(180, 210, 220, 0.55)";
    context.font = "10px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText("A", 4, 12);
    context.textAlign = "right";
    context.fillText("D", drawW - 4, 12);

    if (!section._expoPluckCurveCanvas) {
      section._expoPluckCurveCanvas = document.createElement("canvas");
    }
    const hold = section._expoPluckCurveCanvas;
    if (hold.width !== canvas.width || hold.height !== canvas.height) {
      hold.width = canvas.width;
      hold.height = canvas.height;
    }
    const holdCtx = hold.getContext("2d");
    if (holdCtx) {
      holdCtx.setTransform(1, 0, 0, 1, 0, 0);
      holdCtx.clearRect(0, 0, hold.width, hold.height);
      holdCtx.drawImage(canvas, 0, 0);
      section._expoPluckCurveSig = signature;
      section._expoPluckPreview = preview;
    }
  }

  // Position dot: Y = live Env; X = matching point on the preview contour.
  // Rising Env → attack side (first match); falling → decay side (last match).
  let env = nodeGraphExpoPluckReadEnv(nodeId);
  if (!Number.isFinite(env)) {
    env = 0;
  }
  env = Math.max(0, Math.min(1, env));
  const prevEnv = Number(section._expoPluckLastEnv);
  const rising = !Number.isFinite(prevEnv) || env >= prevEnv - 1e-4;
  section._expoPluckLastEnv = env;
  const preview = section._expoPluckPreview;
  let t = 0;
  if (preview?.points?.length) {
    let best = rising ? 0 : preview.points[preview.points.length - 1].t;
    let bestErr = Infinity;
    const pts = preview.points;
    if (rising) {
      for (let i = 0; i < pts.length; i += 1) {
        const err = Math.abs(pts[i].y - env);
        if (err < bestErr) {
          bestErr = err;
          best = pts[i].t;
        }
      }
    } else {
      for (let i = pts.length - 1; i >= 0; i -= 1) {
        const err = Math.abs(pts[i].y - env);
        if (err < bestErr) {
          bestErr = err;
          best = pts[i].t;
        }
      }
    }
    t = best;
  }
  const px = t * drawW;
  const py = (1 - env * Math.min(1, level)) * drawH;
  if (Number.isFinite(px) && Number.isFinite(py)) {
    context.beginPath();
    context.fillStyle = "#ffffff";
    context.arc(px, py, 2.25, 0, Math.PI * 2);
    context.fill();
  }
}
