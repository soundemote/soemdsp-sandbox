// soemdsp-native-module: phone_tone
// soemdsp-native-label: Phone Tone
// soemdsp-native-target: phoneTone
// soemdsp-native-kind: oscillator
//
// ITU-T Q.23 DTMF (12-key). Analog 0–1 and/or Digital 1–12 select keys;
// Gate mutes when connected and low. Robin recursive sines:
// Tone = low+high, ToneL = low, ToneR = high. Matches phone-tone-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"phone_tone\","
    "\"label\":\"Phone Tone\","
    "\"targetType\":\"phoneTone\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Tone\",\"ToneL\",\"ToneR\",\"ƒ1\",\"ƒ2\",\"Analog Thru\",\"Digital Thru\"],"
    "\"parameters\":["
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"pitchOffset\",\"label\":\"Pitch Offset\",\"defaultValue\":0,\"min\":-4,\"mid\":0,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"freqOffset\",\"label\":\"Frequency Offset\",\"defaultValue\":0,\"min\":-2000,\"mid\":0,\"max\":2000,\"step\":\"any\",\"unit\":\"Hz\"}"
    "]"
  "}";

constexpr int kMaxInstances = 32;
constexpr int kKeyCount = 12;
constexpr int kRenormInterval = 64;
constexpr double kOmegaEps = 1.0e-12;
constexpr double kHzCap = 20000.0;

// Low × high DTMF pairs (same order as JS NODE_GRAPH_PHONE_TONE_PAIRS).
static const double kPairs[kKeyCount][2] = {
  {697.0, 1209.0}, {697.0, 1336.0}, {697.0, 1477.0},
  {770.0, 1209.0}, {770.0, 1336.0}, {770.0, 1477.0},
  {852.0, 1209.0}, {852.0, 1336.0}, {852.0, 1477.0},
  {941.0, 1209.0}, {941.0, 1336.0}, {941.0, 1477.0},
};

struct RobinVoice {
  bool primed;
  double x;
  double y;
  double cosW;
  double sinW;
  double omega;
  int renormCounter;
};

struct PhoneToneState {
  bool active;
  RobinVoice analogLow;
  RobinVoice analogHigh;
  RobinVoice digitalLow;
  RobinVoice digitalHigh;
  double lastTone;
  double lastToneL;
  double lastToneR;
  double lastF1;
  double lastF2;
  double lastAnalogThru;
  double lastDigitalThru;
};

PhoneToneState gPool[kMaxInstances];

bool finiteValue(double value) {
  return value == value && value > -1.0e12 && value < 1.0e12;
}

double wrapOmega(double omega) {
  if (omega <= kPi && omega >= -kPi) {
    return omega;
  }
  double wrapped = omega + kPi;
  wrapped = wrapped - kTwoPi * dsp_floor(wrapped / kTwoPi);
  if (wrapped < 0.0) {
    wrapped += kTwoPi;
  }
  return wrapped - kPi;
}

void primeVoice(RobinVoice& voice, double omega, double phase) {
  voice.omega = omega;
  voice.cosW = dsp_cos(omega);
  voice.sinW = dsp_sin(omega);
  voice.x = dsp_cos(phase);
  voice.y = dsp_sin(phase);
  voice.primed = true;
  voice.renormCounter = 0;
}

void clearVoice(RobinVoice& voice) {
  voice.primed = false;
  voice.x = 1.0;
  voice.y = 0.0;
  voice.cosW = 1.0;
  voice.sinW = 0.0;
  voice.omega = 0.0;
  voice.renormCounter = 0;
}

double robinSample(RobinVoice& voice, double frequencyHz, double amplitude, double sampleRate) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double freq = finiteValue(frequencyHz) ? frequencyHz : 0.0;
  double omega = wrapOmega((kTwoPi * freq) / rate);
  const double amp = finiteValue(amplitude) ? amplitude : 0.0;

  if (!voice.primed) {
    primeVoice(voice, omega, 0.0);
  } else if (omega - voice.omega > kOmegaEps || voice.omega - omega > kOmegaEps) {
    voice.omega = omega;
    voice.cosW = dsp_cos(omega);
    voice.sinW = dsp_sin(omega);
  }

  const double x0 = voice.x;
  const double y0 = voice.y;
  double x1 = x0 * voice.cosW - y0 * voice.sinW;
  double y1 = x0 * voice.sinW + y0 * voice.cosW;

  if (!finiteValue(x1) || !finiteValue(y1)) {
    primeVoice(voice, omega, 0.0);
    return 0.0;
  }

  voice.renormCounter += 1;
  if (voice.renormCounter >= kRenormInterval) {
    voice.renormCounter = 0;
    const double mag2 = x1 * x1 + y1 * y1;
    if (mag2 > 1.00001 || mag2 < 0.99999) {
      if (mag2 > 1.0e-20) {
        const double inv = 1.0 / __builtin_sqrt(mag2);
        x1 *= inv;
        y1 *= inv;
      } else {
        primeVoice(voice, omega, 0.0);
        return 0.0;
      }
    }
  }

  voice.x = x1;
  voice.y = y1;
  return y1 * amp;
}

int wrapKey(int raw) {
  int n = ((raw % kKeyCount) + kKeyCount) % kKeyCount;
  return n;
}

// Returns -1 when idle.
int analogSlot(double analog) {
  const double unit = analog < 0.0 ? 0.0 : (analog > 1.0 ? 1.0 : analog);
  if (!(unit > 0.0)) {
    return -1;
  }
  int slot = (int)dsp_floor(unit * (double)kKeyCount - 1.0e-9);
  if (slot < 0) slot = 0;
  if (slot > kKeyCount - 1) slot = kKeyCount - 1;
  return slot;
}

int digitalSlot(double digital) {
  const int value = (int)(digital >= 0.0 ? digital + 0.5 : digital - 0.5);
  if (value <= 0) {
    return -1;
  }
  return wrapKey(value - 1);
}

double octaveRatio(double pitchOffsetOctaves) {
  if (!finiteValue(pitchOffsetOctaves) || pitchOffsetOctaves == 0.0) {
    return 1.0;
  }
  const double ratio = dsp_exp2(pitchOffsetOctaves);
  return (finiteValue(ratio) && ratio > 0.0) ? ratio : 1.0;
}

double pitchCvRatio(int hasPitchCv, double pitchCv, double referenceVoltage) {
  if (!hasPitchCv) {
    return 1.0;
  }
  const double cv = finiteValue(pitchCv) ? pitchCv : 0.0;
  const double ref = finiteValue(referenceVoltage) ? referenceVoltage : 0.0;
  const double ratio = dsp_exp2((cv - ref) / 0.1);
  return (finiteValue(ratio) && ratio > 0.0) ? ratio : 1.0;
}

double clampHz(double hz) {
  if (!finiteValue(hz)) {
    return 0.0;
  }
  if (hz > kHzCap) return kHzCap;
  if (hz < -kHzCap) return -kHzCap;
  return hz;
}

double pitchedHz(double baseHz, double pitchOff, double freqOffset, double cvRatio) {
  const double table = finiteValue(baseHz) ? baseHz : 0.0;
  const double cv = (finiteValue(cvRatio) && cvRatio > 0.0) ? cvRatio : 1.0;
  const double add = finiteValue(freqOffset) ? freqOffset : 0.0;
  return clampHz(table * octaveRatio(pitchOff) * cv + add);
}

PhoneToneState* stateForHandle(int handle) {
  if (handle <= 0 || handle > kMaxInstances) {
    return nullptr;
  }
  PhoneToneState& state = gPool[handle - 1];
  return state.active ? &state : nullptr;
}

}  // namespace

extern "C" int soemdsp_phone_tone_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      PhoneToneState& s = gPool[i];
      s.active = true;
      clearVoice(s.analogLow);
      clearVoice(s.analogHigh);
      clearVoice(s.digitalLow);
      clearVoice(s.digitalHigh);
      s.lastTone = 0.0;
      s.lastToneL = 0.0;
      s.lastToneR = 0.0;
      s.lastF1 = 0.0;
      s.lastF2 = 0.0;
      s.lastAnalogThru = 0.0;
      s.lastDigitalThru = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_phone_tone_destroy(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  state->active = false;
  clearVoice(state->analogLow);
  clearVoice(state->analogHigh);
  clearVoice(state->digitalLow);
  clearVoice(state->digitalHigh);
}

extern "C" double soemdsp_phone_tone_sample(
  int handle,
  double sampleRate,
  double amplitude,
  double pitchOffsetOctaves,
  double freqOffsetHz,
  double pitchCv,
  double hasPitchCv,
  double analog,
  double hasAnalog,
  double digital,
  double hasDigital,
  double gate,
  double hasGate,
  double referenceVoltage
) {
  PhoneToneState* state = stateForHandle(handle);
  if (!state) {
    return 0.0;
  }

  const int useAnalog = hasAnalog > 0.5 ? 1 : 0;
  const int useDigital = hasDigital > 0.5 ? 1 : 0;
  const int useGate = hasGate > 0.5 ? 1 : 0;
  const int gateOpen = (!useGate || gate >= 0.5) ? 1 : 0;
  const double amp = finiteValue(amplitude) ? amplitude : 0.0;
  const double pitchOff = finiteValue(pitchOffsetOctaves) ? pitchOffsetOctaves : 0.0;
  const double freqOff = finiteValue(freqOffsetHz) ? freqOffsetHz : 0.0;
  const double cvRatio = pitchCvRatio(hasPitchCv > 0.5 ? 1 : 0, pitchCv, referenceVoltage);
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;

  const int aSlot = useAnalog ? analogSlot(analog) : -1;
  const int dSlot = useDigital ? digitalSlot(digital) : -1;

  int slotCount = 0;
  if (aSlot >= 0) slotCount += 1;
  if (dSlot >= 0 && dSlot != aSlot) slotCount += 1;
  const double each = slotCount > 0 ? amp / ((double)slotCount * 2.0) : 0.0;

  const int reportSlot = dSlot >= 0 ? dSlot : aSlot;
  if (reportSlot < 0) {
    state->lastF1 = 0.0;
    state->lastF2 = 0.0;
  } else {
    state->lastF1 = pitchedHz(kPairs[reportSlot][0], pitchOff, freqOff, cvRatio);
    state->lastF2 = pitchedHz(kPairs[reportSlot][1], pitchOff, freqOff, cvRatio);
  }

  double low = 0.0;
  double high = 0.0;
  if (aSlot >= 0) {
    const double loHz = pitchedHz(kPairs[aSlot][0], pitchOff, freqOff, cvRatio);
    const double hiHz = pitchedHz(kPairs[aSlot][1], pitchOff, freqOff, cvRatio);
    low += robinSample(state->analogLow, loHz, each, rate);
    high += robinSample(state->analogHigh, hiHz, each, rate);
  } else {
    clearVoice(state->analogLow);
    clearVoice(state->analogHigh);
  }
  if (dSlot >= 0 && dSlot != aSlot) {
    const double loHz = pitchedHz(kPairs[dSlot][0], pitchOff, freqOff, cvRatio);
    const double hiHz = pitchedHz(kPairs[dSlot][1], pitchOff, freqOff, cvRatio);
    low += robinSample(state->digitalLow, loHz, each, rate);
    high += robinSample(state->digitalHigh, hiHz, each, rate);
  } else {
    clearVoice(state->digitalLow);
    clearVoice(state->digitalHigh);
  }

  const double toneL = gateOpen ? low : 0.0;
  const double toneR = gateOpen ? high : 0.0;
  const double tone = toneL + toneR;

  state->lastTone = tone;
  state->lastToneL = toneL;
  state->lastToneR = toneR;
  state->lastAnalogThru = useAnalog ? (finiteValue(analog) ? analog : 0.0) : 0.0;
  state->lastDigitalThru = useDigital ? (finiteValue(digital) ? digital : 0.0) : 0.0;
  return tone;
}

extern "C" double soemdsp_phone_tone_tone(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastTone : 0.0;
}

extern "C" double soemdsp_phone_tone_tone_l(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastToneL : 0.0;
}

extern "C" double soemdsp_phone_tone_tone_r(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastToneR : 0.0;
}

extern "C" double soemdsp_phone_tone_f1(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastF1 : 0.0;
}

extern "C" double soemdsp_phone_tone_f2(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastF2 : 0.0;
}

extern "C" double soemdsp_phone_tone_analog_thru(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastAnalogThru : 0.0;
}

extern "C" double soemdsp_phone_tone_digital_thru(int handle) {
  PhoneToneState* state = stateForHandle(handle);
  return state ? state->lastDigitalThru : 0.0;
}

extern "C" int soemdsp_phone_tone_version() {
  return 1;
}

extern "C" const char* soemdsp_phone_tone_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_phone_tone_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
