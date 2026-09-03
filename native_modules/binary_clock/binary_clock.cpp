// soemdsp-native-module: binary_clock
// soemdsp-native-label: Binary Clock
// soemdsp-native-target: binaryClock
// soemdsp-native-kind: utility
//
// Free-run binary counter at `rate` Hz when Clock is unconnected.
// Rising Clock advances when connected (no free-run). Rising Reset → 0.
// Gate: half-period high in free-run; 1-sample pulse on external clock advance.
// Out = count / 2^bits (unipolar). Bit_i = exact 0/1 digital.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const double kEdgeThresh = 0.0;

struct BinaryClockState {
  bool active;
  bool hasStarted;
  int count;
  double phase;
  double lastClock;
  double lastReset;
  double lastOut;
  double lastBit0;
  double lastBit1;
  double lastBit2;
  double lastBit3;
  double lastGate;
};

static BinaryClockState gPool[kMaxInstances];

static int clamp_bits(double bits) {
  int n = (int)(safe(bits) + (safe(bits) >= 0.0 ? 0.5 : -0.5));
  if (n < 1) n = 1;
  if (n > 4) n = 4;
  return n;
}

static void write_outputs(BinaryClockState& s, int bits) {
  const int mask = (1 << bits) - 1;
  const int c = s.count & mask;
  s.lastOut = (double)c / (double)(1 << bits);
  s.lastBit0 = (c & 1) ? 1.0 : 0.0;
  s.lastBit1 = (bits > 1 && (c & 2)) ? 1.0 : 0.0;
  s.lastBit2 = (bits > 2 && (c & 4)) ? 1.0 : 0.0;
  s.lastBit3 = (bits > 3 && (c & 8)) ? 1.0 : 0.0;
}

static void advance(BinaryClockState& s, int bits) {
  const int mask = (1 << bits) - 1;
  s.count = (s.count + 1) & mask;
}

}  // namespace

extern "C" int soemdsp_binary_clock_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      BinaryClockState& s = gPool[i];
      s.hasStarted = false;
      s.count = 0;
      s.phase = 0.0;
      s.lastClock = 0.0;
      s.lastReset = 0.0;
      s.lastOut = 0.0;
      s.lastBit0 = 0.0;
      s.lastBit1 = 0.0;
      s.lastBit2 = 0.0;
      s.lastBit3 = 0.0;
      s.lastGate = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_binary_clock_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_binary_clock_sample(
  int handle,
  double clock,
  double hasClock,
  double reset,
  double rate,
  double bits,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  BinaryClockState& s = gPool[handle - 1];
  if (!s.active) return 0.0;

  const int nBits = clamp_bits(bits);
  const double safeClock = safe(clock);
  const double safeReset = safe(reset);
  const double safeRate = maxd(0.0, safe(rate));
  const double sr = maxd(1.0, safe(sampleRate));
  const bool clockConnected = hasClock > 0.5;

  bool advanced = false;
  if (s.lastReset <= kEdgeThresh && safeReset > kEdgeThresh) {
    s.count = 0;
    s.phase = 0.0;
    s.hasStarted = false;
    s.lastGate = 0.0;
  } else if (clockConnected) {
    if (s.lastClock <= kEdgeThresh && safeClock > kEdgeThresh) {
      advance(s, nBits);
      advanced = true;
    }
    s.lastGate = advanced ? 1.0 : 0.0;
    s.hasStarted = true;
  } else {
    const double rawPhase = wrap01(s.phase);
    const double nextPhase = wrap01(rawPhase + safeRate / sr);
    const bool wrapped = safeRate > 0.0 && s.hasStarted && nextPhase < rawPhase;
    if (wrapped) {
      advance(s, nBits);
      advanced = true;
    }
    s.phase = nextPhase;
    s.hasStarted = true;
    // Half-period gate in free-run (duty 0.5).
    s.lastGate = (safeRate > 0.0 && rawPhase < 0.5) ? 1.0 : 0.0;
    (void)advanced;
  }

  s.lastClock = safeClock;
  s.lastReset = safeReset;
  write_outputs(s, nBits);
  return s.lastOut;
}

extern "C" double soemdsp_binary_clock_bit0(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastBit0;
}

extern "C" double soemdsp_binary_clock_bit1(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastBit1;
}

extern "C" double soemdsp_binary_clock_bit2(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastBit2;
}

extern "C" double soemdsp_binary_clock_bit3(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastBit3;
}

extern "C" double soemdsp_binary_clock_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" int soemdsp_binary_clock_version() {
  return 1;
}
