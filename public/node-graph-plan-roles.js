// Execution-plan roles (Phase B of docs/HIGH_RISK_HIGH_REWARD_PLAN.md).
//
// B3 complete: compileNodeGraphExecutionPlan seeds sources only via
// nodeGraphModuleIsPlanSourceType. Prefer definition.planRole; realtime
// oscillators remain a hard fallback for the classic PolyBLEP family.
// NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES is retired (was a soak-period mirror).

/** @typedef {"source"|"processor"|"sink"|"monitor"|"always"} NodeGraphPlanRole */

const NODE_GRAPH_PLAN_ROLES = Object.freeze({
  source: "source",
  processor: "processor",
  sink: "sink",
  monitor: "monitor",
  always: "always",
});

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
  // Fallbacks for unannotated types (new modules should declare planRole).
  if (def?.output || t === "output" || t === "pluginOutput") {
    return NODE_GRAPH_PLAN_ROLES.sink;
  }
  if (def?.monitorSink || def?.visualSink) {
    return NODE_GRAPH_PLAN_ROLES.monitor;
  }
  if (
    typeof nodeGraphModuleIsRealtimeOscillatorType === "function"
    && nodeGraphModuleIsRealtimeOscillatorType(t)
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
  const role = nodeGraphModulePlanRole(type);
  if (role === NODE_GRAPH_PLAN_ROLES.source || role === NODE_GRAPH_PLAN_ROLES.always) {
    return true;
  }
  return typeof nodeGraphModuleIsRealtimeOscillatorType === "function"
    && nodeGraphModuleIsRealtimeOscillatorType(type);
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
 * Debug: list definition types missing planRole (should be empty after annotation).
 * Call from console: nodeGraphPlanRoleCoverageReport()
 */
function nodeGraphPlanRoleCoverageReport() {
  const defs = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions
    : {};
  const missing = [];
  const byRole = {
    source: [],
    processor: [],
    sink: [],
    monitor: [],
    always: [],
    other: [],
  };
  for (const [t, def] of Object.entries(defs)) {
    const declared = String(def?.planRole || "").trim();
    if (!declared) {
      missing.push(t);
      continue;
    }
    if (byRole[declared]) {
      byRole[declared].push(t);
    } else {
      byRole.other.push({ type: t, planRole: declared });
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    counts: Object.fromEntries(
      Object.entries(byRole).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    ),
    byRole,
  };
}
