// LED / LCD Dot / RGB Shape present — fullscreen quad.
// Pair: trace-dot-sprite.frag.glsl
// Shared by LED Dot, LCD Dot, Pulse Dot, RGB Shape (no wasm sibling).

attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
