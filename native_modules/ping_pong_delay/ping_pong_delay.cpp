// soemdsp-native-module: ping_pong_delay
// soemdsp-native-label: Ping Pong Delay
// soemdsp-native-target: pingPongDelay
// soemdsp-native-kind: effect
//
// Tape-style stereo ping-pong:
//  - Tempo base: Numer/Denom × whole note × Normal|Dotted|Triplet
//  - Offset (ms): max |drift| around base; independent L/R LFOs
//    (Parabol / Random Walk / FBM) swing −Offset…+Offset
//  - Feedback path: soft clip → one-pole HPF → one-pole LPF
//
// Version 3 = process_block + set_params
// Version 4 = growable per-instance rings (no BSS 8s×N pools; size to live delay).

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include <stddef.h>
#include <stdint.h>

namespace {

using namespace soemdsp_maths;

// Small state-slot pool only (no delay audio in BSS — §2b). Rings come from
// memory.grow, sized to each instance's live delay need.
static const int kMaxInstances = 32;
static const int kMaxBlockFrames = 128;
static const double kMaxDelaySeconds = 8.0;
static const int kMaxDelaySamples = 1536002; // hard cap @ 192 kHz × 8 s
static const size_t kWasmPage = 65536;

enum LfoStyle { LfoParabol = 0, LfoRandomWalk = 1, LfoFbm = 2 };

// SoftClip / one-poles: Control *Changed rebuilds coeffs; process uses cache.
struct SoftClip {
  double width{2.0};
  double scaleX{1.0}, scaleY{1.0}, shiftX{0.0}, shiftY{0.0};
  void setSaturate(double saturate) {
    double thr = maxd(0.01, saturate);
    width = maxd(1e-6, thr * 2.0);
    scaleX = 2.0 / width;
    shiftX = -1.0 - (scaleX * (0.0 - 0.5 * width));
    scaleY = 1.0 / scaleX;
    shiftY = -shiftX * scaleY;
  }
  double run(double v) const {
    double x = scaleX * v + shiftX;
    if (x > 20.0) x = 20.0;
    if (x < -20.0) x = -20.0;
    double e2 = dsp_exp(2.0 * x);
    double th = (e2 - 1.0) / (e2 + 1.0);
    return shiftY + scaleY * th;
  }
};

struct OnePoleLP {
  double z{0.0};
  double a1{0.0};
  void coeffsChanged(double freqHz, double sr) {
    double rate = maxd(1.0, sr);
    double w = mind(6.283185307179586 / rate, 0.000142475857) * maxd(0.0, freqHz);
    a1 = dsp_exp(-w);
  }
  double run(double input) {
    z = (1.0 - a1) * input + a1 * z;
    return z;
  }
  void reset() { z = 0.0; }
};

struct OnePoleHP {
  double x0{0.0}, y0{0.0};
  double a1{0.0}, b0{1.0}, b1{0.0};
  void coeffsChanged(double freqHz, double sr) {
    double rate = maxd(1.0, sr);
    double w = mind(6.283185307179586 / rate, 0.000142475857) * maxd(0.0, freqHz);
    a1 = dsp_exp(-w);
    b0 = 0.5 * (1.0 + a1);
    b1 = -b0;
  }
  double run(double input) {
    double y = b0 * input + b1 * x0 + a1 * y0;
    x0 = input;
    y0 = y;
    return y;
  }
  void reset() { x0 = y0 = 0.0; }
};

struct LfoChannel {
  double phase{0.0};
  double fbmTime{0.0};
  double walkOut{0.0};
  double walkLpf{0.0};
  int walkTick{0};
  unsigned int seed{1};

  static double rationalCurve01(double x, double k) {
    double v = clamp(x, 0.0, 1.0);
    double kk = clamp(k, -0.999, 0.999);
    double denom = 2.0 * kk * v - kk - 1.0;
    if (dsp_fabs(denom) < 1e-12) return v;
    return (kk * v - v) / denom;
  }

  static double smoothNoise1d(double x, unsigned int s) {
    int left = (int)x;
    if (x < 0.0 && x != (double)left) left -= 1;
    double frac = x - (double)left;
    double smooth = frac * frac * (3.0 - 2.0 * frac);
    double a = hash_bipolar((unsigned int)left, s);
    double b = hash_bipolar((unsigned int)(left + 1), s);
    return a + (b - a) * smooth;
  }

  static double fbmUnipolar(double time, unsigned int s) {
    double total = 0.0;
    double amplitude = 1.0;
    double freq = 1.0;
    double maxValue = 0.0;
    for (int i = 0; i < 4; i++) {
      total += smoothNoise1d(time * freq, s + (unsigned int)(i * 1013)) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      freq *= 2.0;
    }
    if (maxValue <= 0.0) return 0.5;
    return (total / maxValue) * 0.5 + 0.5;
  }

  static double parabolBipolar(double phase01) {
    double fit = phase01 * 2.0;
    fit = fit - 2.0 * dsp_floor(fit * 0.5);
    fit = fit - 1.0;
    return 4.0 * fit * (1.0 - dsp_fabs(fit));
  }

  double run(int style, double rateHz, double sr) {
    double rate = maxd(1.0, sr);
    double hz = maxd(0.0, rateHz);
    if (style == LfoRandomWalk) {
      walkTick += 1;
      double noise = hash_bipolar((unsigned int)walkTick, seed);
      double increment = clamp(hz / rate, 0.0, 1.0);
      double jitterInc = clamp((hz * 0.37) / rate, 0.0, 1.0);
      double stepSize = clamp(increment + rationalCurve01(jitterInc, 0.99), 0.0, 1.0);
      double averageIncrement = (jitterInc + increment) * 0.5;
      double whiteNoiseMix = averageIncrement >= 0.9
        ? rationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
        : 0.0;
      double randomMix = 1.0 - whiteNoiseMix;
      double step = noise > 0.0 ? stepSize : -stepSize;
      walkOut = clamp(walkOut + step, -1.0, 1.0);
      double mixed = walkOut * randomMix + noise * whiteNoiseMix;
      double w = mind(6.283185307179586 / rate, 0.000142475857) * hz;
      double a1 = dsp_exp(-w);
      walkLpf = (1.0 - a1) * mixed + a1 * walkLpf;
      return clamp(walkLpf, -1.0, 1.0);
    }
    if (style == LfoFbm) {
      fbmTime += hz / rate;
      double uni = fbmUnipolar(fbmTime, seed);
      return clamp(uni * 2.0 - 1.0, -1.0, 1.0);
    }
    phase += hz / rate;
    phase = phase - dsp_floor(phase);
    if (phase < 0.0) phase += 1.0;
    return parabolBipolar(phase);
  }

  void reset(unsigned int s, double phase0) {
    seed = s ? s : 1u;
    phase = phase0;
    fbmTime = phase0 * 0.5;
    walkOut = 0.0;
    walkLpf = 0.0;
    walkTick = 0;
  }
};

// Growable delay RAM (APP_POLICY §2b): per-instance L/R rings via memory.grow.
// No kMaxInstances × 8 s BSS reservation.
struct DelayFreeNode {
  DelayFreeNode* next;
  int capacity;
  float* data;
};

static DelayFreeNode* gDelayFreeList = nullptr;
static DelayFreeNode gDelayFreeNodes[64];
static int gDelayFreeNodeUsed = 0;
static uintptr_t gBump = 0;
static bool gBumpInit = false;

#if defined(__wasm__)
extern "C" unsigned char __heap_base;
static void delay_bump_init() {
  if (gBumpInit) return;
  gBump = (uintptr_t)&__heap_base;
  gBumpInit = true;
}
static int gPingPongMemoryGeneration = 0;

static float* delay_bump_alloc(int capacity) {
  delay_bump_init();
  if (capacity < 2) capacity = 2;
  const size_t bytes = (size_t)capacity * sizeof(float);
  uintptr_t aligned = (gBump + 7u) & ~(uintptr_t)7u;
  uintptr_t end = aligned + (uintptr_t)bytes;
  const size_t memBytes = (size_t)__builtin_wasm_memory_size(0) * kWasmPage;
  if (end > memBytes) {
    const size_t need = (size_t)(end - memBytes);
    const size_t pages = (need + kWasmPage - 1) / kWasmPage;
    if (__builtin_wasm_memory_grow(0, pages) < 0) {
      return nullptr;
    }
    gPingPongMemoryGeneration += 1;
  }
  float* p = (float*)aligned;
  for (int i = 0; i < capacity; i += 1) {
    p[i] = 0.0f;
  }
  gBump = end;
  return p;
}
#else
static void delay_bump_init() {}
static float* delay_bump_alloc(int capacity) {
  (void)capacity;
  return nullptr;
}
#endif

static float* delay_alloc_floats(int capacity) {
  DelayFreeNode** cursor = &gDelayFreeList;
  while (*cursor) {
    DelayFreeNode* node = *cursor;
    if (node->capacity >= capacity) {
      *cursor = node->next;
      float* data = node->data;
      for (int i = 0; i < capacity; i += 1) {
        data[i] = 0.0f;
      }
      return data;
    }
    cursor = &node->next;
  }
  return delay_bump_alloc(capacity);
}

static void delay_free_floats(float* data, int capacity) {
  if (!data || capacity < 2) return;
  if (gDelayFreeNodeUsed >= 64) return; // drop; peak RAM already paid
  DelayFreeNode* node = &gDelayFreeNodes[gDelayFreeNodeUsed++];
  node->next = gDelayFreeList;
  node->capacity = capacity;
  node->data = data;
  gDelayFreeList = node;
}

// Param ownership (mirrors soemdsp::delay::PingPongDelay::kParams):
//   LIVE:    feedback, mix, level, offsetMs, lfoStyle, lfoRate, lfoVariation
//   CONTROL: timing (num/den/mode/tempo/SR), saturate, lpf/hpf → *Changed
struct PingPongDelayState {
  bool active;
  float* bufferL;
  float* bufferR;
  int bufferSize;  // active ring length (samples)
  int bufferCap;   // allocated capacity (>= bufferSize)
  int position;
  double wetL;
  double wetR;
  double outLeft;
  double outRight;
  LfoChannel lfoL;
  LfoChannel lfoR;
  SoftClip clip;
  OnePoleLP lpL, lpR;
  OnePoleHP hpL, hpR;
  // Cached Control last-values
  bool controlsValid;
  double lastSaturate;
  double lastLpfHz;
  double lastHpfHz;
  double lastSampleRate;
  double lastNum;
  double lastDen;
  double lastTimingMode;
  double lastTempoBpm;
  double baseSeconds;
  // Live params latched by set_params / sample (used by process_block).
  double liveFeedback;
  double liveMix;
  double liveLevel;
  double liveOffsetMs;
  double liveLfoStyle;
  double liveLfoRate;
  double liveLfoVariation;
  double liveSampleRate;
  // Block I/O (one JS↔WASM crossing per quantum).
  double blockIn[kMaxBlockFrames];
  double blockOutL[kMaxBlockFrames];
  double blockOutR[kMaxBlockFrames];
};

static PingPongDelayState gPool[kMaxInstances];

static void reset_delay_ring(PingPongDelayState& s, int size) {
  if (!s.bufferL || !s.bufferR || size < 2 || size > s.bufferCap) {
    return;
  }
  for (int i = 0; i < size; i++) {
    s.bufferL[i] = 0.0f;
    s.bufferR[i] = 0.0f;
  }
  s.bufferSize = size;
  s.position = 0;
  s.wetL = 0.0;
  s.wetR = 0.0;
}

static void reset_delay_dsp(PingPongDelayState& s) {
  s.lfoL.reset(0xA11CEu, 0.0);
  s.lfoR.reset(0xB0B5u, 0.37);
  s.lpL.reset();
  s.lpR.reset();
  s.hpL.reset();
  s.hpR.reset();
  s.clip.setSaturate(1.0);
  s.controlsValid = false;
  s.baseSeconds = 0.0;
  s.lpL.coeffsChanged(8000.0, 44100.0);
  s.lpR.coeffsChanged(8000.0, 44100.0);
  s.hpL.coeffsChanged(20.0, 44100.0);
  s.hpR.coeffsChanged(20.0, 44100.0);
}

static double timing_mode_multiplier(double mode) {
  const long long rounded = (long long)(mode + (mode >= 0.0 ? 0.5 : -0.5));
  if (rounded == 1) return 1.5;
  if (rounded == 2) return 2.0 / 3.0;
  return 1.0;
}

static double delay_fraction(double numerator, double denominator) {
  const double effectiveNumerator = maxd(0.0, numerator);
  if (effectiveNumerator == 0.0) return 0.0;
  return effectiveNumerator / maxd(1.0, denominator);
}

static void sync_ping_pong_controls(
  PingPongDelayState& s,
  double saturate,
  double lpfHz,
  double hpfHz,
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double tempoBpm,
  double sampleRate
) {
  const double rate = maxd(1.0, safe(sampleRate));
  const double sat = clamp(safe(saturate), 0.01, 4.0);
  const double lpf = clamp(safe(lpfHz), 20.0, 20000.0);
  const double hpf = clamp(safe(hpfHz), 1.0, 2000.0);
  const double num = safe(timeNumerator);
  const double den = safe(timeDenominator);
  const double mode = safe(timingMode);
  const double bpm = maxd(1.0, safe(tempoBpm));

  const bool dirty =
    !s.controlsValid
    || sat != s.lastSaturate
    || lpf != s.lastLpfHz
    || hpf != s.lastHpfHz
    || rate != s.lastSampleRate
    || num != s.lastNum
    || den != s.lastDen
    || mode != s.lastTimingMode
    || bpm != s.lastTempoBpm;

  if (!dirty) return;

  if (!s.controlsValid || sat != s.lastSaturate) {
    s.clip.setSaturate(sat);
    s.lastSaturate = sat;
  }
  if (!s.controlsValid || lpf != s.lastLpfHz || hpf != s.lastHpfHz || rate != s.lastSampleRate) {
    s.lpL.coeffsChanged(lpf, rate);
    s.lpR.coeffsChanged(lpf, rate);
    s.hpL.coeffsChanged(hpf, rate);
    s.hpR.coeffsChanged(hpf, rate);
    s.lastLpfHz = lpf;
    s.lastHpfHz = hpf;
  }
  if (!s.controlsValid || num != s.lastNum || den != s.lastDen || mode != s.lastTimingMode
      || bpm != s.lastTempoBpm || rate != s.lastSampleRate) {
    const double secondsPerWholeNote = 240.0 / bpm;
    const double fraction = delay_fraction(num, den);
    s.baseSeconds = maxd(0.0, secondsPerWholeNote * fraction * timing_mode_multiplier(mode));
    s.lastNum = num;
    s.lastDen = den;
    s.lastTimingMode = mode;
    s.lastTempoBpm = bpm;
  }
  s.lastSampleRate = rate;
  s.controlsValid = true;
}

static double interpolate_linear(const float* buffer, int length, double where) {
  if (length <= 0) return 0.0;
  while (where < 0.0) where += (double)length;
  double whereFloor = dsp_floor(where);
  long long beforeRaw = (long long)whereFloor;
  int before = (int)(((beforeRaw % length) + length) % length);
  int after = (before + 1) % length;
  const double mix = where - whereFloor;
  return (double)buffer[before] * (1.0 - mix) + (double)buffer[after] * mix;
}

}  // namespace

extern "C" int soemdsp_ping_pong_delay_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PingPongDelayState& s = gPool[i];
      s.bufferL = nullptr;
      s.bufferR = nullptr;
      s.bufferSize = 0;
      s.bufferCap = 0;
      s.position = 0;
      s.outLeft = 0.0;
      s.outRight = 0.0;
      s.liveOffsetMs = 0.0;
      s.liveSampleRate = 44100.0;
      reset_delay_dsp(s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_ping_pong_delay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  PingPongDelayState& s = gPool[handle - 1];
  delay_free_floats(s.bufferL, s.bufferCap);
  delay_free_floats(s.bufferR, s.bufferCap);
  s.bufferL = nullptr;
  s.bufferR = nullptr;
  s.bufferSize = 0;
  s.bufferCap = 0;
  s.active = false;
}

// Size rings to live delay need (+ offset headroom), not a fixed 8 s (§2b).
// Never wipe an existing ring just to change length — that clicks.
// Grow capacity with headroom so memory.grow is rare (grow detaches JS TypedArrays).
static void ensure_buffer_size(PingPongDelayState& s, double sampleRate) {
  const double rate = maxd(1.0, safe(sampleRate));
  const double driftSec = maxd(0.0, safe(s.liveOffsetMs)) / 1000.0;
  double needSec = s.baseSeconds + driftSec + 0.02;
  if (needSec < 0.05) needSec = 0.05;
  if (needSec > kMaxDelaySeconds) needSec = kMaxDelaySeconds;
  int need = (int)dsp_ceil(needSec * rate) + 2;
  if (need < 2) need = 2;
  if (need > kMaxDelaySamples) need = kMaxDelaySamples;

  if (s.bufferL && s.bufferR && s.bufferCap >= need) {
    // Keep capacity; only update logical ring length. Do NOT zero memory.
    if (s.bufferSize != need) {
      s.bufferSize = need;
      if (s.position >= s.bufferSize) {
        s.position %= s.bufferSize;
      }
    }
    return;
  }

  int newCap = need * 2;
  if (newCap < need) newCap = need;
  if (newCap > kMaxDelaySamples) newCap = kMaxDelaySamples;

  float* newL = delay_alloc_floats(newCap);
  float* newR = delay_alloc_floats(newCap);
  if (!newL || !newR) {
    return;
  }
  // Copy overlapping history if growing an existing ring.
  if (s.bufferL && s.bufferR && s.bufferSize > 1) {
    const int copy = s.bufferSize < need ? s.bufferSize : need;
    for (int i = 0; i < copy; i += 1) {
      newL[i] = s.bufferL[i];
      newR[i] = s.bufferR[i];
    }
  }
  delay_free_floats(s.bufferL, s.bufferCap);
  delay_free_floats(s.bufferR, s.bufferCap);
  s.bufferL = newL;
  s.bufferR = newR;
  s.bufferCap = newCap;
  s.bufferSize = need;
  if (s.position >= s.bufferSize) {
    s.position = 0;
  }
}

static void process_one(PingPongDelayState& s, double input) {
  const double rate = maxd(1.0, s.liveSampleRate);
  const double dry = safe(input);
  const double safeFeedback = safe(s.liveFeedback);
  const double safeMix = clamp(safe(s.liveMix), 0.0, 1.0);
  const double safeLevel = clamp(safe(s.liveLevel), 0.0, 2.0);
  const double driftSec = maxd(0.0, safe(s.liveOffsetMs)) / 1000.0;
  const int style = (int)dsp_floor(safe(s.liveLfoStyle) + 0.5);
  const double hz = clamp(safe(s.liveLfoRate), 0.0, 40.0);
  const double vary = clamp(safe(s.liveLfoVariation), 0.0, 1.0);

  const double rateL = hz * (1.0 + vary * 0.31);
  const double rateR = hz * (1.0 - vary * 0.27);
  const double modL = driftSec > 1e-9 ? s.lfoL.run(style, rateL, rate) : 0.0;
  const double modR = driftSec > 1e-9 ? s.lfoR.run(style, rateR, rate) : 0.0;

  const double delaySamplesL = clamp((s.baseSeconds + driftSec * modL) * rate, 1.0, (double)(s.bufferSize - 2));
  const double delaySamplesR = clamp((s.baseSeconds + driftSec * modR) * rate, 1.0, (double)(s.bufferSize - 2));

  s.position = (s.position + 1) % s.bufferSize;
  double readLRaw = (double)s.position + (double)s.bufferSize - delaySamplesL;
  double readRRaw = (double)s.position + (double)s.bufferSize - delaySamplesR;
  readLRaw = readLRaw - (double)s.bufferSize * dsp_floor(readLRaw / (double)s.bufferSize);
  readRRaw = readRRaw - (double)s.bufferSize * dsp_floor(readRRaw / (double)s.bufferSize);

  const double readL = interpolate_linear(s.bufferL, s.bufferSize, readLRaw);
  const double readR = interpolate_linear(s.bufferR, s.bufferSize, readRRaw);

  const double clippedL = s.clip.run(dry + readR * safeFeedback);
  const double clippedR = s.clip.run(readL * safeFeedback);
  const double writeL = s.lpL.run(s.hpL.run(clippedL));
  const double writeR = s.lpR.run(s.hpR.run(clippedR));

  s.bufferL[s.position] = (float)clamp(writeL, -8.0, 8.0);
  s.bufferR[s.position] = (float)clamp(writeR, -8.0, 8.0);
  s.wetL = readL;
  s.wetR = readR;

  s.outLeft = (dry * (1.0 - safeMix) + s.wetL * safeMix) * safeLevel;
  s.outRight = (dry * (1.0 - safeMix) + s.wetR * safeMix) * safeLevel;
}

// Latch Control + Live params once per quantum (or when knobs move).
extern "C" void soemdsp_ping_pong_delay_set_params(
  int    handle,
  double feedback,
  double mix,
  double level,
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double offsetMs,
  double lfoStyle,
  double lfoRate,
  double lfoVariation,
  double saturate,
  double lpfFrequency,
  double hpfFrequency,
  double tempoBpm,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  PingPongDelayState& s = gPool[handle - 1];
  const double rate = maxd(1.0, safe(sampleRate));
  sync_ping_pong_controls(
    s, saturate, lpfFrequency, hpfFrequency,
    timeNumerator, timeDenominator, timingMode, tempoBpm, rate);
  s.liveFeedback = feedback;
  s.liveMix = mix;
  s.liveLevel = level;
  s.liveOffsetMs = offsetMs;
  s.liveLfoStyle = lfoStyle;
  s.liveLfoRate = lfoRate;
  s.liveLfoVariation = lfoVariation;
  s.liveSampleRate = rate;
  // After Control timing + Live offset are known — size rings to need (§2b).
  ensure_buffer_size(s, rate);
}

// Tape-style sample (kept for tools / offline). Prefer process_block in the host.
extern "C" double soemdsp_ping_pong_delay_sample(
  int    handle,
  double input,
  double feedback,
  double mix,
  double level,
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double offsetMs,
  double lfoStyle,
  double lfoRate,
  double lfoVariation,
  double saturate,
  double lpfFrequency,
  double hpfFrequency,
  double tempoBpm,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  soemdsp_ping_pong_delay_set_params(
    handle, feedback, mix, level, timeNumerator, timeDenominator, timingMode,
    offsetMs, lfoStyle, lfoRate, lfoVariation, saturate, lpfFrequency, hpfFrequency,
    tempoBpm, sampleRate);
  process_one(gPool[handle - 1], input);
  return gPool[handle - 1].outLeft;
}

extern "C" void soemdsp_ping_pong_delay_process_block(int handle, int frameCount) {
  if (handle < 1 || handle > kMaxInstances) return;
  PingPongDelayState& s = gPool[handle - 1];
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int i = 0; i < n; i += 1) {
    process_one(s, s.blockIn[i]);
    s.blockOutL[i] = s.outLeft;
    s.blockOutR[i] = s.outRight;
  }
}

extern "C" int soemdsp_ping_pong_delay_block_input_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockIn);
}

extern "C" int soemdsp_ping_pong_delay_block_output_left_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutL);
}

extern "C" int soemdsp_ping_pong_delay_block_output_right_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutR);
}

extern "C" int soemdsp_ping_pong_delay_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" double soemdsp_ping_pong_delay_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" int soemdsp_ping_pong_delay_memory_generation() {
  return gPingPongMemoryGeneration;
}

extern "C" int soemdsp_ping_pong_delay_version() {
  return 5; // no ring-wipe on resize; grow headroom; memory generation
}
