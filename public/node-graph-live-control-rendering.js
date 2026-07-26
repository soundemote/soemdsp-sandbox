function nodeGraphLiveOutputIsActive(running = Boolean(nodeGraphMvp.live.node)) {
  const statusText = document.getElementById("nodeLiveStatus")?.textContent || "";
  const starting = statusText === "starting";
  return (running || starting) && statusText !== "error";
}

function nodeGraphLiveOutputButtonTitle(outputActive, outputEnabled) {
  if (nodeGraphEarProtectionIsTripped()) {
    return "Ear Protection tripped. Close the dialog to reset audio.";
  }
  const inputActive = Boolean(nodeGraphMvp.live.inputActive);
  const inputStreaming = Boolean(nodeGraphMvp.live.inputStream);
  const enginePaused = (nodeGraphMvp.live.speedMultiplier ?? 1) === 0;
  if (outputActive && enginePaused) {
    return nodeGraphTooltipText("audio.liveOutputPaused");
  }
  if (outputActive && inputStreaming) {
    return nodeGraphTooltipText("audio.liveOutputRunning");
  }
  if (outputEnabled && inputActive) {
    return nodeGraphTooltipText("audio.liveOutputPermissionPending");
  }
  if (outputEnabled) {
    return nodeGraphTooltipText("audio.liveOutputRequested");
  }
  if (inputActive) {
    return nodeGraphTooltipText("audio.liveOutputWithInput");
  }
  return nodeGraphTooltipText("audio.liveOutputStart");
}

function syncNodeGraphOutputBypassButton(outputEnabled = Boolean(nodeGraphMvp.live.outputEnabled)) {
  const outputNode = nodeGraphNodeElement("output");
  const bypassButton = outputNode?.querySelector(".node-bypass-button");
  if (!bypassButton || !outputNode) {
    return;
  }
  const bypassed = !outputEnabled;
  outputNode.classList.toggle("bypassed", bypassed);
  bypassButton.setAttribute("aria-pressed", bypassed ? "true" : "false");
  bypassButton.textContent = nodeGraphBypassGlyph(bypassed);
  nodeGraphApplyTooltip(bypassButton, bypassed ? "module.outputOn" : "module.outputOff", {}, { title: false });
}

function renderNodeGraphLiveControls(running = Boolean(nodeGraphMvp.live.node)) {
  const statusText = document.getElementById("nodeLiveStatus")?.textContent || "";
  const starting = statusText === "starting";
  const outputActive = nodeGraphLiveOutputIsActive(running);
  const outputEnabled = Boolean(nodeGraphMvp.live.outputEnabled);
  const inputButton = document.getElementById("nodeLiveInputButton");
  const outputButton = document.getElementById("nodeLiveOutputButton");
  const labelLiveToggle = (button, name, active, stateOverride = null) => {
    if (!button) {
      return;
    }
    const stateText = stateOverride || (active ? "(Live)" : "(Off)");
    const nextLabel = `${name}\n${stateText}`;
    if (button.dataset.liveToggleLabel === nextLabel) {
      return;
    }
    button.dataset.liveToggleLabel = nextLabel;
    button.replaceChildren();
    for (const text of [name, stateText]) {
      const line = document.createElement("span");
      line.textContent = text;
      button.append(line);
    }
  };
  if (inputButton) {
    const deviceSelect = document.getElementById("nodeLiveInputDeviceSelect");
    if (deviceSelect) {
      deviceSelect.disabled = false;
    }
    const inputActive = Boolean(nodeGraphMvp.live.inputActive);
    const inputStreaming = Boolean(nodeGraphMvp.live.inputStream);
    if (!inputActive && !["blocked", "off"].includes(nodeGraphMvp.live.inputStatus)) {
      setNodeGraphLiveInputStatus("off");
    } else if (
      inputActive &&
      !inputStreaming &&
      !nodeGraphMvp.live.node &&
      !["blocked", "requesting"].includes(nodeGraphMvp.live.inputStatus)
    ) {
      const routeState = nodeGraphLiveInputRouteState();
      setNodeGraphLiveInputStatus(routeState.state, routeState.message);
    } else if (inputStreaming && nodeGraphMvp.live.inputStatus !== "connected") {
      setNodeGraphLiveInputStatus("connected", "Live INPUT is connected to the browser audio engine.");
    }
    if (!inputActive && !["blocked", "off"].includes(nodeGraphMvp.live.micStatus)) {
      setNodeGraphLiveMicStatus("off");
    } else if (inputStreaming && nodeGraphMvp.live.micStatus !== "connected") {
      setNodeGraphLiveMicStatus("connected", "Browser microphone stream is connected.");
    } else if (
      inputActive &&
      !inputStreaming &&
      !nodeGraphMvp.live.node &&
      !["blocked", "requesting"].includes(nodeGraphMvp.live.micStatus)
    ) {
      setNodeGraphLiveMicStatus("armed", "Start OUTPUT to request browser microphone permission.");
    }
    inputButton.classList.toggle("active", inputActive);
    inputButton.setAttribute("aria-pressed", inputActive ? "true" : "false");
    inputButton.disabled = false;
    inputButton.setAttribute("aria-disabled", "false");
    labelLiveToggle(inputButton, "Input", inputActive);
    inputButton.title = inputStreaming
      ? nodeGraphTooltipText("audio.liveInputConnected")
      : inputActive
        ? nodeGraphTooltipText("audio.liveInputVisible")
        : nodeGraphTooltipText("audio.liveInputShow");
  }
  if (outputButton) {
    const protectionTripped = nodeGraphEarProtectionIsTripped();
    const enginePaused = (nodeGraphMvp.live.speedMultiplier ?? 1) === 0;
    outputButton.disabled = starting || protectionTripped;
    outputButton.classList.toggle("active", outputEnabled && !protectionTripped);
    outputButton.classList.toggle("paused", enginePaused && !protectionTripped);
    outputButton.classList.toggle("node-under-construction-control", protectionTripped);
    outputButton.setAttribute("aria-pressed", outputEnabled && !protectionTripped ? "true" : "false");
    outputButton.setAttribute("aria-disabled", protectionTripped ? "true" : "false");
    labelLiveToggle(outputButton, "Output", protectionTripped ? false : outputEnabled,
      protectionTripped ? "Close Dialog"
        : enginePaused ? "Paused"
        : null);
    outputButton.title = nodeGraphLiveOutputButtonTitle(outputActive, outputEnabled);
  }
  syncNodeGraphOutputBypassButton(outputEnabled);
  syncNodeGraphInputModuleLiveState();
  updateNodeGraphLiveInputTestStatus();
  scheduleNodeLiveToggleTextFit();
  if (typeof nodeGraphExternalNotifyLiveOutputChanged === "function") {
    nodeGraphExternalNotifyLiveOutputChanged();
  }
  // Update transport play/pause button text
  const tp = document.getElementById("nodeTransportPlay");
  if (tp) {
    const enginePaused = (nodeGraphMvp.live.speedMultiplier ?? 1) === 0;
    const playing = outputActive && !enginePaused;
    tp.textContent = playing ? "⏸" : "▶";
    tp.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  renderNodeGraphSpeedReadout();
}

// The header "Speed" field mirrors the engine's speed multiplier, so pausing
// (transport pause button or spacebar -- both route through
// setNodeGraphLiveSpeed) visibly reads 0 instead of staying at 1.0.
function renderNodeGraphSpeedReadout() {
  const speed = Math.max(0, Number(nodeGraphMvp.live.speedMultiplier ?? 1));
  const text = speed.toFixed(1);
  for (const input of document.querySelectorAll("[data-speed-readout]")) {
    if (input.value !== text) {
      input.value = text;
    }
  }
}

// Shared wiring for the 🔊 sliders (live input, live output, rendered player).
// All three are 0..1 with a percent readout; `apply` is the only part that
// differs. Returns nothing -- the slider owns no state, it just pushes into
// whatever gain/volume the caller names, so a level set elsewhere can be
// pushed back into the slider with syncNodeGraphVolumeSlider.
function bindNodeGraphVolumeSlider(sliderId, readoutId, apply, initialValue = 1) {
  const slider = document.getElementById(sliderId);
  if (!slider || slider.dataset.volumeBound === "true") {
    return;
  }
  slider.dataset.volumeBound = "true";
  const readout = document.getElementById(readoutId);
  const render = (value) => {
    if (readout) {
      readout.textContent = `${Math.round(value * 100)}%`;
    }
  };
  const handle = () => {
    const value = Math.max(0, Math.min(1, Number(slider.value) || 0));
    apply(value);
    render(value);
  };
  slider.addEventListener("input", handle);
  slider.addEventListener("change", handle);
  slider.value = String(initialValue);
  render(initialValue);
}

function syncNodeGraphVolumeSlider(sliderId, readoutId, value) {
  const slider = document.getElementById(sliderId);
  const readout = document.getElementById(readoutId);
  const level = Math.max(0, Math.min(1, Number(value) || 0));
  if (slider && document.activeElement !== slider) {
    slider.value = String(level);
  }
  if (readout) {
    readout.textContent = `${Math.round(level * 100)}%`;
  }
}

function bindNodeGraphLiveVolumeControls() {
  bindNodeGraphVolumeSlider(
    "nodeLiveOutputVolume",
    "nodeLiveOutputVolumeValue",
    (value) => {
      if (typeof setNodeGraphLiveOutputVolume === "function") {
        setNodeGraphLiveOutputVolume(value);
      }
    },
    nodeGraphMvp?.live?.outputVolume ?? 1,
  );
  bindNodeGraphVolumeSlider(
    "nodeLiveInputVolume",
    "nodeLiveInputVolumeValue",
    (value) => {
      if (typeof setNodeGraphLiveInputVolume === "function") {
        setNodeGraphLiveInputVolume(value);
      }
    },
    nodeGraphMvp?.live?.inputVolume ?? 1,
  );
}

function bindNodeGraphTransportButtons() {
  bindNodeGraphLiveVolumeControls();
  const play = document.getElementById("nodeTransportPlay");
  const stop = document.getElementById("nodeTransportStop");
  const prev = document.getElementById("nodeTransportPrev");
  const next = document.getElementById("nodeTransportNext");

  if (play) {
    play.addEventListener("click", () => {
      const outputActive = nodeGraphLiveOutputIsActive(Boolean(nodeGraphMvp.live.node));
      if (!outputActive) {
        if (typeof soemdspSandboxToggleLiveOutput === "function") soemdspSandboxToggleLiveOutput();
      } else {
        const speed = (nodeGraphMvp.live.speedMultiplier ?? 1) > 0 ? 0 : 1;
        if (typeof setNodeGraphLiveSpeed === "function") setNodeGraphLiveSpeed(speed);
      }
      renderNodeGraphLiveControls();
    });
  }
  if (stop) {
    stop.addEventListener("click", () => {
      if (typeof soemdspSandboxToggleLiveOutput === "function") {
        const outputActive = nodeGraphLiveOutputIsActive(Boolean(nodeGraphMvp.live.node));
        if (outputActive) soemdspSandboxToggleLiveOutput();
      }
      renderNodeGraphLiveControls();
    });
  }
  if (prev) {
    prev.addEventListener("click", () => {
      window.parent?.postMessage?.({ type: "soundemote:prev-patch" }, window.location.origin);
    });
  }
  if (next) {
    next.addEventListener("click", () => {
      window.parent?.postMessage?.({ type: "soundemote:next-patch" }, window.location.origin);
    });
  }
}

window.addEventListener("load", () => {
  setTimeout(bindNodeGraphTransportButtons, 200);
});
