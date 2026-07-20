const nodeGraphExternalButtonEventNames = Object.freeze(["click", "hover", "down", "up", "enter", "leave"]);
const nodeGraphWireBreakGateSeconds = 0.52;
const nodeGraphWindowReopenGateSeconds = 1;
const nodeGraphGameTriggerDispatchDelayMs = 40;
const nodeGraphGameTriggerPulseSeconds = 0.02;
const nodeGraphExternalSandboxEventNames = Object.freeze(new Set([
  "shootingStarExplosion",
]));

// When embedded with ?autoframe=1, zoom-to-fit the whole patch after it loads.
function nodeGraphExternalAutoFrameRequested() {
  try {
    return new URLSearchParams(window.location.search).get("autoframe") === "1";
  } catch (error) {
    return false;
  }
}

// When embedded with ?autostart=1, turn Live Audio output on as soon as the
// sandbox interface is ready -- skips needing to press the output power
// button by hand for embeds that want sound playing immediately on load.
function nodeGraphExternalAutostartRequested() {
  try {
    const raw = String(new URLSearchParams(window.location.search).get("autostart") || "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  } catch (error) {
    return false;
  }
}

function nodeGraphExternalStartLiveOutput() {
  if (typeof setNodeGraphLiveOutputEnabled !== "function") {
    return;
  }
  if (nodeGraphMvp?.live?.outputEnabled) {
    return;
  }
  setNodeGraphLiveOutputEnabled(true);
}

// Autostart Live Audio once the sandbox interface has finished booting (patch
// committed, DOM built) when embedded with ?autostart=1.
if (nodeGraphExternalAutostartRequested()) {
  if (document.documentElement.dataset.nodeSandboxInterfaceReady === "true") {
    nodeGraphExternalStartLiveOutput();
  } else {
    window.addEventListener("nodeSandboxInterfaceReady", () => nodeGraphExternalStartLiveOutput(), { once: true });
  }
}

// When embedded with ?hideui=1, drop all chrome: force modular-only view and
// hide the back button, resize handle, and workspace border for a clean,
// full-screen "no nonsense" frame. Handled via a root class + CSS.
function nodeGraphExternalHideUiRequested() {
  try {
    const raw = String(new URLSearchParams(window.location.search).get("hideui") || "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  } catch (error) {
    return false;
  }
}

if (nodeGraphExternalHideUiRequested()) {
  document.documentElement.classList.add("soemdsp-hide-ui");
}

function nodeGraphExternalScheduleAutoFrame(options = {}) {
  if (typeof window.nodeGraphAutoFrame !== "function") {
    return;
  }
  // Two rAFs so node DOM has laid out (offsetWidth/height) before measuring.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.nodeGraphAutoFrame(options);
    });
  });
}

function nodeGraphExternalViewNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nodeGraphExternalApplyView(options = {}) {
  const zoom = nodeGraphExternalViewNumber(options.zoom ?? options.z, null);
  if (zoom != null && typeof setNodeGraphZoom === "function") {
    setNodeGraphZoom(zoom);
  }
  const x = nodeGraphExternalViewNumber(options.x ?? options.worldX, null);
  const y = nodeGraphExternalViewNumber(options.y ?? options.worldY, null);
  if ((x != null || y != null) && typeof setNodeGraphPan === "function") {
    const safeZoom = Math.max(0.0001, typeof nodeGraphZoom === "function" ? nodeGraphZoom() : 1);
    const gridWidth = typeof nodeGraphGridWidth === "function" ? nodeGraphGridWidth() : 20;
    const gridHeight = typeof nodeGraphGridHeight === "function" ? nodeGraphGridHeight() : 20;
    const currentPan = nodeGraphMvp?.pan || { x: 0, y: 0 };
    setNodeGraphPan(
      x != null ? -x * gridWidth * safeZoom : currentPan.x,
      y != null ? -y * gridHeight * safeZoom : currentPan.y,
      { persist: false },
    );
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires();
  }
}

function nodeGraphExternalViewOptionsFromSearch() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const zoom = params.get("sandboxZoom") ?? params.get("viewZoom") ?? params.get("zoom");
    const x = params.get("sandboxX") ?? params.get("viewX") ?? params.get("x");
    const y = params.get("sandboxY") ?? params.get("viewY") ?? params.get("y");
    const hasView = zoom != null || x != null || y != null;
    return hasView ? { zoom, x, y } : null;
  } catch (error) {
    return null;
  }
}

function nodeGraphExternalScheduleViewApply(options = {}) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => nodeGraphExternalApplyView(options));
  });
}

function nodeGraphExternalAutoFrameAfterLoad(options = {}) {
  if (nodeGraphExternalAutoFrameRequested() || options.force) {
    nodeGraphExternalScheduleAutoFrame(options);
  } else {
    const urlViewOptions = nodeGraphExternalViewOptionsFromSearch();
    if (urlViewOptions) {
      nodeGraphExternalScheduleViewApply(urlViewOptions);
    }
  }
}

function normalizeNodeGraphExternalButtonEventName(name) {
  const key = String(name || "").trim().toLowerCase();
  if (key === "mousedown" || key === "pointerdown") return "down";
  if (key === "mouseup" || key === "pointerup") return "up";
  if (key === "mouseenter" || key === "pointerenter") return "enter";
  if (key === "mouseleave" || key === "pointerleave") return "leave";
  return nodeGraphExternalButtonEventNames.includes(key) ? key : "";
}

function nodeGraphExternalButtonEventPulseSamples(sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  return Math.max(1, Math.round(Math.max(1, Number(sampleRate) || 44100) * 0.02));
}

function setNodeGraphExternalButtonEventPulse(target, name, sampleRate) {
  const key = normalizeNodeGraphExternalButtonEventName(name);
  if (!key) return false;
  const map = target.externalButtonEvents instanceof Map
    ? target.externalButtonEvents
    : new Map();
  target.externalButtonEvents = map;
  map.set(key, Math.max(Number(map.get(key)) || 0, nodeGraphExternalButtonEventPulseSamples(sampleRate)));
  return true;
}

function sendNodeGraphLiveExternalButtonEvent(name, payload = {}) {
  const key = normalizeNodeGraphExternalButtonEventName(name);
  if (!key) return false;
  if (nodeGraphMvp.live.runtime) {
    setNodeGraphExternalButtonEventPulse(
      nodeGraphMvp.live.runtime,
      key,
      nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    );
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      name: key,
      payload,
      type: "externalButtonEvent",
    });
  }
  window.dispatchEvent(new CustomEvent("nodeGraphExternalButtonEvent", {
    detail: { name: key, payload },
  }));
  return true;
}

function triggerNodeGraphExternalButtonEvent(name, payload = {}) {
  return sendNodeGraphLiveExternalButtonEvent(name, payload);
}

function scheduleNodeGraphLiveGameTriggerEvent(send, reason = "") {
  if (typeof send !== "function") {
    return false;
  }
  const normalizedReason = String(reason || "").slice(0, 120);
  window.setTimeout(() => {
    send(normalizedReason);
  }, nodeGraphGameTriggerDispatchDelayMs);
  return true;
}

function nodeGraphGameTriggerPulseSamples(sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  return Math.max(1, Math.round(Math.max(1, Number(sampleRate) || 44100) * nodeGraphGameTriggerPulseSeconds));
}

function nodeGraphWireBreakGateSamples(sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  return Math.max(1, Math.round(Math.max(1, Number(sampleRate) || 44100) * nodeGraphWireBreakGateSeconds));
}

function setNodeGraphWireBreakEventPulse(target, sampleRate) {
  if (!target || typeof target !== "object") {
    return false;
  }
  const event = target.wireBreakEvent && typeof target.wireBreakEvent === "object"
    ? target.wireBreakEvent
    : { pulseSamples: 0, gateSamples: 0 };
  event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, nodeGraphGameTriggerPulseSamples(sampleRate));
  event.gateSamples = Math.max(Number(event.gateSamples) || 0, nodeGraphWireBreakGateSamples(sampleRate));
  target.wireBreakEvent = event;
  return true;
}

function sendNodeGraphLiveWireBreakEvent(reason = "") {
  if (nodeGraphMvp.live.runtime) {
    setNodeGraphWireBreakEventPulse(
      nodeGraphMvp.live.runtime,
      nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    );
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      reason: String(reason || "").slice(0, 120),
      type: "wireBreakEvent",
    });
  }
  window.dispatchEvent(new CustomEvent("nodeGraphWireBreakEvent", {
    detail: { reason: String(reason || "") },
  }));
  return true;
}

function triggerNodeGraphWireBreakEvent(reason = "") {
  return scheduleNodeGraphLiveGameTriggerEvent(sendNodeGraphLiveWireBreakEvent, reason);
}

function setNodeGraphWireConnectEventPulse(target, sampleRate) {
  if (!target || typeof target !== "object") {
    return false;
  }
  const event = target.wireConnectEvent && typeof target.wireConnectEvent === "object"
    ? target.wireConnectEvent
    : { pulseSamples: 0 };
  event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, nodeGraphGameTriggerPulseSamples(sampleRate));
  target.wireConnectEvent = event;
  return true;
}

function sendNodeGraphLiveWireConnectEvent(reason = "") {
  if (nodeGraphMvp.live.runtime) {
    setNodeGraphWireConnectEventPulse(
      nodeGraphMvp.live.runtime,
      nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    );
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      reason: String(reason || "").slice(0, 120),
      type: "wireConnectEvent",
    });
  }
  window.dispatchEvent(new CustomEvent("nodeGraphWireConnectEvent", {
    detail: { reason: String(reason || "") },
  }));
  return true;
}

function triggerNodeGraphWireConnectEvent(reason = "") {
  return scheduleNodeGraphLiveGameTriggerEvent(sendNodeGraphLiveWireConnectEvent, reason);
}

function setNodeGraphWireDisconnectEventPulse(target, sampleRate) {
  if (!target || typeof target !== "object") {
    return false;
  }
  const event = target.wireDisconnectEvent && typeof target.wireDisconnectEvent === "object"
    ? target.wireDisconnectEvent
    : { pulseSamples: 0 };
  event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, nodeGraphGameTriggerPulseSamples(sampleRate));
  target.wireDisconnectEvent = event;
  return true;
}

function sendNodeGraphLiveWireDisconnectEvent(reason = "") {
  if (nodeGraphMvp.live.runtime) {
    setNodeGraphWireDisconnectEventPulse(
      nodeGraphMvp.live.runtime,
      nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    );
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      reason: String(reason || "").slice(0, 120),
      type: "wireDisconnectEvent",
    });
  }
  window.dispatchEvent(new CustomEvent("nodeGraphWireDisconnectEvent", {
    detail: { reason: String(reason || "") },
  }));
  return true;
}

function triggerNodeGraphWireDisconnectEvent(reason = "") {
  return scheduleNodeGraphLiveGameTriggerEvent(sendNodeGraphLiveWireDisconnectEvent, reason);
}

// Unlike the ambient wireBreakEvent/wireDisconnectEvent pulses above (a
// global "something happened" cue, deliberately delayed via
// scheduleNodeGraphLiveGameTriggerEvent for external/game-trigger use),
// this feeds a real single-sample trigger into the SPECIFIC input port
// that just lost its signal wire -- fired immediately, no delay, since
// the point is for downstream modules (envelopes, sample+hold, etc.) to
// feel the break happen, not to look/feel juicy. Called from
// disconnectNodeGraphConnection for every "signal" kind disconnect,
// regardless of which UI path removed the wire.
function triggerNodeGraphInputWireBreakPulse(nodeId, port) {
  if (!nodeId || !port) {
    return false;
  }
  if (nodeGraphMvp.live.runtime) {
    if (!(nodeGraphMvp.live.runtime.inputWireBreakTriggers instanceof Map)) {
      nodeGraphMvp.live.runtime.inputWireBreakTriggers = new Map();
    }
    nodeGraphMvp.live.runtime.inputWireBreakTriggers.set(`${nodeId}.${port}`, 1);
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      nodeId,
      port,
      type: "inputWireBreakTrigger",
    });
  }
  return true;
}

function nodeGraphShootingStarExplosionEventSpeed(payload) {
  const speed = Number(payload?.speed);
  return Number.isFinite(speed) ? speed : null;
}

function setNodeGraphShootingStarExplosionEventPulse(target, sampleRate, speed = null) {
  if (!target || typeof target !== "object") {
    return false;
  }
  const event = target.shootingStarExplosionEvent && typeof target.shootingStarExplosionEvent === "object"
    ? target.shootingStarExplosionEvent
    : { pulseSamples: 0, speed: null };
  event.pulseSamples = Math.max(0, Number(event.pulseSamples) || 0) + 1;
  event.speed = Number.isFinite(Number(speed)) ? Number(speed) : null;
  target.shootingStarExplosionEvent = event;
  return true;
}

function sendNodeGraphLiveShootingStarExplosionEvent(payload = {}) {
  const eventPayload = payload && typeof payload === "object" ? payload : {};
  const speed = nodeGraphShootingStarExplosionEventSpeed(eventPayload);
  if (nodeGraphMvp.live.runtime) {
    setNodeGraphShootingStarExplosionEventPulse(
      nodeGraphMvp.live.runtime,
      nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
      speed,
    );
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      payload: eventPayload,
      speed,
      type: "shootingStarExplosionEvent",
    });
  }
  window.dispatchEvent(new CustomEvent("nodeGraphShootingStarExplosionEvent", {
    detail: { payload: eventPayload },
  }));
  return true;
}

function triggerNodeGraphShootingStarExplosionEvent(payload = {}) {
  return sendNodeGraphLiveShootingStarExplosionEvent(payload);
}

function triggerNodeGraphGameEvent(name, payload = {}) {
  const eventName = String(name || "").trim();
  if (eventName === "shootingStarExplosion") {
    return triggerNodeGraphShootingStarExplosionEvent(payload);
  }
  return false;
}

function triggerNodeGraphImpulseButton(nodeId) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const rawAmplitude = Number(patchNode?.params?.amplitude);
  const amplitude = Number.isFinite(rawAmplitude) ? Math.max(0, Math.min(1, rawAmplitude)) : 1;
  if (nodeGraphMvp.live.runtime) {
    const states = nodeGraphMvp.live.runtime.impulseButtonStates instanceof Map
      ? nodeGraphMvp.live.runtime.impulseButtonStates
      : new Map();
    nodeGraphMvp.live.runtime.impulseButtonStates = states;
    const state = states.get(nodeId) || { amplitude: 1, pulseSamples: 0 };
    state.pulseSamples = Math.max(0, Number(state.pulseSamples) || 0) + 1;
    state.amplitude = amplitude;
    states.set(nodeId, state);
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      amplitude,
      nodeId,
      type: "impulseButtonTrigger",
    });
  }
  return true;
}

function nodeGraphExternalMessageOriginAllowed(event) {
  if (!event || !event.origin) {
    return true;
  }
  return event.origin === window.location.origin;
}

function nodeGraphWindowReopenGateSamples(sampleRate = nodeGraphMvp?.sampleRate || 44100) {
  return Math.max(1, Math.round(Math.max(1, Number(sampleRate) || 44100) * nodeGraphWindowReopenGateSeconds));
}

function setNodeGraphWindowReopenEventPulse(target, sampleRate) {
  if (!target || typeof target !== "object") {
    return false;
  }
  const samples = nodeGraphWindowReopenGateSamples(sampleRate);
  target.windowReopenEvent = {
    gateSamples: samples,
    pulseSamples: nodeGraphGameTriggerPulseSamples(sampleRate),
    totalSamples: samples,
  };
  return true;
}

function sendNodeGraphLiveWindowReopenEvent(reason = "") {
  if (nodeGraphMvp.live.runtime) {
    setNodeGraphWindowReopenEventPulse(
      nodeGraphMvp.live.runtime,
      nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    );
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      reason: String(reason || "").slice(0, 120),
      type: "windowReopenEvent",
    });
  }
  window.dispatchEvent(new CustomEvent("nodeGraphWindowReopenEvent", {
    detail: { reason: String(reason || "") },
  }));
  return true;
}

function triggerNodeGraphWindowReopenEvent(reason = "") {
  return scheduleNodeGraphLiveGameTriggerEvent(sendNodeGraphLiveWindowReopenEvent, reason);
}

// Play/stop control for the whole sandbox's Live Audio output -- the thing
// an embedding page's own transport button actually wants (start/stop
// sound), distinct from triggerButtonEvent above (which fires a signal
// *into* the patch graph, e.g. a Button Events module, not the engine
// on/off switch itself). Mirrors setNodeGraphLiveOutputEnabled exactly, so
// external and in-app control (the output power button) stay one state
// machine, not two.
function soemdspSandboxSetLiveOutput(enabled) {
  if (typeof setNodeGraphLiveOutputEnabled !== "function") {
    return false;
  }
  setNodeGraphLiveOutputEnabled(Boolean(enabled));
  return true;
}

function soemdspSandboxToggleLiveOutput() {
  if (typeof toggleNodeGraphLiveOutput !== "function") {
    return false;
  }
  toggleNodeGraphLiveOutput();
  return true;
}

function soemdspSandboxLiveOutputEnabled() {
  return Boolean(nodeGraphMvp?.live?.outputEnabled);
}

// Fire-and-forget notice to the parent page whenever output actually
// changes -- driven by renderNodeGraphLiveControls (called on every state
// change regardless of what triggered it: this function, the in-app power
// button, ear protection tripping, etc.) so an external play/stop button
// can stay in sync without polling.
let nodeGraphExternalLastReportedLiveOutputEnabled = null;
let nodeGraphExternalLastReportedLivePaused = null;
let nodeGraphExternalLastReportedLiveSpeed = null;
function nodeGraphExternalNotifyLiveOutputChanged() {
  const enabled = soemdspSandboxLiveOutputEnabled();
  const paused = Boolean(nodeGraphMvp?.live?.paused);
  const speed = Number(nodeGraphMvp?.live?.speedMultiplier) || 1;
  if (
    enabled === nodeGraphExternalLastReportedLiveOutputEnabled &&
    paused === nodeGraphExternalLastReportedLivePaused &&
    speed === nodeGraphExternalLastReportedLiveSpeed
  ) {
    return;
  }
  nodeGraphExternalLastReportedLiveOutputEnabled = enabled;
  nodeGraphExternalLastReportedLivePaused = paused;
  nodeGraphExternalLastReportedLiveSpeed = speed;
  const parentWindow = window.parent;
  if (!parentWindow || parentWindow === window) {
    return;
  }
  try {
    parentWindow.postMessage(
      { type: "soundemote:live-output-changed", enabled, paused, speed },
      window.location.origin,
    );
  } catch (error) {
    // Cross-origin parent with a mismatched origin guess -- nothing to do.
  }
}

window.soemdspSandboxSetLiveOutput = soemdspSandboxSetLiveOutput;
window.soemdspSandboxToggleLiveOutput = soemdspSandboxToggleLiveOutput;
window.soemdspSandboxLiveOutputEnabled = soemdspSandboxLiveOutputEnabled;

window.soemdspSandboxTriggerButtonEvent = triggerNodeGraphExternalButtonEvent;
window.soemdspSandboxTriggerWireBreakEvent = triggerNodeGraphWireBreakEvent;
window.soemdspSandboxTriggerWireConnectEvent = triggerNodeGraphWireConnectEvent;
window.soemdspSandboxTriggerWireDisconnectEvent = triggerNodeGraphWireDisconnectEvent;
window.soemdspSandboxTriggerWindowReopenEvent = triggerNodeGraphWindowReopenEvent;
window.soemdspSandboxTriggerGameEvent = triggerNodeGraphGameEvent;
window.soemdspSandboxTriggerShootingStarExplosionEvent = triggerNodeGraphShootingStarExplosionEvent;

const soemdspHeroEventNames = Object.freeze(new Set(["spawnShootingStar", "setRate"]));

function soemdspSandboxEmitHeroEvent(event, payload = {}) {
  const eventName = String(event || "").trim();
  if (!soemdspHeroEventNames.has(eventName)) return false;
  const parentWindow = window.parent;
  if (!parentWindow || parentWindow === window) return false;
  try {
    parentWindow.postMessage(
      { type: "soundemote:hero-event", event: eventName, payload: payload || {} },
      window.location.origin,
    );
    return true;
  } catch (error) {
    return false;
  }
}

function soemdspSandboxSpawnShootingStar(payload = {}) {
  return soemdspSandboxEmitHeroEvent("spawnShootingStar", payload);
}

function soemdspSandboxSetShootingStarRate(intervalSeconds, payload = {}) {
  return soemdspSandboxEmitHeroEvent("setRate", { ...payload, intervalSeconds });
}

window.soemdspSandboxEmitHeroEvent = soemdspSandboxEmitHeroEvent;
window.soemdspSandboxSpawnShootingStar = soemdspSandboxSpawnShootingStar;
window.soemdspSandboxSetShootingStarRate = soemdspSandboxSetShootingStarRate;

function nodeGraphAcceptFileGridSelection(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  const normalizedResources = list
    .map((row) => typeof normalizeNodeGraphFileGridResourceRow === "function"
      ? normalizeNodeGraphFileGridResourceRow(row)
      : null)
    .filter(Boolean);
  if (typeof registerNodeGraphResources === "function") {
    registerNodeGraphResources(normalizedResources);
  }
  nodeGraphMvp.pendingFileGridResources = normalizedResources;
  const audioResource = normalizedResources.find((resource) => resource.kind === "audio") || null;
  const targetNodeId = typeof nodeGraphAudioPlayerTargetNodeId === "function"
    ? nodeGraphAudioPlayerTargetNodeId(options)
    : "";
  if (audioResource && targetNodeId && typeof nodeGraphSetAudioPlayerResource === "function") {
    const result = nodeGraphSetAudioPlayerResource(targetNodeId, audioResource, {
      record: options.record !== false,
    });
    if (result.ok) {
      setNodeInteractionHelp(`File Grid audio assigned to ${targetNodeId}`);
    } else {
      setNodeInteractionHelp(result.reason || "File Grid audio could not be assigned");
    }
    return {
      ...result,
      resources: normalizedResources,
      targetNodeId,
    };
  }
  const message = audioResource
    ? "File Grid audio registered; select a Music Player to bind it"
    : `File Grid resources registered (${normalizedResources.length})`;
  setNodeInteractionHelp(message);
  return {
    ok: true,
    resources: normalizedResources,
    targetNodeId,
  };
}

window.nodeGraphAcceptFileGridSelection = nodeGraphAcceptFileGridSelection;
window.soemdspSandboxAcceptFileGridSelection = nodeGraphAcceptFileGridSelection;

window.addEventListener("message", (event) => {
  const message = event.data && typeof event.data === "object" ? event.data : null;
  if (!message) {
    return;
  }
  if (message.type === "soemdsp-sandbox-button-event") {
    triggerNodeGraphExternalButtonEvent(message.name || message.event, {
      buttonId: message.buttonId || "",
      label: message.label || "",
      source: message.source || "external-page",
    });
  } else if (message.type === "soemdsp-sandbox-file-grid-selection") {
    nodeGraphAcceptFileGridSelection(message.rows || message.resources || message.resource || message.row, {
      audioPlayerNodeId: message.audioPlayerNodeId || "",
      nodeId: message.nodeId || "",
      record: message.record !== false,
      source: message.source || "file-grid",
      targetNodeId: message.targetNodeId || "",
    });
  } else if (message.type === "soundemote:sandbox-load-resource") {
    if (!nodeGraphExternalMessageOriginAllowed(event)) {
      return;
    }
    const envelope = message.resourceData || message.payload || message.resourceEnvelope || message;
    const resourceRows = envelope?.kind === "sandbox_resource"
      ? envelope.resource
      : (message.rows || message.resources || message.resource || message.row);
    nodeGraphAcceptFileGridSelection(resourceRows, {
      audioPlayerNodeId: message.audioPlayerNodeId || "",
      nodeId: message.nodeId || "",
      record: message.record !== false,
      source: message.source || envelope?.source || "soundemote-file-grid",
      targetNodeId: message.targetNodeId || "",
    });
  } else if (message.type === "soundemote:sandbox-event") {
    if (!nodeGraphExternalMessageOriginAllowed(event)) {
      return;
    }
    const eventName = String(message.event || "").trim();
    if (!nodeGraphExternalSandboxEventNames.has(eventName)) {
      return;
    }
    triggerNodeGraphGameEvent(eventName, message.payload || {});
  } else if (message.type === "soundemote:sandbox-project-data") {
    try {
      if (typeof nodeGraphPatchFromShareProjectData === "function") {
        const loadedPatch = nodeGraphPatchFromShareProjectData(message.projectData);
        const clonedPatch =
          typeof cloneNodeGraphPatch === "function"
            ? cloneNodeGraphPatch(loadedPatch)
            : loadedPatch;
        commitNodeGraphPatch(clonedPatch, { status: "shared patch loaded" });
        // Flag that an external patch was applied so the boot sequence's own
        // startup-patch commit (which can still be in flight -- it awaits an
        // async default-preset fetch) doesn't unconditionally overwrite it
        // if this message arrives mid-boot.
        nodeGraphMvp.externalStartupPatchApplied = true;
        nodeGraphExternalAutoFrameAfterLoad();
      }
    } catch (error) {
      if (typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus(`shared patch load failed: ${error?.message || error}`, false);
      }
    }
  } else if (message.type === "soundemote:autoframe") {
    nodeGraphExternalScheduleAutoFrame(
      message.padding != null ? { padding: message.padding, force: true } : { force: true },
    );
  } else if (message.type === "soundemote:set-view") {
    if (!nodeGraphExternalMessageOriginAllowed(event)) {
      return;
    }
    nodeGraphExternalScheduleViewApply(message.view || message);
  } else if (message.type === "soundemote:set-live-output") {
    if (!nodeGraphExternalMessageOriginAllowed(event)) {
      return;
    }
    if (Object.hasOwn(message, "enabled")) {
      soemdspSandboxSetLiveOutput(message.enabled);
    } else {
      soemdspSandboxToggleLiveOutput();
    }
  } else if (message.type === "soundemote:set-live-paused") {
    if (!nodeGraphExternalMessageOriginAllowed(event)) {
      return;
    }
    if (Object.hasOwn(message, "paused")) {
      if (typeof setNodeGraphLivePaused === "function") {
        setNodeGraphLivePaused(message.paused);
      }
    } else {
      if (typeof toggleNodeGraphLivePaused === "function") {
        toggleNodeGraphLivePaused();
      }
    }
  } else if (message.type === "soundemote:set-live-speed") {
    if (!nodeGraphExternalMessageOriginAllowed(event)) {
      return;
    }
    if (typeof setNodeGraphLiveSpeed === "function" && Object.hasOwn(message, "speed")) {
      setNodeGraphLiveSpeed(message.speed);
    }
  } else if (message.type === "soundemote:request-live-state") {
    const enabled = soemdspSandboxLiveOutputEnabled();
    const paused = Boolean(nodeGraphMvp?.live?.paused);
    const speed = Number(nodeGraphMvp?.live?.speedMultiplier) || 1;
    event.source?.postMessage(
      {
        type: "soundemote:live-state",
        requestId: message.requestId || null,
        enabled,
        paused,
        speed,
      },
      event.origin,
    );
  } else if (message.type === "soundemote:request-current-patch") {
    let projectData = null;
    try {
      if (typeof nodeGraphShareProjectData === "function") {
        projectData = nodeGraphShareProjectData();
      }
    } catch (error) {
      projectData = null;
    }
    event.source?.postMessage(
      {
        type: "soundemote:current-patch",
        requestId: message.requestId || null,
        projectData,
      },
      event.origin,
    );
  }
});

// Autoframe the initial patch on load when embedded with ?autoframe=1.
if (nodeGraphExternalAutoFrameRequested()) {
  if (document.readyState === "complete") {
    nodeGraphExternalScheduleAutoFrame();
  } else {
    window.addEventListener("load", () => nodeGraphExternalScheduleAutoFrame(), { once: true });
  }
} else {
  const urlViewOptions = nodeGraphExternalViewOptionsFromSearch();
  if (urlViewOptions) {
    if (document.readyState === "complete") {
      nodeGraphExternalScheduleViewApply(urlViewOptions);
    } else {
      window.addEventListener("load", () => nodeGraphExternalScheduleViewApply(urlViewOptions), { once: true });
    }
  }
}
