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
  runtime.oscillatorStoppedSamples ||= new Map();
  if (phaseStopped && runtime.oscillatorStoppedSamples.has(nodeId)) {
    return runtime.oscillatorStoppedSamples.get(nodeId) || 0;
  }
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
  if (phaseStopped) {
    runtime.oscillatorStoppedSamples.set(nodeId, sample);
  } else {
    runtime.oscillatorStoppedSamples.delete(nodeId);
  }
  return sample;
}

function nodeGraphEllipsoidSample(phase, offset = 0, shape = 0, scale = 1) {
  const phaseRadians = Number(phase) || 0;
  const sinPhase = Math.sin(phaseRadians);
  const cosPhase = Math.cos(phaseRadians);
  const shapeRadians = (Number(shape) || 0) * Math.PI;
  const shapeSin = Math.sin(shapeRadians);
  const shapeCos = Math.cos(shapeRadians);
  const safeOffset = clampNodeSliderValue(Number(offset) || 0, -1, 1);
  const safeScale = Math.max(0, Number(scale) || 0);
  const x = safeOffset + cosPhase;
  const y = safeScale * sinPhase;
  const denominator = Math.sqrt((x * x) + (y * y));
  if (denominator <= 1e-12) {
    return 0;
  }
  return clampNodeSliderValue(((x * shapeCos) + (y * shapeSin)) / denominator, -1, 1);
}

function nodeGraphEllipsoidVectorSample(phase, params = {}) {
  const level = clampNodeSliderValue(Number(params.level) || 0, 0, 1);
  const x = nodeGraphEllipsoidSample(phase, params.offsetX, params.shapeX, params.scaleX) * level;
  const y = nodeGraphEllipsoidSample(phase - Math.PI * 0.5, params.offsetY, params.shapeY, params.scaleY) * level;
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

function nodeGraphAdditiveWaveformHarmonic(waveform, harmonic, modA = 0.5) {
  const n = Math.max(1, Math.floor(Number(harmonic) || 1));
  const h = n;
  const mod = clampNodeSliderValue(Number(modA) || 0, 0, 1);
  switch (Math.round(Number(waveform) || 0)) {
    case 0:
      return { amplitude: n === Math.max(1, Math.floor(99 * mod + 1)) ? 1 : 0, phase: 0 };
    case 2:
      return { amplitude: n % 2 === 1 ? 1 / h : 0, phase: mod * 0.5 };
    case 3:
      return { amplitude: n % 2 === 1 ? 1 / (h * h) : 0, phase: n % 4 === 1 ? 0 : 0.5 };
    case 4:
      return { amplitude: n % 2 === 1 ? 1 / h : (1 / h) * (1 - mod), phase: 0 };
    case 5:
      return { amplitude: Math.cos(h * mod * 0.5) / h, phase: 0 };
    case 6:
      {
        const peak = clampNodeSliderValue(mod, 0.001, 0.999);
        return { amplitude: (Math.sin(0.5 * h * peak) / (peak * (1 - peak) * h * h)) * 0.2, phase: 0 };
      }
    case 7:
      {
        const octaves = Math.max(2, Math.floor(2 + mod * 11));
        let target = 1;
        while (target < n) {
          target *= octaves;
        }
        return { amplitude: target === n ? 1 / h : 0, phase: 0 };
      }
    case 1:
    default:
      return { amplitude: 1 / h, phase: n % 2 === 1 ? 0.5 : 0 };
  }
}

function nodeGraphAdditiveOscillatorSample(runtime, nodeId, phase, params = {}, sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const frequency = Math.max(0, Number(params.frequency) || 0);
  const maxHarmonics = Math.max(
    1,
    Math.min(nodeGraphAdditiveHardMaxHarmonics, Math.round(Number(params.harmonics) || 32)),
  );
  const waveform = Math.round(Number(params.waveform) || 0);
  const modA = clampNodeSliderValue(Number(params.modA) || 0, 0, 1);
  const harmonicPhaseAdd = clampNodeSliderValue(Number(params.harmonicPhaseAdd) || 0, 0, 1);
  const harmonicPhaseMultiply = clampNodeSliderValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4);
  const level = clampNodeSliderValue(Number(params.level) || 0, 0, 1);
  const dampingFilterFrequency = nodeGraphAdditiveFilterFrequencyValue(params.dampingFilterFrequency, safeRate);
  const dampingGraphValueAt = typeof params.dampingGraphValueAt === "function"
    ? params.dampingGraphValueAt
    : () => 1;
  const phaseGraphValueAt = typeof params.phaseGraphValueAt === "function"
    ? params.phaseGraphValueAt
    : () => 0;
  const harmonicLimit = Math.max(1, Math.min(maxHarmonics, Math.floor(Math.min(20000, safeRate * 0.45) / Math.max(1, frequency))));
  let total = 0;
  let norm = 0;
  for (let harmonic = 1; harmonic <= harmonicLimit; harmonic += 1) {
    const partial = nodeGraphAdditiveWaveformHarmonic(waveform, harmonic, modA);
    const dampingX = clampNodeSliderValue((frequency * harmonic) / dampingFilterFrequency, 0, 1);
    const amplitude = (Number(partial.amplitude) || 0) * clampNodeSliderValue(
      Number(dampingGraphValueAt(dampingX)) || 0,
      0,
      1,
    );
    if (amplitude === 0) {
      continue;
    }
    const harmonicRatio = harmonicLimit > 1
      ? (harmonic - 1) / (harmonicLimit - 1)
      : 0;
    const phaseCurve = clampNodeSliderValue(Number(phaseGraphValueAt(harmonicRatio)) || 0, 0, 1);
    const phaseMultiplier = 1 + phaseCurve * harmonicPhaseMultiply;
    const phaseOffset = (Number(partial.phase) || 0) + phaseCurve * harmonicPhaseAdd;
    total += Math.sin((phase * harmonic * phaseMultiplier) + phaseOffset * Math.PI * 2) * amplitude;
    norm += Math.abs(amplitude);
  }
  if (norm <= 0) {
    return 0;
  }
  return clampNodeSliderValue((total / Math.max(1, norm * 0.72)) * level, -1, 1);
}
