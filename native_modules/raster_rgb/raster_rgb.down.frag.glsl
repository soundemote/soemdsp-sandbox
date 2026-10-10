// Scan Grid 2×2 box downsample. Pair: raster_rgb.vert.glsl

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uTex;
uniform vec2 uTexSize;

void main() {
  gl_FragColor = texture2D(uTex, (floor(gl_FragCoord.xy) * 2.0 + 1.0) / uTexSize);
}
