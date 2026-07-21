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
}
