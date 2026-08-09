// RobinSinusoid — recursive free-running sine (RS-MET rosic::SineOscillator).
// https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/generators/rosic_SineOscillator.h
//
// Second-order self-oscillating recursion (no per-sample sin()):
//   y[n] = a1 * y[n-1] - y[n-2]
//   a1   = 2 * cos(ω),  ω = 2π * f / sampleRate
// Seeded so the first output is sin(startPhase).

function createNodeGraphRobinSinusoidState() {
  return {
    a1: 2,
    s1: 0,
    s2: 0,
    omega: 0,
    primed: false,
    resetPrev: 0,
  };
}

/**
 * Seed recursion so the next getSample() yields sin(phase).
 * (rosic SineOscillator::triggerWithPhase)
 */
function nodeGraphRobinSinusoidPrime(state, omega, phase = 0) {
  const w = Number(omega) || 0;
  const p = Number(phase) || 0;
  state.omega = w;
  state.a1 = 2 * Math.cos(w);
  state.s1 = Math.sin(p - w);
  state.s2 = Math.sin(p - 2 * w);
  state.primed = true;
}

/**
 * Estimate current phase from state (rosic setOmega uses asin on current sample).
 */
function nodeGraphRobinSinusoidCurrentPhase(state) {
  const y = Math.max(-1, Math.min(1, Number(state.s1) || 0));
  let phase = Math.asin(y);
  // Recover half-cycle using previous sample (descending when s1 < s2 after advance).
  const prev = Number(state.s2) || 0;
  if (y < prev) {
    // Reflect into descending half when possible.
    phase = Math.PI - phase;
  }
  return phase;
}

/**
 * One recursive sine sample.
 * @param {{ a1:number, s1:number, s2:number, omega:number, primed:boolean, resetPrev:number }} state
 * @param {number} frequencyHz
 * @param {number} amplitude
 * @param {number} sampleRate
 * @param {number} startPhaseRadians  used only on (re)trigger
 * @param {boolean} reset  hard reseed at startPhase
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
  const omega = (Math.PI * 2 * safeFreq) / rate;
  const amp = Number(amplitude);
  const safeAmp = Number.isFinite(amp) ? amp : 0;

  if (reset || !state.primed) {
    nodeGraphRobinSinusoidPrime(state, omega, Number(startPhaseRadians) || 0);
  } else if (Math.abs(omega - state.omega) > 1e-15) {
    // Phase-preserving frequency change (rosic SineOscillator::setOmega).
    const phase = nodeGraphRobinSinusoidCurrentPhase(state);
    nodeGraphRobinSinusoidPrime(state, omega, phase);
  }

  // INLINE getSample: y = a1*s1 - s2
  const tmp = state.a1 * state.s1 - state.s2;
  state.s2 = state.s1;
  state.s1 = tmp;
  if (!Number.isFinite(tmp)) {
    // Numerical blow-up — reseed quiet.
    nodeGraphRobinSinusoidPrime(state, omega, 0);
    return 0;
  }
  return tmp * safeAmp;
}
