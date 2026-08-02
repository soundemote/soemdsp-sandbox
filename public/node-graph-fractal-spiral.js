// "Fractal Spiral" -- an original module, not a Jerobeam Fenderson port.
// Modeled after public/node-graph-jerobeam-spiral.js (same phasor/state/
// wiring shape) but with fresh math designed to actually be a fractal:
//
// A logarithmic (equiangular) spiral is the unique curve that looks
// identical after any rotation+rescaling -- it has no characteristic
// scale, which is the geometric definition of "perfect" self-similarity.
// That's the outer envelope here (`envelope`, below).
//
// To get *textural* fractal detail rather than just a smooth curve, this
// sums N self-affine copies of the same rotating vector, each spun
// `lacunarity`x faster and scaled by `gain`:
//
//   z(theta) = sum_{k=0}^{N-1} gain^k * exp(i * (lacunarity^k * theta + k*twist))
//
// This is the classic Weierstrass function (the textbook example of a
// curve that is continuous everywhere and differentiable nowhere, i.e.
// the canonical rigorous "perfect fractal"), applied to a unit vector
// instead of cos(x). Its Hausdorff dimension has a closed form,
// D = 2 - ln(gain) / ln(lacunarity), valid whenever 0 < gain < 1 <
// lacunarity and gain*lacunarity > 1 -- so "roughness" (gain) and
// "detail growth" (lacunarity) are literally dialing a real fractal
// dimension, not just adding more harmonics. Because every layer is an
// exact rotated+scaled copy of the same angular structure, zooming into
// any arc of the curve reveals the same jaggedness at every scale --
// that's the self-affine property that makes it fractal rather than
// merely "has some harmonics in it".
function createFractalSpiralState() {
  return {
    phase: 0,
    spinPhase: 0,
  };
}

// Shared stdlib (node-graph-phasor-helpers.js).
function fractalSpiralWrap01(value) {
  return nodeGraphWrap01(value);
}

function fractalSpiralSample(options = {}) {
  const state = options.state || createFractalSpiralState();
  const sampleRateValue = Math.max(1, Number(options.sampleRate) || 44100);
  const frequency = Number(options.frequency) || 0;
  const spin = Number(options.spin) || 0;
  const size = Math.max(0, Number(options.size) || 0);
  const growth = Number(options.growth) || 0;
  const gain = Math.max(0.001, Math.min(0.98, Number(options.gain)));
  const lacunarity = Math.max(1.0001, Number(options.lacunarity) || 1);
  const octaveCount = Math.max(1, Math.min(16, Math.round(Number(options.octaves) || 1)));
  const twist = Number(options.twist) || 0;

  const mainPhase = fractalSpiralWrap01(state.phase);
  state.phase = fractalSpiralWrap01(state.phase + frequency / sampleRateValue);
  const spinPhaseValue = fractalSpiralWrap01(state.spinPhase);
  state.spinPhase = fractalSpiralWrap01(state.spinPhase + spin / sampleRateValue);

  const theta = mainPhase * Math.PI * 2;

  // Logarithmic-spiral envelope: bounded across one turn, centered so the
  // mid-turn radius equals `size` exactly (mainPhase = 0.5 -> exponent 0).
  const envelope = Math.exp(growth * (mainPhase - 0.5));

  // Weierstrass-style self-affine fractal sum (see file header).
  let sumX = 0;
  let sumY = 0;
  let ampSum = 0;
  let amp = 1;
  let angleMultiplier = 1;
  for (let k = 0; k < octaveCount; k++) {
    const angle = angleMultiplier * theta + k * twist * Math.PI * 2;
    sumX += amp * Math.cos(angle);
    sumY += amp * Math.sin(angle);
    ampSum += amp;
    amp *= gain;
    angleMultiplier *= lacunarity;
  }
  // Normalizing by the amplitude sum keeps the curve on the unit circle
  // regardless of octave count, so `size` alone controls overall scale.
  const normX = ampSum > 0 ? sumX / ampSum : 0;
  const normY = ampSum > 0 ? sumY / ampSum : 0;

  const radius = envelope * size;
  const rawX = normX * radius;
  const rawY = normY * radius;

  const spinAngle = spinPhaseValue * Math.PI * 2;
  const cosSpin = Math.cos(spinAngle);
  const sinSpin = Math.sin(spinAngle);
  const x = rawX * cosSpin - rawY * sinSpin;
  const y = rawX * sinSpin + rawY * cosSpin;
  const z = envelope - 1;

  return { x, y, z };
}
