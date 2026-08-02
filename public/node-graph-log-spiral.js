// "Logarithmic Spiral" -- an original module, not a Jerobeam Fenderson port.
// This is the pure form of the "perfect spiral" idea from Fractal Spiral
// (node-graph-fractal-spiral.js), with the Weierstrass fractal-detail layer
// stripped away so the underlying logarithmic (equiangular) spiral itself
// is the whole picture.
//
// A logarithmic spiral is the unique curve of the form r = a * e^(b*theta)
// that is self-similar under rotation: rotating it by any angle is
// indistinguishable from uniformly rescaling it. That's the textbook
// definition of a "perfect" spiral -- it has no characteristic size, so it
// looks the same at every turn.
//
// To make that self-similarity visible as an audio-rate oscillator (which
// needs a periodic, bounded trace rather than a curve that grows to
// infinity), this sweeps `turns` full revolutions per cycle while the
// radius envelope grows exponentially with phase and resets each cycle.
// The key identity that makes this a *real* logarithmic spiral and not
// just "a spiral shape": over one full revolution (phase advancing by
// 1/turns), the radius scales by the constant factor exp(growth / turns),
// regardless of which turn you're on. Every turn is an exact scaled copy
// of the one before it -- that constant per-turn growth ratio is the
// defining property of the logarithmic spiral.
function createLogSpiralState() {
  return {
    phase: 0,
    spinPhase: 0,
  };
}

// Shared stdlib (node-graph-phasor-helpers.js).
function logSpiralWrap01(value) {
  return nodeGraphWrap01(value);
}

function logSpiralSample(options = {}) {
  const state = options.state || createLogSpiralState();
  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const spin = Number(options.spin) || 0;
  const size = Math.max(0, Number(options.size) || 0);
  const growth = Number(options.growth) || 0;
  const turns = Math.max(0.1, Number(options.turns) || 1);

  const mainPhase = logSpiralWrap01(state.phase);
  state.phase = logSpiralWrap01(state.phase + frequency / sampleRateValue);
  const spinPhaseValue = logSpiralWrap01(state.spinPhase);
  state.spinPhase = logSpiralWrap01(state.spinPhase + spin / sampleRateValue);

  // Sweep angle: `turns` full revolutions across one phase cycle.
  const theta = turns * Math.PI * 2 * mainPhase;

  // Radius envelope: centered so the mid-cycle radius equals `size` exactly
  // (mainPhase = 0.5 -> exponent 0). Over one full turn (Δphase = 1/turns)
  // this scales by the constant ratio exp(growth / turns) -- the defining
  // self-similarity of a logarithmic spiral.
  const envelope = Math.exp(growth * (mainPhase - 0.5));
  const radius = size * envelope;

  const rawX = radius * Math.cos(theta);
  const rawY = radius * Math.sin(theta);

  const spinAngle = spinPhaseValue * Math.PI * 2;
  const cosSpin = Math.cos(spinAngle);
  const sinSpin = Math.sin(spinAngle);
  const x = rawX * cosSpin - rawY * sinSpin;
  const y = rawX * sinSpin + rawY * cosSpin;
  const z = envelope - 1;

  return { x, y, z };
}
