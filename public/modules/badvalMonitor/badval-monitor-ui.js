// BADVAL Monitor face: warning status instead of a default oscilloscope.
// Detected bad samples (NaN / inf / exploded / denormal) light the panel.

function nodeGraphBadvalModuleStates() {
  if (!nodeGraphMvp.badvalModuleStates || typeof nodeGraphMvp.badvalModuleStates !== "object") {
    nodeGraphMvp.badvalModuleStates = Object.create(null);
  }
  return nodeGraphMvp.badvalModuleStates;
}

function nodeGraphBadvalModuleStateFor(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return null;
  }
  const states = nodeGraphBadvalModuleStates();
  if (!states[id]) {
    states[id] = {
      count: 0,
      lastAt: 0,
      reason: "",
    };
  }
  return states[id];
}

function clearNodeGraphBadvalModuleStates() {
  nodeGraphMvp.badvalModuleStates = Object.create(null);
  if (typeof refreshNodeGraphBadvalMonitorBodies === "function") {
    refreshNodeGraphBadvalMonitorBodies();
  }
}

/**
 * Record a hit on a BADVAL Monitor module face (and refresh that face).
 * Call when that module's input sample is invalid.
 */
function recordNodeGraphBadvalModuleHit(nodeId, reason, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (patchNode && patchNode.type !== "badvalMonitor") {
    // Only paint faces for actual BADVAL Monitor modules.
    return;
  }
  const state = nodeGraphBadvalModuleStateFor(id);
  if (!state) {
    return;
  }
  const add = Math.max(1, Number(options.count) || 1);
  const prevReason = state.reason;
  const wasClear = !(state.count > 0);
  state.count += add;
  state.reason = String(reason || state.reason || "bad");
  const now = performance.now();
  state.lastAt = now;
  // First hit / reason change: paint immediately. Otherwise throttle DOM.
  const reasonChanged = state.reason !== prevReason;
  if (!wasClear && !reasonChanged && now - (state.lastRenderAt || 0) < 80) {
    return;
  }
  state.lastRenderAt = now;
  renderNodeGraphBadvalMonitorBodyForNode(id);
}

function createNodeGraphBadvalMonitorBody(node) {
  const body = document.createElement("div");
  body.className = "node-badval-monitor-body";
  body.dataset.node = node;
  body.dataset.badvalMonitorFace = "true";
  body.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} bad-value status`);

  const status = document.createElement("strong");
  status.dataset.badvalStatus = "true";

  const reason = document.createElement("span");
  reason.dataset.badvalReason = "true";

  const count = document.createElement("span");
  count.dataset.badvalCount = "true";

  const hint = document.createElement("span");
  hint.className = "node-badval-monitor-hint";
  hint.textContent = "NaN · inf · explode · denormal";

  body.append(status, reason, count, hint);
  renderNodeGraphBadvalMonitorBody(body);
  return body;
}

function renderNodeGraphBadvalMonitorBody(body) {
  if (!body) {
    return;
  }
  const nodeId = String(body.dataset.node || "").trim();
  const state = nodeId ? nodeGraphBadvalModuleStateFor(nodeId) : null;
  const hit = Boolean(state?.count > 0 && state?.reason);
  const liveOn = Boolean(nodeGraphMvp?.live?.node || nodeGraphMvp?.live?.context);

  body.classList.toggle("is-bad", hit);
  body.classList.toggle("is-clear", !hit && liveOn);
  body.classList.toggle("is-idle", !hit && !liveOn);

  const status = body.querySelector("[data-badval-status]");
  const reason = body.querySelector("[data-badval-reason]");
  const count = body.querySelector("[data-badval-count]");

  if (status) {
    status.textContent = hit ? "BAD VALUE" : liveOn ? "CLEAR" : "ARMED";
  }
  if (reason) {
    reason.textContent = hit
      ? String(state.reason).toUpperCase()
      : liveOn
        ? "no invalid samples"
        : "start live to watch";
  }
  if (count) {
    count.textContent = hit
      ? `hits ${state.count > 9999 ? "9999+" : state.count}`
      : "hits 0";
  }
}

function renderNodeGraphBadvalMonitorBodyForNode(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return;
  }
  const body = document.querySelector(`.node-badval-monitor-body[data-node="${CSS.escape(id)}"]`);
  if (body) {
    renderNodeGraphBadvalMonitorBody(body);
  }
}

function refreshNodeGraphBadvalMonitorBodies() {
  document.querySelectorAll(".node-badval-monitor-body").forEach((body) => {
    renderNodeGraphBadvalMonitorBody(body);
  });
}
