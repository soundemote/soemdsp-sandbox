// Envelope face: Canvas 2D path of the expected contour
// (filterCurve / pulseCurve family — not phosphor, not WebGL).
// Used by Curve Envelope (expAdsr), Linear Envelope, and legacy Attack Decay.

function createNodeGraphEnvelopeCurveDisplay(nodeId, type) {
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-envelope-curve-display";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  section.dataset.parameterVisual = "true";
  section.syncFromParameters = () => {
    drawNodeGraphEnvelopeCurveDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-envelope-curve-canvas";
  section.append(canvas);
  requestAnimationFrame(() => drawNodeGraphEnvelopeCurveDisplay(section));
  return section;
}

function nodeGraphEnvelopeCurveLiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function drawNodeGraphEnvelopeCurveDisplay(section) {
  try {
    drawNodeGraphEnvelopeCurveDisplayInner(section);
  } catch (error) {
    const detail = error && typeof error === "object"
      ? (error.message || error.name || String(error))
      : String(error);
    console.warn("[envelope-curve] draw failed", detail, error);
  }
}

function nodeGraphEnvelopeCurveBuildPreview(node, type, width) {
  const pts = Math.max(64, Math.floor(Number(width) || 128));
  if (
    (type === "expAdsr" || type === "curveEnvelopeMod")
    && typeof nodeGraphExpAdsrPreviewCurve === "function"
  ) {
    const preview = nodeGraphExpAdsrPreviewCurve({
      delay: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "delay", 0)),
      attack: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.08)),
      decay: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.22)),
      sustain: nodeGraphEnvelopeCurveLiveParam(node, "sustain", 0.55),
      release: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "release", 0.45)),
      attackShape: nodeGraphEnvelopeCurveLiveParam(node, "attackShape", 0),
      releaseShape: nodeGraphEnvelopeCurveLiveParam(node, "releaseShape", 0),
    }, 2000, pts);
    const level = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "level", 1));
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.gateHigh / Math.max(1e-9, preview.total),
      ampView: Math.min(1, level),
      leftLabel: "A",
      rightLabel: "R",
      signature: {
        type,
        delay: nodeGraphEnvelopeCurveLiveParam(node, "delay", 0),
        attack: nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.08),
        decay: nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.22),
        sustain: nodeGraphEnvelopeCurveLiveParam(node, "sustain", 0.55),
        release: nodeGraphEnvelopeCurveLiveParam(node, "release", 0.45),
        attackShape: nodeGraphEnvelopeCurveLiveParam(node, "attackShape", 0),
        releaseShape: nodeGraphEnvelopeCurveLiveParam(node, "releaseShape", 0),
        level,
      },
    };
  }

  if (type === "linearEnvelope" && typeof nodeGraphLinearEnvelopePreviewCurve === "function") {
    const preview = nodeGraphLinearEnvelopePreviewCurve({
      delay: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "delay", 0)),
      attack: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.08)),
      decay: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.22)),
      sustain: nodeGraphEnvelopeCurveLiveParam(node, "sustain", 0.55),
      release: Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "release", 0.45)),
    }, pts);
    const level = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "level", 1));
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.gateHigh / Math.max(1e-9, preview.total),
      ampView: Math.min(1, level),
      leftLabel: "A",
      rightLabel: "R",
      signature: {
        type,
        delay: nodeGraphEnvelopeCurveLiveParam(node, "delay", 0),
        attack: nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.08),
        decay: nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.22),
        sustain: nodeGraphEnvelopeCurveLiveParam(node, "sustain", 0.55),
        release: nodeGraphEnvelopeCurveLiveParam(node, "release", 0.45),
        level,
        loop: nodeGraphEnvelopeCurveLiveParam(node, "loop", 0),
      },
    };
  }

  // Legacy Attack Decay (hidden from catalog; still draws if present in a patch)
  const attack = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.01));
  const decay = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.25));
  const curve = Math.max(0.001, nodeGraphEnvelopeCurveLiveParam(node, "curve", 1));
  const amplitude = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "amplitude", 1));
  const preview = typeof nodeGraphAttackDecayPreviewCurve === "function"
    ? nodeGraphAttackDecayPreviewCurve(attack, decay, curve, 2000, pts)
    : { points: [{ t: 0, y: 0 }, { t: 1, y: 0 }], attackHold: 0, total: 1 };
  return {
    points: preview.points,
    total: preview.total,
    guideT: preview.total > 0 ? preview.attackHold / preview.total : 0,
    ampView: Math.min(1, amplitude),
    leftLabel: "A",
    rightLabel: "D",
    signature: {
      type: "attackDecay",
      attack,
      decay,
      curve,
      amplitude,
      inputMode: nodeGraphEnvelopeCurveLiveParam(node, "inputMode", 0),
      cycle: nodeGraphEnvelopeCurveLiveParam(node, "cycle", 0),
    },
  };
}

function drawNodeGraphEnvelopeCurveDisplayInner(section) {
  const node = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(section?.dataset?.node || "")
    : null;
  const canvas = section?.querySelector?.(".node-envelope-curve-canvas");
  if (!node || !canvas || typeof nodeGraphSizeDisplayCanvas !== "function") {
    return;
  }
  const type = section.dataset.nodeType || node.type || "expAdsr";
  const cssW = Math.max(1, Number(section.clientWidth || section.offsetWidth) || 1);
  const cssH = Math.max(1, Number(section.clientHeight || section.offsetHeight) || 1);
  const built = nodeGraphEnvelopeCurveBuildPreview(node, type, cssW);
  const signature = JSON.stringify(built.signature);
  if (
    section._envelopeCurveSignature === signature
    && section._envelopeCurveCssW === cssW
    && section._envelopeCurveCssH === cssH
    && !section._envelopeCurveForceDraw
  ) {
    return;
  }
  const metrics = nodeGraphSizeDisplayCanvas(section, canvas);
  if (!metrics) {
    return;
  }
  const { context, cssHeight: height, cssWidth: width, pixelRatio } = metrics;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  section._envelopeCurveSignature = signature;
  section._envelopeCurveCssW = cssW;
  section._envelopeCurveCssH = cssH;
  section._envelopeCurveForceDraw = false;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(127, 199, 217, 0.18)";
  context.lineWidth = 1;
  for (let line = 0; line <= 4; line += 1) {
    const y = (line / 4) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  if (built.guideT > 0 && built.guideT < 1) {
    const gx = built.guideT * width;
    context.strokeStyle = "rgba(226, 168, 109, 0.45)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(gx, 0);
    context.lineTo(gx, height);
    context.stroke();
  }

  const pts = built.points || [];
  const ampView = built.ampView ?? 1;
  if (pts.length > 1) {
    context.beginPath();
    for (let i = 0; i < pts.length; i += 1) {
      const x = pts[i].t * width;
      const y = (1 - pts[i].y * ampView) * height;
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
  context.fillText(built.leftLabel || "A", 4, 12);
  context.textAlign = "right";
  context.fillText(built.rightLabel || "D", width - 4, 12);
}
