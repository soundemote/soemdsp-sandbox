// soemdsp-native-module: gravity_walker
// soemdsp-native-label: Gravity Walker
// soemdsp-native-target: gravityWalker
// soemdsp-native-kind: pitch
//
// Sticky/random walk over Keys noteMask128 (Arp Keys cousin).
// Wire: 3 self-describing chunks (2^49 / 2^50 flags), same as Arp.
// Pool: held MIDI -> expand by Octaves -> Scale Offset rotate -> walk.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kKeyCount = 128;
static const int kMaxPool = 256;
static const double kFlag1 = 562949953421312.0;  // 2^49
static const double kFlag2 = 1125899906842624.0; // 2^50

struct State {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  double heldC0;
  double heldC1;
  double heldC2;
  bool hostMask;
  int pool[kMaxPool];
  int poolCount;
  int degree;
  int inertia;
  int clocksSinceRestart;
  unsigned int rngState;
  double lastMidi;
  double lastGate;
  double lastTrigger;
  double lastDegreeNorm;
};

static State gPool[kMaxInstances];

static unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x ? x : 1u;
  return state;
}

static double next_unit(unsigned int& state) {
  return (double)xorshift32(state) / 4294967295.0;
}

static unsigned int seed_u32(double seed) {
  double s = safe(seed);
  if (!(s * 0.0 == 0.0)) s = 1.0;
  if (s < 0.0) s = 0.0;
  if (s > 2147483647.0) s = 2147483647.0;
  unsigned int u = (unsigned int)(s + 0.5);
  return u ? u : 1u;
}

static int clamp_int(double v, int lo, int hi) {
  int n = (int)(safe(v) + (safe(v) >= 0.0 ? 0.5 : -0.5));
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}

static int clamp_midi(int m) {
  if (m < 0) return 0;
  if (m > 127) return 127;
  return m;
}

// Exact integer bit test for masks that may exceed 32 bits (double / 2^i).
static int bit_set(double mask, int bit) {
  if (bit < 0 || bit > 52) return 0;
  double m = safe(mask);
  if (!(m * 0.0 == 0.0) || m <= 0.0) return 0;
  double denom = 1.0;
  for (int i = 0; i < bit; i++) denom *= 2.0;
  double q = dsp_floor(m / denom);
  return ((int)(q - dsp_floor(q * 0.5) * 2.0)) & 1;
}

static void demux_held_keys(State& s, double v) {
  const double x = safe(v);
  if (!(x * 0.0 == 0.0)) return;
  if (x >= kFlag2) {
    s.heldC2 = x - kFlag2;
  } else if (x >= kFlag1) {
    s.heldC1 = x - kFlag1;
  } else {
    s.heldC0 = x;
  }
}

static void collect_held(const State& s, int* notes, int* countOut) {
  int n = 0;
  for (int midi = 0; midi < kKeyCount; midi++) {
    int local = midi;
    double chunk = s.heldC0;
    if (midi >= 98) {
      local = midi - 98;
      chunk = s.heldC2;
    } else if (midi >= 49) {
      local = midi - 49;
      chunk = s.heldC1;
    }
    if (bit_set(chunk, local)) {
      notes[n++] = midi;
    }
  }
  *countOut = n;
}

static void sort_unique_inplace(int* arr, int* countInOut) {
  int n = *countInOut;
  for (int i = 1; i < n; i++) {
    int key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
  int w = 0;
  for (int i = 0; i < n; i++) {
    if (w == 0 || arr[i] != arr[w - 1]) {
      arr[w++] = arr[i];
    }
  }
  *countInOut = w;
}

// Expand held notes across +0..+octaves octaves, unique sorted.
static void expand_octaves(const int* held, int heldCount, int octaves, int* out, int* outCount) {
  int n = 0;
  const int oct = octaves < 0 ? 0 : (octaves > 4 ? 4 : octaves);
  for (int i = 0; i < heldCount; i++) {
    for (int o = 0; o <= oct; o++) {
      int m = held[i] + o * 12;
      if (m < 0 || m > 127) continue;
      if (n < kMaxPool) out[n++] = m;
    }
  }
  sort_unique_inplace(out, &n);
  *outCount = n;
}

// Scale Offset voicing rotate (do NOT re-sort — order is the voicing).
// +1: remove lowest, append (lowest+12) clamped  [C1 D1 E1 -> D1 E1 C2]
// -1: remove highest, prepend (highest-12) clamped
static void apply_scale_offset(int* notes, int count, int offset) {
  if (count <= 0 || offset == 0) return;
  int times = offset > 0 ? offset : -offset;
  if (times > 64) times = 64;
  for (int t = 0; t < times; t++) {
    if (offset > 0) {
      int lowest = notes[0];
      for (int i = 0; i < count - 1; i++) notes[i] = notes[i + 1];
      notes[count - 1] = clamp_midi(lowest + 12);
    } else {
      int highest = notes[count - 1];
      for (int i = count - 1; i > 0; i--) notes[i] = notes[i - 1];
      notes[0] = clamp_midi(highest - 12);
    }
  }
}

static void rebuild_pool(State& s, int octaves, int scaleOffset) {
  int held[kKeyCount];
  int heldCount = 0;
  collect_held(s, held, &heldCount);
  expand_octaves(held, heldCount, octaves, s.pool, &s.poolCount);
  apply_scale_offset(s.pool, s.poolCount, scaleOffset);
  if (s.poolCount <= 0) {
    s.degree = 0;
    return;
  }
  if (s.degree < 0) s.degree = 0;
  if (s.degree >= s.poolCount) s.degree = s.poolCount - 1;
}

static void restart_walk(State& s, unsigned int seed) {
  s.degree = 0;
  s.inertia = 1;
  s.rngState = seed;
  s.clocksSinceRestart = 0;
}

static void walk_step(State& s, double gravity, double leapProb) {
  const int span = s.poolCount;
  if (span <= 0) return;
  if (span == 1) {
    s.degree = 0;
    return;
  }
  if (next_unit(s.rngState) < leapProb) {
    const int half = span / 2;
    const int jumpMax = half > 1 ? half : 1;
    const int jump = 1 + (int)(next_unit(s.rngState) * (double)jumpMax);
    s.inertia = next_unit(s.rngState) < 0.5 ? -1 : 1;
    s.degree = (s.degree + s.inertia * jump + span * 8) % span;
  } else {
    int step = s.inertia;
    if (next_unit(s.rngState) > gravity) {
      step = next_unit(s.rngState) < 0.5 ? -step : 0;
    }
    if (step == 0) {
      step = next_unit(s.rngState) < 0.5 ? -1 : 1;
    }
    s.inertia = step >= 0 ? 1 : -1;
    s.degree = (s.degree + step + span * 8) % span;
  }
}

}  // namespace

extern "C" int soemdsp_gravity_walker_create(unsigned int entropySeed) {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.heldC0 = 0.0;
      s.heldC1 = 0.0;
      s.heldC2 = 0.0;
      s.hostMask = false;
      s.poolCount = 0;
      s.degree = 0;
      s.inertia = 1;
      s.clocksSinceRestart = 0;
      s.rngState = entropySeed ? entropySeed : 1u;
      s.lastMidi = 60.0;
      s.lastGate = 0.0;
      s.lastTrigger = 0.0;
      s.lastDegreeNorm = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_gravity_walker_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

/** Host->native note buses are block-rate. Push all 3 chunks atomically. */
extern "C" void soemdsp_gravity_walker_set_chunks(int handle, double c0, double c1, double c2) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  s.heldC0 = safe(c0);
  s.heldC1 = safe(c1);
  s.heldC2 = safe(c2);
  s.hostMask = true;
}

extern "C" double soemdsp_gravity_walker_sample(
  int handle,
  double clock,
  double reset,
  double gravityIn,
  double leapIn,
  double octavesIn,
  double stepsIn,
  double seedIn,
  double scaleOffsetIn,
  double keysIn,
  double hasKeys
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const double leapAmount = clamp(safe(leapIn), 0.0, 1.0);
  const double gravity = clamp(safe(gravityIn), 0.0, 1.0);
  const int oct = clamp_int(octavesIn, 0, 4);
  const int steps = clamp_int(stepsIn, 0, 128);
  const unsigned int seed = seed_u32(seedIn);
  const int scaleOffset = clamp_int(scaleOffsetIn, -24, 24);

  if (safe(hasKeys) > 0.5 && !s.hostMask) {
    demux_held_keys(s, keysIn);
  }
  rebuild_pool(s, oct, scaleOffset);

  const bool resetHigh = safe(reset) > 0.0;
  if (resetHigh && !s.resetWasHigh) {
    restart_walk(s, seed);
  }
  s.resetWasHigh = resetHigh;

  double trig = 0.0;
  const bool clockHigh = safe(clock) > 0.0;
  if (clockHigh && !s.clockWasHigh && s.poolCount > 0) {
    // Arp-like: Steps wrap / Seed restart before sounding this clock.
    if (steps > 0 && s.clocksSinceRestart >= steps) {
      restart_walk(s, seed);
    }
    trig = 1.0;
    s.clocksSinceRestart += 1;
    // Capture current degree for this clock, then advance for next.
    // (walk_step runs after we latch outputs below via degree read)
    // Defer walk until after latch:
  }
  const bool didClock = clockHigh && !s.clockWasHigh && s.poolCount > 0 && trig > 0.0;
  s.clockWasHigh = clockHigh;

  if (s.poolCount > 0) {
    int idx = s.degree;
    if (idx < 0) idx = 0;
    if (idx >= s.poolCount) idx = s.poolCount - 1;
    s.lastMidi = (double)s.pool[idx];
    s.lastGate = 1.0;
    s.lastDegreeNorm = s.poolCount > 1
      ? (double)idx / (double)(s.poolCount - 1)
      : 0.0;
  } else {
    s.lastGate = 0.0;
    s.lastDegreeNorm = 0.0;
  }
  s.lastTrigger = trig;

  if (didClock) {
    walk_step(s, gravity, leapAmount);
  }
  return musical_pitch_from_midi(s.lastMidi);
}

extern "C" double soemdsp_gravity_walker_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" double soemdsp_gravity_walker_trigger(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastTrigger;
}

extern "C" double soemdsp_gravity_walker_degree(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastDegreeNorm;
}

extern "C" int soemdsp_gravity_walker_version() {
  return 2; // Keys noteMask128 + Octaves expand + Scale Offset + Steps/Seed
}