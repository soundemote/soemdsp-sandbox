// Inertial Filter — pure math (main thread + AudioWorklet).
//
// Asymmetric exponential approach (not a hard rate limit):
//   out += (target − out) * k
// Rise uses Attack (0…1); fall uses Release (0…1).
// 1 = jump to target this sample; 0 = frozen.
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

/**
 * @param {{ initialized: boolean, out: number }} state
 * @param {number} input target
 * @param {number} attack 0…1 when rising
 * @param {number} release 0…1 when falling
 */
function nodeGraphInertialFilterSample(state, input, attack, release) {
  const target = Number(input) || 0;
  if (!state.initialized) {
    state.initialized = true;
    state.out = target;
    return target;
  }
  const a = Math.max(0, Math.min(1, Number(attack)));
  const r = Math.max(0, Math.min(1, Number(release)));
  const cur = Number(state.out) || 0;
  const delta = target - cur;
  const k = delta >= 0
    ? (Number.isFinite(a) ? a : 1)
    : (Number.isFinite(r) ? r : 1);
  state.out = cur + delta * k;
  return state.out;
}
