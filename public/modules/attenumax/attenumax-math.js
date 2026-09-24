// AM Index — Out = Bias + In * Bias * Amplitude. Amplitude is a normalized index.

function nodeGraphAttenuMaxSample(input, amplitude, bias) {
  const x = nodeGraphFiniteNumber(bias);
  return x + (nodeGraphFiniteNumber(input)) * x * (nodeGraphFiniteNumber(amplitude));
}

function nodeGraphAttenuMaxFrame(input, amplitude, bias) {
  return {
    Out: nodeGraphAttenuMaxSample(input, amplitude, bias),
  };
}
