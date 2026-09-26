// soemdsp-native-module: chorus
// soemdsp-native-label: Chorus
// soemdsp-native-target: chorus
// soemdsp-native-kind: effect
//
// Multi-voice interpolating delay. Each voice has a shared-knob vibrato
// (wavetable sine, Top Morph AM, Side Morph phase, different seeds).
// Wet chorus → 6 dB HP → 6 dB LP, then Mix with dry. No delay feedback.

#include "../sandbox_native_maths/sandbox_native_maths.h"
#include "../sandbox_native_maths/vibrato_generator.h"

namespace {

using namespace soemdsp_maths;
using namespace soemdsp_vibrato;

static const int kMaxInstances = 16;
static const int kMaxVoices = 16;
static const int kMaxDelaySamples = 16384; // ~85 ms @ 192 kHz

struct Voice {
  float buffer[kMaxDelaySamples];
  int writeIndex;
  VibratoGenState gen;
  double phaseTurns;
  double lastSine;
};

struct ChorusState {
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

static ChorusState gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"chorus\","
    "\"label\":\"Chorus\","
    "\"targetType\":\"chorus\","
    "\"kind\":\"effect\""
  "}";

static void clear_voice(Voice& v, unsigned int seed) {
  for (int i = 0; i < kMaxDelaySamples; i += 1) v.buffer[i] = 0.0f;
  v.writeIndex = 0;
  v.phaseTurns = 0.0;
  v.lastSine = 0.0;
  vibrato_gen_seed(v.gen, seed);
  vibrato_gen_reset(v.gen, 0.0);
}

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

extern "C" int soemdsp_chorus_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      ChorusState& s = gPool[i];
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

extern "C" void soemdsp_chorus_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_chorus_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  ChorusState& s = gPool[handle - 1];
  if (!s.active) return;
  unsigned int base = (unsigned int)(s.lastSeed < 1.0 ? 1.0 : s.lastSeed);
  if (base == 0u) base = 1u;
  for (int v = 0; v < kMaxVoices; v += 1) {
    Voice& voice = s.voices[v];
    unsigned int sd = base + (unsigned int)v;
    if (sd == 0u) sd = 1u;
    vibrato_gen_seed(voice.gen, sd);
    vibrato_gen_reset(voice.gen, 0.0);
    voice.phaseTurns = 0.0;
    voice.lastSine = 0.0;
  }
}

extern "C" void soemdsp_chorus_sample(
  int handle,
  double inL,
  double inR,
  double voicesN,
  double delayMs,
  double depthMs,
  double mix,
  double spread,
  double speedHz,
  double topMorph,
  double sideMorph,
  double phase,
  double randomFreq,
  double randomAmp,
  double seedParam,
  double hpHz,
  double lpHz,
  double sampleRate,
  double* outL,
  double* outR
) {
  double wetL = 0.0;
  double wetR = 0.0;
  if (handle < 1 || handle > kMaxInstances) {
    if (outL) *outL = 0.0;
    if (outR) *outR = 0.0;
    return;
  }
  ChorusState& st = gPool[handle - 1];
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
      vibrato_gen_seed(st.voices[v].gen, sd);
    }
    st.lastSeed = seed;
  }

  const double xL = safe(inL);
  const double xR = safe(inR);
  const double xM = 0.5 * (xL + xR);

  const double hpC = onepole_coeff(hpHz, sr);
  const double lpC = onepole_coeff(lpHz, sr);
  const double mx = safe(mix);
  const double dly = safe(delayMs);
  const double dep = safe(depthMs);
  const double spr = safe(spread);
  const double spd = safe(speedHz);
  const double tm = safe(topMorph);
  const double sm = safe(sideMorph);
  const double ph = safe(phase);
  const double rf = safe(randomFreq);
  const double ra = clamp(safe(randomAmp), 0.0, 1.0);

  for (int v = 0; v < n; v += 1) {
    Voice& voice = st.voices[v];
    const double spreadPhase = (n <= 1) ? 0.0 : (spr * ((double)v / (double)n));
    const double speed = spd * (1.0 + voice.gen.heldFreq * rf);
    const double freq = speed * (1.0 + voice.lastSine * tm);
    double inc = hz_to_increment(freq, sr);
    if (inc > 0.5) inc = 0.5;
    if (inc < -0.5) inc = -0.5;
    const double absInc = inc < 0.0 ? -inc : inc;
    double smooth = absInc;
    if (smooth > 1.0) smooth = 1.0;
    voice.gen.heldFreq += (voice.gen.targetFreq - voice.gen.heldFreq) * smooth;
    voice.gen.heldAmp += (voice.gen.targetAmp - voice.gen.heldAmp) * smooth;
    voice.gen.phase += absInc;
    if (voice.gen.phase >= 1.0) {
      voice.gen.phase = wrap01(voice.gen.phase);
      vibrato_gen_trigger_hold(voice.gen);
    }
    const double poUsed = ph + voice.lastSine * sm + spreadPhase;
    double y = dsp_sin_turns_lut(voice.phaseTurns + poUsed);
    voice.lastSine = y;
    voice.phaseTurns = wrap01(voice.phaseTurns + inc);
    const double t = (n <= 1) ? 0.5 : ((double)v / (double)(n - 1));
    y *= (1.0 - ra + ra * t);

    // Audio applies Depth to the bipolar modulator; the cloud publishes the
    // pre-Depth signal so face width is invariant to Depth (even at zero).
    const double visualY = clamp(y, -1.0, 1.0);
    double delaySamples = (dly + y * dep) * 0.001 * sr;
    const double delayed = read_delay(voice, delaySamples);
    st.lastDelay01[v] = clamp(0.5 + 0.5 * visualY, 0.0, 1.0);
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
  const double intoDelay = xM;

  for (int v = 0; v < n; v += 1) {
    Voice& voice = st.voices[v];
    voice.buffer[voice.writeIndex] = (float)intoDelay;
    voice.writeIndex += 1;
    if (voice.writeIndex >= kMaxDelaySamples) voice.writeIndex = 0;
  }

  double mixW = mx;
  if (mixW < 0.0) mixW = 0.0;
  if (mixW > 1.0) mixW = 1.0;
  if (outL) *outL = (1.0 - mixW) * xL + mixW * wetL;
  if (outR) *outR = (1.0 - mixW) * xR + mixW * wetR;
}

extern "C" int soemdsp_chorus_voice_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  ChorusState& st = gPool[handle - 1];
  if (!st.active) return 0;
  int n = st.lastN;
  if (n < 0) n = 0;
  if (n > kMaxVoices) n = kMaxVoices;
  return n;
}

extern "C" double soemdsp_chorus_voice_delay(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.5;
  ChorusState& st = gPool[handle - 1];
  if (!st.active || index < 0 || index >= st.lastN) return 0.5;
  return st.lastDelay01[index];
}

extern "C" double soemdsp_chorus_voice_pan(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.5;
  ChorusState& st = gPool[handle - 1];
  if (!st.active || index < 0 || index >= st.lastN) return 0.5;
  return st.lastPan[index];
}

extern "C" int soemdsp_chorus_version() {
  return 8;
}

extern "C" const char* soemdsp_chorus_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_chorus_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
