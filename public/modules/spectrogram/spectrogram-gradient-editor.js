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

  // Soft Fractal default: deep indigo floor → blue/magenta/orange psychedelic ramp → white.
  // Same stops as nodeGraphRgbFractalSettingsDefaults.gradientStops.
  const DEFAULT_SOFT_FRACTAL_STOPS = Object.freeze([
    { t: 0, color: "#050018" },
    { t: 0.1, color: "#12083a" },
    { t: 0.22, color: "#1a1cff" },
    { t: 0.38, color: "#b000ff" },
    { t: 0.52, color: "#ff1493" },
    { t: 0.66, color: "#ff6a00" },
    { t: 0.8, color: "#ffd54a" },
    { t: 0.92, color: "#fff6c8" },
    { t: 1, color: "#ffffff" },
  ]);

  // Black/white channel presets only (no hue/RGB ramps). Labels are lowercase.
  const PRESETS_BW = Object.freeze([
    {
      id: "bw-basic",
      label: "b/w",
      colors: ["#000000", "#ffffff"],
    },
    {
      id: "grayscale",
      label: "gray",
      colors: ["#000000", "#404040", "#a0a0a0", "#ffffff"],
    },
    {
      id: "soft",
      label: "soft",
      colors: ["#000000", "#1a1a1a", "#666666", "#e0e0e0", "#ffffff"],
    },
    {
      id: "lcd",
      label: "lcd",
      colors: ["#0a0a0a", "#2a2a2a", "#c8c8c8", "#f5f5f5"],
    },
  ]);

  // From prettyscope-revival/ColorMaps/*.xml (ARGB → #rrggbb, keep stop t).
  const PRESETS_PRETTYSCOPE = Object.freeze([
    {
      id: "ps-analog-green",
      label: "analog green",
      colors: ["#000000", "#00ff00"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 1, color: "#00ff00" }),
      ]),
    },
    {
      id: "ps-analog-red",
      label: "analog red",
      colors: ["#000000", "#ff0000"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 1, color: "#ff0000" }),
      ]),
    },
    {
      id: "ps-blackout",
      label: "blackout",
      colors: ["#000000", "#ffffff"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 1, color: "#ffffff" }),
      ]),
    },
    {
      id: "ps-whiteout",
      label: "whiteout",
      colors: ["#ffffff", "#000000"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#ffffff" }),
        Object.freeze({ t: 1, color: "#000000" }),
      ]),
    },
    {
      id: "ps-blue-cream",
      label: "blue cream",
      colors: ["#000000", "#004a8a", "#0093b9", "#5fb59c", "#b3dc77", "#f3fa82", "#ffffff"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 0.167, color: "#004a8a" }),
        Object.freeze({ t: 0.333, color: "#0093b9" }),
        Object.freeze({ t: 0.5, color: "#5fb59c" }),
        Object.freeze({ t: 0.667, color: "#b3dc77" }),
        Object.freeze({ t: 0.833, color: "#f3fa82" }),
        Object.freeze({ t: 1, color: "#ffffff" }),
      ]),
    },
    {
      id: "ps-fire-ice",
      label: "fire ice",
      colors: ["#000000", "#ffff00", "#ff0000", "#0000ff", "#00ffff", "#ffffff"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 0.167, color: "#ffff00" }),
        Object.freeze({ t: 0.333, color: "#ff0000" }),
        Object.freeze({ t: 0.667, color: "#0000ff" }),
        Object.freeze({ t: 0.833, color: "#00ffff" }),
        Object.freeze({ t: 1, color: "#ffffff" }),
      ]),
    },
    {
      id: "ps-hot",
      label: "hot crt",
      colors: [
        "#000000",
        "#7f0000",
        "#b30000",
        "#e63300",
        "#f8782b",
        "#ffc080",
        "#ffe6cc",
        "#ffffff",
      ],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 0.143, color: "#7f0000" }),
        Object.freeze({ t: 0.286, color: "#b30000" }),
        Object.freeze({ t: 0.429, color: "#e63300" }),
        Object.freeze({ t: 0.571, color: "#f8782b" }),
        Object.freeze({ t: 0.714, color: "#ffc080" }),
        Object.freeze({ t: 0.857, color: "#ffe6cc" }),
        Object.freeze({ t: 1, color: "#ffffff" }),
      ]),
    },
    {
      id: "ps-light-blue",
      label: "light blue",
      colors: ["#ffffff", "#0000ff"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#ffffff" }),
        Object.freeze({ t: 1, color: "#0000ff" }),
      ]),
    },
    {
      id: "ps-light-green",
      label: "light green",
      colors: ["#edfffc", "#11c311"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#edfffc" }),
        Object.freeze({ t: 1, color: "#11c311" }),
      ]),
    },
    {
      id: "ps-pretty-pink",
      label: "pretty pink",
      colors: ["#000230", "#6500ad", "#ff00c8", "#ffc7e5"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000230" }),
        Object.freeze({ t: 0.3, color: "#6500ad" }),
        Object.freeze({ t: 0.5, color: "#ff00c8" }),
        Object.freeze({ t: 1, color: "#ffc7e5" }),
      ]),
    },
    {
      id: "ps-rainbow",
      label: "rainbow",
      colors: ["#000000", "#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000000" }),
        Object.freeze({ t: 0.2, color: "#0000ff" }),
        Object.freeze({ t: 0.4, color: "#00ffff" }),
        Object.freeze({ t: 0.6, color: "#00ff00" }),
        Object.freeze({ t: 0.8, color: "#ffff00" }),
        Object.freeze({ t: 1, color: "#ff0000" }),
      ]),
    },
  ]);

  const PRESETS = Object.freeze([
    {
      id: "classic",
      label: "classic",
      colors: ["#000000", "#000080", "#00c0ff", "#ffff00", "#ffffff"],
    },
    {
      id: "grayscale",
      label: "gray",
      colors: ["#000000", "#404040", "#a0a0a0", "#ffffff"],
    },
    {
      id: "hot",
      label: "hot",
      colors: ["#000000", "#7f0000", "#ff0000", "#ffff00", "#ffffff"],
    },
    {
      id: "inferno",
      label: "inferno",
      colors: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
    },
    {
      id: "magma",
      label: "magma",
      colors: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
    },
    {
      id: "viridis",
      label: "viridis",
      colors: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    },
    {
      id: "ice",
      label: "ice",
      colors: ["#000000", "#001a4d", "#0066cc", "#66ccff", "#ffffff"],
    },
    {
      id: "bone",
      label: "bone",
      colors: ["#000000", "#2b2b4d", "#7a7a9a", "#d0c8c0", "#ffffff"],
    },
    {
      id: "phosphor",
      label: "phosphor",
      colors: ["#000000", "#0a2a33", "#3a9aab", "#75ebff"],
    },
    {
      id: "amber",
      label: "amber",
      colors: ["#000000", "#3a2000", "#c07010", "#ffc040"],
    },
    {
      id: "green",
      label: "p1 green",
      colors: ["#000000", "#0a2810", "#2a8840", "#80ff90"],
    },
    {
      // App-wide digital-rain ramp (not Matrix-only) — black → green → white tip.
      id: "matrix",
      label: "matrix",
      colors: ["#000000", "#001a08", "#0a5c20", "#1ecf55", "#7dff9a", "#ffffff"],
    },
    {
      // Soft Fractal module default (uneven stop positions — use `stops` not even colors).
      id: "softFractal",
      label: "soft fractal",
      colors: [
        "#050018",
        "#12083a",
        "#1a1cff",
        "#b000ff",
        "#ff1493",
        "#ff6a00",
        "#ffd54a",
        "#fff6c8",
        "#ffffff",
      ],
      stops: DEFAULT_SOFT_FRACTAL_STOPS,
    },
    {
      id: "midnight",
      label: "midnight",
      colors: ["#000230", "#1927e6", "#b05cff", "#ffc7e5"],
      stops: Object.freeze([
        Object.freeze({ t: 0, color: "#000230" }),
        Object.freeze({ t: 0.43, color: "#1927e6" }),
        Object.freeze({ t: 0.88, color: "#b05cff" }),
        Object.freeze({ t: 1, color: "#ffc7e5" }),
      ]),
    },
    // PrettyScope CRT maps (prettyscope-revival/ColorMaps).
    ...PRESETS_PRETTYSCOPE,
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
    // Compact layout. !important only where popover button chrome wins.
    style.textContent = `
      .sge-root {
        --sge-bar-h: 22px;
        --sge-title-h: 20px;
        --sge-plane-h: 56px;
        --sge-hue-h: 18px;
        --sge-stack-h: calc(var(--sge-title-h) + var(--sge-plane-h) + var(--sge-hue-h));
        --sge-stack-bw-h: calc(var(--sge-title-h) + var(--sge-plane-h));
        --sge-ink-dim: rgba(248, 252, 255, 0.62);
        --sge-active: #f1b84b;
        display: grid;
        gap: 0;
        min-width: 0;
        user-select: none;
      }

      /* Defeat metadata-popover-grid button chrome on unstyled SGE cells. */
      .sge-root button.sge-stop-cell,
      .sge-root button.sge-preset,
      .sge-color-widget-host .scw-control {
        appearance: none !important;
        -webkit-appearance: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        outline: none !important;
      }
      .sge-root button.sge-stop-cell:hover,
      .sge-root button.sge-stop-cell:focus,
      .sge-root button.sge-stop-cell:focus-visible,
      .sge-root button.sge-preset:hover,
      .sge-root button.sge-preset:focus,
      .sge-root button.sge-preset:focus-visible {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
      }

      /* Gradient bar + per-stop cells */
      .sge-bar-wrap {
        position: relative;
        height: var(--sge-bar-h);
        overflow: hidden;
        cursor: var(--node-dot-cursor, crosshair);
      }
      .sge-bar { position: absolute; inset: 0; }
      .sge-stops {
        display: flex;
        width: 100%;
        min-width: 0;
      }
      .sge-root button.sge-stop-cell {
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        width: auto !important;
        height: auto !important;
        min-width: 0;
        min-height: 0 !important;
        color: inherit !important;
        cursor: pointer;
      }
      .sge-stop-swatch {
        display: block;
        width: 100%;
        height: var(--sge-bar-h);
        min-height: var(--sge-bar-h);
        max-height: var(--sge-bar-h);
      }
      .sge-stop-cell[data-active="true"] .sge-stop-swatch {
        outline: 2px solid var(--sge-active);
        outline-offset: -2px;
      }
      .sge-stop-pos {
        margin: 0;
        padding: 0;
        font-size: 0.68rem;
        line-height: 1.15;
        color: var(--sge-ink-dim);
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Presets — flush 2-col tiles, black title on gradient */
      .sge-presets {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
      }
      .sge-root button.sge-preset {
        position: relative;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 100% !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        padding: 5px 6px !important;
        color: #000 !important;
        font-size: 0.68rem;
        cursor: pointer;
        overflow: hidden;
      }
      .sge-root button.sge-preset:hover,
      .sge-root button.sge-preset:focus-visible {
        filter: brightness(1.06);
        color: #000 !important;
      }
      .sge-root button.sge-preset[data-active="true"] {
        filter: brightness(1.1);
        color: #000 !important;
      }
      .sge-preset-swatch {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .sge-preset-label {
        position: relative;
        z-index: 1;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: #000;
        text-shadow: 0 0 2px rgba(255, 255, 255, 0.55);
      }

      /* Stop color widget (title · plane · hue) — fixed stack height */
      .sge-color-widget-host {
        width: 100%;
        min-width: 0;
        min-height: var(--sge-stack-h);
        overflow: hidden;
      }
      .sge-color-widget-host.scw-mount {
        display: grid;
        place-items: stretch;
        min-height: var(--sge-stack-h);
      }
      .sge-color-widget-host .scw-root {
        height: auto !important;
        min-height: var(--sge-stack-h) !important;
        gap: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0;
        background: rgba(0, 0, 0, 0.28);
        grid-template-rows: var(--sge-title-h) var(--sge-plane-h) var(--sge-hue-h) !important;
      }
      .sge-color-widget-host .scw-root[data-channels="bw"] {
        min-height: var(--sge-stack-bw-h) !important;
        grid-template-rows: var(--sge-title-h) var(--sge-plane-h) 0 !important;
      }
      .sge-color-widget-host .scw-label {
        height: var(--sge-title-h) !important;
        min-height: var(--sge-title-h) !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 0;
      }
      .sge-color-widget-host .scw-control {
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
      }
      .sge-color-widget-host .scw-plane {
        height: var(--sge-plane-h) !important;
        min-height: var(--sge-plane-h) !important;
        max-height: var(--sge-plane-h) !important;
      }
      /* Hue spectrum from color-widget SSOT (padded track = half drag-dot). */
      .sge-color-widget-host .scw-hue,
      .sge-color-widget-host button.scw-control.scw-hue {
        height: var(--sge-hue-h) !important;
        min-height: var(--sge-hue-h) !important;
        max-height: var(--sge-hue-h) !important;
        background-color: transparent !important;
        background-image: var(--scw-hue-spectrum) !important;
        background-origin: padding-box !important;
        background-clip: padding-box !important;
        background-size: calc(100% - 2 * var(--scw-hue-pad, 5px)) 100% !important;
        background-position: var(--scw-hue-pad, 5px) 0 !important;
        background-repeat: no-repeat !important;
        overflow: hidden;
      }

      .sge-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
      }
      .sge-root .sge-actions button {
        width: 100%;
        min-width: 0;
        margin: 0;
        border-radius: 0;
        font-size: 0.72rem;
      }
      .sge-hex {
        width: 100%;
        min-height: 2.2em;
        margin: 0;
        padding: 2px 4px;
        border-radius: 0;
        font: inherit;
        font-size: 0.68rem;
        font-family: var(--node-mono-font, ui-monospace, monospace);
        resize: vertical;
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

  /**
   * Export stops for copy/paste into art tools (Photoshop Location 0–100%).
   * Always includes position so uneven gradients round-trip:
   *   #0a0a0a 0%, #00ff88 42%, #ffffff 100%
   * (Legacy color-only lists still parse — see parseHexList.)
   */
  function stopsToHexList(stops) {
    return normalizeStops(stops)
      .map((s) => {
        const pct = clamp01(s.t) * 100;
        const pos = Math.abs(pct - Math.round(pct)) < 0.05
          ? `${Math.round(pct)}%`
          : `${pct.toFixed(1).replace(/\.0$/, "")}%`;
        return `${s.color} ${pos}`;
      })
      .join(", ");
  }

  /**
   * Parse gradient list. Accepts:
   *   #rrggbb, #rrggbb, …                 → even spacing (legacy)
   *   #rrggbb 0%, #rrggbb 42%, …          → explicit % (Photoshop-style Location)
   *   #rrggbb 0, #rrggbb 0.42, #rrggbb 1  → 0–1 floats
   *   #rrggbb@0.42  /  #rrggbb:42%        → compact forms
   */
  function parseHexList(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;

    // Comma / semicolon / newline chunks keep "hex + pos" together.
    // Fall back to whitespace-split only when there are no separators
    // (legacy "#a #b #c" even-spacing lists).
    const hasChunkSep = /[,;\n|]/.test(raw);
    const chunks = (hasChunkSep
      ? raw.split(/[,;\n|]+/)
      : raw.split(/\s+/))
      .map((t) => t.trim())
      .filter(Boolean);

    const parsed = [];
    for (const chunk of chunks) {
      // Prefer 6-digit, then 3-digit; allow missing leading #.
      const hexMatch = chunk.match(/#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      if (!hexMatch) continue;
      const token = hexMatch[0].startsWith("#") ? hexMatch[0] : `#${hexMatch[0]}`;
      const hex = normalizeHex(token, null);
      if (!hex) continue;

      const after = chunk.slice(chunk.indexOf(hexMatch[0]) + hexMatch[0].length);
      // Position: optional @/: then number, optional %
      const posMatch = after.match(/[@:]?\s*([-+]?\d*\.?\d+)\s*(%)?/);
      let t = null;
      if (posMatch) {
        let v = Number(posMatch[1]);
        if (!Number.isFinite(v)) {
          t = null;
        } else if (posMatch[2] || v > 1) {
          // Percent (or bare 0–100 when >1): Location-style.
          t = clamp01(v / 100);
        } else {
          t = clamp01(v);
        }
      }
      parsed.push({ color: hex, t });
    }

    if (parsed.length < 2) return null;

    const allHaveT = parsed.every((p) => p.t != null && Number.isFinite(p.t));
    if (allHaveT) {
      return normalizeStops(parsed.map((p) => ({ t: p.t, color: p.color })));
    }

    // No positions (or partial) → even spacing on colors only (legacy).
    return colorsToStops(parsed.map((p) => p.color));
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

    const root = document.createElement("div");
    root.className = "sge-root";
    root.innerHTML = `
      <div class="sge-bar-wrap" data-sge-bar-wrap title="Click bar to add a stop at that position">
        <div class="sge-bar" data-sge-bar></div>
      </div>
      <div class="sge-stops" data-sge-stops aria-label="Gradient stops"></div>
      <div class="sge-color-widget-host" data-sge-color-widget></div>
      <div class="title-stepper" data-sge-pos-row title="Stop position 0–1 along the gradient">
        <span class="title-stepper-title">Pos</span>
        <span class="metadata-stepper-control">
          <button type="button" data-sge-pos-step="-1" aria-label="Decrease stop position">-</button>
          <input type="text" inputmode="decimal" data-sge-pos data-unit-stepper-drag data-unit-min="0" data-unit-max="1" readonly value="0" aria-label="Stop position 0–1" title="Stop position 0–1. Drag or −/+. Double-click to type.">
          <button type="button" data-sge-pos-step="1" aria-label="Increase stop position">+</button>
        </span>
      </div>
      <div class="sge-actions">
        <button type="button" data-sge-add aria-label="Add stop">+ Stop</button>
        <button type="button" data-sge-remove aria-label="Remove stop">− Stop</button>
      </div>
      <textarea class="sge-hex" data-sge-list rows="2" spellcheck="false"
        aria-label="Gradient stops as hex and position percent"
        title="Copy for art tools (Photoshop Location 0–100%). Format: #hex 0%, #hex 42%, #hex 100%. Color-only lists still import with even spacing."
        placeholder="#000000 0%, #00ff88 42%, #ffffff 100%"></textarea>
      <div class="sge-presets" data-sge-presets aria-label="Gradient presets"></div>
    `;
    host.appendChild(root);

    const barWrap = root.querySelector("[data-sge-bar-wrap]");
    const bar = root.querySelector("[data-sge-bar]");
    const stopsRow = root.querySelector("[data-sge-stops]");
    const posRow = root.querySelector("[data-sge-pos-row]");
    const posInput = root.querySelector("[data-sge-pos]");
    const posStepMinus = root.querySelector('[data-sge-pos-step="-1"]');
    const posStepPlus = root.querySelector('[data-sge-pos-step="1"]');
    const listArea = root.querySelector("[data-sge-list]");
    const presetsRow = root.querySelector("[data-sge-presets]");
    const colorHost = root.querySelector("[data-sge-color-widget]");
    const addBtn = root.querySelector("[data-sge-add]");
    const removeBtn = root.querySelector("[data-sge-remove]");

    const emit = () => {
      options.onChange?.(normalizeStops(stops));
    };

    const formatPos = (t) => {
      const n = clamp01(t);
      if (typeof formatNodeGraphTraceDisplaySetting === "function") {
        return formatNodeGraphTraceDisplaySetting(n);
      }
      return String(Number(n.toFixed(4)));
    };

    /** Apply stop position (middle stops only); keep neighbors ordered. */
    const applyPosValue = (rawT, { emitChange = true } = {}) => {
      if (activeIndex <= 0 || activeIndex >= stops.length - 1) {
        return false;
      }
      const minT = stops[activeIndex - 1].t + 0.001;
      const maxT = stops[activeIndex + 1].t - 0.001;
      const t = Math.max(minT, Math.min(maxT, clamp01(Number(rawT))));
      if (!Number.isFinite(t)) {
        return false;
      }
      stops[activeIndex].t = t;
      const moved = stops[activeIndex];
      stops.sort((a, b) => a.t - b.t);
      activeIndex = stops.indexOf(moved);
      if (activeIndex < 0) {
        activeIndex = 1;
      }
      activePresetId = "";
      if (posInput) {
        posInput.value = formatPos(stops[activeIndex].t);
      }
      renderBar();
      if (emitChange) {
        emit();
      }
      return true;
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
        // Fallback until SoundColorWidget boots — keep a visible control, then remount.
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
        // Title strip = current stop color (smart B/W ink from color-widget).
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
        btn.title = preset.colors.join(", ");
        // Gradient swatch behind the label.
        let swatchStops;
        if (Array.isArray(preset.stops) && preset.stops.length >= 2) {
          swatchStops = preset.stops.map((s) => ({ t: s.t, color: s.color }));
        } else {
          swatchStops = colorsToStops(preset.colors);
        }
        if (mono) swatchStops = forceStopsGrayscale(swatchStops);
        const swatch = document.createElement("span");
        swatch.className = "sge-preset-swatch";
        swatch.style.background = stopsToCss(swatchStops);
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "sge-preset-label";
        label.textContent = preset.label;
        btn.append(swatch, label);
        btn.addEventListener("click", () => {
          // Prefer explicit stops (preserves Soft Fractal / Matrix spacing); else even colors.
          let next;
          if (Array.isArray(preset.stops) && preset.stops.length >= 2) {
            next = preset.stops.map((s) => ({ t: s.t, color: s.color }));
          } else {
            next = colorsToStops(preset.colors);
          }
          stops = mono ? forceStopsGrayscale(next) : next;
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
      const locked = activeIndex === 0 || activeIndex === stops.length - 1;
      if (posInput) {
        posInput.value = formatPos(stop.t);
        posInput.disabled = locked;
        posInput.readOnly = true;
        posInput.classList.remove("trace-display-field-editing");
      }
      if (posStepMinus) posStepMinus.disabled = locked;
      if (posStepPlus) posStepPlus.disabled = locked;
      if (posRow) posRow.classList.toggle("is-disabled", locked);
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

    // −/+ step (app-wide 0…1 unit quantum 0.1).
    root.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-sge-pos-step]");
      if (!btn || btn.disabled || !posInput || posInput.disabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const direction = Number(btn.getAttribute("data-sge-pos-step")) < 0 ? -1 : 1;
      const base = Number(posInput.value);
      const baseValue = Number.isFinite(base) ? base : 0;
      let quantum = 0.1;
      if (typeof nodeGraphMagnitudeStepperQuantum === "function") {
        quantum = nodeGraphMagnitudeStepperQuantum(baseValue, direction);
      }
      if (quantum >= 1 - 1e-12) {
        quantum = 0.1;
      }
      let next = baseValue + direction * quantum;
      next = Math.round(next * 10) / 10;
      applyPosValue(next);
      renderControls();
    });

    /*
     * Drag is handled app-wide (capture on display-settings popover):
     *   beginNodeGraphUnitStepperDrag → data-unit-stepper-drag / data-sge-pos
     * Local pointerdown on the input never fires (text-protection stopPropagation).
     * We only consume the value via input/change.
     */
    posInput?.addEventListener("input", () => {
      if (!posInput || posInput.disabled) {
        return;
      }
      applyPosValue(posInput.value, { emitChange: true });
    });

    // Double-click to type (app-wide stepper field pattern).
    posInput?.addEventListener("dblclick", (event) => {
      if (posInput.disabled) {
        return;
      }
      posInput.readOnly = false;
      posInput.classList.add("trace-display-field-editing");
      posInput.focus();
      posInput.select?.();
      event.preventDefault();
      event.stopPropagation();
    });
    const commitPosEdit = () => {
      if (!posInput || posInput.readOnly) {
        return;
      }
      applyPosValue(posInput.value);
      posInput.readOnly = true;
      posInput.classList.remove("trace-display-field-editing");
      renderControls();
    };
    posInput?.addEventListener("keydown", (event) => {
      if (!posInput.readOnly && event.key === "Enter") {
        event.preventDefault();
        commitPosEdit();
        posInput.blur();
      } else if (!posInput.readOnly && event.key === "Escape") {
        event.preventDefault();
        posInput.readOnly = true;
        posInput.classList.remove("trace-display-field-editing");
        renderControls();
        posInput.blur();
      }
    });
    posInput?.addEventListener("change", commitPosEdit);
    posInput?.addEventListener("blur", commitPosEdit);

    addBtn.addEventListener("click", () => {
      // Always copy the *selected* stop color. Insert between that stop and its
      // neighbor (after selection, or before when the last stop is selected).
      const sel = Math.max(0, Math.min(stops.length - 1, activeIndex));
      const selectedColor = stops[sel].color;
      let leftIdx;
      let rightIdx;
      if (sel >= stops.length - 1) {
        // Last stop: insert in the gap before it (cannot place past t=1).
        leftIdx = Math.max(0, sel - 1);
        rightIdx = sel;
      } else {
        // First / middle: insert in the gap after the selection.
        leftIdx = sel;
        rightIdx = sel + 1;
      }
      const a = stops[leftIdx];
      const b = stops[rightIdx];
      const t = (a.t + b.t) * 0.5;
      stops.splice(rightIdx, 0, { t, color: selectedColor });
      activeIndex = rightIdx;
      activePresetId = "";
      renderBar();
      renderControls();
      emit();
    });
    removeBtn.addEventListener("click", () => {
      if (stops.length <= 2) return;
      const idx = Math.max(0, Math.min(stops.length - 1, activeIndex));
      if (idx === stops.length - 1) {
        // Remove end (t=1): leftward neighbor takes the 1.0 place and adopts
        // the removed stop's color (e.g. white at 1.0 → previous becomes white @ 1).
        const removed = stops[idx];
        stops.splice(idx, 1);
        const nextLast = stops[stops.length - 1];
        nextLast.t = 1;
        nextLast.color = removed.color;
        activeIndex = stops.length - 1;
      } else if (idx === 0) {
        // Remove start (t=0): rightward neighbor takes the 0.0 place and adopts
        // the removed stop's color.
        const removed = stops[0];
        stops.splice(0, 1);
        const nextFirst = stops[0];
        nextFirst.t = 0;
        nextFirst.color = removed.color;
        activeIndex = 0;
      } else {
        // Middle stop: delete only that stop; pin ends.
        stops.splice(idx, 1);
        activeIndex = Math.min(idx, stops.length - 1);
      }
      stops[0].t = 0;
      stops[stops.length - 1].t = 1;
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
      defaultStops: "softFractal",
      hint: "Julia escape → color · Soft Fractal preset · live evolving",
    }),
    // Evolve Field: full-square domain energy → multi-stop gradient.
    evolveFieldFace: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Full-plate fractal energy → color · Speed/Color/Seed on the module",
    }),
    // Fractal Brownian Field: mono field energy → multi-stop gradient.
    fbmFieldFace: Object.freeze({
      channels: "color",
      defaultStops: "phosphor",
      hint: "Field energy (black→white) → color · same gradient as scopes/LED",
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
    if (kind === "softFractal") {
      return DEFAULT_SOFT_FRACTAL_STOPS.map((s) => ({ t: s.t, color: s.color }));
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
        if (typeof global.markNodeGraphTraceDisplaySettingsDirty === "function") {
          global.markNodeGraphTraceDisplaySettingsDirty([
            "gradientStops",
            "gradient",
            "background",
            "backgroundColor",
          ]);
        }
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
