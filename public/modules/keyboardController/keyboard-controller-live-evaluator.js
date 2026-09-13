// Keyboard (local piano + INs) vs MIDI portal (hardware only) live evaluators.
globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

function nodeGraphHeldKeysOrTransmit(values, phase) {
  if (typeof noteMaskOrTransmit === "function") {
    return noteMaskOrTransmit(values, phase);
  }
  return 0;
}

/** Collect raw source values for a port (no sum). */
function nodeGraphKeyboardCollectInputValues(nodeId, port, ctx = {}) {
  const { runtime, frameValues, frame, frames, mixInput, hasInput } = ctx;
  if (typeof hasInput === "function" && !hasInput(nodeId, port)) {
    return [];
  }
  const key = `${nodeId}.${port}`;
  const conns = runtime?.inputConnections?.get?.(key);
  if (Array.isArray(conns) && conns.length && typeof readNodeGraphRuntimePortOutput === "function") {
    return conns.map((connection) => nodeGraphFiniteNumber(readNodeGraphRuntimePortOutput(
      runtime,
      frameValues,
      connection.sourceNode,
      connection.sourcePort,
      frame,
      frames,
    )));
  }
  // Sidecar / fallback: one summed value.
  if (typeof mixInput === "function") {
    return [nodeGraphFiniteNumber(mixInput(nodeId, port))];
  }
  return [];
}

function nodeGraphKeyboardMixMax(nodeId, port, ctx) {
  const values = nodeGraphKeyboardCollectInputValues(nodeId, port, ctx);
  if (!values.length) return 0;
  return Math.max(0, ...values.map((v) => Math.max(0, nodeGraphFiniteNumber(v))));
}

function nodeGraphKeyboardMixOrBits(nodeId, port, ctx, phase) {
  const values = nodeGraphKeyboardCollectInputValues(nodeId, port, ctx);
  if (!values.length) return 0;
  return nodeGraphHeldKeysOrTransmit(values, phase);
}

function nodeGraphKeyboardSignalFromMvp(preferLocal) {
  if (preferLocal) {
    return nodeGraphMvp?.keyboardModuleSignal
      || (typeof nodeGraphMidiKeyboardFallbackSignal === "function"
        ? nodeGraphMidiKeyboardFallbackSignal()
        : null);
  }
  return nodeGraphMvp?.midiKeyboardSignal
    || (typeof nodeGraphMidiKeyboardFallbackSignal === "function"
      ? nodeGraphMidiKeyboardFallbackSignal()
      : null);
}

function nodeGraphKeyboardBuildCvFromSignal(signal, sampleRate, previous = null) {
  const prev = previous && typeof previous === "object" ? previous : null;
  const sourceMidi = Number(signal?.midi);
  const prevMidi = Number(prev?.midi);
  const midi = Math.max(0, Math.min(127, Math.round(
    Number.isFinite(sourceMidi)
      ? sourceMidi
      : (Number.isFinite(prevMidi) ? prevMidi : 60),
  )));
  const key = Math.max(0, Math.min(24, Math.round(
    Number.isFinite(Number(signal?.keyIndex))
      ? Number(signal.keyIndex)
      : (nodeGraphFiniteNumber(prev?.key)),
  )));
  const q = Math.max(0, Math.min(1,
    Number.isFinite(Number(signal?.keyQuantized))
      ? Number(signal.keyQuantized)
      : (Number.isFinite(Number(prev?.q)) ? Number(prev.q) : key / 24),
  ));
  const velocity01 = Math.max(0, Math.min(1,
    Number.isFinite(Number(signal?.velocity))
      ? Number(signal.velocity)
      : (nodeGraphFiniteNumber(prev?.velocity01)),
  ));
  // Gate is digital presence: any gate > 0 → 1 (not velocity). Velocity stays on Velo outs.
  const gateOn = Number(signal?.gate) > 0;
  const gateAmp = gateOn ? 1 : 0;
  // Trigger pulse: same digital rule — any pulse > 0 → 1.
  const triggerAmp = Number(signal?.gatePulse) > 0 ? 1 : 0;
  const sourceFreq = Number(signal?.frequency);
  const prevFreq = Number(prev?.frequency);
  const frequency = Math.max(0,
    Number.isFinite(sourceFreq) && sourceFreq > 0
      ? sourceFreq
      : (Number.isFinite(prevFreq) && prevFreq > 0
        ? prevFreq
        : (440 * (2 ** ((midi - 69) / 12)))),
  );
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, nodeGraphFiniteNumber(nodeGraphMvp?.sampleRate, 44100)));
  const increment = Math.max(0, frequency / rate);
  const x = Math.max(0, Math.min(1,
    Number.isFinite(Number(signal?.x)) ? Number(signal.x) : (nodeGraphFiniteNumber(prev?.x, q)),
  ));
  const y = Math.max(0, Math.min(1,
    Number.isFinite(Number(signal?.y)) ? Number(signal.y) : (nodeGraphFiniteNumber(prev?.y)),
  ));
  return {
    midi,
    key,
    q,
    velocity01,
    gateAmp,
    triggerAmp,
    frequency,
    increment,
    x,
    y,
  };
}

/** Gold Arp Keys latch (ctrl+click mask) — Keyboard only. */
function nodeGraphKeyboardLocalArpTransmit(phase) {
  const mask = nodeGraphMvp?.midiKeyboardArpMask;
  if (typeof noteMaskTransmit === "function" && mask instanceof Uint8Array) {
    return noteMaskTransmit(mask, phase);
  }
  if (typeof nodeGraphMidiKeyboardHeldKeysTransmitValue === "function") {
    return nodeGraphMidiKeyboardHeldKeysTransmitValue(
      nodeGraphMvp?.midiKeyboardHeldKeysLowBitmask,
      nodeGraphMvp?.midiKeyboardHeldKeysHighBitmask,
      phase,
    );
  }
  return 0;
}

/**
 * Blue Play Keys from live hardware MIDI note map (midi − 24 → key index).
 * Prefers worklet-synced bitmask when present.
 */
function nodeGraphMidiPlayKeysTransmit(phase) {
  const play = nodeGraphMvp?.midiKeyboardPlayMask;
  if (typeof noteMaskTransmit === "function" && play instanceof Uint8Array) {
    return noteMaskTransmit(play, phase);
  }
  const notes = nodeGraphMvp?.midiKeyboardHeldNotes;
  if (notes instanceof Map && typeof noteMaskCreate === "function") {
    const mask = noteMaskCreate();
    for (const midi of notes.keys()) {
      noteMaskSet(mask, Math.round(Number(midi)), true);
    }
    return noteMaskTransmit(mask, phase);
  }
  return 0;
}

/** Keyboard module: local piano + OR/max INs. Does not read hardware MIDI. */
nodeGraphLiveModuleEvaluators.keyboard = ({
  runtime, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const phase = frame % 3;
  const ctx = { runtime, frameValues, frame, frames, mixInput, hasInput };
  const signal = nodeGraphKeyboardSignalFromMvp(true);
  if (!runtime.keyboardCvHold) runtime.keyboardCvHold = new Map();
  const cv = nodeGraphKeyboardBuildCvFromSignal(
    signal,
    sampleRate,
    runtime.keyboardCvHold.get(nodeId),
  );
  runtime.keyboardCvHold.set(nodeId, cv);

  const gateIn = nodeGraphKeyboardMixMax(nodeId, "Gate", ctx);
  const triggerIn = nodeGraphKeyboardMixMax(nodeId, "Trigger", ctx);
  const gateOut = Math.max(cv.gateAmp, gateIn);
  const triggerOut = Math.max(cv.triggerAmp, triggerIn);

  const arpLocal = nodeGraphKeyboardLocalArpTransmit(phase);
  const arpIn = nodeGraphKeyboardMixOrBits(nodeId, "Arp Keys", ctx, phase);
  const arpOut = nodeGraphHeldKeysOrTransmit([arpLocal, arpIn], phase);

  const playIn = nodeGraphKeyboardMixOrBits(nodeId, "Play Keys", ctx, phase);
  // Local press mask: single key while gated.
  let playLocal = 0;
  if (cv.gateAmp > 0 && typeof noteMaskCreate === "function") {
    const one = noteMaskCreate();
    const raw = Number.isFinite(Number(signal?.rawMidi))
      ? Math.round(Number(signal.rawMidi))
      : cv.midi;
    noteMaskSet(one, Math.max(0, Math.min(127, raw)), true);
    playLocal = noteMaskTransmit(one, phase);
  }
  const playOut = nodeGraphHeldKeysOrTransmit([playLocal, playIn], phase);
  const polyTable = nodeGraphMvp?.keyboardPolyphonyVelocities;
  const polyOut = typeof polyphonyTableWireSample === "function"
    ? polyphonyTableWireSample(polyTable)
    : 0;

  // Stash for face paint (main thread).
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.keyboardFaceArpTransmit = arpOut;
    nodeGraphMvp.keyboardFacePlayTransmit = playOut;
  }

  return {
    "Play Keys": playOut,
    "Arp Keys": arpOut,
    Polyphony: polyOut,
    Gate: gateOut,
    Trigger: triggerOut,
    KeyboardKey: cv.key,
    KeyboardNorm: cv.q,
    "Note#/127": Math.max(0, Math.min(1, cv.midi / 127)),
    "Velo#/127": cv.velocity01,
    "Velocity#/127": cv.velocity01,
    "0.1V/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    "0.1v/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    f: cv.frequency,
    Frequency: cv.frequency,
    X: cv.x,
    Y: cv.y,
  };
};

/** MIDI portal: hardware Play Keys + last-note CV. */
nodeGraphLiveModuleEvaluators.keyboardController = ({
  runtime, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  void runtime;
  void nodeId;
  void frames;
  void frameValues;
  void mixInput;
  void hasInput;
  const signal = nodeGraphKeyboardSignalFromMvp(false);
  if (!runtime.keyboardCvHold) runtime.keyboardCvHold = new Map();
  const cv = nodeGraphKeyboardBuildCvFromSignal(
    signal,
    sampleRate,
    runtime.keyboardCvHold.get(nodeId),
  );
  runtime.keyboardCvHold.set(nodeId, cv);
  const phase = frame % 3;
  const playOut = nodeGraphMidiPlayKeysTransmit(phase);
  const polyTable = nodeGraphMvp?.midiPolyphonyVelocities;
  const polyOut = typeof polyphonyTableWireSample === "function"
    ? polyphonyTableWireSample(polyTable)
    : 0;
  return {
    "Play Keys": playOut,
    Polyphony: polyOut,
    Gate: cv.gateAmp,
    Trigger: cv.triggerAmp,
    "Note#/127": Math.max(0, Math.min(1, cv.midi / 127)),
    "Velocity#/127": cv.velocity01,
    "0.1V/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    "0.1v/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    Frequency: cv.frequency,
    f: cv.frequency,
    X: cv.x,
    Y: cv.y,
  };
};

/** Grid Keyboard: same Play/Arp/Polyphony engine; X/Y are discrete grid coords. */
nodeGraphLiveModuleEvaluators.gridKeyboard = ({
  runtime, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const phase = frame % 3;
  const ctx = { runtime, frameValues, frame, frames, mixInput, hasInput };
  const signal = nodeGraphKeyboardSignalFromMvp(true);
  if (!runtime.keyboardCvHold) runtime.keyboardCvHold = new Map();
  const cv = nodeGraphKeyboardBuildCvFromSignal(
    signal,
    sampleRate,
    runtime.keyboardCvHold.get(nodeId),
  );
  runtime.keyboardCvHold.set(nodeId, cv);

  const arpLocal = nodeGraphKeyboardLocalArpTransmit(phase);
  const arpIn = nodeGraphKeyboardMixOrBits(nodeId, "Arp Keys", ctx, phase);
  const arpOut = nodeGraphHeldKeysOrTransmit([arpLocal, arpIn], phase);

  const playIn = nodeGraphKeyboardMixOrBits(nodeId, "Play Keys", ctx, phase);
  let playLocal = 0;
  if (cv.gateAmp > 0 && typeof noteMaskCreate === "function") {
    const one = noteMaskCreate();
    const raw = Number.isFinite(Number(signal?.rawMidi))
      ? Math.round(Number(signal.rawMidi))
      : cv.midi;
    noteMaskSet(one, Math.max(0, Math.min(127, raw)), true);
    playLocal = noteMaskTransmit(one, phase);
  }
  const playOut = nodeGraphHeldKeysOrTransmit([playLocal, playIn], phase);
  const polyTable = nodeGraphMvp?.keyboardPolyphonyVelocities;
  const polyOut = typeof polyphonyTableWireSample === "function"
    ? polyphonyTableWireSample(polyTable)
    : 0;

  return {
    "Play Keys": playOut,
    "Arp Keys": arpOut,
    Polyphony: polyOut,
    Gate: cv.gateAmp,
    Trigger: cv.triggerAmp,
    f: cv.frequency,
    Frequency: cv.frequency,
    X: cv.x,
    Y: cv.y,
  };
};
