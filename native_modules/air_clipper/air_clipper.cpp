// soemdsp-native-module: air_clipper
// soemdsp-native-label: AirClipper
// soemdsp-native-target: airClipper
// soemdsp-native-kind: dynamics
//
// Airwindows Density3 (MIT) port. Matches public/modules/airClipper/air-clipper-math.js.
// One handle holds mono/left/right IIR state (same channel pattern as softClipper).
// Density 0..1 → internal 0..5; highpass/output/wet 0..1.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kChannels = 3; // 0 mono, 1 left, 2 right
static const double kPi2 = kHalfPi;

struct Channel {
  double iir;
};

struct State {
  bool active;
  Channel ch[kChannels];
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"air_clipper\","
    "\"label\":\"AirClipper\","
    "\"targetType\":\"airClipper\","
    "\"kind\":\"dynamics\""
  "}";

static double pow3_01(double x) {
  const double t = clamp(safe(x), 0.0, 1.0);
  return t * t * t;
}

static double chanSample(
  Channel& s,
  double input,
  double densityA,
  double highpassB,
  double outputC,
  double wetD,
  double sampleRate
) {
  const double rate = maxd(1.0, safe(sampleRate));
  const double overallscale = rate / 44100.0;
  const double density = safe(densityA) * 5.0;
  double iirAmount = pow3_01(highpassB) / overallscale;
  if (!(iirAmount * 0.0 == 0.0) || iirAmount < 0.0) iirAmount = 0.0;
  const double safeOutput = safe(outputC);
  const double safeWet = safe(wetD);

  double inputSample = safe(input);
  if (dsp_fabs(inputSample) < 1.18e-23) inputSample = 0.0;
  const double drySample = inputSample;

  if (iirAmount == 0.0) {
    s.iir = 0.0;
  }
  s.iir = (s.iir * (1.0 - iirAmount)) + (inputSample * iirAmount);
  if (!(s.iir * 0.0 == 0.0)) s.iir = 0.0;
  inputSample -= s.iir;

  double altered = inputSample;
  if (density > 1.0) {
    altered = clamp(inputSample * density * kPi2, -kPi2, kPi2);
    double X = altered * altered;
    double temp = altered * X;
    altered -= temp / 6.0;
    temp *= X;
    altered += temp / 120.0;
    temp *= X;
    altered -= temp / 5040.0;
    temp *= X;
    altered += temp / 362880.0;
    temp *= X;
    altered -= temp / 39916800.0;
  }
  if (density < 1.0) {
    altered = clamp(inputSample, -1.0, 1.0);
    const double polarity = altered;
    double X = inputSample * altered;
    double temp = X;
    altered = temp / 2.0;
    temp *= X;
    altered -= temp / 24.0;
    temp *= X;
    altered += temp / 720.0;
    temp *= X;
    altered -= temp / 40320.0;
    temp *= X;
    altered += temp / 3628800.0;
    altered *= polarity < 0.0 ? -1.0 : 1.0;
  }
  if (density > 2.0) {
    inputSample = altered;
  } else {
    const double blend = dsp_fabs(density - 1.0);
    inputSample = (inputSample * (1.0 - blend)) + (altered * blend);
  }

  return (drySample * (1.0 - safeWet)) + (inputSample * safeOutput * safeWet);
}

}  // namespace

extern "C" int soemdsp_air_clipper_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      for (int c = 0; c < kChannels; c++) s.ch[c].iir = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_air_clipper_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_air_clipper_sample(
  int handle,
  int channel,
  double input,
  double density,
  double highpass,
  double output,
  double wet,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  int idx = channel;
  if (idx < 0) idx = 0;
  if (idx > 2) idx = 2;
  return chanSample(s.ch[idx], input, density, highpass, output, wet, sampleRate);
}

extern "C" int soemdsp_air_clipper_version() { return 1; }
extern "C" const char* soemdsp_air_clipper_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_air_clipper_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
