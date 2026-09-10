// Inertial Filter — pure math (main thread + AudioWorklet).
//
// Asymmetric one-pole approach (not a hard rate limit):
//   out += (target − out) * k
// Rise uses Attack Hz; fall uses Release Hz.
// k = 1 − exp(−2π f / fs). 0 Hz = freeze; ≥ Nyquist = jump this sample.
//
// Contrast Up/Down Slew (slewLimiter): that caps |Δ| per sample from times in
// seconds. This is the same family as Speed Color Inertia's sat smoother.

function createNodeGraphInertialFilterState() {
  return {
    initialized: false,
    out: 0,
  };
}

function createNodeGraphStereoInertialFilterState() {
  return {
    left: createNodeGraphInertialFilterState(),
    mono: createNodeGraphInertialFilterState(),
    right: createNodeGraphInertialFilterState(),
  };
}

/** One-pole mix from cutoff Hz. 0 → freeze; Nyquist+ → 1 (instant). */
function nodeGraphInertialFilterCoeffFromHz(hz, sampleRate) {
  const fs = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const f = Number(hz);
  if (!Number.isFinite(f) || f <= 0) {
    return 0;
  }
  if (f >= fs * 0.5) {
    return 1;
  }
  const k = 1 - Math.exp((-2 * Math.PI * f) / fs);
  if (!Number.isFinite(k)) {
    return 0;
  }
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/**
 * @param {{ initialized: boolean, out: number }} state
 * @param {number} input target
 * @param {number} attack 0…1 mix when rising (Speed Color Inertia still uses this)
 * @param {number} release 0…1 mix when falling
 */
function nodeGraphInertialFilterSample(state, input, attack, release) {
  const target = nodeGraphFiniteNumber(input);
  if (!state.initialized) {
    state.initialized = true;
    state.out = target;
    return target;
  }
  const a = Math.max(0, Math.min(1, Number(attack)));
  const r = Math.max(0, Math.min(1, Number(release)));
  const cur = nodeGraphFiniteNumber(state.out);
  const delta = target - cur;
  const k = delta >= 0
    ? (Number.isFinite(a) ? a : 1)
    : (Number.isFinite(r) ? r : 1);
  state.out = cur + delta * k;
  return state.out;
}

/**
 * @param {{ initialized: boolean, out: number }} state
 * @param {number} input
 * @param {number} attackHz
 * @param {number} releaseHz
 * @param {number} sampleRate
 * @param {number} [smoothAttack] 0 = Off (instant rise), ≥0.5 = On (use Attack Hz)
 */
function nodeGraphInertialFilterSampleHz(
  state,
  input,
  attackHz,
  releaseHz,
  sampleRate,
  smoothAttack = 1,
) {
  const attackOn = (nodeGraphFiniteNumber(smoothAttack)) >= 0.5;
  return nodeGraphInertialFilterSample(
    state,
    input,
    attackOn ? nodeGraphInertialFilterCoeffFromHz(attackHz, sampleRate) : 1,
    nodeGraphInertialFilterCoeffFromHz(releaseHz, sampleRate),
  );
}
