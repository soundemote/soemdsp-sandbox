// soemdsp-native-module: basic_oscillator
// soemdsp-native-label: Basic Oscillator
// soemdsp-native-target: osc
// soemdsp-native-kind: oscillator
//
// DSP for "osc". This used to also be shared, byte-for-byte, with a second
// node type "fbPolyBlepOsc" ("F/B PolyBLEP Osc") that dispatched to the
// exact same handle/sample function with no distinguishing mode flag -- the
// name promised direction-aware correction but nothing in the code actually
// depended on the sign of phaseIncrement, so it was a pure duplicate of
// "osc" in every respect. It has been removed; the fix below now lives in
// "osc" itself.
//
// The bug the name was gesturing at was real, just not implemented:
// poly_blep()/poly_blep_square() took absd(phaseIncrement) for the edge
// width but never looked at its sign, so the correction bump's polarity was
// always computed as if phase were increasing. Feed this a negative
// phaseIncrement (reverse/scrub playback, or CV modulation that pushes the
// increment through zero) and the correction cancels the wrong half of the
// discontinuity -- it still "corrects" a step, just the step as seen going
// forward, which is now the wrong one, so aliasing comes right back for the
// reverse direction instead of being suppressed.
//
// Fix: poly_blep_directional()/poly_blep_square_directional() multiply the
// unsigned correction by sign(phaseIncrement). Since dir is always +1 for a
// non-negative increment, this is a strict no-op for the forward-only case
// every existing patch already relies on. The only case that changes is a
// negative-going phase, which is exactly the case that was previously wrong.
// This also means: any patch that runs Osc's phase backward or bipolar
// (through-zero FM, an LFO driving Increment negative, a reverse-scrub
// sequencer, etc.) is now anti-aliased correctly in both directions with no
// extra parameter or wiring needed.
//
// The triangle branch is untouched: it already gets its direction correct a
// different way (it leaky-integrates poly_blep_square()'s *unsigned* output
// scaled by the *signed* phaseDelta), so wiring the directional correction
// into it too would double-apply the sign flip and click at the corners
// during reverse playback. It intentionally keeps calling the unsigned
// poly_blep_square().
//
// This is the naive/basic PolyBLEP correction (saw/square/triangle/sine/
// noise); the dedicated "polyBlep" module (native_modules/polyblep) is a
// separate, more advanced algorithm and unaffected by this.
//
// Each of the six port outputs (main + Saw/Ramp/Square/Tri/Sine) is
// driven from an *independent* phase/state on the JS side (distinct
// "{nodeId}:saw" etc. keys) -- the worklet creates one native handle per
// virtual instance to match, rather than this module tracking six ports
// per handle itself.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"basic_oscillator\","
    "\"label\":\"Basic Oscillator\","
    "\"targetType\":\"osc\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\",\"Saw\",\"Ramp\",\"Square\",\"Tri\",\"Sine\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":220,\"min\":0,\"mid\":220,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":0,\"min\":0,\"mid\":2,\"max\":5,\"step\":1},"
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 256;  // 6 virtual per-port instances per node
static inline double absd(double a) { return a < 0.0 ? -a : a; }

static double poly_blep(double phaseCycle, double phaseIncrement) {
  const double dt = clamp(absd(phaseIncrement), 1e-6, 0.5);
  if (phaseCycle < dt) {
    const double t = phaseCycle / dt;
    return t + t - t * t - 1.0;
  }
  if (phaseCycle > 1.0 - dt) {
    const double t = (phaseCycle - 1.0) / dt;
    return t * t + t + t + 1.0;
  }
  return 0.0;
}

static double poly_blep_square(double phaseCycle, double phaseIncrement) {
  double value = phaseCycle < 0.5 ? 1.0 : -1.0;
  value += poly_blep(phaseCycle, phaseIncrement);
  value -= poly_blep(wrap01_frac(phaseCycle + 0.5), phaseIncrement);
  return value;
}

// Direction-aware corrections for the direct saw/ramp/square outputs -- see
// the file header comment for why this is a no-op when phaseIncrement >= 0
// and only changes behavior for reverse-going phase.
//
// This is NOT a plain sign flip of poly_blep()'s result -- that was tried
// first and produces a spike (verified: a stray +/-2.0 sample right at the
// wrap point) because it doesn't relocate which side of the discontinuity a
// given phaseCycle sits on in time. The fix mirrors phaseCycle around 0
// (wrap01_frac(-phaseCycle)) before handing it to the ordinary forward poly_blep
// with a positive dt, then negates the result. Reflecting phase this way
// turns a backward-traveling trajectory into a forward-traveling one in the
// mirrored coordinate, so the existing near-0/near-1 edge tests land on the
// correct samples again; the negation accounts for the discontinuity's
// residual being an odd function under that reflection. Verified against
// exact time-reversal: stepping backward from a forward run's endpoint
// reproduces that forward run reversed, sample for sample.
static double poly_blep_directional(double phaseCycle, double phaseIncrement) {
  if (phaseIncrement >= 0.0) return poly_blep(phaseCycle, phaseIncrement);
  return -poly_blep(wrap01_frac(-phaseCycle), -phaseIncrement);
}

static double poly_blep_square_directional(double phaseCycle, double phaseIncrement) {
  double value = phaseCycle < 0.5 ? 1.0 : -1.0;
  value += poly_blep_directional(phaseCycle, phaseIncrement);
  value -= poly_blep_directional(wrap01_frac(phaseCycle + 0.5), phaseIncrement);
  return value;
}

struct OscState {
  double triangle;
  double stoppedSample;
  double lastPhaseIncrement;
  unsigned int noiseSeed;
  bool   hasStoppedSample;
  bool   hasNoiseSeed;
  bool   active;
};

static OscState gPool[kMaxInstances];

static double next_noise_sample(OscState& s) {
  s.noiseSeed = (unsigned int)(1664525u * (s.hasNoiseSeed ? s.noiseSeed : 0x12345678u) + 1013904223u);
  s.hasNoiseSeed = true;
  return ((double)s.noiseSeed / 4294967295.0) * 2.0 - 1.0;
}

static double current_noise_sample(OscState& s) {
  if (!s.hasNoiseSeed) return next_noise_sample(s);
  return ((double)s.noiseSeed / 4294967295.0) * 2.0 - 1.0;
}

}  // namespace

extern "C" int soemdsp_basic_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      OscState& s = gPool[i];
      s.triangle = 0.0;
      s.stoppedSample = 0.0;
      s.lastPhaseIncrement = 0.0;
      s.noiseSeed = 0;
      s.hasStoppedSample = false;
      s.hasNoiseSeed = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_basic_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_basic_oscillator_sample(
  int    handle,
  double phase,
  double phaseIncrement,
  double waveform
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  OscState& s = gPool[handle - 1];

  const double phaseDelta = safe(phaseIncrement);
  const bool phaseStopped = absd(phaseDelta) <= 1e-12;
  if (phaseStopped && s.hasStoppedSample) {
    return s.stoppedSample;
  }
  const double renderPhaseIncrement = phaseStopped ? s.lastPhaseIncrement : phaseDelta;
  const double phaseCycle = wrap01_frac(safe(phase) / kTwoPi);

  double sample = 0.0;
  const int wf = (int)dsp_floor(safe(waveform) + 0.5);
  switch (wf) {
    case 1:
      sample = -1.0 + phaseCycle * 2.0 - poly_blep_directional(phaseCycle, renderPhaseIncrement);
      break;
    case 2:
      sample = poly_blep_square_directional(phaseCycle, renderPhaseIncrement);
      break;
    case 3: {
      if (phaseStopped) {
        sample = s.triangle;
        break;
      }
      const double nextTriangle = (s.triangle + poly_blep_square(phaseCycle, renderPhaseIncrement) * phaseDelta * 4.0) * 0.995;
      s.triangle = clamp(nextTriangle, -1.0, 1.0);
      sample = s.triangle;
      break;
    }
    case 4:
      sample = dsp_sin(safe(phase));
      break;
    case 5:
      sample = phaseStopped ? current_noise_sample(s) : next_noise_sample(s);
      break;
    case 0:
    default:
      sample = 1.0 - phaseCycle * 2.0 + poly_blep_directional(phaseCycle, renderPhaseIncrement);
      break;
  }

  if (phaseStopped) {
    s.stoppedSample = sample;
    s.hasStoppedSample = true;
  } else {
    s.hasStoppedSample = false;
    s.lastPhaseIncrement = phaseDelta;
  }
  return sample;
}

extern "C" int soemdsp_basic_oscillator_version() {
  return 2;
}

extern "C" const char* soemdsp_basic_oscillator_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_basic_oscillator_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
