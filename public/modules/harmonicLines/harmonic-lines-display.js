// Harmonic lines face for Additive Out —
// X = log freq (shared Additive axis), color = phase, vertical center = balance:
//   above center = Left amp, below center = Right amp (from pan[]).
// WhiteNoise recipes (*Noise) animate locally each frame (display-only streams).

function createNodeGraphHarmonicLinesDisplay(nodeId, type = "additiveOut") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-harmonic-lines-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "additiveOut");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.7";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  const canvas = document.createElement("canvas");
  canvas.className = "node-harmonic-lines-canvas";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `harmonicLines:${el.dataset?.node || ""}`,
    paint: drawNodeGraphHarmonicLinesDisplay,
  });
  return section;
}

function nodeGraphHarmonicLinesReadGraph(nodeId) {
  if (typeof readNodeGraphDataInput === "function") {
    const g = readNodeGraphDataInput(nodeId, "Graph");
    if (g?.ratio) return g;
  }
  if (typeof nodeGraphDataBus !== "undefined") {
    const view = nodeGraphDataBus.get?.(`${nodeId}.GraphView`);
    if (view?.ratio) return view;
    const out = nodeGraphDataBus.get?.(`${nodeId}.Graph`);
    if (out?.ratio) return out;
  }
  return null;
}

/** Display-only walks for WhiteNoise face animation (does not touch audio state). */
function nodeGraphHarmonicLinesDisplayWalks(section, key, H, salt, seed) {
  if (!section._noiseVis) section._noiseVis = Object.create(null);
  const slot = section._noiseVis;
  const s0 = (Math.floor(Number(seed)) || 0) >>> 0;
  const family = (Math.floor(Number(salt)) || 0) >>> 0;
  let pack = slot[key];
  if (
    !pack
    || pack.seed !== s0
    || pack.salt !== family
    || !Array.isArray(pack.walks)
    || pack.walks.length !== H
  ) {
    const walks = typeof additiveGraphEnsureWalks === "function"
      ? additiveGraphEnsureWalks(null, H, family, s0)
      : [];
    pack = { seed: s0, salt: family, walks };
    slot[key] = pack;
  }
  return pack.walks;
}

function drawNodeGraphHarmonicLinesDisplay(section) {
  if (!section) return;
  const canvas = section.querySelector("canvas");
  if (!canvas) return;

  let ctx;
  let w;
  let h;
  let pixelRatio = 1;
  if (typeof nodeGraphSizeDisplayCanvas === "function") {
    const metrics = nodeGraphSizeDisplayCanvas(section, canvas, { pixelDensity: 1 });
    if (!metrics) return;
    ctx = metrics.context;
    w = metrics.cssWidth;
    h = metrics.cssHeight;
    pixelRatio = metrics.pixelRatio || 1;
  } else {
    const rawW = Number(section.clientWidth || section.offsetWidth) || 0;
    const rawH = Number(section.clientHeight || section.offsetHeight) || 0;
    if (rawW < 8 || rawH < 8) return;
    const dpr = window.devicePixelRatio || 1;
    w = Math.max(1, Math.floor(rawW));
    h = Math.max(1, Math.floor(rawH));
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx = canvas.getContext("2d");
    pixelRatio = dpr;
  }
  if (!ctx || w < 8 || h < 8) return;

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, 0, w, h);

  const nodeId = section.dataset.node;
  const graph = nodeGraphHarmonicLinesReadGraph(nodeId);
  if (!graph || !graph.ratio || !graph.ratio.length) {
    ctx.fillStyle = "#666";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("no Graph", w * 0.5, h * 0.5);
    section._forceDraw = false;
    return;
  }

  const H = Math.max(1, graph.ratio.length | 0);
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  let freqHz = Number(graph.frequencyHz ?? node?.params?.frequency ?? node?.parameters?.frequency);
  if (!Number.isFinite(freqHz)) freqHz = 100;
  const sr = Number(nodeGraphMvp?.sampleRate) || Number(nodeGraphMvp?.live?.sampleRate) || 44100;

  const axis = typeof additiveGraphDisplayFreqAxis === "function"
    ? additiveGraphDisplayFreqAxis(sr)
    : null;
  const xMinHz = axis?.xMinHz ?? 20;
  const xMaxHz = axis?.xMaxHz ?? 20000;
  const logXMin = axis?.logXMin ?? Math.log(xMinHz);
  const logXSpan = axis?.logXSpan ?? Math.log(xMaxHz) - logXMin;

  const ratioNoise = graph.ratioNoise && Number(graph.ratioNoise.mode) === 2
    ? graph.ratioNoise
    : null;
  const phaseNoise = graph.phaseNoise && Number(graph.phaseNoise.mode) === 2
    ? graph.phaseNoise
    : null;
  const panNoise = graph.panNoise && Number(graph.panNoise.mode) === 2
    ? graph.panNoise
    : null;
  const ampNoise = graph.ampNoise && Number(graph.ampNoise.mode) === 2
    ? graph.ampNoise
    : null;

  const ratioWalks = ratioNoise
    ? nodeGraphHarmonicLinesDisplayWalks(section, "ratio", H, 13, ratioNoise.seed)
    : null;
  const phaseWalks = phaseNoise
    ? nodeGraphHarmonicLinesDisplayWalks(section, "phase", H, 29, phaseNoise.seed)
    : null;
  const panWalks = panNoise
    ? nodeGraphHarmonicLinesDisplayWalks(section, "pan", H, 47, panNoise.seed)
    : null;
  const ampWalks = ampNoise
    ? nodeGraphHarmonicLinesDisplayWalks(section, "amp", H, 61, ampNoise.seed)
    : null;

  const ampFloorDb = -60;
  let maxAmp = 1e-6;
  const effectiveAmp = new Float32Array(H);
  const leftAmp = new Float32Array(H);
  const rightAmp = new Float32Array(H);
  const hzAt = new Float32Array(H);
  const phaseAt = new Float32Array(H);
  const hasPan = (graph.pan && graph.pan.length >= H) || Boolean(panNoise);

  for (let i = 0; i < H; i += 1) {
    let ratio = Number(graph.ratio[i]) || 0;
    if (ratioWalks && typeof cheapWhiteNoiseStep === "function") {
      const w = cheapWhiteNoiseStep(ratioWalks[i]);
      const add = Number(ratioNoise.amount) || 0;
      ratio = Math.max(0, ratio + w * add);
    }
    const hz = ratio * freqHz;
    hzAt[i] = hz;

    let amp = Math.abs(graph.amplitude[i] || 0);
    if (ampWalks && typeof cheapWhiteNoiseStep === "function") {
      const w = cheapWhiteNoiseStep(ampWalks[i]);
      const add = Number(ampNoise.amount) || 0;
      amp = Math.max(0, Math.min(1, amp + w * add));
    }
    const nyqGain = typeof additiveGraphNyquistAmpGain === "function"
      ? additiveGraphNyquistAmpGain(hz, sr)
      : 1;
    const a = amp * nyqGain;
    effectiveAmp[i] = a;

    // Color = Graph phase offsets (+ NoisyPhase WhiteNoise preview), not free-running phaseAcc.
    let phase = typeof additiveGraphEffectivePhase === "function"
      ? additiveGraphEffectivePhase(graph, i, 0, 1)
      : (Number(graph.phase[i]) || 0);
    if (phaseWalks && typeof cheapWhiteNoiseStep === "function") {
      const w = cheapWhiteNoiseStep(phaseWalks[i]);
      const add = Number(phaseNoise.amount) || 0;
      phase = typeof additiveGraphWrap01 === "function"
        ? additiveGraphWrap01(phase + w * add)
        : phase + w * add;
    }
    phaseAt[i] = typeof additiveGraphWrap01 === "function"
      ? additiveGraphWrap01(phase)
      : phase;

    let pan = hasPan
      ? (typeof additiveGraphEffectivePan === "function"
        ? additiveGraphEffectivePan(graph, i, 0, 1)
        : (Number(graph.pan?.[i]) || 0))
      : 0;
    if (panWalks && typeof cheapWhiteNoiseStep === "function") {
      const w = cheapWhiteNoiseStep(panWalks[i]);
      const add = Number(panNoise.amount) || 0;
      pan = Math.max(-1, Math.min(1, pan + w * add));
    }
    pan = Math.max(-1, Math.min(1, pan));
    const gains = typeof additiveGraphPanGains === "function"
      ? additiveGraphPanGains(pan)
      : { left: 0.5 * (1 - pan), right: 0.5 * (1 + pan) };
    leftAmp[i] = a * gains.left * 2;
    rightAmp[i] = a * gains.right * 2;
    if (leftAmp[i] > maxAmp) maxAmp = leftAmp[i];
    if (rightAmp[i] > maxAmp) maxAmp = rightAmp[i];
  }

  const midY = h * 0.5;
  const maxH = h * 0.46;
  const pad = Math.max(2, w * 0.02);
  const span = Math.max(1, w - pad * 2);
  const lineW = Math.max(1, Math.min(4, span / Math.max(48, H * 1.1)));

  // Dim mid line — Left above, Right below.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, midY);
  ctx.lineTo(pad + span, midY);
  ctx.stroke();

  const ampToHeight = (amp) => {
    if (!(amp > 0) || !(maxAmp > 0)) return 0;
    const db = 20 * Math.log10(Math.max(1e-12, amp / maxAmp));
    const ampT = Math.max(0, Math.min(1, (db - ampFloorDb) / -ampFloorDb));
    return ampT * maxH;
  };

  for (let i = 0; i < H; i += 1) {
    const hz = hzAt[i];
    if (!(hz > 0) || !(effectiveAmp[i] > 0)) continue;
    const clampedHz = Math.max(xMinHz, Math.min(xMaxHz, hz));
    const t = (Math.log(clampedHz) - logXMin) / logXSpan;
    const x = pad + Math.max(0, Math.min(1, t)) * span;
    const leftH = ampToHeight(leftAmp[i]);
    const rightH = ampToHeight(rightAmp[i]);
    if (!(leftH > 0.5) && !(rightH > 0.5)) continue;

    const phase01 = phaseAt[i];
    const col = typeof additiveGraphPhaseColor === "function"
      ? additiveGraphPhaseColor(phase01)
      : { r: 224, g: 64, b: 251 };
    ctx.strokeStyle = `rgb(${col.r},${col.g},${col.b})`;
    ctx.lineWidth = lineW;
    if (leftH > 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, midY - leftH);
      ctx.stroke();
    }
    if (rightH > 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, midY + rightH);
      ctx.stroke();
    }
  }
  section._forceDraw = false;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.harmonicLines = () => {};
}
