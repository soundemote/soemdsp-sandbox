// Waveguide — under construction.
// Reserved product: digital waveguide (physical delay-loop model) beyond Comb Resonator.
// Current: safe mono passthrough so the module can sit in patches without breaking audio.
// Planned: fractional delay loop, termination/loss filter, optional dispersion, musical
// Frequency + Decay controls (and later dual-rail / pickups). Not a rename of Comb.

function createNodeGraphWaveguideState() {
  return {
    stub: true,
  };
}

/**
 * Stub sample: dry passthrough × amplitude.
 * @returns {number}
 */
function nodeGraphWaveguideSample(state, input, amplitude) {
  const amp = Number.isFinite(Number(amplitude)) ? Number(amplitude) : 1;
  const y = (Number(input) || 0) * amp;
  if (!Number.isFinite(y)) return 0;
  return y;
}
