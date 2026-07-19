// soemdsp-native-module: wall_delay
// soemdsp-native-label: Wall Delay
// soemdsp-native-target: wallDelay
// soemdsp-native-kind: effect
//
// Placeholder. The real DSP is being prototyped JS-side first (see
// nodeGraphWallDelaySample in node-graph-live-frame-evaluator.js and
// wallDelaySample in node-live-audio-worklet.js) -- this file exists so the
// module has a native_modules/ folder from the start, matching every other
// module's layout, ready to receive the ported implementation once the
// design settles. Not wired into the WASM build yet; no .wasm sits next to
// this file, so the module store shows it without a "Native C++" badge
// until one does.
//
// Design direction (see conversation/design notes, not yet implemented):
// a room polygon's wall distance is sampled into a small angular buffer
// around the listener/source point (radial distance field, the same trick
// https://www.shadertoy.com/view/XsK3RR uses for 2D lighting instead of
// per-pixel ray marching); each angle's distance becomes a delay-line tap
// length, fed through Sabrina Reverb's existing parabol-modulated smooth
// diffusion machinery rather than a real acoustic simulation.

extern "C" int soemdsp_wall_delay_version() {
  return 1;
}
