// Number Gate — decode keypad-compatible A/D into exclusive 0…12 gates.
// Same idle map as Keypad: analog 0 / digital 0 = number 0. Unconnected
// inlets select nothing. A and D can light two different outs at once.

const NODE_GRAPH_NUMBER_GATE_COUNT = 13;

const NODE_GRAPH_NUMBER_GATE_PORTS = Object.freeze(
  Array.from({ length: NODE_GRAPH_NUMBER_GATE_COUNT }, (_, index) => String(index)),
);

function nodeGraphNumberGateEmpty() {
  const out = {};
  for (let index = 0; index < NODE_GRAPH_NUMBER_GATE_COUNT; index += 1) {
    out[String(index)] = 0;
  }
  return out;
}

function nodeGraphNumberGateFromAnalog(analog) {
  if (typeof nodeGraphKeypadAnalogSlot === "function" && typeof nodeGraphKeypadSlotToDigital === "function") {
    return nodeGraphKeypadSlotToDigital(nodeGraphKeypadAnalogSlot(analog));
  }
  const unit = Math.max(0, Math.min(1, Number(analog) || 0));
  if (!(unit > 0)) {
    return 0;
  }
  return Math.min(12, Math.floor(unit * 12 - 1e-9) + 1);
}

function nodeGraphNumberGateFromDigital(digital) {
  if (typeof nodeGraphKeypadDigitalToSlot === "function" && typeof nodeGraphKeypadSlotToDigital === "function") {
    return nodeGraphKeypadSlotToDigital(nodeGraphKeypadDigitalToSlot(digital));
  }
  const value = Math.round(Number(digital) || 0);
  if (value <= 0) {
    return 0;
  }
  return ((value - 1) % 12 + 12) % 12 + 1;
}

function nodeGraphNumberGateSample(options = {}) {
  const out = nodeGraphNumberGateEmpty();
  if (options.hasAnalog) {
    out[String(nodeGraphNumberGateFromAnalog(options.analog))] = 1;
  }
  if (options.hasDigital) {
    out[String(nodeGraphNumberGateFromDigital(options.digital))] = 1;
  }
  return out;
}
