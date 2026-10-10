// Test probe for scripts/test_softpop_oscillator.mjs (not shipped). Linked with
// native_modules/softpop_oscillator/softpop_oscillator.cpp; renders blocks of
// the module's outputs / probes into a planar buffer and runs long level loops
// in wasm so the statistics stay fast.
extern "C" int soemdsp_softpop_oscillator_create();
extern "C" void soemdsp_softpop_oscillator_destroy(int handle);
extern "C" void soemdsp_softpop_oscillator_reset(int handle);
extern "C" double soemdsp_softpop_oscillator_sample(
  int handle, double freqHz, double model, double width, double pitchModCents, double ampMod,
  double amplitude, double color, double stereoMode, double seedValue, double sampleRate);
extern "C" double soemdsp_softpop_oscillator_left(int handle);
extern "C" double soemdsp_softpop_oscillator_right(int handle);
extern "C" double soemdsp_softpop_oscillator_probe(int handle, int which);

namespace {
const int kCap = 1 << 23;
double gBuf[kCap];
const int kInCap = 1 << 20;
double gIn[kInCap];
double gStats[8];
struct Params {
  double freq, model, width, pitch, ampMod, amp, color, stereo, seed, sr;
} gP = {440.0, 0.0, 0.3, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 48000.0};

double step(int h, double freq) {
  return soemdsp_softpop_oscillator_sample(h, freq, gP.model, gP.width, gP.pitch, gP.ampMod,
                                           gP.amp, gP.color, gP.stereo, gP.seed, gP.sr);
}

double channel(int h, int c, double mono) {
  switch (c) {
    case 0: return mono;
    case 1: return soemdsp_softpop_oscillator_left(h);
    case 2: return soemdsp_softpop_oscillator_right(h);
    default: return soemdsp_softpop_oscillator_probe(h, c - 3);
  }
}
}  // namespace

extern "C" double* tp_buf() { return gBuf; }
extern "C" int tp_cap() { return kCap; }
extern "C" double* tp_in() { return gIn; }
extern "C" int tp_in_cap() { return kInCap; }
extern "C" double* tp_stats() { return gStats; }
extern "C" int tp_create() { return soemdsp_softpop_oscillator_create(); }
extern "C" void tp_destroy(int h) { soemdsp_softpop_oscillator_destroy(h); }
extern "C" void tp_reset(int h) { soemdsp_softpop_oscillator_reset(h); }

extern "C" void tp_set(double freq, double model, double width, double pitch, double ampMod,
                       double amp, double color, double stereo, double seed, double sr) {
  gP = Params{freq, model, width, pitch, ampMod, amp, color, stereo, seed, sr};
}

// Render n frames. mask bit c selects channel c: 0 Mono, 1 L, 2 R, 3.. probe(c-3)
// (3/4 n_pitch L/R, 5/6 n_amp, 7/8 N_audio, 9/10 fInst). Planar: the k-th
// selected channel lands at gBuf[k*n + i]. useIn: per-sample Hz from gIn.
extern "C" int tp_render(int h, int n, int mask, int useIn) {
  int chans[16];
  int nc = 0;
  for (int c = 0; c < 16; c += 1) if (mask & (1 << c)) chans[nc++] = c;
  if (n * nc > kCap || (useIn && n > kInCap)) return -1;
  for (int i = 0; i < n; i += 1) {
    const double mono = step(h, useIn ? gIn[i] : gP.freq);
    for (int k = 0; k < nc; k += 1) gBuf[k * n + i] = channel(h, chans[k], mono);
  }
  return nc;
}

// Level loop: warm frames discarded, then n frames. Stats: 0 mean L^2,
// 1 mean R^2, 2 mean Mono^2, 3 mean L, 4 non-finite count, 5 max |L|,|R|.
extern "C" void tp_level(int h, int warm, int n) {
  for (int i = 0; i < warm; i += 1) step(h, gP.freq);
  double sl = 0.0, sr = 0.0, sm = 0.0, s1 = 0.0, bad = 0.0, mx = 0.0;
  for (int i = 0; i < n; i += 1) {
    const double m = step(h, gP.freq);
    const double l = soemdsp_softpop_oscillator_left(h);
    const double r = soemdsp_softpop_oscillator_right(h);
    if (!(l - l == 0.0) || !(r - r == 0.0) || !(m - m == 0.0)) { bad += 1.0; continue; }
    sl += l * l; sr += r * r; sm += m * m; s1 += l;
    const double al = l < 0.0 ? -l : l;
    const double ar = r < 0.0 ? -r : r;
    if (al > mx) mx = al;
    if (ar > mx) mx = ar;
  }
  gStats[0] = sl / n; gStats[1] = sr / n; gStats[2] = sm / n; gStats[3] = s1 / n;
  gStats[4] = bad; gStats[5] = mx;
}
