// Sandbox Native Module Maths -- edge detectors for clocks / S&H / sequencers.
#pragma once

#include "scalar_helpers.h"

namespace soemdsp_maths {

// Rising edge: was <= threshold, now > threshold. Updates *prev to `now`.
static inline bool rising_edge(double now, double* prev, double threshold = 0.0) {
  if (!prev) return false;
  const double x = safe(now);
  const double p = safe(*prev);
  const bool edge = (p <= threshold && x > threshold);
  *prev = x;
  return edge;
}

// Falling edge: was > threshold, now <= threshold.
static inline bool falling_edge(double now, double* prev, double threshold = 0.0) {
  if (!prev) return false;
  const double x = safe(now);
  const double p = safe(*prev);
  const bool edge = (p > threshold && x <= threshold);
  *prev = x;
  return edge;
}

// Any crossing of threshold (up or down).
static inline bool change_edge(double now, double* prev, double threshold = 0.0) {
  if (!prev) return false;
  const double x = safe(now);
  const double p = safe(*prev);
  const bool was = p > threshold;
  const bool is = x > threshold;
  *prev = x;
  return was != is;
}

}  // namespace soemdsp_maths
