// Shared phosphor residual model (app-wide).
//
// Display Settings order (shared faces, including Lorenz):
//   Size → Blur → Bright → Ghost → Trail → Scale → Antialiasing → Dot Budget
//
// Axes (all 0..1, high = more of the named quality):
//   Bright     → peak deposit / present light
//   Trail      → main residual length (1 ≈ freeze-ish hot path)
//   Ghost      → dim scorched floor hang (screen burn-in, still dies)
//
// Legacy patches:
//   decay  (old: high = faster die) → trail = 1 - decay   [phosphor faces]
//   burn   (old name for ghost)     → ghost = burn
//   number-readout decay was already high=long → trail = decay (no invert)
//
// Used by energy-GL, drawer, matrix, asciiscope.

(function initPhosphorResidual(global) {
  const DEFAULT_TRAIL = 0.88; // was decay 0.12
  const DEFAULT_GHOST = 0.45; // was burn 0.45

  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

  /**
   * Per-frame erase amount from Trail (high trail = low erase).
   * Matches former fadeAmount(1 - trail) curve.
   */
  function trailFadeAmount(trail) {
    const t = clamp01(trail, DEFAULT_TRAIL);
    // Invert to old decay domain, then same quadratic fade map.
    const d = 1 - t;
    if (d <= 0.001) {
      return 0;
    }
    return Math.max(0.006, Math.min(0.55, 0.006 + d * 0.11 + d * d * 0.32));
  }

  /** keepFast from Trail (hot path). */
  function trailKeep(trail) {
    return Math.max(0, 1 - trailFadeAmount(trail));
  }

  /**
   * keepSlow for Ghost floor. Mid ghost already multi-10s hang @60fps.
   */
  function ghostKeep(ghost, baseKeep) {
    const g = clamp01(ghost, 0);
    const k = clamp01(baseKeep, 0);
    if (g <= 0.001) {
      return k;
    }
    const fade = Math.pow(1 - g, 2.8) * 0.012;
    const slow = 1 - Math.max(0.00025, fade);
    return Math.min(0.99975, Math.max(k, slow));
  }

  /** Dim floor ceiling (readable scorch, never full peak). */
  function ghostCap(ghost) {
    const g = clamp01(ghost, 0);
    return g * 0.12 + g * g * 0.38;
  }

  /**
   * One-frame residual: Trail hot path + Ghost dim floor.
   */
  function applyResidual(energy01, trail, ghost = 0) {
    const e = Math.max(0, Number(energy01) || 0);
    const keepFast = trailKeep(trail);
    const g = clamp01(ghost, 0);
    if (g <= 0.001) {
      return e * keepFast;
    }
    const keepSlow = ghostKeep(g, keepFast);
    const eFast = e * keepFast;
    const eGhost = Math.min(e * keepSlow, ghostCap(g));
    return Math.max(eFast, eGhost);
  }

  /**
   * Migrate patch fields → trail 0..1 (high = long).
   * @param {object} source
   * @param {number} fallback
   * @param {{ invertLegacyDecay?: boolean }} [options]
   *   invertLegacyDecay true (default for phosphor): trail = 1 - decay
   *   invertLegacyDecay false (number readout): trail = decay (already high=long)
   */
  function migrateTrail(source = {}, fallback = DEFAULT_TRAIL, options = {}) {
    const invert = options.invertLegacyDecay !== false;
    if (source && source.trail != null && Number.isFinite(Number(source.trail))) {
      return clamp01(Number(source.trail), fallback);
    }
    if (source && source.decay != null && Number.isFinite(Number(source.decay))) {
      const d = clamp01(Number(source.decay), 0);
      return invert ? clamp01(1 - d, fallback) : d;
    }
    return clamp01(fallback, DEFAULT_TRAIL);
  }

  /**
   * Migrate patch fields → ghost 0..1 (high = more scorch hang).
   * Accepts ghost or legacy burn.
   */
  function migrateGhost(source = {}, fallback = DEFAULT_GHOST) {
    if (source && source.ghost != null && Number.isFinite(Number(source.ghost))) {
      return clamp01(Number(source.ghost), fallback);
    }
    if (source && source.burn != null && Number.isFinite(Number(source.burn))) {
      return clamp01(Number(source.burn), fallback);
    }
    return clamp01(fallback, DEFAULT_GHOST);
  }

  /** Sleep frame budget so ghost hang is not killed early. */
  function residualSleepFrames(ghost) {
    const g = clamp01(ghost, 0);
    if (g <= 0.001) {
      return 240;
    }
    return Math.round(1800 + g * g * 12000);
  }

  function residualKeeps(trail, ghost = 0, burn = 0, burnAmount = 1) {
    const keepFast = trailKeep(trail);
    const keepSlow = ghostKeep(ghost, keepFast);
    const cap = ghostCap(ghost);
    return {
      keepFast,
      keepSlow,
      ghostCap: cap,
      fade: trailFadeAmount(trail),
      keep: keepFast,
      trail: clamp01(trail, DEFAULT_TRAIL),
      ghost: clamp01(ghost, 0),
      burn: 0,
      burnAmount: Number.isFinite(Number(burnAmount)) ? Number(burnAmount) : 1,
    };
  }

  const api = {
    DEFAULT_TRAIL,
    DEFAULT_GHOST,
    DEFAULT_BURN: 0,
    DEFAULT_BURN_AMOUNT: 1,
    BURN_AMOUNT_MAX: 4,
    RESIDUAL_SCHEMA: 3,
    clamp01,
    clampBurn: (v, fb = 0) => clamp01(v, fb),
    clampBurnAmount: (v, fb = 1) => {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        return Math.max(0, Math.min(4, Number(fb) || 1));
      }
      return Math.max(0, Math.min(4, n));
    },
    trailFadeAmount,
    trailKeep,
    ghostKeep,
    ghostCap,
    applyResidual,
    residualKeeps,
    migrateTrail,
    migrateGhost,
    migrateBurn: () => 0,
    migrateBurnAmount: (source = {}, fallback = 1) => {
      const n = Number(source?.burnAmount);
      if (Number.isFinite(n)) {
        return Math.max(0, Math.min(4, n));
      }
      return Math.max(0, Math.min(4, Number(fallback) || 1));
    },
    applyBurnFloor: (before, after) => Math.max(0, Number(after) || 0),
    residualSleepFrames,
  };

  global.PhosphorResidual = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
