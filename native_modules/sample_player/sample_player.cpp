// soemdsp-native-module: sample_player
// soemdsp-native-label: Sample Player
// soemdsp-native-target: samplePlayer
// soemdsp-native-kind: player
//
// Gate-driven stereo sample player. PCM is planar float L/R; host fills via
// l_ptr/r_ptr after set_pcm (same upload path as Music Player).
//
// Modes (mode param):
//   0 One-shot — Gate rising edge starts from start…end once; velocity =
//     Gate level at the edge; Gate fall does not stop playback.
//   1 Hold — while Gate high, advance start→end once; silence on Gate fall
//     or when the end is reached.
//   2 Loop — while Gate high, loop start↔end; silence on Gate fall.
//
// Velocity is latched on each rising edge (clamp 0…1) and scales L/R/Mono.

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include <stddef.h>
#include <stdint.h>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kMaxFrames = 48000 * 60 * 10; // ~10 min @ 48 kHz
static const size_t kWasmPage = 65536;
static const int kMaxFreeNodes = 64;
static const double kMinSpan = 0.000001;
static const double kGateOn = 1e-6;

enum PlayMode {
  kModeOneShot = 0,
  kModeHold = 1,
  kModeLoop = 2
};

struct FreeNode {
  FreeNode* next;
  int floats;
  float* data;
};

struct State {
  bool active;
  float* pcmL;
  float* pcmR;
  int pcmFrames;
  int pcmChannels;
  bool pcmROwned;
  double pcmRate;
  double phase;
  double lastGate;
  double velocity;
  bool playing;
  bool completed;
  bool hasRange;
  double lastStartPhase;
  double lastEndPhase;
  double lastLeft;
  double lastRight;
  double lastPhase;
};

static State gPool[kMaxInstances];
static FreeNode gFreeNodes[kMaxFreeNodes];
static int gFreeNodeUsed = 0;
static FreeNode* gFreeList = nullptr;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"sample_player\","
    "\"label\":\"Sample Player\","
    "\"targetType\":\"samplePlayer\","
    "\"kind\":\"player\""
  "}";

#if defined(__wasm__)
static float* pcm_grow_alloc(int floats) {
  if (floats < 1) return nullptr;
  const size_t bytes = (size_t)floats * sizeof(float);
  const size_t pages = (bytes + kWasmPage - 1) / kWasmPage;
  if (pages < 1) return nullptr;
  const size_t oldBytes = (size_t)__builtin_wasm_memory_size(0) * kWasmPage;
  if (__builtin_wasm_memory_grow(0, pages) < 0) return nullptr;
  float* data = (float*)oldBytes;
  for (int i = 0; i < floats; i += 1) data[i] = 0.0f;
  return data;
}
#else
static float* pcm_grow_alloc(int floats) {
  (void)floats;
  return nullptr;
}
#endif

static float* pcm_malloc(int floats) {
  if (floats < 1) return nullptr;
  FreeNode** cursor = &gFreeList;
  while (*cursor) {
    FreeNode* node = *cursor;
    if (node->floats >= floats) {
      *cursor = node->next;
      float* data = node->data;
      const int leftover = node->floats - floats;
      if (leftover > 0 && gFreeNodeUsed < kMaxFreeNodes) {
        FreeNode* rest = &gFreeNodes[gFreeNodeUsed++];
        rest->next = gFreeList;
        rest->floats = leftover;
        rest->data = data + floats;
        gFreeList = rest;
      }
      for (int i = 0; i < floats; i += 1) data[i] = 0.0f;
      return data;
    }
    cursor = &node->next;
  }
  return pcm_grow_alloc(floats);
}

static void pcm_free(float* data, int floats) {
  if (!data || floats < 1) return;
  if (gFreeNodeUsed >= kMaxFreeNodes) return;
  FreeNode* node = &gFreeNodes[gFreeNodeUsed++];
  node->next = gFreeList;
  node->floats = floats;
  node->data = data;
  gFreeList = node;
}

static void pcm_release(State& st) {
  if (st.pcmL) {
    pcm_free(st.pcmL, st.pcmFrames);
  }
  if (st.pcmROwned && st.pcmR && st.pcmR != st.pcmL) {
    pcm_free(st.pcmR, st.pcmFrames);
  }
  st.pcmL = nullptr;
  st.pcmR = nullptr;
  st.pcmFrames = 0;
  st.pcmChannels = 0;
  st.pcmROwned = false;
  st.pcmRate = 44100.0;
}

static void playback_reset(State& st) {
  st.phase = 0.0;
  st.lastGate = 0.0;
  st.velocity = 0.0;
  st.playing = false;
  st.completed = false;
  st.hasRange = false;
  st.lastStartPhase = 0.0;
  st.lastEndPhase = 1.0;
  st.lastLeft = 0.0;
  st.lastRight = 0.0;
  st.lastPhase = 0.0;
}

static void resolve_range(double start, double end, double* startPhase, double* endPhase, double* span) {
  const double a = clamp(safe(start), 0.0, 1.0);
  const double b = clamp(safe(end), 0.0, 1.0);
  if (dsp_fabs(b - a) <= kMinSpan) {
    *startPhase = 0.0;
    *endPhase = 1.0;
  } else if (a < b) {
    *startPhase = a;
    *endPhase = b;
  } else {
    *startPhase = b;
    *endPhase = a;
  }
  *span = maxd(kMinSpan, *endPhase - *startPhase);
}

static double read_linear(const float* buf, int frames, double index) {
  if (!buf || frames <= 1) return 0.0;
  if (index < 0.0) index = 0.0;
  const double maxIndex = (double)(frames - 1);
  if (index > maxIndex) index = maxIndex;
  const int i0 = (int)dsp_floor(index);
  int i1 = i0 + 1;
  if (i1 >= frames) i1 = frames - 1;
  if (i0 < 0) return (double)buf[0];
  const double t = index - (double)i0;
  const double a = (double)buf[i0];
  const double b = (double)buf[i1];
  return a + (b - a) * t;
}

static State* slot(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  State& st = gPool[handle - 1];
  if (!st.active) return nullptr;
  return &st;
}

static double gate_velocity(double gate) {
  const double v = safe(gate);
  if (!(v * 0.0 == 0.0)) return 0.0;
  if (v <= 0.0) return 0.0;
  if (v >= 1.0) return 1.0;
  return v;
}

}  // namespace

extern "C" int soemdsp_sample_player_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.pcmL = nullptr;
      s.pcmR = nullptr;
      s.pcmFrames = 0;
      s.pcmChannels = 0;
      s.pcmROwned = false;
      s.pcmRate = 44100.0;
      playback_reset(s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sample_player_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  pcm_release(s);
  s.active = false;
}

extern "C" void soemdsp_sample_player_clear_pcm(int handle) {
  State* st = slot(handle);
  if (!st) return;
  pcm_release(*st);
  playback_reset(*st);
}

extern "C" int soemdsp_sample_player_set_pcm(int handle, int frames, double sampleRate, int channels) {
  State* st = slot(handle);
  if (!st) return 0;
  if (frames < 2 || frames > kMaxFrames || channels < 1) return 0;
  pcm_release(*st);
  playback_reset(*st);
  float* left = pcm_malloc(frames);
  if (!left) return 0;
  float* right = left;
  bool rightOwned = false;
  if (channels >= 2) {
    right = pcm_malloc(frames);
    if (!right) {
      pcm_free(left, frames);
      return 0;
    }
    rightOwned = true;
  }
  st->pcmL = left;
  st->pcmR = right;
  st->pcmFrames = frames;
  st->pcmChannels = channels >= 2 ? 2 : 1;
  st->pcmROwned = rightOwned;
  const double rate = safe(sampleRate);
  st->pcmRate = rate > 1.0 ? rate : 44100.0;
  return 1;
}

extern "C" int soemdsp_sample_player_l_ptr(int handle) {
  State* st = slot(handle);
  if (!st || !st->pcmL) return 0;
  return (int)(long long)st->pcmL;
}

extern "C" int soemdsp_sample_player_r_ptr(int handle) {
  State* st = slot(handle);
  if (!st || !st->pcmR) return 0;
  return (int)(long long)st->pcmR;
}

extern "C" int soemdsp_sample_player_max_frames() {
  return kMaxFrames;
}

extern "C" double soemdsp_sample_player_sample(
  int handle,
  double gate,
  double modeParam,
  double speedParam,
  double start,
  double end,
  double engineSampleRate
) {
  State* stPtr = slot(handle);
  if (!stPtr) return 0.0;
  State& st = *stPtr;

  double startPhase = 0.0;
  double endPhase = 1.0;
  double span = 1.0;
  resolve_range(start, end, &startPhase, &endPhase, &span);

  if (!st.hasRange) {
    st.phase = startPhase;
    st.completed = false;
    st.playing = false;
    st.hasRange = true;
  } else if (st.lastStartPhase != startPhase || st.lastEndPhase != endPhase) {
    if (!(st.phase * 0.0 == 0.0) || st.phase < startPhase || st.phase > endPhase) {
      st.phase = startPhase;
    }
  }
  st.lastStartPhase = startPhase;
  st.lastEndPhase = endPhase;

  int mode = (int)dsp_floor(safe(modeParam) + 0.5);
  if (mode < kModeOneShot) mode = kModeOneShot;
  if (mode > kModeLoop) mode = kModeLoop;

  const double gateV = safe(gate);
  const bool gateHigh = gateV > kGateOn;
  const bool rising = st.lastGate <= kGateOn && gateHigh;
  const bool falling = st.lastGate > kGateOn && !gateHigh;
  st.lastGate = gateV;

  if (rising) {
    st.velocity = gate_velocity(gateV);
    st.phase = startPhase;
    st.completed = false;
    st.playing = true;
  }

  if (mode == kModeOneShot) {
    // Rising already armed playback; Gate fall does not cancel.
  } else if (mode == kModeHold || mode == kModeLoop) {
    if (falling || !gateHigh) {
      st.playing = false;
      st.phase = startPhase;
      st.completed = false;
    } else if (gateHigh && !st.playing && !st.completed && mode == kModeHold) {
      // Held without a rising edge (e.g. Gate already high at load): stay silent
      // until a rising edge. Loop same.
    }
  }

  if (!st.pcmL || st.pcmFrames <= 1 || !st.playing || st.completed || st.velocity <= 0.0) {
    st.lastLeft = 0.0;
    st.lastRight = 0.0;
    st.lastPhase = clamp(st.phase, 0.0, 1.0);
    return 0.0;
  }

  const double speed = safe(speedParam);
  const double engineRate = safe(engineSampleRate) > 1.0 ? safe(engineSampleRate) : 44100.0;
  const double sampleRateRatio = st.pcmRate / engineRate;
  const double increment = (speed * sampleRateRatio) / (double)st.pcmFrames;

  const double boundedPhase = clamp(st.phase, startPhase, endPhase);
  const double frameIndex = boundedPhase * (double)(st.pcmFrames - 1);
  const double leftS = read_linear(st.pcmL, st.pcmFrames, frameIndex);
  const double rightS = read_linear(st.pcmR ? st.pcmR : st.pcmL, st.pcmFrames, frameIndex);
  const double amp = st.velocity;
  const double left = leftS * amp;
  const double right = rightS * amp;

  const double nextPhase = boundedPhase + increment;
  if (mode == kModeLoop) {
    const double normalizedNext = (nextPhase - startPhase) / span;
    st.phase = startPhase + wrap01(normalizedNext) * span;
  } else if (speed >= 0.0 && nextPhase >= endPhase) {
    st.phase = endPhase;
    st.completed = true;
    st.playing = false;
  } else if (speed < 0.0 && nextPhase <= startPhase) {
    st.phase = startPhase;
    st.completed = true;
    st.playing = false;
  } else {
    st.phase = clamp(nextPhase, startPhase, endPhase);
  }

  st.lastLeft = left;
  st.lastRight = right;
  st.lastPhase = st.phase;
  return 0.5 * (left + right);
}

extern "C" double soemdsp_sample_player_left(int handle) {
  State* st = slot(handle);
  return st ? st->lastLeft : 0.0;
}

extern "C" double soemdsp_sample_player_right(int handle) {
  State* st = slot(handle);
  return st ? st->lastRight : 0.0;
}

extern "C" double soemdsp_sample_player_phase(int handle) {
  State* st = slot(handle);
  return st ? st->lastPhase : 0.0;
}

extern "C" int soemdsp_sample_player_version() { return 1; }
extern "C" const char* soemdsp_sample_player_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_sample_player_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
