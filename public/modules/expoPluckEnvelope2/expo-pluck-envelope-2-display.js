// Expo Pluck Envelope 2 face — SoEmPluck contour + live Env dot.

function createNodeGraphExpoPluckEnvelope2Display(nodeId, type = "expoPluckEnvelope2") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-expo-pluck2-display node-envelope-curve-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "expoPluckEnvelope2");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.55";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.syncFromParameters = () => {
    section._expoPluck2ForceDraw = true;
    section._expoPluck2LaidOut = false;
    section._expoPluck2CurveSig = "";
    drawNodeGraphExpoPluckEnvelope2Display(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-expo-pluck2-canvas node-envelope-curve-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.55";
  section.append(canvas);
  if (typeof nodeGraphInstallDrawingFacePump === "function") {
    nodeGraphInstallDrawingFacePump(section, {
      clockKey: (el) => `expoPluck2:${el.dataset?.node || ""}`,
      forceKey: "_expoPluck2ForceDraw",
      rafKey: "_expoPluck2PlayheadRaf",
      paint: drawNodeGraphExpoPluckEnvelope2Display,
      onResize: (el) => { el._expoPluck2LaidOut = false; },
      paintOnCreate: false,
    });
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawNodeGraphExpoPluckEnvelope2Display(section);
      section._startFaceLoop?.();
    });
  });
  return section;
}

function nodeGraphExpoPluck2LiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function nodeGraphExpoPluck2ReadEnv(nodeId) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    for (const port of ["Env", "Out", "Mono", "A"]) {
      const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, port, Number.NaN));
      if (Number.isFinite(live)) return Math.max(0, live);
    }
  }
  return Number.NaN;
}

function drawNodeGraphExpoPluckEnvelope2Display(section) {
  try {
    drawNodeGraphExpoPluckEnvelope2DisplayInner(section);
  } catch (error) {
    console.warn("[expo-pluck2] draw failed", error?.message || error);
    if (section) {
      section._expoPluck2ForceDraw = true;
      section._expoPluck2LaidOut = false;
    }
  }
}

function drawNodeGraphExpoPluckEnvelope2DisplayInner(section) {
  const nodeId = String(section?.dataset?.node || "");
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-expo-pluck2-canvas")
    || section?.querySelector?.(".node-envelope-curve-canvas");
  if (!node || !canvas) return;

  const params = {
    attack: nodeGraphExpoPluck2LiveParam(node, "attack", 0),
    decaySlopeTop: nodeGraphExpoPluck2LiveParam(node, "decaySlopeTop", 0.9),
    decaySlopeMid: nodeGraphExpoPluck2LiveParam(node, "decaySlopeMid", 0.7),
    decaySlopeBottom: nodeGraphExpoPluck2LiveParam(node, "decaySlopeBottom", 4.8),
    sustain: nodeGraphExpoPluck2LiveParam(node, "sustain", 1.2),
    release: nodeGraphExpoPluck2LiveParam(node, "release", 0.86),
    autoReleaseTime: nodeGraphExpoPluck2LiveParam(node, "autoReleaseTime", 0),
    envelopeCurve: nodeGraphExpoPluck2LiveParam(node, "envelopeCurve", -0.5),
    envelopeDamping: nodeGraphExpoPluck2LiveParam(node, "envelopeDamping", 15),
    velocity: nodeGraphExpoPluck2LiveParam(node, "velocity", 1),
    velocitySensitivity: nodeGraphExpoPluck2LiveParam(node, "velocitySensitivity", 0.5),
    level: nodeGraphExpoPluck2LiveParam(node, "level", 1),
  };

  const rawW = Math.max(1, Number(section.clientWidth || section.offsetWidth) || 1);
  const rawH = Math.max(1, Number(section.clientHeight || section.offsetHeight) || 1);
  const signature = Object.values(params).map((v) => Number(v).toFixed(4)).join("|")
    + `|${Math.round(rawW)}x${Math.round(rawH)}`;

  const livePlaying = typeof nodeGraphRoundShapeLivePlaying === "function"
    ? nodeGraphRoundShapeLivePlaying()
    : Boolean(nodeGraphMvp?.live?.context);

  if (
    !livePlaying
    && section._expoPluck2Signature === signature
    && !section._expoPluck2ForceDraw
    && section._expoPluck2LaidOut === true
  ) {
    return;
  }
  if (rawW < 8 || rawH < 8) {
    section._expoPluck2LaidOut = false;
    section._expoPluck2ForceDraw = true;
    return;
  }

  let context;
  let pixelRatio = 1;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
    if (!metrics) return;
    context = metrics.context;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rawW * pixelRatio));
    canvas.height = Math.max(1, Math.round(rawH * pixelRatio));
    context = canvas.getContext("2d");
  }
  if (!context) return;

  const curveDirty = section._expoPluck2CurveSig !== signature || !section._expoPluck2CurveCanvas;
  section._expoPluck2Signature = signature;
  section._expoPluck2ForceDraw = false;
  section._expoPluck2LaidOut = true;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const drawW = Math.max(1, canvas.width / pixelRatio);
  const drawH = Math.max(1, canvas.height / pixelRatio);

  if (!curveDirty && section._expoPluck2CurveCanvas) {
    context.drawImage(section._expoPluck2CurveCanvas, 0, 0, drawW, drawH);
  } else {
    context.clearRect(0, 0, drawW, drawH);
    context.fillStyle = "rgba(2, 6, 9, 0.88)";
    context.fillRect(0, 0, drawW, drawH);

    const preview = typeof expoPluckEnvelope2PreviewCurve === "function"
      ? expoPluckEnvelope2PreviewCurve(params, Math.max(64, Math.floor(drawW)), 800)
      : { points: [{ t: 0, y: 0 }, { t: 1, y: 0 }] };

    const pts = preview.points || [];
    const ampView = Math.min(1, Math.max(0, params.level));
    // Scale Y by max preview so peak fills the face even if level≈1.
    let yMax = 1e-6;
    for (let i = 0; i < pts.length; i += 1) yMax = Math.max(yMax, pts[i].y);
    if (pts.length > 1) {
      context.beginPath();
      for (let i = 0; i < pts.length; i += 1) {
        const x = pts[i].t * drawW;
        const y = (1 - (pts[i].y / yMax) * ampView) * drawH;
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
    context.fillText("D/S", drawW - 4, 12);

    if (!section._expoPluck2CurveCanvas) {
      section._expoPluck2CurveCanvas = document.createElement("canvas");
    }
    const hold = section._expoPluck2CurveCanvas;
    if (hold.width !== canvas.width || hold.height !== canvas.height) {
      hold.width = canvas.width;
      hold.height = canvas.height;
    }
    const holdCtx = hold.getContext("2d");
    if (holdCtx) {
      holdCtx.setTransform(1, 0, 0, 1, 0, 0);
      holdCtx.clearRect(0, 0, hold.width, hold.height);
      holdCtx.drawImage(canvas, 0, 0);
      section._expoPluck2CurveSig = signature;
      section._expoPluck2Preview = preview;
      section._expoPluck2YMax = yMax;
    }
  }

  let env = nodeGraphExpoPluck2ReadEnv(nodeId);
  if (!Number.isFinite(env)) env = 0;
  env = Math.max(0, env);
  const yMax = Math.max(1e-6, Number(section._expoPluck2YMax) || 1);
  const preview = section._expoPluck2Preview;
  let t = 0;
  if (preview?.points?.length) {
    let best = 0;
    let bestErr = Infinity;
    for (let i = 0; i < preview.points.length; i += 1) {
      const err = Math.abs(preview.points[i].y - env);
      if (err <= bestErr) {
        bestErr = err;
        best = preview.points[i].t;
      }
    }
    t = best;
  }
  const px = t * drawW;
  const py = (1 - Math.min(1, (env / yMax) * Math.min(1, params.level))) * drawH;
  if (Number.isFinite(px) && Number.isFinite(py)) {
    context.beginPath();
    context.fillStyle = "#ffffff";
    context.arc(px, py, 2.25, 0, Math.PI * 2);
    context.fill();
  }
}
