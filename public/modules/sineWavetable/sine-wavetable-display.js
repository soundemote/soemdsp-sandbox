// SinCos4 face — unit circle with mode-dependent phase lines (1…4).
// Lines rotate with live oscillator phase; A/B/C match jack RGB chrome.

function createNodeGraphSinCos4Display(nodeId, type = "sineWavetable") {
  const id = nodeId && typeof nodeId === "object"
    ? String(nodeId.dataset?.node || nodeId.id || "")
    : String(nodeId || "");
  const section = document.createElement("section");
  section.className = "node-filter-curve-display node-sincos4-display node-module-face";
  section.dataset.node = id;
  section.dataset.nodeType = String(type || "sineWavetable");
  section.dataset.parameterVisual = "true";
  section.dataset.lightSource = "screen";
  section.dataset.lightStrength = "0.66";
  const canvas = document.createElement("canvas");
  canvas.className = "node-filter-curve-canvas node-sincos4-canvas";
  canvas.dataset.lightSource = "screen";
  canvas.dataset.lightStrength = "0.66";
  section.append(canvas);
  nodeGraphInstallDrawingFacePump(section, {
    clockKey: (el) => `sinCos4:${el.dataset?.node || ""}`,
    forceKey: "_sinCos4ForceDraw",
    rafKey: "_sinCos4PlayheadRaf",
    paint: drawNodeGraphSinCos4Display,
    onResize: (el) => { el._sinCos4LaidOut = false; },
    paintOnCreate: false,
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawNodeGraphSinCos4Display(section);
      section._startFaceLoop?.();
    });
  });
  return section;
}

function nodeGraphSinCos4LiveParam(node, key, fallback = 0) {
  if (typeof nodeGraphFilterCurveLiveParam === "function") {
    return nodeGraphFilterCurveLiveParam(node, key, fallback);
  }
  const n = Number(node?.params?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

/** Mode → relative phase offsets in cycles (A at 0). */
function nodeGraphSinCos4PhaseOffsets(mode) {
  const m = Math.max(0, Math.min(5, Math.round(Number(mode) || 0)));
  if (m === 0) return [0];
  if (m === 1) return [0.25];
  if (m === 2) return [0, 0.25];
  if (m === 3) return [0, 0.5];
  if (m === 4) return [0, 1 / 3, 2 / 3];
  return [0, 0.25, 0.5, 0.75];
}

function nodeGraphSinCos4LineColors(count) {
  const rgb = [
    "rgba(255, 90, 90, 0.95)",
    "rgba(90, 220, 120, 0.95)",
    "rgba(90, 160, 255, 0.95)",
    "rgba(240, 210, 120, 0.95)",
  ];
  return rgb.slice(0, Math.max(0, count));
}

function nodeGraphSinCos4Wrap01(v) {
  const n = Number(v) || 0;
  return n - Math.floor(n);
}

function nodeGraphSinCos4ReadPhase(nodeId, node, section) {
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "__Phase", Number.NaN));
    if (Number.isFinite(live)) {
      return nodeGraphSinCos4Wrap01(live);
    }
    // Derive from A/B when quadrature is present.
    const mode = Math.round(nodeGraphSinCos4LiveParam(node, "mode", 2));
    const a = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "A", Number.NaN));
    const b = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "B", Number.NaN));
    if ((mode === 2 || mode === 5) && Number.isFinite(a) && Number.isFinite(b)) {
      return nodeGraphSinCos4Wrap01(Math.atan2(a, b) / (Math.PI * 2));
    }
    if (mode === 4 && Number.isFinite(a) && Number.isFinite(b)) {
      const cos = (b + 0.5 * a) / (Math.sqrt(3) * 0.5);
      return nodeGraphSinCos4Wrap01(Math.atan2(a, cos) / (Math.PI * 2));
    }
  }
  // Local clock fallback (matches BasicShape when __Phase is cold).
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const freq = Number(nodeGraphSinCos4LiveParam(node, "freq", 100)) || 0;
  const offset = Number(nodeGraphSinCos4LiveParam(node, "phase", 0)) || 0;
  const speed = Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedMultiplier : 1);
  const mul = Number.isFinite(speed) ? speed : 1;
  if (section && Number.isFinite(section._sinCos4Clock)) {
    const dt = Math.max(0, Math.min(0.25, now - section._sinCos4Clock));
    let next = (Number(section._sinCos4Phase) || 0) + freq * dt * mul;
    next = nodeGraphSinCos4Wrap01(next);
    section._sinCos4Phase = next;
    section._sinCos4Clock = now;
    return nodeGraphSinCos4Wrap01(next + offset);
  }
  if (section) {
    section._sinCos4Clock = now;
    section._sinCos4Phase = 0;
  }
  return nodeGraphSinCos4Wrap01(offset);
}

function drawNodeGraphSinCos4Display(section) {
  try {
    drawNodeGraphSinCos4DisplayInner(section);
  } catch (error) {
    console.warn("[sincos4] draw failed", error?.message || error);
    if (section) {
      section._sinCos4ForceDraw = true;
      section._sinCos4LaidOut = false;
    }
  }
}

function drawNodeGraphSinCos4DisplayInner(section) {
  const nodeId = section?.dataset?.node
    || section?.closest?.(".dsp-node")?.dataset?.node
    || "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const canvas = section?.querySelector?.(".node-sincos4-canvas")
    || section?.querySelector?.("canvas");
  if (!node || !canvas) {
    return;
  }

  let rawW = Number(section.clientWidth || section.offsetWidth) || 0;
  let rawH = Number(section.clientHeight || section.offsetHeight) || 0;
  if (rawW < 8 || rawH < 8) {
    const stage = section.closest?.("#nodeScreenSoloStage");
    if (stage) {
      rawW = Math.max(rawW, stage.clientWidth || 0);
      rawH = Math.max(rawH, stage.clientHeight || 0);
    }
  }
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.max(1, Math.round(rawW * dpr));
  const h = Math.max(1, Math.round(rawH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    section._sinCos4LaidOut = false;
  }
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const mode = Math.max(0, Math.min(5, Math.round(nodeGraphSinCos4LiveParam(node, "mode", 2))));
  const offsets = nodeGraphSinCos4PhaseOffsets(mode);
  const colors = nodeGraphSinCos4LineColors(offsets.length);
  const phase = nodeGraphSinCos4ReadPhase(nodeId, node, section);

  const bg = "#05060a";
  if (typeof nodeGraphFacePlateFillCanvas === "function") {
    nodeGraphFacePlateFillCanvas(ctx, canvas, bg);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  const cx = w * 0.5;
  const cy = h * 0.5;
  // Face geometry ignores Amplitude — amp still drives the audio outs only.
  const radius = Math.max(8, Math.min(w, h) * 0.38);
  const stroke = Math.max(1, Math.min(w, h) * 0.012);

  // Unit circle only (no crosshair).
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(160, 190, 210, 0.35)";
  ctx.lineWidth = stroke;
  ctx.stroke();

  // Phase lines (A/B/C/D)
  for (let i = 0; i < offsets.length; i += 1) {
    const ang = (phase + offsets[i]) * Math.PI * 2;
    // cos→X, sin→Y (math), canvas Y flips
    const x = cx + Math.cos(ang) * radius;
    const y = cy - Math.sin(ang) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = colors[i] || "rgba(240, 210, 120, 0.95)";
    ctx.lineWidth = stroke * (i === 0 ? 1.35 : 1);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, stroke * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = colors[i] || "rgba(240, 210, 120, 0.95)";
    ctx.fill();
  }

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, stroke * 1.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(220, 230, 240, 0.85)";
  ctx.fill();

  if (section.dataset) {
    section.dataset.lightStrength = "0.85";
  }
  section._sinCos4LaidOut = true;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.sinCos4Face = () => {};
}
