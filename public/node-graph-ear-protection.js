// Speaker protection host. Mute envelope is Speaker Protector 2.0 math
// (public/modules/speakerProtector2/speaker-protector-2-math.js). This file only
// wraps that circuit for the Output bus and paints the Output screen red.

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

function nodeGraphSetEarProtectionEngaged(engaged, details = {}) {
  const on = Boolean(engaged);
  document.body?.classList.toggle("node-ear-protection-engaged", on);
  document.querySelectorAll(".dsp-node.output-node").forEach((node) => {
    node.classList.toggle("node-ear-protection-engaged", on);
  });
  if (on) {
    globalThis.nodeGraphEarProtectionDetails = { ...details };
  } else if (!details.keepDetails) {
    globalThis.nodeGraphEarProtectionDetails = null;
  }
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

/** Output-bus trip: paint red. Does not pause, mute-latch, or write volume. */
function nodeGraphTripEarProtection(details = {}) {
  globalThis.nodeGraphEarProtectionTripped = false;
  nodeGraphSetEarProtectionEngaged(true, details);
  return true;
}

function nodeGraphClampProtectedSample(value, limit = 0.95) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-limit, Math.min(limit, value));
}
