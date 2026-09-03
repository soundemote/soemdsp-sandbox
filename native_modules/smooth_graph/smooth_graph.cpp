// soemdsp-native-module: smooth_graph
// soemdsp-native-label: Smooth Graph
// soemdsp-native-target: smoothGraph
// soemdsp-native-kind: modulator
//
// Curve evaluator for Smooth Graph (NOT sandbox_native_maths/graph.h).
// Ports graphValueAt / guide-tension bezier / Lagrange from
// node-live-audio-worklet-graph.js. Drive (Input/LFO/Phasor) lives in
// graph_engine process_smooth_graph.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxPoints = 32;
static const int kBezierSamples = 96;

enum SmoothMode {
  kModeLinear = 0,
  kModeCatmull = 1, // guide-tension bezier (JS "catmull")
  kModeQuadratic = 2,
  kModeCubic = 3,
};

struct Point {
  float x;
  float y;
};

struct State {
  bool active;
  Point points[kMaxPoints];
  int count;
};

static State gPool[kMaxInstances];

static int normalize_mode(double modeV) {
  int m = (int)(safe(modeV) + (safe(modeV) >= 0.0 ? 0.5 : -0.5));
  if (m < 0) m = 0;
  if (m > 3) m = 3;
  return m;
}

static void ensure_sorted(State& s) {
  // Insertion sort by x (count ≤ 32).
  for (int i = 1; i < s.count; i++) {
    Point key = s.points[i];
    int j = i - 1;
    while (j >= 0 && s.points[j].x > key.x) {
      s.points[j + 1] = s.points[j];
      j -= 1;
    }
    s.points[j + 1] = key;
  }
}

static void ensure_default_ramp(State& s) {
  if (s.count >= 2) return;
  s.points[0].x = 0.0f;
  s.points[0].y = 0.0f;
  s.points[1].x = 1.0f;
  s.points[1].y = 1.0f;
  s.count = 2;
}

static double polyline_at(const State& s, double x) {
  if (s.count < 1) return 0.0;
  if (s.count < 2 || x <= (double)s.points[0].x) return (double)s.points[0].y;
  const Point& last = s.points[s.count - 1];
  if (x >= (double)last.x) return (double)last.y;
  for (int i = 0; i < s.count - 1; i++) {
    if (x <= (double)s.points[i + 1].x) {
      const double x0 = (double)s.points[i].x;
      const double x1 = (double)s.points[i + 1].x;
      const double y0 = (double)s.points[i].y;
      const double y1 = (double)s.points[i + 1].y;
      const double dx = x1 - x0;
      if (dsp_fabs(dx) < 1.0e-6) return 0.5 * (y0 + y1);
      const double t = (x - x0) / dx;
      return y0 + (y1 - y0) * t;
    }
  }
  return (double)last.y;
}

static void bezier_point_at(
  const Point* controls, int n, double t, double* ox, double* oy
) {
  if (n < 1) {
    *ox = 0.0;
    *oy = 0.0;
    return;
  }
  // De Casteljau into a small stack buffer (n ≤ 32).
  double xs[kMaxPoints];
  double ys[kMaxPoints];
  for (int i = 0; i < n; i++) {
    xs[i] = (double)controls[i].x;
    ys[i] = (double)controls[i].y;
  }
  int len = n;
  while (len > 1) {
    for (int i = 0; i < len - 1; i++) {
      xs[i] = xs[i] + (xs[i + 1] - xs[i]) * t;
      ys[i] = ys[i] + (ys[i + 1] - ys[i]) * t;
    }
    len -= 1;
  }
  *ox = xs[0];
  *oy = ys[0];
}

static void guide_controls(const State& s, double tension, Point* out, int* outN) {
  const int count = s.count;
  if (count < 2) {
    *outN = count;
    for (int i = 0; i < count; i++) out[i] = s.points[i];
    return;
  }
  const double u = clamp(safe(tension), 0.0, 1.0);
  if (u <= 1.0e-6) {
    out[0] = s.points[0];
    out[1] = s.points[count - 1];
    *outN = 2;
    return;
  }
  const double pull = 0.08 + 1.42 * dsp_exp(dsp_ln(u) * 0.6); // u^0.6
  const Point first = s.points[0];
  const Point last = s.points[count - 1];
  for (int i = 0; i < count; i++) {
    if (i == 0 || i == count - 1) {
      out[i] = s.points[i];
      continue;
    }
    const double sNorm = (double)i / (double)(count - 1);
    const double chordX = (double)first.x + ((double)last.x - (double)first.x) * sNorm;
    const double chordY = (double)first.y + ((double)last.y - (double)first.y) * sNorm;
    out[i].x = (float)(chordX + ((double)s.points[i].x - chordX) * pull);
    out[i].y = (float)(chordY + ((double)s.points[i].y - chordY) * pull);
  }
  *outN = count;
}

static double guide_bezier_at(const State& s, double x, double tension) {
  if (s.count < 2) return s.count ? (double)s.points[0].y : 0.0;
  if (x <= (double)s.points[0].x) return (double)s.points[0].y;
  const Point& last = s.points[s.count - 1];
  if (x >= (double)last.x) return (double)last.y;

  Point controls[kMaxPoints];
  int nCtrl = 0;
  guide_controls(s, tension, controls, &nCtrl);

  double prevX = 0.0, prevY = 0.0;
  bezier_point_at(controls, nCtrl, 0.0, &prevX, &prevY);
  for (int i = 1; i <= kBezierSamples; i++) {
    double px = 0.0, py = 0.0;
    bezier_point_at(controls, nCtrl, (double)i / (double)kBezierSamples, &px, &py);
    const double minX = prevX < px ? prevX : px;
    const double maxX = prevX > px ? prevX : px;
    if (x >= minX && x <= maxX) {
      const double dx = px - prevX;
      const double a = dsp_fabs(dx) < 1.0e-12 ? 0.0 : (x - prevX) / dx;
      return safe(prevY + (py - prevY) * a);
    }
    prevX = px;
    prevY = py;
  }

  double bestY = (double)s.points[0].y;
  double bestDist = 1.0e300;
  for (int i = 0; i <= kBezierSamples; i++) {
    double px = 0.0, py = 0.0;
    bezier_point_at(controls, nCtrl, (double)i / (double)kBezierSamples, &px, &py);
    const double dist = dsp_fabs(px - x);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = py;
    }
  }
  return safe(bestY);
}

static int lagrange_window_start(const State& s, double x, int degree) {
  const int targetCount = clamp_int(degree + 1, 2, s.count);
  int segmentIndex = 0;
  for (int i = 0; i < s.count - 1; i++) {
    if (x <= (double)s.points[i + 1].x) {
      segmentIndex = i;
      break;
    }
    segmentIndex = i;
  }
  const int start = segmentIndex - ((targetCount - 2) / 2);
  return clamp_int(start, 0, s.count - targetCount);
}

static double lagrange_at(const State& s, double x, int degree) {
  if (s.count < 2) return s.count ? (double)s.points[0].y : 0.0;
  for (int i = 0; i < s.count; i++) {
    if (dsp_fabs(x - (double)s.points[i].x) < 1.0e-6) return (double)s.points[i].y;
  }
  const int targetCount = clamp_int(degree + 1, 2, s.count);
  const int start = lagrange_window_start(s, x, degree);
  double value = 0.0;
  for (int i = 0; i < targetCount; i++) {
    const Point& point = s.points[start + i];
    double basis = 1.0;
    for (int j = 0; j < targetCount; j++) {
      if (j == i) continue;
      const Point& other = s.points[start + j];
      const double denom = (double)point.x - (double)other.x;
      if (dsp_fabs(denom) < 1.0e-6) continue;
      basis *= (x - (double)other.x) / denom;
    }
    value += (double)point.y * basis;
  }
  return safe(value);
}

static double segment_linear(const State& s, double x) {
  return polyline_at(s, x);
}

static double eval_curve(const State& s, double x, int mode, double tension) {
  if (s.count < 1) return 0.0;
  if (mode == kModeCatmull) {
    return guide_bezier_at(s, x, tension);
  }
  if (x < (double)s.points[0].x) return (double)s.points[0].y;
  if (x > (double)s.points[s.count - 1].x) return (double)s.points[s.count - 1].y;
  if (mode == kModeQuadratic) return lagrange_at(s, x, 2);
  if (mode == kModeCubic) return lagrange_at(s, x, 3);
  return segment_linear(s, x);
}

}  // namespace

extern "C" int soemdsp_smooth_graph_create() {
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

extern "C" void soemdsp_smooth_graph_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" int soemdsp_smooth_graph_max_points() {
  return kMaxPoints;
}

// SoA scratch for host Float32 writes (phosphillator path_* convention).
static float gSoaX[kMaxInstances][kMaxPoints];
static float gSoaY[kMaxInstances][kMaxPoints];

extern "C" int soemdsp_smooth_graph_points_x_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gSoaX[handle - 1];
}

extern "C" int soemdsp_smooth_graph_points_y_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return (int)(long long)gSoaY[handle - 1];
}

extern "C" int soemdsp_smooth_graph_set_points(int handle, int count) {
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
  }
  s.count = count;
  ensure_sorted(s);
  return 1;
}

extern "C" void soemdsp_smooth_graph_clear_points(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].count = 0;
  ensure_default_ramp(gPool[handle - 1]);
}

extern "C" double soemdsp_smooth_graph_sample(
  int handle,
  double x,
  double smoothingMode,
  double tension
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  ensure_default_ramp(s);
  return eval_curve(s, safe(x), normalize_mode(smoothingMode), safe(tension));
}

extern "C" int soemdsp_smooth_graph_version() {
  return 1;
}
