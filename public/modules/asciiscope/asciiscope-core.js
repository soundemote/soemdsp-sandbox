// Matrix Display — cell grid + closed glyph set (waterfall-first).
//
// Glyph policy (strict):
//   Fixed mono cells. Not full Unicode. Unknown codes → '.' or space.
//   Alphabet = density ramp + half-width katakana (classic digital rain).
//
// Residual policy (LCD / Number Readout):
//   Live glyph is hard while held. On change, previous glyph burns residual.
//   Residual energy decays (Trail). Static cells do not re-burn.
//
// Shared matrix cell helpers.
// Types: matrixWaterfall (rain), matrixDisplay (Info/Serial plate).

/**
 * Fallback mono ramp (cold → hot) for edge cases — not the rain charset.
 * No full block █; classic Matrix rain never used box-drawing solids.
 */
const MATRIX_GLYPH_RAMP = " .:+*#";

/**
 * Half-width katakana — primary Matrix “digital rain” set
 * (Simon Whiteley / film code: mirrored half-width kana + Latin + digits).
 */
const MATRIX_KATAKANA = (
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ"
);

/** Digits + Latin caps as seen in the film rain (alongside kana). */
const MATRIX_RAIN_LATIN = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Default rain table characters (no space, no block, no ASCII “density art”).
 * Order: kana first (most film-like), then digits/Latin.
 */
const MATRIX_RAIN_DEFAULT_CHARS = MATRIX_KATAKANA + MATRIX_RAIN_LATIN;

/** Full legal alphabet for this face (defaults + light punctuation users may add). */
const MATRIX_GLYPH_SET = (() => {
  const seen = new Set();
  const out = [];
  const add = (s) => {
    for (const ch of s) {
      if (!seen.has(ch)) {
        seen.add(ch);
        out.push(ch);
      }
    }
  };
  add(" ");
  add(MATRIX_RAIN_DEFAULT_CHARS);
  // Optional extras for custom tables / serial — still no █.
  add(MATRIX_GLYPH_RAMP);
  add("·;=%@<>_-|/\\");
  return out;
})();

const MATRIX_GLYPH_CODE_TO_CHAR = (() => {
  const map = new Map();
  for (const ch of MATRIX_GLYPH_SET) {
    map.set(ch.charCodeAt(0), ch);
  }
  // ASCII space
  map.set(32, " ");
  return map;
})();

const MATRIX_DEFAULT_MESSAGE = "READY";
const MATRIX_MAX_SLOTS = 256;

/**
 * Density → glyph grid size (shared by Waterfall / Plate / Asciiscope XY).
 *   density 0 → few cells = large characters
 *   density 1 → many cells = small characters
 * One glyph per cell (never multi-cell “stamp bricks”).
 * When density changes, sims remap phosphor energy into the new grid
 * instead of wiping — residual burns persist artistically.
 */
const MATRIX_MIN_COLUMNS = 8;
const MATRIX_MAX_COLUMNS = 96;
const MATRIX_MIN_ROWS = 6;
const MATRIX_MAX_ROWS = 64;
/** @deprecated aliases — buffer size is the density grid itself. */
const MATRIX_BUF_COLUMNS = MATRIX_MAX_COLUMNS;
const MATRIX_BUF_ROWS = MATRIX_MAX_ROWS;

/**
 * Design cell aspect (width/height) for fill layout — matches MATRIX_GL_CELL 8×12.
 * Grid rows are chosen so (cols×cellW)/(rows×cellH) ≈ stageAspect → no blank side bars.
 */
const MATRIX_CELL_ASPECT = 8 / 12;

/**
 * @param {number} density
 * @param {number} [stageAspect] stage width/height (face aspect). Default ~1.2.
 * @returns {{ density:number, stamp:number, stampX:number, stampY:number,
 *   columns:number, rows:number, bufColumns:number, bufRows:number }}
 */
function matrixResolveDensityGrid(density, stageAspect = 1.2) {
  const raw = Number(density);
  const d = Number.isFinite(raw) ? Math.max(0, raw) : 0.5;
  const t01 = Math.max(0, Math.min(1, d));
  const columns = Math.max(
    MATRIX_MIN_COLUMNS,
    Math.min(
      MATRIX_MAX_COLUMNS,
      Math.round(MATRIX_MIN_COLUMNS + t01 * (MATRIX_MAX_COLUMNS - MATRIX_MIN_COLUMNS)),
    ),
  );
  // Fill the face: pick rows so the cell grid aspect matches the stage.
  // gridAspect = (cols * cellW) / (rows * cellH) = stageAspect
  // rows = cols * MATRIX_CELL_ASPECT / stageAspect
  const aspect = Math.max(0.25, Math.min(4, Number(stageAspect) || 1.2));
  let rows = Math.round((columns * MATRIX_CELL_ASPECT) / aspect);
  rows = Math.max(MATRIX_MIN_ROWS, Math.min(MATRIX_MAX_ROWS, rows));
  return {
    density: d,
    stamp: 1,
    stampX: 1,
    stampY: 1,
    columns,
    rows,
    bufColumns: columns,
    bufRows: rows,
  };
}

/** Stage width/height from the face canvas parent (letterbox-free fill target). */
function matrixStageAspectFromCanvas(canvas) {
  const stage = canvas?.parentElement;
  const box = typeof nodeGraphElementClientSize === "function"
    ? nodeGraphElementClientSize(stage || canvas, 1, 1)
    : (
      typeof nodeGraphElementInSkippedContentVisibility === "function"
      && nodeGraphElementInSkippedContentVisibility(stage || canvas)
        ? { width: 1, height: 1, skipped: true }
        : {
          width: Math.max(1, stage?.clientWidth || canvas?.clientWidth || 1),
          height: Math.max(1, stage?.clientHeight || canvas?.clientHeight || 1),
        }
    );
  return Math.max(1, box.width) / Math.max(1, box.height);
}

/** Clamp density for soft engine floors (metaparam may expand past 1). */
function matrixClampDensity(n, fallback = 0.5) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, v);
}

/**
 * Phosphor persistence (CRT-style) — shared by Matrix rain, plate residual, Asciiscope XY.
 *
 * Residual axes match phosphor drawers (PhosphorResidual):
 *   Bright      → live tip / present gain
 *   Ghost       → super-exp analog hang (long dim residual)
 *   Trail       → 0 Ghost only · 0.5 half Ghost / half linear · 0.75 linear · 1 freeze
 *   Burn        → sticky residual floor (0 = off)
 *   Burn Amount → residual deposit peak = Bright × this (live tip stays Bright)
 *
 * Decay is applyResidual once per display frame (same as energy-GL drawers).
 * Do not add a kill floor — that wipes the dim hang Ghost is for.
 */

/** Persistence time constant (seconds) from trail 0..1. */
function matrixPhosphorTau(trail) {
  const t = Math.max(0, Math.min(1, Number(trail) || 0));
  // Exponential map: gentle near 0, multi-second at high trail (not a 0.78–0.99 fudge).
  return 0.04 * Math.exp(t * 5.7); // ~0.04s … ~12s
}

/**
 * Base keep factor for one frame of length dtSec (frame-rate independent).
 * trail 0 → keep near 0; trail 1 → keep near 1 (very slow fade).
 */
function matrixPhosphorBaseKeep(trail, dtSec = 1 / 60) {
  const dt = Math.max(1 / 240, Math.min(0.1, Number(dtSec) || 1 / 60));
  const t = Math.max(0, Math.min(1, Number(trail) || 0));
  if (t <= 0.0005) return 0; // hard off
  const tau = matrixPhosphorTau(t);
  return Math.exp(-dt / tau);
}

/**
 * One-frame residual after Trail/Ghost/Burn (same idea as energy-GL step).
 * Ghost → extreme analog (super-exp) hang. Trail encoded as baseKeep when
 * PhosphorResidual is unavailable. Burn → sticky residual floor (0 = off).
 * Returns next energy (not just a keep factor) so the floor is enforced.
 *
 * @param {number} energy01
 * @param {number} baseKeep trail-derived keep when Residual helper is missing
 * @param {number} ghost
 * @param {number} [burn=0]
 * @param {number} [trail] optional Trail 0…1 for full Residual path
 */
function matrixPhosphorApplyGhostHang(energy01, baseKeep, ghost = 0, burn = 0, trail = null) {
  const e = Math.max(0, Number(energy01) || 0);
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  if (Residual && typeof Residual.applyResidual === "function") {
    const t = trail == null ? (Residual.DEFAULT_TRAIL ?? 0.5) : trail;
    return Residual.applyResidual(e, t, ghost, burn);
  }
  const bk = Math.max(0, Math.min(1, Number(baseKeep) || 0));
  const g = Math.max(0, Math.min(1, Number(ghost) || 0));
  const b = Math.max(0, Math.min(1, Number(burn) || 0));
  let faded;
  if (g <= 0.001) {
    faded = e * bk;
  } else {
    const fade = Math.pow(1 - g, 2.8) * 0.012;
    const keepSlow = Math.min(0.99975, Math.max(bk, 1 - Math.max(0.00025, fade)));
    faded = Math.max(e * bk, e * keepSlow);
  }
  if (Residual && typeof Residual.applyBurnFloor === "function") {
    return Residual.applyBurnFloor(e, faded, b);
  }
  if (b >= 0.999) return e;
  if (b > 0.001 && e >= b) return Math.max(faded, b);
  return faded;
}

/** Residual deposit peak = Bright × Burn Amount (same as phosphor drawers). */
function matrixPhosphorDepositPeak(params = {}) {
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const brightRaw = Number(params.brightness);
  const bright = Number.isFinite(brightRaw) ? Math.max(0, brightRaw) : 1;
  const amountRaw = Number(params.burnAmount);
  const amount = Number.isFinite(amountRaw) ? amountRaw : (Residual?.DEFAULT_BURN_AMOUNT ?? 1);
  if (Residual && typeof Residual.depositBrightness === "function") {
    return Math.max(0, Residual.depositBrightness(bright, amount));
  }
  return Math.max(0, bright * Math.max(0, Math.min(4, amount)));
}

function matrixPhosphorResidualFromParams(p = {}, num) {
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const trailFb = Residual?.DEFAULT_TRAIL ?? 0.5;
  const ghostFb = Residual?.DEFAULT_GHOST ?? 0.45;
  const burnFb = Residual?.DEFAULT_BURN ?? 0;
  const amountFb = Residual?.DEFAULT_BURN_AMOUNT ?? 1;
  const read = typeof num === "function"
    ? num
    : (key, fallback) => {
      const v = Number(p[key]);
      return Number.isFinite(v) ? v : fallback;
    };
  return {
    trail: Math.max(0, Math.min(1, read("trail", trailFb))),
    ghost: Math.max(0, Math.min(1, read("ghost", ghostFb))),
    burn: Math.max(0, Math.min(1, read("burn", burnFb))),
    burnAmount: Residual?.clampBurnAmount
      ? Residual.clampBurnAmount(read("burnAmount", amountFb), amountFb)
      : Math.max(0, Math.min(4, read("burnAmount", amountFb))),
  };
}

/**
 * Per-cell keep factor (compat). Prefer matrixPhosphorApplyGhostHang for accuracy.
 */
function matrixPhosphorCellKeep(baseKeep, energy01, ghost = 0, burn = 0, trail = null) {
  const e = Math.max(1e-6, Number(energy01) || 0);
  const next = matrixPhosphorApplyGhostHang(e, baseKeep, ghost, burn, trail);
  return Math.max(0, Math.min(1, next / e));
}

/**
 * Film present curve for mono energy → display mono before brightness/gradient.
 * Soft lift keeps faint trails visible without treating burn as brightness.
 */
function matrixPhosphorFilm(energy01) {
  const raw = Math.max(0, Number(energy01) || 0);
  // Low-end lift (like energy-GL PRESENT_FRAG) so long trails don't quantize off.
  const lifted = raw + 0.04 * Math.pow(raw, 0.42);
  const e = 1 - Math.exp(-lifted * 2.35);
  return Math.pow(Math.max(0, Math.min(1, e)), 0.92);
}

/** Kill floor for energy → true black in finite time (pure exp never hits 0). */
function matrixPhosphorKillFloor(trail) {
  const t = Math.max(0, Math.min(1, Number(trail) || 0));
  if (t >= 0.95) return 0.0015;
  if (t >= 0.7) return 0.004;
  if (t >= 0.35) return 0.01;
  return 0.02;
}

/**
 * Remap phosphor fields from oldCols×oldRows → newCols×newRows without wipe.
 * Each new cell takes the max-energy sample from the old region it covers
 * (or nearest when going finer). Residual of other sizes stays as energy.
 */
function matrixRemapCellField(oldArr, oldCols, oldRows, newCols, newRows, isFloat) {
  const n = newCols * newRows;
  const out = isFloat ? new Float32Array(n) : new Array(n).fill(isFloat ? 0 : " ");
  if (!oldArr || !oldCols || !oldRows) return out;
  for (let r = 0; r < newRows; r += 1) {
    for (let c = 0; c < newCols; c += 1) {
      const c0 = Math.floor((c * oldCols) / newCols);
      const c1 = Math.max(c0 + 1, Math.ceil(((c + 1) * oldCols) / newCols));
      const r0 = Math.floor((r * oldRows) / newRows);
      const r1 = Math.max(r0 + 1, Math.ceil(((r + 1) * oldRows) / newRows));
      let bestE = -1;
      let bestVal = isFloat ? 0 : " ";
      for (let rr = r0; rr < Math.min(oldRows, r1); rr += 1) {
        for (let cc = c0; cc < Math.min(oldCols, c1); cc += 1) {
          const i = rr * oldCols + cc;
          const v = oldArr[i];
          // Prefer non-empty / higher energy samples.
          if (isFloat) {
            const e = Number(v) || 0;
            if (e > bestE) {
              bestE = e;
              bestVal = e;
            }
          } else {
            const ch = v || " ";
            // Score: non-space beats space; keep first strong hit.
            const score = ch !== " " ? 1 : 0;
            if (score > bestE) {
              bestE = score;
              bestVal = ch;
            }
          }
        }
      }
      out[r * newCols + c] = bestVal;
    }
  }
  return out;
}

/** Font stack: prefer Japanese mono for half-width katakana cell alignment. */
const MATRIX_FONT_STACK =
  '"MS Gothic", "Yu Gothic", "Noto Sans Mono CJK JP", "Consolas", "Courier New", monospace';

/** char → atlas index (0 = first glyph in MATRIX_GLYPH_SET, usually space). */
const MATRIX_GLYPH_TO_INDEX = (() => {
  const map = new Map();
  for (let i = 0; i < MATRIX_GLYPH_SET.length; i += 1) {
    map.set(MATRIX_GLYPH_SET[i], i);
  }
  map.set(" ", map.has(" ") ? map.get(" ") : 0);
  return map;
})();

const MATRIX_GLYPH_DOT_INDEX = MATRIX_GLYPH_TO_INDEX.has(".")
  ? MATRIX_GLYPH_TO_INDEX.get(".")
  : 1;
const MATRIX_GLYPH_SPACE_INDEX = MATRIX_GLYPH_TO_INDEX.has(" ")
  ? MATRIX_GLYPH_TO_INDEX.get(" ")
  : 0;

/** Atlas index for a sanitized glyph char (unknown → '.'). */
function matrixGlyphIndex(ch) {
  if (ch == null || ch === "" || ch === "\n" || ch === "\r") {
    return MATRIX_GLYPH_SPACE_INDEX;
  }
  const s = typeof ch === "string" ? ch.charAt(0) : String(ch).charAt(0);
  if (MATRIX_GLYPH_TO_INDEX.has(s)) return MATRIX_GLYPH_TO_INDEX.get(s);
  const up = s.toUpperCase();
  if (MATRIX_GLYPH_TO_INDEX.has(up)) return MATRIX_GLYPH_TO_INDEX.get(up);
  return s === " " ? MATRIX_GLYPH_SPACE_INDEX : MATRIX_GLYPH_DOT_INDEX;
}

function matrixClampColumns(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 40;
  return Math.max(MATRIX_MIN_COLUMNS, Math.min(MATRIX_MAX_COLUMNS, v));
}

function matrixClampRows(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 22;
  return Math.max(MATRIX_MIN_ROWS, Math.min(MATRIX_MAX_ROWS, v));
}

/** Map any code/string to a legal matrix glyph (or space / '.'). */
function matrixSanitizeChar(input) {
  if (input == null) return " ";
  if (typeof input === "number") {
    const code = Math.round(input);
    if (code === 10 || code === 13) return "\n";
    if (MATRIX_GLYPH_CODE_TO_CHAR.has(code)) {
      return MATRIX_GLYPH_CODE_TO_CHAR.get(code);
    }
    // ASCII letter → uppercase if in set, else '.'
    if (code >= 97 && code <= 122) {
      const up = code - 32;
      if (MATRIX_GLYPH_CODE_TO_CHAR.has(up)) {
        return MATRIX_GLYPH_CODE_TO_CHAR.get(up);
      }
    }
    return code === 32 ? " " : ".";
  }
  const s = String(input);
  if (!s.length) return " ";
  if (s === "\n" || s === "\r") return "\n";
  const ch = s.charAt(0);
  if (MATRIX_GLYPH_CODE_TO_CHAR.has(ch.charCodeAt(0))) return ch;
  const up = ch.toUpperCase();
  if (MATRIX_GLYPH_CODE_TO_CHAR.has(up.charCodeAt(0))) return up;
  return ch === " " ? " " : ".";
}

/** Sanitize a free-text message for Info mode (keep newlines, map other chars). */
function matrixSanitizeMessage(text) {
  const raw = String(text ?? MATRIX_DEFAULT_MESSAGE);
  let out = "";
  for (let i = 0; i < raw.length && out.length < 2048; i += 1) {
    const ch = raw.charAt(i);
    if (ch === "\n" || ch === "\r") {
      if (out.length && out.charAt(out.length - 1) !== "\n") out += "\n";
      continue;
    }
    out += matrixSanitizeChar(ch);
  }
  return out.length ? out : MATRIX_DEFAULT_MESSAGE;
}

/**
 * Default rain table: one glyph per line (slot index = line).
 * Classic Matrix digital rain only — half-width katakana, digits, A–Z.
 * No full block, no ASCII density ramp junk.
 */
function matrixDefaultGlyphTable() {
  const chars = typeof MATRIX_RAIN_DEFAULT_CHARS === "string"
    ? MATRIX_RAIN_DEFAULT_CHARS
    : (MATRIX_KATAKANA + "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  return [...chars].filter((c) => c && c !== " ").join("\n");
}

function normalizeNodeGraphAsciiscope(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  let table = typeof source.glyphTable === "string" ? source.glyphTable : matrixDefaultGlyphTable();
  if (table.length > 8192) table = table.slice(0, 8192);
  // Keep only legal glyphs in the table (one per line).
  const lines = table.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const cleaned = [];
  for (let i = 0; i < lines.length && cleaned.length < MATRIX_MAX_SLOTS; i += 1) {
    const line = lines[i];
    if (!line.length) {
      cleaned.push(" ");
      continue;
    }
    cleaned.push(matrixSanitizeChar(line.charAt(0)));
  }
  if (!cleaned.length) cleaned.push(".");
  // Default = app-wide Matrix preset (black → green → white tip).
  const defaultStops = (typeof MATRIX_DEFAULT_GRADIENT_STOPS !== "undefined"
    && Array.isArray(MATRIX_DEFAULT_GRADIENT_STOPS)
    && MATRIX_DEFAULT_GRADIENT_STOPS.length >= 2)
    ? MATRIX_DEFAULT_GRADIENT_STOPS.map((s) => ({ t: s.t, color: s.color }))
    : [
      { t: 0, color: "#000000" },
      { t: 0.12, color: "#001a08" },
      { t: 0.35, color: "#0a5c20" },
      { t: 0.62, color: "#1ecf55" },
      { t: 0.85, color: "#7dff9a" },
      { t: 1, color: "#ffffff" },
    ];
  let gradientStops = defaultStops;
  try {
    if (source.gradientStops || source.gradient) {
      if (typeof normalizeNodeGraphSharedGradientStops === "function") {
        gradientStops = normalizeNodeGraphSharedGradientStops(
          source.gradientStops ?? source.gradient,
          defaultStops,
        );
      } else if (Array.isArray(source.gradientStops) && source.gradientStops.length >= 2) {
        gradientStops = source.gradientStops;
      } else if (typeof nodeGraphPhosphorGradientStopsFromSettings === "function") {
        gradientStops = nodeGraphPhosphorGradientStopsFromSettings(source, "#ffffff");
      }
    }
  } catch (_) {
    gradientStops = defaultStops;
  }
  if (!Array.isArray(gradientStops) || gradientStops.length < 2) {
    gradientStops = defaultStops;
  }
  // Guard: first stop should not be a bright flash.
  if (gradientStops[0] && !gradientStops[0].color) {
    gradientStops = [{ t: 0, color: "#000000" }, ...gradientStops];
  }
  return {
    glyphTable: cleaned.join("\n"),
    message: matrixSanitizeMessage(
      typeof source.message === "string" ? source.message : MATRIX_DEFAULT_MESSAGE,
    ),
    // Sharp (vector) | Pixel — both full-res glyphs; only filter/CSS scale differ.
    renderStyle: matrixNormalizeRenderStyle(source.renderStyle),
    // Mono energy (black→white) remapped by multi-stop gradient → face color.
    gradientStops,
  };
}

/**
 * Sharp (vector, default) | Pixel — same buffer & grid; filter/CSS only.
 *   Sharp: LINEAR atlas sample + image-rendering:auto (smooth)
 *   Pixel: NEAREST atlas sample + image-rendering:pixelated (same shapes, hard edges)
 * Style switch must not resize the buffer or rewrite energy (no full redraw / wipe).
 */
function matrixNormalizeRenderStyle(value) {
  if (value == null || value === "") return "vector";
  const s = String(value).trim().toLowerCase();
  if (s === "pixel" || s === "lofi" || s === "chunky" || s === "0") return "pixel";
  return "vector";
}

/**
 * Sample multi-stop gradient at mono energy t∈[0,1] → {r,g,b} 0..255.
 * Same contract as phosphor LUT faces (black→white underlying brightness).
 */
function matrixSampleGradientRgb(stops, t) {
  const list = Array.isArray(stops) && stops.length >= 2 ? stops : null;
  if (!list) {
    const e = Math.max(0, Math.min(1, Number(t) || 0));
    const g = Math.round(e * 255);
    return { r: 0, g, b: 0 };
  }
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  const parse = (hex, fallback) => {
    const h = String(hex || fallback || "#000000").trim();
    const m = h.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    const n = m[1];
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16),
    };
  };
  if (x <= (Number(list[0].t) || 0)) return parse(list[0].color, "#000000");
  const last = list[list.length - 1];
  if (x >= (Number(last.t) || 1)) return parse(last.color, "#ffffff");
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    const at = Number(a.t) || 0;
    const bt = Number(b.t) || 1;
    if (x <= bt) {
      const u = (x - at) / Math.max(1e-6, bt - at);
      const ca = parse(a.color, "#000000");
      const cb = parse(b.color, "#ffffff");
      return {
        r: Math.round(ca.r + (cb.r - ca.r) * u),
        g: Math.round(ca.g + (cb.g - ca.g) * u),
        b: Math.round(ca.b + (cb.b - ca.b) * u),
      };
    }
  }
  return parse(last.color, "#ffffff");
}

/** Build 256×1 RGBA LUT bytes from gradient stops (GPU upload). */
function matrixBuildGradientLutRgba(stops) {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const c = matrixSampleGradientRgb(stops, i / 255);
    const o = i * 4;
    data[o] = c.r;
    data[o + 1] = c.g;
    data[o + 2] = c.b;
    data[o + 3] = 255;
  }
  return data;
}

// Back-compat names used across the codebase.
const ASCIISCOPE_DEFAULT_GLYPH_TABLE = matrixDefaultGlyphTable();
const ASCIISCOPE_MAX_SLOTS = MATRIX_MAX_SLOTS;
const ASCIISCOPE_MIN_COLUMNS = MATRIX_MIN_COLUMNS;
const ASCIISCOPE_MAX_COLUMNS = MATRIX_MAX_COLUMNS;
const ASCIISCOPE_MIN_ROWS = MATRIX_MIN_ROWS;
const ASCIISCOPE_MAX_ROWS = MATRIX_MAX_ROWS;
const MATRIX_DISPLAY_DEFAULT_MESSAGE = MATRIX_DEFAULT_MESSAGE;

function asciiscopeParseGlyphTable(tableText) {
  const normalized = normalizeNodeGraphAsciiscope({ glyphTable: tableText });
  return normalized.glyphTable.split("\n");
}

function asciiscopeGlyphAt(slots, slotIndex) {
  if (!slots?.length) return ".";
  const i = ((Math.round(Number(slotIndex)) % slots.length) + slots.length) % slots.length;
  return matrixSanitizeChar(slots[i] || ".");
}

function asciiscopeClampColumns(n) {
  return matrixClampColumns(n);
}

function asciiscopeClampRows(n) {
  return matrixClampRows(n);
}

function matrixDisplayCharFromCode(code) {
  return matrixSanitizeChar(code);
}

/**
 * Matrix Waterfall params (parameter-only rain).
 * Density = glyph field resolution (character size). Spawn = stream birth rate.
 * Soft floors only — metaparam min/max are not engine hard limits.
 */
function matrixWaterfallParamsFromNode(node) {
  const p = node?.params || {};
  const num = (key, fallback) => {
    const v = Number(p[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  // Prefer density; legacy patches with columns approximate density from them.
  let density = p.density != null ? matrixClampDensity(p.density, 0.75) : null;
  if (density == null && p.columns != null) {
    const cols = Math.max(1, Math.round(Number(p.columns) || 40));
    density = Math.max(0, Math.min(1, (cols - MATRIX_MIN_COLUMNS)
      / Math.max(1, MATRIX_BUF_COLUMNS - MATRIX_MIN_COLUMNS)));
  }
  // ~0.4 mid-field; actual cols/rows re-resolved with face aspect at tick time.
  if (density == null) density = 0.4;
  const grid = matrixResolveDensityGrid(density);
  // Spawn: 0 off, 0.5 original rain, 1 fast fill. Legacy columns patches used density.
  const spawn = p.spawn != null
    ? Math.max(0, num("spawn", 0.5))
    : (p.columns != null ? Math.max(0, num("density", 0.5)) : 0.5);
  // Stream Death: 0 never die, 0.5 original mid-stream death, 1 no spawn.
  const streamDeath = Math.max(0, Math.min(1, num("streamDeath", 0.5)));
  return {
    density: Number.isFinite(density) ? density : grid.density,
    // Provisional; tick re-resolves with live stage aspect for full-face fill.
    columns: grid.columns,
    rows: grid.rows,
    stamp: grid.stamp,
    stampX: grid.stampX,
    stampY: grid.stampY,
    bufColumns: grid.bufColumns,
    bufRows: grid.bufRows,
    // Signed: +fall, −rise, 0 idle. Magnitude is rate.
    speed: num("speed", 1),
    // Glyph flips per bin of travel (1 = once per bin; 0 = fixed for stream).
    charSpeed: Math.max(0, num("charSpeed", 1)),
    ...matrixPhosphorResidualFromParams(p, num),
    spawn,
    streamDeath,
    brightness: Math.max(0, num("brightness", 1)),
    freeze: Math.round(num("freeze", 0)) > 0 ? 1 : 0,
  };
}

/** Matrix Display params (Info / Serial plate — no rain). */
function matrixPlateParamsFromNode(node) {
  const p = node?.params || {};
  let density = p.density != null ? matrixClampDensity(p.density, 0.55) : null;
  if (density == null && p.columns != null) {
    const cols = matrixClampColumns(p.columns ?? 40);
    density = Math.max(0, Math.min(1, (cols - MATRIX_MIN_COLUMNS)
      / Math.max(1, MATRIX_BUF_COLUMNS - MATRIX_MIN_COLUMNS)));
  }
  if (density == null) density = 0.55;
  const grid = matrixResolveDensityGrid(density);
  return {
    // 0 Info, 1 Serial
    mode: Math.max(0, Math.min(1, Math.round(Number(p.mode) || 0))),
    density: grid.density,
    columns: grid.columns,
    rows: grid.rows,
    stamp: grid.stamp,
    stampX: grid.stampX,
    stampY: grid.stampY,
    bufColumns: grid.bufColumns,
    bufRows: grid.bufRows,
    ...matrixPhosphorResidualFromParams(p),
    brightness: (() => {
      const b = Number(p.brightness);
      return Number.isFinite(b) ? Math.max(0, b) : 1;
    })(),
    freeze: Math.round(Number(p.freeze) || 0) > 0 ? 1 : 0,
  };
}

// Back-compat alias used by older call sites
function asciiscopeParamsFromNode(node) {
  if (node?.type === "matrixWaterfall") {
    return matrixWaterfallParamsFromNode(node);
  }
  return matrixPlateParamsFromNode(node);
}

/** Normalize waterfall store: glyph table + gradient + render style. */
function normalizeNodeGraphMatrixWaterfall(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = normalizeNodeGraphAsciiscope({
    glyphTable: source.glyphTable,
    renderStyle: source.renderStyle,
    gradientStops: source.gradientStops ?? source.gradient,
    message: MATRIX_DEFAULT_MESSAGE,
  });
  const pad = Number(source.screenPadding ?? source.padding);
  const rounding = Number(source.rounding ?? source.cornerRadius);
  const shapeRaw = String(source.screenShape ?? source.cornerShape ?? "").toLowerCase();
  return {
    glyphTable: base.glyphTable,
    renderStyle: base.renderStyle,
    gradientStops: base.gradientStops,
    screenPadding: Number.isFinite(pad) ? Math.max(0, Math.min(1, pad)) : 0,
    rounding: Number.isFinite(rounding) ? Math.max(0, Math.min(100, rounding)) : 0,
    screenShape: shapeRaw === "squircle" ? "squircle" : "pill",
  };
}

/** Normalize plate store: message + gradient + render style. */
function normalizeNodeGraphMatrixPlate(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = normalizeNodeGraphAsciiscope({
    message: source.message,
    renderStyle: source.renderStyle,
    gradientStops: source.gradientStops ?? source.gradient,
    glyphTable: ".",
  });
  return {
    message: base.message,
    renderStyle: base.renderStyle,
    gradientStops: base.gradientStops,
  };
}
