// soemdsp-native-module: min_max
// soemdsp-native-label: Min/Max
// soemdsp-native-target: minMax
// soemdsp-native-kind: utility
//
// Port of the Doepfer A-172 Maximum/Minimum Selector: 4 unlabeled inputs,
// two continuous outputs -- Max is the highest of whatever inputs are
// patched, Min is the lowest. Purely instantaneous voltage comparison, no
// gate/trigger logic and no persistent state beyond caching Min so the
// accessor after _sample() (which returns Max) can retrieve it, following
// this codebase's established multi-output native module pattern.
//
// The real module's manual says unused inputs must be left open (floating),
// not grounded -- grounding an unused input would silently bias the result
// toward 0. This port honors that: the caller passes a connectedMask bit
// per input, and only the bits that are set participate in the comparison.
// With no inputs connected, both outputs are 0.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct MinMaxState {
  bool active;
  double lastMin;
};

static MinMaxState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_min_max_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].lastMin = 0.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_min_max_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_min_max_sample(
  int    handle,
  double in1,
  double in2,
  double in3,
  double in4,
  int    connectedMask
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  MinMaxState& s = gPool[handle - 1];

  const double values[4] = { safe(in1), safe(in2), safe(in3), safe(in4) };

  bool have = false;
  double lo = 0.0;
  double hi = 0.0;
  for (int i = 0; i < 4; i++) {
    if ((connectedMask & (1 << i)) == 0) continue;
    if (!have) {
      lo = values[i];
      hi = values[i];
      have = true;
    } else {
      lo = mind(lo, values[i]);
      hi = maxd(hi, values[i]);
    }
  }

  s.lastMin = have ? lo : 0.0;
  return have ? hi : 0.0;
}

extern "C" double soemdsp_min_max_min(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastMin;
}

extern "C" int soemdsp_min_max_version() {
  return 1;
}
