const STYLE_ID = "sound-color-widget-styles";
const DRAG_SCALE = {
  hue: 0.5,
  percent: 0.18,
};

/** Labels too generic to waste a title strip on (keep Stop/Level — gradient needs them). */
const GENERIC_LABELS = new Set([
  "",
  "color",
  "colour",
  "dot color",
  "secondary color",
  "hue",
  "light",
]);

/** App-wide hue spectrum — single source of truth (CSS + any host overrides). */
const SCW_HUE_SPECTRUM = `linear-gradient(
  90deg,
  #ff0000 0%,
  #ffff00 17%,
  #00ff00 33%,
  #00ffff 50%,
  #0000ff 67%,
  #ff00ff 83%,
  #ff0000 100%
)`;

const css = `
  .scw-mount {
    --color-widget-accent: #f1b84b;
    --color-widget-bg: rgba(243, 240, 230, 0.045);
    --color-widget-border: rgba(243, 240, 230, 0.12);
    --color-widget-control-border: rgba(243, 240, 230, 0.26);
    --color-widget-hex-bg: rgba(243, 240, 230, 0.035);
    --color-widget-hex-ink: rgba(243, 240, 230, 0.82);
    --color-widget-toast-bg: rgba(18, 20, 15, 0.92);
    --color-widget-toast-ink: rgba(243, 240, 230, 0.92);
    --color-widget-label-ink: #ffffff;
    --scw-hue-spectrum: ${SCW_HUE_SPECTRUM.replace(/\s+/g, " ").trim()};
    container-type: size;
    display: grid;
    min-height: 0;
    place-items: stretch;
    -webkit-user-select: none;
    user-select: none;
  }

  .scw-mount,
  .scw-mount * {
    box-sizing: border-box;
    -webkit-user-drag: none;
    -webkit-user-select: none;
    user-select: none;
  }

  /*
   * Title strip = current color swatch (no dedicated hex row).
   * Rows: title/color · plane · hue
   */
  .scw-root {
    background: var(--color-widget-bg);
    border: 1px solid var(--color-widget-border);
    border-radius: min(18cqh, 6px);
    display: grid;
    grid-template-rows:
      minmax(20px, 0.22fr)
      minmax(0, 1fr)
      minmax(18px, 0.2fr);
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: 0;
    width: 100%;
    touch-action: none;
    gap: 2px;
  }

  .scw-label {
    align-items: center;
    background: var(--color-widget-hex-bg);
    background-image:
      linear-gradient(45deg, rgba(255, 255, 255, 0.18) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255, 255, 255, 0.18) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.18) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.18) 75%);
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-size: 12px 12px, 12px 12px, 12px 12px, 12px 12px;
    border: 0;
    border-radius: min(12cqh, 4px);
    color: var(--color-widget-label-ink);
    cursor: pointer;
    display: flex;
    font-family: system-ui, sans-serif;
    height: 100%;
    justify-content: center;
    margin: 0;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    position: relative;
    text-align: center;
    width: 100%;
  }

  .scw-label::before {
    background: var(--scw-final-color, transparent);
    content: "";
    inset: 0;
    position: absolute;
    z-index: 0;
  }

  .scw-label:focus {
    outline: 1px solid var(--color-widget-accent);
    outline-offset: -1px;
  }

  .scw-label[data-copied="true"] {
    outline: 2px solid var(--color-widget-accent);
    outline-offset: -2px;
  }

  .scw-label-text {
    align-items: center;
    display: flex;
    height: 100%;
    justify-content: center;
    margin: 0;
    min-width: 0;
    padding: 0 6px;
    position: relative;
    width: 100%;
    z-index: 1;
  }

  .scw-label-glyph {
    display: block;
    color: inherit;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.15;
    max-width: 100%;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    /* Shadow flips with smart ink (--scw-label-shadow). */
    text-shadow: var(--scw-label-shadow, 0 0 2px rgba(0, 0, 0, 0.75));
    transform: scale(var(--scw-label-scale, 1));
    transform-origin: center center;
    white-space: nowrap;
  }

  .scw-mount button,
  .scw-mount input {
    font: inherit;
  }

  .scw-control {
    appearance: none;
    -webkit-appearance: none;
    border: 1px solid var(--color-widget-control-border);
    border-radius: min(12cqh, 4px);
    box-shadow: none;
    color: inherit;
    display: block;
    height: 100%;
    min-height: 0;
    outline: 0;
    overflow: hidden;
    padding: 0;
    position: relative;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    width: 100%;
  }

  .scw-control:focus-visible {
    outline: 1px solid var(--color-widget-accent);
    outline-offset: -1px;
  }

  /* Hue spectrum SSOT — beat global/popover button panel backgrounds. */
  .scw-hue,
  button.scw-control.scw-hue,
  .scw-mount button.scw-control.scw-hue {
    background-color: transparent !important;
    background-image: var(--scw-hue-spectrum) !important;
    background-repeat: no-repeat !important;
    background-size: 100% 100% !important;
    cursor: ew-resize;
  }

  /* Hue position: small white circle */
  .scw-hue-thumb {
    position: absolute;
    top: 50%;
    left: var(--scw-hue-pos, 0%);
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    box-sizing: border-box;
    border: 1px solid rgba(0, 0, 0, 0.55);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
    pointer-events: none;
    z-index: 1;
  }

  /* 4-corner plane: UL grey · UR full sat · LL black · LR white */
  .scw-plane {
    cursor: crosshair;
    min-height: 0;
  }
  .scw-plane-canvas {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .scw-plane-thumb {
    position: absolute;
    left: var(--scw-plane-u, 50%);
    top: var(--scw-plane-v, 50%);
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border: 1.5px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.75), 0 0 6px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    z-index: 1;
  }

  .scw-root[data-channels="bw"] {
    grid-template-rows:
      minmax(20px, 0.22fr)
      minmax(0, 1fr);
  }
  .scw-root[data-channels="bw"] .scw-hue {
    display: none;
  }

  /* Hue-only strip */
  .scw-root[data-channels="hue"] {
    grid-template-rows: minmax(18px, 1fr);
    gap: 0;
  }
  .scw-root[data-channels="hue"] .scw-plane,
  .scw-root[data-channels="hue"] .scw-label {
    display: none;
  }
  .scw-root[data-channels="hue"] .scw-hue {
    min-height: 18px;
    height: 100%;
  }

  .scw-copy-toast {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-widget-toast-bg);
    border: 1px solid var(--color-widget-border);
    border-radius: min(20cqh, 6px);
    color: var(--color-widget-toast-ink);
    font-family: system-ui, sans-serif;
    font-size: min(72cqh, 12cqw);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }
  .scw-copy-toast[data-visible="true"] {
    opacity: 1;
  }
`;

function injectStyles() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(color) {
  return {
    h: Math.round(clamp(Number(color.h) || 0, 0, 359)),
    s: Math.round(clamp(Number(color.s) || 0, 0, 100)),
    l: Math.round(clamp(Number(color.l) || 0, 0, 100)),
    a: 1,
  };
}

function isGenericLabel(label) {
  return GENERIC_LABELS.has(String(label || "").trim().toLowerCase());
}

export function hslToHex({ h, s, l }) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (huePrime >= 0 && huePrime < 1) [red, green, blue] = [chroma, x, 0];
  else if (huePrime < 2) [red, green, blue] = [x, chroma, 0];
  else if (huePrime < 3) [red, green, blue] = [0, chroma, x];
  else if (huePrime < 4) [red, green, blue] = [0, x, chroma];
  else if (huePrime < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  return [red, green, blue]
    .map((value) => Math.round((value + match) * 255).toString(16).padStart(2, "0"))
    .join("")
    .padStart(6, "0")
    .replace(/^/, "#")
    .toUpperCase();
}

function hslToRgbBytes(color) {
  const hex = hslToHex(color).replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbBytesToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rr) hue = (gg - bb) / delta + (gg < bb ? 6 : 0);
    else if (max === gg) hue = (bb - rr) / delta + 2;
    else hue = (rr - gg) / delta + 4;
    hue /= 6;
  }
  return {
    h: Math.round(hue * 359),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
    a: 1,
  };
}

function colorCss(color) {
  return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
}

/** Black/white ink for title on a solid color swatch (Rec. 709). */
function contrastInkForColor(color) {
  const rgb = hslToRgbBytes(color);
  const y = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return y > 0.55 ? "#000000" : "#ffffff";
}

function contrastShadowForInk(ink) {
  return ink === "#000000"
    ? "0 0 2px rgba(255, 255, 255, 0.55)"
    : "0 0 2px rgba(0, 0, 0, 0.75), 0 1px 1px rgba(0, 0, 0, 0.55)";
}

function enrichedColor(color) {
  return {
    ...color,
    hex: hslToHex(color),
    css: colorCss(color),
    rgb: hslToRgbBytes(color),
  };
}

/**
 * 4-corner plane (u right, v up from bottom):
 *   UL grey · UR full sat · LL black · LR white
 */
function planeRgb(h, u, v) {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);
  const sat = hslToRgbBytes({ h, s: 100, l: 50 });
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const grey = { r: 128, g: 128, b: 128 };
  const mix = (a, b, t) => a + (b - a) * t;
  const bottom = {
    r: mix(black.r, white.r, uu),
    g: mix(black.g, white.g, uu),
    b: mix(black.b, white.b, uu),
  };
  const top = {
    r: mix(grey.r, sat.r, uu),
    g: mix(grey.g, sat.g, uu),
    b: mix(grey.b, sat.b, uu),
  };
  return {
    r: Math.round(mix(bottom.r, top.r, vv)),
    g: Math.round(mix(bottom.g, top.g, vv)),
    b: Math.round(mix(bottom.b, top.b, vv)),
  };
}

/** Sample plane at (u,v) for bar hue h. Hue is always taken from the bar. */
function planeColorHsl(h, u, v, keepH = h) {
  const rgb = planeRgb(h, u, v);
  const hsl = rgbBytesToHsl(rgb.r, rgb.g, rgb.b);
  hsl.h = ((Number(keepH) % 360) + 360) % 360;
  return hsl;
}

function findPlaneUV(h, color) {
  const target = hslToRgbBytes(color);
  let best = { u: 0.5, v: 0.5, d: Infinity };
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const u = i / steps;
      const v = j / steps;
      const c = planeRgb(h, u, v);
      const d = (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2;
      if (d < best.d) {
        best = { u, v, d };
      }
    }
  }
  return best;
}

export class SoundColorWidget {
  constructor(host, options = {}) {
    if (!host) {
      throw new Error("SoundColorWidget requires a host element.");
    }
    injectStyles();
    this.host = host;
    this.host.classList.add("scw-mount");
    this.label = options.label || "";
    // channels: "full" (plane+hue) | "bw" (plane grey only) | "hue" (hue bar only)
    if (options.channels === "bw" || options.mono === true) {
      this.channels = "bw";
    } else if (options.channels === "hue" || options.hueOnly === true) {
      this.channels = "hue";
    } else {
      this.channels = "full";
    }
    const rawColor = normalizeColor(options.color || options);
    this.color = this.channels === "bw"
      ? { h: 0, s: 0, l: rawColor.l, a: 1 }
      : this.channels === "hue"
        // Pure hue stop (s=100, l=50) — Bright does grey→hue→white outside the widget.
        ? { h: rawColor.h, s: 100, l: 50, a: 1 }
        : rawColor;
    this.planeUV = findPlaneUV(this.color.h, this.color);
    this.drag = null;
    this.dragElement = null;
    this.toastTimer = null;
    this.onChange = typeof options.onChange === "function" ? options.onChange : null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.preventSelection = this.preventSelection.bind(this);
    this.render();
    this.resizeObserver = new ResizeObserver(() => {
      this.paintPlane();
      this.fitFittedText();
    });
    const label = this.root.querySelector(".scw-label-text");
    const plane = this.root.querySelector(".scw-plane");
    if (label) this.resizeObserver.observe(label);
    if (plane) this.resizeObserver.observe(plane);
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("selectstart", this.preventSelection);
    this.root.addEventListener("dragstart", this.preventSelection);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
  }

  destroy() {
    this.root?.removeEventListener("pointerdown", this.handlePointerDown);
    this.root?.removeEventListener("selectstart", this.preventSelection);
    this.root?.removeEventListener("dragstart", this.preventSelection);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    clearTimeout(this.toastTimer);
    this.resizeObserver?.disconnect();
    this.host.classList.remove("scw-mount");
    this.host.replaceChildren();
  }

  getColor() {
    return enrichedColor(this.color);
  }

  setColor(nextColor, emitChange = true, options = {}) {
    let next = normalizeColor({ ...this.color, ...nextColor });
    if (this.channels === "bw") {
      next = { h: 0, s: 0, l: next.l, a: 1 };
    } else if (this.channels === "hue") {
      next = { h: next.h, s: 100, l: 50, a: 1 };
    }
    next.a = 1;
    this.color = next;
    if (!options.preservePlaneUV && this.channels !== "hue") {
      this.planeUV = findPlaneUV(this.color.h, this.color);
    }
    this.render();
    if (emitChange) {
      const detail = this.getColor();
      this.host.dispatchEvent(new CustomEvent("color-widget-change", {
        bubbles: true,
        detail,
      }));
      this.onChange?.(detail);
    }
  }

  hasTitle() {
    // Hue-only mode never shows a title strip (avoids giant "Hue" text box).
    if (this.channels === "hue") {
      return false;
    }
    return !isGenericLabel(this.label);
  }

  render() {
    if (!this.root) {
      this.host.innerHTML = `
        <div class="scw-root">
          <span class="scw-label" role="button" tabindex="0">
            <span class="scw-label-text"><span class="scw-label-glyph"></span></span>
            <span class="scw-copy-toast" aria-live="polite"></span>
          </span>
          <button type="button" class="scw-control scw-plane" data-part="plane" aria-label="Color plane">
            <canvas class="scw-plane-canvas" aria-hidden="true"></canvas>
            <span class="scw-plane-thumb" aria-hidden="true"></span>
          </button>
          <button type="button" class="scw-control scw-hue" data-part="hue" aria-label="Hue">
            <span class="scw-hue-thumb" aria-hidden="true"></span>
          </button>
        </div>
      `;
      this.root = this.host.querySelector(".scw-root");
    }
    const titled = this.hasTitle();
    this.root.dataset.channels = this.channels;
    this.root.dataset.hasTitle = titled ? "1" : "0";
    this.host.dataset.channels = this.channels;
    const glyph = this.root.querySelector(".scw-label-glyph");
    if (glyph) {
      glyph.textContent = titled ? this.label : "";
    }
    const hex = hslToHex(this.color);
    const titleStrip = this.root.querySelector(".scw-label");
    if (titleStrip) {
      const ink = contrastInkForColor(this.color);
      titleStrip.dataset.hex = hex;
      titleStrip.style.setProperty("--scw-final-color", colorCss(this.color));
      titleStrip.style.setProperty("--color-widget-label-ink", ink);
      titleStrip.style.setProperty("--scw-label-shadow", contrastShadowForInk(ink));
      titleStrip.style.color = ink;
      const ariaName = titled ? this.label : "Color";
      titleStrip.setAttribute("aria-label", `Copy ${ariaName} hex ${hex}`);
      titleStrip.title = `${ariaName}: ${hex} (click to copy)`;
    }
    const ariaName = titled ? this.label : "Color";
    const plane = this.root.querySelector(".scw-plane");
    if (plane && this.channels !== "hue") {
      plane.setAttribute("aria-label", `${ariaName} plane (grey / black / white / saturated)`);
      plane.style.setProperty("--scw-plane-u", `${(this.planeUV.u * 100).toFixed(2)}%`);
      // CSS top is from top; v is from bottom.
      plane.style.setProperty("--scw-plane-v", `${((1 - this.planeUV.v) * 100).toFixed(2)}%`);
    }
    const hueBar = this.root.querySelector(".scw-hue");
    if (hueBar) {
      // Hue 0…360 maps left→right; marker is the unfilled black rect.
      const h = this.channels === "bw" ? 0 : Number(this.color.h) || 0;
      const pos = clamp(h / 360, 0, 1) * 100;
      hueBar.style.setProperty("--scw-hue-pos", `${pos.toFixed(3)}%`);
      if (this.channels === "hue") {
        hueBar.setAttribute("aria-label", `${ariaName} hue`);
      }
    }
    if (this.channels !== "hue") {
      this.paintPlane();
    }
    requestAnimationFrame(() => this.fitFittedText());
  }

  paintPlane() {
    if (this.channels === "hue") {
      return;
    }
    const canvas = this.root?.querySelector(".scw-plane-canvas");
    const plane = this.root?.querySelector(".scw-plane");
    if (!canvas || !plane) {
      return;
    }
    const w = Math.max(2, Math.round(plane.clientWidth || 1));
    const h = Math.max(2, Math.round(plane.clientHeight || 1));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const hue = this.channels === "bw" ? 0 : this.color.h;
    for (let y = 0; y < h; y += 1) {
      const v = 1 - y / Math.max(1, h - 1);
      for (let x = 0; x < w; x += 1) {
        const u = x / Math.max(1, w - 1);
        let rgb;
        if (this.channels === "bw") {
          // Black (bottom) → white (top); ignore hue.
          const t = v;
          const g = Math.round(t * 255);
          rgb = { r: g, g, b: g };
        } else {
          rgb = planeRgb(hue, u, v);
        }
        const i = (y * w + x) * 4;
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  fitFittedText() {
    if (this.hasTitle() && this.channels !== "hue") {
      this.fitTextToBox(".scw-label-text", ".scw-label-glyph", "--scw-label-scale");
    }
  }

  fitTextToBox(boxSelector, glyphSelector, scaleProperty) {
    const box = this.root?.querySelector(boxSelector);
    const glyph = this.root?.querySelector(glyphSelector);
    if (!box || !glyph) {
      return;
    }
    glyph.style.setProperty(scaleProperty, "1");
    const availableWidth = box.clientWidth;
    const availableHeight = box.clientHeight;
    const naturalWidth = glyph.offsetWidth;
    const naturalHeight = glyph.offsetHeight;
    if (!availableWidth || !availableHeight || !naturalWidth || !naturalHeight) {
      return;
    }
    glyph.style.setProperty(scaleProperty, `${Math.min(
      availableWidth / naturalWidth,
      availableHeight / naturalHeight,
    )}`);
  }

  async copyHex(sourceEl) {
    const hex = sourceEl?.dataset?.hex || hslToHex(this.color);
    try {
      await navigator.clipboard?.writeText(hex);
    } catch {
      this.copyHexFallback(hex);
    }
    this.showCopyToast("Hashtag copied");
  }

  copyHexFallback(hex) {
    const holder = document.createElement("textarea");
    holder.value = hex;
    holder.setAttribute("readonly", "");
    holder.style.position = "fixed";
    holder.style.inset = "0 auto auto 0";
    holder.style.opacity = "0";
    document.body.appendChild(holder);
    holder.select();
    document.execCommand("copy");
    holder.remove();
  }

  showCopyToast(message) {
    const toast = this.root?.querySelector(".scw-copy-toast");
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.dataset.visible = "true";
    const titleStrip = this.root?.querySelector(".scw-label");
    if (titleStrip) {
      titleStrip.dataset.copied = "true";
    }
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.dataset.visible = "false";
      if (titleStrip) {
        delete titleStrip.dataset.copied;
      }
    }, 900);
  }

  setPlaneFromClient(clientX, clientY) {
    const plane = this.root?.querySelector(".scw-plane");
    if (!plane) {
      return;
    }
    const rect = plane.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) {
      return;
    }
    const u = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    this.planeUV = { u, v };
    if (this.channels === "bw") {
      this.setColor({ h: 0, s: 0, l: Math.round(v * 100) }, true, { preservePlaneUV: true });
      return;
    }
    const next = planeColorHsl(this.color.h, u, v, this.color.h);
    this.setColor(next, true, { preservePlaneUV: true });
  }

  handlePointerDown(event) {
    const titleStrip = event.target.closest(".scw-label");
    if (titleStrip && this.root?.contains(titleStrip)) {
      event.preventDefault();
      event.stopPropagation();
      this.copyHex(titleStrip);
      return;
    }

    const partElement = event.target.closest("[data-part]");
    const part = partElement?.dataset.part;
    if (!part) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.getSelection?.()?.removeAllRanges();
    const captureElement = partElement || this.root;
    captureElement.setPointerCapture?.(event.pointerId);
    this.dragElement = captureElement;
    this.drag = {
      part,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fine: event.shiftKey,
      startColor: { ...this.color },
    };
    if (part === "plane" && this.channels !== "hue") {
      this.setPlaneFromClient(event.clientX, event.clientY);
    }
  }

  preventSelection(event) {
    event.preventDefault();
  }

  dragDelta(event) {
    const axes = typeof nodeGraphPointerDragScreenDelta === "function"
      ? nodeGraphPointerDragScreenDelta(this.drag.startX, this.drag.startY, event.clientX, event.clientY)
      : { combined: (event.clientX - this.drag.startX) + (this.drag.startY - event.clientY) };
    const delta = axes.combined;
    return this.drag.fine ? delta / 10 : delta;
  }

  handlePointerMove(event) {
    if (!this.drag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.getSelection?.()?.removeAllRanges();
    if (this.drag.part === "plane" && this.channels !== "hue") {
      this.setPlaneFromClient(event.clientX, event.clientY);
      return;
    }
    const delta = this.dragDelta(event);
    const start = this.drag.startColor;
    if (this.drag.part === "hue" && this.channels !== "bw") {
      // Hue bar → H only; plane UV stays put (re-sample s/l on the new hue).
      const h = Math.round((start.h + delta * DRAG_SCALE.hue + 360) % 360);
      const uv = this.planeUV || { u: 0.5, v: 0.5 };
      const next = planeColorHsl(h, uv.u, uv.v, h);
      this.setColor(next, true, { preservePlaneUV: true });
    }
  }

  handlePointerUp(event) {
    if (this.dragElement && this.drag?.pointerId !== undefined) {
      this.dragElement.releasePointerCapture?.(this.drag.pointerId);
    }
    this.drag = null;
    this.dragElement = null;
    event?.stopPropagation?.();
  }
}

export function mountColorWidget(host, options) {
  return new SoundColorWidget(host, options);
}
