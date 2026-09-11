// Keyboard (local piano + INs) vs MIDI portal (hardware only) live evaluators.
globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

const NODE_GRAPH_HELD_KEYS_PHASE = 2 ** 49;
const NODE_GRAPH_HELD_KEYS_LOW_BITS = 49;

function nodeGraphHeldKeysDemux(value) {
  const v = nodeGraphFiniteNumber(value);
  if (v >= NODE_GRAPH_HELD_KEYS_PHASE) {
    return { low: 0, high: v - NODE_GRAPH_HELD_KEYS_PHASE };
  }
  return { low: v, high: 0 };
}

function nodeGraphHeldKeysBitmaskOr(a, b) {
  let out = 0;
  const left = nodeGraphFiniteNumber(a);
  const right = nodeGraphFiniteNumber(b);
  for (let i = 0; i < NODE_GRAPH_HELD_KEYS_LOW_BITS; i += 1) {
    const bit = 2 ** i;
    if ((Math.floor(left / bit) % 2) || (Math.floor(right / bit) % 2)) {
      out += bit;
    }
  }
  return out;
}

function nodeGraphHeldKeysOrTransmit(values, phase) {
  let low = 0;
  let high = 0;
  for (const value of values || []) {
    const parts = nodeGraphHeldKeysDemux(value);
    low = nodeGraphHeldKeysBitmaskOr(low, parts.low);
    high = nodeGraphHeldKeysBitmaskOr(high, parts.high);
  }
  if (typeof nodeGraphMidiKeyboardHeldKeysTransmitValue === "function") {
    return nodeGraphMidiKeyboardHeldKeysTransmitValue(low, high, phase);
  }
  return high ? (phase ? NODE_GRAPH_HELD_KEYS_PHASE + high : low) : low;
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
  const gateOn = Number(signal?.gate) > 0;
  const gateAmp = gateOn ? velocity01 : 0;
  const triggerAmp = Number(signal?.gatePulse) > 0 ? velocity01 : 0;
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
  const low = nodeGraphFiniteNumber(nodeGraphMvp?.midiKeyboardHeldKeysLowBitmask);
  const high = nodeGraphFiniteNumber(nodeGraphMvp?.midiKeyboardHeldKeysHighBitmask);
  if (typeof nodeGraphMidiKeyboardHeldKeysTransmitValue === "function") {
    return nodeGraphMidiKeyboardHeldKeysTransmitValue(low, high, phase);
  }
  return high ? (phase ? NODE_GRAPH_HELD_KEYS_PHASE + high : low) : low;
}

/**
 * Blue Play Keys from live hardware MIDI note map (midi − 24 → key index).
 * Prefers worklet-synced bitmask when present.
 */
function nodeGraphMidiPlayKeysTransmit(phase) {
  const syncLow = nodeGraphFiniteNumber(nodeGraphMvp?.midiKeyboardPlayKeysLowBitmask);
  const syncHigh = nodeGraphFiniteNumber(nodeGraphMvp?.midiKeyboardPlayKeysHighBitmask);
  if ((syncLow > 0 || syncHigh > 0)
    && typeof nodeGraphMidiKeyboardHeldKeysTransmitValue === "function") {
    return nodeGraphMidiKeyboardHeldKeysTransmitValue(syncLow, syncHigh, phase);
  }
  const notes = nodeGraphMvp?.midiKeyboardHeldNotes;
  let low = 0;
  let high = 0;
  const base = typeof nodeGraphMidiKeyboardStartMidi === "number"
    ? nodeGraphMidiKeyboardStartMidi
    : 24;
  if (notes instanceof Map && typeof nodeGraphMidiKeyboardHeldKeysWithBit === "function") {
    for (const midi of notes.keys()) {
      const index = Math.round(Number(midi)) - base;
      if (index < 0 || index > 87) {
        continue;
      }
      const bits = nodeGraphMidiKeyboardHeldKeysWithBit(low, high, index, true);
      low = bits.low;
      high = bits.high;
    }
  }
  if (typeof nodeGraphMidiKeyboardHeldKeysTransmitValue === "function") {
    return nodeGraphMidiKeyboardHeldKeysTransmitValue(low, high, phase);
  }
  return high ? (phase ? NODE_GRAPH_HELD_KEYS_PHASE + high : low) : low;
}

/** Keyboard module: local piano + OR/max INs. Does not read hardware MIDI. */
nodeGraphLiveModuleEvaluators.keyboard = ({
  runtime, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const phase = frame % 2;
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
  if (cv.gateAmp > 0 && typeof nodeGraphMidiKeyboardHeldKeysWithBit === "function") {
    const bits = nodeGraphMidiKeyboardHeldKeysWithBit(0, 0, cv.key, true);
    playLocal = typeof nodeGraphMidiKeyboardHeldKeysTransmitValue === "function"
      ? nodeGraphMidiKeyboardHeldKeysTransmitValue(bits.low, bits.high, phase)
      : bits.low;
  }
  const playOut = nodeGraphHeldKeysOrTransmit([playLocal, playIn], phase);

  // Stash for face paint (main thread).
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.keyboardFaceArpTransmit = arpOut;
    nodeGraphMvp.keyboardFacePlayTransmit = playOut;
  }

  return {
    "Play Keys": playOut,
    "Arp Keys": arpOut,
    Gate: gateOut,
    Trigger: triggerOut,
    KeyboardKey: cv.key,
    KeyboardNorm: cv.q,
    "Note#/127": Math.max(0, Math.min(1, cv.midi / 127)),
    "Velo#/127": cv.velocity01,
    "Velocity#/127": cv.velocity01,
    "0.1V/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    "0.1v/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    "Inc.": cv.increment,
    Increment: cv.increment,
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
  const phase = frame % 2;
  const playOut = nodeGraphMidiPlayKeysTransmit(phase);
  return {
    "Play Keys": playOut,
    Gate: cv.gateAmp,
    Trigger: cv.triggerAmp,
    "Note#/127": Math.max(0, Math.min(1, cv.midi / 127)),
    "Velocity#/127": cv.velocity01,
    "0.1V/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    "0.1v/Oct": Math.max(0, Math.min(1, cv.midi / 120)),
    "Inc.": cv.increment,
    Increment: cv.increment,
    Frequency: cv.frequency,
    f: cv.frequency,
    X: cv.x,
    Y: cv.y,
  };
};
