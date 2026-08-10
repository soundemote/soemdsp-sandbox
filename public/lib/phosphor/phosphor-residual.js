// Shared phosphor residual model (app-wide).
//
// Display Settings order (shared faces, including Lorenz):
//   Bright → Size → Blur → Ghost → Trail → Burn → Scale → Pixel density → Dot Budget
//
// Axes (all 0..1):
//   Bright  → peak deposit / present light (ONLY brightness control)
//   Ghost   → extreme analog (super-exp) residual hang. Perfect alone when Trail=0.
//   Trail   → blend linear decay ON TOP of Ghost, then freeze:
//     0.00 → pure Ghost algorithm (100% super-exp hang)
//     0.50 → 50% linear + 50% Ghost exponential
//     0.75 → 100% linear decay
//     1.00 → freeze (never decay residual pixels)
//   Burn    → sticky residual floor (brightness where pixels stop decaying):
//     0.00 → no pixels ever stick (off by default)
//     0.50 → once energy ≥ 0.5, pixel freezes at that floor forever
//     1.00 → all residual energy freezes (everything sticks)
//
// Legacy patches (residualSchema < 2):
//   decay  (old: high = faster die) → trail = 1 - decay   [phosphor faces]
//   burn   (old name / mirror for ghost) → ghost = burn; sticky Burn = 0
//   number-readout decay was already high=long → trail = decay (no invert)
//
// residualSchema ≥ 2: burn is sticky Burn (not ghost).
//
// Used by energy-GL, drawer, matrix, asciiscope, value LED, 1D Phosphor.

(function initPhosphorResidual(global) {
  // Balanced default: half linear / half ghost (see resolveTrailBlend).
  const DEFAULT_TRAIL = 0.5;
  const DEFAULT_GHOST = 0.45;
  // Sticky Burn off by default.
  const DEFAULT_BURN = 0;
  // Patches written with sticky Burn axis (not burn≡ghost mirror).
  const RESIDUAL_SCHEMA = 2;
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
   *
   * This is the classic sticky analog hang (e.g. Ghost 0.52 → keep ≈ 0.998).
   * Trail=0 must use ONLY this path — do not water it down for low-ghost
   * “finish wipe” cases; those are handled when Trail > 0 via residualKeep.
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
   * Burn is applied separately via applyBurnFloor (not a keep factor).
   */
  function residualKeep(trail, ghost = 0) {
    const blend = resolveTrailBlend(trail);
    if (blend.freeze >= 0.999) {
      return 1;
    }
    const gKeep = pureGhostKeep(ghost);
    // Trail 0 → pure Ghost only (identical to pureGhostKeep). No linear pull.
    if (blend.linearWeight <= 0.001 && blend.freeze <= 0.001) {
      return gKeep;
    }
    const lKeep = linearKeep(1);
    // Weighted average (Trail rises → more linear, less pure Ghost).
    let mixed = blend.ghostWeight * gKeep + blend.linearWeight * lKeep;
    // When Trail is on: guarantee a floor of linear death so residual can
    // finish dying (tiny Ghost + sticky hang used to ignore small Trail).
    // Never applied at Trail 0.
    if (blend.linearWeight > 0.001) {
      const linearPull = 1 - (1 - lKeep) * Math.min(1, blend.linearWeight * 2.5);
      mixed = Math.min(mixed, linearPull);
    }
    // freeze mixes toward keep=1
    return Math.min(1, blend.freeze + (1 - blend.freeze) * mixed);
  }

  /**
   * Sticky Burn floor after a decay step.
   * Burn 0 → no stick. Burn 1 → freeze all residual energy.
   * Otherwise: once energy ≥ Burn, never decay below Burn.
   *
   * @param {number} energyBefore energy before this frame’s decay
   * @param {number} energyAfter  energy after Trail/Ghost decay
   * @param {number} burn         sticky threshold 0…1
   */
  function applyBurnFloor(energyBefore, energyAfter, burn = 0) {
    const b = clamp01(burn, 0);
    if (b <= 0.001) {
      return Math.max(0, Number(energyAfter) || 0);
    }
    const before = Math.max(0, Number(energyBefore) || 0);
    const after = Math.max(0, Number(energyAfter) || 0);
    // Full Burn: every residual pixel freezes (nothing decays).
    if (b >= 0.999) {
      return before;
    }
    // Sticky floor: pixels that have reached Burn never drop below it.
    if (before >= b) {
      return Math.max(after, b);
    }
    return after;
  }

  /**
   * Per-frame erase amount (destination-out / energy fade). High trail → low erase.
   * Does not account for Burn (per-pixel floor); canvas paths should use
   * applyResidual / applyBurnFloor when Burn > 0.
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
   * Pure multiplicative hang (Trail/Ghost), then sticky Burn floor.
   * Ghost never injects brightness; Burn never raises energy above prior.
   */
  function applyResidual(energy01, trail, ghost = 0, burn = 0) {
    const e = Math.max(0, Number(energy01) || 0);
    if (e <= 0.0005) {
      return 0;
    }
    const keep = residualKeep(trail, ghost);
    let faded = e * keep;
    // Only force-kill the last crumb when Trail is contributing linear die.
    // Pure Ghost (Trail 0) must keep its long sticky analog tail intact.
    const trailOn = clamp01(trail, 0) > 0.001;
    if (trailOn && faded < 0.004 && keep < 0.999) {
      faded = 0;
    }
    return applyBurnFloor(e, faded, burn);
  }

  /**
   * Dual-path keeps for energy-GL / shader.
   * Shader does max(e*keepFast, e*keepSlow) then applyBurnFloor with uBurn.
   * Weighted Trail blend is already folded into a single keep — set both paths
   * equal so max ≡ blend (not “ghost always wins”).
   */
  function residualKeeps(trail, ghost = 0, burn = 0) {
    const blend = resolveTrailBlend(trail);
    const g = clamp01(ghost, 0);
    const b = clamp01(burn, 0);
    const keep = residualKeep(trail, ghost);
    return {
      keepFast: keep,
      keepSlow: keep,
      ghostCap: g > 0.001 || blend.freeze > 0.001 || keep > 0.001 || b > 0.001 ? 1 : 0,
      fade: Math.max(0, 1 - keep),
      keep,
      freeze: blend.freeze,
      ghostWeight: blend.ghostWeight,
      linearWeight: blend.linearWeight,
      trail: clamp01(trail, 0),
      ghost: g,
      burn: b,
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
   * Legacy: burn was the old name / mirror for ghost when ghost is absent.
   * residualSchema ≥ 2: burn is sticky Burn — never maps into ghost.
   */
  function migrateGhost(source = {}, fallback = DEFAULT_GHOST) {
    if (source && source.ghost != null && Number.isFinite(Number(source.ghost))) {
      return clamp01(Number(source.ghost), fallback);
    }
    const schema = Number(source && source.residualSchema);
    // New schema: burn is sticky floor, not ghost.
    if (Number.isFinite(schema) && schema >= RESIDUAL_SCHEMA) {
      return clamp01(fallback, DEFAULT_GHOST);
    }
    // Legacy only: burn → ghost when ghost field is missing.
    if (source && source.burn != null && Number.isFinite(Number(source.burn))) {
      return clamp01(Number(source.burn), fallback);
    }
    return clamp01(fallback, DEFAULT_GHOST);
  }

  /**
   * Migrate patch fields → sticky Burn 0..1 (default off).
   * residualSchema ≥ 2: burn is sticky Burn.
   * Older patches: burn mirrored ghost — sticky defaults to 0 (off).
   */
  function migrateBurn(source = {}, fallback = DEFAULT_BURN) {
    const schema = Number(source && source.residualSchema);
    if (Number.isFinite(schema) && schema >= RESIDUAL_SCHEMA) {
      if (source && source.burn != null && Number.isFinite(Number(source.burn))) {
        return clamp01(Number(source.burn), fallback);
      }
      return clamp01(fallback, DEFAULT_BURN);
    }
    // Pre-schema patches: burn was ghost alias/mirror — sticky off.
    return clamp01(fallback, DEFAULT_BURN);
  }

  /** Sleep frame budget so ghost hang / burn stick is not killed early. */
  function residualSleepFrames(ghost, burn = 0) {
    const g = clamp01(ghost, 0);
    const b = clamp01(burn, 0);
    if (b >= 0.999) {
      // Full freeze: short sleep (hold via last present, like Trail freeze).
      return 90;
    }
    if (b > 0.001) {
      // Sticky floor never fully dies — keep stepping long enough to settle.
      return Math.round(2400 + b * b * 16000 + g * g * 8000);
    }
    if (g <= 0.001) {
      return 240;
    }
    return Math.round(1800 + g * g * 12000);
  }

  const api = {
    DEFAULT_TRAIL,
    DEFAULT_GHOST,
    DEFAULT_BURN,
    RESIDUAL_SCHEMA,
    LINEAR_KEEP_FULL,
    clamp01,
    resolveTrailBlend,
    pureGhostKeep,
    linearKeep,
    trailFadeAmount,
    trailKeep,
    ghostKeep,
    ghostCap,
    applyBurnFloor,
    applyResidual,
    residualKeep,
    residualKeeps,
    migrateTrail,
    migrateGhost,
    migrateBurn,
    residualSleepFrames,
  };

  global.PhosphorResidual = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
