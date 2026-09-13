// soemdsp-native-module: arp
// soemdsp-native-label: Arp
// soemdsp-native-target: arp
// soemdsp-native-kind: pitch
//
// Clocked arpeggiator over "Arp Keys" 128-MIDI mask (gold latch bus).
// Wire: 3 self-describing chunks (2^49 / 2^50 flags). Notes are MIDI 0..127.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kKeyCount = 128;
static const double kFlag1 = 562949953421312.0;  // 2^49
static const double kFlag2 = 1125899906842624.0; // 2^50

enum Mode {
  MODE_UP = 0,
  MODE_DOWN = 1,
  MODE_UP_DOWN = 2,
  MODE_DOWN_UP = 3,
  MODE_RANDOM = 4
};

struct State {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  double heldC0;
  double heldC1;
  double heldC2;
  int notes[kKeyCount];
  int noteCount;
  int index;
  int direction; // +1 up, -1 down (bounce modes)
  int clocksSinceRestart;
  unsigned int rngState;
  double phase; // free-run Internal Clock phasor 0..1
  double lastPitch;
  double lastFreqHz;
  double lastGate;
  double lastTrigger;
  double lastStep;
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

static int clamp_mode(double mode) {
  int m = (int)(safe(mode) + (safe(mode) >= 0.0 ? 0.5 : -0.5));
  if (m < 0) m = 0;
  if (m > 4) m = 4;
  return m;
}

static int clamp_steps(double steps) {
  int n = (int)(safe(steps) + (safe(steps) >= 0.0 ? 0.5 : -0.5));
  if (n < 0) n = 0;
  if (n > 128) n = 128;
  return n;
}

static unsigned int seed_u32(double seed) {
  double s = safe(seed);
  if (!(s * 0.0 == 0.0)) s = 1.0;
  if (s < 0.0) s = 0.0;
  if (s > 2147483647.0) s = 2147483647.0;
  unsigned int u = (unsigned int)(s + 0.5);
  return u ? u : 1u;
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

static void rebuild_notes(State& s) {
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
      s.notes[n++] = midi;
    }
  }
  s.noteCount = n;
  if (n <= 0) {
    s.index = 0;
    return;
  }
  if (s.index < 0) s.index = 0;
  if (s.index >= n) s.index = n - 1;
}

static void restart_pattern(State& s, int mode, unsigned int seed) {
  s.index = 0;
  s.direction = (mode == MODE_DOWN_UP) ? -1 : 1;
  s.rngState = seed;
  s.clocksSinceRestart = 0;
}

static void advance(State& s, int mode) {
  const int n = s.noteCount;
  if (n <= 0) return;
  if (n == 1) {
    s.index = 0;
    return;
  }
  if (mode == MODE_UP) {
    s.index = (s.index + 1) % n;
    return;
  }
  if (mode == MODE_DOWN) {
    s.index = (s.index - 1 + n) % n;
    return;
  }
  if (mode == MODE_UP_DOWN || mode == MODE_DOWN_UP) {
    int next = s.index + s.direction;
    if (next >= n) {
      s.direction = -1;
      next = n - 2;
      if (next < 0) next = 0;
    } else if (next < 0) {
      s.direction = 1;
      next = (n > 1) ? 1 : 0;
    }
    s.index = next;
    return;
  }
  // Random — avoid immediate repeat when possible.
  unsigned int r = xorshift32(s.rngState);
  int next = (int)(r % (unsigned int)n);
  if (next == s.index) next = (next + 1) % n;
  s.index = next;
}

}  // namespace

extern "C" int soemdsp_arp_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.heldC0 = 0.0;
      s.heldC1 = 0.0;
      s.heldC2 = 0.0;
      s.noteCount = 0;
      s.index = 0;
      s.direction = 1;
      s.clocksSinceRestart = 0;
      s.rngState = 1u;
      s.phase = 0.0;
      s.lastPitch = 0.0;
      s.lastFreqHz = 0.0;
      s.lastGate = 0.0;
      s.lastTrigger = 0.0;
      s.lastStep = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_arp_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

static int clamp_octave_offset(double octaves) {
  int o = (int)(safe(octaves) + (safe(octaves) >= 0.0 ? 0.5 : -0.5));
  if (o < -4) o = -4;
  if (o > 4) o = 4;
  return o;
}

static void capture_note(State& s, int playIndex, int steps, int octaveOffset) {
  int midi = s.notes[playIndex] + octaveOffset * 12;
  if (midi < 0) midi = 0;
  if (midi > 127) midi = 127;
  s.lastPitch = (double)midi / 120.0;
  // A4=440, MIDI 69.
  s.lastFreqHz = 440.0 * dsp_exp2(((double)midi - 69.0) / 12.0);
  s.lastStep = (steps > 0) ? (double)s.clocksSinceRestart : (double)playIndex;
}

static void do_step(State& s, int mode, int steps, unsigned int seed, int octaveOffset) {
  if (s.noteCount <= 0) return;
  if (steps > 0 && s.clocksSinceRestart >= steps) {
    restart_pattern(s, mode, seed);
  }
  const int playIndex = s.index;
  capture_note(s, playIndex, steps, octaveOffset);
  s.clocksSinceRestart += 1;
  advance(s, mode);
}

extern "C" double soemdsp_arp_sample(
  int handle,
  double heldKeys,
  double hasHeldKeys,
  double trigger,
  double hasTrigger,
  double reset,
  double rateHz,
  double modeIn,
  double stepsIn,
  double seedIn,
  double octaveOffsetIn,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const int mode = clamp_mode(modeIn);
  const int steps = clamp_steps(stepsIn);
  const unsigned int seed = seed_u32(seedIn);
  const int octaveOffset = clamp_octave_offset(octaveOffsetIn);
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double rate = safe(rateHz);
  const bool trigConnected = safe(hasTrigger) > 0.5;

  if (safe(hasHeldKeys) > 0.5) {
    demux_held_keys(s, heldKeys);
  }
  rebuild_notes(s);

  const bool resetHigh = safe(reset) > 0.0;
  if (resetHigh && !s.resetWasHigh) {
    restart_pattern(s, mode, seed);
    s.phase = 0.0;
  }
  s.resetWasHigh = resetHigh;

  double trigOut = 0.0;
  if (trigConnected) {
    const bool trigHigh = safe(trigger) > 0.0;
    if (s.noteCount > 0 && trigHigh && !s.clockWasHigh) {
      do_step(s, mode, steps, seed, octaveOffset);
      trigOut = 1.0;
    }
    s.clockWasHigh = trigHigh;
  } else if (rate > 0.0) {
    // Free-run phasor when Trigger is unconnected. rateHz is Internal Clock
    // unless the host passes the f jack (cable present → internal ignored).
    // Keep the phasor running with no notes so a later latch stays on the
    // grid. First step after create/Reset fires this sample — preview +
    // waiting for phase wrap used to hold notes[0] for two periods.
    const bool firstBeat = (s.noteCount > 0 && s.clocksSinceRestart == 0);
    if (firstBeat) {
      do_step(s, mode, steps, seed, octaveOffset);
      trigOut = 1.0;
      s.phase = 0.0;
    } else {
      s.phase += rate / sr;
      if (s.phase >= 1.0) {
        s.phase -= dsp_floor(s.phase);
        if (s.noteCount > 0) {
          do_step(s, mode, steps, seed, octaveOffset);
          trigOut = 1.0;
        }
      }
    }
    s.clockWasHigh = false;
  } else {
    s.clockWasHigh = trigConnected ? (safe(trigger) > 0.0) : false;
  }

  if (s.noteCount <= 0) {
    s.lastGate = 0.0;
    s.lastTrigger = 0.0;
    return s.lastPitch;
  }

  s.lastGate = 1.0;
  s.lastTrigger = trigOut;
  return s.lastPitch;
}

extern "C" double soemdsp_arp_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" double soemdsp_arp_trigger(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastTrigger;
}

extern "C" double soemdsp_arp_step(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastStep;
}

extern "C" double soemdsp_arp_frequency(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastFreqHz;
}

extern "C" int soemdsp_arp_version() {
  return 5; // f jack rate replaces Internal Clock when wired
}
