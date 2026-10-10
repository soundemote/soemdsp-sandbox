// Fractal Brownian Field present — port of fbm_field.cpp fieldAt / fbm2d / fbm3d / fade.
// Pair: fbm_field.vert.glsl
// Float murmur-style hash (highp). Typical zoom/scale matches the look; extreme
// lattice coords may diverge slightly from WASM audio probes (WISIWIH approx).

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uPalette;
uniform vec2 uResolution;
uniform float uDomainTime;
uniform float uZoom;
uniform float uPanX;
uniform float uPanY;
uniform float uRotate;
uniform float uSeed;
uniform float uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform float uScale;
uniform float uSmoothness;
uniform float uContrast;
uniform float uBrightness;
uniform float uMotion;

// Lattice hashes stay in small float magnitudes (fp32-safe): integer lattice
// coords + seed folded to [0,4096) by the caller. Not bit-identical to the C++
// uint32 hash (WebGL1 has no integer bit ops); same value-noise statistics.
float hash2d(float ix, float iy, float seed) {
  vec3 p3 = fract(vec3(ix, iy, seed) * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z) * 2.0 - 1.0;
}

float hash3d(float ix, float iy, float iz, float seed) {
  vec4 p4 = fract(vec4(ix, iy, iz, seed) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.x + p4.y) * (p4.z + p4.w)) * 2.0 - 1.0;
}

float fade(float t, float smoothness) {
  float x = clamp(t, 0.0, 1.0);
  float s = clamp(smoothness, 0.0, 1.0);
  if (s <= 0.0) return x;
  float hermite = x * x * (3.0 - 2.0 * x);
  if (s <= 0.5) {
    float u = s * 2.0;
    return x + (hermite - x) * u;
  }
  float quintic = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  float u = (s - 0.5) * 2.0;
  return hermite + (quintic - hermite) * u;
}

float valueNoise2d(float x, float y, float seed, float smoothness) {
  float x0 = floor(x);
  float y0 = floor(y);
  float fx = x - x0;
  float fy = y - y0;
  float u = fade(fx, smoothness);
  float v = fade(fy, smoothness);
  float a = hash2d(x0, y0, seed);
  float b = hash2d(x0 + 1.0, y0, seed);
  float c = hash2d(x0, y0 + 1.0, seed);
  float d = hash2d(x0 + 1.0, y0 + 1.0, seed);
  float x1 = a + (b - a) * u;
  float x2 = c + (d - c) * u;
  return x1 + (x2 - x1) * v;
}

float valueNoise3d(float x, float y, float z, float seed, float smoothness) {
  float x0 = floor(x);
  float y0 = floor(y);
  float z0 = floor(z);
  float fx = x - x0;
  float fy = y - y0;
  float fz = z - z0;
  float u = fade(fx, smoothness);
  float v = fade(fy, smoothness);
  float w = fade(fz, smoothness);
  float n000 = hash3d(x0, y0, z0, seed);
  float n100 = hash3d(x0 + 1.0, y0, z0, seed);
  float n010 = hash3d(x0, y0 + 1.0, z0, seed);
  float n110 = hash3d(x0 + 1.0, y0 + 1.0, seed);
  float n001 = hash3d(x0, y0, z0 + 1.0, seed);
  float n101 = hash3d(x0 + 1.0, y0, z0 + 1.0, seed);
  float n011 = hash3d(x0, y0 + 1.0, z0 + 1.0, seed);
  float n111 = hash3d(x0 + 1.0, y0 + 1.0, z0 + 1.0, seed);
  float x00 = n000 + (n100 - n000) * u;
  float x10 = n010 + (n110 - n010) * u;
  float x01 = n001 + (n101 - n001) * u;
  float x11 = n011 + (n111 - n011) * u;
  float yz0 = x00 + (x10 - x00) * v;
  float yz1 = x01 + (x11 - x01) * v;
  return yz0 + (yz1 - yz0) * w;
}

float fbm2d(float x, float y, float seed, float octaves, float persistence, float lacunarity, float scale, float smoothness) {
  float total = 0.0;
  float amplitude = 1.0;
  float noiseFreq = 1.0;
  float maxValue = 0.0;
  float baseSeed = mod(seed * 1009.0 + 17.0, 4096.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= octaves) break;
    float sx = x * scale * noiseFreq;
    float sy = y * scale * noiseFreq;
    total += valueNoise2d(sx, sy, mod(baseSeed + float(i) * 1013.0, 4096.0), smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFreq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

float fbm3d(float x, float y, float z, float seed, float octaves, float persistence, float lacunarity, float scale, float smoothness) {
  float total = 0.0;
  float amplitude = 1.0;
  float noiseFreq = 1.0;
  float maxValue = 0.0;
  float baseSeed = mod(seed * 1009.0 + 17.0, 4096.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= octaves) break;
    float sx = x * scale * noiseFreq;
    float sy = y * scale * noiseFreq;
    float sz = z * scale * noiseFreq;
    total += valueNoise3d(sx, sy, sz, mod(baseSeed + float(i) * 1013.0, 4096.0), smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFreq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

float fieldAt(float spatialX, float spatialY, float domainT, float motion, float seed, float octaves, float persistence, float lacunarity, float scale, float smoothness, float span) {
  if (motion > 0.5) {
    return fbm3d(spatialX, spatialY, domainT * span, seed, octaves, persistence, lacunarity, scale, smoothness);
  }
  float scrollX = domainT * span;
  float scrollY = domainT * span * 0.73;
  return fbm2d(spatialX + scrollX, spatialY + scrollY, seed, octaves, persistence, lacunarity, scale, smoothness);
}

float bipolarToMono(float bipolar, float contrast) {
  float mid = bipolar * 0.5 + 0.5;
  float c = max(contrast, 0.0);
  if (abs(c - 1.0) > 1e-6) {
    mid = 0.5 + (mid - 0.5) * c;
  }
  return clamp(mid, 0.0, 1.0);
}

void main() {
  // Pixel centres; Y matches C++ fill_grid (j=0 = top → ny≈+1).
  vec2 frag = gl_FragCoord.xy;
  float u = frag.x / max(uResolution.x, 1.0);
  float vBottom = frag.y / max(uResolution.y, 1.0);
  float vTop = 1.0 - vBottom;
  float nx = 2.0 * u - 1.0;
  float ny = 1.0 - 2.0 * vTop;

  float safeZoom = max(uZoom, 0.05);
  float span = 1.0 / safeZoom;
  float ang = uRotate * 6.283185307179586;
  float cosR = cos(ang);
  float sinR = sin(ang);
  float px = nx * span;
  float py = ny * span;
  float rx = px * cosR - py * sinR;
  float ry = px * sinR + py * cosR;
  float spatialX = rx + uPanX;
  float spatialY = ry + uPanY;

  float seed = mod(floor(clamp(uSeed, 0.0, 99999.0)), 4096.0);
  float octaves = clamp(floor(uOctaves + 0.5), 1.0, 8.0);
  float pers = clamp(uPersistence, 0.0, 0.99);
  float lac = clamp(uLacunarity, 1.0, 4.0);
  float sc = max(uScale, 0.000001);
  float sm = clamp(uSmoothness, 0.0, 1.0);
  float contrast = max(uContrast, 0.0);
  float bright = max(uBrightness, 0.0);
  float motion = clamp(floor(uMotion + 0.5), 0.0, 1.0);

  float bipolar = fieldAt(spatialX, spatialY, uDomainTime, motion, seed, octaves, pers, lac, sc, sm, span);
  float mono = clamp(bipolarToMono(bipolar, contrast) * bright, 0.0, 1.0);
  vec3 col = texture2D(uPalette, vec2(mono, 0.5)).rgb;
  gl_FragColor = vec4(col, 1.0);
}
