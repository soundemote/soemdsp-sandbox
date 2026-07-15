// soemdsp-native-module: lut_cell
// soemdsp-native-label: LUT Cell
// soemdsp-native-target: lutCell
// soemdsp-native-kind: logic

// Modeled directly on an FPGA logic slice: a 4-input lookup table (the
// combinational half) feeding a single D flip-flop (the registered half).
// Every real FPGA fabric is built from repeating this exact pair. Here the
// LUT's 16-row truth table is just a 16-bit digital signal parameter --
// bit i of truthTable is the cell's output for input combination i, where
// input combination is (D<<3 | C<<2 | B<<1 | A).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct LutCellState {
  bool active;
  bool clockWasHigh;
  int registeredOut;  // the flip-flop's held bit, 0 or 1
};

static LutCellState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_lut_cell_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LutCellState& s = gPool[i];
      s.active = true;
      s.clockWasHigh = false;
      s.registeredOut = 0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_lut_cell_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Evaluates the combinational LUT output for the current A/B/C/D inputs and
// advances the flip-flop on a clock rising edge. Returns the combinational
// output (0 or 1) -- the same value the flip-flop will hold once it latches.
extern "C" int soemdsp_lut_cell_sample(
  int handle,
  double a,
  double b,
  double c,
  double d,
  double clock,
  double truthTable
) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  LutCellState& s = gPool[handle - 1];

  const int index =
    (a > 0.0 ? 1 : 0) |
    (b > 0.0 ? 2 : 0) |
    (c > 0.0 ? 4 : 0) |
    (d > 0.0 ? 8 : 0);
  const int table = clamp_int((int)truthTable, 0, 0xFFFF);
  const int combinational = (table >> index) & 1;

  const bool clockHigh = clock > 0.0;
  if (clockHigh && !s.clockWasHigh) {
    s.registeredOut = combinational;
  }
  s.clockWasHigh = clockHigh;

  return combinational;
}

// The flip-flop's held output -- only changes on a clock rising edge, unlike
// the combinational sample() result which follows A/B/C/D immediately.
extern "C" int soemdsp_lut_cell_q(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].registeredOut;
}

extern "C" int soemdsp_lut_cell_version() {
  return 1;
}
