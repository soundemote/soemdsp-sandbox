// Scan Grid source pass: nearest buffer texel → grade LUT → HSL hue rotate.
// Pair: raster_rgb.vert.glsl

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uRaw;      // bufW × bufH RGBA8, row 0 = top
uniform sampler2D uLut;      // 256 × 1, grade LUT in .r
uniform vec2 uBuf;           // bufW, bufH
uniform vec2 uFace;          // cw, ch
uniform vec4 uDest;          // dx, dy, dw, dh (face px, top-left origin)
uniform float uHue;          // hue shift in cycles, 0 = off
uniform float uFlipY;        // 1 = GL texture (row 0 = bottom)

float wrapHue(float n) {
  return n - floor(n);
}

float hslChannel(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

// nodeGraphRasterRgbHueRotate (raster-rgb-math.js).
vec3 hueRotate(vec3 c, float hShift) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) {
      h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) / 6.0;
    } else if (mx == c.g) {
      h = ((c.b - c.r) / d + 2.0) / 6.0;
    } else {
      h = ((c.r - c.g) / d + 4.0) / 6.0;
    }
  }
  h = wrapHue(h + hShift);
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return clamp(vec3(
    hslChannel(p, q, h + 1.0 / 3.0),
    hslChannel(p, q, h),
    hslChannel(p, q, h - 1.0 / 3.0)
  ), 0.0, 1.0);
}

float lut(float v) {
  float i = floor(v * 255.0 + 0.5);
  return texture2D(uLut, vec2((i + 0.5) / 256.0, 0.5)).r;
}

void main() {
  float x = floor(gl_FragCoord.x);
  float y = uFace.y - 1.0 - floor(gl_FragCoord.y);
  if (x < uDest.x || x >= uDest.x + uDest.z || y < uDest.y || y >= uDest.y + uDest.w) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // drawImage, smoothing off: dest pixel centre → floor(source coordinate).
  // Skia picks the lower texel when the centre lands exactly on a texel
  // edge; the small bias reproduces that.
  vec2 t = floor((vec2(x, y) + 0.5 - uDest.xy) * uBuf / uDest.zw - 1.0 / 1024.0);
  if (uFlipY > 0.5) t.y = uBuf.y - 1.0 - t.y;
  t = clamp(t, vec2(0.0), uBuf - 1.0);
  vec3 raw = texture2D(uRaw, (t + 0.5) / uBuf).rgb;
  vec3 c = vec3(lut(raw.r), lut(raw.g), lut(raw.b));
  if (uHue != 0.0) c = hueRotate(c, uHue);
  gl_FragColor = vec4(c, 1.0);
}
