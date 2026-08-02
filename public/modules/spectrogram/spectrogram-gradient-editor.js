/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NodeGraphGradientSelector — SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file owns gradient UI/UX for the whole app:
 *   layout · control scheme · stop model · presets · color widget modes ·
 *   display-settings profiles (which faces use the selector + B/W vs color)
 *
 * Call ONLY through `NodeGraphGradientSelector` (or thin wrappers that
 * delegate to it). Do not reimplement bar/stops/presets elsewhere.
 *
 * Public API (on window / globalThis):
 *   NodeGraphGradientSelector.mount(host, options)
 *   NodeGraphGradientSelector.normalizeStops(raw, options?)
 *   NodeGraphGradientSelector.defaultStops(kind)
 *   NodeGraphGradientSelector.usesDisplayGradient(formType)
 *   NodeGraphGradientSelector.profileForDisplay(formType)
 *   NodeGraphGradientSelector.syncDisplaySettings(popover, visible)
 *   NodeGraphGradientSelector.setActive(editor) / clearActive() / getActive()
 *
 * Stop model: { t: 0..1, color: "#rrggbb" }
 * Channels:   "color" (full H/S/L) | "bw" (luma / black–white only)
 *
 * Legacy aliases (deprecated — keep for old call sites):
 *   mountSharedGradientEditor / mountSpectrogramGradientEditor /
 *   mountPhosphorGradientEditor / normalizeSharedGradientStops / …
 */
(function nodeGraphGradientSelectorModule(global) {
  const STYLE_ID = "node-gradient-selector-styles";

  const DEFAULT_STOPS = Object.freeze([
    { t: 0, color: "#000000" },
    { t: 0.25, color: "#000080" },
    { t: 0.5, color: "#00c0ff" },
    { t: 0.75, color: "#ffff00" },
    { t: 1, color: "#ffffff" },
  ]);

  // Default CRT-style phosphor ramp (black floor → cyan peak). Used when a
  // phosphor face has no saved gradientStops yet.
  const DEFAULT_PHOSPHOR_STOPS = Object.freeze([
    { t: 0, color: "#000000" },
    { t: 0.18, color: "#0a2a33" },
    { t: 0.55, color: "#3a9aab" },
    { t: 1, color: "#75ebff" },
  ]);

  // Digital-rain matrix: black floor → deep green → bright green → white tip.
  // Shared preset + default for Matrix Waterfall / Matrix Display faces.
  const DEFAULT_MATRIX_STOPS = Object.freeze([
    { t: 0, color: "#000000" },
    { t: 0.12, color: "#001a08" },
    { t: 0.35, color: "#0a5c20" },
    { t: 0.62, color: "#1ecf55" },
    { t: 0.85, color: "#7dff9a" },
    { t: 1, color: "#ffffff" },
  ]);

  // Black/white channel presets only (no hue/RGB ramps).
  const PRESETS_BW = Object.freeze([
    {
      id: "bw-basic",
      label: "B/W",
      colors: ["#000000", "#ffffff"],
    },
    {
      id: "grayscale",
      label: "Gray",
      colors: ["#000000", "#404040", "#a0a0a0", "#ffffff"],
    },
    {
      id: "soft",
      label: "Soft",
      colors: ["#000000", "#1a1a1a", "#666666", "#e0e0e0", "#ffffff"],
    },
    {
      id: "lcd",
      label: "LCD",
      colors: ["#0a0a0a", "#2a2a2a", "#c8c8c8", "#f5f5f5"],
    },
  ]);

  const PRESETS = Object.freeze([
    {
      id: "classic",
      label: "Classic",
      colors: ["#000000", "#000080", "#00c0ff", "#ffff00", "#ffffff"],
    },
    {
      id: "grayscale",
      label: "Gray",
      colors: ["#000000", "#404040", "#a0a0a0", "#ffffff"],
    },
    {
      id: "hot",
      label: "Hot",
      colors: ["#000000", "#7f0000", "#ff0000", "#ffff00", "#ffffff"],
    },
    {
      id: "inferno",
      label: "Inferno",
      colors: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
    },
    {
      id: "magma",
      label: "Magma",
      colors: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
    },
    {
      id: "viridis",
      label: "Viridis",
      colors: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    },
    {
      id: "ice",
      label: "Ice",
      colors: ["#000000", "#001a4d", "#0066cc", "#66ccff", "#ffffff"],
    },
    {
      id: "bone",
      label: "Bone",
      colors: ["#000000", "#2b2b4d", "#7a7a9a", "#d0c8c0", "#ffffff"],
    },
    {
      id: "phosphor",
      label: "Phosphor",
      colors: ["#000000", "#0a2a33", "#3a9aab", "#75ebff"],
    },
    {
      id: "amber",
      label: "Amber",
      colors: ["#000000", "#3a2000", "#c07010", "#ffc040"],
    },
    {
      id: "green",
      label: "P1 Green",
      colors: ["#000000", "#0a2810", "#2a8840", "#80ff90"],
    },
    {
      // App-wide digital-rain ramp (not Matrix-only) — black → green → white tip.
      id: "matrix",
      label: "Matrix",
      colors: ["#000000", "#001a08", "#0a5c20", "#1ecf55", "#7dff9a", "#ffffff"],
    },
  ]);

  function ensureStyles() {
    let style = document.getElementById(STYLE_ID);
    if (style) {
      style.textContent = ""; // allow hot-reload of rules
    } else {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      .sge-root {
        display: grid;
        gap: 8px;
        min-width: 0;
        user-select: none;
      }
      .sge-bar-wrap {
        position: relative;
        height: 22px;
        border-radius: 4px;
        overflow: hidden;
        cursor: crosshair;
        box-shadow: inset 0 0 0 1px rgba(248, 252, 255, 0.12);
      }
      .sge-bar {
        position: absolute;
        inset: 0;
      }
      .sge-stops {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        gap: 3px;
        min-width: 0;
        width: 100%;
      }
      .sge-stop-cell {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 3px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        appearance: none;
      }
      .sge-stop-swatch {
        width: 100%;
        height: 32px;
        border-radius: 3px;
        border: none;
        box-shadow: none;
        outline: none;
      }
      .sge-stop-cell[data-active="true"] .sge-stop-swatch {
        outline: 2px solid #f1b84b;
        outline-offset: 1px;
      }
      .sge-stop-pos {
        font-size: 0.72rem;
        color: rgba(248, 252, 255, 0.62);
        line-height: 1.2;
        min-height: 1.1em;
        text-align: center;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sge-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .sge-preset {
        font-size: 0.68rem;
        padding: 3px 8px;
        border: none;
        border-radius: 999px;
        background: rgba(248, 252, 255, 0.08);
        color: rgba(248, 252, 255, 0.78);
        cursor: pointer;
      }
      .sge-preset:hover {
        background: rgba(248, 252, 255, 0.14);
      }
      .sge-preset[data-active="true"] {
        background: rgba(241, 184, 75, 0.22);
        color: #f1b84b;
      }
      .sge-section-label {
        font-size: 0.68rem;
        color: rgba(248, 252, 255, 0.55);
        letter-spacing: 0.02em;
      }
      /*
       * SoundColorWidget is sized with % grid rows + cqh. Inside the narrow
       * settings popover that collapses unless we give fixed pixel rows.
       * Also force hue/brightness gradients with hex stops (space-separated
       * hsl() can fail to paint in some hosts).
       */
      .sge-color-widget-host {
        min-width: 0;
        width: 100%;
        height: 100px;
        min-height: 100px;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        background: transparent;
        overflow: visible;
      }
      .sge-color-widget-host.scw-mount {
        height: 100px;
        min-height: 100px;
        container-type: size;
      }
      .sge-color-widget-host .scw-root {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        background: rgba(0, 0, 0, 0.28);
        border-radius: 4px;
        height: 100px !important;
        min-height: 100px !important;
        /* Fixed rows: label | sliders | hex — avoid % minmax collapse */
        grid-template-rows: 18px 48px 28px !important;
        --color-widget-title-ratio: 18;
      }
      .sge-color-widget-host .scw-controls {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        min-height: 48px !important;
        height: 48px !important;
        gap: 4px !important;
        padding: 2px 4px !important;
        align-items: stretch;
      }
      .sge-color-widget-host .scw-control {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        min-height: 40px !important;
        height: 40px !important;
        min-width: 0;
      }
      /* Hex-stop gradients so hue/brightness always paint */
      .sge-color-widget-host .scw-hue {
        background: linear-gradient(
          90deg,
          #ff0000 0%,
          #ffff00 17%,
          #00ff00 33%,
          #00ffff 50%,
          #0000ff 67%,
          #ff00ff 83%,
          #ff0000 100%
        ) !important;
      }
      .sge-color-widget-host .scw-brightness {
        background: linear-gradient(90deg, #000000, #ffffff) !important;
      }
      /* B/W channel mode: single brightness slider (Number Readout). */
      .sge-color-widget-host[data-channels="bw"] .scw-root,
      .sge-color-widget-host .scw-root[data-channels="bw"] {
        grid-template-rows: 18px 48px 28px !important;
      }
      .sge-color-widget-host[data-channels="bw"] .scw-controls,
      .sge-color-widget-host .scw-root[data-channels="bw"] .scw-controls {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .sge-color-widget-host .scw-hex {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        min-height: 28px !important;
        height: 28px !important;
      }
      .sge-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 6px;
        align-items: center;
        min-width: 0;
      }
      .sge-row span {
        white-space: nowrap;
        font-size: 0.72rem;
        color: rgba(248, 252, 255, 0.72);
      }
      .sge-row input[type="text"] {
        min-width: 0;
        width: 100%;
        font: inherit;
        font-size: 0.72rem;
      }
      .sge-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .sge-actions button {
        font-size: 0.72rem;
      }
      .sge-hex {
        width: 100%;
        min-height: 2.4em;
        font: inherit;
        font-size: 0.68rem;
        font-family: var(--node-mono-font, ui-monospace, monospace);
        resize: vertical;
      }
      .sge-hint {
        font-size: 0.66rem;
        color: rgba(248, 252, 255, 0.5);
        line-height: 1.3;
      }
    `;
  }

  function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function normalizeHex(value, fallback = "#ffffff") {
    const s = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const r = s[1];
      const g = s[2];
      const b = s[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
    return fallback;
  }

  function normalizeStops(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const stop = list[i];
      if (!stop) continue;
      const color = normalizeHex(stop.color ?? stop.hex ?? stop, null);
      if (!color) continue;
      const t = stop.t !== undefined
        ? clamp01(stop.t)
        : (list.length <= 1 ? 0 : i / (list.length - 1));
      out.push({ t, color });
    }
    if (out.length < 2) {
      return DEFAULT_STOPS.map((s) => ({ ...s }));
    }
    out.sort((a, b) => a.t - b.t);
    out[0].t = 0;
    out[out.length - 1].t = 1;
    return out;
  }

  function colorsToStops(colors) {
    const list = (colors || []).map((c) => normalizeHex(c, null)).filter(Boolean);
    if (list.length < 2) return DEFAULT_STOPS.map((s) => ({ ...s }));
    return list.map((color, i) => ({
      t: list.length <= 1 ? 0 : i / (list.length - 1),
      color,
    }));
  }

  function stopsToCss(stops) {
    const parts = normalizeStops(stops).map(
      (s) => `${s.color} ${(s.t * 100).toFixed(2)}%`,
    );
    return `linear-gradient(90deg, ${parts.join(", ")})`;
  }

  function stopsToHexList(stops) {
    return normalizeStops(stops).map((s) => s.color).join(", ");
  }

  function parseHexList(text) {
    const tokens = String(text || "")
      .split(/[\s,;|]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const colors = [];
    for (const token of tokens) {
      const hex = normalizeHex(token.startsWith("#") ? token : `#${token}`, null);
      if (hex) colors.push(hex);
    }
    if (colors.length < 2) return null;
    return colorsToStops(colors);
  }

  function hexToHsl(hex) {
    const n = normalizeHex(hex, "#ffffff");
    const r = parseInt(n.slice(1, 3), 16) / 255;
    const g = parseInt(n.slice(3, 5), 16) / 255;
    const b = parseInt(n.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
      a: 1,
    };
  }

  function buildLutFromStops(stops) {
    const sorted = normalizeStops(stops);
    const lut = new Array(256);
    const sample = (t) => {
      const x = clamp01(t);
      if (x <= sorted[0].t) return sorted[0].color;
      if (x >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].color;
      for (let i = 1; i < sorted.length; i += 1) {
        const a = sorted[i - 1];
        const b = sorted[i];
        if (x <= b.t) {
          const u = (x - a.t) / Math.max(1e-6, b.t - a.t);
          const ar = parseInt(a.color.slice(1, 3), 16);
          const ag = parseInt(a.color.slice(3, 5), 16);
          const ab = parseInt(a.color.slice(5, 7), 16);
          const br = parseInt(b.color.slice(1, 3), 16);
          const bg = parseInt(b.color.slice(3, 5), 16);
          const bb = parseInt(b.color.slice(5, 7), 16);
          const r = Math.round(ar + (br - ar) * u);
          const g = Math.round(ag + (bg - ag) * u);
          const bl = Math.round(ab + (bb - ab) * u);
          return `rgb(${r},${g},${bl})`;
        }
      }
      return sorted[sorted.length - 1].color;
    };
    for (let i = 0; i < 256; i += 1) {
      lut[i] = sample(i / 255);
    }
    return lut;
  }

  function hexToLumaGray(hex) {
    const h = normalizeHex(hex, "#808080");
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    // Rec. 709 luma → equal RGB channels (black / white only).
    const y = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    const xx = y.toString(16).padStart(2, "0");
    return `#${xx}${xx}${xx}`;
  }

  function forceStopsGrayscale(stops) {
    return normalizeStops(stops).map((stop) => ({
      t: stop.t,
      color: hexToLumaGray(stop.color),
    }));
  }

  function mountSharedGradientEditor(host, options = {}) {
    if (!host) return null;
    ensureStyles();
    host.replaceChildren();
    host.classList.add("sge-host");

    // mono / channels:"bw" → black/white stops only (optional; LCD uses color×luma now).
    const mono = options.mono === true || options.channels === "bw";
    host.dataset.channels = mono ? "bw" : "full";
    let stops = mono ? forceStopsGrayscale(options.stops) : normalizeStops(options.stops);
    let activeIndex = 0;
    let activePresetId = "";
    let colorWidget = null;
    const presetList = mono ? PRESETS_BW : PRESETS;
    const hintText = options.hint
      || (mono
        ? "Black / white gradient · select a stop · brightness only"
        : "Select a stop to edit · presets fill stops + hex list · live audition on the face");

    const root = document.createElement("div");
    root.className = "sge-root";
    root.innerHTML = `
      <div class="sge-bar-wrap" data-sge-bar-wrap title="Click bar to add a stop at that position">
        <div class="sge-bar" data-sge-bar></div>
      </div>
      <div class="sge-stops" data-sge-stops aria-label="Gradient stops"></div>
      <div class="sge-color-widget-host" data-sge-color-widget></div>
      <div class="sge-row">
        <span>Pos</span>
        <input type="text" data-sge-pos inputmode="decimal" aria-label="Stop position 0–1">
        <span style="font-size:0.66rem;opacity:0.6">0–1</span>
      </div>
      <div class="sge-actions">
        <button type="button" data-sge-add>+ Stop</button>
        <button type="button" data-sge-remove>− Stop</button>
        <button type="button" data-sge-copy>Copy hex</button>
        <button type="button" data-sge-paste>Paste hex</button>
      </div>
      <div class="sge-section-label">Presets</div>
      <div class="sge-presets" data-sge-presets></div>
      <div class="sge-section-label">Hex list</div>
      <textarea class="sge-hex" data-sge-list rows="2" spellcheck="false"
        aria-label="Gradient as hex list"></textarea>
      <div class="sge-hint" data-sge-hint></div>
    `;
    host.appendChild(root);
    const hintEl = root.querySelector("[data-sge-hint]");
    if (hintEl) {
      hintEl.textContent = hintText;
    }

    const barWrap = root.querySelector("[data-sge-bar-wrap]");
    const bar = root.querySelector("[data-sge-bar]");
    const stopsRow = root.querySelector("[data-sge-stops]");
    const posInput = root.querySelector("[data-sge-pos]");
    const listArea = root.querySelector("[data-sge-list]");
    const presetsRow = root.querySelector("[data-sge-presets]");
    const colorHost = root.querySelector("[data-sge-color-widget]");
    const addBtn = root.querySelector("[data-sge-add]");
    const removeBtn = root.querySelector("[data-sge-remove]");
    const copyBtn = root.querySelector("[data-sge-copy]");
    const pasteBtn = root.querySelector("[data-sge-paste]");

    const emit = () => {
      options.onChange?.(normalizeStops(stops));
    };

    const destroyColorWidget = () => {
      try {
        colorWidget?.destroy?.();
      } catch {
        // ignore
      }
      colorWidget = null;
      if (colorHost) colorHost.replaceChildren();
    };

    const mountActiveColorWidget = () => {
      destroyColorWidget();
      if (!colorHost) return;
      colorHost.dataset.channels = mono ? "bw" : "full";
      const stop = stops[activeIndex];
      if (!stop) return;
      const hsl = mono
        ? { h: 0, s: 0, l: hexToHsl(stop.color).l, a: 1 }
        : hexToHsl(stop.color);
      const mount = typeof global.mountColorWidget === "function"
        ? global.mountColorWidget
        : (typeof window !== "undefined" ? window.mountColorWidget : null);
      if (typeof mount !== "function") {
        // Fallback: native color input if SoundColorWidget not loaded yet.
        const input = document.createElement("input");
        input.type = "color";
        input.value = stop.color;
        input.setAttribute("aria-label", "Stop color");
        input.style.width = "100%";
        input.style.height = "32px";
        input.style.border = "none";
        input.style.padding = "0";
        input.style.background = "transparent";
        input.addEventListener("input", () => {
          stops[activeIndex].color = normalizeHex(input.value, stop.color);
          activePresetId = "";
          renderBar();
          renderPresets();
          listArea.value = stopsToHexList(stops);
          emit();
        });
        colorHost.appendChild(input);
        return;
      }
      colorWidget = mount(colorHost, {
        label: mono ? "Level" : "Stop",
        channels: mono ? "bw" : "full",
        mono,
        ...hsl,
        onChange: (color) => {
          let nextHex = normalizeHex(color?.hex, stops[activeIndex].color);
          if (mono) {
            nextHex = hexToLumaGray(nextHex);
          }
          stops[activeIndex].color = nextHex;
          activePresetId = "";
          renderBar();
          renderPresets();
          listArea.value = stopsToHexList(stops);
          emit();
        },
      });
    };

    const renderPresets = () => {
      presetsRow.replaceChildren();
      for (const preset of presetList) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sge-preset";
        btn.dataset.active = String(preset.id === activePresetId);
        btn.textContent = preset.label;
        btn.title = preset.colors.join(", ");
        btn.addEventListener("click", () => {
          stops = mono
            ? forceStopsGrayscale(colorsToStops(preset.colors))
            : colorsToStops(preset.colors);
          activeIndex = 0;
          activePresetId = preset.id;
          renderBar();
          renderControls();
          emit();
        });
        presetsRow.appendChild(btn);
      }
    };

    const renderBar = () => {
      bar.style.background = stopsToCss(stops);
      stopsRow.replaceChildren();
      stops.forEach((stop, index) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "sge-stop-cell";
        cell.dataset.index = String(index);
        cell.dataset.active = String(index === activeIndex);
        cell.title = `${stop.color} @ ${stop.t.toFixed(3)}`;
        const swatch = document.createElement("span");
        swatch.className = "sge-stop-swatch";
        swatch.style.background = stop.color;
        const pos = document.createElement("span");
        pos.className = "sge-stop-pos";
        pos.textContent = stop.t.toFixed(2);
        cell.append(swatch, pos);
        cell.addEventListener("click", (event) => {
          event.preventDefault();
          activeIndex = index;
          renderBar();
          renderControls();
        });
        stopsRow.appendChild(cell);
      });
    };

    const renderControls = () => {
      activeIndex = Math.max(0, Math.min(stops.length - 1, activeIndex));
      const stop = stops[activeIndex];
      posInput.value = String(Number(stop.t.toFixed(4)));
      posInput.disabled = activeIndex === 0 || activeIndex === stops.length - 1;
      removeBtn.disabled = stops.length <= 2;
      listArea.value = stopsToHexList(stops);
      renderPresets();
      mountActiveColorWidget();
    };

    barWrap.addEventListener("pointerdown", (event) => {
      const rect = barWrap.getBoundingClientRect();
      const t = clamp01((event.clientX - rect.left) / Math.max(1, rect.width));
      let i = 1;
      while (i < stops.length && stops[i].t < t) i += 1;
      const a = stops[i - 1];
      stops.splice(i, 0, { t, color: a.color });
      activeIndex = i;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });

    posInput.addEventListener("change", () => {
      if (activeIndex <= 0 || activeIndex >= stops.length - 1) return;
      const t = clamp01(posInput.value);
      const minT = stops[activeIndex - 1].t + 0.001;
      const maxT2 = stops[activeIndex + 1].t - 0.001;
      stops[activeIndex].t = Math.max(minT, Math.min(maxT2, t));
      const moved = stops[activeIndex];
      stops.sort((a, b) => a.t - b.t);
      activeIndex = stops.indexOf(moved);
      if (activeIndex < 0) activeIndex = 1;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });

    addBtn.addEventListener("click", () => {
      const i = Math.min(activeIndex, stops.length - 2);
      const a = stops[i];
      const b = stops[i + 1];
      const t = (a.t + b.t) * 0.5;
      stops.splice(i + 1, 0, { t, color: a.color });
      activeIndex = i + 1;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });
    removeBtn.addEventListener("click", () => {
      if (stops.length <= 2) return;
      if (activeIndex <= 0 || activeIndex >= stops.length - 1) {
        activeIndex = Math.min(stops.length - 2, Math.max(1, activeIndex));
      }
      if (activeIndex <= 0 || activeIndex >= stops.length - 1) return;
      stops.splice(activeIndex, 1);
      activeIndex = Math.min(activeIndex, stops.length - 1);
      stops[0].t = 0;
      stops[stops.length - 1].t = 1;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });
    copyBtn.addEventListener("click", async () => {
      const text = stopsToHexList(stops);
      listArea.value = text;
      try {
        await navigator.clipboard?.writeText?.(text);
      } catch {
        listArea.select();
        document.execCommand?.("copy");
      }
    });
    pasteBtn.addEventListener("click", async () => {
      let text = listArea.value;
      try {
        const clip = await navigator.clipboard?.readText?.();
        if (clip) text = clip;
      } catch {
        // use textarea
      }
      const parsed = parseHexList(text);
      if (!parsed) return;
      stops = parsed;
      activeIndex = 0;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });
    listArea.addEventListener("change", () => {
      const parsed = parseHexList(listArea.value);
      if (!parsed) return;
      stops = mono ? forceStopsGrayscale(parsed) : parsed;
      activeIndex = 0;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });

    // If color widget loads after mount, remount picker once.
    const onColorReady = () => {
      mountActiveColorWidget();
    };
    window.addEventListener("color-widget-ready", onColorReady);

    renderBar();
    renderControls();

    return {
      destroy() {
        window.removeEventListener("color-widget-ready", onColorReady);
        destroyColorWidget();
        host.replaceChildren();
      },
      setStops(next) {
        stops = mono ? forceStopsGrayscale(next) : normalizeStops(next);
        activeIndex = 0;
        activePresetId = "";
        renderBar();
        renderControls();
      },
      getStops() {
        return mono ? forceStopsGrayscale(stops) : normalizeStops(stops);
      },
    };
  }

  /** Build phosphor-style stops from a peak hex (+ optional floor). */
  function phosphorStopsFromPeak(peakHex, backgroundHex = "#000000") {
    const peak = normalizeHex(peakHex, "#75ebff");
    const bg = normalizeHex(backgroundHex, "#000000");
    const mixHex = (a, b, t) => {
      const ar = parseInt(a.slice(1, 3), 16);
      const ag = parseInt(a.slice(3, 5), 16);
      const ab = parseInt(a.slice(5, 7), 16);
      const br = parseInt(b.slice(1, 3), 16);
      const bg_ = parseInt(b.slice(3, 5), 16);
      const bb = parseInt(b.slice(5, 7), 16);
      const m = (x, y) => Math.round(x + (y - x) * t);
      const r = m(ar, br).toString(16).padStart(2, "0");
      const g = m(ag, bg_).toString(16).padStart(2, "0");
      const bl = m(ab, bb).toString(16).padStart(2, "0");
      return `#${r}${g}${bl}`;
    };
    return [
      { t: 0, color: bg },
      { t: 0.18, color: mixHex(bg, peak, 0.28) },
      { t: 0.55, color: mixHex(bg, peak, 0.7) },
      { t: 1, color: peak },
    ];
  }

  /** 256×RGB bytes for energy present LUT (or spectrogram). */
  function buildLutRgbBytes(stops) {
    const lut = buildLutFromStops(stops);
    const rgb = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i += 1) {
      const s = String(lut[i] || "").trim();
      let r = 255;
      let g = 255;
      let b = 255;
      const hex = s.match(/^#([0-9a-f]{6})$/i);
      const rgbm = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (hex) {
        r = parseInt(hex[1].slice(0, 2), 16);
        g = parseInt(hex[1].slice(2, 4), 16);
        b = parseInt(hex[1].slice(4, 6), 16);
      } else if (rgbm) {
        r = Number(rgbm[1]) || 0;
        g = Number(rgbm[2]) || 0;
        b = Number(rgbm[3]) || 0;
      }
      const o = i * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
    return rgb;
  }

  /**
   * Display-settings profiles: every form type that shows the gradient
   * selector must register here. Adding a face = one entry; UI comes free.
   */
  const DISPLAY_PROFILES = Object.freeze({
    spectrogramBurn: Object.freeze({
      channels: "color",
      defaultStops: "spectrogram",
      hint: "Select a stop · presets · live audition on the spectrogram",
    }),
    scope2d: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the phosphor face",
    }),
    phosphorLight: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the phosphor face",
    }),
    xyPad: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the XY pad trail",
    }),
    dot: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the phosphor face",
    }),
    lineBurn: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the burn trail",
    }),
    // Videoscope / bank / hypersaw: mono energy phosphor (same LUT as scope2d).
    // Required so usesDisplayGradient(formType) is true and the host mounts.
    videoscopeBurn: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the videoscope face",
    }),
    oscilloscopeBankBurn: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the bank face",
    }),
    hypersawBurn: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the hypersaw face",
    }),
    // Same color×luma scheme as 2D phosphor: multi-stop color LUT maps
    // underlying light amount (energy / segment intensity) → color.
    numberReadout: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Select a stop · presets · live audition on the LCD (energy → color)",
    }),
    // LED: mono energy (level × brightness) → free multi-stop LUT (may go bright→dim).
    ledLamp: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Energy → color · stops may go bright→dim · live on the lamp",
    }),
    // RGB Shape: Position param samples this LUT for fill color.
    rgbShapeFace: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Shape fill · Position param samples along the gradient",
    }),
    // RGB Soft Fractal: Julia smooth-iter → psychedelic gradient.
    rgbFractalFace: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Julia escape → color · vivid multi-stop gradient · live evolving",
    }),
    // Matrix faces: cell energy (black→white underlying) → multi-stop LUT.
    // defaultStops "matrix" = digital-rain ramp (green body, white tip).
    matrixFace: Object.freeze({
      channels: "color",
      defaultStops: "matrix",
      hint: "Energy → color · mono cell brightness mapped through the gradient",
    }),
    matrixWaterfallFace: Object.freeze({
      channels: "color",
      defaultStops: "matrix",
      hint: "Energy → color · rain mono brightness mapped through the gradient",
    }),
    matrixDisplayFace: Object.freeze({
      channels: "color",
      defaultStops: "matrix",
      hint: "Energy → color · plate mono brightness mapped through the gradient",
    }),
  });

  const DEFAULT_BW_STOPS = Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.35, color: "#404040" }),
    Object.freeze({ t: 1, color: "#e8e8e8" }),
  ]);

  function defaultStopsForKind(kind) {
    if (kind === "bw") {
      return DEFAULT_BW_STOPS.map((s) => ({ t: s.t, color: s.color }));
    }
    if (kind === "spectrogram") {
      return DEFAULT_STOPS.map((s) => ({ t: s.t, color: s.color }));
    }
    if (kind === "matrix") {
      return DEFAULT_MATRIX_STOPS.map((s) => ({ t: s.t, color: s.color }));
    }
    // phosphor / color energy faces (including numberReadout LCD)
    return DEFAULT_PHOSPHOR_STOPS.map((s) => ({ t: s.t, color: s.color }));
  }

  function normalizeStopsWithOptions(raw, options = {}) {
    const channels = options.channels === "bw" || options.mono === true ? "bw" : "color";
    const fallback = Array.isArray(options.fallbackStops) && options.fallbackStops.length >= 2
      ? options.fallbackStops.map((s) => ({ t: s.t, color: s.color }))
      : defaultStopsForKind(channels === "bw" ? "bw" : (options.defaultStops || "phosphor"));
    const list = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === "object" && Array.isArray(raw.gradientStops)
        ? raw.gradientStops
        : (raw && typeof raw === "object" && Array.isArray(raw.gradient)
          ? raw.gradient
          : null));
    let stops = normalizeStops(list && list.length ? list : fallback);
    if (!Array.isArray(stops) || stops.length < 2) {
      stops = fallback.map((s) => ({ t: s.t, color: s.color }));
    }
    if (channels === "bw") {
      stops = forceStopsGrayscale(stops);
    }
    return stops;
  }

  function mvp() {
    return typeof global.nodeGraphMvp !== "undefined" ? global.nodeGraphMvp : null;
  }

  function getActiveEditor() {
    const m = mvp();
    return m?.gradientSelector || m?.sharedGradientEditor || m?.spectrogramGradientEditor || null;
  }

  function setActiveEditor(editor) {
    const m = mvp();
    if (!m) {
      return;
    }
    // Single live instance key; legacy names are mirrors only.
    m.gradientSelector = editor;
    m.sharedGradientEditor = editor;
    m.spectrogramGradientEditor = editor;
  }

  function clearActiveEditor() {
    const editor = getActiveEditor();
    try {
      editor?.destroy?.();
    } catch (_) { /* ignore */ }
    const m = mvp();
    if (m) {
      m.gradientSelector = null;
      m.sharedGradientEditor = null;
      m.spectrogramGradientEditor = null;
    }
  }

  /**
   * Mount or update the selector in a display-settings popover.
   * Single path for every face that uses a gradient.
   */
  function syncDisplaySettings(popover, visible) {
    const host = popover?.querySelector?.("[data-gradient-selector-host], [data-shared-gradient-host], [data-spectrogram-gradient-host]")
      || document.getElementById("nodeTraceDisplayGradientSelectorHost")
      || document.getElementById("nodeTraceDisplaySharedGradientHost")
      || document.getElementById("nodeTraceDisplaySpectrogramGradientHost");
    if (!host) {
      return null;
    }
    if (!visible) {
      clearActiveEditor();
      host.dataset.sgeMounted = "0";
      return null;
    }
    const formType = typeof global.nodeGraphTraceDisplaySettingsFormType === "function"
      ? global.nodeGraphTraceDisplaySettingsFormType()
      : "";
    const profile = DISPLAY_PROFILES[formType] || null;
    if (!profile) {
      clearActiveEditor();
      host.dataset.sgeMounted = "0";
      return null;
    }
    const channels = profile.channels === "bw" ? "bw" : "color";
    const settings = typeof global.nodeGraphTraceDisplayCurrentSettingsForFormType === "function"
      ? global.nodeGraphTraceDisplayCurrentSettingsForFormType(formType)
      : null;
    let stops = settings?.gradientStops;
    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      if (channels === "bw" && settings) {
        const peak = settings.color || settings.dot1Color || "#e8e8e8";
        const bg = settings.background || settings.backgroundColor || "#000000";
        stops = normalizeStopsWithOptions(
          [{ t: 0, color: bg }, { t: 1, color: peak }],
          { channels: "bw", defaultStops: "bw" },
        );
      } else if (typeof global.nodeGraphPhosphorGradientStopsFromSettings === "function") {
        stops = global.nodeGraphPhosphorGradientStopsFromSettings(settings || {});
      } else {
        stops = defaultStopsForKind(profile.defaultStops || "phosphor");
      }
    }
    stops = normalizeStopsWithOptions(stops, {
      channels,
      defaultStops: profile.defaultStops,
    });

    const channelKey = channels === "bw" ? "bw" : "full";
    const active = getActiveEditor();
    if (
      active?.setStops
      && host.dataset.sgeMounted === "1"
      && host.dataset.sgeChannels === channelKey
    ) {
      active.setStops(stops);
      return active;
    }
    if (active?.destroy) {
      try {
        active.destroy();
      } catch (_) { /* ignore */ }
    }
    host.dataset.sgeMounted = "1";
    host.dataset.sgeChannels = channelKey;
    const editor = mountSharedGradientEditor(host, {
      stops,
      mono: channels === "bw",
      channels: channels === "bw" ? "bw" : "full",
      hint: profile.hint,
      onChange() {
        if (typeof global.applyNodeGraphTraceDisplaySettingsForm === "function") {
          global.applyNodeGraphTraceDisplaySettingsForm({ persist: "debounce", record: false });
        }
      },
    });
    setActiveEditor(editor);
    return editor;
  }

  const NodeGraphGradientSelector = Object.freeze({
    CHANNELS_COLOR: "color",
    CHANNELS_BW: "bw",
    HOST_SELECTOR: "[data-gradient-selector-host], [data-shared-gradient-host], [data-spectrogram-gradient-host]",
    HOST_ATTR: "data-gradient-selector-host",
    /** @readonly formType → profile (channels, hint, defaultStops) */
    displayProfiles: DISPLAY_PROFILES,
    usesDisplayGradient(formType) {
      return Boolean(DISPLAY_PROFILES[formType]);
    },
    profileForDisplay(formType) {
      return DISPLAY_PROFILES[formType] || null;
    },
    defaultStops(kind = "phosphor") {
      return defaultStopsForKind(kind);
    },
    normalizeStops(raw, options = {}) {
      return normalizeStopsWithOptions(raw, options);
    },
    mount(host, options = {}) {
      const profile = options.profile && DISPLAY_PROFILES[options.profile]
        ? DISPLAY_PROFILES[options.profile]
        : null;
      const channels = options.channels === "bw" || options.mono === true || profile?.channels === "bw"
        ? "bw"
        : "color";
      return mountSharedGradientEditor(host, {
        ...options,
        mono: channels === "bw",
        channels: channels === "bw" ? "bw" : "full",
        hint: options.hint || profile?.hint,
        stops: normalizeStopsWithOptions(
          options.stops,
          { channels, defaultStops: profile?.defaultStops || options.defaultStops },
        ),
      });
    },
    syncDisplaySettings,
    getActive: getActiveEditor,
    setActive: setActiveEditor,
    clearActive: clearActiveEditor,
  });

  // ── Canonical export ─────────────────────────────────────────────────────
  global.NodeGraphGradientSelector = NodeGraphGradientSelector;

  // ── Legacy aliases (deprecated — all point at the same implementation) ───
  global.mountSharedGradientEditor = (host, options) => NodeGraphGradientSelector.mount(host, options);
  global.mountPhosphorGradientEditor = global.mountSharedGradientEditor;
  global.mountSpectrogramGradientEditor = global.mountSharedGradientEditor;
  global.normalizeSharedGradientStops = (raw) => NodeGraphGradientSelector.normalizeStops(raw);
  global.spectrogramNormalizeGradientStops = global.normalizeSharedGradientStops;
  global.phosphorNormalizeGradientStops = global.normalizeSharedGradientStops;
  global.buildSharedGradientLut = buildLutFromStops;
  global.spectrogramBuildGradientLut = buildLutFromStops;
  global.phosphorBuildGradientLut = buildLutFromStops;
  global.phosphorBuildGradientLutRgb = buildLutRgbBytes;
  global.phosphorStopsFromPeak = phosphorStopsFromPeak;
  global.SHARED_DEFAULT_GRADIENT_STOPS = DEFAULT_STOPS;
  global.SPECTROGRAM_DEFAULT_GRADIENT_STOPS = DEFAULT_STOPS;
  global.PHOSPHOR_DEFAULT_GRADIENT_STOPS = DEFAULT_PHOSPHOR_STOPS;
  global.MATRIX_DEFAULT_GRADIENT_STOPS = DEFAULT_MATRIX_STOPS;
  global.SHARED_GRADIENT_PRESETS = PRESETS;
  global.SPECTROGRAM_GRADIENT_PRESETS = PRESETS;
  global.PHOSPHOR_GRADIENT_PRESETS = PRESETS;
  global.NODE_GRAPH_GRADIENT_BW_DEFAULT_STOPS = DEFAULT_BW_STOPS;
})(typeof window !== "undefined" ? window : globalThis);
