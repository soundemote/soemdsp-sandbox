// soemdsp-native-module: robin_sinusoid
// soemdsp-native-label: RobinSinusoid
// soemdsp-native-target: robinSinusoid
// soemdsp-native-kind: oscillator
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/generators/rosic_SineOscillator.h
//
// Free-running recursive sine: unit phasor rotated by ω = 2πf/sr.
// Same algorithm as public/modules/robinSinusoid/robin-sinusoid-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"robin_sinusoid\","
    "\"label\":\"RobinSinusoid\","
    "\"targetType\":\"robinSinusoid\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"defaultValue\":440,\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"phase\",\"label\":\"Start Phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"}"
    "]"
  "}";

constexpr int kMaxInstances = 32;
constexpr int kMaxBlockFrames = 2048;
constexpr int kRenormInterval = 64;
constexpr double kOmegaEps = 1.0e-12;

struct RobinSinusoidState {
  bool active;
  bool primed;
  double x;
  double y;
  double cosW;
  double sinW;
  double omega;
  int renormCounter;
  double blockOut[kMaxBlockFrames];
};

RobinSinusoidState gPool[kMaxInstances];

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

void primeState(RobinSinusoidState& state, double omega, double phase) {
  state.omega = omega;
  state.cosW = dsp_cos(omega);
  state.sinW = dsp_sin(omega);
  state.x = dsp_cos(phase);
  state.y = dsp_sin(phase);
  state.primed = true;
  state.renormCounter = 0;
}

double robinSample(
  RobinSinusoidState& state,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseRadians,
  int reset
) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double freq = finiteValue(frequencyHz) ? frequencyHz : 0.0;
  double omega = wrapOmega((kTwoPi * freq) / rate);
  const double amp = finiteValue(amplitude) ? amplitude : 0.0;
  const double phase = finiteValue(startPhaseRadians) ? startPhaseRadians : 0.0;

  if (reset || !state.primed) {
    primeState(state, omega, phase);
  } else if (omega - state.omega > kOmegaEps || state.omega - omega > kOmegaEps) {
    state.omega = omega;
    state.cosW = dsp_cos(omega);
    state.sinW = dsp_sin(omega);
  }

  const double x0 = state.x;
  const double y0 = state.y;
  double x1 = x0 * state.cosW - y0 * state.sinW;
  double y1 = x0 * state.sinW + y0 * state.cosW;

  if (!finiteValue(x1) || !finiteValue(y1)) {
    primeState(state, omega, phase);
    return 0.0;
  }

  state.renormCounter += 1;
  if (state.renormCounter >= kRenormInterval) {
    state.renormCounter = 0;
    const double mag2 = x1 * x1 + y1 * y1;
    if (mag2 > 1.00001 || mag2 < 0.99999) {
      if (mag2 > 1.0e-20) {
        const double inv = 1.0 / __builtin_sqrt(mag2);
        x1 *= inv;
        y1 *= inv;
      } else {
        primeState(state, omega, 0.0);
        return 0.0;
      }
    }
  }

  state.x = x1;
  state.y = y1;
  return y1 * amp;
}

RobinSinusoidState* stateForHandle(int handle) {
  if (handle <= 0 || handle > kMaxInstances) {
    return nullptr;
  }
  RobinSinusoidState& state = gPool[handle - 1];
  return state.active ? &state : nullptr;
}

}  // namespace

extern "C" int soemdsp_robin_sinusoid_create() {
  for (int index = 0; index < kMaxInstances; index += 1) {
    if (!gPool[index].active) {
      gPool[index].active = true;
      gPool[index].primed = false;
      gPool[index].x = 1.0;
      gPool[index].y = 0.0;
      gPool[index].cosW = 1.0;
      gPool[index].sinW = 0.0;
      gPool[index].omega = 0.0;
      gPool[index].renormCounter = 0;
      return index + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_robin_sinusoid_destroy(int handle) {
  RobinSinusoidState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  state->active = false;
  state->primed = false;
}

extern "C" void soemdsp_robin_sinusoid_reset(int handle) {
  RobinSinusoidState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  state->primed = false;
  state->x = 1.0;
  state->y = 0.0;
  state->renormCounter = 0;
}

extern "C" double soemdsp_robin_sinusoid_sample(
  int handle,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseRadians,
  double reset
) {
  RobinSinusoidState* state = stateForHandle(handle);
  if (!state) {
    return 0.0;
  }
  return robinSample(*state, frequencyHz, amplitude, sampleRate, startPhaseRadians, reset > 0.5 ? 1 : 0);
}

extern "C" void soemdsp_robin_sinusoid_process_block(
  int handle,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseRadians,
  double reset,
  int frameCount
) {
  RobinSinusoidState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int frame = 0; frame < safeFrameCount; frame += 1) {
    state->blockOut[frame] = robinSample(
      *state,
      frequencyHz,
      amplitude,
      sampleRate,
      startPhaseRadians,
      (reset > 0.5 && frame == 0) ? 1 : 0
    );
  }
}

extern "C" int soemdsp_robin_sinusoid_block_output_ptr(int handle) {
  RobinSinusoidState* state = stateForHandle(handle);
  return state ? reinterpret_cast<int>(state->blockOut) : 0;
}

extern "C" int soemdsp_robin_sinusoid_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_robin_sinusoid_version() {
  return 1;
}

extern "C" const char* soemdsp_robin_sinusoid_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_robin_sinusoid_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
