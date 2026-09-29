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


  /**
   * Unit-square canvas tile. Missing/non-finite x/y/w/h use defaults.
   * Explicit 0 stays 0 (no minimum-size floor). Finite z is rounded;
   * missing z uses index.
   * Defaults: 0.36 x 0.32, stagger 0.08+(index%5)*0.02.
   * x/y pulled back so x+w and y+h stay <= 1.
   */
  function normalizeCanvasTileRect(raw, index = 0) {
    const i = Math.max(0, Math.round(Number(index) || 0));
    const stagger = 0.08 + (i % 5) * 0.02;
    const src = raw && typeof raw === "object" ? raw : {};
    let w = clamp01(src.w, 0.36);
    let h = clamp01(src.h, 0.32);
    let x = clamp01(src.x, stagger);
    let y = clamp01(src.y, stagger);
    if (x + w > 1) {
      x = Math.max(0, 1 - w);
    }
    if (y + h > 1) {
      y = Math.max(0, 1 - h);
    }
    const zNum = Number(src.z);
    const z = Number.isFinite(zNum) ? Math.round(zNum) : i;
    return { x, y, w, h, z };
  }

  /**
   * Amplitude dB -> linear gain. Mirrors soemdsp::math::db_to_amp.
   * Non-finite -> 1. db <= -140 -> 0. Else 10^(db/20).
   */
  function dbToAmp(db) {
    const x = Number(db);
    if (!Number.isFinite(x)) return 1;
    if (x <= -140) return 0;
    return 10 ** (x / 20);
  }

  /**
   * Linear amplitude -> dB. Mirrors soemdsp::math::amp_to_db.
   * Non-finite or amp <= 0 -> -120. Else 20*log10(amp). No extra epsilon.
   */
  function ampToDb(amp) {
    const x = Number(amp);
    if (!Number.isFinite(x) || !(x > 0)) return -120;
    return 20 * Math.log10(x);
  }

  global.SoemMath = {
    finiteOr,
    defaultIfZero,
    defaultIfNearZero,
    clamp01,
    normalizeCanvasTileRect,
    dbToAmp,
    ampToDb,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

