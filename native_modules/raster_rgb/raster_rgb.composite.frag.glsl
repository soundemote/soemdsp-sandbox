// Scan Grid composite: plate + image + additive glow. Pair: raster_rgb.vert.glsl

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uImage;   // blurred image (or the sharp source)
uniform sampler2D uGlow;
uniform vec2 uImageUv;      // face px → uv: p * uv + off (level scale + margin)
uniform vec2 uImageOff;
uniform vec2 uGlowUv;
uniform vec2 uGlowOff;
uniform float uGlowAlpha;   // 0 = no glow layer
uniform vec3 uPlate;

void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 img = texture2D(uImage, p * uImageUv + uImageOff);
  vec3 c = img.rgb + uPlate * (1.0 - img.a);
  if (uGlowAlpha > 0.0) {
    c += uGlowAlpha * texture2D(uGlow, p * uGlowUv + uGlowOff).rgb;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
