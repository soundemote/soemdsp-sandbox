// Shared phosphor residual model (app-wide).
//
// Display Settings order (shared faces, including Lorenz):
//   Bright → Size → Blur → Ghost → Trail → Scale → Pixel density → Dot Budget
//
// Axes (all 0..1):
//   Bright  → peak deposit / present light (ONLY brightness control)
//   Ghost   → super-exp residual hang (NOT brightness). Perfect alone when Trail=0.
//   Trail   → blend linear decay ON TOP of Ghost, then freeze:
//     0.00 → pure Ghost algorithm (100% super-exp hang)
//     0.50 → 50% linear + 50% Ghost exponential
//     0.75 → 100% linear decay
//     1.00 → freeze (never decay residual pixels)
//
// Legacy patches:
//   decay  (old: high = faster die) → trail = 1 - decay   [phosphor faces]
//   burn   (old name for ghost)     → ghost = burn
//   number-readout decay was already high=long → trail = decay (no invert)
//
// Used by energy-GL, drawer, matrix, asciiscope, value LED, 1D Phosphor.

(function initPhosphorResidual(global) {
  // Balanced default: half linear / half ghost (see resolveTrailBlend).
  const DEFAULT_TRAIL = 0.5;
  const DEFAULT_GHOST = 0.45;
  // Full-strength linear path keep (when Trail ≈ 0.75): mild per-frame die.
  const LINEAR_KEEP_FULL = 0.94;

  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

  /**
   * Trail → blend weights.
   *  0    pure ghost
   *  0.5  50% linear / 50% ghost
   *  0.75 pure linear
   *  1    freeze (no decay)
   */
  function resolveTrailBlend(trail) {
    const t = clamp01(trail, 0);
    if (t <= 0.5) {
      const u = t / 0.5; // 0…1
      const linearWeight = 0.5 * u; // 0…0.5
      return {
        ghostWeight: 1 - linearWeight,
        linearWeight,
        freeze: 0,
      };
    }
    if (t <= 0.75) {
      const u = (t - 0.5) / 0.25; // 0…1
      const linearWeight = 0.5 + 0.5 * u; // 0.5…1
      return {
        ghostWeight: 1 - linearWeight,
        linearWeight,
        freeze: 0,
      };
    }
    // 0.75 → full linear; 1 → freeze residual completely.
    const u = (t - 0.75) / 0.25; // 0…1
    return {
      ghostWeight: 0,
      linearWeight: 1 - u,
      freeze: u,
    };
  }

  /**
   * Pure Ghost super-exp keep (independent of Trail).
   * Ghost 0 → no hang (keep 0 = wipe residual unless linear path holds it).
   */
  function pureGhostKeep(ghost) {
    const g = clamp01(ghost, 0);
    if (g <= 0.001) {
      return 0;
    }
    // Super-exponential hang: near g=1 → almost freeze residual energy.
    const fade = Math.pow(1 - g, 2.8) * 0.012;
    const slow = 1 - Math.max(0.00025, fade);
    return Math.min(0.99975, slow);
  }

  /**
   * Linear residual keep. strength 0…1 scales how hard linear is applied
   * when this path is fully selected (Trail ≥ 0.75 before freeze zone).
   */
  function linearKeep(strength = 1) {
    const s = clamp01(strength, 1);
    if (s <= 0.001) {
      return 1;
    }
    // Interpolate: strength 0 → keep 1 (no linear die); 1 → LINEAR_KEEP_FULL.
    return 1 - (1 - LINEAR_KEEP_FULL) * s;
  }

  /**
   * Combined keep for one residual step (0…1, high = more hang).
   * Trail blends linear over Ghost; freeze near Trail=1.
   */
  function residualKeep(trail, ghost = 0) {
    const blend = resolveTrailBlend(trail);
    if (blend.freeze >= 0.999) {
      return 1;
    }
    const gKeep = pureGhostKeep(ghost);
    // When linear weight is partial, still use full-strength linear base keep
    // and weight the *result* (see applyResidual). For a single keep factor:
    const lKeep = linearKeep(1);
    const mixed = blend.ghostWeight * gKeep + blend.linearWeight * lKeep;
    // freeze mixes toward keep=1
    return Math.min(1, blend.freeze + (1 - blend.freeze) * mixed);
  }

  /**
   * Per-frame erase amount (destination-out / energy fade). High trail → low erase.
   */
  function trailFadeAmount(trail, ghost = 0) {
    return Math.max(0, 1 - residualKeep(trail, ghost));
  }

  /** @deprecated alias — keepFast is the blended keep now (not pure trail). */
  function trailKeep(trail, ghost = 0) {
    return residualKeep(trail, ghost);
  }

  /**
   * Ghost keep for dual-path callers (energy-GL). Pure ghost hang only.
   * baseKeep ignored — Ghost no longer rides Trail's keep floor.
   */
  function ghostKeep(ghost, _baseKeep = 0) {
    return pureGhostKeep(ghost);
  }

  /**
   * Ghost enable flag for dual residual paths (0 = off).
   * NOT a brightness ceiling.
   */
  function ghostCap(ghost) {
    return clamp01(ghost, 0) > 0.001 ? 1 : 0;
  }

  /**
   * One-frame residual energy step.
   * Pure multiplicative hang; Ghost never injects brightness.
   */
  function applyResidual(energy01, trail, ghost = 0) {
    const e = Math.max(0, Number(energy01) || 0);
    const blend = resolveTrailBlend(trail);
    if (blend.freeze >= 0.999) {
      return e;
    }
    const gKeep = pureGhostKeep(ghost);
    const lKeep = linearKeep(1);
    const faded = e * (blend.ghostWeight * gKeep + blend.linearWeight * lKeep);
    if (blend.freeze > 0.001) {
      return e * blend.freeze + faded * (1 - blend.freeze);
    }
    return faded;
  }

  /**
   * Dual-path keeps for energy-GL / shader.
   * Shader does max(e*keepFast, e*keepSlow). Weighted Trail blend is already
   * folded into a single keep — set both paths equal so max ≡ blend (not
   * “ghost always wins”).
   */
  function residualKeeps(trail, ghost = 0) {
    const blend = resolveTrailBlend(trail);
    const g = clamp01(ghost, 0);
    const keep = residualKeep(trail, ghost);
    return {
      keepFast: keep,
      keepSlow: keep,
      ghostCap: g > 0.001 || blend.freeze > 0.001 || keep > 0.001 ? 1 : 0,
      fade: Math.max(0, 1 - keep),
      keep,
      freeze: blend.freeze,
      ghostWeight: blend.ghostWeight,
      linearWeight: blend.linearWeight,
      trail: clamp01(trail, 0),
      ghost: g,
    };
  }

  /**
   * Migrate patch fields → trail 0..1 (high = more linear / freeze).
   * @param {object} source
   * @param {number} fallback
   * @param {{ invertLegacyDecay?: boolean }} [options]
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
   * Migrate patch fields → ghost 0..1 (high = more super-exp hang).
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

  const api = {
    DEFAULT_TRAIL,
    DEFAULT_GHOST,
    LINEAR_KEEP_FULL,
    clamp01,
    resolveTrailBlend,
    pureGhostKeep,
    linearKeep,
    trailFadeAmount,
    trailKeep,
    ghostKeep,
    ghostCap,
    applyResidual,
    residualKeep,
    residualKeeps,
    migrateTrail,
    migrateGhost,
    residualSleepFrames,
  };

  global.PhosphorResidual = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
