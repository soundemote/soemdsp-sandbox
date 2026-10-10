// Scan Grid present — fullscreen quad.
// Pair: raster_rgb.source.frag.glsl, raster_rgb.blur.frag.glsl,
//       raster_rgb.down.frag.glsl, raster_rgb.composite.frag.glsl
// Audio grade stays in raster_rgb.cpp / .wasm.

attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
