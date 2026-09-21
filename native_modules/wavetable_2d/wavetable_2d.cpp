// soemdsp-native-module: wavetable_2d
// soemdsp-native-label: Wavetable 2D
// soemdsp-native-target: wavetable2d
// soemdsp-native-kind: oscillator
//
// PCM-backed wavetable oscillator. Host uploads mono (or L of stereo) via
// set_pcm + l_ptr (same path as Sample Player). Entire buffer = one cycle for
// now; Morph is reserved for multi-frame banks (no-op until frames exist).
//
// sample(reset, frequencyHz, phaseOffset, amplitude, morph, sampleRate)
// → bipolar Out. Rising Reset edge zeros running phase.

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include <stddef.h>
#include <stdint.h>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kMaxFrames = 48000 * 60; // 1 min @ 48 kHz ceiling for a table
static const size_t kWasmPage = 65536;
static const int kMaxFreeNodes = 64;

struct FreeNode {
  FreeNode* next;
  int floats;
  float* data;
};

struct State {
  bool active;
  float* pcm;
  int pcmFrames;
  double phase;       // 0…1 running
  double lastReset;
  double lastOut;
  double lastPhase;   // reported for face playhead
};

static State gPool[kMaxInstances];
static FreeNode gFreeNodes[kMaxFreeNodes];
static int gFreeNodeUsed = 0;
static FreeNode* gFreeList = nullptr;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"wavetable_2d\","
    "\"label\":\"Wavetable 2D\","
    "\"targetType\":\"wavetable2d\","
    "\"kind\":\"oscillator\""
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
  if (st.pcm) {
    pcm_free(st.pcm, st.pcmFrames);
  }
  st.pcm = nullptr;
  st.pcmFrames = 0;
}

static void playback_reset(State& st) {
  st.phase = 0.0;
  st.lastReset = 0.0;
  st.lastOut = 0.0;
  st.lastPhase = 0.0;
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

}  // namespace

extern "C" int soemdsp_wavetable_2d_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.pcm = nullptr;
      s.pcmFrames = 0;
      playback_reset(s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_wavetable_2d_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  pcm_release(s);
  s.active = false;
}

extern "C" void soemdsp_wavetable_2d_clear_pcm(int handle) {
  State* st = slot(handle);
  if (!st) return;
  pcm_release(*st);
  playback_reset(*st);
}

extern "C" int soemdsp_wavetable_2d_set_pcm(int handle, int frames, double sampleRate, int channels) {
  State* st = slot(handle);
  if (!st) return 0;
  (void)sampleRate;
  (void)channels;
  if (frames < 2 || frames > kMaxFrames) return 0;
  pcm_release(*st);
  playback_reset(*st);
  float* data = pcm_malloc(frames);
  if (!data) return 0;
  st->pcm = data;
  st->pcmFrames = frames;
  return 1;
}

extern "C" int soemdsp_wavetable_2d_l_ptr(int handle) {
  State* st = slot(handle);
  if (!st || !st->pcm) return 0;
  return (int)(long long)st->pcm;
}

// Same ABI as sample/audio player for shared upload helpers (R unused).
extern "C" int soemdsp_wavetable_2d_r_ptr(int handle) {
  return soemdsp_wavetable_2d_l_ptr(handle);
}

extern "C" int soemdsp_wavetable_2d_max_frames() {
  return kMaxFrames;
}

extern "C" void soemdsp_wavetable_2d_reset(int handle) {
  State* st = slot(handle);
  if (!st) return;
  st->phase = 0.0;
  st->lastPhase = 0.0;
}

extern "C" double soemdsp_wavetable_2d_sample(
  int handle,
  double reset,
  double frequencyHz,
  double phaseOffset,
  double amplitude,
  double morph,
  double engineSampleRate
) {
  (void)morph; // reserved for multi-frame bank
  State* stPtr = slot(handle);
  if (!stPtr) return 0.0;
  State& st = *stPtr;

  const double rv = safe(reset);
  if (st.lastReset <= 0.0 && rv > 0.0) {
    st.phase = 0.0;
  }
  st.lastReset = rv;

  if (!st.pcm || st.pcmFrames <= 1) {
    st.lastOut = 0.0;
    st.lastPhase = wrap01(st.phase);
    return 0.0;
  }

  const double sr = safe(engineSampleRate) > 1.0 ? safe(engineSampleRate) : 44100.0;
  const double freq = safe(frequencyHz);
  st.phase = wrap01(st.phase + freq / sr);

  const double off = wrap01(safe(phaseOffset));
  const double readPhase = wrap01(st.phase + off);
  const double index = readPhase * (double)(st.pcmFrames - 1);
  double y = read_linear(st.pcm, st.pcmFrames, index);

  double amp = safe(amplitude);
  if (amp < 0.0) amp = 0.0;
  if (amp > 1.0) amp = 1.0;
  y *= amp;

  st.lastOut = y;
  st.lastPhase = readPhase;
  return y;
}

extern "C" double soemdsp_wavetable_2d_phase(int handle) {
  State* st = slot(handle);
  return st ? st->lastPhase : 0.0;
}

extern "C" double soemdsp_wavetable_2d_out(int handle) {
  State* st = slot(handle);
  return st ? st->lastOut : 0.0;
}

extern "C" int soemdsp_wavetable_2d_version() { return 1; }
extern "C" const char* soemdsp_wavetable_2d_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_wavetable_2d_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
