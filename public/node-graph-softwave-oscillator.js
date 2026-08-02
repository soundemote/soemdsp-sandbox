// Softwave Oscillator — port of soemdsp::oscillator::DistortionOscillator
// (soft-shaped multi-wave with tanh / morph). User-facing name is Softwave;
// not a "distortion effect."

const nodeGraphSoftwaveWaveshape = Object.freeze({
  AnalogSawSine: 0,
  AnalogSawParabol: 1,
  PerfectSaw: 2,
  AnalogSquare: 3,
  Square: 4,
  Tri: 5,
  BowTri: 6,
  SoftBowTri: 7, // DistortedBowTri in the C++ original
  WalterWave: 8,
  ParabolSine: 9,
});

const nodeGraphSoftwaveWaveformChoices = Object.freeze([
  "Analog Saw Sine",
  "Analog Saw Parabol",
  "Perfect Saw",
  "Analog Square",
  "Square",
  "Tri",
  "Bow Tri",
  "Soft Bow Tri",
  "Walter Wave",
  "Parabol Sine",
]);

function createNodeGraphSoftwaveOscillatorState() {
  return { phase: 0 };
}

function nodeGraphSoftwaveClamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

// Shared stdlib (node-graph-phasor-helpers.js).
function nodeGraphSoftwaveWrap01(phase) {
  return nodeGraphWrap01(phase);
}

/** BH-style tanh (same spirit as DistortionOscillator::tanHApprox). */
function nodeGraphSoftwaveTanh(x) {
  const v = Number(x) || 0;
  if (v > 5) {
    return 1;
  }
  if (v < -5) {
    return -1;
  }
  // Prefer Math.tanh when available (browser/worklet both have it).
  if (typeof Math.tanh === "function") {
    return Math.tanh(v);
  }
  const xx = v * v;
  return v / (1 + xx / (3 + xx / (5 + xx / (7 + xx / (9 + xx / 11)))));
}

function nodeGraphSoftwaveParabolSine(x) {
  let xin = x;
  if (x > 0.5) {
    xin = x - 0.5;
  }
  xin = xin * 4 - 1;
  const a = xin * xin;
  if (x > 0.5) {
    return 0 - (1 - a) * (1 - a * 0.202);
  }
  return (1 - a) * (1 - a * 0.202);
}

function nodeGraphSoftwaveMap0to1(value, min, max) {
  const t = nodeGraphSoftwaveClamp01(value);
  return min + (max - min) * t;
}

function nodeGraphSoftwaveToBipolar(unipolar) {
  return unipolar * 2 - 1;
}

/** Rough MIDI pitch from Hz (for Tri scaling, mirrors convert::freq_to_pitch). */
function nodeGraphSoftwaveFreqToPitch(frequencyHz) {
  const f = Math.max(1e-12, Number(frequencyHz) || 0);
  return 69 + 12 * (Math.log(f / 440) / Math.LN2);
}

function nodeGraphSoftwaveSineAmp(frequencyHz, sampleRate) {
  const f = Math.max(1, Number(frequencyHz) || 1);
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const quarter = sr * 0.25;
  const logf = Math.log10(f);
  const denom = Math.max(1e-12, logf * f);
  // constant::kPIz2 = π/2
  return (quarter / denom) * (Math.PI * 0.5) * 0.8;
}

function nodeGraphSoftwaveMorphFactor(morph) {
  const m = nodeGraphSoftwaveClamp01(morph);
  return Math.pow(m, 4) * 0.999 + 0.001;
}

function nodeGraphSoftwaveRunShape(finalPhase, waveform, sineAmp, morphFactor, frequencyHz) {
  const shape = Math.max(0, Math.min(9, Math.round(Number(waveform) || 0)));
  const p = nodeGraphSoftwaveWrap01(finalPhase);
  const sa = Number(sineAmp) || 0;
  const mf = Number(morphFactor) || 0.001;
  const pi = Math.PI;

  switch (shape) {
    case nodeGraphSoftwaveWaveshape.AnalogSawSine: {
      const toSine = (p * 2 - 1) * pi;
      return nodeGraphSoftwaveTanh(Math.sin(toSine) * sa * mf) * Math.cos(toSine);
    }
    case nodeGraphSoftwaveWaveshape.AnalogSawParabol: {
      return nodeGraphSoftwaveTanh(nodeGraphSoftwaveParabolSine(p) * sa * mf)
        * nodeGraphSoftwaveParabolSine((p + 0.25) % 1);
    }
    case nodeGraphSoftwaveWaveshape.PerfectSaw: {
      const a = nodeGraphSoftwaveTanh(Math.sin(p * pi * 2) * sa * mf)
        * Math.sin(((p + 0.25) % 1) * pi * 2);
      return Math.acos(Math.max(-1, Math.min(1, a))) / (pi * 0.5) - 1;
    }
    case nodeGraphSoftwaveWaveshape.AnalogSquare: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      return nodeGraphSoftwaveTanh(bow * sa * mf)
        * (nodeGraphSoftwaveTanh(bow * sa * 0.5 * mf)
          * nodeGraphSoftwaveParabolSine((p + 0.25) % 1) * 0.5 + 0.5);
    }
    case nodeGraphSoftwaveWaveshape.Square: {
      return nodeGraphSoftwaveTanh(nodeGraphSoftwaveParabolSine(p) * sa * mf);
    }
    case nodeGraphSoftwaveWaveshape.Tri: {
      const adjusted = nodeGraphSoftwaveMap0to1(mf, 0.15, 1);
      const scaling = nodeGraphSoftwaveTanh((1 - (nodeGraphSoftwaveFreqToPitch(frequencyHz) / 127)) * 9);
      return Math.acos(Math.max(-1, Math.min(1, Math.sin(p * pi * 2) * adjusted * scaling)))
        / pi * 2 - 1;
    }
    case nodeGraphSoftwaveWaveshape.BowTri: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      return nodeGraphSoftwaveToBipolar(nodeGraphSoftwaveTanh(bow * sa * mf) * bow);
    }
    case nodeGraphSoftwaveWaveshape.SoftBowTri: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      const sq = nodeGraphSoftwaveTanh(bow * sa * mf);
      return nodeGraphSoftwaveToBipolar(nodeGraphSoftwaveTanh(sq * bow * 2));
    }
    case nodeGraphSoftwaveWaveshape.WalterWave: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      const sq = nodeGraphSoftwaveTanh(bow * sa * mf);
      return sq * 0.5 + 0.5 - nodeGraphSoftwaveTanh(sq * bow * 2);
    }
    case nodeGraphSoftwaveWaveshape.ParabolSine:
    default:
      return nodeGraphSoftwaveParabolSine(p);
  }
}

/**
 * @returns {{ Out: number }}
 */
function nodeGraphSoftwaveOscillatorSample(state, options = {}) {
  const st = state || createNodeGraphSoftwaveOscillatorState();
  const frequencyHz = Math.max(0, Number(options.frequencyHz) || 0);
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const level = Number(options.level);
  const gain = Number.isFinite(level) ? level : 1;
  const morph = nodeGraphSoftwaveClamp01(options.morph);
  const waveform = options.waveform;
  const aa = Math.max(0, Number(options.antialias) || 0);

  if (frequencyHz <= 0 || !Number.isFinite(frequencyHz)) {
    return { Out: 0 };
  }

  const increment = frequencyHz / sampleRate;
  let phase = Number(st.phase) || 0;
  // Optional free-run phase offset (cycles) applied after advance.
  const phaseOffset = nodeGraphSoftwaveWrap01(options.phase || 0);
  phase = nodeGraphSoftwaveWrap01(phase + increment);
  st.phase = phase;

  // Light phase jitter stand-in for antialiasingAmplitude (no RNG in hot path v1).
  const finalPhase = aa > 0
    ? nodeGraphSoftwaveWrap01(phase + phaseOffset + (aa * 0.0005 * Math.sin(phase * 97.13)))
    : nodeGraphSoftwaveWrap01(phase + phaseOffset);

  const sineAmp = nodeGraphSoftwaveSineAmp(frequencyHz, sampleRate);
  const morphFactor = nodeGraphSoftwaveMorphFactor(morph);
  const sample = nodeGraphSoftwaveRunShape(
    finalPhase,
    waveform,
    sineAmp,
    morphFactor,
    frequencyHz,
  );
  const out = Number.isFinite(sample) ? sample * gain : 0;
  return { Out: out };
}
