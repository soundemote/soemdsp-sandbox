// Shared GLSL for the stereo / layer "Meet" colour (R+B=G).
// One copy, pasted into every display shader that colours an L/R or X/Y/Z
// overlap. JS only supplies data (coverages, spans, colours as uniforms);
// the per-pixel choice of colour is made here, on the GPU.
//
// Two formulas exist in the sandbox. They agree on fully covered pixels
// (L only → C_L, R only → C_R, both → C_meet) and differ only on fractional
// (anti-aliased) edge pixels, so both are kept rather than unified:
//
//   traceMeet2 / traceMeet3 — coverage mix (Trace / TraceTape):
//     m = min(L, R); rgb = (L−m)·C_L + (R−m)·C_R + m·C_meet; alpha = max(L, R).
//     Three layers: exclusive + pairwise meet + triple screen.
//
//   traceMeetSpan2 — 1D Waterfall column bars: L source-over the plate, then
//     the parts of R outside L∩R in C_R, then L∩R in C_meet, each
//     source-over with its own 1px box coverage. Premultiplied result; draw
//     it with blendFunc(ONE, ONE_MINUS_SRC_ALPHA).
//
// The meet colour itself (TraceStroke.meetColorFromPair, complement eased to
// screen) is one constant per colour pair, so it stays a JS uniform.

(function initTraceMeetGlsl(global) {
  const MEET_GLSL = `
    vec4 traceMeet2(float L, float R, vec3 cL, vec3 cR, vec3 cM) {
      float m = min(L, R);
      vec3 c = (L - m) * cL + (R - m) * cR + m * cM;
      return vec4(c, max(L, R));
    }
    vec4 traceMeet3(float a, float b, float c, vec3 cA, vec3 cB, vec3 cC,
        vec3 mAB, vec3 mAC, vec3 mBC, vec3 mAll) {
      float ab = min(a, b);
      float ac = min(a, c);
      float bc = min(b, c);
      float t = min(ab, c);
      float onlyA = a - ab - ac + t;
      float onlyB = b - ab - bc + t;
      float onlyC = c - ac - bc + t;
      vec3 rgb = onlyA * cA + onlyB * cB + onlyC * cC
        + (ab - t) * mAB + (ac - t) * mAC + (bc - t) * mBC
        + t * mAll;
      return vec4(rgb, max(a, max(b, c)));
    }
  `;

  const MEET_SPAN_GLSL = `
    // 1px box coverage of the pixel row centred on y by the span [lo, hi].
    float traceBoxCover(float y, float lo, float hi) {
      return clamp(min(y + 0.5, hi) - max(y - 0.5, lo), 0.0, 1.0);
    }
    // Premultiplied source-over: colour c at coverage cov on top of acc.
    vec4 traceOver(vec4 acc, vec3 c, float cov) {
      return vec4(c * cov, cov) + acc * (1.0 - cov);
    }
    // cL = L, cRa / cRb = R outside L∩R (above / below), cO = L∩R.
    vec4 traceMeetSpan2(float cL, float cRa, float cRb, float cO,
        vec3 colL, vec3 colR, vec3 colM) {
      vec4 acc = vec4(colL * cL, cL);
      acc = traceOver(acc, colR, cRa);
      acc = traceOver(acc, colR, cRb);
      return traceOver(acc, colM, cO);
    }
  `;

  global.TraceMeetGlsl = Object.freeze({
    MEET_GLSL,
    MEET_SPAN_GLSL,
  });
})(typeof window !== "undefined" ? window : globalThis);
