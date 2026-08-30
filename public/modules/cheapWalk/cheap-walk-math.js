// Cheap Walk — reflecting bipolar LCG walk (same kernel as additive Noisy ParB).
// Stereo: independent L/R lanes from one Seed (R seed = L seed ^ 0x9E3779B9).

const NODE_GRAPH_CHEAP_WALK_RIGHT_SEED_XOR = 0x9E3779B9;

function createNodeGraphCheapWalkLane(seed = 1) {
  return {
    x: 0,
    seed: (Number(seed) >>> 0) || 1,
  };
}

function createNodeGraphCheapWalkState(seed = 1) {
  const s = (Number(seed) >>> 0) || 1;
  let rightSeed = (s ^ NODE_GRAPH_CHEAP_WALK_RIGHT_SEED_XOR) >>> 0;
  if (!rightSeed) rightSeed = 1;
  return {
    left: createNodeGraphCheapWalkLane(s),
    right: createNodeGraphCheapWalkLane(rightSeed),
    lastSeed: nodeGraphFiniteNumber(seed, 1),
    // Legacy mono fields (kept so old single-lane callers still reseed).
    x: 0,
    seed: s,
  };
}

function nodeGraphCheapWalkStepLane(lane, step) {
  let s = lane.seed >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  lane.seed = s;
  const bipolar = (s / 4294967295) * 2 - 1;
  let x = lane.x + bipolar * step;
  if (x > 1) x = 2 - x;
  if (x < -1) x = -2 - x;
  lane.x = x;
  return x;
}

function nodeGraphCheapWalkEnsureStereoState(state, seedParam) {
  if (!state.left || !state.right) {
    const base = createNodeGraphCheapWalkState(seedParam);
    state.left = base.left;
    state.right = base.right;
    state.lastSeed = base.lastSeed;
  }
  if (Number.isFinite(seedParam) && seedParam !== state.lastSeed) {
    const s = (seedParam < 1 ? 1 : seedParam) >>> 0 || 1;
    state.left.seed = s;
    state.left.x = 0;
    let rightSeed = (s ^ NODE_GRAPH_CHEAP_WALK_RIGHT_SEED_XOR) >>> 0;
    if (!rightSeed) rightSeed = 1;
    state.right.seed = rightSeed;
    state.right.x = 0;
    state.lastSeed = seedParam;
    state.seed = s;
    state.x = 0;
  }
}

/** @returns {{ Left: number, Right: number }} */
function nodeGraphCheapWalkCoreStereo(state, params, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const rate = Math.max(0, Number(params.rate) || 0);
  const amp = Math.max(0, Math.min(1, Number(params.amplitude) || 0));
  const seedParam = Number(params.seed);
  nodeGraphCheapWalkEnsureStereoState(state, Number.isFinite(seedParam) ? seedParam : state.lastSeed);
  let speed01 = rate / sr;
  if (speed01 > 1) speed01 = 1;
  const step = speed01 * 0.35;
  const left = nodeGraphCheapWalkStepLane(state.left, step) * amp;
  const right = nodeGraphCheapWalkStepLane(state.right, step) * amp;
  state.x = left;
  return { Left: left, Right: right };
}

/** Legacy mono helper — Left lane only. */
function nodeGraphCheapWalkCore(state, params, sampleRate) {
  return nodeGraphCheapWalkCoreStereo(state, params, sampleRate).Left;
}
