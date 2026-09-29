// UI/host numeric helpers (app-wide). NOT a twin of C++ soemdsp::math.
// NOT audio DSP kernels -- knobs, display settings, normalize/migrate only.
//
// Load style matches phosphor-residual: IIFE -> globalThis.SoemMath.
//
// POLICY (standing):
//   User-settable display amounts (Ghost, Trail, Bright, Size, unlitSegments,
//   alpha, etc.) must NEVER use silent zero->fallback on every paint/normalize
//   via defaultIfZero / !(n>0) / x||default. Those helpers are for missing/unset
//   or engine-safe defaults only. Catalog via named helpers; migrate legacy
//   packs one-shot (schema/marker or absent-only), not every frame.
//
// Naming mirrors C++ soemdsp::debug::default_if_zero / finite_or spirit,
// JS camelCase.

(function initSoemMath(global) {
  "use strict";

  /**
   * Non-finite -> fallback. Finite 0 is valid and returned.
   * Same contract as nodeGraphFiniteNumber.
   */
  function finiteOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Exact 0 -> fallback (greppable missing/unset).
   * Non-zero (incl. non-number) pass through; use finiteOr for NaN/Infinity.
   *
   * FOR MISSING/UNSET ONLY -- never call on live user display knobs every
   * paint/normalize. Prefer absent/undefined/null checks for those, or a
   * one-shot legacy migrate (schema/marker), not zero->fallback forever.
   */
  function defaultIfZero(value, fallback) {
    return value === 0 ? fallback : value;
  }

  /**
   * |value| < eps -> fallback. eps is required (no silent default).
   * Same policy as defaultIfZero: missing/unset / engine-safe only.
   */
  function defaultIfNearZero(value, fallback, eps) {
    const n = Number(value);
    const e = Number(eps);
    if (Number.isFinite(n) && Number.isFinite(e) && Math.abs(n) < e) {
      return fallback;
    }
    return value;
  }

  /**
   * Clamp to [0, 1]. Non-finite -> clamp01(fallback); finite 0 is valid.
   * Ultimate fallback of a non-finite fallback is 0.
   */
  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return clamp01(fallback, 0);
    }
    return Math.max(0, Math.min(1, n));
  }

  global.SoemMath = {
    finiteOr,
    defaultIfZero,
    defaultIfNearZero,
    clamp01,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

