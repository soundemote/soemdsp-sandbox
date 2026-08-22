function nodeGraphPhaseRadians(value) {
  return wrapNodeSliderValue(Number(value) || 0, 0, 1) * Math.PI * 2;
}

const nodeGraphSineWavetableSize = 2048;
const nodeGraphSineWavetable = Object.freeze(Array.from({ length: nodeGraphSineWavetableSize + 1 }, (_, index) => {
  const phase = (Math.min(index, nodeGraphSineWavetableSize) / nodeGraphSineWavetableSize) * Math.PI * 2;
  return Math.sin(phase);
}));

function nodeGraphSmoothStep01(value) {
  const t = clampNodeSliderValue(Number(value) || 0, 0, 1);
  return t * t * (3 - 2 * t);
}

function nodeGraphNyquistFadeAmplitude(frequency, sampleRate) {
  const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const nyquist = safeRate * 0.5;
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const fadeStart = Math.min(20000, nyquist * 0.9);
  if (safeFrequency <= fadeStart) {
    return 1;
  }
  if (safeFrequency >= nyquist) {
    return 0;
  }
  const fadeProgress = (safeFrequency - fadeStart) / Math.max(1, nyquist - fadeStart);
  return 1 - nodeGraphSmoothStep01(fadeProgress);
}

function nodeGraphSineWavetableLookup(phaseRadians) {
  const cycle = wrapNodeSliderValue((Number(phaseRadians) || 0) / (Math.PI * 2), 0, 1);
  const position = cycle * nodeGraphSineWavetableSize;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = nodeGraphSineWavetable[index] || 0;
  const b = nodeGraphSineWavetable[index + 1] || nodeGraphSineWavetable[0] || 0;
  return a + (b - a) * fraction;
}

function nodeGraphSineCosWavetableSample(phaseRadians, frequency, amplitude, sampleRate) {
  const level = Math.max(0, Number(amplitude) || 0) * nodeGraphNyquistFadeAmplitude(frequency, sampleRate);
  return {
    cos: nodeGraphSineWavetableLookup((Number(phaseRadians) || 0) + Math.PI * 0.5) * level,
    sin: nodeGraphSineWavetableLookup(phaseRadians) * level,
  };
}

/** Expand a sin/cos pair into N-Phase jacks A–D. Unused taps are 0. */
function nodeGraphNPhaseFromSinCos(sin, cos, mode) {
  const s = Number(sin) || 0;
  const c = Number(cos) || 0;
  const m = Math.max(0, Math.min(5, Math.round(Number(mode) || 0)));
  const z = 0;
  if (m === 0) {
    return { A: s, B: z, C: z, D: z, sin: s, cos: z };
  }
  if (m === 1) {
    return { A: c, B: z, C: z, D: z, sin: c, cos: z };
  }
  if (m === 2) {
    return { A: s, B: c, C: z, D: z, sin: s, cos: c };
  }
  if (m === 3) {
    return { A: s, B: -s, C: z, D: z, sin: s, cos: -s };
  }
  if (m === 4) {
    const k = Math.sqrt(3) * 0.5;
    const b = s * -0.5 + c * k;
    const d = s * -0.5 - c * k;
    return { A: s, B: b, C: d, D: z, sin: s, cos: b };
  }
  return { A: s, B: c, C: -s, D: -c, sin: s, cos: c };
}

function nextNodeGraphNoiseSample(runtime, nodeId) {
  const seed = (Math.imul(1664525, runtime.noiseSeeds.get(nodeId) || 0x12345678) + 1013904223) >>> 0;
  runtime.noiseSeeds.set(nodeId, seed);
  return (seed / 0xffffffff) * 2 - 1;
}

function currentNodeGraphNoiseSample(runtime, nodeId) {
  if (!runtime?.noiseSeeds?.has(nodeId)) {
    return nextNodeGraphNoiseSample(runtime, nodeId);
  }
  return ((runtime.noiseSeeds.get(nodeId) || 0) / 0xffffffff) * 2 - 1;
}

function nodeGraphNoiseSeedKey(nodeId, seedValue, channel = "") {
  const seed = Math.max(0, Math.min(99999, Math.floor(Number(seedValue) || 0)));
  return `${nodeId}${channel ? `:${channel}` : ""}:seed:${seed}`;
}

function nextNodeGraphSeededNoiseSample(runtime, nodeId, seedValue, channel = "") {
  runtime.noiseSeedKeys ||= new Map();
  const noiseId = channel ? `${nodeId}:${channel}` : nodeId;
  const seedKey = nodeGraphNoiseSeedKey(nodeId, seedValue, channel);
  if (runtime.noiseSeedKeys.get(noiseId) !== seedKey) {
    runtime.noiseSeedKeys.set(noiseId, seedKey);
    runtime.noiseSeeds.set(noiseId, nodeGraphStableSeed(seedKey));
  }
  return nextNodeGraphNoiseSample(runtime, noiseId);
}

function nodeGraphNoiseSampleHoldSample(runtime, state, nodeId, seedValue, speed, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const safeSpeed = clampNodeSliderValue(Number(speed) || 0, 0, 1);
  const seedKey = nodeGraphNoiseSeedKey(nodeId, seedValue);
  if (state.seedKey !== seedKey) {
    state.seedKey = seedKey;
    state.initialized = false;
    state.phase = 0;
  }
  if (!state.initialized) {
    state.held = nextNodeGraphSeededNoiseSample(runtime, nodeId, seedValue);
    state.initialized = true;
  }
  const clockRate = safeSpeed * rate * 0.5;
  if (clockRate <= 0) {
    return state.held;
  }
  state.phase += clockRate / rate;
  while (state.phase >= 1) {
    state.phase -= 1;
    state.held = nextNodeGraphSeededNoiseSample(runtime, nodeId, seedValue);
  }
  return state.held;
}

function nodeGraphPolyBlep(phaseCycle, phaseIncrement) {
  const dt = clampNodeSliderValue(Math.abs(Number(phaseIncrement) || 0), 1e-6, 0.5);
  if (phaseCycle < dt) {
    const t = phaseCycle / dt;
    return t + t - t * t - 1;
  }
  if (phaseCycle > 1 - dt) {
    const t = (phaseCycle - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

// Direction-aware correction for the direct saw/ramp/square outputs. Mirrors
// the native basic_oscillator.cpp fix: nodeGraphPolyBlep() only ever used
// abs(phaseIncrement), so a negative (reverse-going) increment canceled the
// wrong half of the discontinuity. A plain sign flip of the result spikes at
// the wrap point -- this instead mirrors phaseCycle around 0 before handing
// it to the ordinary forward correction, then negates, which reproduces an
// exact time-reversal of the forward case. No-op when phaseIncrement >= 0.
function nodeGraphPolyBlepDirectional(phaseCycle, phaseIncrement) {
  const increment = Number(phaseIncrement) || 0;
  if (increment >= 0) {
    return nodeGraphPolyBlep(phaseCycle, increment);
  }
  return -nodeGraphPolyBlep(wrapNodeSliderValue(-phaseCycle, 0, 1), -increment);
}

function nodeGraphPolyBlepSquare(phaseCycle, phaseIncrement) {
  let value = phaseCycle < 0.5 ? 1 : -1;
  value += nodeGraphPolyBlep(phaseCycle, phaseIncrement);
  value -= nodeGraphPolyBlep(wrapNodeSliderValue(phaseCycle + 0.5, 0, 1), phaseIncrement);
  return value;
}

function nodeGraphPolyBlepSquareDirectional(phaseCycle, phaseIncrement) {
  let value = phaseCycle < 0.5 ? 1 : -1;
  value += nodeGraphPolyBlepDirectional(phaseCycle, phaseIncrement);
  value -= nodeGraphPolyBlepDirectional(wrapNodeSliderValue(phaseCycle + 0.5, 0, 1), phaseIncrement);
  return value;
}

// Naive LFO waveshapes matching native_modules/basic_oscillator (no
// polyBLEP / anti-aliasing). Discontinuities and triangle corners are raw.
// PolyBLEP helpers above remain for other modules (e.g. surge).
function nodeGraphOscillatorWaveformSample(runtime, nodeId, phase, phaseIncrement, waveform) {
  const phaseDelta = Number(phaseIncrement) || 0;
  const phaseStopped = Math.abs(phaseDelta) <= 1e-12;
  const phaseCycle = wrapNodeSliderValue(phase / (Math.PI * 2), 0, 1);
  let sample = 0;
  switch (Math.round(Number(waveform) || 0)) {
    case 1: // Ramp
      sample = -1 + phaseCycle * 2;
      break;
    case 2: // Square
      sample = phaseCycle < 0.5 ? 1 : -1;
      break;
    case 3: // Triangle
      sample = 1 - 4 * Math.abs(phaseCycle - 0.5);
      break;
    case 4: // Sine
      sample = Math.sin(phase);
      break;
    case 5: // Noise
      sample = phaseStopped ? currentNodeGraphNoiseSample(runtime, nodeId) : nextNodeGraphNoiseSample(runtime, nodeId);
      break;
    case 0: // Saw
    default:
      sample = 1 - phaseCycle * 2;
      break;
  }
  return sample;
}

/**
 * soemdsp Ellipsoid::getSineToSquare — Limit AA always on (C floor by ω=2πf/sr).
 * phaseCycles 0..1 | shape 0=sine 1=square
 */
function nodeGraphEllipsoidSineToSquare(
  phaseCycles,
  shape = 0,
  frequencyHz = 0,
  sampleRate = 44100,
  mode = 1, // ignored — Limit always
  phaseIncCycles = 0, // unused; ABI
) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Number(frequencyHz) || 0);
  const angle = (Number(phaseCycles) || 0) * Math.PI * 2;
  const sinPhase = Math.sin(angle);
  const cosPhase = Math.cos(angle);
  let c = 1 - clampNodeSliderValue(Number(shape) || 0, 0, 1);
  const cMin = Math.max(0, Math.min(1, (Math.PI * 2 * f) / sr));
  if (c < cMin) c = cMin;
  const xx = (cosPhase * cosPhase) + (sinPhase * c) * (sinPhase * c);
  if (xx <= 1e-24) {
    if (cosPhase > 0) return 1;
    if (cosPhase < 0) return -1;
    return 0;
  }
  const out = cosPhase / Math.sqrt(xx);
  return Number.isFinite(out) ? out : 0;
}

function nodeGraphEllipsoidSineToSquareVector(phaseCycles, params = {}) {
  const level = Number(params.amplitude) || Number(params.level) || 0;
  const shape = clampNodeSliderValue(Number(params.shape) || 0, 0, 1);
  const phase = Number(phaseCycles) || 0;
  const frequencyHz = Number(params.frequencyHz) || 0;
  const sampleRate = Number(params.sampleRate) || 44100;
  // Bi: −1…1 quadrature; Uni: 0…1 = (bi + 1) / 2
  const biX = nodeGraphEllipsoidSineToSquare(phase, shape, frequencyHz, sampleRate) * level;
  const biY = nodeGraphEllipsoidSineToSquare(phase - 0.25, shape, frequencyHz, sampleRate) * level;
  const uniX = 0.5 * (biX + level);
  const uniY = 0.5 * (biY + level);
  return {
    "Bi X": biX,
    "Bi Y": biY,
    "Uni X": uniX,
    "Uni Y": uniY,
    // Face / legacy aliases
    X: biX,
    Y: biY,
  };
}

// Full multi-param getEllipsoid (phase radians). Limit: scale floor by f/sr.
function nodeGraphEllipsoidSample(phase, offset = 0, shape = 0, scale = 1, frequencyHz = 0, sampleRate = 44100) {
  const phaseRadians = Number(phase) || 0;
  const sinPhase = Math.sin(phaseRadians);
  const cosPhase = Math.cos(phaseRadians);
  const shapeRadians = (Number(shape) || 0) * Math.PI;
  const shapeSin = Math.sin(shapeRadians);
  const shapeCos = Math.cos(shapeRadians);
  const safeOffset = Number(offset) || 0;
  let safeScale = Math.max(0, Number(scale) || 0);
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Number(frequencyHz) || 0);
  const scaleFloor = Math.max(0, Math.min(1, (Math.PI * 2 * f) / sr));
  if (safeScale < scaleFloor) safeScale = scaleFloor;
  const ax = safeOffset + cosPhase;
  const ay = safeScale * sinPhase;
  const denominator = Math.sqrt((ax * ax) + (ay * ay));
  if (denominator <= 1e-12) {
    return 0;
  }
  const out = ((ax * shapeCos) + (ay * shapeSin)) / denominator;
  return Number.isFinite(out) ? out : 0;
}

function nodeGraphEllipsoidVectorSample(phase, params = {}) {
  // Prefer sine→square when `shape` is provided (RoundShape path).
  if (params && Object.prototype.hasOwnProperty.call(params, "shape") && params.scaleX == null) {
    return nodeGraphEllipsoidSineToSquareVector(phase, params);
  }
  const level = Math.max(0, Number(params.amplitude) || Number(params.level) || 0);
  const frequencyHz = Number(params.frequencyHz) || 0;
  const sampleRate = Number(params.sampleRate) || 44100;
  const x = nodeGraphEllipsoidSample(phase, params.offsetX, params.shapeX, params.scaleX, frequencyHz, sampleRate) * level;
  const y = nodeGraphEllipsoidSample(phase - Math.PI * 0.5, params.offsetY, params.shapeY, params.scaleY, frequencyHz, sampleRate) * level;
  return {
    Out: x,
    Mono: x,
    Wave: x,
    "Wave Out": x,
    X: x,
    Y: y,
  };
}

const nodeGraphAdditiveWaveformChoices = Object.freeze([
  "Sine",
  "Sawtooth",
  "Square",
  "Triangle",
  "SawSquare",
  "DoubleSaw",
  "TriSaw",
  "Organ",
]);

const nodeGraphAdditiveHardMaxHarmonics = 1024;

function nodeGraphAdditiveDampingCurveValue(value = 0) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function nodeGraphAdditiveDampingAlgorithmValue(value = 0) {
  return Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
}

function nodeGraphRationalCurveValue(value = 0, skew = 0) {
  const t = clampNodeSliderValue(Number(value) || 0, 0, 1);
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  const safeSkew = clampNodeSliderValue(Number(skew) || 0, -0.999999, 0.999999);
  return clampNodeSliderValue(
    ((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t),
    0,
    1,
  );
}

function nodeGraphAdditiveFilterFrequencyValue(value = 20000, sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  const nyquist = Math.max(1, (Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100) * 0.5);
  return clampNodeSliderValue(Number(value) || 20000, 1, nyquist);
}

function nodeGraphAdditiveHarmonicDamping(harmonic, frequency, sampleRate, curveValue = 0, algorithm = 0, filterFrequency = 20000) {
  const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const safeFilterFrequency = nodeGraphAdditiveFilterFrequencyValue(filterFrequency, safeRate);
  if (safeFilterFrequency <= 0 || safeFrequency <= 0) {
    return 1;
  }
  const ratio = clampNodeSliderValue((Math.max(1, Number(harmonic) || 1) * safeFrequency) / safeFilterFrequency, 0, 1);
  return nodeGraphAdditiveDampingAmplitude({
    algorithm,
    curveValue,
    harmonic,
    maxHarmonics: Math.max(1, Math.floor(safeFilterFrequency / Math.max(1, safeFrequency))),
    ratio,
  });
}

function nodeGraphAdditiveDampingAmplitude({
  algorithm = 0,
  curveValue = 0,
  harmonic = 1,
  maxHarmonics = 1,
  ratio = 0,
} = {}) {
  const curve = nodeGraphAdditiveDampingCurveValue(curveValue);
  const mode = nodeGraphAdditiveDampingAlgorithmValue(algorithm);
  const t = clampNodeSliderValue(Number(ratio) || 0, 0, 1);
  if (t <= 0) {
    return 1;
  }
  if (t >= 1) {
    return 0;
  }
  if (mode === 1) {
    return clampNodeSliderValue((1 - t) ** (1 + curve * 7), 0, 1);
  }
  if (mode === 2) {
    const amount = 0.5 + curve * 12;
    const end = Math.exp(-amount);
    return clampNodeSliderValue((Math.exp(-t * amount) - end) / Math.max(0.0001, 1 - end), 0, 1);
  }
  if (mode === 3) {
    const cutoff = clampNodeSliderValue(0.95 - curve * 0.82, 0.08, 0.95);
    const order = 1 + Math.round(curve * 5);
    const raw = 1 / Math.sqrt(1 + (t / cutoff) ** (2 * order));
    const end = 1 / Math.sqrt(1 + (1 / cutoff) ** (2 * order));
    return clampNodeSliderValue((raw - end) / Math.max(0.0001, 1 - end), 0, 1);
  }
  if (mode === 4) {
    const knee = clampNodeSliderValue(0.78 - curve * 0.68, 0.04, 0.78);
    if (t <= knee) {
      return 1;
    }
    const local = (t - knee) / Math.max(0.0001, 1 - knee);
    return clampNodeSliderValue((1 - local) ** (1 + curve * 7), 0, 1);
  }
  if (mode === 5) {
    const tilt = curve * 4;
    if (tilt <= 0) {
      return 1 - t;
    }
    const h = Math.max(1, Number(harmonic) || 1);
    const maxH = Math.max(h, Number(maxHarmonics) || h);
    const raw = 1 / (h ** tilt);
    const end = 1 / (maxH ** tilt);
    return clampNodeSliderValue((raw - end) / Math.max(0.0001, 1 - end), 0, 1);
  }
  return clampNodeSliderValue(1 - nodeGraphRationalCurveValue(t, curve), 0, 1);
}

function nodeGraphAdditiveHarmonicCurveAmount({
  algorithm = 0,
  curveValue = 0,
  harmonic = 1,
  maxHarmonics = 1,
  ratio = 0,
} = {}) {
  return clampNodeSliderValue(1 - nodeGraphAdditiveDampingAmplitude({
    algorithm,
    curveValue,
    harmonic,
    maxHarmonics,
    ratio,
  }), 0, 1);
}

// Offline additive core: same additive_osc.wasm as the worklet (APP_POLICY §5).
// No JS harmonic twin. Graph inputs force silence (matches worklet: native
// path only when Damping/Phase graphs are unwired).
const nodeGraphAdditiveOscWasm = { promise: null, exports: null, failed: false };

function nodeGraphAdditiveOscLoadWasm() {
  if (nodeGraphAdditiveOscWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphAdditiveOscWasm.promise = fetch("/native_modules/additive_osc/additive_osc.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`additive_osc wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphAdditiveOscWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphAdditiveOscWasm.failed = true;
    });
}

function nodeGraphAdditiveOscillatorSample(runtime, nodeId, phase, params = {}, sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  // Graph curves are not in the native export; silence rather than a JS twin.
  if (params.hasGraphInput) {
    return 0;
  }
  nodeGraphAdditiveOscLoadWasm();
  const wasm = nodeGraphAdditiveOscWasm.exports;
  if (!wasm?.soemdsp_additive_osc_sample) {
    return 0;
  }
  const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const out = wasm.soemdsp_additive_osc_sample(
    Number(phase) || 0,
    Math.max(0, Number(params.frequency) || 0),
    Math.max(1, Math.min(nodeGraphAdditiveHardMaxHarmonics, Math.round(Number(params.harmonics) || 32))),
    Math.round(Number(params.waveform) || 0),
    clampNodeSliderValue(Number(params.modA) || 0, 0, 1),
    clampNodeSliderValue(Number(params.harmonicPhaseAdd) || 0, 0, 1),
    clampNodeSliderValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4),
    Math.max(0, Number(params.amplitude) || 0),
    Number(params.dampingFilterFrequency) || 20000,
    safeRate,
  );
  return Number.isFinite(out) ? out : 0;
}
