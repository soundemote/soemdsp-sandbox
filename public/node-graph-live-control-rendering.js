function nodeGraphLiveOutputIsActive(running = Boolean(nodeGraphMvp.live.node)) {
  const statusText = document.getElementById("nodeLiveStatus")?.textContent || "";
  const starting = statusText === "starting";
  return (running || starting) && statusText !== "error";
}

/** Engine graph is up (worklet/node present). */
function nodeGraphLiveEngineIsUp() {
  return Boolean(nodeGraphMvp?.live?.node);
}

/** Transport pause: speed multiplier exactly 0 while engine is up. */
function nodeGraphLiveEngineIsPaused() {
  return nodeGraphLiveEngineIsUp() && (nodeGraphMvp.live.speedMultiplier ?? 1) === 0;
}

/**
 * Three-way transport/engine UI state:
 *   playing  — live worklet/node present, speed > 0
 *   paused   — live worklet/node present, speed === 0
 *   starting — output armed / status starting, node not ready yet
 *   stopped  — cold (no node, output not armed)
 *
 * Engine presence wins over the outputEnabled flag. Requiring both made the
 * UI flash green then snap back to red stop whenever a start/teardown race
 * cleared the flag for a frame (or a cancelled start re-rendered "stopped")
 * while the worklet was actually up — Output (Off), red ⏹, grey ▶.
 */
function nodeGraphLiveTransportUiState() {
  const statusText = String(document.getElementById("nodeLiveStatus")?.textContent || "").trim();
  const outputOn = Boolean(nodeGraphMvp?.live?.outputEnabled);
  const inputOn = Boolean(nodeGraphMvp?.live?.inputActive);
  const engineWanted = typeof nodeGraphLiveEngineWanted === "function"
    ? nodeGraphLiveEngineWanted()
    : (inputOn || outputOn);
  const engineUp = nodeGraphLiveEngineIsUp();
  const contextUp = Boolean(nodeGraphMvp?.live?.context);
  const speed = Number(nodeGraphMvp?.live?.speedMultiplier ?? 1);
  const paused = Number.isFinite(speed) && speed <= 0;

  // Live graph present always wins for transport chrome. Status pill may still
  // say "error" (plan/processor issue) but we must not paint red-stop while a
  // worklet is connected — that was the green-flash → red-stop + silence bug
  // when plan errors muted host gain without tearing down.
  // Engine may be Input-only (outputOn false) — still "playing"/"paused".
  if (engineUp || (contextUp && engineWanted)) {
    return paused ? "paused" : "playing";
  }

  if (statusText === "error") {
    return "stopped";
  }

  // Mid-start: Input and/or Output requested but worklet not mounted yet.
  if (
    engineWanted
    || statusText === "starting"
    || statusText === "priming"
  ) {
    return "starting";
  }

  return "stopped";
}

// Monochrome text-style glyphs (VS15) so OS emoji does not force red stop / ignore CSS color.
const NODE_GRAPH_TRANSPORT_GLYPH_PLAY = "▶\uFE0E";
const NODE_GRAPH_TRANSPORT_GLYPH_PAUSE = "⏸\uFE0E";
const NODE_GRAPH_TRANSPORT_GLYPH_STOP = "⏹\uFE0E";

function nodeGraphLiveOutputButtonTitle(transportState, outputEnabled) {
  const inputActive = Boolean(nodeGraphMvp.live.inputActive);
  const inputStreaming = Boolean(nodeGraphMvp.live.inputStream);
  if (transportState === "paused") {
    return nodeGraphTooltipText("audio.liveOutputPaused");
  }
  if ((transportState === "playing" || transportState === "starting") && inputStreaming) {
    return nodeGraphTooltipText("audio.liveOutputRunning");
  }
  if (outputEnabled && inputActive && transportState !== "playing") {
    return nodeGraphTooltipText("audio.liveOutputPermissionPending");
  }
  if (outputEnabled && transportState === "starting") {
    return nodeGraphTooltipText("audio.liveOutputRequested");
  }
  if (transportState === "playing") {
    return nodeGraphTooltipText("audio.liveOutputRunning");
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
  const outputEnabled = Boolean(nodeGraphMvp.live.outputEnabled);
  const transportState = nodeGraphLiveTransportUiState();
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
    // Prefer speed+engine for pause so a transient transport string cannot
    // drop both .active and .paused (grey flash) while Input stays armed.
    const enginePaused = typeof nodeGraphLiveEngineIsPaused === "function"
      ? nodeGraphLiveEngineIsPaused()
      : transportState === "paused";
    const inputPaused = inputActive && (enginePaused || transportState === "paused");
    const inputStarting = inputActive && transportState === "starting" && !inputPaused;
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
      setNodeGraphLiveMicStatus("armed", "Allow microphone access when the browser prompts.");
    }
    // Armed Input is always red (.active or .paused). Never leave an armed
    // control with neither class (reads as grey Off).
    inputButton.classList.toggle("active", inputActive && !inputPaused);
    inputButton.classList.toggle("paused", inputPaused);
    inputButton.setAttribute("aria-pressed", inputActive ? "true" : "false");
    inputButton.disabled = false;
    inputButton.setAttribute("aria-disabled", "false");
    labelLiveToggle(
      inputButton,
      "Input",
      inputActive,
      inputPaused ? "Paused"
        : inputStarting ? "Starting"
        : inputActive ? "Live"
        : null,
    );
    inputButton.title = inputStreaming
      ? nodeGraphTooltipText("audio.liveInputConnected")
      : inputActive
        ? nodeGraphTooltipText("audio.liveInputVisible")
        : nodeGraphTooltipText("audio.liveInputShow");
    // Refresh mic pill text (mic live ↔ mic paused) without rewriting micStatus.
    if (typeof refreshNodeGraphLiveMicStatusDisplay === "function" && nodeGraphMvp.live.micStatus) {
      refreshNodeGraphLiveMicStatusDisplay();
    }
  }
  if (outputButton) {
    // Output chrome follows outputEnabled, not bare engine presence (Input-only
    // must leave Output grey/off while the worklet stays up).
    const outputArmed = outputEnabled;
    const isPaused = outputArmed && transportState === "paused";
    const isStarting = outputArmed && transportState === "starting";
    const isLive = outputArmed && (transportState === "playing" || isStarting);
    outputButton.disabled = false;
    outputButton.classList.toggle("active", isLive && !isPaused);
    outputButton.classList.toggle("paused", isPaused);
    outputButton.classList.remove("node-under-construction-control");
    outputButton.setAttribute("aria-pressed", outputArmed ? "true" : "false");
    outputButton.setAttribute("aria-disabled", "false");
    labelLiveToggle(
      outputButton,
      "Output",
      outputArmed,
      isPaused ? "Paused"
        : isStarting ? "Starting"
        : isLive ? "Live"
        : null,
    );
    outputButton.title = nodeGraphLiveOutputButtonTitle(transportState, outputEnabled);
  }
  syncNodeGraphOutputBypassButton(outputEnabled);
  syncNodeGraphInputModuleLiveState();
  updateNodeGraphLiveInputTestStatus();
  scheduleNodeLiveToggleTextFit();
  if (typeof nodeGraphExternalNotifyLiveOutputChanged === "function") {
    nodeGraphExternalNotifyLiveOutputChanged();
  }
  // Transport colors (only the active state is lit):
  //   playing / starting → green play control
  //   paused             → yellow pause control
  //   stopped            → red stop control
  // Important: "starting" must NOT look like stopped (was lighting red ⏹
  // the moment Space/Play armed output, before the worklet existed).
  // Note: do not redeclare `starting` (status-text flag above) — that SyntaxError
  // unloaded this whole file and left renderNodeGraphLiveControls undefined.
  const transportStarting = transportState === "starting";
  const playing = transportState === "playing" || transportStarting;
  const paused = transportState === "paused";
  syncNodeGraphTransportPlayButtons({
    playing,
    paused,
    starting: transportStarting,
  });
  renderNodeGraphSpeedReadout();
  // Fractal Brownian Field: no rAF / face paint while engine stopped.
  // Start loops when live; wipe black when stopped.
  if (typeof syncNodeGraphFbmFieldFacesToLiveState === "function") {
    try {
      syncNodeGraphFbmFieldFacesToLiveState();
    } catch (_error) {
      // Best-effort — face sync must never break transport UI.
    }
  }
  if (typeof scheduleNodeGraphGridHeatmapUpdate === "function") {
    scheduleNodeGraphGridHeatmapUpdate();
  }
  if (typeof scheduleNodeGraphRoomDimmerDraw === "function") {
    scheduleNodeGraphRoomDimmerDraw();
  }
}

/**
 * Transport button states — play and pause are separate controls:
 *   playing / starting → green ▶
 *   paused             → yellow ⏸
 *   stopped            → red ⏹; play stays grey ▶
 */
function syncNodeGraphTransportPlayButtons({ playing = false, paused = false, starting = false } = {}) {
  const isPlaying = Boolean(playing); // includes "starting" when caller folds it in
  const isPaused = Boolean(paused) && !isPlaying;
  const isStarting = Boolean(starting) && isPlaying;
  // Red stop ONLY when fully cold — not while arming/starting the engine.
  const isStopped = !isPlaying && !isPaused;

  for (const tp of document.querySelectorAll("[data-transport-play], #nodeTransportPlay, button.node-transport-play")) {
    if (!(tp instanceof HTMLElement)) continue;
    if (tp.id === "nodeRenderedPlayerPlay") continue;

    tp.classList.add("node-transport-play");
    tp.classList.remove("is-playing", "is-paused");
    tp.textContent = NODE_GRAPH_TRANSPORT_GLYPH_PLAY;
    if (isPlaying) {
      tp.setAttribute("aria-label", isStarting ? "Starting" : "Play");
      tp.title = isStarting ? "Starting engine…" : "Playing";
      tp.setAttribute("aria-pressed", "true");
      tp.classList.add("is-playing");
      tp.dataset.transportState = isStarting ? "starting" : "playing";
    } else {
      tp.setAttribute("aria-label", "Play");
      tp.title = "Play";
      tp.setAttribute("aria-pressed", "false");
      tp.dataset.transportState = isPaused ? "paused" : "stopped";
    }
  }

  for (const pause of document.querySelectorAll('[data-transport-action="pause"], #nodeTransportPause, button.node-transport-pause')) {
    if (!(pause instanceof HTMLElement)) continue;
    pause.classList.add("node-transport-pause");
    pause.classList.toggle("is-paused", isPaused);
    pause.textContent = NODE_GRAPH_TRANSPORT_GLYPH_PAUSE;
    pause.dataset.transportState = isPaused
      ? "paused"
      : isStarting
        ? "starting"
        : isPlaying
          ? "playing"
          : "stopped";
    pause.title = isPaused ? "Paused" : "Pause";
    pause.setAttribute("aria-label", isPaused ? "Paused" : "Pause");
    pause.setAttribute("aria-pressed", isPaused ? "true" : "false");
  }

  for (const stop of document.querySelectorAll('[data-transport-action="stop"], #nodeTransportStop, button.node-transport-stop')) {
    if (!(stop instanceof HTMLElement)) continue;
    stop.classList.add("node-transport-stop");
    // Red only when engine is fully stopped. Grey while playing, starting, or paused.
    stop.classList.toggle("is-stopped", isStopped);
    stop.classList.toggle("is-armed", !isStopped);
    stop.textContent = NODE_GRAPH_TRANSPORT_GLYPH_STOP;
    stop.dataset.transportState = isStopped
      ? "stopped"
      : isPaused
        ? "paused"
        : isStarting
          ? "starting"
          : "playing";
    stop.title = isStopped ? "Stopped (engine off)" : "Stop engine (full cold stop)";
    stop.setAttribute("aria-label", isStopped ? "Stopped" : "Stop");
  }
}

// The header "Speed" field mirrors the engine's speed multiplier, so pausing
// (transport pause button → setNodeGraphLiveSpeed(0)) reads 0 instead of 1.0.
function renderNodeGraphSpeedReadout() {
  const speed = Math.max(0, Number(nodeGraphMvp.live.speedMultiplier ?? 1));
  const text = speed.toFixed(1);
  for (const input of document.querySelectorAll("[data-speed-readout]")) {
    if (input.value !== text) {
      input.value = text;
    }
  }
  renderNodeGraphSpeedLimitReadout();
}

function renderNodeGraphSpeedLimitReadout() {
  const limit = typeof nodeGraphLiveSpeedLimitHz === "function"
    ? nodeGraphLiveSpeedLimitHz()
    : Math.max(1, Number(nodeGraphMvp?.live?.speedLimit) || 20000);
  const text = String(limit);
  for (const input of document.querySelectorAll("[data-speed-limit]")) {
    if (document.activeElement === input) {
      continue;
    }
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

function formatNodeGraphOutputVolumeReadout(db) {
  const x = Number(db);
  if (!Number.isFinite(x) || x <= -139.5) {
    return "−∞ dB";
  }
  if (typeof formatNodeSliderNumber === "function") {
    return `${formatNodeSliderNumber(x, {
      kind: "decibels",
      maxDigits: 4,
      removeTrailingZeros: true,
    })} dB`;
  }
  return `${x.toFixed(1)} dB`;
}

function nodeGraphOutputVolumeDbToToolbarLin(db) {
  const lin = typeof nodeGraphOutputVolumeDbToLin === "function"
    ? nodeGraphOutputVolumeDbToLin(db)
    : (!Number.isFinite(Number(db)) || Number(db) <= -140 ? 0 : 10 ** (Number(db) / 20));
  return Math.max(0, Math.min(1, lin));
}

function syncNodeGraphOutputVolumeSlider(db) {
  const slider = document.getElementById("nodeLiveOutputVolume");
  const readout = document.getElementById("nodeLiveOutputVolumeValue");
  const level = nodeGraphOutputVolumeDbToToolbarLin(db);
  if (slider && document.activeElement !== slider) {
    slider.value = String(level);
  }
  if (readout) {
    readout.textContent = formatNodeGraphOutputVolumeReadout(db);
  }
}

function bindNodeGraphLiveVolumeControls() {
  // Toolbar 🔊 controls mirror module params (Output.volume, Input.level).
  const outSlider = document.getElementById("nodeLiveOutputVolume");
  if (outSlider && outSlider.dataset.volumeBound !== "true") {
    outSlider.dataset.volumeBound = "true";
    const readout = document.getElementById("nodeLiveOutputVolumeValue");
    const handle = () => {
      const value = Math.max(0, Math.min(1, Number(outSlider.value) || 0));
      if (typeof setNodeGraphOutputModuleVolume === "function") {
        setNodeGraphOutputModuleVolume(value, { fromToolbar: true, interaction: "drag" });
      } else if (typeof setNodeGraphLiveOutputVolume === "function") {
        setNodeGraphLiveOutputVolume(value);
      }
      const db = typeof getNodeGraphOutputModuleVolumeDb === "function"
        ? getNodeGraphOutputModuleVolumeDb()
        : (typeof nodeGraphOutputLinToVolumeDb === "function"
          ? nodeGraphOutputLinToVolumeDb(value)
          : (value <= 0 ? -140 : 20 * Math.log10(value)));
      if (readout) {
        readout.textContent = formatNodeGraphOutputVolumeReadout(db);
      }
    };
    outSlider.addEventListener("input", handle);
    outSlider.addEventListener("change", handle);
    const initialDb = typeof getNodeGraphOutputModuleVolumeDb === "function"
      ? getNodeGraphOutputModuleVolumeDb()
      : -3;
    outSlider.value = String(nodeGraphOutputVolumeDbToToolbarLin(initialDb));
    if (readout) {
      readout.textContent = formatNodeGraphOutputVolumeReadout(initialDb);
    }
  }
  const initialIn = typeof getNodeGraphAudioInputModuleLevel === "function"
    ? getNodeGraphAudioInputModuleLevel()
    : (nodeGraphMvp?.live?.inputVolume ?? 1);
  bindNodeGraphVolumeSlider(
    "nodeLiveInputVolume",
    "nodeLiveInputVolumeValue",
    (value) => {
      if (typeof setNodeGraphAudioInputModuleLevel === "function") {
        setNodeGraphAudioInputModuleLevel(value, { fromToolbar: true, interaction: "drag" });
      } else if (typeof setNodeGraphLiveInputVolume === "function") {
        setNodeGraphLiveInputVolume(value);
      }
    },
    initialIn,
  );
  if (typeof syncNodeGraphLiveVolumeMirrorsFromModules === "function") {
    syncNodeGraphLiveVolumeMirrorsFromModules();
  } else if (typeof syncNodeGraphLiveOutputVolumeFromOutputModule === "function") {
    syncNodeGraphLiveOutputVolumeFromOutputModule();
  }
}

function nodeGraphTransportHandleAction(action) {
  const key = String(action || "").trim();
  if (key === "play") {
    // Play only starts or resumes. Never pauses.
    // Never re-call enable while already starting — that bumps
    // outputToggleSerial and cancels the in-flight start (green flash → red).
    const hasEngine = Boolean(nodeGraphMvp.live.node);
    const transportState = typeof nodeGraphLiveTransportUiState === "function"
      ? nodeGraphLiveTransportUiState()
      : (hasEngine ? "playing" : "stopped");
    if (transportState === "starting") {
      renderNodeGraphLiveControls();
      return;
    }
    // Already "playing" on main can still mean worklet speed 0 (main default 1,
    // worklet boots paused). Force-resync so Play heals silence + stuck pause bars.
    if (transportState === "playing" && hasEngine) {
      const resume = typeof nodeGraphLiveResumePlaySpeed === "function"
        ? nodeGraphLiveResumePlaySpeed()
        : 1;
      if (typeof setNodeGraphLiveSpeed === "function") {
        setNodeGraphLiveSpeed(resume, { force: true });
      }
      if (typeof nodeGraphOutputPauseBannerClearStampFlags === "function") {
        nodeGraphOutputPauseBannerClearStampFlags();
      }
      if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
        scheduleNodeGraphModuleScopeDraw({ force: true });
      }
      renderNodeGraphLiveControls();
      return;
    }
    if (!hasEngine || transportState === "stopped") {
      if (typeof setNodeGraphLiveOutputEnabled === "function") {
        setNodeGraphLiveOutputEnabled(true);
      } else if (typeof soemdspSandboxToggleLiveOutput === "function") {
        soemdspSandboxToggleLiveOutput();
      }
    } else if (transportState === "paused") {
      if (typeof setNodeGraphLiveSpeed === "function") {
        setNodeGraphLiveSpeed(
          typeof nodeGraphLiveResumePlaySpeed === "function"
            ? nodeGraphLiveResumePlaySpeed()
            : 1,
          { force: true },
        );
      }
    }
    renderNodeGraphLiveControls();
    return;
  }
  if (key === "pause") {
    // Pause only freezes a running engine. Never starts or resumes.
    const hasEngine = Boolean(nodeGraphMvp.live.node);
    const transportState = typeof nodeGraphLiveTransportUiState === "function"
      ? nodeGraphLiveTransportUiState()
      : (hasEngine ? "playing" : "stopped");
    if (transportState === "playing") {
      if (typeof setNodeGraphLiveSpeed === "function") {
        setNodeGraphLiveSpeed(0);
      }
    }
    renderNodeGraphLiveControls();
    return;
  }
  if (key === "playpause") {
    // Spacebar: start when cold, resume when paused, pause when playing.
    const hasEngine = Boolean(nodeGraphMvp.live.node);
    const transportState = typeof nodeGraphLiveTransportUiState === "function"
      ? nodeGraphLiveTransportUiState()
      : (hasEngine ? "playing" : "stopped");
    if (transportState === "starting") {
      renderNodeGraphLiveControls();
      return;
    }
    if (transportState === "playing") {
      nodeGraphTransportHandleAction("pause");
      return;
    }
    nodeGraphTransportHandleAction("play");
    return;
  }
  if (key === "stop") {
    // Always full stop: clear both Input and Output arms, tear down engine.
    // Pause must not use this path — pause only zeros speed.
    if (typeof stopNodeGraphLiveEngineFully === "function") {
      Promise.resolve(stopNodeGraphLiveEngineFully()).then(() => {
        renderNodeGraphLiveControls(false);
      });
    } else if (typeof setNodeGraphLiveOutputEnabled === "function") {
      if (nodeGraphMvp?.live) {
        nodeGraphMvp.live.inputActive = false;
      }
      setNodeGraphLiveOutputEnabled(false);
      renderNodeGraphLiveControls();
    } else if (typeof soemdspSandboxSetLiveOutput === "function") {
      soemdspSandboxSetLiveOutput(false);
      renderNodeGraphLiveControls();
    }
    return;
  }
  if (key === "restart") {
    // ⏮ Full cold stop + start (no need to stop first).
    const run = typeof restartNodeGraphLiveSimulation === "function"
      ? restartNodeGraphLiveSimulation()
      : Promise.resolve(false);
    Promise.resolve(run).then(() => {
      renderNodeGraphLiveControls();
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp("Simulation restarted (full cold boot).");
      }
    }).catch((error) => {
      console.warn("[transport] restart failed", error);
      renderNodeGraphLiveControls();
    });
    return;
  }
  if (key === "record") {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Record is under construction.");
    }
    return;
  }
  if (key === "forward") {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Forward is under construction.");
    }
  }
}

function bindNodeGraphTransportButtons() {
  bindNodeGraphLiveVolumeControls();
  // Toolbar + Command Center mirrors share data-transport-action.
  for (const button of document.querySelectorAll("[data-transport-action]")) {
    if (button.dataset.transportBound === "true") {
      continue;
    }
    button.dataset.transportBound = "true";
    const action = button.getAttribute("data-transport-action");
    if (action === "record" || action === "forward") {
      button.disabled = true;
      button.classList.add("under-construction");
    }
    button.addEventListener("click", (event) => {
      if (button.disabled || action === "record" || action === "forward") {
        event.preventDefault();
      }
      nodeGraphTransportHandleAction(action);
    });
  }
  // Cold boot: engine is off — force red stop / grey play immediately so we
  // never sit in the unstyled HTML defaults after refresh.
  if (typeof renderNodeGraphLiveControls === "function") {
    renderNodeGraphLiveControls(Boolean(nodeGraphMvp?.live?.node));
  } else {
    syncNodeGraphTransportPlayButtons({ playing: false, paused: false, starting: false });
  }
}

window.addEventListener("load", () => {
  setTimeout(bindNodeGraphTransportButtons, 200);
});
