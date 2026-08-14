// nGate family (12Gate / 8Gate / …) — decode A/D into exclusive analog 0…1 gates.
// lastIndex is the highest outlet number (12Gate → 0…12). Same idle map as
// Keypad: analog 0 / digital 0 = number 0. Unconnected inlets select nothing.
// A and D can light two different outs at once.

const NODE_GRAPH_NGATE_LAST_BY_TYPE = Object.freeze({
  gate12: 12,
  gate8: 8,
  gate6: 6,
  gate4: 4,
  gate3: 3,
  gate2: 2,
  numberGate: 12,
});

function nodeGraphNGateLastIndexForType(type) {
  const last = NODE_GRAPH_NGATE_LAST_BY_TYPE[String(type || "")];
  return Number.isFinite(last) ? last : 12;
}

function nodeGraphNGateCount(lastIndex) {
  return Math.max(2, Math.round(Number(lastIndex) || 12) + 1);
}

function nodeGraphNumberGateEmpty(lastIndex = 12) {
  const count = nodeGraphNGateCount(lastIndex);
  const out = {};
  for (let index = 0; index < count; index += 1) {
    out[String(index)] = 0;
  }
  return out;
}

function nodeGraphNumberGateFromAnalog(analog, lastIndex = 12) {
  const last = Math.max(1, Math.round(Number(lastIndex) || 12));
  if (last === 12
    && typeof nodeGraphKeypadAnalogSlot === "function"
    && typeof nodeGraphKeypadSlotToDigital === "function") {
    return nodeGraphKeypadSlotToDigital(nodeGraphKeypadAnalogSlot(analog));
  }
  const unit = Math.max(0, Math.min(1, Number(analog) || 0));
  if (!(unit > 0)) {
    return 0;
  }
  return Math.min(last, Math.floor(unit * last - 1e-9) + 1);
}

function nodeGraphNumberGateFromDigital(digital, lastIndex = 12) {
  const last = Math.max(1, Math.round(Number(lastIndex) || 12));
  if (last === 12
    && typeof nodeGraphKeypadDigitalToSlot === "function"
    && typeof nodeGraphKeypadSlotToDigital === "function") {
    return nodeGraphKeypadSlotToDigital(nodeGraphKeypadDigitalToSlot(digital));
  }
  const value = Math.round(Number(digital) || 0);
  if (value <= 0) {
    return 0;
  }
  return ((value - 1) % last + last) % last + 1;
}

function nodeGraphNumberGateSample(options = {}) {
  const lastIndex = Number.isFinite(Number(options.lastIndex))
    ? Math.max(1, Math.round(Number(options.lastIndex)))
    : nodeGraphNGateLastIndexForType(options.type);
  const out = nodeGraphNumberGateEmpty(lastIndex);
  if (options.hasAnalog) {
    out[String(nodeGraphNumberGateFromAnalog(options.analog, lastIndex))] = 1;
  }
  if (options.hasDigital) {
    out[String(nodeGraphNumberGateFromDigital(options.digital, lastIndex))] = 1;
  }
  return out;
}
