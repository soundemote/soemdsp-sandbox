const STYLE_ID = "sound-color-widget-styles";
const DRAG_SCALE = {
  hue: 0.5,
  percent: 0.18,
  saturation: 0.36,
};

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
    --color-widget-label-ink: rgba(243, 240, 230, 0.72);
    --color-widget-debug-box: transparent;
    --color-widget-debug-label: transparent;
    --color-widget-debug-label-fill: transparent;
    --color-widget-debug-text: transparent;
    --color-widget-debug-text-fill: transparent;
    --color-widget-title-ratio: 42;
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

  .scw-root {
    background: var(--color-widget-bg);
    border: 1px solid var(--color-widget-border);
    border-radius: min(18cqh, 6px);
    display: grid;
    grid-template-rows:
      minmax(0, calc(var(--color-widget-title-ratio) * 1%))
      minmax(0, calc((100 - var(--color-widget-title-ratio)) * 0.58%))
      minmax(0, calc((100 - var(--color-widget-title-ratio)) * 0.42%));
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: 0;
    width: 100%;
    outline: 1px dashed var(--color-widget-debug-box);
    outline-offset: -1px;
    touch-action: none;
  }

  .scw-controls {
    display: grid;
    gap: min(1.2cqw, 10px);
    /* Hue / brightness / saturation only — no alpha channel in this app. */
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-height: 0;
    padding: 0;
    outline: 1px dashed var(--color-widget-debug-box);
    outline-offset: -1px;
  }

  .scw-label {
    align-items: center;
    align-self: stretch;
    color: var(--color-widget-label-ink);
    display: flex;
    font-family: system-ui, sans-serif;
    height: 100%;
    justify-content: center;
    justify-self: stretch;
    margin: 0;
    min-width: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    padding: 0;
    text-align: center;
    white-space: normal;
    width: 100%;
    background-color: var(--color-widget-debug-label-fill);
    outline: 2px solid var(--color-widget-debug-label);
    outline-offset: -1px;
  }

  .scw-label-text {
    align-items: center;
    background-color: var(--color-widget-debug-label-fill);
    display: flex;
    height: 100%;
    justify-content: center;
    margin: 0;
    min-width: 0;
    outline: 1px dotted var(--color-widget-debug-text);
    outline-offset: -1px;
    overflow: hidden;
    overflow-wrap: anywhere;
    padding: 0;
    text-align: center;
    white-space: normal;
    width: 100%;
  }

  .scw-label-glyph {
    display: inline-flex;
    font-size: 100px;
    line-height: 1;
    margin: 0;
    padding: 0;
    transform: scale(var(--scw-label-scale, 1));
    transform-origin: center;
    white-space: nowrap;
  }

  .scw-mount button,
  .scw-mount input {
    font: inherit;
  }

  .scw-control {
    appearance: none;
    -webkit-appearance: none;
    border: 0;
    border-radius: min(16cqh, 5px);
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

  /* Alpha is never used in this app. */
  .scw-alpha {
    display: none !important;
  }

  /* channels:"bw" — brightness only (black / white). */
  .scw-control[hidden],
  .scw-root[data-channels="bw"] .scw-hue,
  .scw-root[data-channels="bw"] .scw-saturation {
    display: none !important;
  }

  .scw-root[data-channels="bw"] .scw-controls {
    grid-template-columns: 1fr;
  }

  .scw-control:focus-visible {
    outline: 1px solid var(--color-widget-accent);
    outline-offset: -1px;
  }

  .scw-hue {
    /* Hex stops — more reliable than space-separated hsl() in some hosts */
    background: linear-gradient(
      90deg,
      #ff0000 0%,
      #ffff00 17%,
      #00ff00 33%,
      #00ffff 50%,
      #0000ff 67%,
      #ff00ff 83%,
      #ff0000 100%
    );
  }

  .scw-brightness {
    background: linear-gradient(90deg, #000000, #ffffff);
  }

  .scw-hex {
    align-items: center;
    background: var(--color-widget-hex-bg);
    background-image:
      linear-gradient(45deg, rgba(255, 255, 255, 0.18) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255, 255, 255, 0.18) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.18) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.18) 75%);
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
    background-size:
      12px 12px,
      12px 12px,
      12px 12px,
      12px 12px;
    border: 0;
    color: var(--color-widget-hex-ink);
    container-type: size;
    display: flex;
    font-family: "Cascadia Mono", Consolas, monospace;
    height: 100%;
    justify-content: center;
    overflow: hidden;
    padding: 0;
    text-align: center;
    position: relative;
    user-select: none;
    width: 100%;
  }

  .scw-hex::before {
    background: var(--scw-final-color, transparent);
    content: "";
    inset: 0;
    position: absolute;
    z-index: 0;
  }

  .scw-hex:focus {
    outline: 1px solid var(--color-widget-accent);
    outline-offset: -1px;
  }

  .scw-hex-text {
    align-items: center;
    background-color: var(--color-widget-debug-text-fill);
    display: flex;
    height: 100%;
    justify-content: center;
    margin: 0;
    outline: 1px dotted var(--color-widget-debug-text);
    outline-offset: -1px;
    padding: 0;
    width: 100%;
    z-index: 1;
  }

  .scw-hex-glyph {
    display: inline-flex;
    font-size: min(70cqh, 24cqw);
    line-height: 1;
    margin: 0;
    padding: 0;
    transform: scale(var(--scw-hex-scale, 1));
    transform-origin: center;
    white-space: nowrap;
  }

  .scw-copy-toast {
    align-items: center;
    background: var(--color-widget-toast-bg);
    border: 1px solid var(--color-widget-border);
    border-radius: min(20cqh, 6px);
    color: var(--color-widget-toast-ink);
    display: flex;
    font-family: system-ui, sans-serif;
    font-size: min(72cqh, 12cqw);
    inset: 0;
    justify-content: center;
    opacity: 0;
    overflow: hidden;
    padding: 0;
    pointer-events: none;
    position: absolute;
    text-align: center;
    transition: opacity 120ms ease;
    white-space: nowrap;
  }

  .scw-hex[data-copied="true"] {
    outline: 2px solid var(--color-widget-accent);
    outline-offset: -2px;
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
  // Always refresh CSS text so channel/layout changes pick up without a full reload race.
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
    // Opaque only — alpha picker removed app-wide.
    a: 1,
  };
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

function hslToRgb(color) {
  const hex = hslToHex(color).replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function colorCss(color) {
  // Classic comma HSL — opaque only (no alpha channel in this app).
  return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
}

function enrichedColor(color) {
  return {
    ...color,
    hex: hslToHex(color),
    css: colorCss(color),
    rgb: hslToRgb(color),
  };
}

export class SoundColorWidget {
  constructor(host, options = {}) {
    if (!host) {
      throw new Error("SoundColorWidget requires a host element.");
    }
    injectStyles();
    this.host = host;
    this.host.classList.add("scw-mount");
    this.label = options.label || "Color";
    // channels: "full" (default H/S/L) | "bw" (luma only — black/white). No alpha.
    this.channels = options.channels === "bw" || options.mono === true ? "bw" : "full";
    const rawColor = normalizeColor(options.color || options);
    this.color = this.channels === "bw"
      ? { h: 0, s: 0, l: rawColor.l, a: 1 }
      : rawColor;
    this.drag = null;
    this.dragElement = null;
    this.toastTimer = null;
    this.onChange = typeof options.onChange === "function" ? options.onChange : null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.preventSelection = this.preventSelection.bind(this);
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.fitFittedText());
    this.resizeObserver.observe(this.root.querySelector(".scw-hex"));
    this.resizeObserver.observe(this.root.querySelector(".scw-label-text"));
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("selectstart", this.preventSelection);
    this.root.addEventListener("dragstart", this.preventSelection);
    this.root.addEventListener("focusin", this.handleFocusIn);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
  }

  destroy() {
    this.root?.removeEventListener("pointerdown", this.handlePointerDown);
    this.root?.removeEventListener("selectstart", this.preventSelection);
    this.root?.removeEventListener("dragstart", this.preventSelection);
    this.root?.removeEventListener("focusin", this.handleFocusIn);
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

  setColor(nextColor, emitChange = true) {
    let next = normalizeColor({ ...this.color, ...nextColor });
    if (this.channels === "bw") {
      // Luma only — discard hue/saturation (no RGB channel editing).
      next = { h: 0, s: 0, l: next.l, a: 1 };
    }
    next.a = 1;
    this.color = next;
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

  render() {
    if (!this.root) {
      this.host.innerHTML = `
        <div class="scw-root">
          <span class="scw-label"><span class="scw-label-text"><span class="scw-label-glyph"></span></span></span>
          <span class="scw-controls">
            <button type="button" class="scw-control scw-hue" data-part="hue"></button>
            <button type="button" class="scw-control scw-brightness" data-part="brightness"></button>
            <button type="button" class="scw-control scw-saturation" data-part="saturation"></button>
          </span>
          <span class="scw-hex" role="button" tabindex="0"><span class="scw-hex-text"><span class="scw-hex-glyph"></span></span><span class="scw-copy-toast" aria-live="polite"></span></span>
        </div>
      `;
      this.root = this.host.querySelector(".scw-root");
    }
    this.root.dataset.channels = this.channels;
    this.host.dataset.channels = this.channels;
    const hueEl = this.root.querySelector(".scw-hue");
    const satEl = this.root.querySelector(".scw-saturation");
    const brightEl = this.root.querySelector(".scw-brightness");
    const bw = this.channels === "bw";
    if (hueEl) hueEl.hidden = bw;
    if (satEl) satEl.hidden = bw;
    const hex = hslToHex(this.color);
    this.root.querySelector(".scw-label-glyph").textContent = this.label;
    if (hueEl) hueEl.setAttribute("aria-label", `${this.label} hue`);
    if (brightEl) {
      brightEl.setAttribute("aria-label", bw ? `${this.label} black / white` : `${this.label} brightness`);
      brightEl.style.background = "linear-gradient(90deg, #000000, #ffffff)";
    }
    if (satEl) {
      satEl.setAttribute("aria-label", `${this.label} saturation`);
      satEl.style.background =
        `linear-gradient(90deg, hsl(${this.color.h}, 0%, ${this.color.l}%), hsl(${this.color.h}, 100%, ${this.color.l}%))`;
    }
    const hexButton = this.root.querySelector(".scw-hex");
    hexButton.querySelector(".scw-hex-glyph").textContent = "";
    hexButton.dataset.hex = hex;
    hexButton.style.setProperty("--scw-final-color", colorCss(this.color));
    hexButton.setAttribute("aria-label", `Copy ${this.label} hex code ${hex}`);
    requestAnimationFrame(() => this.fitFittedText());
  }

  fitFittedText() {
    this.fitTextToBox(".scw-hex", ".scw-hex-glyph", "--scw-hex-scale");
    this.fitTextToBox(".scw-label-text", ".scw-label-glyph", "--scw-label-scale");
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

  async copyHex(hexInput) {
    const hex = hexInput.dataset.hex || hslToHex(this.color);
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
    const hexButton = this.root?.querySelector(".scw-hex");
    if (hexButton) {
      hexButton.dataset.copied = "true";
    }
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.dataset.visible = "false";
      if (hexButton) {
        delete hexButton.dataset.copied;
      }
    }, 900);
  }

  handlePointerDown(event) {
    const hexInput = event.target.closest(".scw-hex");
    if (hexInput) {
      event.preventDefault();
      event.stopPropagation();
      this.copyHex(hexInput);
      return;
    }

    const partElement = event.target.closest("[data-part]");
    const part = partElement?.dataset.part || this.partFromPoint(event.clientX);
    if (!part) {
      event.preventDefault();
      event.stopPropagation();
      window.getSelection?.()?.removeAllRanges();
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
  }

  partFromPoint(clientX) {
    const controls = this.root?.querySelector(".scw-controls");
    const rect = controls?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return null;
    }
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    if (this.channels === "bw") {
      return "brightness";
    }
    const index = Math.min(2, Math.floor(x * 3));
    return ["hue", "brightness", "saturation"][index];
  }

  handleFocusIn(event) {
    event.target.closest(".scw-hex");
  }

  preventSelection(event) {
    event.preventDefault();
  }

  dragDelta(event) {
    // App-wide diagonal policy: right + up increase (see nodeGraphPointerDragScreenDelta).
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
    const delta = this.dragDelta(event);
    const start = this.drag.startColor;
    if (this.drag.part === "hue") {
      this.setColor({ h: Math.round((start.h + delta * DRAG_SCALE.hue + 360) % 360) });
    } else if (this.drag.part === "brightness") {
      this.setColor({ l: Math.round(clamp(start.l + delta * DRAG_SCALE.percent, 0, 100)) });
    } else if (this.drag.part === "saturation") {
      this.setColor({ s: Math.round(clamp(start.s + delta * DRAG_SCALE.saturation, 0, 100)) });
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
