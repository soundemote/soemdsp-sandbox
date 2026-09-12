// Silence detector — soemdsp::dynamics::SilenceDetector freestanding port.
// abs(in) above threshold resets; ~holdSeconds of continuous quiet → idle.
#pragma once

#include "scalar_helpers.h"

namespace soemdsp_maths {

struct SilenceDetector {
  double counter;
  double increment; // advances 0→1 over holdSeconds at current sample rate
  double threshold;
  int isSilent; // 1 = idle / silent
};

static inline void silence_detector_init(SilenceDetector* d, double sampleRate, double holdSeconds) {
  if (!d) return;
  d->counter = 0.0;
  d->threshold = 1.0e-6;
  d->isSilent = 1;
  const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double hold = holdSeconds > 1.0e-6 ? holdSeconds : 1.0;
  d->increment = 1.0 / (hold * sr);
}

static inline void silence_detector_set_sample_rate(SilenceDetector* d, double sampleRate, double holdSeconds) {
  silence_detector_init(d, sampleRate, holdSeconds);
}

/** Feed one sample; returns 1 when silent long enough. */
static inline int silence_detector_run(SilenceDetector* d, double in) {
  if (!d) return 1;
  const double absIn = dsp_fabs(in);
  d->counter += d->increment;
  if (absIn >= d->threshold) {
    d->isSilent = 0;
    d->counter = 0.0;
  } else if (d->counter > 1.0) {
    d->isSilent = 1;
  }
  return d->isSilent;
}

} // namespace soemdsp_maths
