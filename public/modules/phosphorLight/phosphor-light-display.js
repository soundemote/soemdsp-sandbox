// PhosphorLight — XY scope testbed for energy+LUT phosphor.
//
// Inspired by woscope (https://m1el.github.io/woscope-how/) and
// soundemote.io/phosphor — not a port of either:
//
//   • Beam deposits light energy (0–1), not colored RGB strokes
//   • Soft true-gaussian kernel texture stamps (node-graph-phosphor-gaussian-drawer)
//   • Fixed face pixel grid → fixed radius → kernels stay cached under zoom
//   • Screen: energy *= keep (decay) + newHits * intensity (burn)
//   • Present: energy → color via LUT

const nodeGraphPhosphorLightSettingsDefaults = Object.freeze({
  background: "#020608",
  brightness: 0.9,
  burn: 0.55,
  color: "#75ebff",
  decay: 0.18,
  scale: 1,
  // Beam radius (softness), not a hard stroke width.
  lineThickness: 0.14,
  // 1 = full layout×dpr grid; lower = chunkier fixed grid (cheaper burn).
  pixelDensity: 1,
});

function normalizeNodeGraphPhosphorLightSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = nodeGraphPhosphorLightSettingsDefaults;
  const clamp01 = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  };
  const clampPos = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
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
    // Keep a floor so the face never collapses to a 1×1 stamp.
    pixelDensity: Math.max(0.05, clamp01(source.pixelDensity, defaults.pixelDensity)),
  };
}

function nodeGraphPhosphorLightSettingsForNode(node) {
  return normalizeNodeGraphPhosphorLightSettings(node?.traceDisplaySettings);
}

if (typeof window !== "undefined") {
  window.normalizeNodeGraphPhosphorLightSettings = normalizeNodeGraphPhosphorLightSettings;
  window.nodeGraphPhosphorLightSettingsDefaults = nodeGraphPhosphorLightSettingsDefaults;
}

function nodeGraphPhosphorLightFaceCanvas(slot) {
  const screenElement = slot?.scopeElement;
  if (!screenElement) return null;
  let canvas = screenElement.querySelector(":scope > .node-phosphor-light-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "node-phosphor-light-canvas";
    canvas.setAttribute("aria-hidden", "true");
    screenElement.appendChild(canvas);
  }
  return canvas;
}

/**
 * pixelDensity 0.05–1 scales the fixed layout grid (not workspace zoom).
 * 1 = full clientWidth×dpr; 0.25 = quarter linear resolution (16× fewer pixels).
 */
function nodeGraphPhosphorLightApplyPixelDensity(size, pixelDensity) {
  if (!size) {
    return null;
  }
  const density = Math.max(0.05, Math.min(1, Number(pixelDensity) || 1));
  const width = Math.max(1, Math.round(size.width * density));
  const height = Math.max(1, Math.round(size.height * density));
  return {
    ...size,
    density,
    height,
    pixelRatio: (Number(size.pixelRatio) || 1) * density,
    width,
  };
}

function syncNodeGraphPhosphorLightFaceCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  if (!canvas || !screenElement) return false;
  // Fixed layout pixel grid (same as nodeGraphSizeDisplayCanvas / scope2d burn):
  // clientWidth × dpr × pixelDensity. Zoom must not grow energy FBOs — CSS
  // scales the bitmap; lower density intentionally looks blocky.
  const fullSize = typeof nodeGraphModuleScopeFaceBackingSize === "function"
    ? nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio)
    : null;
  let sized;
  if (fullSize) {
    sized = nodeGraphPhosphorLightApplyPixelDensity(fullSize, pixelDensity);
  } else {
    // Fallback if scopes helper not loaded yet: still avoid screen-space rect.
    const zoom = Math.max(0.01, Number(window.nodeGraphMvp?.zoom) || 1);
    const rect = screenElement.getBoundingClientRect();
    const cssW = Math.max(1, screenElement.clientWidth || screenElement.offsetWidth || rect.width / zoom);
    const cssH = Math.max(1, screenElement.clientHeight || screenElement.offsetHeight || rect.height / zoom);
    const dpr = Math.min(
      Math.max(0.25, Number(pixelRatio) || 1),
      Number(window.devicePixelRatio) || 1,
    );
    sized = nodeGraphPhosphorLightApplyPixelDensity(
      { width: Math.max(1, Math.round(cssW * dpr)), height: Math.max(1, Math.round(cssH * dpr)), pixelRatio: dpr },
      pixelDensity,
    );
  }
  if (!sized) {
    return false;
  }
  const { width, height, density } = sized;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    // One-frame deposit mask only — safe to drop. Energy residual is kept on
    // real face resizes via energy-gl resize+copy (not on workspace zoom,
    // which no longer changes the buffer size).
    canvas._phosphorLightMask = null;
    // Keep _phosphorLightLastSample so we only deposit new buffer samples
    // after a true face resize (re-stamping the whole tail would flash).
  }
  // Always nearest-neighbor when density is reduced; otherwise leave CSS zoom rule.
  if (density < 0.999) {
    canvas.style.imageRendering = "pixelated";
  } else if (canvas.style.imageRendering) {
    canvas.style.imageRendering = "";
  }
  if (canvas.style.width || canvas.style.height) {
    canvas.style.width = "";
    canvas.style.height = "";
  }
  return true;
}

function nodeGraphPhosphorLightMaskCanvas(face) {
  if (!face?.width || !face?.height) return null;
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

function nodeGraphPhosphorLightMapSample(square, x, y, scale) {
  const sx = Number(x);
  const sy = Number(y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const s = Math.max(0, Number(scale) || 1);
  return {
    x: square.left + square.width * 0.5 + sx * s * square.width * 0.5,
    y: square.top + square.height * 0.5 - sy * s * square.height * 0.5,
  };
}

/**
 * Deposit only new samples since last frame as a soft beam path.
 * Uses a baked true-gaussian kernel texture (fixed pixel grid → fixed radius
 * cache). Intensity ~ 1/speed (dwell): slow motion burns brighter.
 */
function nodeGraphPhosphorLightDepositBeam(maskCtx, buffer, square, settings, lastIndex) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count || !maskCtx) return count;

  const w = maskCtx.canvas.width;
  const h = maskCtx.canvas.height;
  maskCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskCtx.clearRect(0, 0, w, h);
  maskCtx.globalCompositeOperation = "lighter";

  const size = Math.min(w, h);
  const radius = typeof nodeGraphPhosphorGaussianRadiusFromThickness === "function"
    ? nodeGraphPhosphorGaussianRadiusFromThickness(size, settings.lineThickness)
    : Math.max(1.25, size * (0.006 + Math.max(0, Math.min(1, settings.lineThickness)) * 0.028));
  const stampDot = typeof nodeGraphPhosphorGaussianStamp === "function"
    ? nodeGraphPhosphorGaussianStamp
    : null;
  const stampSeg = typeof nodeGraphPhosphorGaussianSegment === "function"
    ? nodeGraphPhosphorGaussianSegment
    : null;
  if (!stampDot) {
    return count;
  }

  const brightness = Math.max(0.05, Math.min(2, Number(settings.brightness) || 0.9));
  // Base hit intensity; dwell scales up, fast motion dims (beam spends less time).
  const baseHit = Math.max(0.04, Math.min(0.55, 0.08 + brightness * 0.22));
  // Spacing for dwell estimate: match gaussian segment step (~0.4σ, σ≈r/2.6).
  const stepPx = Math.max(0.65, radius / 2.6 * 0.42);

  let start = Math.max(0, Math.floor(Number(lastIndex) || 0));
  if (start >= count) start = 0; // buffer wrapped / reset
  // First frame or large rewind: stamp a short tail so something appears.
  if (start === 0 && count > 1) {
    start = Math.max(0, count - Math.min(count, 512));
  }

  let prev = start > 0
    ? nodeGraphPhosphorLightMapSample(square, buffer.x[start - 1], buffer.y[start - 1], settings.scale)
    : null;

  for (let i = start; i < count; i += 1) {
    const cur = nodeGraphPhosphorLightMapSample(square, buffer.x[i], buffer.y[i], settings.scale);
    if (!cur) {
      prev = null;
      continue;
    }
    if (!prev) {
      stampDot(maskCtx, cur.x, cur.y, radius, baseHit);
      prev = cur;
      continue;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dist = Math.hypot(dx, dy);
    // Dwell: slow segments deposit more energy per pixel (CRT beam model).
    const dwell = dist < 1e-4 ? 2.2 : Math.min(2.2, Math.max(0.25, stepPx / dist));
    const hit = baseHit * dwell;
    if (stampSeg && dist > stepPx * 0.5) {
      stampSeg(maskCtx, prev.x, prev.y, cur.x, cur.y, radius, hit);
    } else {
      stampDot(maskCtx, cur.x, cur.y, radius, hit);
    }
    prev = cur;
  }
  return count;
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
  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : null;
  const settings = nodeGraphPhosphorLightSettingsForNode(node);
  const canvas = nodeGraphPhosphorLightFaceCanvas(slot);
  if (!canvas || !syncNodeGraphPhosphorLightFaceCanvas(
    canvas,
    screenElement,
    pixelRatio,
    settings.pixelDensity,
  )) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const square = nodeGraphPhosphorLightSquare(width, height);
  const rgb = typeof nodeGraphScopeRgbFloatsToCanvasRgb === "function"
    && typeof nodeGraphScopeHexColorToRgb === "function"
    ? nodeGraphScopeRgbFloatsToCanvasRgb(nodeGraphScopeHexColorToRgb(settings.color))
    : [117, 235, 255];
  const bg = settings.background || "#020608";
  const burn = Math.max(0, Math.min(1, Number(settings.burn) || 0));
  const decay = Math.max(0, Math.min(1, Number(settings.decay) || 0));
  const brightness = Math.max(0.05, Math.min(2, Number(settings.brightness) || 0.9));

  // Soft beam hits only (new samples since last frame).
  const mask = nodeGraphPhosphorLightMaskCanvas(canvas);
  const mctx = mask?.getContext?.("2d");
  const nextIndex = mctx
    ? nodeGraphPhosphorLightDepositBeam(
      mctx,
      buffer,
      square,
      settings,
      canvas._phosphorLightLastSample || 0,
    )
    : Math.min(buffer.x.length, buffer.y.length);
  canvas._phosphorLightLastSample = nextIndex;

  const energyGl = typeof nodeGraphPhosphorEnergyGlEnsure === "function"
    ? nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl")
    : null;

  if (energyGl && typeof nodeGraphPhosphorEnergyGlStep === "function") {
    if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
      nodeGraphPhosphorEnergyGlSetLutFromPeak(energyGl, rgb, bg);
    }
    // burn = how hard each soft hit writes; continuous path, not a tip layer.
    const depositGain = Math.max(0.02, Math.min(0.35, (0.04 + burn * 0.18) * brightness));
    nodeGraphPhosphorEnergyGlStep(energyGl, {
      decay,
      depositGain: mask ? depositGain : 0,
      maskCanvas: mask,
    });
  }

  // Present: background + energy×LUT only. No hard tip / hard stroke overlay.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  if (energyGl && typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    nodeGraphPhosphorEnergyGlPresent(energyGl, 1);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.imageSmoothingEnabled = true;
    context.drawImage(energyGl.canvas, 0, 0, width, height);
    context.restore();
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.phosphorLight = drawNodeGraphPhosphorLightItem;
}
