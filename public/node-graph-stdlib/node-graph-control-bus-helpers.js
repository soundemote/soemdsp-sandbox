// Pure control/bus DSP primitives shared by live evaluators and the worklet.
// No DOM, no nodeGraphMvp — safe to load into the AudioWorklet Blob.
//
// Used by: knob, toggle/momentary, audioInput,
// output (and similar).

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
  const bipolar = Math.round(nodeGraphFiniteNumber(polarity)) >= 1;
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
  let off = nodeGraphFiniteNumber(offset);
  // Only clamp when the caller actually passed a range. Number(null) is 0, so
  // `Number.isFinite(Number(null))` used to snap every omitted-range call to 0.
  const lo = Number(rangeMin);
  const hi = Number(rangeMax);
  if (
    rangeMin != null
    && rangeMax != null
    && Number.isFinite(lo)
    && Number.isFinite(hi)
  ) {
    off = nodeGraphDspClamp(off, lo, hi);
  }
  const input = nodeGraphFiniteNumber(inSample);
  const value = input + off;
  return { Bias: value, Out: value, offset: off, value: off };
}

/** Controller Bias target: params[key] + domainOffset when Use real mod values. */
function nodeGraphDspControllerBiasTarget(node, controlKey, fallback) {
  const raw = Number(node?.params?.[controlKey]);
  const base = Number.isFinite(raw) ? raw : fallback;
  const meta = node?.paramMeta?.[controlKey] && typeof node.paramMeta[controlKey] === "object"
    ? node.paramMeta[controlKey]
    : {};
  if (typeof nodeGraphParamFoldOrBase === "function") {
    const folded = Number(nodeGraphParamFoldOrBase(base, [], meta));
    return Number.isFinite(folded) ? folded : base;
  }
  if (meta.outputDomain === true) {
    const off = Number(meta.domainOffset);
    return base + (Number.isFinite(off) ? off : 0);
  }
  return base;
}

/** Knob Bias domain from Parameter Settings on `offset` (min/max). */
function nodeGraphDspKnobOffsetDomain(node) {
  const meta = node?.paramMeta?.offset && typeof node.paramMeta.offset === "object"
    ? node.paramMeta.offset
    : {};
  let lo = Number(meta.min);
  let hi = Number(meta.max);
  // Read-only legacy fallback when Settings unset — does not write/migrate patch.
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    const params = node?.params && typeof node.params === "object" ? node.params : {};
    const rn = Number(params.rangeMin);
    const rm = Number(params.rangeMax);
    const pol = Number(params.polarity);
    if (Number.isFinite(rn) || Number.isFinite(rm)) {
      if (typeof nodeGraphDspControllerRange === "function") {
        const range = nodeGraphDspControllerRange(
          Number.isFinite(rn) ? rn : 0,
          Number.isFinite(rm) ? rm : 1,
          Number.isFinite(pol) ? pol : 0,
        );
        lo = Number(range.min);
        hi = Number(range.max);
      } else {
        if (!Number.isFinite(lo) && Number.isFinite(rn)) lo = rn;
        if (!Number.isFinite(hi) && Number.isFinite(rm)) hi = rm;
      }
    }
  }
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 1;
  if (lo > hi) {
    const swap = lo;
    lo = hi;
    hi = swap;
  }
  if (!(hi > lo)) hi = lo + 1e-9;
  return {
    bipolar: lo < 0 && hi > 0,
    max: hi,
    min: lo,
  };
}

function nodeGraphDspControllerSmoothingSamples(meta, params, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  let v = Number(meta && meta.smoothingSeconds);
  if (!Number.isFinite(v) && params && typeof params === "object"
      && Object.prototype.hasOwnProperty.call(params, "smoothingSeconds")) {
    v = Number(params.smoothingSeconds);
  }
  if (!Number.isFinite(v) || v <= 0) {
    return 0;
  }
  if (v > 0 && v < 1) {
    return Math.max(1, Math.round(v * rate));
  }
  return Math.max(1, Math.round(v));
}


/** Latch / toggle / gate style binary out from a continuous param. */
function nodeGraphDspBinaryOut(raw) {
  const out = Number(raw) > 0.5 ? 1 : 0;
  return { Out: out, value: out };
}

const NODE_GRAPH_CONTROLLER_SMOOTHING_TYPES = Object.freeze([
  "linear",
  "onePole",
  "twoPole",
  "papoulis",
]);

function nodeGraphDspControllerSmoothingTypeFromIndex(value) {
  const i = Math.max(0, Math.min(3, Math.round(nodeGraphFiniteNumber(value))));
  return NODE_GRAPH_CONTROLLER_SMOOTHING_TYPES[i] || "linear";
}

/**
 * Explicit Min/Max range. Legacy Knob Polarity=Bipolar with Min still at 0
 * maps to −Max…+Max so old patches keep thru-zero Bias.
 */
function nodeGraphDspControllerRange(rangeMin, rangeMax, polarity) {
  let lo = Number(rangeMin);
  let hi = Number(rangeMax);
  if (!Number.isFinite(lo)) {
    lo = 0;
  }
  if (!Number.isFinite(hi)) {
    hi = 1;
  }
  if (Math.round(nodeGraphFiniteNumber(polarity)) >= 1 && Math.abs(lo) <= 1e-12 && hi > 0) {
    lo = -Math.abs(hi);
  }
  if (lo > hi) {
    const swap = lo;
    lo = hi;
    hi = swap;
  }
  if (!(hi > lo)) {
    hi = lo + 1e-9;
  }
  return {
    bipolar: lo < 0 && hi > 0,
    max: hi,
    min: lo,
  };
}

function nodeGraphDspControllerUnitToRange(unit, rangeMin, rangeMax, _polarity) {
  // Off = rangeMin, On = rangeMax. Do not sort the ends — inverted ranges
  // (min 1, max 0) are how a mute / pad toggle is authored.
  const u = Number(unit);
  const t = Number.isFinite(u) ? (u < 0 ? 0 : (u > 1 ? 1 : u)) : 0;
  let lo = Number(rangeMin);
  let hi = Number(rangeMax);
  if (!Number.isFinite(lo)) {
    lo = 0;
  }
  if (!Number.isFinite(hi)) {
    hi = 1;
  }
  return lo + (hi - lo) * t;
}

/** Overlay Smooth time/algo onto the hidden mouse-target param (offset/value). */
function nodeGraphDspApplyControllerSmoothingMeta(node, controlKey) {
  if (!node || !controlKey) {
    return null;
  }
  if (!node.paramMeta || typeof node.paramMeta !== "object") {
    node.paramMeta = {};
  }
  const params = node.params && typeof node.params === "object" ? node.params : {};
  const existing = node.paramMeta[controlKey] && typeof node.paramMeta[controlKey] === "object"
    ? node.paramMeta[controlKey]
    : {};
  const hasModuleSmooth = Object.prototype.hasOwnProperty.call(params, "smoothingSeconds");
  if (!hasModuleSmooth) {
    // Knob: Bias Parameter Settings own smooth — do not invent / stomp.
    return existing;
  }
  const seconds = Number(params.smoothingSeconds);
  const snap = !Number.isFinite(seconds) || seconds <= 0;
  const type = nodeGraphDspControllerSmoothingTypeFromIndex(params.smoothingType);
  const meta = {
    ...existing,
    linearSmoothing: !snap,
    smoothingMode: snap ? "off" : "internal",
    smoothingSeconds: snap ? 0 : seconds,
    smoothingType: snap ? "none" : type,
  };
  node.paramMeta[controlKey] = meta;
  return meta;
}

function nodeGraphDspApplyControllerLiveSmoothing(runtimeNode) {
  const type = String(runtimeNode?.type || "");
  if (type !== "knob" && type !== "pluginSlider" && type !== "toggleButton" && type !== "momentaryButton") {
    return runtimeNode;
  }
  nodeGraphDspApplyControllerSmoothingMeta(runtimeNode, "offset");
  return runtimeNode;
}

function nodeGraphDspControllerBiasEnds(node, key = "offset") {
  const meta = node?.paramMeta?.[key] && typeof node.paramMeta[key] === "object"
    ? node.paramMeta[key]
    : {};
  let lo = Number(meta.min);
  let hi = Number(meta.max);
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 1;
  return { min: lo, max: hi };
}

function nodeGraphDspControllerBiasIsOn(value, ends) {
  const v = Number(value);
  if (!Number.isFinite(v)) return false;
  const lo = Number(ends?.min);
  const hi = Number(ends?.max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return v > 0.5;
  if (Math.abs(hi - lo) < 1e-12) return v > 0.5;
  return Math.abs(v - hi) <= Math.abs(v - lo);
}

function nodeGraphDspControllerDisplayIsMouse(node) {
  const n = Number(node?.params?.displaySource);
  return !Number.isFinite(n) || Math.round(n) < 1;
}

/** Classic stereo bus sum: Left/Right += Mono, Out = mono-mix. */
function nodeGraphDspStereoMix(mono, left, right) {
  const m = nodeGraphFiniteNumber(mono);
  const l = nodeGraphFiniteNumber(left);
  const r = nodeGraphFiniteNumber(right);
  return {
    Left: m + l,
    Right: m + r,
    Out: m + (l + r) * 0.5,
  };
}

/** Sandbox I/O is locked to 3: Mono, Left, Right. */
const NODE_GRAPH_SANDBOX_IO_PORTS = Object.freeze(["Mono", "Left", "Right"]);

function nodeGraphDspSandboxIoTrio(mix) {
  const left = nodeGraphFiniteNumber(mix?.Left);
  const right = nodeGraphFiniteNumber(mix?.Right);
  const mono = nodeGraphFiniteNumber(mix?.Out, (left + right) * 0.5);
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
    Left: (nodeGraphFiniteNumber(live.Left)) + wired.Left,
    Right: (nodeGraphFiniteNumber(live.Right)) + wired.Right,
    Out: (nodeGraphFiniteNumber(live.Out)) + wired.Out,
  });
}

/** Input loudness: Amplitude (current) or leftover `level`. */
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
 * Plugin / keyboard MIDI → Gate, MIDI, Velocity, pitch (♯/♭), Frequency.
 * pitch = MIDI note number. Frequency is A440.
 * signal: { gate, rawMidi|midi, velocity }
 */
function nodeGraphDspMidiKeyboardPorts(signal, defaultNote) {
  const sig = signal || {};
  const def = Math.round(nodeGraphDspClamp(defaultNote, 0, 127));
  const gateHigh = Number(sig.gate) > 0;
  const midi = gateHigh
    ? Math.round(nodeGraphDspClamp(Number(sig.rawMidi ?? sig.midi ?? def), 0, 127))
    : def;
  const velocity = gateHigh ? nodeGraphDspClamp(nodeGraphFiniteNumber(sig.velocity, 0.8), 0, 1) : 0;
  return {
    Gate: velocity,
    Trigger: Number(sig.gatePulse) > 0 ? velocity : 0,
    MIDI: midi,
    Velocity: velocity,
    "pitch": midi,
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
    return Math.round(nodeGraphDspClamp(nodeGraphFiniteNumber(jackSample), 0, 127));
  }
  return Math.round(nodeGraphDspClamp(knobMidi, 0, 127));
}
