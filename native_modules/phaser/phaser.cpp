// soemdsp-native-module: phaser
// soemdsp-native-label: Phaser
// soemdsp-native-target: phaser
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET
//
// Up to 8 ZDF SVF stages (Bandpass Peak parallel, or Allpass series),
// each 1–4 identical 12 dB copies (slope 12/24/36/48). Mix + feedback + LFO.
// Reset jack zeros LFO phase only (filter memory stays).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxBands = 8;
static const int kMaxCascade = 4;
static const double kLn2 = 0.6931471805599453;

struct Svf {
  double z1;
  double z2;
};

struct PhaserState {
  bool active;
  Svf svf[kMaxBands][kMaxCascade];
  double lastWet;
  double lfoPhase;
  double lastReset;
  int lastBands;
  int lastCascade;
};

static PhaserState gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"phaser\","
    "\"label\":\"Phaser\","
    "\"targetType\":\"phaser\","
    "\"kind\":\"filter\""
  "}";

static double tan_half(double omega) {
  double s = 0.0, c = 0.0;
  dsp_sin_cos(0.5 * omega, &s, &c);
  if (dsp_fabs(c) < 1.0e-15) return 1e15;
  return s / c;
}

static double pow2(double oct) {
  return dsp_exp(oct * kLn2);
}

static void reset_svfs(PhaserState& s) {
  for (int b = 0; b < kMaxBands; b += 1) {
    for (int c = 0; c < kMaxCascade; c += 1) {
      s.svf[b][c].z1 = 0.0;
      s.svf[b][c].z2 = 0.0;
    }
  }
  s.lastWet = 0.0;
}

static double process_svf(
  Svf& st, double x, double g, double c, double s,
  double aL, double aB, double aH
) {
  const double z1 = st.z1;
  const double z2 = st.z2;
  const double yH = (x - c * z1 - z2) * s;
  const double yB = z1 + g * yH;
  const double yL = z2 + g * yB;
  st.z1 = 2.0 * yB - z1;
  st.z2 = 2.0 * yL - z2;
  return aL * yL + aB * yB + aH * yH;
}

}  // namespace

extern "C" int soemdsp_phaser_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      PhaserState& s = gPool[i];
      reset_svfs(s);
      s.lfoPhase = 0.0;
      s.lastReset = 0.0;
      s.lastBands = 4;
      s.lastCascade = 1;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_phaser_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_phaser_sample(
  int handle,
  double input,
  double frequency,
  double q,
  double slopeChoice,
  double bands,
  double spreadOct,
  double stereoOct,
  double rateHz,
  double depthOct,
  double feedback,
  double mix,
  double amplitude,
  double kernelMode,
  double reset,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PhaserState& st = gPool[handle - 1];
  if (!st.active) return 0.0;

  const double x = safe(input);
  double rate = safe(sampleRate);
  if (!(rate > 1.0)) rate = 44100.0;
  const double ny = rate * 0.49;

  int nBands = (int)(safe(bands) + (safe(bands) >= 0.0 ? 0.5 : -0.5));
  if (nBands < 1) nBands = 1;
  if (nBands > kMaxBands) nBands = kMaxBands;

  int slopeI = (int)(safe(slopeChoice) + (safe(slopeChoice) >= 0.0 ? 0.5 : -0.5));
  if (slopeI < 0) slopeI = 0;
  if (slopeI > 3) slopeI = 3;
  const int cascade = slopeI + 1;

  if (nBands != st.lastBands || cascade != st.lastCascade) {
    reset_svfs(st);
    st.lastBands = nBands;
    st.lastCascade = cascade;
  }

  double f0 = safe(frequency);
  if (f0 < 0.0) f0 = 0.0;
  if (f0 > ny) f0 = ny;
  double Q = safe(q);
  if (!(Q > 1.0e-9) && !(Q < -1.0e-9)) Q = 1.0e-9;
  const double r = 1.0 / Q;
  const double spread = safe(spreadOct);
  const double stereo = safe(stereoOct);
  const double lfoHz = safe(rateHz);
  const double depth = safe(depthOct);
  const double fb = safe(feedback);
  const double wetMix = safe(mix);
  const double amp = safe(amplitude);
  int kernel = (int)(safe(kernelMode) + (safe(kernelMode) >= 0.0 ? 0.5 : -0.5));
  if (kernel < 0) kernel = 0;
  if (kernel > 1) kernel = 1;
  const double resetV = safe(reset);
  if (resetV > 0.5 && st.lastReset <= 0.5) {
    st.lfoPhase = 0.0;
  }
  st.lastReset = resetV;

  st.lfoPhase += lfoHz / rate;
  if (st.lfoPhase >= 1.0) st.lfoPhase -= (double)((int)st.lfoPhase);
  if (st.lfoPhase < 0.0) st.lfoPhase = 0.0;
  double sLfo = 0.0, cLfo = 0.0;
  dsp_sin_cos(kTwoPi * st.lfoPhase, &sLfo, &cLfo);
  const double sweepOct = sLfo * depth;

  const double driven = x + fb * st.lastWet;
  const double mid = 0.5 * (double)(nBands - 1);
  const double aL = kernel == 1 ? 1.0 : 0.0;
  const double aB = kernel == 1 ? -r : r;
  const double aH = kernel == 1 ? 1.0 : 0.0;
  double wet = kernel == 1 ? driven : 0.0;
  for (int b = 0; b < nBands; b += 1) {
    double fc = f0 * pow2(((double)b - mid) * spread + sweepOct + stereo);
    if (fc < 0.0) fc = 0.0;
    if (fc > ny) fc = ny;
    const double omega = kTwoPi * fc / rate;
    const double g = tan_half(omega);
    const double c = g + r;
    const double denom = 1.0 + g * c;
    const double s = denom != 0.0 ? 1.0 / denom : 0.0;
    if (kernel == 1) {
      for (int k = 0; k < cascade; k += 1) {
        wet = process_svf(st.svf[b][k], wet, g, c, s, aL, aB, aH);
      }
    } else {
      double y = driven;
      for (int k = 0; k < cascade; k += 1) {
        y = process_svf(st.svf[b][k], y, g, c, s, aL, aB, aH);
      }
      wet += y;
    }
  }
  st.lastWet = wet;
  const double out = (1.0 - wetMix) * x + wetMix * wet;
  return out * amp;
}

extern "C" int soemdsp_phaser_version() {
  return 4;
}

extern "C" const char* soemdsp_phaser_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_phaser_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
