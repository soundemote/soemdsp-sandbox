// Parity harness: Robin Sinepulse (native_modules/robin_sinepulse/robin_sinepulse.cpp) vs Robin Schmidt's
// rosic::rsSweepKicker (RS-MET, native_modules/robin_sinepulse/originalcode/, unmodified).
// docs/KICK_PLAN.md "Parity test against Robin's original".
//
// Build + run: python scripts/parity_robin_sinepulse.py
//   (or by hand, from the repo root:
//    clang++ -std=c++17 -O2 -I library/include scripts/parity_robin_sinepulse.cpp
//            scripts/parity_robin_sinepulse_port_probe.cpp -o parity_robin_sinepulse && ./parity_robin_sinepulse)
//
// Reference: rsSweepKicker, setters, noteOn(69, 64) (key A4 -> factor 1,
// velocity unused), FadeOut 0, left channel.
// Port: same params, Trigger (height 1) on sample 0 (= Robin's hard reset:
// zeroes phase, restarts sweep), Decay at its max (4 s), Out / Env removes
// the added envelope.
// Compared per sample: audio, instantaneous frequency, phase accumulator.
// Then the sandbox-only behaviour (Decay, Trigger hard-resets phase, fHi clamp).
// Exit code 0 = all checks pass and the output hashes match.

#include <cfloat>
#include <cinttypes>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "parity_robin_sinepulse_rapt_stub.h"
#define protected public  // read rsFreqSweeper's instPhase / instFreq (test only)
#include "../native_modules/robin_sinepulse/originalcode/rosic_MiscUnfinished_SweepKicker.h"
namespace rosic {
#include "../native_modules/robin_sinepulse/originalcode/rosic_MiscUnfinished_SweepKicker.cpp"
}
#undef protected

extern "C" {
int soemdsp_robin_sinepulse_create();
void soemdsp_robin_sinepulse_destroy(int handle);
double soemdsp_robin_sinepulse_sample(int handle, double trigger, double highFreq,
                           double lowFreq, double sweepTime, double chirp, double chirpShape,
                           double wave, double waveShape, double phase, double decay,
                           double amplitude, double sampleRate);
double soemdsp_robin_sinepulse_env(int handle);
int soemdsp_robin_sinepulse_is_idle(int handle);
double sinepulse_probe_inst_phase(int h);
double sinepulse_probe_inst_freq(int h);
double sinepulse_probe_fhi(int h);
double sinepulse_probe_flo(int h);
double sinepulse_probe_tri_saw(double pos01, double m);
double sinepulse_probe_wave(int wave, double pos01, double waveShape);
double sinepulse_probe_sin_lut(double turns);
}

namespace {

int gFailures = 0;

void check(bool ok, const char* what) {
  std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
  if (!ok) gFailures++;
}

double db(double x) { return x > 0.0 ? 20.0 * std::log10(x) : -INFINITY; }

double wrap_half(double d) {  // phase difference into [-0.5, 0.5)
  d -= std::floor(d + 0.5);
  return d;
}

struct Fnv {
  uint64_t h = 1469598103934665603ULL;
  void add(double x) {
    unsigned char b[8];
    std::memcpy(b, &x, 8);
    for (int i = 0; i < 8; i++) { h ^= b[i]; h *= 1099511628211ULL; }
  }
};

struct Case {
  std::string name;
  double fs = 48000.0;
  double fHi = 10000.0;
  double fLo = 0.0;
  double sweepMs = 200.0;
  double chirp = 0.0;
  double shape = 0.0;
  int wave = 0;
  double waveParam = 0.0;
  double phaseDeg = 0.0;
  double seconds = 1.0;
  int chirpChangeAt = -1;
  double chirpChangeTo = 0.0;
  int retrigAt = -1;
};

struct Result {
  double audio = 0.0, freqRel = 0.0, phase = 0.0;
  bool finite = true;
  bool exactPath = true;
};

Fnv gRefHash, gPortHash;

Result run_case(const Case& c) {
  const int N = (int)(c.seconds * c.fs);
  Result r;
  r.exactPath = c.chirp == 0.0 && c.shape == 0.0 && (c.chirpChangeAt < 0 || c.chirpChangeTo == 0.0);

  rosic::rsSweepKicker k;
  k.setSampleRate(c.fs);
  k.setHighFreq(c.fHi);
  k.setLowFreq(c.fLo);
  k.setSweepTimeInMs(c.sweepMs);
  k.setChirpAmount(c.chirp);
  k.setChirpShape(c.shape);
  k.setWaveForm(c.wave);
  k.setWaveFormParameter(c.waveParam);
  k.setStartPhase(c.phaseDeg);
  k.setStereoPhaseShift(0.0);
  k.setFadeOutTimeMs(0.0);
  k.noteOn(69, 64);

  const int h = soemdsp_robin_sinepulse_create();
  const double sweepTime = 0.001 * c.sweepMs;      // setSweepTimeInMs
  const double phase = c.phaseDeg * (1.0 / 360.0);  // setStartPhase
  double chirp = c.chirp;
  for (int n = 0; n < N; n++) {
    if (n == c.chirpChangeAt) { k.setChirpAmount(c.chirpChangeTo); chirp = c.chirpChangeTo; }
    if (n == c.retrigAt) k.noteOn(69, 64);
    double L = 0.0, R = 0.0;
    k.getSampleFrameStereo(&L, &R);
    const double refPhase = k.freqSweeper.instPhase;
    const double refFreq = k.freqSweeper.instFreq;

    const double hit = (n == 0 || n == c.retrigAt) ? 1.0 : 0.0;
    const double sig = soemdsp_robin_sinepulse_sample(h, hit, c.fHi, c.fLo, sweepTime, chirp, c.shape,
                                            (double)c.wave, c.waveParam, phase, 4.0, 1.0, c.fs);
    const double env = soemdsp_robin_sinepulse_env(h);
    const double y = sig / env;
    const double pPhase = sinepulse_probe_inst_phase(h);
    const double pFreq = sinepulse_probe_inst_freq(h);

    gRefHash.add(L);
    gPortHash.add(sig);
    if (!std::isfinite(sig) || !std::isfinite(env) || std::fpclassify(sig) == FP_SUBNORMAL) r.finite = false;
    r.audio = std::fmax(r.audio, std::fabs(y - L));
    r.freqRel = std::fmax(r.freqRel, std::fabs(pFreq - refFreq) / std::fabs(refFreq));
    r.phase = std::fmax(r.phase, std::fabs(wrap_half(pPhase - refPhase)));
  }
  soemdsp_robin_sinepulse_destroy(h);
  return r;
}

// Simple render through the C API (sandbox-only checks).
struct Hit {
  std::vector<double> sig, env, phase, freq;
};

struct Params {
  double fHi = 10000.0, fLo = 0.0, sweep = 0.2, chirp = 0.0, shape = 0.0, wave = 0.0,
         waveShape = 0.0, phase = 0.0, decay = 0.5, amp = 1.0, fs = 48000.0;
};

double step(int h, const Params& p, double trig) {
  return soemdsp_robin_sinepulse_sample(h, trig, p.fHi, p.fLo, p.sweep, p.chirp, p.shape, p.wave,
                             p.waveShape, p.phase, p.decay, p.amp, p.fs);
}

Hit render(int h, const Params& p, int N, const std::vector<int>& trigAt,
           double height = 1.0) {
  Hit out;
  for (int n = 0; n < N; n++) {
    double t = 0.0;
    for (int i : trigAt) if (i == n) t = height;
    out.sig.push_back(step(h, p, t));
    out.env.push_back(soemdsp_robin_sinepulse_env(h));
    out.phase.push_back(sinepulse_probe_inst_phase(h));
    out.freq.push_back(sinepulse_probe_inst_freq(h));
  }
  return out;
}

bool clean(const std::vector<double>& v) {
  for (double x : v) if (!std::isfinite(x) || std::fpclassify(x) == FP_SUBNORMAL) return false;
  return true;
}

double max_abs_diff(const std::vector<double>& a, const std::vector<double>& b) {
  double m = 0.0;
  for (size_t i = 0; i < a.size() && i < b.size(); i++) m = std::fmax(m, std::fabs(a[i] - b[i]));
  return m;
}

}  // namespace

int main() {
  // ---------------------------------------------------------------- LUT error
  double lutErr = 0.0;
  for (int i = 0; i < 4000000; i++) {
    const double x = (i + 0.37) / 4000000.0;
    lutErr = std::fmax(lutErr, std::fabs(sinepulse_probe_sin_lut(x) - std::sin(2.0 * PI * x)));
  }
  std::printf("dsp_sin_turns_lut vs std::sin: max abs %.3e (%.1f dB)\n\n", lutErr, db(lutErr));

  // Tolerances. Exact path (Chirp = Chirp Shape = 0): the port evaluates Robin's
  // expressions with p = q = 1 (every pow is the identity), so frequency and
  // phase must match to 1e-9 (plan). Pow path: the library's dsp_exp / dsp_ln
  // (~1e-6 relative, no libm in wasm) set the floor; the plan's 1e-9 is not
  // reachable without a double-precision pow in library/ (Architect gate).
  const double kExactTol = 1e-9;
  const double kSineTol = lutErr + 1e-9;
  const double kPowFreqTol = 5e-6;    // measured 2.3e-6 (3 chained dsp_exp/dsp_ln)
  const double kPowPhaseTol = 2e-4;   // cycles after 1 s, measured 5.3e-5
  const double kPowAudioTol = 2e-3;   // measured 3.3e-4 (-70 dB), a tiny phase lag

  std::vector<Case> cases;
  auto add = [&](Case c) { cases.push_back(c); };
  { Case c; c.name = "defaults"; add(c); }
  for (double lo : {0.0, 50.0, 400.0}) { Case c; c.name = "lowFreq " + std::to_string((int)lo); c.fLo = lo; add(c); }
  for (double ms : {50.0, 500.0}) { Case c; c.name = "sweepTime " + std::to_string((int)ms) + " ms"; c.sweepMs = ms; add(c); }
  for (double ch : {-1.0, 0.0, 1.0})
    for (double sh : {-1.0, 0.0, 1.0}) {
      Case c; char b[64]; std::snprintf(b, sizeof b, "chirp %+.0f shape %+.0f", ch, sh);
      c.name = b; c.chirp = ch; c.shape = sh; add(c);
    }
  const char* waveNames[] = {"Sine", "SinFatSaw", "TriSaw"};
  for (int w = 0; w < 3; w++)
    for (double wp : {-1.0, -0.5, 0.0, 0.5, 0.99}) {
      Case c; char b[64]; std::snprintf(b, sizeof b, "%s param %+.2f", waveNames[w], wp);
      c.name = b; c.wave = w; c.waveParam = wp; add(c);
    }
  for (double ph : {90.0, -90.0}) { Case c; c.name = "phase " + std::to_string((int)ph) + " deg"; c.phaseDeg = ph; add(c); }
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    Case c; c.name = "fs " + std::to_string((int)fs); c.fs = fs; add(c);
    Case t = c; t.name += " TriSaw +0.5"; t.wave = 2; t.waveParam = 0.5; add(t);
  }
  { Case c; c.name = "mid-hit chirp 0 -> +0.5 at 50 ms"; c.chirpChangeAt = 2400; c.chirpChangeTo = 0.5; add(c); }
  { Case c; c.name = "retrigger 30 ms (Trigger hard-reset)"; c.retrigAt = 1440; add(c); }
  { Case c; c.name = "retrigger 30 ms TriSaw -0.5, lowFreq 50"; c.retrigAt = 1440; c.wave = 2; c.waveParam = -0.5; c.fLo = 50.0; add(c); }
  { Case c; c.name = "highFreq 20000 (Nyquist clamp at 44.1k... 22050)"; c.fHi = 20000.0; c.fs = 44100.0; add(c); }
  { Case c; c.name = "highFreq 500, lowFreq 400, TriSaw +0.99"; c.fHi = 500.0; c.fLo = 400.0; c.wave = 2; c.waveParam = 0.99; add(c); }

  std::printf("%-46s %5s %12s %12s %12s %9s\n", "case", "path", "audio max", "freq rel", "phase cyc", "audio dB");
  double worstExactAudioTri = 0.0, worstExactAudioSin = 0.0, worstExactFreq = 0.0, worstExactPhase = 0.0;
  double worstPowAudio = 0.0, worstPowFreq = 0.0, worstPowPhase = 0.0;
  bool allFinite = true, tolOk = true;
  for (const Case& c : cases) {
    const Result r = run_case(c);
    allFinite = allFinite && r.finite;
    std::printf("%-46s %5s %12.3e %12.3e %12.3e %9.1f\n", c.name.c_str(), r.exactPath ? "exact" : "pow",
                r.audio, r.freqRel, r.phase, db(r.audio));
    if (r.exactPath) {
      worstExactFreq = std::fmax(worstExactFreq, r.freqRel);
      worstExactPhase = std::fmax(worstExactPhase, r.phase);
      if (c.wave == 2) worstExactAudioTri = std::fmax(worstExactAudioTri, r.audio);
      else worstExactAudioSin = std::fmax(worstExactAudioSin, r.audio);
      const double audioTol = c.wave == 2 ? kExactTol : kSineTol;
      if (!(r.freqRel <= kExactTol && r.phase <= kExactTol && r.audio <= audioTol)) tolOk = false;
    } else {
      worstPowAudio = std::fmax(worstPowAudio, r.audio);
      worstPowFreq = std::fmax(worstPowFreq, r.freqRel);
      worstPowPhase = std::fmax(worstPowPhase, r.phase);
      if (!(r.freqRel <= kPowFreqTol && r.phase <= kPowPhaseTol && r.audio <= kPowAudioTol)) tolOk = false;
    }
  }
  std::printf("\nParity summary (%zu cases):\n", cases.size());
  std::printf("  exact path: freq rel %.3e, phase %.3e cyc, TriSaw audio %.3e, Sine/SinFatSaw audio %.3e (%.1f dB)\n",
              worstExactFreq, worstExactPhase, worstExactAudioTri, worstExactAudioSin, db(worstExactAudioSin));
  std::printf("  pow path:   freq rel %.3e, phase %.3e cyc, audio %.3e (%.1f dB)\n",
              worstPowFreq, worstPowPhase, worstPowAudio, db(worstPowAudio));
  check(tolOk, "all parity cases within tolerance (exact 1e-9 / Sine LUT; pow path dsp_exp floor)");
  check(allFinite, "parity outputs finite, no denormals");

  // ------------------------------------------------------ sandbox-only checks
  std::printf("\nSandbox-only behaviour:\n");
  const int N = 48000;
  Params P;

  {  // silent before Trigger
    const int h = soemdsp_robin_sinepulse_create();
    Hit a = render(h, P, 4800, {});
    bool silent = true;
    for (double x : a.sig) silent = silent && x == 0.0;
    for (double x : a.env) silent = silent && x == 0.0;
    check(silent && soemdsp_robin_sinepulse_is_idle(h), "silent (exact 0) before the first Trigger");
    soemdsp_robin_sinepulse_destroy(h);
  }
  {  // Env peaks at v, reaches exact 0; velocity = |height|
    Params q = P; q.decay = 0.02;
    const int h = soemdsp_robin_sinepulse_create();
    Hit a = render(h, q, N, {0}, -0.7);
    double peak = 0.0; int zeroAt = -1;
    for (int n = 0; n < N; n++) { peak = std::fmax(peak, a.env[n]); if (zeroAt < 0 && a.env[n] == 0.0) zeroAt = n; }
    bool tailZero = zeroAt > 0;
    for (int n = zeroAt; tailZero && n < N; n++) tailZero = a.env[n] == 0.0 && a.sig[n] == 0.0;
    // T60: env at decay seconds is 1e-3 * v
    const double t60 = a.env[(int)(0.02 * 48000.0)] / 0.7;
    std::printf("    env[0] = %.17g, env(T60)/v = %.6e, exact 0 from sample %d (%.1f ms)\n", a.env[0], t60, zeroAt, zeroAt / 48.0);
    check(a.env[0] == 0.7 && peak == 0.7, "Env peaks at v = |height| (0.7) on the hit sample");
    check(std::fabs(t60 - 1e-3) < 1e-5, "Decay is T60: Env = v/1000 after Decay seconds");
    check(tailZero && soemdsp_robin_sinepulse_is_idle(h), "Env and Out reach exact 0 and stay there (idle)");
    soemdsp_robin_sinepulse_destroy(h);
  }
  {  // Trigger mid-hit hard-resets phase (Robin's noteOn): bit-exact vs a fresh hit
    Params q = P; q.chirp = 0.4; q.shape = -0.3; q.wave = 1.0; q.waveShape = 0.6; q.phase = 0.05;
    const int hA = soemdsp_robin_sinepulse_create();
    Hit a = render(hA, q, N, {0, 1440});
    const int hF = soemdsp_robin_sinepulse_create();
    Hit f = render(hF, q, N - 1440, {0});
    bool exact = true;
    for (int k = 0; k < N - 1440; k++) exact = exact && a.sig[1440 + k] == f.sig[k] && a.env[1440 + k] == f.env[k];
    std::printf("    mid-hit Trigger: phase before %.12f -> after %.12f, env %.3f\n",
                a.phase[1439], a.phase[1440], a.env[1440]);
    check(a.phase[1439] != 0.0 && a.sig[1440] == f.sig[0] && a.env[1440] == 1.0,
          "Trigger mid-hit zeroes phase and restarts Env at v");
    check(exact, "Trigger mid-hit = Robin's hard reset (bit-exact vs a fresh first hit)");
    soemdsp_robin_sinepulse_destroy(hA); soemdsp_robin_sinepulse_destroy(hF);
  }
  {  // a hit after silence also hard-resets (first sample = fresh zero-phase)
    Params q = P; q.decay = 0.05; q.wave = 2.0; q.waveShape = 0.3; q.phase = 0.1;
    const int h = soemdsp_robin_sinepulse_create();
    Hit a = render(h, q, N, {0});
    const bool idle = soemdsp_robin_sinepulse_is_idle(h) != 0;
    const int hF = soemdsp_robin_sinepulse_create();
    Hit f = render(hF, q, 10, {0});
    Hit b = render(h, q, 10, {0});
    std::printf("    after silence: first sample %.12f, fresh %.12f\n", b.sig[0], f.sig[0]);
    check(idle && b.sig[0] == f.sig[0], "hit after silence hard-resets phase (matches a fresh hit)");
    soemdsp_robin_sinepulse_destroy(h); soemdsp_robin_sinepulse_destroy(hF);
  }
  {  // fHi clamp
    Params q = P; q.fHi = 40.0; q.decay = 4.0;
    const int h = soemdsp_robin_sinepulse_create();
    Hit a = render(h, q, 10 * 48000, {0});
    bool monotone = true, finite = clean(a.sig) && clean(a.freq);
    double fmaxSeen = 0.0;
    for (size_t n = 1; n < a.freq.size(); n++) {
      if (a.env[n] == 0.0) break;
      fmaxSeen = std::fmax(fmaxSeen, a.freq[n]);
      if (a.freq[n] > a.freq[n - 1] + 1e-9) monotone = false;
    }
    std::printf("    highFreq 40 Hz: latched fHi %.3f Hz, max inst freq %.6f Hz over the hit\n", sinepulse_probe_fhi(h), fmaxSeen);
    // Robin's original with fHi = 40: frequency rises to a singularity.
    rosic::rsSweepKicker k;
    k.setSampleRate(48000.0); k.setHighFreq(40.0); k.setLowFreq(0.0); k.setSweepTimeInMs(200.0);
    k.setFadeOutTimeMs(0.0); k.noteOn(69, 64);
    double robinMax = 0.0;
    for (int n = 0; n < 2 * 48000; n++) { double L, R; k.getSampleFrameStereo(&L, &R); robinMax = std::fmax(robinMax, k.freqSweeper.instFreq); }
    std::printf("    (Robin's original at 40 Hz: inst freq reaches %.3g Hz within 2 s)\n", robinMax);
    check(sinepulse_probe_fhi(h) == 50.0 && monotone && finite && fmaxSeen <= 50.0, "fHi clamp: 40 Hz -> 50 Hz, no upward sweep, finite");
    soemdsp_robin_sinepulse_destroy(h);
    const int h2 = soemdsp_robin_sinepulse_create();
    Params n2 = P; n2.fHi = 30000.0; n2.fLo = 30000.0; n2.fs = 44100.0;
    render(h2, n2, 10, {0});
    check(sinepulse_probe_fhi(h2) == 22050.0 && sinepulse_probe_flo(h2) == 22050.0, "Nyquist clamp: High/Low Freq above fs/2 latch fs/2");
    soemdsp_robin_sinepulse_destroy(h2);
    const int h3 = soemdsp_robin_sinepulse_create();
    Params n3 = P; n3.fLo = -100.0;
    render(h3, n3, 10, {0});
    check(sinepulse_probe_flo(h3) == 0.0, "Low Freq below 0 latches 0");
    soemdsp_robin_sinepulse_destroy(h3);
  }
  {  // TriSaw P = +1 guard
    const double m = 1.0;  // triSawParamMap(+1) = 1
    const double y = sinepulse_probe_tri_saw(0.5, m);
    const double robin = RAPT::rsTriSaw(2 * PI * 0.5, m);
    std::printf("    TriSaw P=+1 at x=0.5: port %.3f, Robin %f\n", y, robin);
    check(std::isfinite(y) && y == 1.0, "TriSaw P = +1 guard (x = 0.5 gives 1, Robin's gives 0/0)");
    bool same = true;
    for (int i = 0; i < 1000; i++) {
      const double x = (i + 0.5) / 1000.0;
      for (double mm : {-1.0, -0.4, 0.0, 0.7, 1.0})
        same = same && std::fabs(sinepulse_probe_tri_saw(x, mm) - RAPT::rsTriSaw(2 * PI * x, mm)) < 1e-12;
    }
    check(same, "TriSaw equals RAPT::rsTriSaw elsewhere (m = -1 ... +1)");
  }
  {  // no NaN / denormals under abuse
    const int h = soemdsp_robin_sinepulse_create();
    bool ok = true;
    const double vals[] = {0.0, -1.0, 1e9, -1e9, NAN, INFINITY, 1e-320};
    for (double v : vals) {
      Params q = P; q.fHi = v; q.fLo = v; q.sweep = v; q.chirp = v; q.shape = v; q.wave = v;
      q.waveShape = v; q.phase = v; q.decay = v; q.amp = std::isfinite(v) ? 1.0 : v;
      Hit a = render(h, q, 4800, {0, 2400}, {1200});
      ok = ok && clean(a.sig) && clean(a.env);
    }
    for (double ch : {-1.0, 1.0}) for (double sh : {-1.0, 1.0}) for (double w : {0.0, 1.0, 2.0}) {
      Params q = P; q.chirp = ch; q.shape = sh; q.wave = w; q.waveShape = 1.0; q.fLo = 400.0;
      q.sweep = 0.05; q.decay = 4.0; q.fHi = 20000.0;
      Hit a = render(h, q, 10 * 48000, {0});
      ok = ok && clean(a.sig) && clean(a.env);
    }
    check(ok, "no NaN / inf / denormals (extreme and invalid params, 10 s hits)");
    soemdsp_robin_sinepulse_destroy(h);
  }
  {  // no dead knobs
    auto hit = [&](const Params& q) {
      const int h = soemdsp_robin_sinepulse_create();
      Hit a = render(h, q, 9600, {0});
      soemdsp_robin_sinepulse_destroy(h);
      return a.sig;
    };
    Params base = P; base.wave = 2.0;  // TriSaw so Wave Shape is audible
    const std::vector<double> ref = hit(base);
    struct K { const char* name; Params p; } knobs[] = {
      {"highFreq", base}, {"lowFreq", base}, {"sweepTime", base}, {"chirp", base},
      {"chirpShape", base}, {"wave", base}, {"waveShape", base}, {"phase", base},
      {"decay", base}, {"amplitude", base},
    };
    knobs[0].p.fHi = 5000.0; knobs[1].p.fLo = 100.0; knobs[2].p.sweep = 0.1; knobs[3].p.chirp = 0.5;
    knobs[4].p.shape = 0.5; knobs[5].p.wave = 1.0; knobs[6].p.waveShape = 0.5; knobs[7].p.phase = 0.1;
    knobs[8].p.decay = 0.2; knobs[9].p.amp = 0.5;
    bool all = true;
    for (auto& kn : knobs) {
      const double d = max_abs_diff(hit(kn.p), ref);
      std::printf("    %-10s changes output by %.3e\n", kn.name, d);
      all = all && d > 1e-3;
    }
    check(all, "every param changes the output (no dead knobs)");
  }

  // ------------------------------------------------------------------ hashes
  // FNV-1a over every Out sample of the parity cases (2026-10-06). The port uses
  // no libm, so its hash is a hard check (update only when robin_sinepulse.cpp or the case
  // list changes on purpose). Robin's reference calls libm pow/sin, so its hash
  // is only expected to match on x86-64 Linux glibc (box); elsewhere it warns.
  const uint64_t kExpectedRefHash = 0xbc1a38c7529a1b22ULL;
  const uint64_t kExpectedPortHash = 0x826af321d4d7c571ULL;
  std::printf("\nHashes: reference 0x%016" PRIx64 ", port 0x%016" PRIx64 "\n", gRefHash.h, gPortHash.h);
  check(gPortHash.h == kExpectedPortHash, "port output hash matches the recorded one");
  if (gRefHash.h != kExpectedRefHash) {
    std::printf("  [WARN] reference hash differs from the glibc recording (libm-dependent)\n");
  }

  std::printf("\n%s (%d failure%s)\n", gFailures ? "FAILED" : "ALL PASS", gFailures, gFailures == 1 ? "" : "s");
  return gFailures ? 1 : 0;
}
