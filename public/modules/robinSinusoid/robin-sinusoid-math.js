// RobinSinusoid — free-running recursive sine (RS-MET / rosic::SineOscillator idea).
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/generators/rosic_SineOscillator.h
//
// Fixed-frequency second-order form is y[n] = 2·cos(ω)·y[n-1] − y[n-2], but that
// needs a careful reseed when ω changes. Knob/mod frequency ramps every sample,
// so we advance a unit phasor (x,y) = (cos θ, sin θ) by rotation:
//   [x'] = [cos ω  −sin ω] [x]
//   [y']   [sin ω   cos ω] [y]
// Same self-evolving state; stable under continuous frequency changes (no mute).

function createNodeGraphRobinSinusoidState() {
  return {
    // Unit phasor: x = cos(θ), y = sin(θ)
    x: 1,
    y: 0,
    cosW: 1,
    sinW: 0,
    omega: 0,
    primed: false,
    resetPrev: 0,
    renormCounter: 0,
  };
}

/**
 * Place the phasor on the unit circle at `phase` and cache rotation for `omega`.
 */
function nodeGraphRobinSinusoidPrime(state, omega, phase = 0) {
  const w = Number(omega) || 0;
  const p = Number(phase) || 0;
  state.omega = w;
  state.cosW = Math.cos(w);
  state.sinW = Math.sin(w);
  state.x = Math.cos(p);
  state.y = Math.sin(p);
  state.primed = true;
  state.renormCounter = 0;
}

/**
 * One free-running sine sample.
 * Frequency may change every sample (smoothed knob / FM) without going silent.
 */
function nodeGraphRobinSinusoidSample(
  state,
  frequencyHz = 440,
  amplitude = 1,
  sampleRate = 44100,
  startPhaseRadians = 0,
  reset = false,
) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const freq = Number(frequencyHz);
  const safeFreq = Number.isFinite(freq) ? freq : 0;
  // Allow negative / through-zero FM (rotation still works).
  let omega = (Math.PI * 2 * safeFreq) / rate;
  // Keep |ω| modest so cos/sin stay well-conditioned; wrap to [-π, π].
  const twoPi = Math.PI * 2;
  if (omega > Math.PI || omega < -Math.PI) {
    omega = ((omega + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  }
  const amp = Number(amplitude);
  const safeAmp = Number.isFinite(amp) ? amp : 0;

  if (reset || !state.primed) {
    nodeGraphRobinSinusoidPrime(state, omega, Number(startPhaseRadians) || 0);
  } else if (Math.abs(omega - state.omega) > 1e-12) {
    // Update step only — keep (x, y) continuous so level never drops to zero.
    state.omega = omega;
    state.cosW = Math.cos(omega);
    state.sinW = Math.sin(omega);
  }

  // Rotate phasor one sample.
  const x0 = state.x;
  const y0 = state.y;
  let x1 = x0 * state.cosW - y0 * state.sinW;
  let y1 = x0 * state.sinW + y0 * state.cosW;

  if (!Number.isFinite(x1) || !Number.isFinite(y1)) {
    nodeGraphRobinSinusoidPrime(state, omega, Number(startPhaseRadians) || 0);
    return 0;
  }

  // Cheap occasional renorm (float drift); not every sample.
  state.renormCounter = (state.renormCounter || 0) + 1;
  if (state.renormCounter >= 64) {
    state.renormCounter = 0;
    const mag2 = x1 * x1 + y1 * y1;
    if (mag2 > 1.00001 || mag2 < 0.99999) {
      if (mag2 > 1e-20) {
        const inv = 1 / Math.sqrt(mag2);
        x1 *= inv;
        y1 *= inv;
      } else {
        nodeGraphRobinSinusoidPrime(state, omega, 0);
        return 0;
      }
    }
  }

  state.x = x1;
  state.y = y1;
  return y1 * safeAmp;
}
