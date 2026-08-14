// Speaker protection host. Mute envelope is Speaker Protector 2.0 math
// (public/modules/speakerProtector2/speaker-protector-2-math.js). This file only
// wraps that circuit for the Output bus and flags the Output face banner.

function createNodeGraphEarProtector(sampleRate = nodeGraphMvp?.sampleRate, options = {}) {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const state = typeof createNodeGraphSpeakerProtector2State === "function"
    ? createNodeGraphSpeakerProtector2State(rate)
    : { mode: "idle", gain: 1 };
  return {
    state,
    protect(left = 0, right = left) {
      if (typeof nodeGraphSpeakerProtector2Protect === "function") {
        return nodeGraphSpeakerProtector2Protect(state, left, right, rate, options);
      }
      return {
        left: Number(left) || 0,
        right: Number(right) || 0,
        gain: 1,
        muted: false,
        engaged: false,
        mode: "idle",
      };
    },
  };
}

function nodeGraphEarProtectionIsTripped() {
  return false;
}

function nodeGraphEarProtectionIsHot() {
  return Boolean(document.body?.classList?.contains("node-ear-protection-engaged"));
}

function nodeGraphOutputProtectMuteAmount(gain) {
  const g = Number(gain);
  if (!Number.isFinite(g)) {
    return 0;
  }
  return Math.max(0, Math.min(1, 1 - g));
}

function nodeGraphSyncOutputProtectOverlay(muteAmount = globalThis.nodeGraphOutputProtectMute || 0, options = {}) {
  const mute = Math.max(0, Math.min(1, Number(muteAmount) || 0));
  const prev = Number(globalThis.nodeGraphOutputProtectMute);
  globalThis.nodeGraphOutputProtectMute = mute;
  const visible = mute > 0.001;
  if (
    !options.force
    && Math.abs((Number.isFinite(prev) ? prev : -1) - mute) < 0.002
    && document.body?.dataset.outputProtectReady === "1"
  ) {
    return mute;
  }
  if (document.body) {
    document.body.dataset.outputProtectReady = "1";
  }
  document.querySelectorAll(".dsp-node.output-node").forEach((node) => {
    node.style.removeProperty("--node-output-protect-alpha");
    node.style.removeProperty("--node-output-protect-color");
    node.querySelectorAll(".node-module-scope-window, .node-module-display-face").forEach((face) => {
      face.style.removeProperty("--node-output-protect-alpha");
      face.style.removeProperty("--node-output-protect-color");
    });
    node.classList.toggle("node-output-protect-visible", visible);
    node.classList.toggle("node-ear-protection-engaged", visible);
  });
  document.body?.classList.toggle("node-ear-protection-engaged", visible);
  if (typeof nodeGraphModuleScopeState?.traceDisplayDrawCache?.clear === "function") {
    nodeGraphModuleScopeState.traceDisplayDrawCache.clear();
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  return mute;
}

function nodeGraphSetEarProtectionEngaged(engaged, details = {}) {
  const gain = Number(details.protectionGain);
  const mute = Object.prototype.hasOwnProperty.call(details, "protectionGain")
    ? nodeGraphOutputProtectMuteAmount(gain)
    : (engaged ? 1 : 0);
  if (engaged || mute > 0) {
    globalThis.nodeGraphEarProtectionDetails = { ...details, mute };
  } else if (!details.keepDetails) {
    globalThis.nodeGraphEarProtectionDetails = null;
  }
  nodeGraphSyncOutputProtectOverlay(mute);
  if (typeof refreshNodeGraphSpeakerProtectionBodies === "function") {
    refreshNodeGraphSpeakerProtectionBodies();
  }
}

function closeNodeGraphEarProtectionFaultUi() {
  const fault = document.getElementById("nodeEarProtectionFault");
  if (fault) {
    fault.hidden = true;
  }
  document.body?.classList.remove("node-ear-protection-tripped");
}

function nodeGraphResetEarProtectionFault() {
  globalThis.nodeGraphEarProtectionTripped = false;
  closeNodeGraphEarProtectionFaultUi();
  nodeGraphSetEarProtectionEngaged(false);
}

function nodeGraphEarProtectionFaultVisible() {
  return false;
}

function bindNodeGraphEarProtectionFaultUi() {
  closeNodeGraphEarProtectionFaultUi();
}

/** Output-bus trip: banner on the Output face. Does not pause, mute-latch, or write volume. */
function nodeGraphTripEarProtection(details = {}) {
  globalThis.nodeGraphEarProtectionTripped = false;
  nodeGraphSetEarProtectionEngaged(true, details);
  return true;
}

function nodeGraphClampProtectedSample(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
