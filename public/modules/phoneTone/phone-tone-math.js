// Phone Tone — ITU-T Q.23 DTMF pairs from Analog 0–1 and/or Digital slot.
// Same idle map as Keypad: analog 0 / digital 0 = no key. Gate mutes audio
// when connected and low. Robin sinusoids: Tone = sum, ƒ1/ƒ2 = pitched Hz.

const NODE_GRAPH_PHONE_TONE_LABELS = Object.freeze([
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "*", "0", "#",
]);

const NODE_GRAPH_PHONE_TONE_COUNT = NODE_GRAPH_PHONE_TONE_LABELS.length;

// Low group (rows) × high group (columns). 12-key pad only (no 1633 Hz column).
const NODE_GRAPH_PHONE_TONE_PAIRS = Object.freeze([
  Object.freeze([697, 1209]), // 1
  Object.freeze([697, 1336]), // 2
  Object.freeze([697, 1477]), // 3
  Object.freeze([770, 1209]), // 4
  Object.freeze([770, 1336]), // 5
  Object.freeze([770, 1477]), // 6
  Object.freeze([852, 1209]), // 7
  Object.freeze([852, 1336]), // 8
  Object.freeze([852, 1477]), // 9
  Object.freeze([941, 1209]), // *
  Object.freeze([941, 1336]), // 0
  Object.freeze([941, 1477]), // #
]);

function nodeGraphPhoneToneWrap(value, count = NODE_GRAPH_PHONE_TONE_COUNT) {
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_PHONE_TONE_COUNT));
  const raw = Math.round(Number(value) || 0);
  return ((raw % n) + n) % n;
}

function nodeGraphPhoneToneAnalogSlot(analog, count = NODE_GRAPH_PHONE_TONE_COUNT) {
  if (typeof nodeGraphKeypadAnalogSlot === "function") {
    return nodeGraphKeypadAnalogSlot(analog, count);
  }
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_PHONE_TONE_COUNT));
  const unit = Math.max(0, Math.min(1, Number(analog) || 0));
  if (!(unit > 0)) {
    return null;
  }
  return Math.min(n - 1, Math.floor(unit * n - 1e-9));
}

/** Digital 1 = key "1". 0 = idle (no key). */
function nodeGraphPhoneToneDigitalSlot(digital, count = NODE_GRAPH_PHONE_TONE_COUNT) {
  if (typeof nodeGraphKeypadDigitalToSlot === "function") {
    return nodeGraphKeypadDigitalToSlot(digital, count);
  }
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_PHONE_TONE_COUNT));
  const value = Math.round(Number(digital) || 0);
  if (value <= 0) {
    return null;
  }
  return nodeGraphPhoneToneWrap(value - 1, n);
}

function nodeGraphPhoneTonePair(slot) {
  const index = nodeGraphPhoneToneWrap(slot);
  const pair = NODE_GRAPH_PHONE_TONE_PAIRS[index] || NODE_GRAPH_PHONE_TONE_PAIRS[0];
  return [pair[0], pair[1]];
}

function createNodeGraphPhoneToneVoice() {
  const make = typeof createNodeGraphRobinSinusoidState === "function"
    ? createNodeGraphRobinSinusoidState
    : () => ({ x: 1, y: 0, cosW: 1, sinW: 0, omega: 0, primed: false, renormCounter: 0 });
  return { low: make(), high: make() };
}

function createNodeGraphPhoneToneState() {
  return {
    analog: createNodeGraphPhoneToneVoice(),
    digital: createNodeGraphPhoneToneVoice(),
  };
}

function nodeGraphPhoneToneVoiceParts(voice, pair, amplitude, sampleRate) {
  const sine = typeof nodeGraphRobinSinusoidSample === "function"
    ? nodeGraphRobinSinusoidSample
    : () => 0;
  const x = sine(voice.low, pair[0], amplitude, sampleRate, 0, false);
  const z = sine(voice.high, pair[1], amplitude, sampleRate, 0, false);
  return { x, z };
}

/** Octave ratio from the Pitch Offset knob. 0 = 1×, 1 = +1 octave, −1 = −1 octave. */
function nodeGraphPhoneToneOctaveRatio(pitchOffsetOctaves) {
  const n = Number(pitchOffsetOctaves);
  if (!Number.isFinite(n) || n === 0) {
    return 1;
  }
  const ratio = 2 ** n;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/**
 * 0.1V/Oct ratio (1 when the jack is unconnected). Same law as oscillators:
 * 2^((cv − reference) / 0.1).
 */
function nodeGraphPhoneTonePitchCvRatio(hasPitchCv, pitchCv, referenceVoltage) {
  if (typeof nodeGraphParamResolveOscPitchHz === "function") {
    const ratio = nodeGraphParamResolveOscPitchHz({
      baseHz: 1,
      hasPitchCv: Boolean(hasPitchCv),
      pitchCv,
      referenceVoltage,
    });
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }
  if (!hasPitchCv) {
    return 1;
  }
  const cv = Number(pitchCv);
  const ref = Number(referenceVoltage);
  const pitch = Number.isFinite(cv) ? cv : 0;
  const reference = Number.isFinite(ref) ? ref : 0;
  const ratio = 2 ** ((pitch - reference) / 0.1);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function nodeGraphPhoneToneClampHz(hz) {
  const cap = typeof nodeGraphProjectSpeedLimitHz === "function"
    ? nodeGraphProjectSpeedLimitHz()
    : (typeof nodeGraphSinepulseMaxHz === "function" ? nodeGraphSinepulseMaxHz() : 20000);
  const n = Number(hz);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n > cap) return cap;
  if (n < -cap) return -cap;
  return n;
}

/** Table Hz → pitched Hz: * 2^pitchOffset * 0.1V ratio, then + Frequency Offset. */
function nodeGraphPhoneTonePitchedHz(baseHz, pitchOffsetOctaves, freqOffsetHz, pitchCvRatio = 1) {
  const base = Number(baseHz);
  const table = Number.isFinite(base) ? base : 0;
  const cv = Number(pitchCvRatio);
  const cvRatio = Number.isFinite(cv) && cv > 0 ? cv : 1;
  const add = Number(freqOffsetHz);
  const hz = table * nodeGraphPhoneToneOctaveRatio(pitchOffsetOctaves) * cvRatio
    + (Number.isFinite(add) ? add : 0);
  return nodeGraphPhoneToneClampHz(hz);
}

function nodeGraphPhoneToneSample(state, options = {}) {
  const hasAnalog = Boolean(options.hasAnalog);
  const hasDigital = Boolean(options.hasDigital);
  const hasGate = Boolean(options.hasGate);
  const gateOpen = !hasGate || Number(options.gate) >= 0.5;
  const offset = Number(options.freqOffset);
  const freqOffset = Number.isFinite(offset) ? offset : 0;
  const pitchOffset = Number(options.pitchOffset);
  const pitchOff = Number.isFinite(pitchOffset) ? pitchOffset : 0;
  const cvRatioIn = Number(options.pitchCvRatio);
  const pitchCvRatio = Number.isFinite(cvRatioIn) && cvRatioIn > 0 ? cvRatioIn : 1;
  const amp = Number(options.amplitude);
  const amplitude = Number.isFinite(amp) ? amp : 0;
  const rate = Math.max(1, Number(options.sampleRate) || 44100);
  const pitchPair = (pair) => [
    nodeGraphPhoneTonePitchedHz(pair[0], pitchOff, freqOffset, pitchCvRatio),
    nodeGraphPhoneTonePitchedHz(pair[1], pitchOff, freqOffset, pitchCvRatio),
  ];

  const analogSlot = hasAnalog ? nodeGraphPhoneToneAnalogSlot(options.analog) : null;
  const digitalSlot = hasDigital ? nodeGraphPhoneToneDigitalSlot(options.digital) : null;
  const slots = [];
  if (analogSlot != null) slots.push(analogSlot);
  if (digitalSlot != null && digitalSlot !== analogSlot) slots.push(digitalSlot);

  const reportSlot = digitalSlot != null ? digitalSlot : analogSlot;
  const report = reportSlot == null ? [0, 0] : pitchPair(nodeGraphPhoneTonePair(reportSlot));
  const df1 = reportSlot == null ? 0 : report[0];
  const df2 = reportSlot == null ? 0 : report[1];

  const each = slots.length > 0 ? amplitude / (slots.length * 2) : 0;
  let low = 0;
  let high = 0;
  if (analogSlot != null && state?.analog) {
    const parts = nodeGraphPhoneToneVoiceParts(
      state.analog,
      pitchPair(nodeGraphPhoneTonePair(analogSlot)),
      each,
      rate,
    );
    low += parts.x;
    high += parts.z;
  }
  if (digitalSlot != null && state?.digital && digitalSlot !== analogSlot) {
    const parts = nodeGraphPhoneToneVoiceParts(
      state.digital,
      pitchPair(nodeGraphPhoneTonePair(digitalSlot)),
      each,
      rate,
    );
    low += parts.x;
    high += parts.z;
  }

  const x = gateOpen ? low : 0;
  const z = gateOpen ? high : 0;
  const tone = x + z;
  const analogThru = hasAnalog ? Number(options.analog) || 0 : 0;
  const digitalThru = hasDigital ? Number(options.digital) || 0 : 0;
  return {
    "Analog Thru": analogThru,
    "Digital Thru": digitalThru,
    Df1: df1,
    Df2: df2,
    Out: tone,
    Tone: tone,
    ToneL: x,
    ToneR: z,
    X: x,
    Z: z,
    f1: df1,
    f2: df2,
    "ƒ1": df1,
    "ƒ2": df2,
  };
}
