// soemdsp-native-module: quadrature
// soemdsp-native-label: Hilbert Pair
// soemdsp-native-target: quadrature
// soemdsp-native-kind: filter
//
// 4-section I/Q allpass pair + 1-sample I delay. Dual nets (side + mid).
// Matches public/modules/quadrature/quadrature-math.js. Not Bode FIR Hilbert.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kSections = 4;

// Published pole radii; sections use radius² as coeff.
static const double kIRadii[kSections] = {
  0.6923877778065,
  0.9360654322959,
  0.9882295226860,
  0.9987488452737,
};
static const double kQRadii[kSections] = {
  0.4021921162426,
  0.8561710882420,
  0.9722909545651,
  0.9952884791278,
};

struct Section {
  double c;
  double x1, x2, y1, y2;
};

struct Net {
  Section iChain[kSections];
  Section qChain[kSections];
  double delayed;
};

struct QuadratureState {
  bool active;
  Net side;
  Net mid;
};

static QuadratureState gPool[kMaxInstances];

static void init_net(Net& net) {
  for (int i = 0; i < kSections; i++) {
    net.iChain[i].c = kIRadii[i] * kIRadii[i];
    net.iChain[i].x1 = 0.0;
    net.iChain[i].x2 = 0.0;
    net.iChain[i].y1 = 0.0;
    net.iChain[i].y2 = 0.0;
    net.qChain[i].c = kQRadii[i] * kQRadii[i];
    net.qChain[i].x1 = 0.0;
    net.qChain[i].x2 = 0.0;
    net.qChain[i].y1 = 0.0;
    net.qChain[i].y2 = 0.0;
  }
  net.delayed = 0.0;
}

static double section_process(Section& sec, double x) {
  double y = sec.c * (x + sec.y2) - sec.x2;
  sec.x2 = sec.x1;
  sec.x1 = x;
  sec.y2 = sec.y1;
  if (y > -1e-25 && y < 1e-25) y = 0.0;
  if (!(y * 0.0 == 0.0)) y = 0.0;
  sec.y1 = y;
  return y;
}

static void net_process(Net& net, double input, double* outI, double* outQ) {
  const double x = safe(input);
  double i = x;
  for (int k = 0; k < kSections; k++) {
    i = section_process(net.iChain[k], i);
  }
  double q = x;
  for (int k = 0; k < kSections; k++) {
    q = section_process(net.qChain[k], q);
  }
  const double alignedI = net.delayed;
  double delayed = i;
  if (delayed > -1e-25 && delayed < 1e-25) delayed = 0.0;
  if (!(delayed * 0.0 == 0.0)) delayed = 0.0;
  net.delayed = delayed;
  if (q > -1e-25 && q < 1e-25) q = 0.0;
  if (!(q * 0.0 == 0.0)) q = 0.0;
  if (outI) *outI = alignedI;
  if (outQ) *outQ = q;
}

}  // namespace

extern "C" int soemdsp_quadrature_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      init_net(gPool[i].side);
      init_net(gPool[i].mid);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_quadrature_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_quadrature_process_sample(
  int handle,
  double in,
  double mid,
  double side,
  double* outI,
  double* outQ,
  double* outMidI,
  double* outSideQ
) {
  if (outI) *outI = 0.0;
  if (outQ) *outQ = 0.0;
  if (outMidI) *outMidI = 0.0;
  if (outSideQ) *outSideQ = 0.0;
  if (handle < 1 || handle > kMaxInstances) return;
  QuadratureState& s = gPool[handle - 1];
  if (!s.active) return;

  const double sideIn = safe(in) + safe(side);
  const double midIn = safe(mid);
  double i = 0.0, q = 0.0, midI = 0.0;
  net_process(s.side, sideIn, &i, &q);
  net_process(s.mid, midIn, &midI, nullptr);
  if (outI) *outI = i;
  if (outQ) *outQ = q;
  if (outMidI) *outMidI = midI;
  if (outSideQ) *outSideQ = q;
}

extern "C" int soemdsp_quadrature_version() {
  return 1;
}
