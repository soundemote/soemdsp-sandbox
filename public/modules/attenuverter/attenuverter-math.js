// Attenuverter — pure math (main thread + AudioWorklet).
// Out = In * amplitude + offset. Amplitude −1…+1 (invert / mute / unity).

function nodeGraphAttenuverterSample(input, amplitude, offset) {
  return (nodeGraphFiniteNumber(input)) * (nodeGraphFiniteNumber(amplitude)) + (nodeGraphFiniteNumber(offset));
}

/**
 * @returns {{ Out: number }}
 */
function nodeGraphAttenuverterFrame(input, amplitude, offset) {
  return {
    Out: nodeGraphAttenuverterSample(input, amplitude, offset),
  };
}
