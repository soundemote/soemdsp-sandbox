// soemdsp-native-module: step_graph
// soemdsp-native-label: Step Graph
// soemdsp-native-target: stepGraph
// soemdsp-native-kind: modulator
//
// Per-segment curve evaluator for Step Graph (NOT sandbox_native_maths/graph.h).
// Ports graphSegmentValue shapes from node-live-audio-worklet-graph.js.
// Drive (Input/LFO/Phasor) lives in graph_engine process_step_graph.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxPoints = 32;

enum SegShape {
  kShapeLinear = 0,
  kShapeRational = 1,
  kShapeExponential = 2,
  kShapeLog = 3,
  kShapeSmoothstep = 4,
  kShapeHold = 5,
};

struct Point {
  float x;
  float y;
  float c;
  float shape; // float-stored enum for SoA upload symmetry
};

struct State {
  bool active;
  Point points[kMaxPoints];
  int count;
};

static State gPool[kMaxInstances];
static float gSoaX[kMaxInstances][kMaxPoints];
static float gSoaY[kMaxInstances][kMaxPoints];
static float gSoaC[kMaxInstances][kMaxPoints];
static float gSoaShape[kMaxInstances][kMaxPoints];

static int normalize_shape(double shapeV) {
  int s = (int)(safe(shapeV) + (safe(shapeV) >= 0.0 ? 0.5 : -0.5));
  if (s < 0) s = 0;
  if (s > 5) s = 5;
  return s;
}

static void ensure_sorted(State& st) {
  for (int i = 1; i < st.count; i++) {
    Point key = st.points[i];
    int j = i - 1;
    while (j >= 0 && st.points[j].x > key.x) {
      st.points[j + 1] = st.points[j];
      j -= 1;
    }
    st.points[j + 1] = key;
  }
}

static void ensure_default_ramp(State& st) {
  if (st.count >= 2) return;
  st.points[0] = { 0.0f, 0.0f, 0.0f, (float)kShapeLinear };
  st.points[1] = { 1.0f, 1.0f, 0.0f, (float)kShapeRational };
  st.count = 2;
}

static double hard_step(double p, double contourSign) {
  if (contourSign >= 0.0) return p <= 0.0 ? 0.0 : 1.0;
  return p >= 1.0 ? 1.0 : 0.0;
}

static double blend_hard_step(double p, double contour, double continuous) {
  const double a = dsp_fabs(contour);
  if (a < 1.0e-9) return continuous;
  if (a >= 1.0 - 1.0e-12) return hard_step(p, contour);
  const double hard = hard_step(p, contour);
  const double cont = continuous * 0.0 == 0.0 ? continuous : p;
  return cont * (1.0 - a) + hard * a;
}

static double rational_curve(double p, double contour) {
  double continuous = p;
  if (dsp_fabs(contour) >= 1.0e-6) {
    const double cSafe = clamp(contour, -0.999999, 0.999999);
    continuous = cSafe < 0.0
      ? (p * (1.0 + cSafe)) / (1.0 + cSafe * p)
      : p / (1.0 - cSafe + cSafe * p);
  }
  return blend_hard_step(p, contour, continuous);
}

static double exponential_curve(double p, double contour) {
  double continuous = p;
  if (dsp_fabs(contour) >= 1.0e-6) {
    const double a = mind(0.999999, dsp_fabs(contour));
    const double mag = 1.2 + 6.8 * (a / (1.0 - a * 0.85));
    const double k = contour < 0.0 ? -mag : mag;
    if (dsp_fabs(k) >= 0.05) {
      const double denom = dsp_exp(k) - 1.0;
      if (dsp_fabs(denom) >= 1.0e-9) {
        continuous = (dsp_exp(k * p) - 1.0) / denom;
      }
    }
  }
  return blend_hard_step(p, contour, continuous);
}

static double logarithmic_curve(double p, double contour) {
  double continuous = p;
  if (dsp_fabs(contour) >= 1.0e-6) {
    const double a = mind(0.999999, dsp_fabs(contour));
    const double b = dsp_exp(1.2 + 5.5 * (a / (1.0 - a * 0.85)));
    if (b * 0.0 == 0.0 && b > 1.000001) {
      const double denom = dsp_ln(b);
      if (denom * 0.0 == 0.0 && dsp_fabs(denom) >= 1.0e-9) {
        continuous = contour < 0.0
          ? 1.0 - dsp_ln(1.0 + (1.0 - p) * (b - 1.0)) / denom
          : dsp_ln(1.0 + p * (b - 1.0)) / denom;
      }
    }
  }
  return blend_hard_step(p, contour, continuous);
}

static double smoothstep_curve(double p) {
  return p * p * (3.0 - 2.0 * p);
}

static double segment_value(
  const State& st,
  double x,
  int index,
  int globalShape,
  double curveOffset
) {
  const Point& left = st.points[index];
  const Point& right = st.points[index + 1];
  const double dx = (double)right.x - (double)left.x;
  if (dsp_fabs(dx) < 1.0e-6) return 0.5 * ((double)left.y + (double)right.y);
  const double p = clamp((x - (double)left.x) / dx, 0.0, 1.0);
  const double offset = clamp(safe(curveOffset), -1.0, 1.0);
  const double contour = clamp(safe((double)right.c) + offset, -1.0, 1.0);
  // Global Shape param always wins (matches graphSegmentOptionsForNode).
  const int shape = globalShape;

  double shaped = p;
  if (shape == kShapeExponential) {
    shaped = exponential_curve(p, contour);
  } else if (shape == kShapeLog) {
    shaped = logarithmic_curve(p, contour);
  } else if (shape == kShapeHold) {
    shaped = p >= 1.0 ? 1.0 : 0.0;
  } else if (shape == kShapeSmoothstep) {
    shaped = smoothstep_curve(p);
  } else if (shape == kShapeLinear) {
    shaped = p;
  } else {
    shaped = rational_curve(p, contour);
  }
  return (double)left.y + ((double)right.y - (double)left.y) * shaped;
}

static double eval_at(const State& st, double x, int shape, double curveOffset) {
  if (st.count < 1) return 0.0;
  if (x < (double)st.points[0].x) return (double)st.points[0].y;
  if (x > (double)st.points[st.count - 1].x) {
    return (double)st.points[st.count - 1].y;
  }
  for (int i = 0; i < st.count - 1; i++) {
    if (x <= (double)st.points[i + 1].x) {
      return safe(segment_value(st, x, i, shape, curveOffset));
    }
  }
  return (double)st.points[st.count - 1].y;
}

}  // namespace

extern "C" int soemdsp_step_graph_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.count = 0;
      ensure_default_ramp(s);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_step_graph_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" int soemdsp_step_graph_max_points() {
  return kMaxPoints;
}

extern "C" int soemdsp_step_graph_points_x_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gSoaX[handle - 1];
}

extern "C" int soemdsp_step_graph_points_y_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gSoaY[handle - 1];
}

extern "C" int soemdsp_step_graph_points_c_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gSoaC[handle - 1];
}

extern "C" int soemdsp_step_graph_points_shape_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gSoaShape[handle - 1];
}

extern "C" int soemdsp_step_graph_set_points(int handle, int count) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  State& s = gPool[handle - 1];
  if (count < 0 || count > kMaxPoints) {
    s.count = 0;
    ensure_default_ramp(s);
    return 0;
  }
  if (count < 2) {
    s.count = 0;
    ensure_default_ramp(s);
    return 1;
  }
  for (int i = 0; i < count; i++) {
    s.points[i].x = gSoaX[handle - 1][i];
    s.points[i].y = gSoaY[handle - 1][i];
    s.points[i].c = gSoaC[handle - 1][i];
    s.points[i].shape = gSoaShape[handle - 1][i];
  }
  s.count = count;
  ensure_sorted(s);
  return 1;
}

extern "C" void soemdsp_step_graph_clear_points(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].count = 0;
  ensure_default_ramp(gPool[handle - 1]);
}

extern "C" double soemdsp_step_graph_sample(
  int handle,
  double x,
  double segmentShape,
  double curveOffset
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  ensure_default_ramp(s);
  return eval_at(s, safe(x), normalize_shape(segmentShape), safe(curveOffset));
}

extern "C" int soemdsp_step_graph_version() {
  return 1;
}
