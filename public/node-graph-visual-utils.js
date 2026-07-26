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
function nodeGraphSizeDisplayCanvas(section, canvas) {
  if (!section || !canvas) {
    return null;
  }
  const rect = section.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
  const cssWidth = Math.max(1, Number(section.clientWidth || section.offsetWidth || 0) || rect.width / zoom);
  const cssHeight = Math.max(1, Number(section.clientHeight || section.offsetHeight || 0) || rect.height / zoom);
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  return context ? { context, cssHeight, cssWidth, height, pixelRatio, width } : null;
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
