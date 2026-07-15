// Sandbox Native Module Maths -- breakpoint X/Y graph.
//
// Ported from soemdsp/include/soemdsp/utility/Graph.hpp for freestanding
// wasm32 (-nostdlib, no exceptions): std::vector -> a fixed max-size array
// (no runtime allocation), std::find_if -> a plain loop, and exp()/log()
// (which need libm) -> the dsp_exp/dsp_ln polyfills in exp_log.h.
//
// Analog-filter-family modules (ladder/tb303/cookbook/flower-child/etc.)
// model nonlinearities and control-curve response with exactly this kind
// of piecewise linear/rational/exponential breakpoint curve -- this is the
// shared implementation they should converge on rather than each hand-
// rolling their own curve segment math.
#pragma once

#include "scalar_helpers.h"
#include "exp_log.h"

namespace soemdsp_maths {

struct Graph {
  enum class Shape { LINEAR, RATIONAL, EXPONENTIAL };

  struct Node {
    double x = 0.0;
    double y = 0.0;
    double c = 0.0;  // contour/tension, used by RATIONAL and EXPONENTIAL
    Shape shape = Shape::RATIONAL;
  };

  static const int kMaxNodes = 32;
  Node nodes[kMaxNodes];
  int count = 0;

  void addNode(double x, double y, double c = 0.0, Shape shape = Shape::LINEAR) {
    if (count >= kMaxNodes) return;
    nodes[count] = { x, y, c, shape };
    count++;
  }

  void reset() { count = 0; }

  void moveNodeNoSort(int i, double x, double y) {
    if (i < 0 || i >= count) return;
    nodes[i].x = x;
    nodes[i].y = y;
  }

  double getValueLinear(double x, int i) const {
    const double x1 = nodes[i].x, y1 = nodes[i].y;
    const double x2 = nodes[i + 1].x, y2 = nodes[i + 1].y;
    if (dsp_fabs(x2 - x1) < 1.1920929e-7) return 0.5 * (y1 + y2);
    return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
  }

  // Rational curve, matching soemdsp::curve::Rational{c}.get(p) with the
  // default min=0/max=1 range Graph.hpp always calls it at: p in [0,1],
  // c (tension) in [-1,1] -> ((1+c)*p) / (1-c+2*c*p).
  double getValueRational(double x, int i) const {
    const double x1 = nodes[i].x, y1 = nodes[i].y;
    const double x2 = nodes[i + 1].x, y2 = nodes[i + 1].y;
    if (dsp_fabs(x2 - x1) < 1.1920929e-7) return 0.5 * (y1 + y2);
    const double p = (x - x1) / (x2 - x1);
    const double c = nodes[i + 1].c;
    const double rational = ((1.0 + c) * p) / (1.0 - c + 2.0 * c * p);
    return y1 + (y2 - y1) * rational;
  }

  static double lin_vs_exp_formula_scaler(double p) {
    const double c = 0.5 * (p + 1.0);  // bipolar to unipolar
    return 2.0 * dsp_ln((1.0 - c) / c);
  }

  double getValueExponential(double x, int i) const {
    const double a = lin_vs_exp_formula_scaler(nodes[i + 1].c);
    const double x1 = nodes[i].x, y1 = nodes[i].y;
    const double x2 = nodes[i + 1].x, y2 = nodes[i + 1].y;
    if (dsp_fabs(x2 - x1) < 1.1920929e-7) return 0.5 * (y1 + y2);
    const double I = (x - x1) / (x2 - x1);
    return y1 + (y2 - y1) * (1.0 - dsp_exp(I * a)) / (1.0 - dsp_exp(a));
  }

  double getValue(double x) const {
    if (count == 0) return 0.0;
    if (x < nodes[0].x) return nodes[0].y;

    int i = count;  // index of first node with node.x > x, else count
    for (int k = 0; k < count; k++) {
      if (nodes[k].x > x) { i = k; break; }
    }
    if (i == count) return nodes[count - 1].y;

    switch (nodes[i].shape) {
      case Shape::EXPONENTIAL: return getValueExponential(x, i - 1);
      case Shape::RATIONAL: return getValueRational(x, i - 1);
      case Shape::LINEAR: return getValueLinear(x, i - 1);
    }
    return 0.0;
  }
};

}  // namespace soemdsp_maths
