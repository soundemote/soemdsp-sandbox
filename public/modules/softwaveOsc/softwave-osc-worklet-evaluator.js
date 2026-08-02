// Softwave Oscillator — worklet (pure JS port of DistortionOscillator).

NodeLiveAudioProcessor.prototype.createSoftwaveOscillatorState = function createSoftwaveOscillatorState() {
  return { phase: 0 };
};

// Shared stdlib (node-graph-phasor-helpers.js, first in worklet Blob).
NodeLiveAudioProcessor.prototype.softwaveWrap01 = function softwaveWrap01(phase) {
  return nodeGraphWrap01(phase);
};

NodeLiveAudioProcessor.prototype.softwaveTanh = function softwaveTanh(x) {
  const v = Number(x) || 0;
  if (v > 5) return 1;
  if (v < -5) return -1;
  return Math.tanh(v);
};

NodeLiveAudioProcessor.prototype.softwaveParabolSine = function softwaveParabolSine(x) {
  let xin = x;
  if (x > 0.5) xin = x - 0.5;
  xin = xin * 4 - 1;
  const a = xin * xin;
  if (x > 0.5) return 0 - (1 - a) * (1 - a * 0.202);
  return (1 - a) * (1 - a * 0.202);
};

NodeLiveAudioProcessor.prototype.softwaveFreqToPitch = function softwaveFreqToPitch(frequencyHz) {
  const f = Math.max(1e-12, Number(frequencyHz) || 0);
  return 69 + 12 * (Math.log(f / 440) / Math.LN2);
};

NodeLiveAudioProcessor.prototype.softwaveSineAmp = function softwaveSineAmp(frequencyHz, sampleRate) {
  const f = Math.max(1, Number(frequencyHz) || 1);
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const quarter = sr * 0.25;
  const denom = Math.max(1e-12, Math.log10(f) * f);
  return (quarter / denom) * (Math.PI * 0.5) * 0.8;
};

NodeLiveAudioProcessor.prototype.softwaveMorphFactor = function softwaveMorphFactor(morph) {
  const m = Math.max(0, Math.min(1, Number(morph) || 0));
  return Math.pow(m, 4) * 0.999 + 0.001;
};

NodeLiveAudioProcessor.prototype.softwaveRunShape = function softwaveRunShape(
  finalPhase, waveform, sineAmp, morphFactor, frequencyHz,
) {
  const shape = Math.max(0, Math.min(9, Math.round(Number(waveform) || 0)));
  const p = this.softwaveWrap01(finalPhase);
  const sa = Number(sineAmp) || 0;
  const mf = Number(morphFactor) || 0.001;
  const pi = Math.PI;
  const tanh = (x) => this.softwaveTanh(x);
  const para = (x) => this.softwaveParabolSine(x);

  switch (shape) {
    case 0: {
      const toSine = (p * 2 - 1) * pi;
      return tanh(Math.sin(toSine) * sa * mf) * Math.cos(toSine);
    }
    case 1:
      return tanh(para(p) * sa * mf) * para((p + 0.25) % 1);
    case 2: {
      const a = tanh(Math.sin(p * pi * 2) * sa * mf) * Math.sin(((p + 0.25) % 1) * pi * 2);
      return Math.acos(Math.max(-1, Math.min(1, a))) / (pi * 0.5) - 1;
    }
    case 3: {
      const bow = para(p);
      return tanh(bow * sa * mf)
        * (tanh(bow * sa * 0.5 * mf) * para((p + 0.25) % 1) * 0.5 + 0.5);
    }
    case 4:
      return tanh(para(p) * sa * mf);
    case 5: {
      const t = Math.max(0, Math.min(1, mf));
      const adjusted = 0.15 + (1 - 0.15) * t;
      const scaling = tanh((1 - (this.softwaveFreqToPitch(frequencyHz) / 127)) * 9);
      return Math.acos(Math.max(-1, Math.min(1, Math.sin(p * pi * 2) * adjusted * scaling)))
        / pi * 2 - 1;
    }
    case 6: {
      const bow = para(p);
      return tanh(bow * sa * mf) * bow * 2 - 1;
    }
    case 7: {
      const bow = para(p);
      const sq = tanh(bow * sa * mf);
      return tanh(sq * bow * 2) * 2 - 1;
    }
    case 8: {
      const bow = para(p);
      const sq = tanh(bow * sa * mf);
      return sq * 0.5 + 0.5 - tanh(sq * bow * 2);
    }
    case 9:
    default:
      return para(p);
  }
};

NodeLiveAudioProcessor.prototype.softwaveOscillatorSample = function softwaveOscillatorSample(state, options = {}) {
  const st = state || this.createSoftwaveOscillatorState();
  const frequencyHz = Math.max(0, Number(options.frequencyHz) || 0);
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  const level = Number(options.level);
  const gain = Number.isFinite(level) ? level : 1;
  if (frequencyHz <= 0 || !Number.isFinite(frequencyHz)) {
    return { Out: 0 };
  }
  const increment = frequencyHz / sampleRate;
  st.phase = this.softwaveWrap01((Number(st.phase) || 0) + increment);
  const phaseOffset = this.softwaveWrap01(options.phase || 0);
  const aa = Math.max(0, Number(options.antialias) || 0);
  const finalPhase = aa > 0
    ? this.softwaveWrap01(st.phase + phaseOffset + aa * 0.0005 * Math.sin(st.phase * 97.13))
    : this.softwaveWrap01(st.phase + phaseOffset);
  const sample = this.softwaveRunShape(
    finalPhase,
    options.waveform,
    this.softwaveSineAmp(frequencyHz, sampleRate),
    this.softwaveMorphFactor(options.morph),
    frequencyHz,
  );
  return { Out: Number.isFinite(sample) ? sample * gain : 0 };
};
