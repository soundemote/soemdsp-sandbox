// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

const nodeGraphBadValueExplosionLimit = 999999999;
const nodeGraphBadValueDenormalLimit = 1.1754943508222875e-38;

function nodeGraphBadValueReason(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "NaN";
  }
  if (!Number.isFinite(number)) {
    return "inf";
  }
  if (Math.abs(number) > nodeGraphBadValueExplosionLimit) {
    return "exploded";
  }
  if (number !== 0 && Math.abs(number) < nodeGraphBadValueDenormalLimit) {
    return "denormal";
  }
  return "";
}


function nodeGraphBadValueMonitorSample(value, runtime, nodeId) {
  const number = Number(value);
  const reason = nodeGraphBadValueReason(number);
  if (reason) {
    if (runtime) {
      runtime.badNumberCount = (runtime.badNumberCount || 0) + 1;
      runtime.lastBadNumber = { nodeId, source: `badval monitor input ${reason}` };
    }
    // Face update + global evidence list (force: true so face works without
    // arming the bottom-panel BADVAL Monitor toggle).
    if (typeof nodeGraphRecordBadValueEvent === "function") {
      nodeGraphRecordBadValueEvent({
        engine: runtime?.engine || "runtime",
        force: true,
        nodeId,
        reason,
        source: "BADVAL Monitor input",
      });
    } else if (typeof recordNodeGraphBadvalModuleHit === "function") {
      recordNodeGraphBadvalModuleHit(nodeId, reason);
    }
  }
  return number;
}


// Registers the offline/render-time dispatch handler for badvalMonitor into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.badvalMonitor = ({ runtime, nodeId, mixInput }) => nodeGraphBadValueMonitorSample(mixInput(nodeId), runtime, nodeId);
