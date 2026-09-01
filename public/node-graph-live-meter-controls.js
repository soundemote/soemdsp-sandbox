function setNodeGraphLiveMeter(
  peak = 0,
  rms = 0,
  clipCount = 0,
  protectionMuteCount = 0,
  badNumberCount = 0,
  overrunCount = 0,
  maxBlockProcessMs = 0,
  maxBlockBudgetRatio = 0,
) {
  const meter = document.getElementById("nodeLiveMeter");
  if (!meter) {
    return;
  }
  const clipText = clipCount ? ` / ${nodeGraphOutputClipCountText(clipCount)}` : "";
  const protectionText = protectionMuteCount ? ` / protected ${protectionMuteCount}` : "";
  const badNumberText = badNumberCount ? ` / bad ${badNumberCount}` : "";
  const overrunText = overrunCount
    ? ` / over ${overrunCount} / ${maxBlockProcessMs.toFixed(2)}ms / ${(maxBlockBudgetRatio * 100).toFixed(0)}%`
    : "";
  meter.textContent = `live peak ${peak.toFixed(3)} / rms ${rms.toFixed(3)}${clipText}${protectionText}${badNumberText}${overrunText}`;
  meter.dataset.liveClips = String(clipCount);
  meter.dataset.liveProtectionMutes = String(protectionMuteCount);
  meter.dataset.liveBadNumbers = String(badNumberCount);
  meter.dataset.liveOverruns = String(overrunCount);
  meter.className = `pill ${clipCount || protectionMuteCount || badNumberCount || overrunCount ? "warn" : peak > 0.001 ? "good" : ""}`.trim();
}

function setNodeGraphLiveInputMeter(peak = 0, rms = 0) {
  const meter = document.getElementById("nodeLiveInputMeter");
  const safePeak = Number.isFinite(Number(peak)) ? Math.max(0, Math.min(1, Number(peak))) : 0;
  const safeRms = Number.isFinite(Number(rms)) ? Math.max(0, Math.min(1, Number(rms))) : 0;
  nodeGraphMvp.live.inputMeterPeak = safePeak;
  nodeGraphMvp.live.inputMeterRms = safeRms;
  if (!meter) {
    syncNodeGraphInputModuleLiveState();
    return;
  }
  meter.textContent = `input peak ${safePeak.toFixed(3)} / rms ${safeRms.toFixed(3)}`;
  meter.className = `pill ${safePeak > 0.001 ? "good" : ""}`.trim();
  syncNodeGraphInputModuleLiveState();
  updateNodeGraphLiveInputTestStatus();
}

function setNodeGraphLiveScheduleStatus(text, state = "") {
  const status = document.getElementById("nodeLiveRouteStatus");
  if (!status) {
    return;
  }
  status.textContent = text;
  status.className = `pill ${state}`.trim();
}

function nodeGraphGpuAdditiveRecipeText(queue = {}) {
  const diagnostics = queue?.diagnostics || {};
  const recipe = diagnostics.gpuRecipe || diagnostics.reason || "";
  const waveform = Number.isFinite(Number(diagnostics.waveform))
    ? `wf ${Number(diagnostics.waveform)}`
    : "";
  const harmonics = Number.isFinite(Number(diagnostics.harmonics))
    ? `h${Number(diagnostics.harmonics)}`
    : "";
  return [recipe, waveform, harmonics].filter(Boolean).join(" / ");
}

function nodeGraphGpuAdditiveAdapterText(adapter = null) {
  if (!adapter || typeof adapter !== "object") {
    return "";
  }
  return [
    adapter.vendor,
    adapter.architecture,
    adapter.device,
    adapter.description,
  ].filter(Boolean).join(" / ");
}

function setNodeGraphGpuAdditiveStatus(details = null) {
  const status = document.getElementById("nodeGpuAdditiveStatus");
  if (!status) {
    return;
  }
  const queues = Array.isArray(details?.queues) ? details.queues : [];
  const underruns = Math.max(0, Number(details?.underruns) || 0);
  if (!queues.length) {
    status.textContent = "gpu add idle";
    status.className = "pill";
    status.removeAttribute("title");
    return;
  }
  const totalChunks = queues.reduce((sum, queue) => sum + (Number(queue.chunks) || 0), 0);
  const backends = Array.from(
    new Set(queues.map((queue) => String(queue.backend || "unknown")).filter(Boolean))
  );
  const recipes = Array.from(
    new Set(queues.map(nodeGraphGpuAdditiveRecipeText).filter(Boolean))
  );
  const backendText = backends.join("+") || "unknown";
  const recipeText = recipes.length === 1 ? ` / ${recipes[0]}` : "";
  status.textContent = `gpu add ${backendText}${recipeText} / q${totalChunks} / u${underruns}`;
  status.className = `pill ${underruns ? "warn" : totalChunks ? "good" : ""}`.trim();
  status.title = queues
    .map((queue) => {
      const nodeId = queue.nodeId || "node";
      const backend = queue.backend || "unknown";
      const chunks = Number(queue.chunks) || 0;
      const diagnostics = queue.diagnostics || {};
      const dropped = Number(queue.droppedChunks) || 0;
      const heldGain = Number.isFinite(Number(queue.heldGain)) ? Number(queue.heldGain) : 1;
      const held = Number(queue.heldSamples) || 0;
      const recipe = nodeGraphGpuAdditiveRecipeText(queue);
      const renderMs = Number.isFinite(Number(diagnostics.renderMs))
        ? ` / render ${Number(diagnostics.renderMs).toFixed(2)}ms`
        : "";
      const sequence = Number(queue.expectedSequence) || 0;
      const samples = Number(queue.samples) || 0;
      const adapter = nodeGraphGpuAdditiveAdapterText(diagnostics.adapter);
      const adapterText = adapter ? ` / adapter ${adapter}` : "";
      const diagnosticsText = Object.keys(diagnostics).length
        ? ` / ${JSON.stringify(diagnostics)}`
        : "";
      return `${nodeId}: ${backend}${recipe ? ` / ${recipe}` : ""} / chunks ${chunks} / samples ${samples} / seq ${sequence} / dropped ${dropped} / held ${held} @ ${heldGain.toFixed(3)}${renderMs}${adapterText}${diagnosticsText}`;
    })
    .join("\n");
}

function setNodeGraphLiveInputStatus(state, message = "") {
  const status = document.getElementById("nodeLiveInputStatus");
  nodeGraphMvp.live.inputStatus = state;
  if (!status) {
    return;
  }
  const textByState = {
    blocked: "input blocked",
    connected: "input connected",
    off: "input off",
    requesting: "input asking",
    wired: "input wired",
    unwired: "input unwired",
  };
  const classByState = {
    blocked: "error",
    connected: "good",
    off: "",
    requesting: "warn",
    wired: "good",
    unwired: "warn",
  };
  status.textContent = textByState[state] || "input off";
  status.className = `pill ${classByState[state] || ""}`.trim();
  if (message) {
    status.title = message;
  } else {
    status.removeAttribute("title");
  }
  syncNodeGraphInputModuleLiveState();
  updateNodeGraphLiveInputTestStatus();
}

function nodeGraphLiveMicIsPausedDisplay(state = nodeGraphMvp.live.micStatus) {
  return state === "connected"
    && typeof nodeGraphLiveEngineIsPaused === "function"
    && nodeGraphLiveEngineIsPaused();
}

/** Chrome pill + Input badge label SSOT (connected → mic paused while transport paused). */
function nodeGraphLiveMicStatusText(state = nodeGraphMvp.live.micStatus) {
  switch (state) {
    case "armed":
      return "mic armed";
    case "blocked":
      return "mic blocked";
    case "connected":
      return nodeGraphLiveMicIsPausedDisplay(state) ? "mic paused" : "mic live";
    case "requesting":
      return "mic asking";
    default:
      return "mic off";
  }
}

function nodeGraphLiveMicStatusPillClass(state = nodeGraphMvp.live.micStatus) {
  if (nodeGraphLiveMicIsPausedDisplay(state)) {
    return "paused";
  }
  switch (state) {
    case "armed":
    case "requesting":
      return "warn";
    case "blocked":
      return "error";
    case "connected":
      return "good";
    default:
      return "";
  }
}

function nodeGraphLivePermissionStatusText(state = nodeGraphMvp.live.inputPermissionStatus) {
  switch (state) {
    case "denied":
      return "mic blocked";
    case "granted":
      return "mic allowed";
    case "prompt":
      return "mic ask ready";
    case "unsupported":
      return "mic permission unknown";
    default:
      return "mic unknown";
  }
}
