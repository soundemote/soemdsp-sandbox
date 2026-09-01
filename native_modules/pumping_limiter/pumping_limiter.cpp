// soemdsp-native-module: pumping_limiter
// soemdsp-native-label: Pump Limiter
// soemdsp-native-target: limiter
// soemdsp-native-kind: dynamics
//
// Matches public/modules/lookaheadLimiter/lookahead-limiter-math.js
// nodeGraphPumpingLimiterFrame — look-ahead delay + threshold/ratio GR,
// optional sidechain detect, Env out. No hard ceiling / no autogain.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kMaxSamples = 16384;

struct State {
  bool active;
  float delayL[kMaxSamples];
  float delayR[kMaxSamples];
  int pos;
  int cap;
  double gain;
  double meanSquare;
  double env;
  double lastOut;
  double lastLeft;
  double lastRight;
  double lastGain;
  double lastEnv;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"pumping_limiter\","
    "\"label\":\"Pump Limiter\","
    "\"targetType\":\"limiter\","
    "\"kind\":\"dynamics\""
  "}";

}  // namespace

extern "C" int soemdsp_pumping_limiter_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      for (int n = 0; n < kMaxSamples; n += 1) {
        s.delayL[n] = 0.0f;
        s.delayR[n] = 0.0f;
      }
      s.pos = 0;
      s.cap = kMaxSamples;
      s.gain = 1.0;
      s.meanSquare = 0.0;
      s.env = 0.0;
      s.lastOut = 0.0;
      s.lastLeft = 0.0;
      s.lastRight = 0.0;
      s.lastGain = 1.0;
      s.lastEnv = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pumping_limiter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_pumping_limiter_sample(
  int handle,
  double left,
  double right,
  double sidechain,
  int hasSidechain,
  double inputGainDb,
  double thresholdDb,
  double ratio,
  double lookaheadMs,
  double lookaheadSamples,
  double attackMs,
  double releaseMs,
  double sampleRate,
  double lookaheadEnabled,
  double amplitude
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) {
    const double x = safe(left);
    const double y = safe(right);
    return 0.5 * (x + y);
  }
  State& st = gPool[handle - 1];
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double inGain = db_to_lin(safe(inputGainDb));
  const double lIn = safe(left) * inGain;
  const double rIn = safe(right) * inGain;

  const bool laOn = safe(lookaheadEnabled) > 0.5;
  const double laFromMs = laOn ? maxd(0.0, safe(lookaheadMs)) * 0.001 * rate : 0.0;
  const double laFromSamples = laOn ? maxd(0.0, safe(lookaheadSamples)) : 0.0;
  int la = (int)(laFromMs + laFromSamples + 0.5);
  if (la < 0) la = 0;
  if (la > st.cap - 1) la = st.cap - 1;

  const double detectPeak = hasSidechain
    ? dsp_fabs(safe(sidechain))
    : maxd(dsp_fabs(lIn), dsp_fabs(rIn));
  const double instantPower = detectPeak * detectPeak;
  const double attMs = maxd(0.0, safe(attackMs));
  double relMs = safe(releaseMs);
  if (!(relMs * 0.0 == 0.0)) relMs = 250.0;
  if (relMs < 1.0) relMs = 1.0;
  const double attCoeff = attMs <= 0.0 ? 1.0 : 1.0 - dsp_exp(-1.0 / maxd(1.0, attMs * 0.001 * rate));
  const double relCoeff = 1.0 - dsp_exp(-1.0 / maxd(1.0, relMs * 0.001 * rate));

  if (instantPower > st.meanSquare) {
    st.meanSquare += attCoeff * (instantPower - st.meanSquare);
  } else {
    st.meanSquare += relCoeff * (instantPower - st.meanSquare);
  }
  if (st.meanSquare < 1e-30) st.meanSquare = 0.0;
  const double env = st.meanSquare > 0.0 ? dsp_exp(0.5 * dsp_ln(st.meanSquare)) : 0.0;
  st.env = env;

  double thresh = db_to_lin(safe(thresholdDb));
  if (thresh < 1e-6) thresh = 1e-6;
  double r = safe(ratio);
  if (!(r * 0.0 == 0.0) || r < 1.0) r = 8.0;
  if (r > 100.0) r = 100.0;

  double targetGain = 1.0;
  if (env > thresh) {
    const double grExp = (r - 1.0) / r;
    const double ratioLin = thresh / env;
    targetGain = ratioLin > 0.0 ? dsp_exp(grExp * dsp_ln(ratioLin)) : 0.0;
  }
  if (!(targetGain * 0.0 == 0.0) || targetGain < 0.0) targetGain = 0.0;
  if (targetGain > 1.0) targetGain = 1.0;

  if (targetGain < st.gain) st.gain += attCoeff * (targetGain - st.gain);
  else st.gain += relCoeff * (targetGain - st.gain);
  if (!(st.gain * 0.0 == 0.0) || st.gain < 0.0) st.gain = 0.0;
  if (st.gain > 1.0) st.gain = 1.0;

  const int pos = st.pos;
  st.delayL[pos] = (float)lIn;
  st.delayR[pos] = (float)rIn;
  int readPos = pos - la;
  const int cap = st.cap;
  readPos %= cap;
  if (readPos < 0) readPos += cap;
  double dL = (double)st.delayL[readPos];
  double dR = (double)st.delayR[readPos];
  st.pos = (pos + 1) % cap;

  double amp = safe(amplitude);
  if (!(amp * 0.0 == 0.0) || amp < 0.0) amp = 1.0;
  const double g = st.gain;
  dL *= g * amp;
  dR *= g * amp;
  if (!(dL * 0.0 == 0.0)) dL = 0.0;
  if (!(dR * 0.0 == 0.0)) dR = 0.0;

  st.lastLeft = dL;
  st.lastRight = dR;
  st.lastGain = g;
  st.lastEnv = env > 1.0 ? 1.0 : env;
  st.lastOut = 0.5 * (dL + dR);
  return st.lastOut;
}

extern "C" double soemdsp_pumping_limiter_left(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].lastLeft;
}

extern "C" double soemdsp_pumping_limiter_right(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].lastRight;
}

extern "C" double soemdsp_pumping_limiter_gain(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 1.0;
  return gPool[handle - 1].lastGain;
}

extern "C" double soemdsp_pumping_limiter_env(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].lastEnv;
}

extern "C" int soemdsp_pumping_limiter_version() { return 1; }
extern "C" const char* soemdsp_pumping_limiter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_pumping_limiter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
