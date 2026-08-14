// Raster RGB — analog color-corrector. One sample in → graded analog out.
// Contrast → brightness → invert → hue. rgba is Rec.709 luma of the result.
// Mirrors native_modules/raster_rgb/raster_rgb.cpp.

function nodeGraphRasterRgbClamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function nodeGraphRasterRgbWrapHue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return ((n % 1) + 1) % 1;
}

function nodeGraphRasterRgbContrast01(x, contrast) {
  const t = nodeGraphRasterRgbClamp01(x);
  const c = Number(contrast);
  if (!(c > 0) || !Number.isFinite(c)) {
    return 0.5;
  }
  if (Math.abs(c - 1) < 1e-4) {
    return t;
  }
  if (t < 0.5) {
    return 0.5 * (2 * t) ** c;
  }
  return 1 - 0.5 * (2 * (1 - t)) ** c;
}

function nodeGraphRasterRgbHueRotate(r, g, b, hueCycles) {
  const hShift = Number(hueCycles) || 0;
  if (!(Math.abs(hShift) > 1e-9)) {
    return { r, g, b };
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }
  h = nodeGraphRasterRgbWrapHue(h + hShift);
  if (s <= 0) {
    return { r: l, g: l, b: l };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: nodeGraphRasterRgbClamp01(channel(1 / 3)),
    g: nodeGraphRasterRgbClamp01(channel(0)),
    b: nodeGraphRasterRgbClamp01(channel(-1 / 3)),
  };
}

/**
 * @returns {{ R: number, G: number, B: number, rgba: number }}
 */
function nodeGraphRasterRgbAsVideo01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n < 0 || n > 1) {
    const c = n < -1 ? -1 : n > 1 ? 1 : n;
    return 0.5 + 0.5 * c;
  }
  return n;
}

function nodeGraphRasterRgbProcessSample(r, g, b, opts = {}) {
  const bipolar = r < 0 || g < 0 || b < 0 || r > 1 || g > 1 || b > 1;
  let R = bipolar ? nodeGraphRasterRgbAsVideo01(r) : nodeGraphRasterRgbClamp01(r);
  let G = bipolar ? nodeGraphRasterRgbAsVideo01(g) : nodeGraphRasterRgbClamp01(g);
  let B = bipolar ? nodeGraphRasterRgbAsVideo01(b) : nodeGraphRasterRgbClamp01(b);
  const contrast = Number.isFinite(Number(opts.contrast)) ? Number(opts.contrast) : 1;
  const brightness = Number.isFinite(Number(opts.brightness))
    ? Math.max(0, Number(opts.brightness))
    : 1;
  const invert = nodeGraphRasterRgbClamp01(opts.invert);
  const hue = Number(opts.hue) || 0;
  R = nodeGraphRasterRgbContrast01(R, contrast) * brightness;
  G = nodeGraphRasterRgbContrast01(G, contrast) * brightness;
  B = nodeGraphRasterRgbContrast01(B, contrast) * brightness;
  if (R > 1) R = 1;
  if (G > 1) G = 1;
  if (B > 1) B = 1;
  if (invert > 0) {
    R += invert * (1 - 2 * R);
    G += invert * (1 - 2 * G);
    B += invert * (1 - 2 * B);
  }
  const rotated = nodeGraphRasterRgbHueRotate(R, G, B, hue);
  R = rotated.r;
  G = rotated.g;
  B = rotated.b;
  return {
    R,
    G,
    B,
    rgba: 0.2126 * R + 0.7152 * G + 0.0722 * B,
  };
}
