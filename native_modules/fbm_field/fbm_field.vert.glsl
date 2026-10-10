// Fractal Brownian Field present — fullscreen quad.
// Pair: fbm_field.frag.glsl  Audio stays in fbm_field.cpp / .wasm.

attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
