// A 4-input lookup table plus a clocked D flip-flop -- the exact LUT+FF pair
// every real FPGA logic slice is built from. The 16-row truth table is a
// digital signal parameter: bit i of truthTable is the cell's output for
// input combination i, where i = (D<<3 | C<<2 | B<<1 | A). Mirrors
// native_modules/lut_cell exactly (the self-clock below is a JS-layer
// convenience, not part of the native module -- a real FPGA cell never
// drives its own inputs).

const NODE_GRAPH_LUT_CELL_SELF_CLOCK_HZ = 220;

function createNodeGraphLutCellState() {
  return { clockWasHigh: false, registeredOut: 0, selfClockPhase: 0, selfClockValue: 0 };
}

// Unwired inputs default to 0, which is a constant -- silent and flat, no
// matter the truth table. So an unwired Clock free-runs at a fixed audible
// rate instead, and an unwired A tracks that same effective clock, giving a
// freshly dropped cell something to actually show/hear immediately. Wiring
// either one for real overrides this entirely.
function nodeGraphLutCellAdvanceSelfClock(state, sampleRate) {
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const increment = (2 * NODE_GRAPH_LUT_CELL_SELF_CLOCK_HZ) / rate;
  state.selfClockPhase = (state.selfClockPhase || 0) + increment;
  if (state.selfClockPhase >= 1) {
    state.selfClockPhase -= Math.floor(state.selfClockPhase);
    state.selfClockValue = state.selfClockValue ? 0 : 1;
  }
  return state.selfClockValue || 0;
}

function nodeGraphLutCellSample(state, options = {}) {
  const hasClockInput = Boolean(options.hasClockInput);
  const hasAInput = Boolean(options.hasAInput);

  const effectiveClockHigh = hasClockInput
    ? Number(options.clock) > 0
    : nodeGraphLutCellAdvanceSelfClock(state, options.sampleRate) > 0;
  const effectiveA = hasAInput ? (Number(options.a) > 0 ? 1 : 0) : (effectiveClockHigh ? 1 : 0);

  const b = Number(options.b) > 0 ? 1 : 0;
  const c = Number(options.c) > 0 ? 1 : 0;
  const d = Number(options.d) > 0 ? 1 : 0;
  const table = Math.max(0, Math.min(0xFFFF, Math.round(nodeGraphFiniteNumber(options.truthTable))));

  const index = effectiveA | (b << 1) | (c << 2) | (d << 3);
  const combinational = (table >> index) & 1;

  if (effectiveClockHigh && !state.clockWasHigh) {
    state.registeredOut = combinational;
  }
  state.clockWasHigh = effectiveClockHigh;

  return {
    Out: combinational,
    Q: state.registeredOut,
  };
}
