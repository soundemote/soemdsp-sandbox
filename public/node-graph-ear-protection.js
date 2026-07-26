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
  return `${source}audio output muted${countText}. Close to reset.`;
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
  globalThis.nodeGraphEarProtectionDetails = null;
  closeNodeGraphEarProtectionFaultUi();
  try {
    if (typeof setNodeGraphLiveOutputMuted === "function") {
      setNodeGraphLiveOutputMuted(false);
    }
    if (typeof nodeGraphMvp !== "undefined") {
      nodeGraphMvp.live.outputEnabled = false;
    }
    if (typeof setNodeGraphLiveStatus === "function") {
      setNodeGraphLiveStatus("idle", "");
    }
    if (typeof setNodeGraphLiveEngineStatus === "function") {
      setNodeGraphLiveEngineStatus("engine idle", "");
    }
    if (typeof setNodeGraphLiveEngineTitle === "function") {
      setNodeGraphLiveEngineTitle("");
    }
    if (typeof setNodeGraphLivePlanStatus === "function") {
      setNodeGraphLivePlanStatus("plan idle", "");
    }
    if (typeof setNodeGraphLiveScheduleStatus === "function") {
      setNodeGraphLiveScheduleStatus("schedule idle", "");
    }
    if (typeof setNodeGraphLiveMeter === "function") {
      setNodeGraphLiveMeter();
    }
    if (typeof labelPrimaryAudioTitle === "function") {
      labelPrimaryAudioTitle("Audio ready", true);
    }
    if (typeof renderNodeGraphLiveControls === "function") {
      renderNodeGraphLiveControls(false);
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
      audioStats.textContent = `audio muted / protected ${Number(details.protectionMuteCount ?? details.count) || 1}`;
      audioStats.className = "pill warn";
      audioStats.dataset.renderProtectionMutes = String(Number(details.protectionMuteCount ?? details.count) || 1);
    }
    if (typeof labelPrimaryAudioTitle === "function") {
      labelPrimaryAudioTitle("Ear Protection tripped. Close the dialog to reset audio.", false);
    }
    if (typeof labelPrimaryAudio === "function") {
      labelPrimaryAudio("Audio muted for safety", false);
    }
    if (typeof setNodeGraphLiveStatus === "function") {
      setNodeGraphLiveStatus("protection tripped", "warn");
    }
    if (typeof setNodeGraphLiveEngineStatus === "function") {
      setNodeGraphLiveEngineStatus("audio muted", "warn");
    }
    if (typeof setNodeGraphLiveEngineTitle === "function") {
      setNodeGraphLiveEngineTitle("Ear Protection tripped. Close the dialog to reset audio.");
    }
    if (typeof setNodeGraphLivePlanStatus === "function") {
      setNodeGraphLivePlanStatus("reset available", "warn");
    }
    if (typeof setNodeGraphLiveScheduleStatus === "function") {
      setNodeGraphLiveScheduleStatus("ear protection tripped; close dialog to reset", "warn");
    }
    if (typeof setNodeGraphLiveMeter === "function") {
      setNodeGraphLiveMeter(0, 0, 0, Number(details.protectionMuteCount ?? details.count) || 1);
    }
    if (typeof renderNodeGraphLiveControls === "function") {
      renderNodeGraphLiveControls(false);
    }
    if (typeof refreshNodeGraphSpeakerProtectionBodies === "function") {
      refreshNodeGraphSpeakerProtectionBodies();
    }
  } catch (_error) {
    // Status surfaces are helpful but not required for the safety latch.
  }
}

function nodeGraphTripEarProtection(details = {}) {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphApplyEarProtectionFaultUi(details);
    return true;
  }
  globalThis.nodeGraphEarProtectionTripped = true;
  nodeGraphApplyEarProtectionFaultUi(details);

  try {
    if (typeof stopNodeGraphRenderedPlayback === "function") {
      stopNodeGraphRenderedPlayback();
    }
  } catch (_error) {
    // Best effort; closing the dialog clears the trip.
  }
  try {
    if (typeof clearNodeGraphRenderedAudioElement === "function") {
      clearNodeGraphRenderedAudioElement();
    }
  } catch (_error) {
    // Best effort; live output is the primary speaker path.
  }
  try {
    if (typeof setNodeGraphLiveOutputMuted === "function") {
      setNodeGraphLiveOutputMuted(true);
    }
  } catch (_error) {
    // Best effort; the output engine may not exist.
  }
  try {
    if (typeof nodeGraphMvp !== "undefined") {
      nodeGraphMvp.live.outputEnabled = false;
      nodeGraphMvp.live.outputToggleSerial += 1;
    }
    if (typeof stopNodeGraphLiveAudio === "function") {
      const stopResult = stopNodeGraphLiveAudio();
      if (stopResult && typeof stopResult.finally === "function") {
        stopResult.finally(() => {
          if (nodeGraphEarProtectionIsTripped()) {
            nodeGraphApplyEarProtectionFaultUi(details);
          }
        });
      }
    }
  } catch (_error) {
    // Best effort; closing the dialog clears the trip.
  }
  return true;
}
