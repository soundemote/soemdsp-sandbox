// Arp face — neon-stroke piano keys for the current note set.
// Left = lowest arp note, right = highest. Only keys in the set are drawn.
// No glow: fill + stroke only. Corners / rounding / edge spacing match Music Player.

function nodeGraphArpPitchLabel(midi) {
  if (typeof sequencerPitchLabel === "function") return sequencerPitchLabel(midi);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const m = Math.max(0, Math.min(127, Math.round(Number(midi) || 0)));
  return `${names[m % 12]}${Math.floor(m / 12) - 2}`;
}

function nodeGraphArpKeysLookForNodeId(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (typeof nodeGraphArpKeysSettingsForNode === "function") {
    return nodeGraphArpKeysSettingsForNode(node);
  }
  if (typeof normalizeNodeGraphArpKeysSettings === "function") {
    return normalizeNodeGraphArpKeysSettings(node?.arpKeysSettings);
  }
  return {
    strokeColor: "#3dffd0",
    strokeBrightness: 0.5,
    fontColor: "#3dffd0",
    fontBrightness: 0.5,
    cornerShape: "squircle",
    cornerRadius: 0,
    edgeSpacing: 0.05,
  };
}

function nodeGraphArpAlign(x, dpr) {
  return Math.round(Number(x) * dpr) / dpr;
}

/** Layout CSS scale only. Workspace zoom must not enlarge backing or stroke. */
function nodeGraphArpCanvasScreenScale(_canvas) {
  return 1;
}

/**
 * Hairline in backing pixels when the bitmap is sized to the on-screen rect
 * (1 backing pixel ≈ 1 physical pixel after canvas-mode / zoom scale).
 */
function nodeGraphArpStrokeMetrics(dpr, screenScale) {
  const z = Number.isFinite(Number(screenScale)) && Number(screenScale) > 0 ? Number(screenScale) : 1;
  const dev = Math.max(1, Math.round(1 / z));
  return { css: dev / dpr, dev };
}

function nodeGraphArpSnapHair(x, dpr, devPx) {
  const odd = (devPx & 1) === 1;
  return (Math.round(Number(x) * dpr) + (odd ? 0.5 : 0)) / dpr;
}

/** Stroke centerlines fully inside [0, size] device pixels (fixes clipped right/bottom). */
function nodeGraphArpStrokeBoxDev(x0, x1, sizePx, dev) {
  const d = Math.max(1, dev | 0);
  let L = Math.round(Number(x0));
  let R = Math.round(Number(x1));
  if (R < L) {
    const t = L;
    L = R;
    R = t;
  }
  L = Math.max(0, Math.min(sizePx, L));
  R = Math.max(0, Math.min(sizePx, R));
  if (R - L < d) {
    R = Math.min(sizePx, L + d);
    L = Math.max(0, R - d);
  }
  return { c0: L + d * 0.5, c1: R - d * 0.5 };
}

function nodeGraphArpKeysAddCornerRectPath(ctx, x, y, w, h, radius, squircle) {
  const r = Math.max(0, Math.min(radius, w * 0.5, h * 0.5));
  if (!(w > 0) || !(h > 0)) {
    return;
  }
  if (r < 0.25) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (!squircle) {
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    return;
  }
  const n = 4;
  const steps = 8;
  const addCorner = (cx, cy, a0, a1) => {
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = a0 + (a1 - a0) * t;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const px = Math.sign(ca) * r * Math.pow(Math.abs(ca), 2 / n);
      const py = Math.sign(sa) * r * Math.pow(Math.abs(sa), 2 / n);
      ctx.lineTo(cx + px, cy + py);
    }
  };
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  addCorner(x + w - r, y + r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  addCorner(x + w - r, y + h - r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  addCorner(x + r, y + h - r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  addCorner(x + r, y + r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function createNodeGraphArpKeysDisplay(nodeId) {
  const section = document.createElement("div");
  section.className = "node-module-scope-window node-arp-keys-face";
  section.dataset.arpNode = nodeId;
  const canvas = document.createElement("canvas");
  canvas.className = "node-arp-keys-canvas";
  section.append(canvas);

  let lastSig = "";
  let layoutCache = null;
  let hitLayout = null;
  let freezePlay = -1;
  let pointerId = null;

  function faceState() {
    const bag = typeof nodeGraphMvp === "object" ? nodeGraphMvp._arpFaceByNode : null;
    const raw = bag && bag[nodeId];
    const notes = Array.isArray(raw?.notes) ? raw.notes.filter((m) => m >= 0 && m <= 127) : [];
    notes.sort((a, b) => a - b);
    const uniq = [];
    for (let i = 0; i < notes.length; i += 1) {
      if (uniq[uniq.length - 1] !== notes[i]) uniq.push(notes[i]);
    }
    const seqPlay = Number.isFinite(Number(raw?.play)) ? (raw.play | 0) : -1;
    const projectOn = typeof scopePaintIsEnginePlaying === "function"
      ? scopePaintIsEnginePlaying()
      : (typeof nodeGraphModuleScopeEnginePaused === "function"
        ? !nodeGraphModuleScopeEnginePaused()
        : true);
    const play = freezePlay >= 0 ? freezePlay : (projectOn ? seqPlay : -1);
    return { notes: uniq, play, projectOn };
  }

  function midiAtClientXY(clientX, clientY) {
    if (!hitLayout || !hitLayout.notes?.length) return -1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const spanX = Math.max(1, hitLayout.width || w);
    const spanY = Math.max(1, hitLayout.height || h);
    const x = ((clientX - rect.left) / w) * spanX;
    const y = ((clientY - rect.top) / h) * spanY;
    const { notes, xs, y0, y1 } = hitLayout;
    if (!(x >= xs[0] && x <= xs[xs.length - 1])) return -1;
    if (!(y >= y0 && y <= y1)) return -1;
    for (let i = 0; i < notes.length; i += 1) {
      if (x < xs[i + 1] || i === notes.length - 1) return notes[i];
    }
    return -1;
  }

  function sendOverride(midi) {
    if (typeof sendNodeGraphArpOverride === "function") {
      sendNodeGraphArpOverride(nodeId, midi);
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const midi = midiAtClientXY(event.clientX, event.clientY);
    if (midi < 0) return;
    pointerId = event.pointerId;
    freezePlay = midi;
    lastSig = "";
    try { canvas.setPointerCapture?.(event.pointerId); } catch (_e) { /* ignore */ }
    sendOverride(midi);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    if (pointerId == null || event.pointerId !== pointerId) return;
    const midi = midiAtClientXY(event.clientX, event.clientY);
    if (midi < 0 || midi === freezePlay) return;
    freezePlay = midi;
    lastSig = "";
    sendOverride(midi);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerUp(event) {
    if (pointerId == null || event.pointerId !== pointerId) return;
    pointerId = null;
    freezePlay = -1;
    lastSig = "";
    try { canvas.releasePointerCapture?.(event.pointerId); } catch (_e) { /* ignore */ }
    sendOverride(-1);
    event.preventDefault();
    event.stopPropagation();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  function paint() {
    const { notes, play, projectOn } = faceState();
    const look = nodeGraphArpKeysLookForNodeId(nodeId);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const screenScale = nodeGraphArpCanvasScreenScale(canvas);
    const bw = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
    const bh = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
    const lookSig = [
      look.strokeColor,
      look.strokeBrightness,
      look.fontColor,
      look.fontBrightness,
      look.cornerShape,
      look.cornerRadius,
      look.edgeSpacing,
    ].join(":");
    const sig = `${bw}x${bh}:${screenScale.toFixed(4)}:${play}:${projectOn ? 1 : 0}:${notes.join(",")}:${lookSig}`;
    if (sig === lastSig && canvas.width === bw && canvas.height === bh) return;
    lastSig = sig;
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      layoutCache = null;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    layoutCache = true;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, bw, bh);
    const strokeCss = typeof nodeGraphArpKeysHueCss === "function"
      ? nodeGraphArpKeysHueCss(look.strokeColor, look.strokeBrightness, 1, 165)
      : look.strokeColor;
    const fontCss = typeof nodeGraphArpKeysHueCss === "function"
      ? nodeGraphArpKeysHueCss(look.fontColor, look.fontBrightness, 1, 165)
      : look.fontColor;
    const faceMin = Math.min(bw, bh);
    const maxInset = Math.max(0, Math.floor(faceMin / 2));
    const inset = Math.round(look.edgeSpacing * maxInset);
    const x0 = inset;
    const y0 = inset;
    const x1 = Math.max(inset, bw - inset);
    const y1 = Math.max(inset, bh - inset);
    const innerW = Math.max(0, x1 - x0);
    const innerH = Math.max(0, y1 - y0);
    const squircle = look.cornerShape === "squircle";
    // Face-relative hairline: scales with canvas-tile size, not workspace zoom.
    // Divide by screenScale so graph zoom keeps on-screen thickness; quantize after.
    const strokeDev = Math.max(
      1,
      Math.round(Math.min(bw, bh) / (120 * Math.max(screenScale, 0.0001))),
    );
    const half = strokeDev * 0.5;
    const maxRadius = Math.max(0, Math.min(innerW, innerH) / 2);
    const radius = Math.round(look.cornerRadius * maxRadius);
    const xBox = nodeGraphArpStrokeBoxDev(x0, x1, bw, strokeDev);
    const yBox = nodeGraphArpStrokeBoxDev(y0, y1, bh, strokeDev);
    const left = xBox.c0;
    const right = xBox.c1;
    const top = yBox.c0;
    const bottom = yBox.c1;
    const boxW = Math.max(0, right - left);
    const boxH = Math.max(0, bottom - top);
    ctx.strokeStyle = strokeCss;
    ctx.lineWidth = strokeDev;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    if (!notes.length) {
      hitLayout = null;
      ctx.beginPath();
      nodeGraphArpKeysAddCornerRectPath(
        ctx,
        left,
        top,
        boxW,
        boxH,
        Math.max(0, radius - half),
        squircle,
      );
      ctx.stroke();
      return;
    }
    const n = notes.length;
    const xs = [];
    for (let i = 0; i <= n; i += 1) {
      xs.push(Math.round(x0 + (i * innerW) / n));
    }
    hitLayout = { notes, xs, y0, y1, width: bw, height: bh };
    ctx.save();
    ctx.beginPath();
    nodeGraphArpKeysAddCornerRectPath(ctx, x0, y0, innerW, innerH, radius, squircle);
    ctx.clip();
    for (let i = 0; i < n; i += 1) {
      const on = play === notes[i];
      ctx.fillStyle = on ? strokeCss : "#000000";
      ctx.fillRect(xs[i], y0, Math.max(0, xs[i + 1] - xs[i]), innerH);
    }
    const odd = (strokeDev & 1) === 1;
    for (let i = 1; i < n; i += 1) {
      const ax = xs[i] + (odd ? 0.5 : 0);
      ctx.beginPath();
      ctx.moveTo(ax, top);
      ctx.lineTo(ax, bottom);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    nodeGraphArpKeysAddCornerRectPath(
      ctx,
      left,
      top,
      boxW,
      boxH,
      Math.max(0, radius - half),
      squircle,
    );
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const cellTop = top + half;
    const cellBot = bottom - half;
    const cellMidY = (cellTop + cellBot) * 0.5;
    for (let i = 0; i < n; i += 1) {
      const midi = notes[i];
      const on = play === midi;
      const label = nodeGraphArpPitchLabel(midi);
      const cellW = Math.max(0, xs[i + 1] - xs[i]);
      const maxW = Math.max(4, cellW - strokeDev * 2);
      const cellH = Math.max(1, cellBot - cellTop);
      let fontPx = Math.max(4, Math.min(cellW * 0.52, cellH * 0.46));
      ctx.font = `${fontPx}px "Cascadia Mono", "Cascadia Code", Consolas, sans-serif`;
      let metrics = ctx.measureText(label);
      if (metrics.width > maxW && metrics.width > 0) {
        fontPx = Math.max(4, fontPx * (maxW / metrics.width));
        ctx.font = `${fontPx}px "Cascadia Mono", "Cascadia Code", Consolas, sans-serif`;
        metrics = ctx.measureText(label);
      }
      const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent
        : fontPx * 0.72;
      const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent
        : fontPx * 0.16;
      const baseline = cellMidY + (ascent - descent) * 0.5;
      ctx.fillStyle = on
        ? (look.strokeBrightness >= 0.4 ? "#000000" : "#ffffff")
        : fontCss;
      ctx.fillText(label, (xs[i] + xs[i + 1]) * 0.5, baseline, maxW);
    }
  }

  const ro = new ResizeObserver(() => {
    lastSig = "";
    layoutCache = null;
    paint();
  });
  ro.observe(section);
  requestAnimationFrame(function tick() {
    if (!section.isConnected) return;
    paint();
    requestAnimationFrame(tick);
  });
  return section;
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.arpKeysFace = () => {};
}
if (typeof registerNodeGraphModuleFaceCreator === "function") {
  registerNodeGraphModuleFaceCreator("arpKeysFace", createNodeGraphArpKeysDisplay);
}
