// Envelope face: Canvas 2D path of the expected contour
// (filterCurve / pulseCurve family — not phosphor, not WebGL).
// Used by Curve ADSR / Curve AR / Linear ADSR / Linear AR / Pluck Envelope faces.

function createNodeGraphEnvelopeCurveDisplay(nodeId, type) {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-envelope-curve-display";
  section.dataset.node = id;
  section.dataset.nodeType = type;
  section.dataset.parameterVisual = "true";
  section.syncFromParameters = () => {
    section._envelopeCurveForceDraw = true;
    if (typeof syncFaceMetrics === "function") {
      syncFaceMetrics(section);
    }
    drawNodeGraphEnvelopeCurveDisplay(section);
  };
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-envelope-curve-canvas";
  section.append(canvas);
  if (typeof ResizeObserver === "function" && !section._envelopeCurveResizeObs) {
    const ro = new ResizeObserver(() => {
      if (!section.isConnected) {
        return;
      }
      if (typeof syncFaceMetrics === "function") {
        syncFaceMetrics(section);
      }
      section._envelopeCurveForceDraw = true;
      drawNodeGraphEnvelopeCurveDisplay(section);
    });
    try {
      ro.observe(section);
      section._envelopeCurveResizeObs = ro;
    } catch (_error) {
      // Ignore.
    }
  }
  requestAnimationFrame(() => drawNodeGraphEnvelopeCurveDisplay(section));
  const tick = () => {
    if (!section.isConnected) return;
    section._envelopeCurveForceDraw = true;
    drawNodeGraphEnvelopeCurveDisplay(section);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  const pts = Math.max(64, Math.floor(nodeGraphFiniteNumber(width, 128)));
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

  if (type === "linearAttackRelease" && typeof nodeGraphLinearAttackReleasePreviewCurve === "function") {
    const attack = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.01));
    const release = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "release", 0.25));
    const amplitude = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "amplitude", 1));
    const preview = nodeGraphLinearAttackReleasePreviewCurve({ attack, release }, pts);
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.gateHigh / Math.max(1e-9, preview.total),
      ampView: Math.min(1, amplitude),
      leftLabel: "A",
      rightLabel: "R",
      signature: {
        type,
        attack,
        release,
        amplitude,
        inputMode: nodeGraphEnvelopeCurveLiveParam(node, "inputMode", 0),
      },
    };
  }

  if (type === "curveAttackRelease" && typeof nodeGraphCurveAttackReleasePreviewCurve === "function") {
    const attack = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.01));
    const release = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "release", 0.25));
    const attackShape = nodeGraphEnvelopeCurveLiveParam(node, "attackShape", 0);
    const releaseShape = nodeGraphEnvelopeCurveLiveParam(node, "releaseShape", 0);
    const amplitude = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "amplitude", 1));
    const preview = nodeGraphCurveAttackReleasePreviewCurve({
      attack, release, attackShape, releaseShape, amplitude,
    }, pts);
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.gateHigh / Math.max(1e-9, preview.total),
      ampView: preview.ampView,
      leftLabel: "A",
      rightLabel: "R",
      signature: {
        type,
        attack,
        release,
        attackShape,
        releaseShape,
        amplitude,
        inputMode: nodeGraphEnvelopeCurveLiveParam(node, "inputMode", 0),
        updateOnTrigger: nodeGraphEnvelopeCurveLiveParam(node, "updateOnTrigger", 0),
      },
    };
  }

  if (type === "pluckEnvelope" && typeof nodeGraphPluckEnvelopeCircuitPreviewCurve === "function") {
    const attack = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0));
    const release = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "release", 0.11715292599242004));
    const attackShape = nodeGraphEnvelopeCurveLiveParam(node, "attackShape", -0.07);
    const releaseShape = nodeGraphEnvelopeCurveLiveParam(node, "releaseShape", 1);
    const feedback = nodeGraphEnvelopeCurveLiveParam(node, "feedback", 0.6804373070396221);
    const bias = nodeGraphEnvelopeCurveLiveParam(node, "bias", 0.9435542410230598);
    const amplitude = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "amplitude", 1));
    const preview = nodeGraphPluckEnvelopeCircuitPreviewCurve({
      attack, release, attackShape, releaseShape, feedback, bias, amplitude,
    }, pts);
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.guideT,
      ampView: preview.ampView,
      leftLabel: "A",
      rightLabel: "R",
      signature: { type, attack, release, attackShape, releaseShape, feedback, bias, amplitude },
    };
  }

  if (typeof nodeGraphThumpEnvelopePreviewCurve === "function") {
    const attack = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0));
    const release = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "release", 12.824772066678985));
    const decaySnap = Math.max(0, Math.min(1, nodeGraphEnvelopeCurveLiveParam(node, "decaySnap", 0)));
    const decayBody = Math.max(0, Math.min(1, nodeGraphEnvelopeCurveLiveParam(node, "decayBody", 0)));
    const fallCurve = nodeGraphEnvelopeCurveLiveParam(node, "fallCurve", 0.8062943900342834);
    const amplitude = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "amplitude", 0.980691228326368));
    const preview = nodeGraphThumpEnvelopePreviewCurve({
      attack, release, decaySnap, decayBody, fallCurve, amplitude,
    }, pts);
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.guideT,
      ampView: preview.ampView,
      leftLabel: "A",
      rightLabel: "R",
      signature: { type, attack, release, decaySnap, decayBody, fallCurve, amplitude },
    };
  }

  if (type === "wavetableAdsr") {
    const attack = Math.max(1e-4, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0.01));
    const decay = Math.max(1e-4, nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.2));
    const sustain = Math.max(0, Math.min(1, nodeGraphEnvelopeCurveLiveParam(node, "sustain", 0.7)));
    const release = Math.max(1e-4, nodeGraphEnvelopeCurveLiveParam(node, "release", 0.3));
    const level = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "level", 1));
    const shape = Math.round(nodeGraphEnvelopeCurveLiveParam(node, "shape", 0));
    const total = attack + decay + release;
    const warp = (t, falling) => {
      const u = Math.max(0, Math.min(1, t));
      if (shape === 2) return u * u * (3 - 2 * u);
      if (shape === 3) {
        if (falling) return (Math.exp(9 * u) - 1) / (Math.exp(9) - 1);
        return Math.log(1 + 9 * u) / Math.log(10);
      }
      if (shape === 0) return 1 - Math.exp(-3 * u);
      return u;
    };
    const points = [];
    const n = Math.max(64, pts);
    for (let i = 0; i < n; i += 1) {
      const t = (i / Math.max(1, n - 1)) * total;
      let y = 0;
      if (t <= attack) {
        y = warp(t / attack, false);
      } else if (t <= attack + decay) {
        y = 1 - (1 - sustain) * warp((t - attack) / decay, true);
      } else {
        y = sustain * (1 - warp((t - attack - decay) / release, true));
      }
      points.push({ t: t / total, y: Math.max(0, Math.min(1, y)) });
    }
    return {
      points,
      total,
      guideT: (attack + decay) / total,
      ampView: Math.min(1, level),
      leftLabel: "A",
      rightLabel: "R",
      signature: { type, attack, decay, sustain, release, level, shape },
    };
  }

  if (type === "pingEnvelope" && typeof nodeGraphPingEnvelopePreviewCurve === "function") {
    const attack = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "attack", 0));
    const decay = Math.max(0, Math.min(1, nodeGraphEnvelopeCurveLiveParam(node, "decay", 0.5)));
    const amplitude = Math.max(0, nodeGraphEnvelopeCurveLiveParam(node, "amplitude", 1));
    const recalculateOnTrigger = nodeGraphEnvelopeCurveLiveParam(node, "recalculateOnTrigger", 1);
    const preview = nodeGraphPingEnvelopePreviewCurve({ attack, decay, amplitude }, pts);
    return {
      points: preview.points,
      total: preview.total,
      guideT: preview.guideT,
      ampView: preview.ampView,
      leftLabel: "A",
      rightLabel: "D",
      signature: { type, attack, decay, amplitude, recalculateOnTrigger },
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
  const faceMetrics = typeof ensureFaceMetrics === "function"
    ? ensureFaceMetrics(section, { observe: true })
    : null;
  const cssW = Math.max(1, faceMetrics
    ? faceMetrics.cssW
    : nodeGraphFiniteNumber(section.clientWidth || section.offsetWidth, 1));
  const cssH = Math.max(1, faceMetrics
    ? faceMetrics.cssH
    : nodeGraphFiniteNumber(section.clientHeight || section.offsetHeight, 1));
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
  section._envelopeCurveCssW = width;
  section._envelopeCurveCssH = height;
  section._envelopeCurveForceDraw = false;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);

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

  const joinT = Number(built.guideT);
  const nodeId = String(section.dataset.node || "");
  const liveOut = typeof nodeGraphGhostSliderScopeSample === "function"
    ? (nodeGraphGhostSliderScopeSample(nodeId, "Out")
      ?? nodeGraphGhostSliderScopeSample(nodeId, "Env"))
    : null;
  const liveGate = typeof nodeGraphGhostSliderScopeSample === "function"
    ? (nodeGraphGhostSliderScopeSample(nodeId, "Gate")
      ?? nodeGraphGhostSliderScopeSample(nodeId, "Trigger"))
    : null;
  // Position comes from the live Out level and the Gate/Trigger.
  // While the gate is high and the level has reached sustain, the dot stays
  // on the sustain point. It does not keep walking the release.
  let playT = joinT;
  if (Number.isFinite(liveOut) && pts.length) {
    const amp = Math.max(1e-9, Number(ampView) || 1);
    const y = Math.max(0, Math.min(1, Number(liveOut) / amp));
    const gateKnown = Number.isFinite(Number(liveGate));
    const gateOn = gateKnown && Number(liveGate) > 0.5;
    const sustainT = Number.isFinite(joinT) ? Math.max(0, Math.min(1, joinT)) : 1;
    let sustainY = pts[0].y;
    let sustainD = 1e9;
    for (let i = 0; i < pts.length; i += 1) {
      const d = Math.abs(pts[i].t - sustainT);
      if (d < sustainD) {
        sustainD = d;
        sustainY = pts[i].y;
      }
    }
    const nearest = (tMin, tMax) => {
      let bestT = tMin;
      let bestD = 1e9;
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        if (p.t < tMin - 1e-4 || p.t > tMax + 1e-4) continue;
        const d = Math.abs(p.y - y);
        if (d < bestD) {
          bestD = d;
          bestT = p.t;
        }
      }
      return bestT;
    };
    if (gateOn && !section._envGateWas) section._envPlayT = 0;
    const prevT = Number.isFinite(section._envPlayT) ? section._envPlayT : 0;
    if (gateOn) {
      playT = Math.abs(y - sustainY) < 0.035
        ? sustainT
        : nearest(Math.min(prevT, sustainT), sustainT);
    } else if (gateKnown) {
      playT = nearest(Math.max(sustainT, prevT), 1);
    } else {
      playT = Math.abs(y - sustainY) < 0.035 ? sustainT : nearest(prevT, 1);
    }
    section._envPlayT = playT;
    section._envGateWas = gateOn;
  }
  if (Number.isFinite(playT) && pts.length) {
    let dot = pts[0];
    let bestD = 1e9;
    for (let i = 0; i < pts.length; i += 1) {
      const d = Math.abs(pts[i].t - playT);
      if (d < bestD) {
        bestD = d;
        dot = pts[i];
      }
    }
    const dx = dot.t * width;
    const dy = (1 - dot.y * ampView) * height;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(dx, dy, 3.5, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(180, 210, 220, 0.55)";
  context.font = "10px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(built.leftLabel || "A", 4, 12);
  context.textAlign = "right";
  context.fillText(built.rightLabel || "D", width - 4, 12);
}
