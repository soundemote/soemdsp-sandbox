// Patch format migrations (Phase C of docs/HIGH_RISK_HIGH_REWARD_PLAN.md).
//
// Load order: after nodeGraphPatchFormat / module definitions, before
// validateNodeGraphPatch (node-graph-patch-core.js).
//
// Pipeline: raw load → migrateNodeGraphPatchToCurrent → validate/normalize.
// Migrators are pure functions: (patch) => patch. Each advances version by 1.

/** Current on-disk / in-memory format version (matches nodeGraphPatchFormat.version). */
function nodeGraphPatchCurrentFormatVersion() {
  if (typeof nodeGraphPatchFormat === "object" && nodeGraphPatchFormat) {
    const v = Number(nodeGraphPatchFormat.version);
    if (Number.isFinite(v)) {
      return v;
    }
  }
  return 2;
}

function nodeGraphPatchFormatKind() {
  if (typeof nodeGraphPatchFormat === "object" && nodeGraphPatchFormat?.kind) {
    return String(nodeGraphPatchFormat.kind);
  }
  return "soemdsp-sandbox-node-patch";
}

/**
 * Read format version from a patch. Missing format → 0 (pre-versioned / legacy).
 */
function nodeGraphPatchReadFormatVersion(patch) {
  if (!patch || typeof patch !== "object") {
    return 0;
  }
  if (patch.format === undefined || patch.format === null) {
    return 0;
  }
  const v = Number(patch.format.version);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Legacy phosphorLight module → scope2d (ports stay X/Y).
 * Kept here so all shape migrations live in one pipeline.
 */
function nodeGraphPatchMigratePhosphorLightNodes(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "phosphorLight") {
      return node;
    }
    changed = true;
    if (typeof migrateNodeGraphPhosphorLightToScope2d === "function") {
      return migrateNodeGraphPhosphorLightToScope2d(node);
    }
    const src = node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {};
    return {
      ...node,
      type: "scope2d",
      traceDisplaySettings: {
        ...src,
        background: src.background ?? src.backgroundColor,
        decay: src.decay,
        scale: src.scale,
        dot1Size: src.dot1Size,
        lineThickness: src.lineThickness ?? src.dot1Blur,
        pixelDensity: src.pixelDensity,
        dot1Color: src.dot1Color ?? src.color,
        dot1Brightness: src.dot1Brightness ?? src.brightness,
      },
    };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * SinCos4 (sineWavetable): drop retired Amplitude CV jack wires.
 */
function nodeGraphPatchMigrateSineWavetableDropAmplitudeJack(patch) {
  if (!patch || !Array.isArray(patch.connections) || !Array.isArray(patch.nodes)) {
    return patch;
  }
  const sincosIds = new Set(
    patch.nodes
      .filter((node) => {
        const type = node && String(node.type || "").trim();
        return type === "sineWavetable" || type === "sinCos";
      })
      .map((node) => String(node.id || "").trim())
      .filter(Boolean),
  );
  if (!sincosIds.size) {
    return patch;
  }
  let changed = false;
  const connections = patch.connections.filter((connection) => {
    if (!connection || typeof connection !== "object") {
      return true;
    }
    const dest = String(connection.destinationNode || "").trim();
    const port = String(connection.destinationPort || "").trim();
    if (sincosIds.has(dest) && (port === "Amplitude" || port === "amplitude")) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? { ...patch, connections } : patch;
}

/**
 * Butterworth Filter (additiveAnalogFilter) Slope: old 0…1 → dB/oct.
 * Linear Filter keeps 0…1; if it was wrongly migrated to dB (>1), map back.
 */
function nodeGraphPatchMigrateAdditiveFilterSlopeToDbOct(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveLinearFilter" && type !== "additiveAnalogFilter") {
      return node;
    }
    const bump = (bag) => {
      if (!bag || bag.slope == null) return bag;
      const n = Number(bag.slope);
      if (!Number.isFinite(n)) return bag;
      if (type === "additiveAnalogFilter") {
        if (n > 1) return bag; // already dB/oct
        changed = true;
        const db = n <= 0 ? 96 : Math.max(6, Math.min(96, 6 / n));
        return { ...bag, slope: db };
      }
      // Linear: 0…1 rational slope. Undo mistaken dB values.
      if (n > 1) {
        changed = true;
        return { ...bag, slope: Math.max(0, Math.min(1, 6 / n)) };
      }
      return bag;
    };
    const next = { ...node };
    if (node.params && typeof node.params === "object") {
      next.params = bump({ ...node.params });
    }
    if (node.parameters && typeof node.parameters === "object") {
      next.parameters = bump({ ...node.parameters });
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * NoisyFreq Amount (0…1, hidden ×0.5) → Add (ratio add DOMAIN).
 * add = amount * 0.5 so existing patches keep the same depth.
 */
function nodeGraphPatchMigrateNoisyFreqAmountToAdd(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || String(node.type || "").trim() !== "additiveNoisyFreq") {
      return node;
    }
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const hasAdd = (params.add != null && Number.isFinite(Number(params.add)))
      || (parameters && parameters.add != null && Number.isFinite(Number(parameters.add)));
    if (hasAdd) return node;
    const src = params.amount != null ? params : parameters;
    if (!src || src.amount == null) return node;
    const n = Number(src.amount);
    if (!Number.isFinite(n)) return node;
    changed = true;
    const add = n * 0.5;
    const next = { ...node };
    if (params.amount != null || Object.keys(params).length) {
      const p = { ...params, add };
      delete p.amount;
      next.params = p;
    }
    if (parameters && (parameters.amount != null || parameters.add == null)) {
      const p = { ...parameters, add };
      delete p.amount;
      next.parameters = p;
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Additive Linear / Analog Filter Cutoff was harmonic-index 0…1.
 * Now absolute Hz (kind frequency). Values in (0…1] remap → Hz via ×20000.
 */
function nodeGraphPatchMigrateAdditiveFilterCutoffToHz(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    const type = node && String(node.type || "").trim();
    if (type !== "additiveLinearFilter" && type !== "additiveAnalogFilter") {
      return node;
    }
    const params = node.params && typeof node.params === "object" ? { ...node.params } : {};
    const parameters = node.parameters && typeof node.parameters === "object"
      ? { ...node.parameters }
      : null;
    const src = params.cutoff != null ? params : parameters;
    if (!src || src.cutoff == null) return node;
    const n = Number(src.cutoff);
    if (!Number.isFinite(n) || n <= 0 || n > 1) return node;
    // Old normalized index → Hz (same span as Cutoff max).
    const hz = n * 20000;
    changed = true;
    const next = { ...node };
    if (params.cutoff != null) {
      next.params = { ...params, cutoff: hz };
    }
    if (parameters && parameters.cutoff != null) {
      next.parameters = { ...parameters, cutoff: hz };
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Output / Plugin Output Volume used to store 0…1 linear amplitude.
 * Stored value is now dB (DecibelsToAmplitude): DSP = 10^(dB/20), −∞ floor −140.
 * Old patches (kind not decibels, max ≤ 1, value in 0…1) are converted in place.
 */
function nodeGraphPatchMigrateOutputVolumeLinearToDb(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || (node.type !== "output" && node.type !== "pluginOutput")) {
      return node;
    }
    const meta = node.paramMeta && typeof node.paramMeta === "object"
      ? node.paramMeta.volume
      : null;
    const kind = String(meta?.kind || "").trim().toLowerCase();
    if (kind === "decibels") {
      return node;
    }
    const max = Number(meta?.max);
    const value = Number(node.params?.volume);
    const rangeLooksLinear = !Number.isFinite(max) || max <= 1;
    const valueLooksLinear = Number.isFinite(value) && value >= 0 && value <= 1;
    if (!rangeLooksLinear || !valueLooksLinear) {
      return node;
    }
    changed = true;
    const db = value <= 0
      ? -140
      : (typeof nodeGraphOutputLinToVolumeDb === "function"
        ? nodeGraphOutputLinToVolumeDb(value)
        : 20 * Math.log10(value));
    const nextMeta = { ...(node.paramMeta || {}) };
    delete nextMeta.volume;
    return {
      ...node,
      paramMeta: nextMeta,
      params: { ...(node.params || {}), volume: db },
    };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Mid/Side Mid Gain / Side Gain used to store 0…4 linear.
 * Stored value is now dB. Old patches (kind not decibels, max ≤ 4, value in 0…4)
 * convert in place: 1 → 0 dB, 2 → +6 dB.
 */
function nodeGraphPatchMigrateMidSideGainLinearToDb(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || node.type !== "midSideEncode") {
      return node;
    }
    const metaBag = node.paramMeta && typeof node.paramMeta === "object" ? node.paramMeta : {};
    const nextParams = { ...(node.params || {}) };
    const nextMeta = { ...metaBag };
    let nodeChanged = false;
    for (const key of ["midGain", "sideGain"]) {
      const meta = metaBag[key];
      const kind = String(meta?.kind || "").trim().toLowerCase();
      if (kind === "decibels") {
        continue;
      }
      const max = Number(meta?.max);
      const value = Number(nextParams[key]);
      const rangeLooksLinear = !Number.isFinite(max) || max <= 4;
      const valueLooksLinear = Number.isFinite(value) && value >= 0 && value <= 4;
      if (!rangeLooksLinear || !valueLooksLinear) {
        continue;
      }
      nodeChanged = true;
      nextParams[key] = value <= 0 ? -24 : 20 * Math.log10(value);
      delete nextMeta[key];
    }
    if (!nodeChanged) {
      return node;
    }
    changed = true;
    return { ...node, params: nextParams, paramMeta: nextMeta };
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * Module type + face field renames: valueSlider → knob.
 * Also migrates face property and displayType/mode schema keys when present.
 */
function nodeGraphPatchMigrateValueSliderToKnob(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return patch;
  }
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node || typeof node !== "object") {
      return node;
    }
    let next = node;
    const type = String(node.type || "").trim();
    if (type === "valueSlider") {
      changed = true;
      next = { ...next, type: "knob" };
    }
    // Face art payload
    if (Object.prototype.hasOwnProperty.call(next, "valueSliderFace")) {
      changed = true;
      const face = next.valueSliderFace;
      next = { ...next, knobFace: face };
      delete next.valueSliderFace;
    }
    // Display mode keys stored on node (if any)
    if (next.displayMode === "valueSliderFace" || next.displayType === "valueSliderFace") {
      changed = true;
      next = {
        ...next,
        displayMode: next.displayMode === "valueSliderFace" ? "face" : next.displayMode,
        displayType: next.displayType === "valueSliderFace" ? "knobFace" : next.displayType,
      };
    }
    // Selected display mode object
    if (next.selectedDisplayMode && typeof next.selectedDisplayMode === "object") {
      const sdm = next.selectedDisplayMode;
      if (sdm.renderer === "valueSliderFace" || sdm.settingsSchema === "valueSliderFace" || sdm.key === "valueSliderFace") {
        changed = true;
        next = {
          ...next,
          selectedDisplayMode: {
            ...sdm,
            key: sdm.key === "valueSliderFace" ? "face" : sdm.key,
            renderer: sdm.renderer === "valueSliderFace" ? "knobFace" : sdm.renderer,
            settingsSchema: sdm.settingsSchema === "valueSliderFace" ? "knobFace" : sdm.settingsSchema,
          },
        };
      }
    }
    return next;
  });
  return changed ? { ...patch, nodes } : patch;
}

/**
 * 0 → 1: stamp explicit format; apply known module renames that predate versioning.
 */
function nodeGraphPatchMigrateV0ToV1(patch) {
  let next = nodeGraphPatchMigratePhosphorLightNodes(patch);
  return {
    ...next,
    format: {
      kind: nodeGraphPatchFormatKind(),
      version: 1,
    },
  };
}

/**
 * 1 → 2: valueSlider → knob (+ face field rename).
 */
function nodeGraphPatchMigrateV1ToV2(patch) {
  let next = nodeGraphPatchMigrateValueSliderToKnob(patch);
  next = nodeGraphPatchMigratePhosphorLightNodes(next);
  return {
    ...next,
    format: {
      kind: nodeGraphPatchFormatKind(),
      version: 2,
    },
  };
}

/**
 * Migrator table: index i migrates version i → i+1.
 */
const nodeGraphPatchMigrators = Object.freeze([
  nodeGraphPatchMigrateV0ToV1,
  nodeGraphPatchMigrateV1ToV2,
]);

/**
 * Migrate a patch to the current format version.
 * - Unknown future versions are left unchanged (validate will reject).
 * - Missing format is treated as version 0.
 * - Wrong kind is not rewritten here (validate throws).
 */
function migrateNodeGraphPatchToCurrent(patch) {
  if (!patch || typeof patch !== "object") {
    return patch;
  }
  const current = nodeGraphPatchCurrentFormatVersion();
  let version = nodeGraphPatchReadFormatVersion(patch);
  let next = patch;

  if (next.format && next.format.kind != null) {
    const kind = String(next.format.kind);
    if (kind && kind !== nodeGraphPatchFormatKind()) {
      return next;
    }
  }

  if (version > current) {
    return next;
  }

  while (version < current) {
    const migrator = nodeGraphPatchMigrators[version];
    if (typeof migrator !== "function") {
      break;
    }
    next = migrator(next) || next;
    version += 1;
  }

  if (version >= current) {
    next = {
      ...next,
      format: {
        kind: nodeGraphPatchFormatKind(),
        version: current,
      },
    };
    // Re-apply safe renames even on current-version patches (hand-edited JSON).
    next = nodeGraphPatchMigratePhosphorLightNodes(next);
    next = nodeGraphPatchMigrateValueSliderToKnob(next);
    next = nodeGraphPatchMigrateSineWavetableDropAmplitudeJack(next);
    next = nodeGraphPatchMigrateAdditiveFilterCutoffToHz(next);
    next = nodeGraphPatchMigrateAdditiveFilterSlopeToDbOct(next);
    next = nodeGraphPatchMigrateNoisyFreqAmountToAdd(next);
    next = nodeGraphPatchMigrateOutputVolumeLinearToDb(next);
    next = nodeGraphPatchMigrateMidSideGainLinearToDb(next);
  }

  return next;
}
