// soemdsp-native-module: snowflake
// soemdsp-native-label: Snowflake
// soemdsp-native-target: snowflake
// soemdsp-native-kind: oscillator
//
// RS-MET-style fractal pattern synthesis: L-system rewrite + turtle polyline,
// walked at audio rate into X/Y. Port of public/modules/snowflake/snowflake-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static inline double snow_sqrt(double v) {
  return v > 0.0 ? __builtin_sqrt(v) : 0.0;
}

static const char kMetadataJson[] =
  "{"
    "\"module\":\"snowflake\","
    "\"label\":\"Snowflake\","
    "\"targetType\":\"snowflake\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"X\",\"Y\"],"
    "\"parameters\":["
      "{\"key\":\"pattern\",\"label\":\"Pattern\",\"defaultValue\":1,\"min\":0,\"max\":6,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":55,\"min\":0,\"mid\":110,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"iterations\",\"label\":\"Iterations\",\"defaultValue\":3,\"min\":0,\"max\":7,\"step\":1},"
      "{\"key\":\"angle\",\"label\":\"Angle\",\"defaultValue\":60,\"min\":1,\"max\":180,\"step\":\"any\"},"
      "{\"key\":\"direction\",\"label\":\"Direction\",\"defaultValue\":1,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"spin\",\"label\":\"Spin\",\"kind\":\"frequency\",\"defaultValue\":0,\"min\":-20,\"mid\":0,\"max\":20,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 16;
static const int kMaxPoints = 8192;
static const int kMaxString = 48000;
static const int kMaxIter = 7;
static const int kPatternCount = 7;
static const int kStackMax = 64;

struct Pt {
  double x, y, s;
};

struct TurtleFrame {
  double x, y, heading;
};

struct PatternDef {
  const char* axiom;
  const char* heads;
  const char* const* prods;
  int ruleCount;
};

static const char* kKochProds[] = { "F+F--F+F" };
static const char* kQuadProds[] = { "F+F-F-FF+F+F-F" };
static const char* kSierProds[] = { "B-A-B", "A+B+A" };
static const char* kDragProds[] = { "X+YF+", "-FX-Y" };
static const char* kGospProds[] = { "A-B--B+A++AA+B-", "+A-BB--B-A++A+B" };
static const char* kTreeProds[] = { "FF+[+F-F-F]-[-F+F+F]" };

static const PatternDef kPatterns[kPatternCount] = {
  { "F",       "F",  kKochProds, 1 },
  { "F--F--F", "F",  kKochProds, 1 },
  { "F",       "F",  kQuadProds, 1 },
  { "A",       "AB", kSierProds, 2 },
  { "FX",      "XY", kDragProds, 2 },
  { "A",       "AB", kGospProds, 2 },
  { "F",       "F",  kTreeProds, 1 },
};

struct SnowflakeState {
  double phase;
  double spinPhase;
  double outX, outY, out;
  int segIndex;
  int cachedPattern;
  int cachedIters;
  double cachedAngle;
  bool hasPath;
  int pointCount;
  double totalLength;
  Pt points[kMaxPoints];
  bool active;
};

static SnowflakeState gPool[kMaxInstances];
static char gBufA[kMaxString + 1];
static char gBufB[kMaxString + 1];

static bool isDrawChar(char ch) {
  return ch == 'F' || ch == 'G' || ch == 'A' || ch == 'B';
}

static const char* ruleFor(const PatternDef& pat, char ch) {
  for (int i = 0; i < pat.ruleCount; i++) {
    if (pat.heads[i] == ch) return pat.prods[i];
  }
  return nullptr;
}

// Expand L-system into gBufA (or gBufB then copy). Returns length.
static int expandLSystem(const PatternDef& pat, int iterations) {
  int len = 0;
  const char* ax = pat.axiom ? pat.axiom : "F";
  while (ax[len] && len < kMaxString - 1) {
    gBufA[len] = ax[len];
    len++;
  }
  gBufA[len] = 0;

  char* cur = gBufA;
  char* nxt = gBufB;
  int curLen = len;
  const int iters = clamp_int(iterations, 0, kMaxIter);

  for (int it = 0; it < iters; it++) {
    int nLen = 0;
    for (int i = 0; i < curLen; i++) {
      const char ch = cur[i];
      const char* prod = ruleFor(pat, ch);
      if (prod) {
        for (int p = 0; prod[p]; p++) {
          if (nLen >= kMaxString - 1) break;
          nxt[nLen++] = prod[p];
        }
      } else if (nLen < kMaxString - 1) {
        nxt[nLen++] = ch;
      }
      if (nLen >= kMaxString - 1) break;
    }
    nxt[nLen] = 0;
    char* tmp = cur;
    cur = nxt;
    nxt = tmp;
    curLen = nLen;
    if (curLen >= kMaxString - 1) break;
  }

  if (cur != gBufA) {
    for (int i = 0; i < curLen; i++) gBufA[i] = cur[i];
    gBufA[curLen] = 0;
  }
  return curLen;
}

static void rebuildPath(SnowflakeState& s, int patternIndex, int iterations, double angleDeg) {
  const int idx = clamp_int(patternIndex, 0, kPatternCount - 1);
  const int iters = clamp_int(iterations, 0, kMaxIter);
  const double angle = safe(angleDeg);
  const PatternDef& pat = kPatterns[idx];

  expandLSystem(pat, iters);
  const char* text = gBufA;

  const double angleRad = (angle * kPi) / 180.0;
  const double step = 1.0;
  double x = 0.0, y = 0.0, heading = 0.0;
  TurtleFrame stack[kStackMax];
  int stackN = 0;

  s.points[0].x = 0.0;
  s.points[0].y = 0.0;
  s.points[0].s = 0.0;
  int n = 1;
  double total = 0.0;

  for (int i = 0; text[i]; i++) {
    const char ch = text[i];
    if (isDrawChar(ch)) {
      const double nx = x + dsp_cos(heading) * step;
      const double ny = y + dsp_sin(heading) * step;
      const double dx = nx - x;
      const double dy = ny - y;
      total += snow_sqrt(dx * dx + dy * dy);
      x = nx;
      y = ny;
      if (n < kMaxPoints) {
        s.points[n].x = x;
        s.points[n].y = y;
        s.points[n].s = total;
        n++;
      }
    } else if (ch == 'f') {
      x += dsp_cos(heading) * step;
      y += dsp_sin(heading) * step;
    } else if (ch == '+') {
      heading += angleRad;
    } else if (ch == '-') {
      heading -= angleRad;
    } else if (ch == '[') {
      if (stackN < kStackMax) {
        stack[stackN].x = x;
        stack[stackN].y = y;
        stack[stackN].heading = heading;
        stackN++;
      }
    } else if (ch == ']') {
      if (stackN > 0) {
        stackN--;
        x = stack[stackN].x;
        y = stack[stackN].y;
        heading = stack[stackN].heading;
        if (n < kMaxPoints) {
          s.points[n].x = x;
          s.points[n].y = y;
          s.points[n].s = total;
          n++;
        }
      }
    }
  }

  if (n < 2 || total <= 1e-12) {
    s.points[0].x = -0.5; s.points[0].y = 0.0; s.points[0].s = 0.0;
    s.points[1].x = 0.5;  s.points[1].y = 0.0; s.points[1].s = 1.0;
    s.pointCount = 2;
    s.totalLength = 1.0;
  } else {
    double minX = s.points[0].x, maxX = s.points[0].x;
    double minY = s.points[0].y, maxY = s.points[0].y;
    for (int i = 1; i < n; i++) {
      if (s.points[i].x < minX) minX = s.points[i].x;
      if (s.points[i].x > maxX) maxX = s.points[i].x;
      if (s.points[i].y < minY) minY = s.points[i].y;
      if (s.points[i].y > maxY) maxY = s.points[i].y;
    }
    const double cx = (minX + maxX) * 0.5;
    const double cy = (minY + maxY) * 0.5;
    const double span = maxd(maxX - minX, maxd(maxY - minY, 1e-9));
    const double sc = 1.8 / span;
    for (int i = 0; i < n; i++) {
      s.points[i].x = (s.points[i].x - cx) * sc;
      s.points[i].y = (s.points[i].y - cy) * sc;
    }
    double sAcc = 0.0;
    s.points[0].s = 0.0;
    for (int i = 1; i < n; i++) {
      const double dx = s.points[i].x - s.points[i - 1].x;
      const double dy = s.points[i].y - s.points[i - 1].y;
      sAcc += snow_sqrt(dx * dx + dy * dy);
      s.points[i].s = sAcc;
    }
    s.pointCount = n;
    s.totalLength = maxd(sAcc, 1e-9);
  }

  s.hasPath = true;
  s.cachedPattern = idx;
  s.cachedIters = iters;
  s.cachedAngle = angle;
  s.segIndex = 0;
}

static void ensurePath(SnowflakeState& s, int patternIndex, int iterations, double angleDeg) {
  const int idx = clamp_int(patternIndex, 0, kPatternCount - 1);
  const int iters = clamp_int(iterations, 0, kMaxIter);
  const double angle = safe(angleDeg);
  if (s.hasPath
      && s.cachedPattern == idx
      && s.cachedIters == iters
      && dsp_fabs(s.cachedAngle - angle) < 1e-6) {
    return;
  }
  rebuildPath(s, idx, iters, angle);
}

static void pointAt(SnowflakeState& s, double u01, double& ox, double& oy) {
  if (!s.hasPath || s.pointCount < 2 || s.totalLength <= 0.0) {
    ox = 0.0;
    oy = 0.0;
    return;
  }
  const double target = wrap01(u01) * s.totalLength;
  int i = clamp_int(s.segIndex, 0, s.pointCount - 2);
  if (s.points[i].s > target) {
    while (i > 0 && s.points[i].s > target) i--;
  } else {
    while (i < s.pointCount - 2 && s.points[i + 1].s < target) i++;
  }
  s.segIndex = i;
  const Pt& a = s.points[i];
  const int j = (i + 1 < s.pointCount) ? i + 1 : s.pointCount - 1;
  const Pt& b = s.points[j];
  const double segLen = maxd(1e-12, b.s - a.s);
  const double t = clamp((target - a.s) / segLen, 0.0, 1.0);
  ox = a.x + (b.x - a.x) * t;
  oy = a.y + (b.y - a.y) * t;
}

// Jerobeam trisaw: warp 0 ≈ reverse saw, 0.5 = triangle, 1 ≈ forward saw.
static double snowflake_trisaw(double phase, double warp) {
  const double wrapped = wrap01(phase);
  const double safeWarp = clamp(warp, 0.001, 0.999);
  return wrapped < safeWarp
    ? wrapped / safeWarp
    : (1.0 - wrapped) / (1.0 - safeWarp);
}

}  // namespace

extern "C" int soemdsp_snowflake_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SnowflakeState& s = gPool[i];
      s.phase = 0.0;
      s.spinPhase = 0.0;
      s.outX = 0.0;
      s.outY = 0.0;
      s.out = 0.0;
      s.segIndex = 0;
      s.cachedPattern = -1;
      s.cachedIters = -1;
      s.cachedAngle = 1e300;
      s.hasPath = false;
      s.pointCount = 0;
      s.totalLength = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_snowflake_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
  gPool[handle - 1].hasPath = false;
}

// ABI (kept arity for existing call sites):
//   sizeArg      ignored (Amplitude scales; legacy Size removed)
//   directionArg −1…1 path morph via trisaw (v2+). Legacy callers may still
//                pass 0/1 bool reverse; values outside [−1,1] are clamped.
extern "C" void soemdsp_snowflake_sample(
  int handle,
  double frequencyHz,
  double pattern,
  double iterations,
  double angleDeg,
  double /*sizeArg*/,
  double directionArg,
  double spin,
  double level,
  double reset,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  SnowflakeState& s = gPool[handle - 1];
  if (!s.active) return;

  const double rate = maxd(1.0, sampleRate);
  if (reset > 0.5) {
    s.phase = 0.0;
    s.segIndex = 0;
  }

  ensurePath(
    s,
    (int)dsp_floor(safe(pattern) + 0.5),
    (int)dsp_floor(safe(iterations) + 0.5),
    angleDeg
  );

  const double phase = wrap01(s.phase);
  s.phase = wrap01(s.phase + maxd(0.0, frequencyHz) / rate);

  // Direction −1 reverse … 0 bi … +1 forward → trisaw warp 0…1.
  const double direction = clamp(safe(directionArg), -1.0, 1.0);
  const double warp = (direction + 1.0) * 0.5;
  const double u = snowflake_trisaw(phase, warp);

  double x = 0.0, y = 0.0;
  pointAt(s, u, x, y);

  const double spinHz = safe(spin);
  if (spinHz != 0.0) {
    const double spinPhase = wrap01(s.spinPhase);
    s.spinPhase = wrap01(s.spinPhase + spinHz / rate);
    const double ang = spinPhase * kTwoPi;
    const double c = dsp_cos(ang);
    const double sn = dsp_sin(ang);
    const double rx = x * c - y * sn;
    const double ry = x * sn + y * c;
    x = rx;
    y = ry;
  }

  const double amp = safe(level);
  s.outX = x * amp;
  s.outY = y * amp;
  s.out = s.outY; // legacy field; port removed — X/Y only
}

extern "C" double soemdsp_snowflake_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_snowflake_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_snowflake_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

// v2: direction trisaw (size ignored); same export arity as v1.
extern "C" int soemdsp_snowflake_version() {
  return 2;
}

extern "C" const char* soemdsp_snowflake_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_snowflake_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
