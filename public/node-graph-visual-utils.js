function normalizeNodeGraphPatchVisual(visual = {}) {
  const sourceBackground = visual.background && typeof visual.background === "object"
    ? visual.background
    : {};
  const backgroundH = Number(sourceBackground.h ?? visual.backgroundH ?? 210);
  const backgroundS = Number(sourceBackground.s ?? visual.backgroundS ?? 0);
  const backgroundL = Number(sourceBackground.l ?? visual.backgroundL ?? 5);
  const mode = String(visual.mode || "auto").trim();
  const scale = Number(visual.scale);
  const style = String(visual.style || "glow").trim();
  const theme = String(visual.theme || "cyan-violet").trim();
  const trail = Number(visual.trail);
  return {
    background: {
      h: Number.isFinite(backgroundH) ? Math.max(0, Math.min(360, backgroundH)) : 210,
      l: Number.isFinite(backgroundL) ? Math.max(0, Math.min(100, backgroundL)) : 5,
      s: Number.isFinite(backgroundS) ? Math.max(0, Math.min(100, backgroundS)) : 0,
    },
    mode: ["auto", "stereo-xy", "mono-lag-xy"].includes(mode) ? mode : "auto",
    scale: Number.isFinite(scale) ? Math.max(0.1, Math.min(4, scale)) : 1,
    style: ["glow", "trace", "points"].includes(style) ? style : "glow",
    theme: ["cyan-violet", "ember-gold", "signal-green"].includes(theme) ? theme : "cyan-violet",
    trail: Number.isFinite(trail) ? Math.max(0, Math.min(1, trail)) : 0.35,
  };
}

const nodeGraphElementLightRoles = Object.freeze({
  none: "none",
  source: "source",
  text: "text",
});

function clearNodeGraphElementLightRole(element) {
  if (!element) {
    return;
  }
  element.classList.remove("node-light-source", "node-light-text", "node-no-light");
  delete element.dataset.nodeLight;
}

function setNodeGraphElementLightRole(element, role = "source") {
  if (!element) {
    return;
  }
  clearNodeGraphElementLightRole(element);
  const normalizedRole = nodeGraphElementLightRoles[role] || nodeGraphElementLightRoles.source;
  element.dataset.nodeLight = normalizedRole;
  if (normalizedRole === "none") {
    element.classList.add("node-no-light");
    return;
  }
  element.classList.add(normalizedRole === "text" ? "node-light-text" : "node-light-source");
}

function nodeGraphVisualThemeColors(theme = "cyan-violet") {
  switch (theme) {
    case "ember-gold":
      return {
        glow: "rgba(247, 183, 88, 0.18)",
        point: "rgba(247, 183, 88, 0.72)",
        trace: "#f7b758",
      };
    case "signal-green":
      return {
        glow: "rgba(113, 212, 155, 0.16)",
        point: "rgba(113, 212, 155, 0.72)",
        trace: "#71d49b",
      };
    default:
      return {
        glow: "rgba(177, 132, 255, 0.14)",
        point: "rgba(127, 199, 217, 0.72)",
        trace: "#7fc7d9",
      };
  }
}

function nodeGraphWorkspaceBackgroundCss(background = {}) {
  const h = Number(background.h);
  const s = Number(background.s);
  const l = Number(background.l);
  return `hsl(${Number.isFinite(h) ? h : 210}deg ${Number.isFinite(s) ? s : 0}% ${Number.isFinite(l) ? l : 5}%)`;
}

function nodeGraphClampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

// Shared device-pixel sizing for the module display canvases (filter curve,
// pulse curve, phosphillator draw, phosphor waveform). All four had an
// identical copy of this block: measure the section in CSS pixels, scale by
// devicePixelRatio, resize the backing store only when it actually changed
// (assigning canvas.width/height clears the canvas, so an unconditional
// assignment would wipe the frame every draw).
//
// Returns both coordinate systems because the callers differ: most draw in
// CSS pixels with a setTransform(pixelRatio, ...), while the phosphor
// waveform draws in raw device pixels so it can snap lines to real pixels.
// Returns null when there is nothing to draw into.
/** Face backing 0…1. 1 = CSS × dpr; below 1 = lo-fi. */
function nodeGraphResolveDisplayPixelDensity(pixelDensity) {
  if (typeof nodeGraphTraceDisplayClampPixelDensity === "function") {
    return nodeGraphTraceDisplayClampPixelDensity(pixelDensity);
  }
  const raw = Number(pixelDensity);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
}

function nodeGraphSizeDisplayCanvas(section, canvas, options = {}) {
  if (!section || !canvas) {
    return null;
  }
  const devicePixelRatio = window.devicePixelRatio || 1;
  const density = nodeGraphResolveDisplayPixelDensity(options?.pixelDensity);
  // Prefer layout sizes (offset/client) so we do not force a layout reflow via
  // getBoundingClientRect on every filter-curve / face paint. Workspace zoom is
  // a CSS transform; face backing must stay on the unzoomed layout grid.
  let cssWidth = Math.max(0, Number(section.clientWidth || section.offsetWidth || 0));
  let cssHeight = Math.max(0, Number(section.clientHeight || section.offsetHeight || 0));
  if (!(cssWidth > 0) || !(cssHeight > 0)) {
    const rect = section.getBoundingClientRect();
    const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
    if (!(cssWidth > 0)) {
      cssWidth = Math.max(1, rect.width / zoom);
    }
    if (!(cssHeight > 0)) {
      cssHeight = Math.max(1, rect.height / zoom);
    }
  }
  cssWidth = Math.max(1, cssWidth);
  cssHeight = Math.max(1, cssHeight);
  const nativeWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
  const nativeHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));
  const width = Math.max(1, Math.round(nativeWidth * density));
  const height = Math.max(1, Math.round(nativeHeight * density));
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  const pixelRatio = devicePixelRatio * Math.max(density, 1e-6);
  return context
    ? {
      context,
      cssHeight,
      cssWidth,
      density,
      devicePixelRatio,
      height,
      pixelRatio,
      width,
    }
    : null;
}

/**
 * Cheap vector blur: redraw the current path at a diamond of CSS-px offsets
 * (center + 4 cardinal + 4 diagonal) with a tent kernel. No extra canvas.
 */
function nodeGraphStrokePathWithLineBlur(context, options = {}) {
  if (!context) {
    return;
  }
  const strokeStyle = options.strokeStyle || options.color || "#ffffff";
  const lineWidth = Math.max(0.25, Number(options.lineWidth) || 1);
  const blur = Math.max(0, Number(options.lineBlur ?? options.blur) || 0);
  context.lineJoin = options.lineJoin || "round";
  context.lineCap = options.lineCap || "round";
  context.strokeStyle = strokeStyle;
  if (!(blur > 0.02)) {
    context.lineWidth = lineWidth;
    context.stroke();
    return;
  }
  const taps = [
    { x: 0, y: 0, w: 1 },
    { x: blur, y: 0, w: 0.5 },
    { x: -blur, y: 0, w: 0.5 },
    { x: 0, y: blur, w: 0.5 },
    { x: 0, y: -blur, w: 0.5 },
    { x: blur * 0.707, y: blur * 0.707, w: 0.25 },
    { x: -blur * 0.707, y: blur * 0.707, w: 0.25 },
    { x: blur * 0.707, y: -blur * 0.707, w: 0.25 },
    { x: -blur * 0.707, y: -blur * 0.707, w: 0.25 },
  ];
  let sum = 0;
  for (let i = 0; i < taps.length; i += 1) {
    sum += taps[i].w;
  }
  context.save();
  context.lineWidth = lineWidth;
  for (let i = 0; i < taps.length; i += 1) {
    const tap = taps[i];
    context.save();
    context.translate(tap.x, tap.y);
    context.globalAlpha = tap.w / sum;
    context.stroke();
    context.restore();
  }
  context.restore();
}

function nodeGraphHslToHex(background = {}) {
  const h = ((Number(background.h) || 0) % 360 + 360) % 360;
  const s = nodeGraphClampUnit((Number(background.s) || 0) / 100);
  const l = nodeGraphClampUnit((Number(background.l) || 0) / 100);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = l - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (huePrime < 1) {
    r = chroma;
    g = x;
  } else if (huePrime < 2) {
    r = x;
    g = chroma;
  } else if (huePrime < 3) {
    g = chroma;
    b = x;
  } else if (huePrime < 4) {
    g = x;
    b = chroma;
  } else if (huePrime < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }
  return [r, g, b]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("")
    .padStart(6, "0")
    .replace(/^/, "#");
}

function nodeGraphHexToHsl(hex) {
  const value = String(hex || "").trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(value)) {
    return null;
  }
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  return {
    h: Math.round((h + 360) % 360),
    l: Math.round(l * 100),
    s: Math.round(s * 100),
  };
}
