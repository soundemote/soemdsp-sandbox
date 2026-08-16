// Shared output Amplitude scale for modules that do not already apply
// amplitude inside their own evaluator (filters, some oscs, some envelopes).
// Types that already multiply by `amplitude` / `level` must NOT be listed.

const nodeGraphPostAmplitudeTypes = Object.freeze({
  // Scientific filters (resonators / waveguide already scale internally).
  passiveFilter: true,
  tiltFilter: true,
  eqFilter: true,
  papoulisFilter: true,
  cookbookFilter: true,
  activeFilter: true,
  ladderFilter: true,
  butterworth: true,
  linkwitzRiley: true,
  bessel: true,
  chebyshev: true,
  elliptic: true,
  bandpass: true,
  allpass: true,
  crossover2: true,
  crossover3: true,
  crossover4: true,
  crossover5: true,
  crossover6: true,
  formantFilter: true,
  besselThomson: true,
  massSpringDamper: true,
  phaseDisperse: true,
  quadrature: true,
  hilbert: true,
  // Musical / analog filters.
  yellowjacketFilter: true,
  superloveFilter: true,
  chaoticPhaseLockingFilter: true,
  phaser: true,
  resonatorFilter: true,
  humanFilter: true,
  flowerChildFilter: true,
  tb303Filter: true,
  // Oscillators that lacked Amplitude.
  sinc: true,
  phosphillator: true,
  // Envelopes that lacked Amplitude / Level.
  flowerChildEnvelopeFollower: true,
  vactrolEnvelopeSeries: true,
  vactrolEnvelopeCustom: true,
});

function nodeGraphScaleModuleOutputs(value, amplitude) {
  const amp = Number(amplitude);
  const scale = Number.isFinite(amp) ? amp : 1;
  if (scale === 1) {
    return value;
  }
  if (typeof value === "number") {
    return value * scale;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = Array.isArray(value) ? value.slice() : { ...value };
  const keys = Object.keys(out);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const sample = out[key];
    if (typeof sample === "number") {
      out[key] = sample * scale;
    }
  }
  return out;
}

function nodeGraphApplyPostAmplitude(type, value, amplitude) {
  if (!type || !nodeGraphPostAmplitudeTypes[type]) {
    return value;
  }
  return nodeGraphScaleModuleOutputs(value, amplitude);
}
