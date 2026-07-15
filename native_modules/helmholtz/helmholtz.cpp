// soemdsp-native-module: helmholtz
// soemdsp-native-label: Helmholtz Pitch
// soemdsp-native-target: helmholtzPitch
// soemdsp-native-kind: analysis

// Monophonic pitch detector using the McLeod Pitch Method: NSDF over a
// sliding window, peak picking, and parabolic interpolation.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 4;
constexpr int kMaxWindow = 1024;
constexpr int kMinWindow = 128;
constexpr int kDefaultWindow = 512;
constexpr double kAnalysisRateHz = 20.0;

static bool finited(double v) {
  return v == v && v > -1.0e15 && v < 1.0e15;
}

struct HelmholtzState {
  bool active;

  double ring[kMaxWindow];
  int writeIndex;
  int filled;       // samples written so far, capped at kMaxWindow
  int hopCounter;

  double sampleRate;
  int windowSize;
  int analysisIntervalSamples;
  double threshold;  // fidelity threshold, 0..1 (MPM default ~0.93)

  double nsdf[kMaxWindow];

  double frequencyOut;
  double fidelityOut;

  void init(double sr) {
    active = true;
    for (int i = 0; i < kMaxWindow; i++) ring[i] = 0.0;
    writeIndex = 0;
    filled = 0;
    hopCounter = 0;
    sampleRate = sr > 0.0 ? sr : 44100.0;
    windowSize = kDefaultWindow;
    analysisIntervalSamples = (int)(sampleRate / kAnalysisRateHz + 0.5);
    if (analysisIntervalSamples < 1) analysisIntervalSamples = 1;
    threshold = 0.93;
    frequencyOut = 0.0;
    fidelityOut = 0.0;
  }
};

static HelmholtzState gPool[kMaxInstances];
static bool gPoolInit = false;

static void ensurePool() {
  if (gPoolInit) return;
  for (int i = 0; i < kMaxInstances; i++) gPool[i].active = false;
  gPoolInit = true;
}

static HelmholtzState* get(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  HelmholtzState* s = &gPool[handle - 1];
  return s->active ? s : nullptr;
}

// Runs MPM analysis over the most recent `windowSize` samples in the ring
// buffer and updates frequencyOut / fidelityOut.
static void analyze(HelmholtzState& s) {
  const int w = s.windowSize;
  // Oldest-to-newest copy of the analysis window, starting one slot ahead
  // of the next write position (i.e. the oldest sample still in range).
  static double win[kMaxWindow];
  const int start = (s.writeIndex - w + kMaxWindow * 4) % kMaxWindow;
  for (int i = 0; i < w; i++) {
    win[i] = s.ring[(start + i) % kMaxWindow];
  }

  // NSDF(tau) = 2 * sum(x[j]*x[j+tau]) / sum(x[j]^2 + x[j+tau]^2), j in [0, w-tau)
  const int maxLag = w - 1;
  s.nsdf[0] = 1.0;
  for (int tau = 1; tau <= maxLag; tau++) {
    double acf = 0.0;
    double energy = 0.0;
    const int n = w - tau;
    for (int j = 0; j < n; j++) {
      const double a = win[j];
      const double b = win[j + tau];
      acf += a * b;
      energy += a * a + b * b;
    }
    s.nsdf[tau] = energy > 1.0e-12 ? (2.0 * acf / energy) : 0.0;
  }

  // Key-maximum peak picking: within each region between a negative->
  // positive and the following positive->negative zero crossing, find the
  // local max. Among all such candidates, take the first one whose value
  // is within `threshold` of the global best (avoids octave-down errors).
  double bestValue = -1.0;
  for (int tau = 1; tau <= maxLag; tau++) {
    if (s.nsdf[tau] > bestValue) bestValue = s.nsdf[tau];
  }
  if (bestValue <= 0.0) {
    s.fidelityOut = 0.0;
    s.frequencyOut = 0.0;
    return;
  }

  int chosenTau = -1;
  double chosenValue = 0.0;
  int tau = 1;
  while (tau < maxLag) {
    // advance to a negative-to-positive crossing
    while (tau < maxLag && !(s.nsdf[tau - 1] < 0.0 && s.nsdf[tau] >= 0.0)) tau++;
    if (tau >= maxLag) break;
    int peakTau = tau;
    double peakValue = s.nsdf[tau];
    tau++;
    while (tau < maxLag && s.nsdf[tau] >= 0.0) {
      if (s.nsdf[tau] > peakValue) {
        peakValue = s.nsdf[tau];
        peakTau = tau;
      }
      tau++;
    }
    if (peakValue >= s.threshold * bestValue) {
      chosenTau = peakTau;
      chosenValue = peakValue;
      break;
    }
  }

  if (chosenTau < 1) {
    s.fidelityOut = bestValue;
    s.frequencyOut = 0.0;
    return;
  }

  // 3-point parabolic interpolation around the chosen peak.
  double refinedTau = (double)chosenTau;
  double refinedValue = chosenValue;
  if (chosenTau > 0 && chosenTau < maxLag) {
    const double y0 = s.nsdf[chosenTau - 1];
    const double y1 = s.nsdf[chosenTau];
    const double y2 = s.nsdf[chosenTau + 1];
    const double denom = (y0 - 2.0 * y1 + y2);
    if (denom != 0.0) {
      const double delta = 0.5 * (y0 - y2) / denom;
      if (delta > -1.0 && delta < 1.0) {
        refinedTau += delta;
        refinedValue = y1 - 0.25 * (y0 - y2) * delta;
      }
    }
  }

  s.fidelityOut = clamp(refinedValue, 0.0, 1.0);
  if (refinedTau > 0.0 && s.fidelityOut >= s.threshold) {
    s.frequencyOut = s.sampleRate / refinedTau;
  } else {
    s.frequencyOut = 0.0;
  }
}

}  // namespace

extern "C" int soemdsp_helmholtz_version() { return 1; }

extern "C" int soemdsp_helmholtz_create(double sampleRate) {
  ensurePool();
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].init(sampleRate);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_helmholtz_destroy(int handle) {
  ensurePool();
  if (handle >= 1 && handle <= kMaxInstances) {
    gPool[handle - 1].active = false;
  }
}

extern "C" void soemdsp_helmholtz_set_params(
  int handle,
  double sampleRate,
  int windowSize,
  double threshold
) {
  HelmholtzState* s = get(handle);
  if (!s) return;
  s->sampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
  int w = windowSize < kMinWindow ? kMinWindow : (windowSize > kMaxWindow ? kMaxWindow : windowSize);
  s->windowSize = w;
  s->analysisIntervalSamples = (int)(s->sampleRate / kAnalysisRateHz + 0.5);
  if (s->analysisIntervalSamples < 1) s->analysisIntervalSamples = 1;
  s->threshold = clamp(threshold, 0.5, 0.999);
}

extern "C" void soemdsp_helmholtz_process(int handle, double input) {
  HelmholtzState* s = get(handle);
  if (!s) return;

  const double x = finited(input) ? input : 0.0;
  s->ring[s->writeIndex] = x;
  s->writeIndex = (s->writeIndex + 1) % kMaxWindow;
  if (s->filled < kMaxWindow) s->filled++;
  s->hopCounter++;

  if (s->filled >= s->windowSize && s->hopCounter >= s->analysisIntervalSamples) {
    s->hopCounter = 0;
    analyze(*s);
  }
}

extern "C" double soemdsp_helmholtz_frequency(int handle) {
  const HelmholtzState* s = get(handle);
  return s ? s->frequencyOut : 0.0;
}

extern "C" double soemdsp_helmholtz_fidelity(int handle) {
  const HelmholtzState* s = get(handle);
  return s ? s->fidelityOut : 0.0;
}
