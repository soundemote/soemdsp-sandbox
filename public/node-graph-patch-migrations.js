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
  }

  return next;
}
