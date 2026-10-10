// LED / LCD Dot / RGB Shape — SDF per pixel.
// Pair: trace-dot-sprite.vert.glsl
// shapeId: 0 circle/oval, 1 pill, 2 squircle, 3 ngon, 4 star, 5 heart,
// 6 trapezoid, 7 diamond, 8 cross, 9 ring, 10 teardrop, 11 flower

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uHalf; // rx, ry
uniform float uBlur;
uniform float uShape;
uniform float uParam;
uniform float uAmount;
uniform sampler2D uLut;
uniform float uFlat;
uniform vec4 uFlatColor;
uniform vec4 uDestRect; // x,y,w,h in dest pixels (scissor already set)

float hermite(float t) {
  float x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

float sdfBox(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdfRoundedBox(vec2 p, vec2 b, float r) {
  float rr = clamp(r, 0.0, min(b.x, b.y));
  return sdfBox(p, max(b - vec2(rr), 0.0)) - rr;
}

float sdfSuperellipse(vec2 p, vec2 r, float n) {
  vec2 a = abs(p) / max(r, vec2(1e-6));
  float pw = pow(a.x, n) + pow(a.y, n);
  float rad = pow(max(pw, 0.0), 1.0 / n);
  return (rad - 1.0) * min(r.x, r.y);
}

float sdfPolygon(vec2 p, float radius, float sides) {
  float n = max(3.0, floor(sides + 0.5));
  float ang = atan(p.y, p.x) + 1.5707963;
  float sector = 6.2831853 / n;
  float a = mod(mod(ang, sector) + sector, sector) - sector * 0.5;
  float r = length(p);
  float edge = radius * cos(3.14159265 / n);
  return r * cos(a) - edge;
}

float sdfStar(vec2 p, float radius, float points, float innerRatio) {
  float n = max(3.0, floor(points + 0.5));
  float ang = atan(p.y, p.x) + 1.5707963;
  float sector = 3.14159265 / n;
  float a = abs(mod(mod(ang, sector * 2.0) + sector * 2.0, sector * 2.0) - sector);
  float r = length(p);
  float t = a / sector;
  float rim = radius * (1.0 - t) + radius * innerRatio * t;
  return r - rim;
}

float sdfHeart(vec2 p, vec2 r, float plump) {
  float radius = min(r.x, r.y);
  float pp = 0.75 + clamp(plump, 0.0, 1.0) * 0.55;
  float x = p.x / max(1e-6, radius);
  float y = -p.y / max(1e-6, radius);
  float sx = x / pp;
  float sx2 = sx * sx;
  float aa = sx2 + y * y - 1.0;
  return (aa * aa * aa - sx2 * y * y * y) * radius * 0.55;
}

float sdfTrapezoid(vec2 p, vec2 r, float ratio) {
  float top = max(0.05, r.x * (0.08 + clamp(ratio, 0.0, 1.0) * 0.92));
  float bottom = r.x;
  float t = (p.y + r.y) / max(1e-6, r.y * 2.0);
  float halfW = bottom + (top - bottom) * clamp(t, 0.0, 1.0);
  return sdfBox(p, vec2(halfW, r.y));
}

float sdfCross(vec2 p, vec2 r, float thick) {
  float t = 0.12 + clamp(thick, 0.0, 1.0) * 0.55;
  return min(sdfBox(p, vec2(r.x, r.y * t)), sdfBox(p, vec2(r.x * t, r.y)));
}

float sdfRing(vec2 p, float radius, float hole) {
  float outer = radius;
  float inner = radius * (0.08 + clamp(hole, 0.0, 1.0) * 0.78);
  float d = length(p);
  return max(d - outer, inner - d);
}

float sdfTeardrop(vec2 p, float radius, float taper) {
  float t = clamp(taper, 0.0, 1.0);
  float bulb = length(p - vec2(0.0, -radius * 0.18)) - radius * (0.72 - t * 0.12);
  float tipY = -radius * (0.55 + t * 0.4);
  float tipR = radius * (0.22 + (1.0 - t) * 0.18);
  float tip = length(p - vec2(0.0, tipY * 0.15)) - tipR;
  float ang = atan(p.x, -(p.y + radius * 0.05));
  float cone = abs(ang) * radius * (0.55 - t * 0.2) - (radius * 0.35 - p.y * 0.2);
  return min(bulb, max(tip, cone));
}

float sdfFlower(vec2 p, float radius, float petalsParam) {
  float petals = floor(3.0 + clamp(petalsParam, 0.0, 1.0) * 5.0 + 0.5);
  float ang = atan(p.y, p.x);
  float r = length(p);
  float wave = 0.55 + 0.45 * cos(ang * petals);
  return r - radius * wave;
}

float squircleN(float rounding) {
  float p = clamp(rounding, 0.0, 1.0);
  float t = p * p;
  return 28.0 + (4.0 - 28.0) * t;
}

float sdfForShape(vec2 p, vec2 r, float shape, float param) {
  float id = floor(shape + 0.5);
  float rad = min(r.x, r.y);
  if (id < 0.5) {
    return sdfSuperellipse(p, r, 2.0); // circle / oval
  }
  if (id < 1.5) {
    if (param <= 1e-4) return sdfBox(p, r);
    return sdfRoundedBox(p, r, rad * param);
  }
  if (id < 2.5) {
    if (param <= 1e-4) return sdfBox(p, r);
    return sdfSuperellipse(p, r, squircleN(param));
  }
  if (id < 3.5) {
    float sides = 3.0 + clamp(param, 0.0, 1.0) * 9.0;
    return sdfPolygon(p, rad, sides);
  }
  if (id < 4.5) {
    float pts = 3.0 + clamp(param, 0.0, 1.0) * 9.0;
    return sdfStar(p, rad, pts, 0.42);
  }
  if (id < 5.5) return sdfHeart(p, r, param);
  if (id < 6.5) return sdfTrapezoid(p, r, param);
  if (id < 7.5) {
    float n = 1.05 + (1.0 - clamp(param, 0.0, 1.0)) * 1.6;
    return sdfSuperellipse(p, r, n);
  }
  if (id < 8.5) return sdfCross(p, r, param);
  if (id < 9.5) return sdfRing(p, rad, param);
  if (id < 10.5) return sdfTeardrop(p, rad, param);
  return sdfFlower(p, rad, param);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = frag - uCenter;
  vec2 r = max(uHalf, vec2(0.5));
  float charR = min(r.x, r.y);
  float b = clamp(uBlur, 0.0, 1.0);
  float b2 = b * b;
  float inner = max(0.0, charR * (1.0 - b2 * 0.88) - (b2 < 0.004 ? 0.65 : 0.0));
  float outer = charR * (1.0 + b2 * 1.65) + max(1.0, 1.1 - b2);
  float span = max(1e-6, outer - inner);
  float dist = sdfForShape(p, r, uShape, uParam);
  float a = 1.0 - hermite((dist - (inner - charR)) / span);
  a = clamp(a, 0.0, 1.0);
  float amt = clamp(uAmount, 0.0, 1.0);
  float e = clamp(amt * a, 0.0, 1.0);
  vec3 col;
  float alpha;
  if (uFlat > 0.5) {
    col = uFlatColor.rgb;
    alpha = uFlatColor.a * a * (amt <= 0.001 ? 0.0 : 1.0);
  } else {
    vec4 lut = texture2D(uLut, vec2(e, 0.5));
    col = lut.rgb;
    alpha = lut.a * a;
  }
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(col * alpha, alpha);
}
