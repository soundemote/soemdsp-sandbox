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
  return 1;
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
 * 0 → 1: stamp explicit format; apply known module renames that predate versioning.
 * Version 1 was already the live format before this pipeline existed.
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
 * 1 → 2 (reserved / currently identity): future product renames only.
 *
 * When product is ready, bump nodeGraphPatchFormat.version to 2 and implement
 * e.g. valueSlider → knob here. Until then this is a no-op so format 1 patches
 * stay on version 1 (migrator table length is consulted only when climbing).
 *
 * Example body (do NOT enable without format bump + UI type renames):
 *   nodes.map(n => n.type === "valueSlider" ? { ...n, type: "knob" } : n)
 */
function nodeGraphPatchMigrateV1ToV2Reserved(patch) {
  // Identity — kept so the migrator slot exists and is documented.
  return patch;
}

/**
 * Migrator table: index i migrates version i → i+1.
 * Add future entries here (e.g. valueSlider → knob) without touching load call sites.
 */
const nodeGraphPatchMigrators = Object.freeze([
  nodeGraphPatchMigrateV0ToV1,
  // Slot for 1 → 2 when product renames land (see nodeGraphPatchMigrateV1ToV2Reserved).
  // Not registered until format.version is bumped — keeping length 1 avoids
  // forcing every load through an identity hop.
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
      // Leave as-is; validateNodeGraphPatch reports unsupported format.
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

  // Always stamp current format after successful climb (idempotent for already-v1).
  if (version >= current) {
    next = {
      ...next,
      format: {
        kind: nodeGraphPatchFormatKind(),
        version: current,
      },
    };
    // Re-run node renames that must stay applied even when already at current version
    // (e.g. phosphorLight still in a v1 hand-edited patch).
    next = nodeGraphPatchMigratePhosphorLightNodes(next);
  }

  return next;
}
