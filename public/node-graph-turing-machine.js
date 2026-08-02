function createNodeGraphTuringMachineState() {
  return {
    clockWasHigh: false,
    resetWasHigh: false,
    register: 0xA5,
    lastPitchMidi: 60,
  };
}

// Classic mutating shift-register. Optionally maps the register into a
// Scale+Root degree → Pitch (0.1V/Oct) so Turing is a melodic engine, not
// only bipolar noise + accidental scale mask bits.
function nodeGraphTuringMachineSample(state, options = {}) {
  const clockHigh = Number(options.clock) > 0;
  const resetHigh = Number(options.reset) > 0;
  const length = Math.max(1, Math.min(16, Math.round(Number(options.length) || 8)));
  const probability = Math.max(0, Math.min(1, Number(options.probability) || 0));
  const level = Number(options.level) || 0;
  const octaves = Math.max(0, Math.min(4, Math.round(Number(options.octaves) || 1)));
  const hasScale = Boolean(options.hasScaleInput);
  const mask = hasScale
    ? (Math.round(Number(options.scaleInput) || 0) & 0xFFF)
    : 0;
  const root = Number(options.root);
  const rootPitch = Number.isFinite(root) ? root : (60 / 120);

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
  const scaleMask = state.register & 0xFFF;
  const gate = (state.register & 1) * level;

  // Melodic Pitch when Scale is patched (or scaleMask param forced).
  let pitchOut = state.lastPitchMidi / 120;
  if (hasScale && typeof nodeGraphMusicalClassesFromRoot === "function") {
    const classes = nodeGraphMusicalClassesFromRoot(mask, rootPitch);
    if (classes.length) {
      const span = Math.max(1, classes.length * (octaves + 1));
      const degree = state.register % span;
      const midi = nodeGraphMusicalDegreeToMidi(rootPitch, classes, degree);
      state.lastPitchMidi = midi;
      pitchOut = midi / 120;
    }
  } else {
    // No scale: map register to a wide bipolar-ish pitch around middle C for fun.
    pitchOut = (60 + (state.register % 24) - 12) / 120;
    state.lastPitchMidi = pitchOut * 120;
  }

  return {
    CV: cv * level,
    Scale: scaleMask,
    Gate: gate,
    Pitch: pitchOut,
    Trigger: trigger * level,
  };
}
