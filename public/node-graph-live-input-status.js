function syncNodeGraphInputModuleLiveState() {
  for (const node of document.querySelectorAll('.dsp-node[data-node-type="audioInput"]')) {
    const badge = node.querySelector(".node-live-input-state-badge");
    if (!badge) {
      continue;
    }
    const micStatus = nodeGraphMvp.live.inputActive ? nodeGraphMvp.live.micStatus : "off";
    const displayState = typeof nodeGraphLiveMicIsPausedDisplay === "function"
      && nodeGraphLiveMicIsPausedDisplay(micStatus)
      ? "paused"
      : micStatus;
    badge.textContent = nodeGraphLiveMicStatusText(micStatus);
    badge.dataset.micState = displayState;
    const peak = Math.max(0, Math.min(1, Number(nodeGraphMvp.live.inputMeterPeak) || 0));
    badge.dataset.inputPeak = peak.toFixed(3);
    badge.style.setProperty("--node-live-input-peak", `${Math.round(peak * 100)}%`);
    badge.setAttribute("title", document.getElementById("nodeLiveMicStatus")?.title || "");
  }
}

/** Update chrome mic pill text/class only (live ↔ paused) without resetting status. */
function refreshNodeGraphLiveMicStatusDisplay() {
  const status = document.getElementById("nodeLiveMicStatus");
  if (!status) {
    return;
  }
  const state = nodeGraphMvp.live.micStatus || "off";
  const permissionText = state === "armed" || state === "off"
    ? nodeGraphLivePermissionStatusText()
    : "";
  const label = typeof nodeGraphLiveMicStatusText === "function"
    ? nodeGraphLiveMicStatusText(state)
    : "mic off";
  const pillClass = typeof nodeGraphLiveMicStatusPillClass === "function"
    ? nodeGraphLiveMicStatusPillClass(state)
    : "";
  status.textContent = permissionText || label || "mic off";
  status.className = `pill ${pillClass}`.trim();
  syncNodeGraphInputModuleLiveState();
}

function setNodeGraphLiveMicStatus(state, message = "") {
  const status = document.getElementById("nodeLiveMicStatus");
  nodeGraphMvp.live.micStatus = state;
  if (!status) {
    return;
  }
  if (message) {
    status.title = message;
  } else {
    status.removeAttribute("title");
  }
  refreshNodeGraphLiveMicStatusDisplay();
  updateNodeGraphLiveInputTestStatus();
}

function updateNodeGraphLiveInputTestStatus() {
  const status = document.getElementById("nodeLiveInputTestStatus");
  if (!status) {
    return;
  }
  const inputActive = Boolean(nodeGraphMvp.live.inputActive);
  const inputRouteState = nodeGraphLiveInputRouteState();
  const micStatus = nodeGraphMvp.live.micStatus || "off";
  const permissionStatus = nodeGraphMvp.live.inputPermissionStatus || "unknown";
  const peak = Number(nodeGraphMvp.live.inputMeterPeak) || 0;
  let text = "input test off";
  let state = "";
  let title = "Press Input to show the live input module, then wire it manually.";
  if (inputActive && inputRouteState.state === "unwired") {
    text = "wire input";
    state = "warn";
    title = inputRouteState.message;
  } else if (micStatus === "blocked" || (inputActive && permissionStatus === "denied")) {
    text = "fix mic";
    state = "error";
    title = document.getElementById("nodeLiveMicStatus")?.title ||
      "Microphone permission is blocked in the browser.";
  } else if (micStatus === "requesting") {
    text = "allow mic";
    state = "warn";
    title = "Respond to the browser microphone permission prompt.";
  } else if (micStatus === "connected" && peak > 0.001) {
    text = "input signal";
    state = "good";
    title = "Microphone signal is reaching the live input module.";
  } else if (micStatus === "connected") {
    text = "listening";
    state = "warn";
    title = "Microphone is connected; make sound to confirm signal.";
  } else if (inputActive) {
    text = "ready";
    state = "warn";
    title = inputRouteState.message || "Input is armed. Allow microphone access when prompted.";
  }
  status.textContent = text;
  status.className = `pill ${state}`.trim();
  status.title = title;
}

function nodeGraphLiveInputRouteState() {
  const inputNodeIds = new Set(
    (nodeGraphMvp.patch.nodes || [])
      .filter((node) => node.type === "audioInput")
      .map((node) => node.id),
  );
  if (!inputNodeIds.size) {
    return {
      message: "Live INPUT module is visible. Wire it into Output to hear it.",
      state: "unwired",
    };
  }
  const hasSignalRoute = (nodeGraphMvp.patch.connections || []).some((connection) =>
    inputNodeIds.has(connection.sourceNode)
  );
  const hasModulationRoute = (nodeGraphMvp.patch.modulations || []).some((modulation) =>
    inputNodeIds.has(modulation.sourceNode)
  );
  if (hasSignalRoute || hasModulationRoute) {
    return {
      message: hasSignalRoute
        ? "Live INPUT is wired into the patch."
        : "Live INPUT is wired as parameter modulation.",
      state: "wired",
    };
  }
  return {
    message: "Live INPUT module is visible but has no outgoing wires.",
    state: "unwired",
  };
}
