// soemdsp-native-module: audio_player
// soemdsp-native-label: Music Player
// soemdsp-native-target: audioPlayer
// soemdsp-native-kind: player
//
// Port of public/modules/audioPlayer/audio-player-worklet-evaluator.js
// audioPlayerSample. PCM is planar float L/R in a malloc/free arena
// (max 60 s @ 44.1 kHz); JS fills via l_ptr/r_ptr after set_pcm, like
// phosphillator. Transport 0–5: Reset / Stop / Pause / Loop / Play /
// Loop All (5 is play-once at this kernel; playlist wrap is host-side).
// Readout is linear interpolation (antialias kept on the ABI only).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

// Demo-friendly cap: 4 players × ~30 s mono-equivalent arena (grows via
// bump allocator; stereo uses 2× floats per frame). Keeps combined wasm small.
static const int kMaxInstances = 4;
static const int kMaxFrames = 44100 * 30;
static const int kArenaFloats = kMaxFrames * 2; // shared pool (~10 MB floats)

static const int kMaxFreeNodes = 32;
static const double kMinSpan = 0.000001;

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
  double lastReset;
  int transportMode;
  bool completed;
  bool hasRange;
  double lastStartPhase;
  double lastEndPhase;
  double lastLeft;
  double lastRight;
  double lastPhase;
  double lastTrigger;
};

static State gPool[kMaxInstances];
static float gArena[kArenaFloats];
static int gBump = 0;
static FreeNode gFreeNodes[kMaxFreeNodes];
static int gFreeNodeUsed = 0;
static FreeNode* gFreeList = nullptr;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"audio_player\","
    "\"label\":\"Music Player\","
    "\"targetType\":\"audioPlayer\","
    "\"kind\":\"player\""
  "}";

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
  if (gBump > kArenaFloats - floats) return nullptr;
  float* data = gArena + gBump;
  gBump += floats;
  for (int i = 0; i < floats; i += 1) data[i] = 0.0f;
  return data;
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
  st.lastReset = 0.0;
  st.transportMode = -1;
  st.completed = false;
  st.hasRange = false;
  st.lastStartPhase = 0.0;
  st.lastEndPhase = 1.0;
  st.lastLeft = 0.0;
  st.lastRight = 0.0;
  st.lastPhase = 0.0;
  st.lastTrigger = 0.0;
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

}  // namespace

extern "C" int soemdsp_audio_player_create() {
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

extern "C" void soemdsp_audio_player_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  pcm_release(s);
  s.active = false;
}

extern "C" void soemdsp_audio_player_clear_pcm(int handle) {
  State* st = slot(handle);
  if (!st) return;
  pcm_release(*st);
  playback_reset(*st);
}

// Allocates planar L/R (or mono L with R aliased) and zeros them. JS then
// writes floats at l_ptr/r_ptr. Returns 1 on success; 0 refuses (no truncate).
extern "C" int soemdsp_audio_player_set_pcm(int handle, int frames, double sampleRate, int channels) {
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

extern "C" int soemdsp_audio_player_l_ptr(int handle) {
  State* st = slot(handle);
  if (!st || !st->pcmL) return 0;
  return (int)(long long)st->pcmL;
}

extern "C" int soemdsp_audio_player_r_ptr(int handle) {
  State* st = slot(handle);
  if (!st || !st->pcmR) return 0;
  return (int)(long long)st->pcmR;
}

extern "C" int soemdsp_audio_player_max_frames() {
  return kMaxFrames;
}

extern "C" double soemdsp_audio_player_sample(
  int handle,
  double reset,
  double speedCv,
  double phaseCv,
  int hasPhase,
  double transportMode,
  double speedParam,
  double start,
  double end,
  double amplitude,
  double phaseOffset,
  double phaseSkip,
  double playlistScrub,
  double antialias,
  double engineSampleRate
) {
  (void)antialias;
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
    st.hasRange = true;
  } else if (st.lastStartPhase != startPhase || st.lastEndPhase != endPhase) {
    if (!(st.phase * 0.0 == 0.0) || st.phase < startPhase || st.phase > endPhase) {
      st.phase = startPhase;
    }
    st.completed = false;
  }
  st.lastStartPhase = startPhase;
  st.lastEndPhase = endPhase;

  int mode = (int)dsp_floor(safe(transportMode) + 0.5);
  if (mode < 0) mode = 0;
  if (mode > 5) mode = 5;
  if (st.transportMode != mode) {
    st.completed = false;
    st.transportMode = mode;
  }
  const bool transportReset = mode <= 0;
  const bool transportStopped = mode == 1;
  const bool transportLooping = mode == 3;
  const bool transportPlayOnce = mode >= 4;

  const double resetV = safe(reset);
  const bool resetEdge = st.lastReset <= 0.0 && resetV > 0.0;
  if (resetEdge || transportReset || transportStopped) {
    st.phase = startPhase;
    st.completed = false;
  }
  const bool playing = (transportPlayOnce || transportLooping) && !st.completed;
  st.lastReset = resetV;

  if (!st.pcmL || st.pcmFrames <= 1) {
    st.lastLeft = 0.0;
    st.lastRight = 0.0;
    st.lastPhase = 0.0;
    st.lastTrigger = 0.0;
    return 0.0;
  }

  const double speed = safe(speedParam) + safe(speedCv);
  const double engineRate = safe(engineSampleRate) > 1.0 ? safe(engineSampleRate) : 44100.0;
  const double sampleRateRatio = st.pcmRate / engineRate;
  const double increment = (speed * sampleRateRatio) / (double)st.pcmFrames;
  const bool phaseConnected = hasPhase != 0;
  const double basePhase = phaseConnected
    ? clamp(safe(phaseCv), 0.0, 1.0)
    : clamp(st.phase, 0.0, 1.0);
  const double phaseWithOffset =
    basePhase + safe(phaseOffset) + safe(phaseSkip) + safe(playlistScrub);
  const double boundedPhase =
    startPhase + wrap01((phaseWithOffset - startPhase) / span) * span;

  const double frameIndex = boundedPhase * (double)(st.pcmFrames - 1);
  const double leftS = read_linear(st.pcmL, st.pcmFrames, frameIndex);
  const double rightS = read_linear(st.pcmR ? st.pcmR : st.pcmL, st.pcmFrames, frameIndex);
  double amp = safe(amplitude);
  if (!(amp * 0.0 == 0.0) || amp < 0.0) amp = 1.0;
  const double left = playing ? leftS * amp : 0.0;
  const double right = playing ? rightS * amp : 0.0;

  double done = 0.0;
  if (!phaseConnected && playing) {
    const double nextPhase = basePhase + increment;
    if (transportLooping) {
      const double normalizedNext = (nextPhase - startPhase) / span;
      done = (normalizedNext < 0.0 || normalizedNext >= 1.0) ? 1.0 : 0.0;
      st.phase = startPhase + wrap01((nextPhase - startPhase) / span) * span;
    } else if (speed >= 0.0 && nextPhase >= endPhase) {
      st.phase = endPhase;
      st.completed = true;
      done = 1.0;
    } else if (speed < 0.0 && nextPhase <= startPhase) {
      st.phase = startPhase;
      st.completed = true;
      done = 1.0;
    } else {
      st.phase = clamp(nextPhase, startPhase, endPhase);
    }
  } else if (!phaseConnected && (transportReset || transportStopped)) {
    st.phase = startPhase;
  } else if (phaseConnected) {
    st.phase = clamp(safe(phaseCv), 0.0, 1.0);
  }

  st.lastLeft = left;
  st.lastRight = right;
  st.lastPhase = boundedPhase;
  st.lastTrigger = done;
  return 0.5 * (left + right);
}

extern "C" double soemdsp_audio_player_left(int handle) {
  State* st = slot(handle);
  return st ? st->lastLeft : 0.0;
}

extern "C" double soemdsp_audio_player_right(int handle) {
  State* st = slot(handle);
  return st ? st->lastRight : 0.0;
}

extern "C" double soemdsp_audio_player_phase(int handle) {
  State* st = slot(handle);
  return st ? st->lastPhase : 0.0;
}

extern "C" double soemdsp_audio_player_trigger(int handle) {
  State* st = slot(handle);
  return st ? st->lastTrigger : 0.0;
}

extern "C" int soemdsp_audio_player_version() { return 1; }
extern "C" const char* soemdsp_audio_player_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_audio_player_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
