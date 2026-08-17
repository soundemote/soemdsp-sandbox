// Pure control/bus DSP primitives shared by live evaluators and the worklet.
// No DOM, no nodeGraphMvp — safe to load into the AudioWorklet Blob.
//
// Used by: knob, pluginSlider, toggle/momentary, audioInput/pluginInput,
// output/pluginOutput, pluginMidiIn, midiOut/pluginMidiOut (and similar).

function nodeGraphDspClamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) {
    return lo;
  }
  return x < lo ? lo : (x > hi ? hi : x);
}

/** MIDI note number → Hz (A4 = 440). */
function nodeGraphDspMidiNoteToHz(midi) {
  return 440 * (2 ** ((nodeGraphDspClamp(midi, 0, 127) - 69) / 12));
}

/**
 * Knob Bias domain range from Max + Polarity (0=Unipolar, 1=Bipolar).
 * Unipolar → [0, max]. Bipolar → [−max, +max].
 */
function nodeGraphDspKnobBiasRange(rangeMax, polarity) {
  const raw = Math.abs(Number(rangeMax));
  const hi = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const bipolar = Math.round(Number(polarity) || 0) >= 1;
  return {
    bipolar,
    max: hi,
    min: bipolar ? -hi : 0,
  };
}

/**
 * Bias/offset control: Out = In + offset (unwired In treated as 0).
 * Returns Bias, Out, and both offset/value aliases for knob vs slider param keys.
 * Optional min/max clamps the dial offset only (In can still push Bias outside).
 */
function nodeGraphDspBiasFromIn(offset, inSample, rangeMin = null, rangeMax = null) {
  let off = Number(offset) || 0;
  if (Number.isFinite(Number(rangeMin)) && Number.isFinite(Number(rangeMax))) {
    off = nodeGraphDspClamp(off, Number(rangeMin), Number(rangeMax));
  }
  const input = Number(inSample) || 0;
  const value = input + off;
  return { Bias: value, Out: value, offset: off, value: off };
}

/** Latch / toggle / gate style binary out from a continuous param. */
function nodeGraphDspBinaryOut(raw) {
  const out = Number(raw) > 0.5 ? 1 : 0;
  return { Out: out, value: out };
}

/** Classic stereo bus sum: Left/Right += Mono, Out = mono-mix. */
function nodeGraphDspStereoMix(mono, left, right) {
  const m = Number(mono) || 0;
  const l = Number(left) || 0;
  const r = Number(right) || 0;
  return {
    Left: m + l,
    Right: m + r,
    Out: m + (l + r) * 0.5,
  };
}

/** Sandbox I/O is locked to 3: Mono, Left, Right. */
const NODE_GRAPH_SANDBOX_IO_PORTS = Object.freeze(["Mono", "Left", "Right"]);

function nodeGraphDspSandboxIoTrio(mix) {
  const left = Number(mix?.Left) || 0;
  const right = Number(mix?.Right) || 0;
  const mono = Number(mix?.Out) || (left + right) * 0.5;
  return {
    Left: left,
    Mono: mono,
    Out: mono,
    Right: right,
  };
}

/** Live mic/host plus wired Mono/Left/Right. */
function nodeGraphDspSandboxIoFrame(liveStereo, mono, left, right) {
  const wired = nodeGraphDspStereoMix(mono, left, right);
  const live = liveStereo && typeof liveStereo === "object" ? liveStereo : {};
  return nodeGraphDspSandboxIoTrio({
    Left: (Number(live.Left) || 0) + wired.Left,
    Right: (Number(live.Right) || 0) + wired.Right,
    Out: (Number(live.Out) || 0) + wired.Out,
  });
}

/** Input / Plugin Input loudness: Amplitude (current) or leftover `level`. */
function nodeGraphReadIoInputAmplitude(params, fallback = 1) {
  const amp = Number(params?.amplitude);
  if (Number.isFinite(amp)) {
    return amp;
  }
  const level = Number(params?.level);
  if (Number.isFinite(level)) {
    return level;
  }
  const fb = Number(fallback);
  return Number.isFinite(fb) ? fb : 1;
}

/**
 * Read one frame of external stereo input (mic/host) at amplitude level.
 * externalInput shape: { left?: Float32Array|number[], right?: ... }
 */
function nodeGraphDspExternalStereoFrame(externalInput, frame, level) {
  const input = externalInput || {};
  const leftChannel = input.left || input.right || null;
  const rightChannel = input.right || input.left || null;
  const rawL = Number(leftChannel?.[frame]);
  const rawR = Number(rightChannel?.[frame]);
  const left = Number.isFinite(rawL) ? rawL : 0;
  const right = Number.isFinite(rawR) ? rawR : left;
  const ampRaw = Number(level);
  const amp = Number.isFinite(ampRaw) ? ampRaw : 1;
  return {
    Left: left * amp,
    Right: right * amp,
    Out: ((left + right) * 0.5) * amp,
  };
}

/**
 * Plugin / keyboard MIDI → Gate, MIDI, Velocity, 0.1V/Oct, Frequency.
 * signal: { gate, rawMidi|midi, velocity }
 */
function nodeGraphDspMidiKeyboardPorts(signal, defaultNote) {
  const sig = signal || {};
  const def = Math.round(nodeGraphDspClamp(defaultNote, 0, 127));
  const gate = Number(sig.gate) > 0.5 ? 1 : 0;
  const midi = gate
    ? Math.round(nodeGraphDspClamp(Number(sig.rawMidi ?? sig.midi ?? def), 0, 127))
    : def;
  const velocity = gate ? nodeGraphDspClamp(Number(sig.velocity) || 0.8, 0, 1) : 0;
  return {
    Gate: gate,
    MIDI: midi,
    Velocity: velocity,
    "0.1V/Oct": midi / 120,
    Frequency: nodeGraphDspMidiNoteToHz(midi),
  };
}

/**
 * MIDI number → Full Value + Normalized; optional Gate when includeGate.
 * midiNumber is preferred value (already resolved from jack vs knob).
 */
function nodeGraphDspMidiNumberPorts(midiNumber, options = {}) {
  const midi = Math.round(nodeGraphDspClamp(midiNumber, 0, 127));
  const out = {
    "Full Value": midi,
    Normalized: midi / 127,
  };
  if (options.includeGate) {
    const hasGate = options.hasGate;
    out.Gate = hasGate
      ? (Number(options.gate) > 0.5 ? 1 : 0)
      : 1;
  }
  return out;
}

/**
 * Resolve MIDI number from optional jack vs knob (0..127).
 */
function nodeGraphDspResolveMidiNumber(knobMidi, jackSample, hasJack) {
  if (hasJack) {
    return Math.round(nodeGraphDspClamp(Number(jackSample) || 0, 0, 127));
  }
  return Math.round(nodeGraphDspClamp(knobMidi, 0, 127));
}
