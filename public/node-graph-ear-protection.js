const nodeGraphEarProtectionDefaults = Object.freeze({
  clipLimit: 0.8,
  decrementTime: 0.15,
  incrementTime: 0.0005,
  highPassFrequency: 1000,
  threshold: Math.pow(10, 6 / 20),
});

function nodeGraphOnePoleHighPassCoefficients(frequency, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const frequencyValue = Math.max(0, Number(frequency) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  return { a1, b0, b1: -b0 };
}

function createNodeGraphEarProtector(sampleRate = nodeGraphMvp.sampleRate, options = {}) {
  const settings = { ...nodeGraphEarProtectionDefaults, ...options };
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const increment = 1 / Math.max(1, settings.incrementTime * rate);
  const decrement = 1 / Math.max(1, settings.decrementTime * rate);
  const highPass = nodeGraphOnePoleHighPassCoefficients(settings.highPassFrequency, rate);
  let counter = 0;
  let inputBuffer = 0;
  let outputBuffer = 0;

  const run = (left = 0, right = left) => {
    const mono = (Number(left) + Number(right)) * 0.5 || 0;
    outputBuffer = highPass.b0 * mono + highPass.b1 * inputBuffer + highPass.a1 * outputBuffer;
    inputBuffer = mono;
    if (Math.abs(outputBuffer) >= settings.threshold) {
      counter += increment;
    }
    const gain = counter >= 1 ? 0 : 1;
    counter = Math.max(0, Math.min(2, counter)) - decrement;
    return gain;
  };

  return {
    protect(left = 0, right = left) {
      const gain = run(left, right);
      return {
        gain,
        left: nodeGraphClampProtectedSample((Number(left) || 0) * gain, settings.clipLimit),
        muted: gain <= 0,
        right: nodeGraphClampProtectedSample((Number(right) || 0) * gain, settings.clipLimit),
      };
    },
  };
}

function nodeGraphClampProtectedSample(value, limit = nodeGraphEarProtectionDefaults.clipLimit) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-limit, Math.min(limit, value));
}

function nodeGraphEarProtectionIsTripped() {
  return Boolean(globalThis.nodeGraphEarProtectionTripped);
}

function nodeGraphEarProtectionFaultDetail(details = {}) {
  const source = details.source ? `${details.source} ` : "";
  const count = Number(details.protectionMuteCount ?? details.count) || 0;
  const countText = count ? ` after ${count} protected frame${count === 1 ? "" : "s"}` : "";
  return `${source}output muted${countText}. Close this dialog, then unpause when ready.`;
}

function closeNodeGraphEarProtectionFaultUi() {
  const fault = document.getElementById("nodeEarProtectionFault");
  if (fault) {
    fault.hidden = true;
  }
  document.body?.classList.remove("node-ear-protection-tripped");
}

/**
 * Clear the safety latch without tearing down the live engine.
 * Trip pauses (speed 0) instead of stop — recovery is unmute + unpause.
 */
function nodeGraphResetEarProtectionFault() {
  globalThis.nodeGraphEarProtectionTripped = false;
  globalThis.nodeGraphEarProtectionDetails = null;
  closeNodeGraphEarProtectionFaultUi();
  try {
    if (typeof setNodeGraphLiveOutputMuted === "function") {
      setNodeGraphLiveOutputMuted(false);
    }
    // Leave the engine paused. User unpauses with Play / Space when ready —
    // safer than auto-resuming a patch that just tripped protection.
    if (typeof setNodeGraphLiveStatus === "function") {
      setNodeGraphLiveStatus("paused", "warn");
    }
    if (typeof setNodeGraphLiveEngineStatus === "function") {
      setNodeGraphLiveEngineStatus("engine paused — unpause to resume", "warn");
    }
    if (typeof setNodeGraphLiveEngineTitle === "function") {
      setNodeGraphLiveEngineTitle("Ear protection cleared. Engine still paused — press Play to resume.");
    }
    if (typeof setNodeGraphLivePlanStatus === "function") {
      setNodeGraphLivePlanStatus("paused after protection trip", "warn");
    }
    if (typeof setNodeGraphLiveScheduleStatus === "function") {
      setNodeGraphLiveScheduleStatus("protection cleared; unpause to continue", "warn");
    }
    if (typeof setNodeGraphLiveMeter === "function") {
      setNodeGraphLiveMeter();
    }
    if (typeof labelPrimaryAudioTitle === "function") {
      labelPrimaryAudioTitle("Ear protection cleared. Unpause to resume audio.", true);
    }
    if (typeof labelPrimaryAudio === "function") {
      labelPrimaryAudio("Engine paused", true);
    }
    if (typeof renderNodeGraphLiveControls === "function") {
      renderNodeGraphLiveControls(Boolean(nodeGraphMvp?.live?.node || nodeGraphMvp?.live?.context));
    }
    if (typeof refreshNodeGraphSpeakerProtectionBodies === "function") {
      refreshNodeGraphSpeakerProtectionBodies();
    }
  } catch (_error) {
    // Reset is best effort; the latch is already cleared above.
  }
}

function nodeGraphEarProtectionFaultVisible() {
  const fault = document.getElementById("nodeEarProtectionFault");
  return Boolean(fault) && !fault.hidden;
}

// Escape / Space / Enter all dismiss the trip dialog: it is a full-attention
// alert with exactly one action, so whichever key you reach for should take
// it. Bound in CAPTURE so it runs before the global shortcut handler and can
// stop the event there -- Space is otherwise the always-on audio transport
// panic key (node-graph-keyboard-shortcuts.js), which would try to start audio
// on the very keypress that is meant to clear the safety latch.
function handleNodeGraphEarProtectionFaultKeydown(event) {
  if (!nodeGraphEarProtectionFaultVisible()) {
    return;
  }
  const isCloseKey = event.key === "Escape" ||
    event.key === "Enter" ||
    event.key === " " ||
    event.code === "Space";
  if (!isCloseKey || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  nodeGraphResetEarProtectionFault();
}

function bindNodeGraphEarProtectionFaultUi() {
  document
    .getElementById("nodeEarProtectionFaultClose")
    ?.addEventListener("click", nodeGraphResetEarProtectionFault);
  if (document.documentElement.dataset.nodeEarProtectionFaultKeyClose !== "true") {
    document.documentElement.dataset.nodeEarProtectionFaultKeyClose = "true";
    document.addEventListener("keydown", handleNodeGraphEarProtectionFaultKeydown, true);
  }
  if (document.documentElement.dataset.nodeEarProtectionFaultDelegatedClose === "true") {
    return;
  }
  document.documentElement.dataset.nodeEarProtectionFaultDelegatedClose = "true";
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#nodeEarProtectionFaultClose")) {
      nodeGraphResetEarProtectionFault();
    }
  });
}

function nodeGraphApplyEarProtectionFaultUi(details = {}) {
  globalThis.nodeGraphEarProtectionDetails = { ...details };
  document.body?.classList.add("node-ear-protection-tripped");

  const detail = document.getElementById("nodeEarProtectionFaultDetail");
  if (detail) {
    detail.textContent = nodeGraphEarProtectionFaultDetail(details);
  }

  const pausedLine = document.getElementById("nodeEarProtectionFaultPaused");
  if (pausedLine) {
    pausedLine.textContent = "The engine was paused.";
  }

  const fault = document.getElementById("nodeEarProtectionFault");
  if (fault) {
    fault.hidden = false;
  }

  try {
    const renderStatus = document.getElementById("nodeGraphRenderStatus");
    if (renderStatus) {
      renderStatus.textContent = "protection tripped";
      renderStatus.className = "pill warn";
    }
    const audioStats = document.getElementById("nodeAudioStats");
    if (audioStats) {
      audioStats.textContent = `engine paused / protected ${Number(details.protectionMuteCount ?? details.count) || 1}`;
      audioStats.className = "pill warn";
      audioStats.dataset.renderProtectionMutes = String(Number(details.protectionMuteCount ?? details.count) || 1);
    }
    if (typeof labelPrimaryAudioTitle === "function") {
      labelPrimaryAudioTitle("Ear Protection tripped. Engine paused. Close dialog, then unpause.", false);
    }
    if (typeof labelPrimaryAudio === "function") {
      labelPrimaryAudio("Engine paused for safety", false);
    }
    if (typeof setNodeGraphLiveStatus === "function") {
      setNodeGraphLiveStatus("protection tripped", "warn");
    }
    if (typeof setNodeGraphLiveEngineStatus === "function") {
      setNodeGraphLiveEngineStatus("engine paused", "warn");
    }
    if (typeof setNodeGraphLiveEngineTitle === "function") {
      setNodeGraphLiveEngineTitle("Ear Protection tripped. Engine was paused — close dialog, then unpause.");
    }
    if (typeof setNodeGraphLivePlanStatus === "function") {
      setNodeGraphLivePlanStatus("paused for safety", "warn");
    }
    if (typeof setNodeGraphLiveScheduleStatus === "function") {
      setNodeGraphLiveScheduleStatus("ear protection tripped; engine paused — close dialog to clear", "warn");
    }
    if (typeof setNodeGraphLiveMeter === "function") {
      setNodeGraphLiveMeter(0, 0, 0, Number(details.protectionMuteCount ?? details.count) || 1);
    }
    if (typeof renderNodeGraphLiveControls === "function") {
      renderNodeGraphLiveControls(Boolean(nodeGraphMvp?.live?.node || nodeGraphMvp?.live?.context));
    }
    if (typeof refreshNodeGraphSpeakerProtectionBodies === "function") {
      refreshNodeGraphSpeakerProtectionBodies();
    }
  } catch (_error) {
    // Status surfaces are helpful but not required for the safety latch.
  }
}

/**
 * Trip ear protection: mute + pause the live engine (do not stop/tear down).
 * Recovery after closing the dialog is unpause (Play / Space).
 */
function nodeGraphTripEarProtection(details = {}) {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphApplyEarProtectionFaultUi(details);
    return true;
  }
  globalThis.nodeGraphEarProtectionTripped = true;
  nodeGraphApplyEarProtectionFaultUi(details);

  // Stop any rendered WAV path — that is offline playback, not the live engine.
  try {
    if (typeof stopNodeGraphRenderedPlayback === "function") {
      stopNodeGraphRenderedPlayback();
    }
  } catch (_error) {
    // Best effort.
  }
  try {
    if (typeof clearNodeGraphRenderedAudioElement === "function") {
      clearNodeGraphRenderedAudioElement();
    }
  } catch (_error) {
    // Best effort.
  }

  // Mute immediately so residual frames cannot blast after the trip.
  try {
    if (typeof setNodeGraphLiveOutputMuted === "function") {
      setNodeGraphLiveOutputMuted(true);
    }
  } catch (_error) {
    // Best effort.
  }

  // Pause the live engine in place (speed 0). Do NOT stop / disable output —
  // tearing down was the bug: Output then could not "unpause" a dead engine.
  try {
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.live) {
      // Keep outputEnabled so the engine graph stays up while paused.
      const speed = Number(nodeGraphMvp.live.speedMultiplier ?? 1);
      if (Number.isFinite(speed) && speed > 0) {
        nodeGraphMvp.live.lastPlaySpeed = speed;
      }
    }
    if (typeof setNodeGraphLiveSpeed === "function") {
      setNodeGraphLiveSpeed(0);
    } else if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.live) {
      nodeGraphMvp.live.speedMultiplier = 0;
    }
  } catch (_error) {
    // Best effort; dialog still latches the trip.
  }

  try {
    if (typeof renderNodeGraphLiveControls === "function") {
      renderNodeGraphLiveControls(Boolean(nodeGraphMvp?.live?.node || nodeGraphMvp?.live?.context));
    }
  } catch (_error) {
    // UI refresh is optional.
  }
  return true;
}
