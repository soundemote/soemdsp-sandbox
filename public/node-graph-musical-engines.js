// Musical experiment shelf — pure-JS mono engines on the Scale + Root bus.
// (No polyphony. No classic up/down/rnd arp menu.)
//
// Shared helpers + modules:
//   degreeTuring   — mutating shift-register over scale degrees
//   gravityWalker  — nearest-tone walk with Leap param / residual memory
//   degreePhrase   — 8-step degree phrase + rest + mutate corrosion
//   noteGlide      — portamento on 0.1V/Oct
//   noteTranspose  — semitone / octave offset on 0.1V/Oct

// ─── shared pitch-class helpers ─────────────────────────────────────────────

function nodeGraphMusicalNormalizeMask(raw) {
  if (typeof noteMaskResolveScaleBits === "function") {
    return noteMaskResolveScaleBits(raw);
  }
  if (raw instanceof Uint8Array && typeof noteMaskPitchClassBits === "function") {
    return noteMaskPitchClassBits(raw);
  }
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

/** MIDI note from ♯/♭ pitch cable (0–127). */
function nodeGraphMusicalMidiFromPitch(pitch) {
  return nodeGraphFiniteNumber(pitch);
}

function nodeGraphMusicalPitchFromMidi(midi) {
  return nodeGraphFiniteNumber(midi);
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
  const d = Math.floor(nodeGraphFiniteNumber(degreeIndex));
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
  const length = Math.max(2, Math.min(16, Math.round(nodeGraphFiniteNumber(options.length, 8))));
  const probability = Math.max(0, Math.min(1, Number(options.probability) ?? 0.18));
  const octaves = Math.max(0, Math.min(4, Math.round(nodeGraphFiniteNumber(options.octaves, 1))));
  const level = Number(options.level) ?? 1;
  const mask = nodeGraphMusicalNormalizeMask(
    options.hasScaleInput ? options.scaleInput : (options.scaleMask ?? 2741),
  );
  const root = nodeGraphFiniteNumber(options.root, (60 / 120));
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
// Sticky/random walk over Keys noteMask128 (Arp Keys cousin).
// Pool: held MIDI → expand Octaves → Scale Offset rotate → walk.

function createNodeGraphGravityWalkerState() {
  return {
    clockWasHigh: false,
    resetWasHigh: false,
    degree: 0,
    inertia: 1,
    clocksSinceRestart: 0,
    rngState: 1,
    lastMidi: 60,
  };
}

function nodeGraphGravityWalkerSeedU32(seed) {
  let s = Number(seed);
  if (!Number.isFinite(s)) s = 1;
  if (s < 0) s = 0;
  if (s > 2147483647) s = 2147483647;
  const u = Math.round(s) >>> 0;
  return u || 1;
}

function nodeGraphGravityWalkerNextUnit(state) {
  let x = state.rngState >>> 0;
  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  state.rngState = x || 1;
  return state.rngState / 4294967295;
}

function nodeGraphGravityWalkerRestart(state, seed) {
  state.degree = 0;
  state.inertia = 1;
  state.rngState = nodeGraphGravityWalkerSeedU32(seed);
  state.clocksSinceRestart = 0;
}

function nodeGraphGravityWalkerBuildPool(options = {}) {
  const held = [];
  const rawMask = options.keysMask;
  if (rawMask instanceof Uint8Array) {
    for (let m = 0; m < 128; m += 1) {
      if (rawMask[m]) held.push(m);
    }
  } else if (Array.isArray(options.keysMidi)) {
    for (const n of options.keysMidi) {
      const m = Math.round(Number(n));
      if (m >= 0 && m <= 127) held.push(m);
    }
  } else if (options.hasKeysInput && typeof noteMaskFromRegisters === "function") {
    // Legacy demux path if a numeric chunk sample is provided.
    const regs = { c0: 0, c1: 0, c2: 0 };
    if (typeof noteMaskDemuxRegisters === "function") {
      noteMaskDemuxRegisters(regs, options.keysInput);
    }
    const mask = noteMaskFromRegisters(regs);
    for (let m = 0; m < 128; m += 1) {
      if (mask[m]) held.push(m);
    }
  }

  const octaves = Math.max(0, Math.min(4, Math.round(nodeGraphFiniteNumber(options.octaves, 0))));
  const seen = new Set();
  const expanded = [];
  for (const midi of held) {
    for (let o = 0; o <= octaves; o += 1) {
      const m = midi + o * 12;
      if (m < 0 || m > 127 || seen.has(m)) continue;
      seen.add(m);
      expanded.push(m);
    }
  }
  expanded.sort((a, b) => a - b);

  let offset = Math.round(nodeGraphFiniteNumber(options.scaleOffset, 0));
  if (offset > 24) offset = 24;
  if (offset < -24) offset = -24;
  const pool = expanded.slice();
  const times = Math.min(64, Math.abs(offset));
  for (let t = 0; t < times; t += 1) {
    if (!pool.length) break;
    if (offset > 0) {
      const lowest = pool.shift();
      pool.push(Math.max(0, Math.min(127, lowest + 12)));
    } else {
      const highest = pool.pop();
      pool.unshift(Math.max(0, Math.min(127, highest - 12)));
    }
  }
  return pool;
}

function nodeGraphGravityWalkerWalk(state, pool, gravity, leapProb) {
  const span = pool.length;
  if (span <= 0) return;
  if (span === 1) {
    state.degree = 0;
    return;
  }
  if (nodeGraphGravityWalkerNextUnit(state) < leapProb) {
    const half = Math.floor(span / 2);
    const jumpMax = half > 1 ? half : 1;
    const jump = 1 + Math.floor(nodeGraphGravityWalkerNextUnit(state) * jumpMax);
    state.inertia = nodeGraphGravityWalkerNextUnit(state) < 0.5 ? -1 : 1;
    state.degree = (state.degree + state.inertia * jump + span * 8) % span;
  } else {
    let step = state.inertia;
    if (nodeGraphGravityWalkerNextUnit(state) > gravity) {
      step = nodeGraphGravityWalkerNextUnit(state) < 0.5 ? -step : 0;
    }
    if (step === 0) {
      step = nodeGraphGravityWalkerNextUnit(state) < 0.5 ? -1 : 1;
    }
    state.inertia = step >= 0 ? 1 : -1;
    state.degree = (state.degree + step + span * 8) % span;
  }
}

function nodeGraphGravityWalkerSample(state, options = {}) {
  const leapAmount = Math.max(0, Math.min(1, Number(options.leap) ?? 0.15));
  const gravity = Math.max(0, Math.min(1, Number(options.gravity) ?? 0.65));
  const steps = Math.max(0, Math.min(128, Math.round(nodeGraphFiniteNumber(options.steps, 0))));
  const seed = nodeGraphGravityWalkerSeedU32(options.seed ?? 1);
  const pool = nodeGraphGravityWalkerBuildPool(options);

  if (nodeGraphMusicalRisingEdge(state, "resetWasHigh", options.reset, 0)) {
    nodeGraphGravityWalkerRestart(state, seed);
  }

  let trig = 0;
  if (nodeGraphMusicalRisingEdge(state, "clockWasHigh", options.clock, 0) && pool.length) {
    if (steps > 0 && state.clocksSinceRestart >= steps) {
      nodeGraphGravityWalkerRestart(state, seed);
    }
    trig = 1;
    state.clocksSinceRestart += 1;
    // Latch current degree, then advance for next clock (Arp-like).
    // walk happens after midi latch below
    state._pendingWalk = { gravity, leapAmount };
  }

  let patternOffset = Math.round(Number(options.patternOffset) || 0);
  if (!Number.isFinite(patternOffset)) patternOffset = 0;
  if (patternOffset < 0) patternOffset = 0;
  if (patternOffset > 127) patternOffset = 127;

  let midi = state.lastMidi;
  let playIdx = state.degree | 0;
  if (pool.length) {
    playIdx = ((state.degree | 0) + patternOffset) % pool.length;
    if (playIdx < 0) playIdx += pool.length;
    midi = pool[playIdx];
    state.lastMidi = midi;
  }

  if (state._pendingWalk) {
    nodeGraphGravityWalkerWalk(state, pool, state._pendingWalk.gravity, state._pendingWalk.leapAmount);
    state._pendingWalk = null;
  }

  return {
    "0.1V/Oct": nodeGraphMusicalPitchFromMidi(midi),
    f: (typeof nodeGraphMidiToHz === "function"
      ? nodeGraphMidiToHz(midi)
      : (440 * (2 ** ((Number(midi) - 69) / 12)))),
    Gate: pool.length ? 1 : 0,
    Trigger: trig,
    Degree: pool.length > 1 ? (playIdx / (pool.length - 1)) : 0,
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
  const steps = Math.max(1, Math.min(8, Math.round(nodeGraphFiniteNumber(options.steps, 8))));
  const mutate = Math.max(0, Math.min(1, Number(options.mutate) ?? 0.08));
  const octaves = Math.max(0, Math.min(4, Math.round(nodeGraphFiniteNumber(options.octaves, 1))));
  const mask = nodeGraphMusicalNormalizeMask(
    options.hasScaleInput ? options.scaleInput : (options.scaleMask ?? 2741),
  );
  const root = nodeGraphFiniteNumber(options.root, (60 / 120));
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
  const target = nodeGraphFiniteNumber(options.pitch);
  const time = Math.max(0, nodeGraphFiniteNumber(options.time));
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
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
  const pitch = nodeGraphFiniteNumber(options.pitch);
  const semitones = nodeGraphFiniteNumber(options.semitones);
  const octaves = nodeGraphFiniteNumber(options.octaves);
  const midi = nodeGraphMusicalMidiFromPitch(pitch) + semitones + octaves * 12;
  return { "0.1V/Oct": nodeGraphMusicalPitchFromMidi(midi) };
}
