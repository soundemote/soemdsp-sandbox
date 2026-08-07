// soemdsp-native-module: butterworth
// soemdsp-native-label: Butterworth Filter
// soemdsp-native-target: butterworth
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET
//
// Classical Butterworth multipole (maximally flat passband). Shared cascade
// in sandbox_native_maths/scientific_iir.h (RBJ SOS, freestanding).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;
using namespace soemdsp_maths::scientific_iir;

static const int kMaxInstances = 64;

struct State {
  Cascade cascade;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"butterworth\","
    "\"label\":\"Butterworth Filter\","
    "\"targetType\":\"butterworth\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"mode\",\"label\":\"Mode\",\"defaultValue\":0,\"min\":0,\"mid\":1,\"max\":3,\"step\":1,"
        "\"choices\":[\"LP\",\"HP\",\"BP\",\"BR\"]},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":1000,"
        "\"min\":0,\"mid\":1000,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"order\",\"label\":\"Order\",\"defaultValue\":4,\"min\":2,\"mid\":4,\"max\":8,\"step\":2},"
      "{\"key\":\"bandwidth\",\"label\":\"Bandwidth\",\"defaultValue\":1,\"min\":0.05,\"mid\":1,\"max\":4,"
        "\"step\":\"any\",\"unit\":\"oct\"}"
    "]"
  "}";

}  // namespace

extern "C" int soemdsp_butterworth_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      cascade_init(&gPool[i].cascade);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_butterworth_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_butterworth_sample(
  int handle,
  double input,
  int mode,
  double frequencyHz,
  int order,
  double bandwidthOct,
  double rippleDb,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const int m = mode < 0 ? 0 : (mode > 3 ? 3 : mode);
  cascade_ensure(
    &s.cascade,
    kButterworth,
    m,
    order,
    frequencyHz < 0.0 ? 0.0 : frequencyHz,
    bandwidthOct < 0.05 ? 0.05 : bandwidthOct,
    rippleDb < 0.01 ? 0.01 : rippleDb,
    rate
  );
  (void)rippleDb;
  return cascade_process(&s.cascade, safe(input));
}

extern "C" int soemdsp_butterworth_version() { return 1; }
extern "C" const char* soemdsp_butterworth_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_butterworth_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
