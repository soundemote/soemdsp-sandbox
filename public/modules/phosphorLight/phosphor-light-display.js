// PhosphorLight — XY scope testbed for the efficient mono energy screen model.
//
//   • GPU gaussian segment beams (same continuous ribbons as Lorenz / scope2d)
//   • Deposits monochrome energy 0–1 (not RGB burn)
//   • Fade + additive beams on fixed face pixel grid
//   • Present: energy → color via 1D gradient LUT
//   • pixelDensity 0–4 scales the layout grid (4× = heavy supersample AA)

const nodeGraphPhosphorLightSettingsDefaults = Object.freeze({
  background: "#020608",
  brightness: 0.9,
  burn: 0.55,
  color: "#75ebff",
  decay: 0.18,
  scale: 1,
  // 0–1 fraction of face min side: 1 = diameter fills the square (same as scope2d).
  dot1Size: 0.08,
  // Softness of the gaussian profile (blur), not geometric size.
  lineThickness: 0.35,
  // 0 = 1px grid, 1 = layout×dpr, 4 = 4× supersample AA.
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
  const clampDensity = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(4, n));
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
    // Prefer explicit size; only fall back to legacy thickness-as-size if size missing.
    dot1Size: clamp01(
      source.dot1Size !== undefined && source.dot1Size !== null
        ? source.dot1Size
        : defaults.dot1Size,
      defaults.dot1Size,
    ),
    lineThickness: clamp01(source.lineThickness ?? source.dot1Blur, defaults.lineThickness),
    pixelDensity: clampDensity(source.pixelDensity, defaults.pixelDensity),
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
 * pixelDensity 0–4 scales the fixed layout grid (not workspace zoom).
 * 0 → lo-fi floor (~1/16 layout, never 1×1 collapse), 1 → full layout×dpr, 4 → AA.
 */
function nodeGraphPhosphorLightApplyPixelDensity(size, pixelDensity) {
  if (!size) {
    return null;
  }
  const raw = Number(pixelDensity);
  const userDensity = Number.isFinite(raw) ? Math.max(0, Math.min(4, raw)) : 1;
  const minSide = Math.max(1, Math.min(size.width, size.height));
  const minDensity = Math.min(1, Math.max(8, Math.min(minSide, 16)) / minSide);
  const density = userDensity < minDensity ? minDensity : userDensity;
  const width = Math.max(1, Math.round(size.width * density));
  const height = Math.max(1, Math.round(size.height * density));
  return {
    ...size,
    density,
    height,
    pixelRatio: (Number(size.pixelRatio) || 1) * Math.max(density, 1e-6),
    userDensity,
    width,
  };
}

function syncNodeGraphPhosphorLightFaceCanvas(canvas, screenElement, pixelRatio, pixelDensity = 1) {
  if (!canvas || !screenElement) return false;
  // Fixed layout pixel grid: clientWidth × dpr × pixelDensity.
  const fullSize = typeof nodeGraphModuleScopeFaceBackingSize === "function"
    ? nodeGraphModuleScopeFaceBackingSize(screenElement, pixelRatio)
    : null;
  let sized;
  if (fullSize) {
    sized = nodeGraphPhosphorLightApplyPixelDensity(fullSize, pixelDensity);
  } else {
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
    // Keep sample index so we only deposit new buffer samples after a true
    // face resize (energy-gl resize+copy preserves residual).
  }
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
 * Build path points for new samples since lastIndex (GPU beam deposit).
 * Returns { points, nextIndex }.
 */
function nodeGraphPhosphorLightBuildPathPoints(buffer, square, settings, lastIndex) {
  const count = Math.min(buffer?.x?.length || 0, buffer?.y?.length || 0);
  if (!count) {
    return { points: [], nextIndex: 0 };
  }

  let start = Math.max(0, Math.floor(Number(lastIndex) || 0));
  if (start >= count) start = 0;
  // First frame / wrap: short tail so something appears without redrawing forever.
  if (start === 0 && count > 1) {
    start = Math.max(0, count - Math.min(count, 512));
  }

  const points = [];
  // Bridge from previous sample so the first new segment is continuous.
  if (start > 0) {
    const bridge = nodeGraphPhosphorLightMapSample(
      square,
      buffer.x[start - 1],
      buffer.y[start - 1],
      settings.scale,
    );
    if (bridge) {
      points.push(bridge);
    }
  }

  for (let i = start; i < count; i += 1) {
    const cur = nodeGraphPhosphorLightMapSample(square, buffer.x[i], buffer.y[i], settings.scale);
    if (!cur) {
      // Break continuity on bad samples (null point ends a stroke).
      if (points.length && points[points.length - 1] !== null) {
        points.push(null);
      }
      continue;
    }
    points.push(cur);
  }
  return { points, nextIndex: count };
}

/**
 * Beam radius in buffer pixels from 0–1 dot size.
 * Same contract as scope2d / Lorenz: radius = minSide * size * 0.5
 * so size 1 = diameter spans the entire face square.
 */
function nodeGraphPhosphorLightBeamRadius(sizePx, dotSize01) {
  const size = Math.max(1, Number(sizePx) || 1);
  const t = Math.max(0, Math.min(1, Number(dotSize01) || 0));
  // Floor so a true 0 still leaves a hair of energy if desired; UI 0 is near-invisible.
  return Math.max(0.35, size * t * 0.5);
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
  // Face square min side — dot size 1 spans this diameter (full screen).
  const size = Math.min(square.width, square.height);
  const radius = nodeGraphPhosphorLightBeamRadius(size, settings.dot1Size);
  // Blur 0–1 widens gaussian sigma (scope2d lineThickness / beam blur role).
  const blur = Math.max(0, Math.min(1, Number(settings.lineThickness) || 0));
  // Smooth burn gain (same family as scope2d energy) — low burn dim, not dead.
  const sizeNorm = Math.max(0, Math.min(1, Number(settings.dot1Size) || 0));
  const burnShape = Math.pow(burn, 0.78);
  const beamBrightness = Math.max(
    0,
    brightness * (0.022 + burnShape * 0.10) * (1.15 - sizeNorm * 0.55),
  );

  const path = nodeGraphPhosphorLightBuildPathPoints(
    buffer,
    square,
    settings,
    canvas._phosphorLightLastSample || 0,
  );
  canvas._phosphorLightLastSample = path.nextIndex;

  const energyGl = typeof nodeGraphPhosphorEnergyGlEnsure === "function"
    ? nodeGraphPhosphorEnergyGlEnsure(canvas, width, height, "_phosphorEnergyGl")
    : null;

  if (energyGl) {
    if (typeof nodeGraphPhosphorEnergyGlSetLutFromPeak === "function") {
      nodeGraphPhosphorEnergyGlSetLutFromPeak(energyGl, rgb, bg);
    }
    // Efficient screen model: fade mono energy + GPU segment ribbons (no 2D stamps).
    if (typeof nodeGraphPhosphorEnergyGlStepBeams === "function") {
      nodeGraphPhosphorEnergyGlStepBeams(energyGl, {
        decay,
        pathPoints: path.points,
        radius,
        brightness: beamBrightness,
        blur,
      });
    } else if (typeof nodeGraphPhosphorEnergyGlStep === "function") {
      // Fade-only fallback if beams unavailable.
      nodeGraphPhosphorEnergyGlStep(energyGl, { decay, depositGain: 0 });
    }
  }

  // Present: solid background + energy×LUT.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  if (energyGl && typeof nodeGraphPhosphorEnergyGlPresent === "function") {
    // present() returns false when trail is idle/dark — skip the blit.
    if (nodeGraphPhosphorEnergyGlPresent(energyGl, 1)) {
      context.save();
      context.globalCompositeOperation = "lighter";
      context.imageSmoothingEnabled = true;
      context.drawImage(energyGl.canvas, 0, 0, width, height);
      context.restore();
    }
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.phosphorLight = drawNodeGraphPhosphorLightItem;
}
