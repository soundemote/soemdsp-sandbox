// Musical experiment shelf — pure-JS mono engines on the Scale + Root bus.
// (No polyphony. No classic up/down/rnd arp menu.)
//
// Shared helpers + modules:
//   degreeTuring   — mutating shift-register over scale degrees
//   gravityWalker  — nearest-tone walk with leap CV / residual memory
//   degreePhrase   — 8-step degree phrase + rest + mutate corrosion
//   noteGlide      — portamento on 0.1V/Oct
//   noteTranspose  — semitone / octave offset on 0.1V/Oct

// ─── shared pitch-class helpers ─────────────────────────────────────────────

function nodeGraphMusicalNormalizeMask(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n & 0xFFF;
}

/** Pitch classes 0..11 present in mask, ascending. */
function nodeGraphMusicalClassesFromMask(mask) {
  const m = nodeGraphMusicalNormalizeMask(mask);
  const out = [];
  for (let pc = 0; pc < 12; pc += 1) {
    if ((m >> pc) & 1) {
      out.push(pc);
    }
  }
  return out;
}

/** MIDI note from 0.1V/Oct (semitone = pitch * 120). */
function nodeGraphMusicalMidiFromPitch(pitch) {
  return (Number(pitch) || 0) * 120;
}

function nodeGraphMusicalPitchFromMidi(midi) {
  return (Number(midi) || 0) / 120;
}

/**
 * Classes rotated so index 0 is the first class at/above rootPc,
 * then wrapping — useful for "chord tones from root upward".
 */
function nodeGraphMusicalClassesFromRoot(mask, rootPitch) {
  const classes = nodeGraphMusicalClassesFromMask(mask);
  if (!classes.length) {
    return [];
  }
  const rootMidi = nodeGraphMusicalMidiFromPitch(rootPitch);
  const rootPc = ((Math.round(rootMidi) % 12) + 12) % 12;
  let start = 0;
  for (let i = 0; i < classes.length; i += 1) {
    if (classes[i] >= rootPc) {
      start = i;
      break;
    }
    start = 0;
  }
  // Prefer class == rootPc if present.
  for (let i = 0; i < classes.length; i += 1) {
    if (classes[i] === rootPc) {
      start = i;
      break;
    }
  }
  return classes.slice(start).concat(classes.slice(0, start));
}

/**
 * Map degree index (any int) + root octave to absolute MIDI.
 * degree 0 = first class from root ordering; wraps through the set,
 * climbing octaves as degree increases.
 */
function nodeGraphMusicalDegreeToMidi(rootPitch, classesFromRoot, degreeIndex) {
  const n = classesFromRoot.length;
  if (n < 1) {
    return nodeGraphMusicalMidiFromPitch(rootPitch);
  }
  const rootMidi = nodeGraphMusicalMidiFromPitch(rootPitch);
  const rootOctaveBase = Math.floor(rootMidi / 12) * 12;
  // Align so degree 0 lands near root's octave.
  const d = Math.floor(Number(degreeIndex) || 0);
  const wrapped = ((d % n) + n) % n;
  const octaveSpan = Math.floor(d / n) - Math.floor(0 / n);
  // When d negative, floor division already handles octaveSpan.
  const pc = classesFromRoot[wrapped];
  let midi = rootOctaveBase + pc;
  // If degree 0 class is below root pitch class in absolute terms, may sit low;
  // lift into/near root octave band.
  const rootPc = ((Math.round(rootMidi) % 12) + 12) % 12;
  if (pc < rootPc && wrapped === 0 && d >= 0) {
    // first class is root itself usually; fine
  }
  midi += octaveSpan * 12;
  // Keep degree 0 roughly at root's octave: if midi is more than 6 st below root, +12
  if (d >= 0 && d < n && midi < rootMidi - 6) {
    midi += 12;
  }
  return midi;
}

function nodeGraphMusicalRisingEdge(state, key, signal, threshold = 0) {
  const high = Number(signal) > threshold;
  const was = Boolean(state[key]);
  state[key] = high;
  return high && !was;
}

// ─── Degree Turing ──────────────────────────────────────────────────────────
// Mutating bit register drives a degree index into Scale+Root. Long period,
// corrosion via probability — not a 3-note staircase.

function createNodeGraphDegreeTuringState() {
  return {
    clockWasHigh: false,
    resetWasHigh: false,
    register: 0xA5, // non-zero seed so first steps aren't silent
    lastMidi: 60,
  };
}

function nodeGraphDegreeTuringSample(state, options = {}) {
  const length = Math.max(2, Math.min(16, Math.round(Number(options.length) || 8)));
  const probability = Math.max(0, Math.min(1, Number(options.probability) ?? 0.18));
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const level = Number(options.level) ?? 1;
  const mask = nodeGraphMusicalNormalizeMask(
    options.hasScaleInput ? options.scaleInput : (options.scaleMask ?? 2741),
  );
  const root = Number(options.root) || (60 / 120);
  const classes = nodeGraphMusicalClassesFromRoot(mask, root);

  if (nodeGraphMusicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    state.register = 0xA5 & ((1 << length) - 1);
  }

  let trig = 0;
  if (nodeGraphMusicalRisingEdge(state, "clockWasHigh", options.clock, 0)) {
    const regMask = (1 << length) - 1;
    const topBit = (state.register >> (length - 1)) & 1;
    const newBit = Math.random() < probability ? 1 - topBit : topBit;
    state.register = ((state.register << 1) | newBit) & regMask;
    trig = 1;
  }

  const regMask = (1 << length) - 1;
  const reg = state.register & regMask;
  const degreeSpan = Math.max(1, classes.length * (octaves + 1));
  const degree = classes.length ? (reg % degreeSpan) : 0;
  const midi = classes.length
    ? nodeGraphMusicalDegreeToMidi(root, classes, degree)
    : state.lastMidi;
  state.lastMidi = midi;
  const gateBit = reg & 1;

  return {
    "0.1V/Oct": nodeGraphMusicalPitchFromMidi(midi),
    Gate: gateBit * level,
    Trigger: trig * level,
    Degree: classes.length ? degree / Math.max(1, degreeSpan - 1) : 0,
    CV: ((reg / Math.max(1, regMask)) * 2 - 1) * level,
  };
}

// ─── Gravity Walker ─────────────────────────────────────────────────────────
// Cursor on degree line; each clock prefers small steps, leap CV / leap% jumps.

function createNodeGraphGravityWalkerState() {
  return {
    clockWasHigh: false,
    resetWasHigh: false,
    degree: 0,
    lastMidi: 60,
    inertia: 1, // last step direction ±1
  };
}

function nodeGraphGravityWalkerSample(state, options = {}) {
  const level = Number(options.level) ?? 1;
  const leapAmount = Math.max(0, Math.min(1, Number(options.leap) ?? 0.15));
  const leapCv = Math.max(0, Math.min(1, Math.abs(Number(options.leapCv) || 0)));
  const leapProb = Math.max(0, Math.min(1, leapAmount + leapCv * 0.85));
  const gravity = Math.max(0, Math.min(1, Number(options.gravity) ?? 0.65));
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const mask = nodeGraphMusicalNormalizeMask(
    options.hasScaleInput ? options.scaleInput : (options.scaleMask ?? 2741),
  );
  const root = Number(options.root) || (60 / 120);
  const classes = nodeGraphMusicalClassesFromRoot(mask, root);
  const span = Math.max(1, classes.length * (octaves + 1));

  if (nodeGraphMusicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    state.degree = 0;
    state.inertia = 1;
  }

  let trig = 0;
  if (nodeGraphMusicalRisingEdge(state, "clockWasHigh", options.clock, 0) && classes.length) {
    trig = 1;
    if (Math.random() < leapProb) {
      // Leap: random degree, mild bias toward remaining in band.
      const jump = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(span / 2)));
      state.inertia = Math.random() < 0.5 ? -1 : 1;
      state.degree = (state.degree + state.inertia * jump + span * 8) % span;
    } else {
      // Gravity: continue in inertia direction; sometimes reverse or stay.
      let step = state.inertia;
      if (Math.random() > gravity) {
        step = Math.random() < 0.5 ? -step : 0;
      }
      if (step === 0) {
        step = Math.random() < 0.5 ? -1 : 1;
      }
      state.inertia = step >= 0 ? 1 : -1;
      state.degree = (state.degree + step + span * 8) % span;
    }
  }

  const midi = classes.length
    ? nodeGraphMusicalDegreeToMidi(root, classes, state.degree)
    : state.lastMidi;
  state.lastMidi = midi;

  return {
    "0.1V/Oct": nodeGraphMusicalPitchFromMidi(midi),
    Gate: (classes.length ? 1 : 0) * level,
    Trigger: trig * level,
    Degree: span > 1 ? state.degree / (span - 1) : 0,
  };
}

// ─── Degree Phrase ──────────────────────────────────────────────────────────
// 8 knobs = scale degrees (0..1 → degree index) or rest if step active < 0.5
// mutate% flips a random step's degree occasionally — corrosion, not pure rnd.

function createNodeGraphDegreePhraseState() {
  return {
    clockWasHigh: false,
    resetWasHigh: false,
    index: 0,
    lastMidi: 60,
    // Working copy of degrees so mutate doesn't destroy knobs permanently
    // until re-seeded from params on reset or when mutate hits.
    liveDegrees: null,
    liveRests: null,
  };
}

function nodeGraphDegreePhraseEnsureLive(state, degrees, rests) {
  if (!state.liveDegrees || state.liveDegrees.length !== degrees.length) {
    state.liveDegrees = degrees.slice();
    state.liveRests = rests.slice();
  }
}

function nodeGraphDegreePhraseSample(state, options = {}) {
  const level = Number(options.level) ?? 1;
  const steps = Math.max(1, Math.min(8, Math.round(Number(options.steps) || 8)));
  const mutate = Math.max(0, Math.min(1, Number(options.mutate) ?? 0.08));
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const mask = nodeGraphMusicalNormalizeMask(
    options.hasScaleInput ? options.scaleInput : (options.scaleMask ?? 2741),
  );
  const root = Number(options.root) || (60 / 120);
  const classes = nodeGraphMusicalClassesFromRoot(mask, root);
  const span = Math.max(1, classes.length * (octaves + 1));

  const degrees = [];
  const rests = [];
  for (let i = 0; i < 8; i += 1) {
    const v = Number(options[`step${i + 1}`]);
    const raw = Number.isFinite(v) ? v : (i / 7);
    // step value 0..1 → degree; restN separate or use rest flags
    const restFlag = Number(options[`rest${i + 1}`]) > 0.5;
    rests.push(restFlag);
    degrees.push(Math.max(0, Math.min(span - 1, Math.round(raw * (span - 1)))));
  }

  if (nodeGraphMusicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    state.index = 0;
    state.liveDegrees = degrees.slice();
    state.liveRests = rests.slice();
  }

  nodeGraphDegreePhraseEnsureLive(state, degrees, rests);

  // Soft pull live steps toward knob values so tweaking knobs still matters.
  for (let i = 0; i < 8; i += 1) {
    if (Math.random() < 0.02) {
      state.liveDegrees[i] = degrees[i];
      state.liveRests[i] = rests[i];
    }
  }

  let trig = 0;
  let gate = 0;
  if (nodeGraphMusicalRisingEdge(state, "clockWasHigh", options.clock, 0)) {
    if (Math.random() < mutate) {
      const j = Math.floor(Math.random() * steps);
      if (Math.random() < 0.35) {
        state.liveRests[j] = !state.liveRests[j];
      } else {
        state.liveDegrees[j] = Math.floor(Math.random() * span);
      }
    }
    const i = state.index % steps;
    state.index = (state.index + 1) % steps;
    if (!state.liveRests[i] && classes.length) {
      trig = 1;
      gate = 1;
      state.lastMidi = nodeGraphMusicalDegreeToMidi(root, classes, state.liveDegrees[i]);
    }
  } else {
    // Hold gate high for rest of clock high if we fired — simple: gate follows last trig until next clock
    // For mono voice envelopes, Trigger on edge is enough; Gate = not rest at current step.
    const prev = (state.index - 1 + steps) % steps;
    gate = (!state.liveRests[prev] && classes.length) ? 1 : 0;
  }

  return {
    "0.1V/Oct": nodeGraphMusicalPitchFromMidi(state.lastMidi),
    Gate: gate * level,
    Trigger: trig * level,
    Phase: (state.index % steps) / Math.max(1, steps),
  };
}

// ─── Note Glide ─────────────────────────────────────────────────────────────

function createNodeGraphNoteGlideState() {
  return { current: null };
}

function nodeGraphNoteGlideSample(state, options = {}, sampleRate = 44100) {
  const target = Number(options.pitch) || 0;
  const time = Math.max(0, Number(options.time) || 0);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  if (state.current == null || !Number.isFinite(state.current)) {
    state.current = target;
    return { "0.1V/Oct": target };
  }
  if (time <= 1e-6) {
    state.current = target;
    return { "0.1V/Oct": target };
  }
  // One-pole toward target with ~time seconds to settle.
  const coeff = 1 - Math.exp(-1 / (time * rate));
  state.current += (target - state.current) * coeff;
  return { "0.1V/Oct": state.current };
}

// ─── Note Transpose ─────────────────────────────────────────────────────────

function createNodeGraphNoteTransposeState() {
  return {};
}

function nodeGraphNoteTransposeSample(options = {}) {
  const pitch = Number(options.pitch) || 0;
  const semitones = Number(options.semitones) || 0;
  const octaves = Number(options.octaves) || 0;
  const midi = nodeGraphMusicalMidiFromPitch(pitch) + semitones + octaves * 12;
  return { "0.1V/Oct": nodeGraphMusicalPitchFromMidi(midi) };
}
