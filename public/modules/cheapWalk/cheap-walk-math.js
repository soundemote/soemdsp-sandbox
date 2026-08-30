// Cheap Walk — reflecting bipolar LCG walk (same kernel as additive Noisy ParB).

function createNodeGraphCheapWalkState(seed = 1) {
  return {
    x: 0,
    seed: (Number(seed) >>> 0) || 1,
    lastSeed: Number(seed) || 1,
  };
}

function nodeGraphCheapWalkCore(state, params, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const rate = Math.max(0, Number(params.rate) || 0);
  const amp = Math.max(0, Math.min(1, Number(params.amplitude) || 0));
  const seedParam = Number(params.seed);
  if (Number.isFinite(seedParam) && seedParam !== state.lastSeed) {
    state.seed = (seedParam < 1 ? 1 : seedParam) >>> 0 || 1;
    state.x = 0;
    state.lastSeed = seedParam;
  }
  let speed01 = rate / sr;
  if (speed01 > 1) speed01 = 1;
  const step = speed01 * 0.35;
  let s = state.seed >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  state.seed = s;
  const bipolar = (s / 4294967295) * 2 - 1;
  let x = state.x + bipolar * step;
  if (x > 1) x = 2 - x;
  if (x < -1) x = -2 - x;
  state.x = x;
  return x * amp;
}
