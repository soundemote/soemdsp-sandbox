// soemdsp-native-module: lookahead_limiter
// soemdsp-native-label: Limiter
// soemdsp-native-target: lookaheadLimiter
// soemdsp-native-kind: dynamics
//
// Matches public/modules/lookaheadLimiter/lookahead-limiter-math.js.
// Control coeffs (db→gain, attack/release exp) rebuild only when inputs change.

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
  double env;
  double lastOut;
  double lastLeft;
  double lastRight;
  double lastGain;

  // Cached control inputs / derived coeffs (selective update).
  double lastCeilingDb;
  double lastAttackMs;
  double lastReleaseMs;
  double lastSampleRate;
  double lastLookaheadMs;
  double lastLookaheadSamples;
  double lastLookaheadEnabled;
  double lastDipGain;
  bool controlsValid;

  double ceiling;
  double makeup;
  double attCoeff;
  double relCoeff;
  int lookaheadSamplesResolved;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"lookahead_limiter\","
    "\"label\":\"Limiter\","
    "\"targetType\":\"lookaheadLimiter\","
    "\"kind\":\"dynamics\""
  "}";

static void sync_controls(
  State& st,
  double ceilingDb,
  double lookaheadMs,
  double lookaheadSamples,
  double attackMs,
  double releaseMs,
  double sampleRate,
  double lookaheadEnabled,
  double dipGain
) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double attMs = maxd(0.0, safe(attackMs));
  double relMs = safe(releaseMs);
  if (!(relMs * 0.0 == 0.0)) relMs = 100.0;
  if (relMs < 0.0) relMs = 0.0;
  const double ceilDb = safe(ceilingDb);
  const double laMs = safe(lookaheadMs);
  const double laSamp = safe(lookaheadSamples);
  const double laEn = safe(lookaheadEnabled);
  const double dip = safe(dipGain);

  const bool dirty =
    !st.controlsValid
    || ceilDb != st.lastCeilingDb
    || attMs != st.lastAttackMs
    || relMs != st.lastReleaseMs
    || rate != st.lastSampleRate
    || laMs != st.lastLookaheadMs
    || laSamp != st.lastLookaheadSamples
    || laEn != st.lastLookaheadEnabled
    || dip != st.lastDipGain;

  if (!dirty) return;

  st.lastCeilingDb = ceilDb;
  st.lastAttackMs = attMs;
  st.lastReleaseMs = relMs;
  st.lastSampleRate = rate;
  st.lastLookaheadMs = laMs;
  st.lastLookaheadSamples = laSamp;
  st.lastLookaheadEnabled = laEn;
  st.lastDipGain = dip;
  st.controlsValid = true;

  st.ceiling = db_to_lin(ceilDb);
  if (st.ceiling < 1e-6) st.ceiling = 1e-6;
  st.makeup = 1.0 / st.ceiling;

  st.attCoeff = attMs <= 0.0 ? 1.0 : 1.0 - dsp_exp(-1.0 / maxd(1.0, attMs * 0.001 * rate));
  st.relCoeff = relMs <= 0.0 ? 1.0 : 1.0 - dsp_exp(-1.0 / maxd(1.0, relMs * 0.001 * rate));

  const bool laOn = laEn > 0.5;
  const double laFromMs = laOn ? maxd(0.0, laMs) * 0.001 * rate : 0.0;
  const double laFromSamples = laOn ? maxd(0.0, laSamp) : 0.0;
  int la = (int)(laFromMs + laFromSamples + 0.5);
  if (la < 0) la = 0;
  if (la > st.cap - 1) la = st.cap - 1;
  st.lookaheadSamplesResolved = la;
}

}  // namespace

extern "C" int soemdsp_lookahead_limiter_create() {
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
      s.env = 0.0;
      s.lastOut = 0.0;
      s.lastLeft = 0.0;
      s.lastRight = 0.0;
      s.lastGain = 1.0;
      s.controlsValid = false;
      s.ceiling = 1.0;
      s.makeup = 1.0;
      s.attCoeff = 1.0;
      s.relCoeff = 1.0;
      s.lookaheadSamplesResolved = 0;
      s.lastDipGain = 1.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_lookahead_limiter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_lookahead_limiter_sample(
  int handle,
  double left,
  double right,
  double ceilingDb,
  double lookaheadMs,
  double lookaheadSamples,
  double attackMs,
  double releaseMs,
  double sampleRate,
  double lookaheadEnabled,
  double gainCompensation,
  double dipGain
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) {
    const double x = safe(left);
    const double y = safe(right);
    return 0.5 * (x + y);
  }
  State& st = gPool[handle - 1];
  sync_controls(
    st,
    ceilingDb,
    lookaheadMs,
    lookaheadSamples,
    attackMs,
    releaseMs,
    sampleRate,
    lookaheadEnabled,
    dipGain);

  const double lIn = safe(left);
  const double rIn = safe(right);
  const double ceiling = st.ceiling;
  const int la = st.lookaheadSamplesResolved;
  const double attCoeff = st.attCoeff;
  const double relCoeff = st.relCoeff;

  const double peak = maxd(dsp_fabs(lIn), dsp_fabs(rIn));
  if (peak > st.env) st.env += attCoeff * (peak - st.env);
  else st.env += relCoeff * (peak - st.env);
  if (st.env < 1e-25) st.env = 0.0;

  double targetGain = 1.0;
  if (st.env > ceiling) {
    targetGain = ceiling / st.env;
    const double dip = st.lastDipGain;
    if (dip != 1.0 && targetGain < 1.0) {
      targetGain = dsp_exp(dip * dsp_ln(targetGain));
    }
  }
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

  const double g = st.gain;
  dL *= g;
  dR *= g;
  if (dL > ceiling) dL = ceiling;
  else if (dL < -ceiling) dL = -ceiling;
  if (dR > ceiling) dR = ceiling;
  else if (dR < -ceiling) dR = -ceiling;
  if (gainCompensation > 0.5) {
    dL *= st.makeup;
    dR *= st.makeup;
  }
  if (!(dL * 0.0 == 0.0)) dL = 0.0;
  if (!(dR * 0.0 == 0.0)) dR = 0.0;
  st.lastLeft = dL;
  st.lastRight = dR;
  st.lastGain = g;
  st.lastOut = 0.5 * (dL + dR);
  return st.lastOut;
}

extern "C" double soemdsp_lookahead_limiter_left(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].lastLeft;
}

extern "C" double soemdsp_lookahead_limiter_right(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].lastRight;
}

extern "C" double soemdsp_lookahead_limiter_gain(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 1.0;
  return gPool[handle - 1].lastGain;
}

extern "C" int soemdsp_lookahead_limiter_version() { return 2; }
extern "C" const char* soemdsp_lookahead_limiter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_lookahead_limiter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
