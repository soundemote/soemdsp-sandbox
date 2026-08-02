// Execution-plan roles (Phase B of docs/HIGH_RISK_HIGH_REWARD_PLAN.md).
//
// B3: compileNodeGraphExecutionPlan seeds sources only via
// nodeGraphModuleIsPlanSourceType (no hard-coded OR chain in the plan).
// Prefer definition.planRole; NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES remains a
// fallback inside the helper until a soak shows zero disagreements.

/** @typedef {"source"|"processor"|"sink"|"monitor"|"always"} NodeGraphPlanRole */

const NODE_GRAPH_PLAN_ROLES = Object.freeze({
  source: "source",
  processor: "processor",
  sink: "sink",
  monitor: "monitor",
  always: "always",
});

/**
 * Legacy source types from compileNodeGraphExecutionPlan (must stay in sync
 * until B3 removes the hard-coded list). Used only as fallback.
 */
const NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES = Object.freeze(new Set([
  "audioInput",
  "pluginInput",
  "pluginMidiIn",
  "pluginMidiOut",
  "valueSlider",
  "pluginSlider",
  "toggleButton",
  "momentaryButton",
  "audioPlayer",
  "clock",
  "transport",
  "wireBreak",
  "wireConnect",
  "wireDisconnect",
  "windowReopen",
  "shootingStarExplosion",
  "fractalBrownianNoise",
  "keyboardController",
  "lorenzAttractor",
  "logisticMap",
  "henonMap",
  "rayBouncer",
  "chuaAttractor",
  "surgeOscillator",
  "dsfOscillator",
  "softwaveOsc",
  "curveOsc",
  "snowflake",
  "ellipsoid",
  "bugButton",
  "xyPad",
  "macroControls",
  "midiOut",
  "noiseGenerator",
  "pitchModWheel",
  "additiveOsc",
  "gpuAdditiveOsc",
  "randomWalk",
  "spiral",
  "osc",
  "polyBlep",
  "sineWavetable",
  "blit",
]));

/**
 * Resolve plan role for a module type.
 * @returns {NodeGraphPlanRole|""}
 */
function nodeGraphModulePlanRole(type) {
  const t = String(type || "").trim();
  if (!t) {
    return "";
  }
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[t]
    : null;
  const declared = String(def?.planRole || "").trim();
  if (
    declared === NODE_GRAPH_PLAN_ROLES.source
    || declared === NODE_GRAPH_PLAN_ROLES.processor
    || declared === NODE_GRAPH_PLAN_ROLES.sink
    || declared === NODE_GRAPH_PLAN_ROLES.monitor
    || declared === NODE_GRAPH_PLAN_ROLES.always
  ) {
    return declared;
  }
  // Fallbacks matching today's plan behavior (approx).
  if (def?.output || t === "output" || t === "pluginOutput") {
    return NODE_GRAPH_PLAN_ROLES.sink;
  }
  if (def?.monitorSink || def?.visualSink) {
    return NODE_GRAPH_PLAN_ROLES.monitor;
  }
  if (
    NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES.has(t)
    || (typeof nodeGraphModuleIsRealtimeOscillatorType === "function"
      && nodeGraphModuleIsRealtimeOscillatorType(t))
  ) {
    return NODE_GRAPH_PLAN_ROLES.source;
  }
  if (
    typeof nodeGraphChromelessModuleUsesSolidShell === "function"
    && nodeGraphChromelessModuleUsesSolidShell(t)
  ) {
    return NODE_GRAPH_PLAN_ROLES.always;
  }
  return NODE_GRAPH_PLAN_ROLES.processor;
}

/** True if this type should seed the plan as a free-running source. */
function nodeGraphModuleIsPlanSourceType(type) {
  return nodeGraphModulePlanRole(type) === NODE_GRAPH_PLAN_ROLES.source
    || NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES.has(String(type || "").trim())
    || (typeof nodeGraphModuleIsRealtimeOscillatorType === "function"
      && nodeGraphModuleIsRealtimeOscillatorType(type));
}

/** True if this type is an audio/plan sink root (speaker / plugin out). */
function nodeGraphModuleIsPlanSinkType(type) {
  const t = String(type || "").trim();
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[t]
    : null;
  if (def?.planRole === NODE_GRAPH_PLAN_ROLES.sink || def?.planSink === true) {
    return true;
  }
  return Boolean(def?.output) || t === "output" || t === "pluginOutput";
}

/**
 * B2: compare declared planRole vs legacy source set for soak/debug.
 * Returns { ok, legacyOnly, declaredSourceNotLegacy, missingDefs }.
 * Does not change plan behavior — call from console while retiring lists.
 */
function nodeGraphPlanRoleLegacyDisagreements() {
  const defs = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions
    : {};
  const legacyOnly = [];
  const declaredSourceNotLegacy = [];
  const missingDefs = [];
  for (const t of NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES) {
    const def = defs[t];
    if (!def) {
      missingDefs.push(t);
      continue;
    }
    const role = String(def.planRole || "").trim();
    if (role && role !== NODE_GRAPH_PLAN_ROLES.source && role !== NODE_GRAPH_PLAN_ROLES.always) {
      legacyOnly.push({ type: t, planRole: role });
    }
  }
  for (const [t, def] of Object.entries(defs)) {
    if (String(def?.planRole || "").trim() !== NODE_GRAPH_PLAN_ROLES.source) {
      continue;
    }
    if (!NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES.has(t)) {
      // Realtime oscillators may be covered by nodeGraphModuleIsRealtimeOscillatorType.
      const osc = typeof nodeGraphModuleIsRealtimeOscillatorType === "function"
        && nodeGraphModuleIsRealtimeOscillatorType(t);
      if (!osc) {
        declaredSourceNotLegacy.push(t);
      }
    }
  }
  return {
    ok: legacyOnly.length === 0 && missingDefs.length === 0,
    legacyOnly,
    declaredSourceNotLegacy,
    missingDefs,
  };
}
