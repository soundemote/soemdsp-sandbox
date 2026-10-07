// Parity + behaviour harness: Robin Sinepulse Allpass (native_modules/
// robin_sinepulse_allpass/robin_sinepulse_allpass.cpp) vs Robin Schmidt's
// rosic::rsFlatZapper (originalcode/, compiled unmodified with a RAPT stub).
//
// Run: python scripts/parity_robin_sinepulse_allpass.py
//   (or clang++ -std=c++17 -O2 -I library/include scripts/parity_robin_sinepulse_allpass.cpp
//    scripts/parity_robin_sinepulse_allpass_port_probe.cpp -o /tmp/p && /tmp/p)
//
// 1) Chain arithmetic: Robin's rsBiquadCascade loaded with the PORT's
//    coefficients must give the port's output bit for bit (both modes).
// 2) Robin's cookbook design has a1 == b1 and a2 == b0 bit for bit (the port
//    stores only b0..b2).
// 3) Full parity: rsFlatZapper vs the port for impulse and noise inputs, both
//    modes, N = 0, 1, 2, 7, 50, 128, 256, several tunings / shapes / Qs and
//    sample rates. The only difference is the sandbox exp / ln / sin / cos
//    polynomials (no libm in the wasm build), so the error is tiny but not 0.
// 4) Sandbox wrapper: Trigger impulse height, In / Input, Mix, Amplitude,
//    energy of the impulse response (allpass: 1), idle, coefficients
//    recomputed only on change, stage-count change, every param audible,
//    block path == sample path.
// See docs/KICK_PLAN.md (Flat Zapper module (seed)).

#include <cfloat>
#include <cinttypes>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>

#include "parity_robin_sinepulse_allpass_rapt_stub.h"
#define protected public  // load coefficients into rsBiquadCascade (test only)
namespace RAPT {
#include "../native_modules/robin_sinepulse_allpass/originalcode/rapt_BiquadCascade.h"
#include "../native_modules/robin_sinepulse_allpass/originalcode/rapt_BiquadCascade.cpp"
}
namespace rosic {
#include "../native_modules/robin_sinepulse_allpass/originalcode/rosic_BiquadDesigner_Allpass.h"
#include "../native_modules/robin_sinepulse_allpass/originalcode/rosic_MiscUnfinished_FlatZapper.h"
#include "../native_modules/robin_sinepulse_allpass/originalcode/rosic_MiscUnfinished_FlatZapper.cpp"
}
#undef protected

extern "C" {
int soemdsp_robin_sinepulse_allpass_create();
void soemdsp_robin_sinepulse_allpass_destroy(int handle);
int soemdsp_robin_sinepulse_allpass_set_params(int handle, double stages, double mode,
  double lowFreq, double highFreq, double freqShape, double lowQ, double highQ, double qShape,
  double sampleRate);
void soemdsp_robin_sinepulse_allpass_process_chain(int handle, double* io, int frames);
double soemdsp_robin_sinepulse_allpass_dry(int handle, double trigger, double in, double impulse,
  double input);
double soemdsp_robin_sinepulse_allpass_sample(int handle, double trigger, double in,
  double impulse, double input, double mix, double amplitude);
int soemdsp_robin_sinepulse_allpass_is_idle(int handle);
int soemdsp_robin_sinepulse_allpass_num_stages(int handle);
int soemdsp_robin_sinepulse_allpass_update_count(int handle);
double sinepulse_allpass_probe_coeff(int handle, int stage, int which);
double sinepulse_allpass_probe_state_y1(int handle, int stage);
}

static int gFailures = 0;
static void check(bool ok, const char* what) {
  std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
  if (!ok) gFailures++;
}

struct Setup {
  int mode;        // 0 onePole, 1 biquad (port choiceId)
  int stages;
  double lo, hi, fShape, qLo, qHi, qShape, fs;
};

static uint64_t gRng = 0x9E3779B97F4A7C15ull;
static double noise() {
  gRng = gRng * 6364136223846793005ull + 1442695040888963407ull;
  return (double)(int64_t)(gRng >> 11) / 4503599627370496.0 - 1.0;  // [-1, 1)
}

static std::vector<double> make_input(bool impulse, int n) {
  std::vector<double> x(n, 0.0);
  if (impulse) { x[0] = 1.0; return x; }
  gRng = 0x9E3779B97F4A7C15ull;
  for (int i = 0; i < n; i++) x[i] = 0.5 * noise();
  return x;
}

static void setup_robin(rosic::rsFlatZapper& fz, const Setup& s) {
  fz.setSampleRate(s.fs);
  fz.setMode(s.mode == 0 ? rosic::rsFlatZapper::Mode::onePole : rosic::rsFlatZapper::Mode::biquad);
  fz.setNumStages(s.stages);
  fz.setLowFreq(s.lo);
  fz.setHighFreq(s.hi);
  fz.setFreqShape(s.fShape);
  fz.setLowQ(s.qLo);
  fz.setHighQ(s.qHi);
  fz.setQShape(s.qShape);
  fz.reset();
}

static int make_port(const Setup& s) {
  const int h = soemdsp_robin_sinepulse_allpass_create();
  soemdsp_robin_sinepulse_allpass_set_params(h, s.stages, s.mode, s.lo, s.hi, s.fShape, s.qLo,
                                             s.qHi, s.qShape, s.fs);
  return h;
}

// Port chain output via the graph path (process_chain, 32-sample blocks).
static std::vector<double> run_port_blocks(int h, const std::vector<double>& x) {
  std::vector<double> y(x);
  for (size_t i = 0; i < y.size(); i += 32) {
    const int n = (int)std::min<size_t>(32, y.size() - i);
    soemdsp_robin_sinepulse_allpass_process_chain(h, &y[i], n);
  }
  return y;
}

int main() {
  const int kLen = 24000;
  std::printf("Robin Sinepulse Allpass vs rosic::rsFlatZapper\n");

  // ---- 1) + 2) chain arithmetic and coefficient identities ----
  std::printf("\n1) Chain arithmetic (Robin's rsBiquadCascade with the port's coefficients)\n");
  {
    bool bitExact = true, identities = true;
    double worstIdent = 0.0;
    for (int mode = 0; mode < 2; mode++) {
      for (int stages : {1, 2, 50, 256}) {
        Setup s{mode, stages, 15.0, 8000.0, 1.3, 0.5, 4.0, -2.0, 48000.0};
        rosic::rsFlatZapper fz;
        setup_robin(fz, s);
        fz.getSample(0.0);  // run updateCoeffs
        fz.reset();
        auto& c = fz.allpassChain;
        for (int i = 0; i < stages; i++) {
          if (mode == 1 && (c.a1[i] != c.b1[i] || c.a2[i] != c.b0[i])) identities = false;
        }
        const int h = make_port(s);
        for (int i = 0; i < stages; i++) {
          const double b0 = sinepulse_allpass_probe_coeff(h, i, 0);
          const double b1 = sinepulse_allpass_probe_coeff(h, i, 1);
          const double b2 = sinepulse_allpass_probe_coeff(h, i, 2);
          c.b0[i] = b0;
          c.b1[i] = b1;
          c.b2[i] = b2;
          if (mode == 1) { c.a1[i] = b1; c.a2[i] = b0; }
          else { c.a1[i] = b0; c.a2[i] = 0.0; }
          // compare with Robin's own design (coefficient error)
        }
        for (bool imp : {true, false}) {
          auto x = make_input(imp, 4096);
          c.reset();
          std::vector<double> r(x.size());
          for (size_t n = 0; n < x.size(); n++) r[n] = c.getSample(x[n]);
          const int h2 = make_port(s);
          auto y = run_port_blocks(h2, x);
          soemdsp_robin_sinepulse_allpass_destroy(h2);
          for (size_t n = 0; n < x.size(); n++) if (r[n] != y[n]) { bitExact = false; break; }
        }
        soemdsp_robin_sinepulse_allpass_destroy(h);
        (void)worstIdent;
      }
    }
    check(identities, "Robin's cookbook allpass: a1 == b1 and a2 == b0 bit for bit");
    check(bitExact, "port chain == Robin's DF1 cascade bit for bit (same coefficients, both modes)");
  }

  // ---- 3) full parity ----
  std::printf("\n2) Full parity vs rsFlatZapper (impulse + noise, %d samples each)\n", kLen);
  std::vector<Setup> setups;
  const int stageList[] = {0, 1, 2, 7, 50, 128, 256};
  struct Tune { double lo, hi, fShape, qLo, qHi, qShape; };
  const Tune tunes[] = {
    {15.0, 8000.0, 0.0, 1.0, 1.0, 0.0},      // ToolChain defaults
    {20.0, 20000.0, 0.0, 1.0, 1.0, 0.0},     // core defaults
    {30.0, 5000.0, 2.5, 0.3, 6.0, -1.5},     // bent tuning, Q spread
    {40.0, 12000.0, -4.0, 8.0, 0.125, 3.0},  // other bend
    {2000.0, 60.0, 1.0, 2.0, 0.7, 5.0},      // reversed (High < Low)
    {1.0, 20000.0, 5.0, 0.125, 8.0, -5.0},   // extremes
  };
  const double rates[] = {44100.0, 48000.0, 96000.0};
  for (int mode = 0; mode < 2; mode++)
    for (int st : stageList)
      for (const Tune& t : tunes)
        for (double fs : rates)
          setups.push_back({mode, st, t.lo, t.hi, t.fShape, t.qLo, t.qHi, t.qShape, fs});
  double worstAbs[2] = {0, 0}, worstRel[2] = {0, 0}, worstCoeff[2] = {0, 0};
  double worstAbsN[2][257] = {};
  int cases = 0;
  for (const Setup& s : setups) {
    for (bool imp : {true, false}) {
      auto x = make_input(imp, kLen);
      rosic::rsFlatZapper fz;
      setup_robin(fz, s);
      std::vector<double> r(kLen);
      for (int n = 0; n < kLen; n++) r[n] = fz.getSample(x[n]);
      const int h = make_port(s);
      auto y = run_port_blocks(h, x);
      if (imp) {
        auto& c = fz.allpassChain;
        for (int i = 0; i < s.stages; i++) {
          const double d = std::fabs(c.b0[i] - sinepulse_allpass_probe_coeff(h, i, 0));
          if (d > worstCoeff[s.mode]) worstCoeff[s.mode] = d;
        }
      }
      soemdsp_robin_sinepulse_allpass_destroy(h);
      double maxAbs = 0.0, errE = 0.0, refE = 0.0;
      for (int n = 0; n < kLen; n++) {
        const double d = std::fabs(r[n] - y[n]);
        if (d > maxAbs) maxAbs = d;
        errE += d * d;
        refE += r[n] * r[n];
      }
      const double rel = refE > 0.0 ? std::sqrt(errE / refE) : 0.0;
      if (maxAbs > worstAbs[s.mode]) worstAbs[s.mode] = maxAbs;
      if (rel > worstRel[s.mode]) worstRel[s.mode] = rel;
      if (maxAbs > worstAbsN[s.mode][s.stages]) worstAbsN[s.mode][s.stages] = maxAbs;
      cases++;
    }
  }
  const char* names[2] = {"onePole", "biquad"};
  for (int m = 0; m < 2; m++) {
    std::printf("  %-7s worst max|err| %.3e, worst rms err / rms ref %.3e (%.1f dB), worst |b0 diff| %.3e\n",
                names[m], worstAbs[m], worstRel[m], 20.0 * std::log10(worstRel[m] + 1e-300), worstCoeff[m]);
    std::printf("          max|err| by stages:");
    for (int st : stageList) std::printf(" N=%d %.1e", st, worstAbsN[m][st]);
    std::printf("\n");
  }
  std::printf("  %d cases (2 modes x 7 stage counts x 6 tunings x 3 rates x impulse/noise)\n", cases);
  check(worstAbsN[0][0] == 0.0 && worstAbsN[1][0] == 0.0, "N = 0 is a wire (bit exact)");
  check(worstAbs[0] < 1e-4 && worstAbs[1] < 1e-4, "max |err| < 1e-4 (both modes, all cases)");
  check(worstRel[0] < 1e-4 && worstRel[1] < 1e-4, "rms err / rms ref < 1e-4 (-80 dB)");

  // ---- 4) wrapper behaviour ----
  std::printf("\n3) Sandbox wrapper\n");
  {
    const double fs = 48000.0;
    // Trigger impulse height, In / Input, Mix, Amplitude (stages 0: chain = wire).
    int h = soemdsp_robin_sinepulse_allpass_create();
    soemdsp_robin_sinepulse_allpass_set_params(h, 0, 1, 15, 8000, 0, 1, 1, 0, fs);
    const double o1 = soemdsp_robin_sinepulse_allpass_sample(h, 0.8, 0.0, 0.5, 1.0, 1.0, 1.0);
    const double o2 = soemdsp_robin_sinepulse_allpass_sample(h, 0.8, 0.0, 0.5, 1.0, 1.0, 1.0);
    check(std::fabs(o1 - 0.4) < 1e-15 && o2 == 0.0, "Trigger 0.8 x Impulse 0.5 -> one sample of 0.4; held gate does not refire");
    soemdsp_robin_sinepulse_allpass_sample(h, 0.0, 0.0, 0.5, 1.0, 1.0, 1.0);
    const double o3 = soemdsp_robin_sinepulse_allpass_sample(h, -1.0, 0.0, 0.5, 1.0, 1.0, 1.0);
    check(std::fabs(o3 - 0.5) < 1e-15, "negative Trigger height fires |v| x Impulse");
    const double o4 = soemdsp_robin_sinepulse_allpass_sample(h, 0.0, 0.6, 1.0, -0.5, 1.0, 0.5);
    check(std::fabs(o4 - (-0.15)) < 1e-15, "In 0.6 x Input -0.5 x Amplitude 0.5 = -0.15");
    soemdsp_robin_sinepulse_allpass_destroy(h);

    // Mix 0 = dry only, with a real chain.
    h = soemdsp_robin_sinepulse_allpass_create();
    soemdsp_robin_sinepulse_allpass_set_params(h, 50, 1, 15, 8000, 0, 1, 1, 0, fs);
    bool dryOk = true;
    for (int n = 0; n < 2000; n++) {
      const double in = 0.3 * std::sin(0.01 * n);
      const double o = soemdsp_robin_sinepulse_allpass_sample(h, 0.0, in, 1.0, 1.0, 0.0, 1.0);
      if (o != in) dryOk = false;
    }
    check(dryOk, "Mix 0 passes the dry signal unchanged");
    soemdsp_robin_sinepulse_allpass_destroy(h);

    // Energy of the impulse response = 1 (allpass), both modes.
    for (int mode = 0; mode < 2; mode++) {
      h = soemdsp_robin_sinepulse_allpass_create();
      soemdsp_robin_sinepulse_allpass_set_params(h, 50, mode, 15, 8000, 0, 1, 1, 0, fs);
      double e = 0.0, peak = 0.0;
      for (int n = 0; n < 8 * 48000; n++) {
        const double o = soemdsp_robin_sinepulse_allpass_sample(h, n == 0 ? 1.0 : 0.0, 0.0, 1.0, 1.0, 1.0, 1.0);
        e += o * o;
        if (std::fabs(o) > peak) peak = std::fabs(o);
      }
      char msg[160];
      std::snprintf(msg, sizeof msg, "%s 50 stages: impulse-response energy %.6f (allpass: 1), peak %.4f",
                    names[mode], e, peak);
      check(std::fabs(e - 1.0) < 1e-3, msg);
      soemdsp_robin_sinepulse_allpass_destroy(h);
    }

    // Coefficients only on change.
    h = soemdsp_robin_sinepulse_allpass_create();
    int changed = 0;
    for (int b = 0; b < 1000; b++)
      changed += soemdsp_robin_sinepulse_allpass_set_params(h, 128, 1, 15, 8000, 0, 1, 1, 0, fs);
    check(changed == 1 && soemdsp_robin_sinepulse_allpass_update_count(h) == 1,
          "1000 set_params with the same values -> 1 coefficient update");
    changed = soemdsp_robin_sinepulse_allpass_set_params(h, 128, 1, 15, 8000.5, 0, 1, 1, 0, fs);
    check(changed == 1 && soemdsp_robin_sinepulse_allpass_update_count(h) == 2, "a changed param -> recompute");
    changed = soemdsp_robin_sinepulse_allpass_set_params(h, 127.6, 1, 15, 8000.5, 0, 1, 1, 0, fs);
    check(changed == 0, "Stages 127.6 rounds to 128 (no change)");
    check(soemdsp_robin_sinepulse_allpass_num_stages(h) == 128, "num_stages 128");
    soemdsp_robin_sinepulse_allpass_set_params(h, 300, 1, 15, 8000.5, 0, 1, 1, 0, fs);
    check(soemdsp_robin_sinepulse_allpass_num_stages(h) == 256, "Stages clamps to 256");
    soemdsp_robin_sinepulse_allpass_set_params(h, -3, 1, 15, 8000.5, 0, 1, 1, 0, fs);
    check(soemdsp_robin_sinepulse_allpass_num_stages(h) == 0, "Stages clamps to 0");
    soemdsp_robin_sinepulse_allpass_destroy(h);

    // Stage-count change keeps remaining stage states.
    h = soemdsp_robin_sinepulse_allpass_create();
    soemdsp_robin_sinepulse_allpass_set_params(h, 50, 1, 15, 8000, 0, 1, 1, 0, fs);
    for (int n = 0; n < 100; n++) soemdsp_robin_sinepulse_allpass_sample(h, n == 0, 0, 1, 1, 1, 1);
    const double before = sinepulse_allpass_probe_state_y1(h, 10);
    soemdsp_robin_sinepulse_allpass_set_params(h, 60, 1, 15, 8000, 0, 1, 1, 0, fs);
    check(before != 0.0 && sinepulse_allpass_probe_state_y1(h, 10) == before
          && sinepulse_allpass_probe_state_y1(h, 55) == 0.0,
          "Stages 50 -> 60 keeps stage 10's state, new stages start at 0");
    soemdsp_robin_sinepulse_allpass_destroy(h);

    // Idle.
    h = soemdsp_robin_sinepulse_allpass_create();
    soemdsp_robin_sinepulse_allpass_set_params(h, 50, 1, 15, 8000, 0, 1, 1, 0, fs);
    check(soemdsp_robin_sinepulse_allpass_is_idle(h) == 1, "idle before any input");
    soemdsp_robin_sinepulse_allpass_sample(h, 1.0, 0, 1, 1, 1, 1);
    check(soemdsp_robin_sinepulse_allpass_is_idle(h) == 0, "Trigger wakes it");
    int idleAt = -1;
    for (int n = 1; n < 20 * 48000; n++) {
      soemdsp_robin_sinepulse_allpass_sample(h, 0.0, 0, 1, 1, 1, 1);
      if (soemdsp_robin_sinepulse_allpass_is_idle(h)) { idleAt = n; break; }
    }
    char msg[160];
    std::snprintf(msg, sizeof msg, "goes idle after the zap rings out (%.2f s)", idleAt / fs);
    check(idleAt > 0, msg);
    soemdsp_robin_sinepulse_allpass_destroy(h);

    // Every param changes the output.
    auto render = [&](double st, double mode, double lo, double hi, double fsh, double ql, double qh,
                      double qs, double imp, double inp, double mix, double amp) {
      const int hh = soemdsp_robin_sinepulse_allpass_create();
      soemdsp_robin_sinepulse_allpass_set_params(hh, st, mode, lo, hi, fsh, ql, qh, qs, fs);
      std::vector<double> o(4800);
      for (int n = 0; n < 4800; n++)
        o[n] = soemdsp_robin_sinepulse_allpass_sample(hh, n == 0 ? 1.0 : 0.0, 0.2 * std::sin(0.05 * n),
                                                       imp, inp, mix, amp);
      soemdsp_robin_sinepulse_allpass_destroy(hh);
      return o;
    };
    const double base[12] = {50, 1, 15, 8000, 0.5, 0.7, 2.0, 0.5, 1.0, 0.5, 0.8, 0.9};
    const double alt[12] = {20, 0, 40, 3000, -1.5, 3.0, 0.3, -2.0, 0.4, -0.5, 0.3, 0.4};
    const char* pnames[12] = {"stages", "mode", "lowFreq", "highFreq", "freqShape", "lowQ", "highQ",
                              "qShape", "impulse", "input", "mix", "amplitude"};
    auto rb = render(base[0], base[1], base[2], base[3], base[4], base[5], base[6], base[7], base[8],
                     base[9], base[10], base[11]);
    bool allLive = true;
    for (int p = 0; p < 12; p++) {
      double v[12];
      std::memcpy(v, base, sizeof v);
      v[p] = alt[p];
      auto ro = render(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11]);
      double d = 0.0;
      for (size_t n = 0; n < ro.size(); n++) d = std::max(d, std::fabs(ro[n] - rb[n]));
      std::printf("    %-10s changes output by %.3e\n", pnames[p], d);
      if (!(d > 1e-6)) allLive = false;
    }
    check(allLive, "every param changes the output (biquad; no dead knobs)");

    // Sample path == block path.
    {
      Setup s{1, 128, 15, 8000, 0, 1, 1, 0, fs};
      auto x = make_input(false, 4096);
      const int ha = make_port(s);
      auto yb = run_port_blocks(ha, x);
      soemdsp_robin_sinepulse_allpass_destroy(ha);
      const int hb = make_port(s);
      bool same = true;
      for (size_t n = 0; n < x.size(); n++) {
        const double o = soemdsp_robin_sinepulse_allpass_sample(hb, 0.0, x[n], 1.0, 1.0, 1.0, 1.0);
        if (o != yb[n]) { same = false; break; }
      }
      soemdsp_robin_sinepulse_allpass_destroy(hb);
      check(same, "per-sample path == 32-sample block path (bit exact)");
    }
  }

  std::printf("\n%s (%d failures)\n", gFailures ? "FAILED" : "ALL PASS", gFailures);
  return gFailures ? 1 : 0;
}
