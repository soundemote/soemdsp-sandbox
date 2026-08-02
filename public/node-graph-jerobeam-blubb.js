function createNodeGraphBlubbState() {
  return { phase: 0, resetWasHigh: false };
}

// Shared stdlib (node-graph-phasor-helpers.js). Local name keeps port call-sites stable.
function nodeGraphBlubbWrap01(v) {
  return nodeGraphWrap01(v);
}

function nodeGraphBlubbBipolarTriangle(phase) {
  const p = nodeGraphBlubbWrap01(phase);
  return p < 0.5 ? (4 * p - 1) : (3 - 4 * p);
}

// Ported from soemdsp/include/soemdsp/oscillator/JerobeamBlubb.{h,cpp}
// (Jerobeam Fenderson's "Blubb" Gen~ patch). Mirrors
// native_modules/jerobeam_blubb exactly, including the fix for the
// reference's dead phase-update bug. Offline/JS path only, the realtime
// worklet prefers native WASM.
function nodeGraphBlubbSample(options = {}) {
  const state = options.state || createNodeGraphBlubbState();
  const resetHigh = Number(options.reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.phase = 0;
  }
  state.resetWasHigh = resetHigh;

  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const shape = Number(options.shape) || 0;
  const rotX = Number(options.rotX) || 0;
  const rotY = Number(options.rotY) || 0;
  const zDepth = Number(options.zDepth) || 0;

  const phase = state.phase;
  let chX, chY;
  if (shape >= 0.5) {
    chX = nodeGraphBlubbBipolarTriangle(phase + 0.125);
    chY = nodeGraphBlubbBipolarTriangle(phase + 0.375);
  } else {
    chX = Math.sin(phase * Math.PI * 2);
    chY = Math.cos(phase * Math.PI * 2);
  }

  const sinRotX = Math.sin(rotX * Math.PI * 2);
  const cosRotX = Math.cos(rotX * Math.PI * 2);
  const help11 = chX * cosRotX - chY * sinRotX;
  const help12 = chX * sinRotX + chY * cosRotX;
  const sinRotY = Math.sin(rotY * Math.PI * 2);
  const cosRotY = Math.cos(rotY * Math.PI * 2);
  const help21 = help11 * cosRotY;
  const z = help11 * sinRotY;

  const formula = zDepth * 1.25 * (z * 0.05 + 0.5);
  const m = 1 + zDepth;
  const x = (help21 - formula * help21) * m;
  const y = (help12 - formula * help12) * m;

  state.phase = nodeGraphBlubbWrap01(state.phase + frequency / sampleRateValue);

  return { x, y };
}
