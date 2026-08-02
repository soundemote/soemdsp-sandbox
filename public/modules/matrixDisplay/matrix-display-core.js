// Matrix Display — XY character-grid phosphor (asciiscope ConsoleRenderer model).
//
// Each cell stores an "age" energy. New X/Y samples plot intensity (burn).
// Each frame ages cells down (decay). Glyphs come from a ramp string:
//   low age → early characters (dim tail), high age → late characters (hot tip).
// Matches asciiscope project: plot(x,y,intensity) + fade + glyphFor(age).

const MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP = " .:-=+*#%@";

const MATRIX_DISPLAY_MIN_COLUMNS = 16;
const MATRIX_DISPLAY_MAX_COLUMNS = 160;
const MATRIX_DISPLAY_MIN_ROWS = 10;
const MATRIX_DISPLAY_MAX_ROWS = 96;
const MATRIX_DISPLAY_MAX_AGE = 32;

function normalizeNodeGraphMatrixDisplay(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  let ramp = typeof source.glyphRamp === "string" ? source.glyphRamp : MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP;
  // Collapse newlines so a multiline display-settings field still works as a ramp.
  ramp = ramp.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "");
  if (!ramp.length) {
    ramp = MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP;
  }
  if (ramp.length > 256) {
    ramp = ramp.slice(0, 256);
  }
  return {
    glyphRamp: ramp,
  };
}

function matrixDisplayClampColumns(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 64;
  return Math.max(MATRIX_DISPLAY_MIN_COLUMNS, Math.min(MATRIX_DISPLAY_MAX_COLUMNS, v));
}

function matrixDisplayClampRows(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 36;
  return Math.max(MATRIX_DISPLAY_MIN_ROWS, Math.min(MATRIX_DISPLAY_MAX_ROWS, v));
}

function matrixDisplayClamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function matrixDisplayParamsFromNode(node) {
  const p = node?.params || {};
  // Density = glyph field resolution (shared asciiscope model). Prefer shared helper.
  let density = p.density != null ? Number(p.density) : null;
  if (density == null || !Number.isFinite(density)) {
    if (p.columns != null) {
      const cols = matrixDisplayClampColumns(p.columns ?? 64);
      density = Math.max(0, Math.min(1, (cols - MATRIX_DISPLAY_MIN_COLUMNS)
        / Math.max(1, MATRIX_DISPLAY_MAX_COLUMNS - MATRIX_DISPLAY_MIN_COLUMNS)));
    } else {
      density = 0.7;
    }
  }
  density = Math.max(0, density);
  const grid = typeof matrixResolveDensityGrid === "function"
    ? matrixResolveDensityGrid(density)
    : null;
  const columns = grid ? grid.columns : matrixDisplayClampColumns(p.columns ?? 64);
  const rows = grid ? grid.rows : matrixDisplayClampRows(p.rows ?? 36);
  const stamp = grid ? grid.stamp : 1;
  const bufColumns = grid ? grid.bufColumns : columns;
  const bufRows = grid ? grid.bufRows : rows;
  return {
    density,
    columns,
    rows,
    stamp,
    stampX: stamp,
    stampY: stamp,
    bufColumns,
    bufRows,
    // trail: 0 = die now, 1 ≈ freeze (main residual). Legacy decay inverted.
    trail: (() => {
      if (p.trail != null) return matrixDisplayClamp01(p.trail, 0.78);
      if (p.decay != null) return matrixDisplayClamp01(1 - Number(p.decay), 0.78);
      return 0.78;
    })(),
    // ghost: dim scorched hang (legacy burn)
    ghost: matrixDisplayClamp01(p.ghost ?? p.burn ?? 0.35, 0.35),
    // brightness: deposit + present
    brightness: (() => {
      const b = Number(p.brightness);
      return Number.isFinite(b) ? Math.max(0, b) : 1;
    })(),
    // blackFloor: ages at or below this draw as blank (asciiscope blackFloor)
    blackFloor: Math.max(0, Math.min(8, Math.round(Number(p.blackFloor) || 0))),
    freeze: Math.round(Number(p.freeze) || 0) >= 1,
  };
}

function matrixDisplayGlyphForAge(ramp, age, maxAge) {
  const r = ramp && ramp.length ? ramp : MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP;
  const a = Math.max(0, Math.min(maxAge, Math.round(Number(age) || 0)));
  if (a <= 0) return " ";
  const scaled = Math.max(0, Math.min(r.length - 1, Math.round((a * (r.length - 1)) / maxAge)));
  return r.charAt(scaled) || " ";
}

/** Phosphor cyan/violet age coloring (asciiscope neon palette). */
function matrixDisplayColorForAge(age, maxAge, brightness) {
  // Age = energy; film curve then brightness (brightness is present-only).
  const raw = Math.max(0, Math.min(1, age / Math.max(1, maxAge)));
  const t = typeof matrixPhosphorFilm === "function"
    ? matrixPhosphorFilm(raw)
    : Math.pow(raw, 1.05);
  const bRaw = Number(brightness);
  const b = Number.isFinite(bRaw) ? Math.max(0, bRaw) : 1;
  if (b <= 0 || t < 0.004) {
    return "rgb(0,0,0)";
  }
  // Hue ramp from energy film; brightness scales RGB only (not trail length).
  const u = Math.pow(Math.min(1, t), 1.05);
  let r;
  let g;
  let bl;
  if (u < 0.25) {
    const k = u / 0.25;
    r = 18 * k;
    g = 0;
    bl = 34 * k;
  } else if (u < 0.55) {
    const k = (u - 0.25) / 0.3;
    r = 18 + (110 - 18) * k;
    g = 0 + 18 * k;
    bl = 34 + (152 - 34) * k;
  } else if (u < 0.82) {
    const k = (u - 0.55) / 0.27;
    r = 110 + (42 - 110) * k;
    g = 18 + (220 - 18) * k;
    bl = 152 + (235 - 152) * k;
  } else {
    const k = (u - 0.82) / 0.18;
    r = 42 + (255 - 42) * k;
    g = 220 + (255 - 220) * k;
    bl = 235 + (255 - 235) * k;
  }
  r = Math.round(Math.min(255, r * b));
  g = Math.round(Math.min(255, g * b));
  bl = Math.round(Math.min(255, bl * b));
  return `rgb(${r},${g},${bl})`;
}
