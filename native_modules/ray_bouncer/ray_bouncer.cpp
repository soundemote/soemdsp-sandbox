// soemdsp-native-module: ray_bouncer
// soemdsp-native-label: Ray Bouncer
// soemdsp-native-target: rayBouncer
// soemdsp-native-kind: chaos
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Generators/RayBouncer.h
//
// Port of Robin Schmidt / RS-MET rsRayBouncer (+ ellipse/conic/line math):
// a particle launched inside an ellipse, reflecting off the tangent at each
// hit. Outputs X/Y position for phosphor scope and stereo/audio use.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const double kTol = 1.0e-8;
static const double kDegToRad = kPi / 180.0;
static const double kInfDistance = 1.0e30;

static inline double dsp_sqrt(double x) {
  return __builtin_sqrt(x < 0.0 ? 0.0 : x);
}

// a*t^2 + b*t + c = 0  (args ordered c,b,a matching RAPT rootsQuadraticReal).
static void roots_quadratic(double c, double b, double a, double* t1, double* t2) {
  if (dsp_fabs(a) < 1.0e-30) {
    if (dsp_fabs(b) < 1.0e-30) {
      *t1 = 0.0;
      *t2 = 0.0;
      return;
    }
    const double t = -c / b;
    *t1 = t;
    *t2 = t;
    return;
  }
  double disc = b * b - 4.0 * a * c;
  if (disc < 0.0) {
    // Complex pair — return shared real part (RAPT behaviour).
    const double t = -b / (2.0 * a);
    *t1 = t;
    *t2 = t;
    return;
  }
  const double s = dsp_sqrt(disc);
  // Stable root computation (Press et al.).
  const double q = -0.5 * (b + (b >= 0.0 ? s : -s));
  double r1 = q / a;
  double r2 = (dsp_fabs(q) > 1.0e-30) ? (c / q) : r1;
  if (r1 > r2) {
    const double tmp = r1;
    r1 = r2;
    r2 = tmp;
  }
  *t1 = r1;
  *t2 = r2;
}

struct Ellipse {
  // Implicit conic: A x^2 + B xy + C y^2 + D x + E y + F = 0
  double A, B, C, D, E, F;
  double scale, ratio, angle, centerX, centerY;

  void setParameters(double newScale, double newRatio, double newAngle,
                     double newCenterX, double newCenterY) {
    scale = maxd(1.0e-6, newScale);
    ratio = maxd(1.0e-6, newRatio);
    angle = newAngle;
    centerX = newCenterX;
    centerY = newCenterY;
    updateCoeffs();
  }

  void updateCoeffs() {
    const double a = dsp_sqrt(scale * ratio);
    const double b = dsp_sqrt(scale / ratio);
    const double s = dsp_sin(angle);
    const double c = dsp_cos(angle);
    const double xc = centerX;
    const double yc = centerY;
    const double a2 = a * a;
    const double b2 = b * b;
    A = a2 * s * s + b2 * c * c;
    B = 2.0 * (b2 - a2) * s * c;
    C = a2 * c * c + b2 * s * s;
    D = -2.0 * A * xc - B * yc;
    E = -2.0 * C * yc - B * xc;
    F = A * xc * xc + B * xc * yc + C * yc * yc - a2 * b2;
  }

  double evaluate(double x, double y) const {
    return A * x * x + B * x * y + C * y * y + D * x + E * y + F;
  }

  bool isPointOutside(double x, double y, double tol) const {
    return evaluate(x, y) > tol;
  }

  void lineIntersectionParameter(double x0, double dx, double y0, double dy,
                                 double* t1, double* t2) const {
    const double a = A * dx * dx + B * dx * dy + C * dy * dy;
    const double b = 2.0 * A * x0 * dx + B * (x0 * dy + y0 * dx) + 2.0 * C * y0 * dy + D * dx + E * dy;
    const double c = A * x0 * x0 + B * x0 * y0 + C * y0 * y0 + D * x0 + E * y0 + F;
    roots_quadratic(c, b, a, t1, t2);
  }

  void getTangentCoeffs(double x, double y, double* a, double* b, double* c) const {
    *a = 2.0 * A * x + B * y + D;
    *b = 2.0 * C * y + B * x + E;
    *c = -(*a * x + *b * y);
  }
};

static void reflect_point_in_line(double x, double y, double A, double B, double C,
                                  double* xr, double* yr) {
  const double denom = A * A + B * B;
  if (denom < 1.0e-30) {
    *xr = x;
    *yr = y;
    return;
  }
  const double d = 2.0 * (A * x + B * y + C) / denom;
  *xr = x - A * d;
  *yr = y - B * d;
}

struct RayBouncerState {
  bool active;
  bool resetWasHigh;
  bool hasStarted;

  Ellipse ellipse;

  double x0, y0;
  double x, y, dx, dy;
  double distance;

  double speed;
  double angle;
  double maxDistance;
  double bendAmount;
  double xToY, yToX;
  double xxToX, xyToX, yyToX;
  double xxToY, xyToY, yyToY;

  double outX, outY;
};

static RayBouncerState gPool[kMaxInstances];

static void bouncer_reset(RayBouncerState& s) {
  s.x = s.x0;
  s.y = s.y0;
  s.dx = s.speed * dsp_cos(s.angle);
  s.dy = s.speed * dsp_sin(s.angle);
  s.distance = 0.0;
}

static void bouncer_reset_with_advance(RayBouncerState& s, double advance) {
  bouncer_reset(s);
  if (s.speed > 1.0e-30) {
    s.x += advance * s.dx / s.speed;
    s.y += advance * s.dy / s.speed;
  }
  s.distance += advance;
}

static void get_line_ellipse_intersection(RayBouncerState& s, double* xi, double* yi) {
  // xi,yi temporarily hold the two t solutions; yi is the farther (larger t).
  double t1 = 0.0;
  double t2 = 0.0;
  s.ellipse.lineIntersectionParameter(s.x, s.dx, s.y, s.dy, &t1, &t2);
  *xi = s.x + t2 * s.dx;
  *yi = s.y + t2 * s.dy;
}

static void reflect_in_tangent_at(RayBouncerState& s, double xt, double yt, double* px, double* py) {
  double A = 0.0, B = 0.0, C = 0.0;
  s.ellipse.getTangentCoeffs(xt, yt, &A, &B, &C);
  reflect_point_in_line(*px, *py, A, B, C, px, py);
}

static void update_velocity(RayBouncerState& s, double xi, double yi) {
  s.dx = s.x - xi;
  s.dy = s.y - yi;
  const double len = dsp_sqrt(s.dx * s.dx + s.dy * s.dy);
  if (len > 1.0e-30) {
    const double scaler = s.speed / len;
    s.dx *= scaler;
    s.dy *= scaler;
  }
}

static void ensure_point_in_ellipse(RayBouncerState& s, double xi, double yi) {
  if (s.ellipse.isPointOutside(s.x, s.y, kTol)) {
    s.dx = s.x0 - xi;
    s.dy = s.y0 - yi;
    const double len = dsp_sqrt(s.dx * s.dx + s.dy * s.dy);
    if (len > 1.0e-30) {
      const double scaler = s.speed / len;
      s.dx *= scaler;
      s.dy *= scaler;
    }
    s.x = xi;
    s.y = yi;
  }
}

static void bouncer_step(RayBouncerState& s) {
  // Output is pre-step position (RAPT getSampleFrame order).
  s.outX = s.x;
  s.outY = s.y;

  s.x += s.dx;
  s.y += s.dy;

  if (s.ellipse.isPointOutside(s.x, s.y, kTol)) {
    double xi = 0.0, yi = 0.0;
    get_line_ellipse_intersection(s, &xi, &yi);
    reflect_in_tangent_at(s, xi, yi, &s.x, &s.y);
    update_velocity(s, xi, yi);
    ensure_point_in_ellipse(s, xi, yi);
  }

  // Nonlinear velocity bending (RAPT).
  const double tx = s.speed * s.dx;
  const double ty = s.speed * s.dy;
  const double xx = s.dx * s.dx;
  const double xy = s.dx * s.dy;
  const double yy = s.dy * s.dy;
  s.dx += s.bendAmount * (s.xxToX * xx + s.xyToX * xy + s.yyToX * yy + s.yToX * ty);
  s.dy += s.bendAmount * (s.xxToY * xx + s.xyToY * xy + s.yyToY * yy + s.xToY * tx);

  s.distance += s.speed;
  if (s.distance > s.maxDistance) {
    bouncer_reset_with_advance(s, s.distance - s.maxDistance);
  }

  if (!safe_bounded(s.x) || !safe_bounded(s.y) || !safe_bounded(s.dx) || !safe_bounded(s.dy)) {
    bouncer_reset(s);
    s.outX = s.x;
    s.outY = s.y;
  }
}

static void init_defaults(RayBouncerState& s) {
  s.x0 = 0.0;
  s.y0 = 0.0;
  s.speed = 0.01;
  s.angle = 0.0;
  s.maxDistance = kInfDistance;
  s.bendAmount = 0.0;
  s.xToY = 0.0;
  s.yToX = 0.0;
  s.xxToX = 0.0;
  s.xyToX = 0.0;
  s.yyToX = 0.0;
  s.xxToY = 0.0;
  s.xyToY = 0.0;
  s.yyToY = 0.0;
  s.ellipse.setParameters(1.0, 1.0, 0.0, 0.0, 0.0);
  s.outX = 0.0;
  s.outY = 0.0;
  s.resetWasHigh = false;
  s.hasStarted = false;
  bouncer_reset(s);
}

}  // namespace

extern "C" int soemdsp_ray_bouncer_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      RayBouncerState& s = gPool[i];
      s.active = true;
      init_defaults(s);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_ray_bouncer_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_ray_bouncer_sample(
  int handle,
  double reset,
  double frequency,
  double launchAngleDeg,
  double startX,
  double startY,
  double size,
  double aspect,
  double rotateDeg,
  double centerX,
  double centerY,
  double maxDistance,
  double bend,
  double xToY,
  double yToX,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  RayBouncerState& s = gPool[handle - 1];

  const bool resetHigh = safe(reset) > 0.5;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double freq = maxd(0.0, safe(frequency));
  // RAPT driver: speed ∝ frequency / sampleRate (k=1).
  const double speed = freq / rate;
  const double ang = safe(launchAngleDeg) * kDegToRad;
  const double sx = clamp(safe(startX), -2.0, 2.0);
  const double sy = clamp(safe(startY), -2.0, 2.0);
  const double elSize = maxd(0.01, safe(size));
  const double elRatio = maxd(0.05, safe(aspect));
  const double elAngle = safe(rotateDeg) * kDegToRad;
  const double elCx = clamp(safe(centerX), -2.0, 2.0);
  const double elCy = clamp(safe(centerY), -2.0, 2.0);
  const double mdRaw = maxd(0.0, safe(maxDistance));
  // 0 = unlimited (no forced re-launch).
  const double md = mdRaw <= 1.0e-9 ? kInfDistance : mdRaw;
  const double bendAmt = clamp(safe(bend), -4.0, 4.0);
  const double bx = clamp(safe(xToY), -4.0, 4.0);
  const double by = clamp(safe(yToX), -4.0, 4.0);

  s.speed = speed;
  s.angle = ang;
  s.x0 = sx;
  s.y0 = sy;
  s.maxDistance = md;
  s.bendAmount = bendAmt;
  s.xToY = bx;
  s.yToX = by;
  s.ellipse.setParameters(elSize, elRatio, elAngle, elCx, elCy);

  if (resetHigh && !s.resetWasHigh) {
    bouncer_reset(s);
    s.hasStarted = true;
  } else if (!s.hasStarted) {
    bouncer_reset(s);
    s.hasStarted = true;
  }
  s.resetWasHigh = resetHigh;

  // Keep velocity length aligned with current speed after param changes.
  const double vlen = dsp_sqrt(s.dx * s.dx + s.dy * s.dy);
  if (vlen > 1.0e-30 && speed > 0.0) {
    const double scaler = speed / vlen;
    s.dx *= scaler;
    s.dy *= scaler;
  } else if (speed <= 0.0) {
    s.dx = 0.0;
    s.dy = 0.0;
    s.outX = s.x;
    s.outY = s.y;
    return;
  }

  bouncer_step(s);

  // Soft clamp for audio/scope; ellipse size ~1 keeps motion near unity.
  s.outX = clamp(safe_bounded(s.outX), -2.0, 2.0);
  s.outY = clamp(safe_bounded(s.outY), -2.0, 2.0);
}

extern "C" double soemdsp_ray_bouncer_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_ray_bouncer_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" int soemdsp_ray_bouncer_version() {
  return 1;
}
