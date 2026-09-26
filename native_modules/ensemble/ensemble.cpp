// soemdsp-native-module: ensemble
// soemdsp-native-label: Ensemble
// soemdsp-native-target: ensemble
// soemdsp-native-kind: effect
//
// Chorus topology (multi-voice interpolating delay, wet HP→LP, Mix) with
// SoEm Reverb delay modulators: Random Walk or FBM. No vibrato generator.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kMaxVoices = 16;
static const int kMaxDelaySamples = 16384;

enum ModStyle { ModRandomWalk = 0, ModFbm = 1 };

struct Voice {
  float buffer[kMaxDelaySamples];
  int writeIndex;
  unsigned int walkRng;
  double walkOut;
  double walkLpf;
  unsigned int fbmSeed;
  double fbmTime;
};

struct EnsembleState {
  bool active;
  Voice voices[kMaxVoices];
  double hpLpL;
  double hpLpR;
  double lpL;
  double lpR;
  double lastSeed;
  int lastN;
  double lastDelay01[kMaxVoices];
  double lastPan[kMaxVoices];
};

static EnsembleState gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"ensemble\","
    "\"label\":\"Ensemble\","
    "\"targetType\":\"ensemble\","
    "\"kind\":\"effect\""
  "}";

static double onepole_coeff(double hz, double sr) {
  double f = safe(hz);
  if (f < 0.0) f = 0.0;
  const double ny = sr * 0.45;
  if (f > ny) f = ny;
  const double c = 1.0 - dsp_exp(-kTwoPi * f / sr);
  if (c < 0.0) return 0.0;
  if (c > 1.0) return 1.0;
  return c;
}

static double rationalCurve01(double value, double skew) {
  double t = clamp(value, 0.0, 1.0);
  double safeSkew = clamp(skew, -0.999, 0.999);
  return ((1.0 + safeSkew) * t) / (1.0 - safeSkew + 2.0 * safeSkew * t);
}

static double nextWalkNoise(Voice& v) {
  v.walkRng = v.walkRng * 1664525u + 1013904223u;
  return (double)v.walkRng / 4294967295.0 * 2.0 - 1.0;
}

static double runRandomWalk(Voice& v, double freqHz, double jitterHz, double sr) {
  const double rate = maxd(1.0, sr);
  const double noise = nextWalkNoise(v);
  const double increment = clamp(freqHz / rate, 0.0, 1.0);
  const double jitterInc = clamp(jitterHz / rate, 0.0, 1.0);
  const double stepSize = clamp(increment + rationalCurve01(jitterInc, 0.99), 0.0, 1.0);
  const double averageIncrement = (jitterInc + increment) * 0.5;
  const double whiteNoiseMix = averageIncrement >= 0.9
    ? rationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
    : 0.0;
  const double randomMix = 1.0 - whiteNoiseMix;
  const double step = noise > 0.0 ? stepSize : -stepSize;
  v.walkOut = clamp(v.walkOut + step, -1.0, 1.0);
  const double mixed = v.walkOut * randomMix + noise * whiteNoiseMix;
  const double w = mind(kTwoPi / rate, 0.000142475857) * maxd(0.0, freqHz);
  const double a1 = dsp_exp(-w);
  v.walkLpf = (1.0 - a1) * mixed + a1 * v.walkLpf;
  return v.walkLpf;
}

static double smoothNoise1d(double x, unsigned int seed) {
  int left = (int)x;
  if (x < 0.0 && x != (double)left) left -= 1;
  const double frac = x - (double)left;
  const double smooth = frac * frac * (3.0 - 2.0 * frac);
  const double a = hash_bipolar((unsigned int)left, seed);
  const double b = hash_bipolar((unsigned int)(left + 1), seed);
  return a + (b - a) * smooth;
}

static double fbmBipolar(double time, unsigned int seed) {
  double total = 0.0;
  double amplitude = 1.0;
  double freq = 1.0;
  double maxValue = 0.0;
  const double pers = 0.5;
  for (int i = 0; i < 4; i += 1) {
    total += smoothNoise1d(time * freq, seed + (unsigned int)(i * 1013)) * amplitude;
    maxValue += amplitude;
    amplitude *= pers;
    freq *= 2.0;
  }
  if (maxValue <= 0.0) return 0.0;
  return total / maxValue;
}

static void seed_voice(Voice& v, unsigned int seed) {
  unsigned int sd = seed ? seed : 1u;
  v.walkRng = sd;
  v.walkOut = 0.0;
  v.walkLpf = 0.0;
  v.fbmSeed = sd * 2654435761u;
  if (!v.fbmSeed) v.fbmSeed = 1u;
  v.fbmTime = 0.0;
}

static void clear_voice(Voice& v, unsigned int seed) {
  for (int i = 0; i < kMaxDelaySamples; i += 1) v.buffer[i] = 0.0f;
  v.writeIndex = 0;
  seed_voice(v, seed);
}

static double read_delay(const Voice& v, double delaySamples) {
  const double maxDelay = (double)(kMaxDelaySamples - 2);
  if (delaySamples > maxDelay) delaySamples = maxDelay;
  if (delaySamples < 1.0) delaySamples = 1.0;
  double readPos = (double)v.writeIndex - delaySamples;
  while (readPos < 0.0) readPos += (double)kMaxDelaySamples;
  const int i0 = (int)readPos;
  const int i1 = i0 + 1 >= kMaxDelaySamples ? 0 : i0 + 1;
  const double frac = readPos - (double)i0;
  return (double)v.buffer[i0] * (1.0 - frac) + (double)v.buffer[i1] * frac;
}

}  // namespace

extern "C" int soemdsp_ensemble_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      EnsembleState& s = gPool[i];
      s.hpLpL = 0.0;
      s.hpLpR = 0.0;
      s.lpL = 0.0;
      s.lpR = 0.0;
      s.lastSeed = -1.0;
      s.lastN = 0;
      for (int v = 0; v < kMaxVoices; v += 1) {
        clear_voice(s.voices[v], (unsigned int)(v + 1));
        s.lastDelay01[v] = 0.5;
        s.lastPan[v] = 0.5;
      }
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_ensemble_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_ensemble_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  EnsembleState& s = gPool[handle - 1];
  if (!s.active) return;
  unsigned int base = (unsigned int)(s.lastSeed < 1.0 ? 1.0 : s.lastSeed);
  if (base == 0u) base = 1u;
  for (int v = 0; v < kMaxVoices; v += 1) {
    unsigned int sd = base + (unsigned int)v;
    if (sd == 0u) sd = 1u;
    seed_voice(s.voices[v], sd);
  }
}

extern "C" void soemdsp_ensemble_sample(
  int handle,
  double inL,
  double inR,
  double voicesN,
  double delayMs,
  double depthMs,
  double mix,
  double spread,
  double speedHz,
  double mode,
  double seedParam,
  double hpHz,
  double lpHz,
  double sampleRate,
  double* outL,
  double* outR
) {
  if (handle < 1 || handle > kMaxInstances) {
    if (outL) *outL = 0.0;
    if (outR) *outR = 0.0;
    return;
  }
  EnsembleState& st = gPool[handle - 1];
  if (!st.active) {
    if (outL) *outL = 0.0;
    if (outR) *outR = 0.0;
    return;
  }

  double sr = safe(sampleRate);
  if (!(sr > 1.0)) sr = 44100.0;
  int n = (int)(voicesN + 0.5);
  if (n < 1) n = 1;
  if (n > kMaxVoices) n = kMaxVoices;

  const double seed = safe(seedParam);
  if (!(seed == st.lastSeed)) {
    for (int v = 0; v < kMaxVoices; v += 1) {
      unsigned int sd = (unsigned int)(seed < 1.0 ? 1.0 : seed) + (unsigned int)v;
      if (sd == 0u) sd = 1u;
      seed_voice(st.voices[v], sd);
    }
    st.lastSeed = seed;
  }

  const double xL = safe(inL);
  const double xR = safe(inR);
  const double xM = 0.5 * (xL + xR);
  const int style = (int)(safe(mode) + 0.5) > 0 ? ModFbm : ModRandomWalk;
  const double hpC = onepole_coeff(hpHz, sr);
  const double lpC = onepole_coeff(lpHz, sr);
  const double mx = safe(mix);
  const double dly = safe(delayMs);
  const double dep = safe(depthMs);
  const double spr = clamp(safe(spread), 0.0, 1.0);
  const double spd = maxd(0.0, safe(speedHz));
  const double jitter = spd * 0.25;

  double wetL = 0.0;
  double wetR = 0.0;
  for (int v = 0; v < n; v += 1) {
    Voice& voice = st.voices[v];
    const double voiceOff = (n <= 1) ? 0.0 : ((double)v / (double)n);
    double y = 0.0;
    if (style == ModFbm) {
      voice.fbmTime += spd / sr;
      y = 0.5 * fbmBipolar(voice.fbmTime + voiceOff * 8.0, voice.fbmSeed);
    } else {
      y = runRandomWalk(voice, spd * (1.0 + voiceOff), jitter, sr);
    }
    double delaySamples = (dly + y * dep) * 0.001 * sr;
    const double delayed = read_delay(voice, delaySamples);
    const double tFull = (n <= 1) ? 0.5 : ((double)v / (double)(n - 1));
    const double t = 0.5 + (tFull - 0.5) * spr;
    // The FBM audio/modulation excursion is intentionally halved above. Keep
    // that audio safety scaling out of the visual delay coordinate so FBM
    // traces still use the full face width; Random Walk already spans [-1, 1].
    const double visualY = style == ModFbm ? 2.0 * y : y;
    st.lastDelay01[v] = (dep > 1.0e-12)
      ? clamp(0.5 + 0.5 * visualY, 0.0, 1.0)
      : 0.5;
    st.lastPan[v] = t;
    st.lastN = n;
    const double panL = dsp_cos(t * kPi * 0.5);
    const double panR = dsp_sin(t * kPi * 0.5);
    // 1/N left wet ~6 dB down vs dry (equal-power pan). Match dry at Mix 1.
    const double g = 1.0 / (0.637 * (double)n);
    wetL += delayed * panL * g;
    wetR += delayed * panR * g;
  }

  st.hpLpL += hpC * (wetL - st.hpLpL);
  wetL = wetL - st.hpLpL;
  st.lpL += lpC * (wetL - st.lpL);
  wetL = st.lpL;
  st.hpLpR += hpC * (wetR - st.hpLpR);
  wetR = wetR - st.hpLpR;
  st.lpR += lpC * (wetR - st.lpR);
  wetR = st.lpR;

  for (int v = 0; v < n; v += 1) {
    Voice& voice = st.voices[v];
    voice.buffer[voice.writeIndex] = (float)xM;
    voice.writeIndex += 1;
    if (voice.writeIndex >= kMaxDelaySamples) voice.writeIndex = 0;
  }

  double mixW = mx;
  if (mixW < 0.0) mixW = 0.0;
  if (mixW > 1.0) mixW = 1.0;
  if (outL) *outL = (1.0 - mixW) * xL + mixW * wetL;
  if (outR) *outR = (1.0 - mixW) * xR + mixW * wetR;
}

extern "C" int soemdsp_ensemble_voice_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  EnsembleState& st = gPool[handle - 1];
  if (!st.active) return 0;
  int n = st.lastN;
  if (n < 0) n = 0;
  if (n > kMaxVoices) n = kMaxVoices;
  return n;
}

extern "C" double soemdsp_ensemble_voice_delay(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.5;
  EnsembleState& st = gPool[handle - 1];
  if (!st.active || index < 0 || index >= st.lastN) return 0.5;
  return st.lastDelay01[index];
}

extern "C" double soemdsp_ensemble_voice_pan(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.5;
  EnsembleState& st = gPool[handle - 1];
  if (!st.active || index < 0 || index >= st.lastN) return 0.5;
  return st.lastPan[index];
}

extern "C" int soemdsp_ensemble_version() {
  return 10;
}

extern "C" const char* soemdsp_ensemble_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_ensemble_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
