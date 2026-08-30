// Worklet-side pure-JS musical engines (no native). Includes helpers + spruced
// Chord Memory / Turing / Chord Sequencer JS paths so Live Audio matches offline.

// ── helpers (mirror node-graph-musical-engines.js) ───────────────────────────

NodeLiveAudioProcessor.prototype.musicalNormalizeMask = function musicalNormalizeMask(raw) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? (n & 0xFFF) : 0;
};

NodeLiveAudioProcessor.prototype.musicalClassesFromMask = function musicalClassesFromMask(mask) {
  const m = this.musicalNormalizeMask(mask);
  const out = [];
  for (let pc = 0; pc < 12; pc += 1) {
    if ((m >> pc) & 1) out.push(pc);
  }
  return out;
};

NodeLiveAudioProcessor.prototype.musicalMidiFromPitch = function musicalMidiFromPitch(pitch) {
  return (Number(pitch) || 0) * 120;
};

NodeLiveAudioProcessor.prototype.musicalPitchFromMidi = function musicalPitchFromMidi(midi) {
  return (Number(midi) || 0) / 120;
};

NodeLiveAudioProcessor.prototype.musicalClassesFromRoot = function musicalClassesFromRoot(mask, rootPitch) {
  const classes = this.musicalClassesFromMask(mask);
  if (!classes.length) return [];
  const rootMidi = this.musicalMidiFromPitch(rootPitch);
  const rootPc = ((Math.round(rootMidi) % 12) + 12) % 12;
  let start = 0;
  for (let i = 0; i < classes.length; i += 1) {
    if (classes[i] === rootPc) { start = i; break; }
    if (classes[i] >= rootPc) { start = i; break; }
  }
  return classes.slice(start).concat(classes.slice(0, start));
};

NodeLiveAudioProcessor.prototype.musicalDegreeToMidi = function musicalDegreeToMidi(rootPitch, classesFromRoot, degreeIndex) {
  const n = classesFromRoot.length;
  if (n < 1) return this.musicalMidiFromPitch(rootPitch);
  const rootMidi = this.musicalMidiFromPitch(rootPitch);
  const rootOctaveBase = Math.floor(rootMidi / 12) * 12;
  const d = Math.floor(Number(degreeIndex) || 0);
  const wrapped = ((d % n) + n) % n;
  const octaveSpan = Math.floor(d / n);
  let midi = rootOctaveBase + classesFromRoot[wrapped] + octaveSpan * 12;
  if (d >= 0 && d < n && midi < rootMidi - 6) midi += 12;
  return midi;
};

NodeLiveAudioProcessor.prototype.musicalRisingEdge = function musicalRisingEdge(state, key, signal, threshold = 0) {
  const high = Number(signal) > threshold;
  const was = Boolean(state[key]);
  state[key] = high;
  return high && !was;
};

const NODE_GRAPH_MUSICAL_SCALE_PRESETS = [4095, 2741, 1453, 661, 1193, 1365];

NodeLiveAudioProcessor.prototype.musicalPresetMask = function musicalPresetMask(choice) {
  const i = Math.max(0, Math.min(NODE_GRAPH_MUSICAL_SCALE_PRESETS.length - 1, Math.round(Number(choice) || 0)));
  return NODE_GRAPH_MUSICAL_SCALE_PRESETS[i];
};

// ── Degree Turing ───────────────────────────────────────────────────────────

NodeLiveAudioProcessor.prototype.createDegreeTuringState = function createDegreeTuringState() {
  return { clockWasHigh: false, resetWasHigh: false, register: 0xA5, lastMidi: 60 };
};

NodeLiveAudioProcessor.prototype.degreeTuringSample = function degreeTuringSample(state, options = {}) {
  const length = Math.max(2, Math.min(16, Math.round(Number(options.length) || 8)));
  const probability = this.clampValue(Number(options.probability) ?? 0.18, 0, 1);
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const level = Number(options.level) ?? 1;
  const mask = options.hasScaleInput
    ? this.musicalNormalizeMask(options.scaleInput)
    : this.musicalPresetMask(options.scaleChoice);
  const root = Number(options.root) || (60 / 120);
  const classes = this.musicalClassesFromRoot(mask, root);

  if (this.musicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    state.register = 0xA5 & ((1 << length) - 1);
  }
  let trig = 0;
  if (this.musicalRisingEdge(state, "clockWasHigh", options.clock, 0)) {
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
  const midi = classes.length ? this.musicalDegreeToMidi(root, classes, degree) : state.lastMidi;
  state.lastMidi = midi;
  return {
    "0.1V/Oct": this.musicalPitchFromMidi(midi),
    Gate: (reg & 1) * level,
    Trigger: trig * level,
    Degree: classes.length ? degree / Math.max(1, degreeSpan - 1) : 0,
    CV: ((reg / Math.max(1, regMask)) * 2 - 1) * level,
  };
};

// ── Gravity Walker ──────────────────────────────────────────────────────────

NodeLiveAudioProcessor.prototype.createGravityWalkerState = function createGravityWalkerState() {
  return { clockWasHigh: false, resetWasHigh: false, degree: 0, lastMidi: 60, inertia: 1 };
};

NodeLiveAudioProcessor.prototype.gravityWalkerSample = function gravityWalkerSample(state, options = {}) {
  const level = Number(options.level) ?? 1;
  const leapAmount = this.clampValue(Number(options.leap) ?? 0.15, 0, 1);
  const leapCv = this.clampValue(Math.abs(Number(options.leapCv) || 0), 0, 1);
  const leapProb = this.clampValue(leapAmount + leapCv * 0.85, 0, 1);
  const gravity = this.clampValue(Number(options.gravity) ?? 0.65, 0, 1);
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const mask = options.hasScaleInput
    ? this.musicalNormalizeMask(options.scaleInput)
    : this.musicalPresetMask(options.scaleChoice);
  const root = Number(options.root) || (60 / 120);
  const classes = this.musicalClassesFromRoot(mask, root);
  const span = Math.max(1, classes.length * (octaves + 1));

  if (this.musicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    state.degree = 0;
    state.inertia = 1;
  }
  let trig = 0;
  if (this.musicalRisingEdge(state, "clockWasHigh", options.clock, 0) && classes.length) {
    trig = 1;
    if (Math.random() < leapProb) {
      const jump = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(span / 2)));
      state.inertia = Math.random() < 0.5 ? -1 : 1;
      state.degree = (state.degree + state.inertia * jump + span * 8) % span;
    } else {
      let step = state.inertia;
      if (Math.random() > gravity) step = Math.random() < 0.5 ? -step : 0;
      if (step === 0) step = Math.random() < 0.5 ? -1 : 1;
      state.inertia = step >= 0 ? 1 : -1;
      state.degree = (state.degree + step + span * 8) % span;
    }
  }
  const midi = classes.length ? this.musicalDegreeToMidi(root, classes, state.degree) : state.lastMidi;
  state.lastMidi = midi;
  return {
    "0.1V/Oct": this.musicalPitchFromMidi(midi),
    Gate: (classes.length ? 1 : 0) * level,
    Trigger: trig * level,
    Degree: span > 1 ? state.degree / (span - 1) : 0,
  };
};

// ── Degree Phrase ───────────────────────────────────────────────────────────

NodeLiveAudioProcessor.prototype.createDegreePhraseState = function createDegreePhraseState() {
  return { clockWasHigh: false, resetWasHigh: false, index: 0, lastMidi: 60, liveDegrees: null, liveRests: null };
};

NodeLiveAudioProcessor.prototype.degreePhraseSample = function degreePhraseSample(state, options = {}) {
  const level = Number(options.level) ?? 1;
  const steps = Math.max(1, Math.min(8, Math.round(Number(options.steps) || 8)));
  const mutate = this.clampValue(Number(options.mutate) ?? 0.08, 0, 1);
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const mask = options.hasScaleInput
    ? this.musicalNormalizeMask(options.scaleInput)
    : this.musicalPresetMask(options.scaleChoice);
  const root = Number(options.root) || (60 / 120);
  const classes = this.musicalClassesFromRoot(mask, root);
  const span = Math.max(1, classes.length * (octaves + 1));
  const degrees = [];
  const rests = [];
  for (let i = 0; i < 8; i += 1) {
    const v = Number(options[`step${i + 1}`]);
    const raw = Number.isFinite(v) ? v : (i / 7);
    rests.push(Number(options[`rest${i + 1}`]) > 0.5);
    degrees.push(Math.max(0, Math.min(span - 1, Math.round(raw * (span - 1)))));
  }
  if (this.musicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    state.index = 0;
    state.liveDegrees = degrees.slice();
    state.liveRests = rests.slice();
  }
  if (!state.liveDegrees || state.liveDegrees.length !== 8) {
    state.liveDegrees = degrees.slice();
    state.liveRests = rests.slice();
  }
  for (let i = 0; i < 8; i += 1) {
    if (Math.random() < 0.02) {
      state.liveDegrees[i] = degrees[i];
      state.liveRests[i] = rests[i];
    }
  }
  let trig = 0;
  let gate = 0;
  if (this.musicalRisingEdge(state, "clockWasHigh", options.clock, 0)) {
    if (Math.random() < mutate) {
      const j = Math.floor(Math.random() * steps);
      if (Math.random() < 0.35) state.liveRests[j] = !state.liveRests[j];
      else state.liveDegrees[j] = Math.floor(Math.random() * span);
    }
    const i = state.index % steps;
    state.index = (state.index + 1) % steps;
    if (!state.liveRests[i] && classes.length) {
      trig = 1;
      gate = 1;
      state.lastMidi = this.musicalDegreeToMidi(root, classes, state.liveDegrees[i]);
    }
  } else {
    const prev = (state.index - 1 + steps) % steps;
    gate = (!state.liveRests[prev] && classes.length) ? 1 : 0;
  }
  return {
    "0.1V/Oct": this.musicalPitchFromMidi(state.lastMidi),
    Gate: gate * level,
    Trigger: trig * level,
    Phase: (state.index % steps) / Math.max(1, steps),
  };
};

// ── Note Glide / Transpose ──────────────────────────────────────────────────

NodeLiveAudioProcessor.prototype.createNoteGlideState = function createNoteGlideState() {
  return { current: null };
};

NodeLiveAudioProcessor.prototype.noteGlideSample = function noteGlideSample(state, options = {}, sampleRate = 44100) {
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
  const coeff = 1 - Math.exp(-1 / (time * rate));
  state.current += (target - state.current) * coeff;
  return { "0.1V/Oct": state.current };
};

NodeLiveAudioProcessor.prototype.noteTransposeSample = function noteTransposeSample(options = {}) {
  const pitch = Number(options.pitch) || 0;
  const semitones = Number(options.semitones) || 0;
  const octaves = Number(options.octaves) || 0;
  const midi = this.musicalMidiFromPitch(pitch) + semitones + octaves * 12;
  return { "0.1V/Oct": this.musicalPitchFromMidi(midi) };
};

// ── Spruced Chord Memory (JS; prefer over native so Walk/Leap work) ──────────

NodeLiveAudioProcessor.prototype.chordMemoryJsSample = function chordMemoryJsSample(state, options = {}) {
  const latchHigh = Number(options.latch) > 0;
  const clearHigh = Number(options.clear) > 0;
  const advanceHigh = Number(options.advance) > 0;
  const pitch = Number(options.pitch) || 0;
  const walk = Math.max(0, Math.min(2, Math.round(Number(options.walk) || 0)));
  const leap = this.clampValue(Number(options.leap) || 0, 0, 1);
  const octaves = Math.max(0, Math.min(3, Math.round(Number(options.octaves) || 0)));
  const mutate = this.clampValue(nodeGraphFiniteNumber(options.mutate, 0.2), 0, 1);
  if (!state.bag) state.bag = [];

  if (clearHigh && !state.clearWasHigh) {
    state.slots = [0, 0, 0, 0];
    state.slotsActive = [false, false, false, false];
    state.writeIndex = 0;
    state.arpIndex = 0;
    state.bag = [];
  }
  state.clearWasHigh = clearHigh;

  if (latchHigh && !state.latchWasHigh) {
    state.slots[state.writeIndex] = pitch;
    state.slotsActive[state.writeIndex] = true;
    state.writeIndex = (state.writeIndex + 1) % 4;
    state.bag = [];
  }
  state.latchWasHigh = latchHigh;

  const activeIndices = [];
  for (let i = 0; i < 4; i += 1) {
    if (state.slotsActive[i]) activeIndices.push(i);
  }
  let trigger = 0;
  let octaveShift = 0;

  if (advanceHigh && !state.advanceWasHigh && activeIndices.length > 0) {
    trigger = 1;
    const doLeap = Math.random() < leap;
    if (walk === 1) {
      if (!state.bag.length) {
        state.bag = activeIndices.slice();
        for (let i = state.bag.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = state.bag[i]; state.bag[i] = state.bag[j]; state.bag[j] = t;
        }
      }
      state.bag = state.bag.filter((idx) => state.slotsActive[idx]);
      if (!state.bag.length) {
        state.bag = activeIndices.slice();
      }
      if (doLeap && state.bag.length > 1) {
        const ri = Math.floor(Math.random() * state.bag.length);
        state.arpIndex = state.bag[ri];
        state.bag.splice(ri, 1);
      } else {
        state.arpIndex = state.bag.shift();
      }
    } else if (walk === 2) {
      const currentPos = activeIndices.indexOf(state.arpIndex);
      let nextPos = currentPos === -1 ? 0 : (currentPos + 1) % activeIndices.length;
      if (doLeap || Math.random() < mutate) nextPos = Math.floor(Math.random() * activeIndices.length);
      state.arpIndex = activeIndices[nextPos];
    } else if (doLeap) {
      state.arpIndex = activeIndices[Math.floor(Math.random() * activeIndices.length)];
    } else {
      const currentPos = activeIndices.indexOf(state.arpIndex);
      const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % activeIndices.length;
      state.arpIndex = activeIndices[nextPos];
    }
    if (doLeap && octaves > 0 && Math.random() < 0.55) {
      octaveShift = (1 + Math.floor(Math.random() * octaves)) * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  state.advanceWasHigh = advanceHigh;

  let arp = activeIndices.length > 0 ? state.slots[state.arpIndex] : 0;
  if (octaveShift !== 0) arp = (Number(arp) || 0) + octaveShift * (12 / 120);
  return {
    "Note 1": state.slots[0],
    "Note 2": state.slots[1],
    "Note 3": state.slots[2],
    "Note 4": state.slots[3],
    Arp: arp,
    Gate: activeIndices.length > 0 ? 1 : 0,
    Trigger: trigger,
  };
};

// Override sample to always use JS path (spruced).
NodeLiveAudioProcessor.prototype.chordMemorySample = function chordMemorySample(state, options = {}) {
  return this.chordMemoryJsSample(state, options);
};

// ── Spruced Turing (JS with Scale→Pitch) ────────────────────────────────────

NodeLiveAudioProcessor.prototype.turingMachineJsSample = function turingMachineJsSample(state, options = {}) {
  const clockHigh = Number(options.clock) > 0;
  const resetHigh = Number(options.reset) > 0;
  const length = Math.max(1, Math.min(16, Math.round(Number(options.length) || 8)));
  const probability = this.clampValue(Number(options.probability) || 0, 0, 1);
  const level = Number(options.level) || 0;
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const hasScale = Boolean(options.hasScaleInput);
  const mask = hasScale ? this.musicalNormalizeMask(options.scaleInput) : 0;
  const rootPitch = Number.isFinite(Number(options.root)) ? Number(options.root) : (60 / 120);
  if (state.lastPitchMidi == null) state.lastPitchMidi = 60;

  if (resetHigh && !state.resetWasHigh) {
    state.register = 0xA5 & ((1 << length) - 1);
  }
  state.resetWasHigh = resetHigh;
  let trigger = 0;
  if (clockHigh && !state.clockWasHigh) {
    const regMask = (1 << length) - 1;
    const topBit = (state.register >> (length - 1)) & 1;
    const newBit = Math.random() < probability ? 1 - topBit : topBit;
    state.register = ((state.register << 1) | newBit) & regMask;
    trigger = 1;
  }
  state.clockWasHigh = clockHigh;

  const regMask = (1 << length) - 1;
  const maxValue = regMask > 0 ? regMask : 1;
  const cv = (state.register / maxValue) * 2 - 1;
  let pitchOut = state.lastPitchMidi / 120;
  if (hasScale) {
    const classes = this.musicalClassesFromRoot(mask, rootPitch);
    if (classes.length) {
      const span = Math.max(1, classes.length * (octaves + 1));
      const midi = this.musicalDegreeToMidi(rootPitch, classes, state.register % span);
      state.lastPitchMidi = midi;
      pitchOut = midi / 120;
    }
  } else {
    pitchOut = (60 + (state.register % 24) - 12) / 120;
    state.lastPitchMidi = pitchOut * 120;
  }
  return {
    CV: cv * level,
    Scale: state.register & 0xFFF,
    Gate: (state.register & 1) * level,
    Pitch: pitchOut,
    Trigger: trigger * level,
  };
};

NodeLiveAudioProcessor.prototype.turingMachineSample = function turingMachineSample(state, options = {}) {
  // Always JS so Scale→Pitch / Trigger work without native rebuild.
  return this.turingMachineJsSample(state, options);
};

// ── Spruced Chord Sequencer (JS) ────────────────────────────────────────────

const NODE_GRAPH_WORKLET_CHORD_PROGS = [
  [[0, 0], [7, 0], [9, 1], [5, 0]],
  [[0, 0], [5, 0], [7, 0], [0, 0]],
  [[2, 1], [7, 0], [0, 0], [0, 0]],
  [[9, 1], [5, 0], [0, 0], [7, 0]],
  [[0, 0], [9, 1], [5, 0], [7, 0]],
  [[0, 0], [9, 1], [2, 1], [7, 0]],
  [[0, 0], [5, 0], [7, 2], [0, 0]],
  [[2, 3], [7, 2], [0, 0], [9, 1]],
  [[0, 0], [3, 0], [5, 0], [7, 0]],
  [[0, 0], [7, 0], [2, 1], [9, 1]],
  [[5, 0], [7, 0], [9, 1], [2, 1]],
  [[0, 0], [0, 0], [5, 0], [7, 2]],
];

NodeLiveAudioProcessor.prototype.chordSequencerJsSample = function chordSequencerJsSample(state, options = {}) {
  const clockHigh = Number(options.clock) > 0;
  const resetHigh = Number(options.reset) > 0;
  const progressionIndex = Math.max(0, Math.min(NODE_GRAPH_WORKLET_CHORD_PROGS.length - 1, Math.round(Number(options.progression) || 0)));
  const level = Number(options.level) || 0;
  const directionMode = Math.max(0, Math.min(2, Math.round(Number(options.direction) || 0)));
  const key = Math.max(0, Math.min(11, Math.round(Number(options.key) || 0)));
  const prog = NODE_GRAPH_WORKLET_CHORD_PROGS[progressionIndex];
  const len = prog.length;
  if (state.direction == null) state.direction = 1;

  if (resetHigh && !state.resetWasHigh) {
    state.stepIndex = 0;
    state.direction = 1;
  }
  state.resetWasHigh = resetHigh;
  if (clockHigh && !state.clockWasHigh) {
    if (directionMode === 1) {
      state.stepIndex = (state.stepIndex - 1 + len) % len;
    } else if (directionMode === 2) {
      const next = state.stepIndex + state.direction;
      if (next >= len || next < 0) state.direction *= -1;
      state.stepIndex = Math.max(0, Math.min(len - 1, state.stepIndex + state.direction));
    } else {
      state.stepIndex = (state.stepIndex + 1) % len;
    }
  }
  state.clockWasHigh = clockHigh;
  const safeIndex = ((state.stepIndex % len) + len) % len;
  const [rootPc, quality] = prog[safeIndex];
  const root = (rootPc + key) % 12;
  let baseMask = 0x91;
  if (quality === 1) baseMask = 0x89;
  else if (quality === 2) baseMask = 0x491;
  else if (quality === 3) baseMask = 0x489;
  const n = root % 12;
  const scale = n === 0 ? (baseMask & 0xFFF) : (((baseMask << n) | (baseMask >> (12 - n))) & 0xFFF);
  return {
    Scale: scale,
    Root: (60 + root) / 120,
    Gate: (clockHigh ? 1 : 0) * level,
    Step: len > 1 ? safeIndex / (len - 1) : 0,
  };
};

NodeLiveAudioProcessor.prototype.chordSequencerSample = function chordSequencerSample(state, options = {}) {
  return this.chordSequencerJsSample(state, options);
};
