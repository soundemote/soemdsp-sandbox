// Scan Grid separable Gaussian blur (premultiplied). Pair: raster_rgb.vert.glsl
// Tap radius 24 = ceil(3 · SIGMA_DIRECT) + margin (SIGMA_DIRECT is 6 in JS).

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uTex;
uniform vec2 uTexSize;   // allocated input texture size
uniform float uInOffset; // texel of level pixel 0 in the input (0, or 1 with margin)
uniform vec2 uInMin;     // valid input range in level px [min, max)
uniform vec2 uInMax;
uniform vec2 uAxis;      // (1,0) or (0,1)
uniform float uSigma;    // px at this level
uniform float uRadius;   // taps each side

void main() {
  vec2 p = gl_FragCoord.xy - 1.0; // output has a 1px margin
  float inv2s2 = 1.0 / (2.0 * uSigma * uSigma);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int k = -24; k <= 24; k++) {
    float fk = float(k);
    if (abs(fk) > uRadius) continue;
    float w = exp(-fk * fk * inv2s2);
    wsum += w;
    vec2 q = p + uAxis * fk;
    if (q.x >= uInMin.x && q.y >= uInMin.y && q.x < uInMax.x && q.y < uInMax.y) {
      sum += texture2D(uTex, (q + uInOffset) / uTexSize) * w;
    }
  }
  gl_FragColor = sum / wsum;
}
