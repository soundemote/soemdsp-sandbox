// Chord Pad — pick a diatonic chord; emit Scale (12-bit pitch-class mask) + Root
// (0.1V/Oct) for Pitch Quantizer and bass/voice routing.
//
// Scale convention matches Chord Sequencer / Turing Machine / Pitch Quantizer:
// bit i = pitch class i (0=C … 11=B).

const nodeGraphChordPadMajorTriadMask = 0x91; // bits 0, 4, 7
const nodeGraphChordPadMinorTriadMask = 0x89; // bits 0, 3, 7
const nodeGraphChordPadDimTriadMask = 0x49;   // bits 0, 3, 6

// Degree → [semitone offset from key, quality] for major / natural minor.
const nodeGraphChordPadMajorDegrees = Object.freeze([
  [0, "maj"],  // I
  [2, "min"],  // ii
  [4, "min"],  // iii
  [5, "maj"],  // IV
  [7, "maj"],  // V
  [9, "min"],  // vi
  [11, "dim"], // vii°
]);

const nodeGraphChordPadMinorDegrees = Object.freeze([
  [0, "min"],  // i
  [2, "dim"],  // ii°
  [3, "maj"],  // bIII
  [5, "min"],  // iv
  [7, "min"],  // v
  [8, "maj"],  // bVI
  [10, "maj"], // bVII
]);

const nodeGraphChordPadRomanMajor = Object.freeze(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
const nodeGraphChordPadRomanMinor = Object.freeze(["i", "ii°", "bIII", "iv", "v", "bVI", "bVII"]);

const nodeGraphChordPadNoteNames = Object.freeze([
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]);

function nodeGraphChordPadRotateLeft12(mask, amount) {
  const n = ((amount % 12) + 12) % 12;
  if (n === 0) {
    return mask & 0xFFF;
  }
  return ((mask << n) | (mask >> (12 - n))) & 0xFFF;
}

function nodeGraphChordPadClampKey(key) {
  const n = Math.round(Number(key) || 0);
  return ((n % 12) + 12) % 12;
}

function nodeGraphChordPadClampMode(mode) {
  return Math.round(Number(mode) || 0) === 1 ? 1 : 0;
}

function nodeGraphChordPadClampDegree(degree) {
  const n = Math.round(Number(degree) || 0);
  return Math.max(0, Math.min(6, n));
}

function nodeGraphChordPadDegreeTable(mode) {
  return nodeGraphChordPadClampMode(mode) === 1
    ? nodeGraphChordPadMinorDegrees
    : nodeGraphChordPadMajorDegrees;
}

function nodeGraphChordPadTriadMask(quality) {
  if (quality === "min") {
    return nodeGraphChordPadMinorTriadMask;
  }
  if (quality === "dim") {
    return nodeGraphChordPadDimTriadMask;
  }
  return nodeGraphChordPadMajorTriadMask;
}

/** Degree from Select CV: 0..1 spans 7 pads (or raw 0..6 if already stepped). */
function nodeGraphChordPadDegreeFromSelect(selectValue) {
  const v = Number(selectValue);
  if (!Number.isFinite(v)) {
    return 0;
  }
  if (v >= 0 && v <= 6.5 && Number.isInteger(v)) {
    return nodeGraphChordPadClampDegree(v);
  }
  // Unipolar 0..1 (and a little overshoot) → 0..6
  const u = Math.max(0, Math.min(1, v));
  return nodeGraphChordPadClampDegree(Math.floor(u * 6.999));
}

function nodeGraphChordPadResolve(options = {}) {
  const key = nodeGraphChordPadClampKey(options.key);
  const mode = nodeGraphChordPadClampMode(options.mode);
  let degree = nodeGraphChordPadClampDegree(options.degree);
  if (options.hasSelectInput) {
    degree = nodeGraphChordPadDegreeFromSelect(options.select);
  }
  const table = nodeGraphChordPadDegreeTable(mode);
  const [offset, quality] = table[degree] || table[0];
  const rootPc = (key + offset) % 12;
  const scale = nodeGraphChordPadRotateLeft12(nodeGraphChordPadTriadMask(quality), rootPc);
  const level = Number(options.level);
  const gateLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1;
  return {
    degree,
    key,
    mode,
    quality,
    rootPc,
    Scale: scale,
    // Same 0.1V/Oct convention as Chord Sequencer: MIDI 60 + pitch class.
    Root: (60 + rootPc) / 120,
    Gate: gateLevel,
  };
}

function nodeGraphChordPadSample(_state, options = {}) {
  return nodeGraphChordPadResolve(options);
}

function nodeGraphChordPadPadLabel(key, mode, degree) {
  const resolved = nodeGraphChordPadResolve({ key, mode, degree, level: 1 });
  const roman = (mode === 1 ? nodeGraphChordPadRomanMinor : nodeGraphChordPadRomanMajor)[resolved.degree]
    || String(resolved.degree);
  const note = nodeGraphChordPadNoteNames[resolved.rootPc] || "?";
  let suffix = "";
  if (resolved.quality === "min") {
    suffix = "m";
  } else if (resolved.quality === "dim") {
    suffix = "°";
  }
  return {
    roman,
    name: `${note}${suffix}`,
    rootPc: resolved.rootPc,
    scale: resolved.Scale,
  };
}

/** Deterministic Scale mask for a chordPad patch node (face / quantizer paint). */
function nodeGraphChordPadScaleForNode(node) {
  if (!node || node.type !== "chordPad") {
    return 0;
  }
  const p = node.params || {};
  return nodeGraphChordPadResolve({
    key: p.key,
    mode: p.mode,
    degree: p.degree,
    level: 1,
    hasSelectInput: false,
  }).Scale;
}
