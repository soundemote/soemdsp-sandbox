// PhosphorLight — dedicated X/Y oscilloscope on the shared 0–1 energy + LUT
// path (node-graph-phosphor-energy-gl.js). Testbed for migrating all phosphor
// scopes off RGB retained burn once this feels right.
//
// displayType: "phosphorLight"
// Each frame: fade energy → soft-deposit XY path mask → present LUT trails →
// hard background + optional beam tip.

const nodeGraphPhosphorLightSettingsDefaults = Object.freeze({
  background: "#020608",
  brightness: 0.85,
  burn: 0.55,
  color: "#75ebff",
  decay: 0.22,
  scale: 1,
  lineThickness: 0.12,
});

function normalizeNodeGraphPhosphorLightSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphPhosphorLightSettingsDefaults;
  const clamp01 = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return fallback;
    }
    return Math.max(0, Math.min(1, n));
  };
  const clampPos = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return fallback;
    }
    return Math.max(0, n);
  };
  const color = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor
    : (value, fallback) => {
      const c = String(value || "").trim();
      return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
    };
  return {
    background: color(source.background ?? source.backgroundColor, defaults.background),
    brightness: Math.max(0, Math.min(2, Number(source.brightness ?? source.dot1Brightness) || defaults.brightness)),
    burn: clamp01(source.burn, defaults.burn),
    color: color(source.color ?? source.dot1Color, defaults.color),
    decay: clamp01(source.decay, defaults.decay),
    scale: clampPos(source.scale, defaults.scale),
    lineThickness: clamp01(source.lineThickness ?? source.dot1Size, defaults.lineThickness),
  };
}

function nodeGraphPhosphorLightSettingsForNode(node) {
  return normalizeNodeGraphPhosphorLightSettings(node?.traceDisplaySettings);
}

// Expose normalize for scopes.js assign/clone plumbing.
if (typeof window !== "undefined") {
  window.normalizeNodeGraphPhosphorLightSettings = normalizeNodeGraphPhosphorLightSettings;
  window.nodeGraphPhosphorLightSettingsDefaults = nodeGraphPhosphorLightSettingsDefaults;
}

function nodeGraphPhosphorLightFaceCanvas(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) {
    return null;
  }
  let canvas = screenElement.querySelector(":scope > .node-phosphor-light-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-phosphor-light-canvas";
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}

function syncNodeGraphPhosphorLightFaceCanvas(canvas, screenElement, pixelRatio) {
  if (!canvas || !screenElement) {
    return false;
  }
  // Match transport / number readout: buffer from zoomed rect × backing ratio.
  const rect = screenElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * Math.max(0.25, Number(pixelRatio) || 1)));
  const height = Math.max(1, Math.round(rect.height * Math.max(0.25, Number(pixelRatio) || 1)));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    canvas._phosphorLightMask = null;
    if (canvas._phosphorEnergyGl && typeof nodeGraphPhosphorEnergyGlDestroy === "function") {
      nodeGraphPhosphorEnergyGlDestroy(canvas._phosphorEnergyGl);
      canvas._phosphorEnergyGl = null;
    }
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return true;
}

function nodeGraphPhosphorLightMaskCanvas(face) {
  if (!face?.width || !face?.height) {
    return null;
  }
  let mask = face._phosphorLightMask;
  if (!mask || mask.width !== face.width || mask.height !== face.height) {
    mask = document.createElement("canvas");
    mask.width = face.width;
    mask.height = face.height;
    face._phosphorLightMask = mask;
  }
  return mask;
}

function nodeGraphPhosphorLightSquare(width, height) {
  const size = Math.max(1, Math.min(width, height));
  return {
    left: (width - size) * 0.5,
    top: (height - size) * 0.5,
    width: size,
    height: size,
  };
}

function nodeGraphPhosphorLightPointFromSamples(square, x, y, scale) {
  const sx = Number(x);
  const sy = Number(y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    return null;
  }
  const s = Math.max(0, Number(scale) || 1);
  return {
    x: square.left + square.width * 0.5 + sx * s * square.width * 0.5,
    y: square.top + square.height * 0.5 - sy * s * square.height * 0.5,
  };
}

function nodeGraphPhosphorLightBuildPath(buffer, square, settings, maxPoints = 2048) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count) {
    return [];
  }
  const start = Math.max(0, count - maxPoints);
  const points = [];
  let previous = null;
  for (let i = start; i < count; i += 1) {
    const point = nodeGraphPhosphorLightPointFromSamples(square, buffer.x[i], buffer.y[i], settings.scale);
    if (!point) {
      previous = null;
      points.push(null);
      continue;
    }
    // Light interpolate long jumps so soft strokes don't skip.
    if (previous) {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1.5, Math.min(square.width, square.height) * 0.008);
      if (dist > step * 2) {
        const segs = Math.min(24, Math.floor(dist / step));
        for (let s = 1; s < segs; s += 1) {
          const t = s / segs;
          points.push({
            x: previous.x + dx * t,
            y: previous.y + dy * t,
          });
        }
      }
    }
    points.push(point);
    previous = point;
  }
  return points;
}

function nodeGraphPhosphorLightStrokeMask(maskCtx, points, lineWidth, softnessPx) {
  if (!maskCtx || !points?.length) {
    return;
  }
  maskCtx.save();
  maskCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskCtx.clearRect(0, 0, maskCtx.canvas.width, maskCtx.canvas.height);
  maskCtx.globalCompositeOperation = "lighter";
  maskCtx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  maskCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  maskCtx.lineWidth = Math.max(1, lineWidth);
  maskCtx.shadowColor = "rgba(255, 255, 255, 0.9)";
  maskCtx.shadowBlur = Math.max(0.75, Number(softnessPx) || 1);
  maskCtx.beginPath();
  let open = false;
  for (const point of points) {
    if (!point) {
      open = false;
      continue;
    }
    if (!open) {
      maskCtx.moveTo(point.x, point.y);
      open = true;
    } else {
      maskCtx.lineTo(point.x, point.y);
    }
  }
  maskCtx.stroke();
  // Beam tip glow.
  const last = [...points].reverse().find(Boolean);
  if (last) {
    const r = Math.max(1.2, lineWidth * 0.65);
    maskCtx.beginPath();
    maskCtx.arc(last.x, last.y, r, 0, Math.PI * 2);
    maskCtx.fill();
  }
  maskCtx.restore();
}

function drawNodeGraphPhosphorLightItem(renderer, item, pixelRatio) {
  const slot = item?.slot;
  const buffer = item?.buffer;
  if (!slot || !buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length) {
    return;
  }
  if (typeof renderNodeGraphModuleScopeAnalyzer === "function") {
    renderNodeGraphModuleScopeAnalyzer(slot, buffer);
  }
  const screenElement = item?.screenElement || slot?.scopeElement;
  const canvas = nodeGraphPhosphorLightFaceCanvas(slot);
  if (!canvas || !syncNodeGraphPhosphorLightFaceCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null;
  const settings = nodeGraphPhosphorLightSettingsForNode(node);
  const width = canvas.width;
  const height = canvas.height;
  const square = nodeGraphPhosphorLightSquare(width, height);
  const points = nodeGraphPhosphorLightBuildPath(buffer, square, settings);
  if (!points.some(Boolean)) {
    return;
  }

  const rgb = typeof nodeGraphScopeRgbFloatsToCanvasRgb === "function"
    && typeof nodeGraphScopeHexColorToRgb === "function"
    ? nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(settings.color))
    : [117, 235, 255];
  const bg = settings.background || "#020608";
  const brightness = Math.max(0.05, Math.min(2, Number(settings.brightness) || 0.85));
  const burn = Math.max(0, Math.min(1, Number(settings.burn) || 0));
  const decay = Math.max(0, Math.min(1, Number(settings.decay) || 0));
  const lineWidth = Math.max(
    1,
    Math.min(width, height) * (0.004 + Math.max(0, Math.min(1, settings.lineThickness)) * 0.04),
  );
  const softnessPx = typeof nodeGraphPhosphorEnergyGlSoftnessPx === "function"
    ? nodeGraphPhosphorEnergyGlSoftnessPx(lineWidth * 4, burn)
    : Math.max(1.25, lineWidth * (1.2 + burn * 2));

  // Continuous beam: every frame fade + soft deposit of this frame's path.
  // Gain stays low so decay remains visible (unlike readout's one-shot pulses).
  const mask = nodeGraphPhosphorLightMaskCanvas(canvas);
  if (mask) {
    const mctx = mask.getContext("2d");
    if (mctx) {
      nodeGraphPhosphorLightStrokeMask(mctx, points, lineWidth, softnessPx);
    }
  }
  const energyGl = typeof nodeGraphPhosphorEnergyGlEnsure === "function"
    ? nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl")
    : null;
  if (energyGl && typeof nodeGraphPhosphorEnergyGlStep === "function") {
    if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
      nodeGraphPhosphorEnergyGlSetLutFromPeak(energyGl, rgb, bg);
    }
    // Continuous deposit gain: scales with burn/brightness; stays under clip.
    const depositGain = Math.max(0.015, Math.min(0.28, (0.02 + burn * 0.12) * brightness));
    nodeGraphPhosphorEnergyGlStep(energyGl, {
      decay,
      depositGain: mask ? depositGain : 0,
      maskCanvas: mask,
    });
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  if (energyGl && typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    nodeGraphPhosphorEnergyGlPresent(energyGl, 0.9);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.imageSmoothingEnabled = true;
    context.drawImage(energyGl.canvas, 0, 0, width, height);
    context.restore();
  }

  // Dim hard tip so the beam head stays readable without RGB burn.
  const tip = [...points].reverse().find(Boolean);
  if (tip) {
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, 0.35 + brightness * 0.35).toFixed(3)})`;
    context.beginPath();
    context.arc(tip.x, tip.y, Math.max(1.2, lineWidth * 0.55), 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

// Register with the scope custom-renderer table (same pattern as videoscope).
if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.phosphorLight = drawNodeGraphPhosphorLightItem;
}
