// Two triad shapes, relative to their root (bit 0 = root itself).
const nodeGraphChordSequencerMajorTriadMask = 0x91; // bits 0, 4, 7
const nodeGraphChordSequencerMinorTriadMask = 0x89; // bits 0, 3, 7
const nodeGraphChordSequencerDom7Mask = 0x491; // 0,4,7,10
const nodeGraphChordSequencerMin7Mask = 0x489; // 0,3,7,10

// Built-in progressions: [rootPc, quality] quality 0=maj 1=min 2=dom7 3=min7
const nodeGraphChordSequencerProgressions = Object.freeze([
  [[0, 0], [7, 0], [9, 1], [5, 0]], // I - V - vi - IV
  [[0, 0], [5, 0], [7, 0], [0, 0]], // I - IV - V - I
  [[2, 1], [7, 0], [0, 0], [0, 0]], // ii - V - I - I
  [[9, 1], [5, 0], [0, 0], [7, 0]], // vi - IV - I - V
  [[0, 0], [9, 1], [5, 0], [7, 0]], // I - vi - IV - V
  [[0, 0], [9, 1], [2, 1], [7, 0]], // I - vi - ii - V
  [[0, 0], [5, 0], [7, 2], [0, 0]], // I - IV - V7 - I
  [[2, 3], [7, 2], [0, 0], [9, 1]], // ii7 - V7 - I - vi
  [[0, 0], [3, 0], [5, 0], [7, 0]], // I - bIII - IV - V (borrow color)
  [[0, 0], [7, 0], [2, 1], [9, 1]], // I - V - ii - vi
  [[5, 0], [7, 0], [9, 1], [2, 1]], // IV - V - vi - ii
  [[0, 0], [0, 0], [5, 0], [7, 2]], // I - I - IV - V7 (half-time feel)
]);

function createNodeGraphChordSequencerState() {
  return {
    clockWasHigh: false,
    resetWasHigh: false,
    stepIndex: 0,
    direction: 1, // for ping-pong
  };
}

function nodeGraphChordSequencerRotateLeft12(mask, amount) {
  const n = ((amount % 12) + 12) % 12;
  if (n === 0) return mask & 0xFFF;
  return ((mask << n) | (mask >> (12 - n))) & 0xFFF;
}

function nodeGraphChordSequencerBaseMask(quality) {
  const q = Math.round(Number(quality) || 0);
  if (q === 1) return nodeGraphChordSequencerMinorTriadMask;
  if (q === 2) return nodeGraphChordSequencerDom7Mask;
  if (q === 3) return nodeGraphChordSequencerMin7Mask;
  return nodeGraphChordSequencerMajorTriadMask;
}

// Steps through a built-in diatonic chord progression on each Clock edge.
// Scale = 12-bit pitch-class mask; Root = 0.1V/Oct.
// direction: 0 forward, 1 reverse, 2 ping-pong
// key: transpose progression roots by pitch class
function nodeGraphChordSequencerSample(state, options = {}) {
  const clockHigh = Number(options.clock) > 0;
  const resetHigh = Number(options.reset) > 0;
  const progressions = nodeGraphChordSequencerProgressions;
  const progressionIndex = Math.max(0, Math.min(progressions.length - 1, Math.round(Number(options.progression) || 0)));
  const level = Number(options.level) || 0;
  const directionMode = Math.max(0, Math.min(2, Math.round(Number(options.direction) || 0)));
  const key = Math.max(0, Math.min(11, Math.round(Number(options.key) || 0)));
  const prog = progressions[progressionIndex];
  const len = prog.length;

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
      if (next >= len || next < 0) {
        state.direction *= -1;
      }
      state.stepIndex = Math.max(0, Math.min(len - 1, state.stepIndex + state.direction));
    } else {
      state.stepIndex = (state.stepIndex + 1) % len;
    }
  }
  state.clockWasHigh = clockHigh;

  const safeIndex = ((state.stepIndex % len) + len) % len;
  const [rootPc, quality] = prog[safeIndex];
  const root = (rootPc + key) % 12;
  const baseMask = nodeGraphChordSequencerBaseMask(quality);

  return {
    Scale: nodeGraphChordSequencerRotateLeft12(baseMask, root),
    Root: (60 + root) / 120,
    Gate: (clockHigh ? 1 : 0) * level,
    Step: len > 1 ? safeIndex / (len - 1) : 0,
  };
}
