function setNodeGraphLiveProcessorError(message = "AudioWorklet processor error") {
  nodeGraphClearGpuAdditivePrime();
  setNodeGraphLiveOutputMuted(true);
  nodeGraphMvp.live.runtime = null;
  setNodeGraphLiveEvidence("processor-error", {
    message,
    patchFingerprint: nodeGraphPatchFingerprint(),
  });
  setNodeGraphLiveStatus("error", "warn");
  setNodeGraphLiveEngineStatus("engine error", "warn");
  setNodeGraphLiveEngineTitle(message);
  setNodeGraphLivePlanStatus("plan blocked", "warn");
  setNodeGraphLiveInputMeter();
  setNodeGraphLiveMeter();
  setNodeGraphGpuAdditiveStatus();
  setNodeGraphLiveScheduleStatus(`processor error: ${message}`, "warn");
  document.getElementById("nodeLiveStatus").title = message;
  renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
}

function setNodeGraphLiveOutputMuted(muted) {
  const outputGain = nodeGraphMvp.live.outputGain;
  const context = nodeGraphMvp.live.context;
  if (!outputGain?.gain) {
    return;
  }
  const value = muted ? 0 : 1;
  const time = context?.currentTime || 0;
  try {
    outputGain.gain.cancelScheduledValues(time);
    outputGain.gain.setValueAtTime(value, time);
  } catch (_error) {
    outputGain.gain.value = value;
  }
}

let nodeGraphLiveNativeModuleCatalogPromise = null;
let nodeGraphLiveNativeModuleBytes = {};

// On static hosts with no server behind the page (e.g. the sandbox embedded
// as a static export), "/api/native-modules" doesn't exist. Fall back to a
// pre-generated catalog shipped alongside index.html — same shape server.py
// returns, so nothing downstream needs to know which path was used.
async function fetchNodeGraphLiveNativeModuleCatalogFallback() {
  try {
    const response = await fetch("native-modules-catalog.json", { cache: "no-store" });
    return response.ok ? response.json() : { modules: [] };
  } catch (_error) {
    return { modules: [] };
  }
}

async function fetchNodeGraphLiveNativeModuleCatalog() {
  if (!nodeGraphLiveNativeModuleCatalogPromise) {
    nodeGraphLiveNativeModuleCatalogPromise = fetch("/api/native-modules", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : fetchNodeGraphLiveNativeModuleCatalogFallback())
      .catch(() => fetchNodeGraphLiveNativeModuleCatalogFallback());
  }
  return nodeGraphLiveNativeModuleCatalogPromise;
}

async function fetchNodeGraphLiveNativeModuleBytes(entry) {
  const wasmUrl = String(entry?.wasmUrl || "");
  if (!wasmUrl) {
    return null;
  }
  if (!nodeGraphLiveNativeModuleBytes[wasmUrl]) {
    nodeGraphLiveNativeModuleBytes[wasmUrl] = fetch(wasmUrl, { cache: "no-store" })
      .then((response) => response.ok ? response.arrayBuffer() : null)
      .catch(() => null);
  }
  return nodeGraphLiveNativeModuleBytes[wasmUrl];
}

// A few native modules serve more than one node type (see the worklet's own
// nativeModuleStatus alias checks). The catalog only records one targetType
// per entry, so a patch using the aliased type would otherwise miss the
// priority boost below.
const nodeGraphLiveNativeModuleTypeAliases = Object.freeze({
  vactrolEnvelopeSeries: ["vactrolEnvelopeCustom"],
  triggerDivider: ["clockDivider"],
});

function nodeGraphLiveActivePatchNativeTargetTypes(plan) {
  const types = new Set();
  for (const node of plan?.nodes || []) {
    if (node?.type) {
      types.add(node.type);
    }
  }
  return types;
}

function nodeGraphLiveNativeModuleIsUsedByPatch(entry, activeTypes) {
  const targetType = entry?.targetType || "";
  if (!targetType) {
    return false;
  }
  if (activeTypes.has(targetType)) {
    return true;
  }
  const aliases = nodeGraphLiveNativeModuleTypeAliases[targetType];
  return Array.isArray(aliases) && aliases.some((type) => activeTypes.has(type));
}

async function sendNodeGraphLiveNativeModule(liveNode, entry) {
  const bytes = await fetchNodeGraphLiveNativeModuleBytes(entry);
  if (!(bytes instanceof ArrayBuffer)) {
    return;
  }
  const transferableBytes = bytes.slice(0);
  liveNode.port.postMessage(
    {
      type: "setNativeModuleWasm",
      name: entry.name || entry.targetType || "",
      targetType: entry.targetType || "",
      bytes: transferableBytes,
    },
    [transferableBytes],
  );
}

// Loads every native module's wasm and hands it to the worklet. Modules the
// current patch actually references are fetched concurrently and sent as
// soon as each arrives -- fetch is network I/O, not CPU, so this costs
// nothing extra, and it means whatever the patch needs is ready in roughly
// one fetch's worth of time instead of waiting behind however many other
// modules happen to sort earlier in the (alphabetical) catalog. Everything
// else stays on the original one-at-a-time path: the worklet compiles
// WebAssembly on a single JS thread regardless of send order, so racing
// dozens of irrelevant modules in at once wouldn't load them any faster --
// it would just pack their compiles into one uninterrupted burst on the
// audio thread while live audio may already be running.
async function sendNodeGraphLiveNativeModules(liveNode, plan = null) {
  if (!liveNode?.port) {
    return;
  }
  const catalog = await fetchNodeGraphLiveNativeModuleCatalog();
  const nativeModules = Array.isArray(catalog?.modules) ? catalog.modules : [];
  const activeTargetTypes = nodeGraphLiveActivePatchNativeTargetTypes(plan);
  const priorityEntries = [];
  const deferredEntries = [];
  for (const entry of nativeModules) {
    if (!entry?.wasmAvailable) {
      continue;
    }
    // video-poc entries (e.g. video_synth_raster) have their own standalone
    // demo page that fetches and instantiates their wasm directly -- they
    // were never wired into the worklet's nativeModuleStatus dispatch, so
    // preloading them here only produces a false-positive "unsupported
    // native module" diagnostic.
    if (entry.kind === "video-poc") {
      continue;
    }
    if (nodeGraphLiveNativeModuleIsUsedByPatch(entry, activeTargetTypes)) {
      priorityEntries.push(entry);
    } else {
      deferredEntries.push(entry);
    }
  }
  await Promise.all(priorityEntries.map((entry) => sendNodeGraphLiveNativeModule(liveNode, entry)));
  for (const entry of deferredEntries) {
    await sendNodeGraphLiveNativeModule(liveNode, entry);
  }
}

async function refreshNodeGraphLiveMicrophonePermissionState() {
  if (!navigator.permissions?.query) {
    nodeGraphMvp.live.inputPermissionStatus = "unsupported";
    updateNodeGraphLiveInputTestStatus();
    return "unsupported";
  }
  try {
    const permission = await navigator.permissions.query({ name: "microphone" });
    const updatePermissionState = () => {
      nodeGraphMvp.live.inputPermissionStatus = permission.state || "unknown";
      if (
        nodeGraphMvp.live.inputActive &&
        !nodeGraphMvp.live.inputStream &&
        permission.state === "denied"
      ) {
        const message = "Microphone permission is blocked in the browser.";
        setNodeGraphLiveInputStatus("blocked", message);
        setNodeGraphLiveMicStatus("blocked", message);
      } else if (
        nodeGraphMvp.live.inputActive &&
        !nodeGraphMvp.live.inputStream &&
        nodeGraphMvp.live.micStatus === "blocked"
      ) {
        const routeState = nodeGraphLiveInputRouteState();
        setNodeGraphLiveInputStatus(routeState.state, routeState.message);
        setNodeGraphLiveMicStatus(
          "armed",
          permission.state === "granted"
            ? "Microphone permission is allowed. Start OUTPUT to connect it."
            : "Start OUTPUT to request browser microphone permission.",
        );
      } else {
        updateNodeGraphLiveInputTestStatus();
      }
    };
    updatePermissionState();
    permission.onchange = updatePermissionState;
    return nodeGraphMvp.live.inputPermissionStatus;
  } catch (_error) {
    nodeGraphMvp.live.inputPermissionStatus = "unsupported";
    updateNodeGraphLiveInputTestStatus();
    return "unsupported";
  }
}

async function refreshNodeGraphLiveInputDevices() {
  const select = document.getElementById("nodeLiveInputDeviceSelect");
  if (!select) {
    return;
  }
  const selectedDeviceId = nodeGraphMvp.live.inputDeviceId || "";
  select.replaceChildren(new Option("default input", ""));
  select.value = "";
  select.disabled = !navigator.mediaDevices?.enumerateDevices;
  if (select.disabled) {
    select.title = nodeGraphTooltipText("audio.inputDeviceUnavailable");
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputDevices = devices.filter((device) => device.kind === "audioinput");
    inputDevices.forEach((device, index) => {
      const label = device.label || `input ${index + 1}`;
      select.append(new Option(label, device.deviceId));
    });
    const hasSelectedDevice = selectedDeviceId &&
      inputDevices.some((device) => device.deviceId === selectedDeviceId);
    select.value = hasSelectedDevice ? selectedDeviceId : "";
    if (!hasSelectedDevice) {
      nodeGraphMvp.live.inputDeviceId = "";
    }
    select.title = inputDevices.length
      ? nodeGraphTooltipText("audio.inputDevice")
      : nodeGraphTooltipText("audio.inputDeviceMissing");
  } catch (error) {
    select.disabled = true;
    select.title = error.message || nodeGraphTooltipText("audio.inputDeviceUnavailable");
  }
}

async function handleNodeGraphLiveInputDeviceChange(event) {
  nodeGraphMvp.live.inputDeviceId = event.target.value || "";
  if (!nodeGraphMvp.live.inputActive || !nodeGraphMvp.live.context || !nodeGraphMvp.live.node) {
    return;
  }
  stopNodeGraphLiveInputSource();
  try {
    await startNodeGraphLiveInputSource();
  } catch (error) {
    setNodeGraphLiveBlockedError("input", error, { schedule: false });
  }
}

function nodeGraphLiveInputErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was blocked. Allow microphone access in the browser, then press Output again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No browser audio input device was found.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The selected audio input is busy or unavailable.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "The selected audio input is unavailable.";
  }
  return error?.message || "Browser audio input unavailable.";
}

function cleanupNodeGraphMockInputStream() {
  try {
    nodeGraphMvp.live.mockInputOscillator?.stop();
  } catch (_error) {
    // Mock input may already be stopped by live shutdown.
  }
  try {
    nodeGraphMvp.live.mockInputOscillator?.disconnect();
    nodeGraphMvp.live.mockInputGain?.disconnect();
    nodeGraphMvp.live.mockInputDestination?.disconnect?.();
  } catch (_error) {
    // Disconnected mock graph nodes are harmless.
  }
  nodeGraphMvp.live.mockInputDestination = null;
  nodeGraphMvp.live.mockInputGain = null;
  nodeGraphMvp.live.mockInputOscillator = null;
}

function setNodeGraphMockInputFactory(options = {}) {
  const frequency = Number.isFinite(Number(options.frequency))
    ? Math.max(20, Math.min(20000, Number(options.frequency)))
    : 220;
  const gain = Number.isFinite(Number(options.gain))
    ? Math.max(0, Math.min(1, Number(options.gain)))
    : 0.25;
  nodeGraphMvp.live.inputStreamFactory = async ({ context }) => {
    if (!context?.createMediaStreamDestination) {
      throw new Error("Mock browser input needs MediaStreamDestination support.");
    }
    cleanupNodeGraphMockInputStream();
    const oscillator = context.createOscillator();
    const inputGain = context.createGain();
    const destination = context.createMediaStreamDestination();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    inputGain.gain.value = gain;
    oscillator.connect(inputGain);
    inputGain.connect(destination);
    oscillator.start();
    nodeGraphMvp.live.mockInputDestination = destination;
    nodeGraphMvp.live.mockInputGain = inputGain;
    nodeGraphMvp.live.mockInputOscillator = oscillator;
    return destination.stream;
  };
}

function stopNodeGraphMockInput() {
  const hadMockInput = Boolean(
    nodeGraphMvp.live.mockInputOscillator ||
    nodeGraphMvp.live.mockInputGain ||
    nodeGraphMvp.live.mockInputDestination
  );
  nodeGraphMvp.live.inputStreamFactory = null;
  if (hadMockInput && nodeGraphMvp.live.inputStream) {
    stopNodeGraphLiveInputSource();
  } else {
    cleanupNodeGraphMockInputStream();
  }
}

async function startNodeGraphMockInput(options = {}) {
  setNodeGraphMockInputFactory(options);
  nodeGraphMvp.live.inputActive = true;
  ensureNodeGraphLiveInputModule();
  if (!nodeGraphMvp.live.node || !nodeGraphMvp.live.context) {
    nodeGraphMvp.live.outputEnabled = true;
    await startNodeGraphLiveAudio();
  } else {
    await syncNodeGraphLiveInputSource();
  }
  return nodeGraphLiveDebug();
}

function nodeGraphLiveInputDeviceIsUnavailable(error) {
  return [
    "ConstraintNotSatisfiedError",
    "DevicesNotFoundError",
    "NotFoundError",
    "OverconstrainedError",
  ].includes(error?.name || "");
}

async function requestNodeGraphLiveInputStream(deviceId = nodeGraphMvp.live.inputDeviceId) {
  if (typeof nodeGraphMvp.live.inputStreamFactory === "function") {
    return nodeGraphMvp.live.inputStreamFactory({
      context: nodeGraphMvp.live.context,
      deviceId,
    });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: false,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
    },
  });
}

function nodeGraphLiveOutputStartCancelled(serial) {
  return serial !== nodeGraphMvp.live.outputToggleSerial || !nodeGraphMvp.live.outputEnabled;
}

function nodeGraphLiveInputIsUnderConstruction() {
  return false;
}

function toggleNodeGraphLiveInput() {
  nodeGraphMvp.live.inputActive = !nodeGraphMvp.live.inputActive;
  const addedInputModule = nodeGraphMvp.live.inputActive
    ? ensureNodeGraphLiveInputModule()
    : false;
  if (nodeGraphMvp.live.inputActive) {
    const routeState = nodeGraphLiveInputRouteState();
    setNodeGraphLiveInputStatus(routeState.state, routeState.message);
    refreshNodeGraphLiveMicrophonePermissionState();
  } else {
    setNodeGraphLiveInputStatus("off");
    setNodeGraphLiveMicStatus("off");
  }
  if (!addedInputModule) {
    applyNodeGraphPatchToDom();
    drawNodeGraphWires();
    scheduleNodeGraphLivePlanSync();
  }
  renderNodeGraphLiveControls();
  if (nodeGraphMvp.live.context && nodeGraphMvp.live.node) {
    syncNodeGraphLiveInputSource().catch((error) => {
      nodeGraphMvp.live.inputActive = false;
      stopNodeGraphLiveInputSource();
      setNodeGraphLiveInputStatus("blocked", error.message);
      applyNodeGraphPatchToDom();
      drawNodeGraphWires();
      renderNodeGraphLiveControls();
      setNodeGraphLiveBlockedError("input", error, { schedule: false });
    });
  }
}

async function setNodeGraphLiveOutputEnabled(enabled) {
  if (enabled && nodeGraphEarProtectionIsTripped()) {
    nodeGraphMvp.live.outputEnabled = false;
    nodeGraphTripEarProtection({ source: "live" });
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return;
  }
  const outputEnabled = Boolean(enabled);
  const serial = nodeGraphMvp.live.outputToggleSerial + 1;
  nodeGraphMvp.live.outputToggleSerial = serial;
  nodeGraphMvp.live.outputEnabled = outputEnabled;
  renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
  renderNodeGraphExecutionPlanDebug();

  if (!outputEnabled) {
    if (nodeGraphMvp.live.node || nodeGraphMvp.live.context) {
      await stopNodeGraphLiveAudio();
    }
    renderNodeGraphExecutionPlanDebug();
    return;
  }

  if (nodeGraphMvp.live.node || nodeGraphMvp.live.context) {
    await stopNodeGraphLiveAudio();
  }
  if (serial !== nodeGraphMvp.live.outputToggleSerial || !nodeGraphMvp.live.outputEnabled) {
    return;
  }
  renderNodeGraphLiveControls();
  renderNodeGraphExecutionPlanDebug();
  await startNodeGraphLiveAudio(serial);
  if (serial === nodeGraphMvp.live.outputToggleSerial) {
    renderNodeGraphExecutionPlanDebug();
  }
}

function toggleNodeGraphLiveOutput() {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphTripEarProtection({ source: "live" });
    return;
  }
  setNodeGraphLiveOutputEnabled(!nodeGraphMvp.live.outputEnabled);
}

function setNodeGraphLiveSpeed(speed) {
  const value = Number(speed);
  const clamped = Number.isFinite(value) ? Math.max(0, value) : 1;
  if (nodeGraphMvp.live.speedMultiplier === clamped) {
    return;
  }
  nodeGraphMvp.live.speedMultiplier = clamped;
  sendNodeGraphLiveSpeed();
  if (typeof nodeGraphExternalNotifyLiveOutputChanged === "function") {
    nodeGraphExternalNotifyLiveOutputChanged();
  }
}

function sendNodeGraphLiveSpeed() {
  if (!nodeGraphMvp.live.node || !nodeGraphMvp.live.usesWorklet) {
    return;
  }
  try {
    nodeGraphMvp.live.node.port.postMessage({
      type: "setSpeed",
      speed: nodeGraphMvp.live.speedMultiplier,
    });
  } catch (_error) {
    // Worklet may be disconnected.
  }
}

function renderNodeGraphLiveScriptBlock(event) {
  const output = event.outputBuffer;
  const frames = output.length;
  const runtime = nodeGraphMvp.live.runtime;
  if (!runtime) {
    for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
      output.getChannelData(channel).fill(0);
    }
    return;
  }
  const sampleRate = event.playbackTime !== undefined
    ? output.sampleRate
    : nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate;
  runtime.externalInput = {
    left: event.inputBuffer?.numberOfChannels > 0
      ? event.inputBuffer.getChannelData(0)
      : null,
    right: event.inputBuffer?.numberOfChannels > 1
      ? event.inputBuffer.getChannelData(1)
      : null,
  };
  const blockStartFrame = Number.isFinite(runtime.absoluteFrameCursor)
    ? runtime.absoluteFrameCursor
    : 0;
  for (let frame = 0; frame < frames; frame += 1) {
    runtime.absoluteFrame = blockStartFrame + frame;
    const inputLeft = Number(runtime.externalInput.left?.[frame]) || 0;
    const inputRight = Number(runtime.externalInput.right?.[frame]) || inputLeft;
    nodeGraphMvp.live.inputMeterPeak = Math.max(
      nodeGraphMvp.live.inputMeterPeak,
      Math.abs(inputLeft),
      Math.abs(inputRight),
    );
    nodeGraphMvp.live.inputMeterSquareSum += (inputLeft * inputLeft + inputRight * inputRight) * 0.5;
    nodeGraphMvp.live.inputMeterSamples += 1;
    const frameOutput = evaluateNodeGraphPlanFrame(runtime, sampleRate, frame, frames);
    captureNodeGraphLiveModuleScopeFrame(runtime, sampleRate);
    if (nodeGraphOutputSampleClipped(frameOutput.left)) {
      runtime.meterClipCount += 1;
    }
    if (nodeGraphOutputSampleClipped(frameOutput.right)) {
      runtime.meterClipCount += 1;
    }
    if (
      nodeGraphOutputSampleTripsEarProtection(frameOutput.left) ||
      nodeGraphOutputSampleTripsEarProtection(frameOutput.right)
    ) {
      runtime.meterProtectionMuteCount = (runtime.meterProtectionMuteCount || 0) + 1;
      runtime.speakerProtectionPeak = Math.max(
        Number(runtime.speakerProtectionPeak) || 0,
        Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
        Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
      );
      nodeGraphTripEarProtection({
        source: "live output > 1.0",
        protectionMuteCount: runtime.meterProtectionMuteCount,
        protectionPeak: Number(runtime.speakerProtectionPeak) || 0,
      });
      for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
        output.getChannelData(channel)[frame] = 0;
      }
      continue;
    }
    const protectedFrame = runtime.earProtector?.protect(frameOutput.left, frameOutput.right) || {
      left: frameOutput.left,
      muted: false,
      right: frameOutput.right,
    };
    if (protectedFrame.muted) {
      runtime.meterProtectionMuteCount = (runtime.meterProtectionMuteCount || 0) + 1;
      nodeGraphTripEarProtection({
        source: "live",
        protectionMuteCount: runtime.meterProtectionMuteCount,
      });
    }
    const left = nodeGraphClampOutputSample(protectedFrame.left);
    const right = nodeGraphClampOutputSample(protectedFrame.right);
    const value = Math.max(Math.abs(left), Math.abs(right));
    runtime.meterPeak = Math.max(runtime.meterPeak, Math.abs(value));
    runtime.meterSquareSum += (left * left + right * right) * 0.5;
    runtime.meterSamples += 1;
    for (let channel = 0; channel < output.numberOfChannels; channel += 1) {
      output.getChannelData(channel)[frame] = channel === 0 ? left : right;
    }
  }
  runtime.absoluteFrameCursor = blockStartFrame + frames;
  runtime.externalInput = null;
  nodeGraphSetVisualControls(runtime.visualControls || { screenShake: 0 });
  if (nodeGraphMvp.live.lastEvidence) {
    nodeGraphMvp.live.lastEvidence.visualControls = {
      ...(nodeGraphMvp.live.lastEvidence.visualControls || {}),
      blue: Number(runtime.visualControls?.blue) || 0,
      chromaAlpha: Number(runtime.visualControls?.chromaAlpha) || 0,
      chromaDrift: Number(runtime.visualControls?.chromaDrift) || 0,
      chromaHue: Number(runtime.visualControls?.chromaHue) || 0,
      chromaLightness: Number(runtime.visualControls?.chromaLightness) || 0,
      chromaSaturation: Number(runtime.visualControls?.chromaSaturation) || 0,
      chromaSpread: Number(runtime.visualControls?.chromaSpread) || 0,
      green: Number(runtime.visualControls?.green) || 0,
      red: Number(runtime.visualControls?.red) || 0,
      scopePaused: Number(runtime.visualControls?.scopePaused) || 0,
      scopeTracesOff: Number(runtime.visualControls?.scopeTracesOff) || 0,
      screenDim: Number(runtime.visualControls?.screenDim) || 0,
      screenShake: Number(runtime.visualControls?.screenShake) || 0,
      visualBloom: Number(runtime.visualControls?.visualBloom) || 0,
      visualBrightness: Number(runtime.visualControls?.visualBrightness) || 0,
      visualGlow: Number(runtime.visualControls?.visualGlow) || 0,
      x: Number(runtime.visualControls?.x) || 0,
      y: Number(runtime.visualControls?.y) || 0,
    };
  }
  finishNodeGraphParameterSmoothing(runtime.smoothers);
  runtime.meterCounter += frames;
  if (runtime.meterCounter >= sampleRate / 10) {
    setNodeGraphLiveInputMeter(
      nodeGraphMvp.live.inputMeterPeak,
      Math.sqrt(nodeGraphMvp.live.inputMeterSquareSum / Math.max(1, nodeGraphMvp.live.inputMeterSamples)),
    );
    setNodeGraphLiveMeter(
      runtime.meterPeak,
      Math.sqrt(runtime.meterSquareSum / Math.max(1, runtime.meterSamples)),
      runtime.meterClipCount,
      runtime.meterProtectionMuteCount || 0,
      runtime.badNumberCount || 0,
      0,
      0,
      0,
    );
    runtime.meterCounter = 0;
    nodeGraphMvp.live.inputMeterPeak = 0;
    nodeGraphMvp.live.inputMeterSamples = 0;
    nodeGraphMvp.live.inputMeterSquareSum = 0;
    runtime.meterClipCount = 0;
    runtime.meterProtectionMuteCount = 0;
    runtime.badNumberCount = 0;
    runtime.meterPeak = 0;
    runtime.meterSamples = 0;
    runtime.meterSquareSum = 0;
  }
}

function nodeGraphStopGpuAdditiveProducer() {
  nodeGraphClearGpuAdditivePrime();
  setNodeGraphGpuAdditiveStatus();
  const state = nodeGraphMvp.live.gpuAdditive;
  if (!state) {
    return;
  }
  if (state.timer) {
    clearInterval(state.timer);
  }
  state.nodes = new Map();
  state.timer = 0;
}

function nodeGraphGpuAdditiveNodeParam(node, key, fallback) {
  const value = Number(node?.params?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function nodeGraphGpuAdditiveNodeVersion(node, sampleRate) {
  const keys = [
    "frequency",
    "harmonics",
    "level",
    "waveform",
    "modA",
    "harmonicPhaseAdd",
    "harmonicPhaseMultiply",
    "dampingFilterFrequency",
  ];
  return [
    node?.id || "",
    Math.round(Number(sampleRate) || 0),
    ...keys.map((key) => `${key}:${nodeGraphGpuAdditiveNodeParam(node, key, "")}`),
  ].join("|");
}

function nodeGraphGpuAdditiveChunkSafe(plan, node) {
  const nodeId = String(node?.id || "");
  if (!nodeId) {
    return false;
  }
  const hasSignalInput = (plan.connections || []).some((connection) =>
    connection.destinationNode === nodeId ||
    connection.toNode === nodeId ||
    connection.targetNode === nodeId
  );
  const hasModulationInput = (plan.modulations || []).some((modulation) =>
    modulation.destinationNode === nodeId ||
    modulation.toNode === nodeId ||
    modulation.targetNode === nodeId
  );
  const hasGraphInput = (plan.graphConnections || []).some((connection) =>
    connection.destinationNode === nodeId ||
    connection.toNode === nodeId ||
    connection.targetNode === nodeId
  );
  return !hasSignalInput && !hasModulationInput && !hasGraphInput;
}

function nodeGraphLivePlanGpuAdditiveNodes(plan = {}) {
  return (plan.nodes || [])
    .filter((node) => node?.type === "gpuAdditiveOsc" && nodeGraphGpuAdditiveChunkSafe(plan, node));
}

function nodeGraphGpuAdditiveParams(node) {
  return {
    dampingFilterFrequency: nodeGraphGpuAdditiveNodeParam(node, "dampingFilterFrequency", 20000),
    frequency: Math.max(0, nodeGraphGpuAdditiveNodeParam(node, "frequency", 220)),
    harmonicPhaseAdd: nodeGraphGpuAdditiveNodeParam(node, "harmonicPhaseAdd", 0),
    harmonicPhaseMultiply: nodeGraphGpuAdditiveNodeParam(node, "harmonicPhaseMultiply", 0),
    harmonics: nodeGraphGpuAdditiveNodeParam(node, "harmonics", 256),
    level: nodeGraphGpuAdditiveNodeParam(node, "level", 0.35),
    modA: nodeGraphGpuAdditiveNodeParam(node, "modA", 0.5),
    phase: nodeGraphPhaseRadians(nodeGraphGpuAdditiveNodeParam(node, "phase", 0)),
    waveform: nodeGraphGpuAdditiveNodeParam(node, "waveform", 1),
  };
}

function nodeGraphSetLivePlanRunningStatus(plan) {
  setNodeGraphLiveOutputMuted(false);
  setNodeGraphLiveStatus("running", "good");
  clearNodeGraphLiveStatusTitle();
  setNodeGraphLiveScheduleStatus(
    nodeGraphScheduleText(
      plan.order,
      [],
      plan.feedbackConnections,
      plan.feedbackModulations,
    ),
    "good",
  );
  renderNodeGraphLiveControls(true);
}

function nodeGraphClearGpuAdditivePrime() {
  const prime = nodeGraphMvp.live.gpuAdditivePrime;
  if (prime?.timer) {
    window.clearTimeout(prime.timer);
  }
  nodeGraphMvp.live.gpuAdditivePrime = null;
}

function nodeGraphFinishGpuAdditivePrime(reason = "ready") {
  const prime = nodeGraphMvp.live.gpuAdditivePrime;
  if (!prime || prime.planSerial !== nodeGraphMvp.live.planSerial) {
    return false;
  }
  nodeGraphClearGpuAdditivePrime();
  nodeGraphSetLivePlanRunningStatus(prime.plan);
  setNodeGraphLivePlanTitle(`${nodeGraphLivePlanScheduleTitle(prime.plan.order)}\nGPU Additive prime ${reason}`);
  return true;
}

function nodeGraphBeginGpuAdditivePrime(plan) {
  nodeGraphClearGpuAdditivePrime();
  if (!nodeGraphMvp.live.usesWorklet || !nodeGraphLivePlanGpuAdditiveNodes(plan).length) {
    return false;
  }
  setNodeGraphLiveOutputMuted(true);
  setNodeGraphLiveStatus("priming", "warn");
  setNodeGraphLiveScheduleStatus("gpu additive priming", "warn");
  const prime = {
    plan,
    planSerial: nodeGraphMvp.live.planSerial,
    timer: window.setTimeout(() => {
      nodeGraphFinishGpuAdditivePrime("timeout");
    }, 450),
  };
  nodeGraphMvp.live.gpuAdditivePrime = prime;
  return true;
}

const nodeGraphGpuAdditiveChunkFrames = 2048;
const nodeGraphGpuAdditiveDefaultTargetChunks = 6;
const nodeGraphGpuAdditiveMaxTargetChunks = 11;
const nodeGraphGpuAdditiveMaxInFlightChunks = 3;

function nodeGraphGpuAdditiveCanUseWebGpu(params) {
  return params && typeof nodeGraphRenderGpuAdditiveChunk === "function";
}

async function nodeGraphRenderGpuAdditiveProducerChunk(params, chunkFrames, sampleRate, cacheKey = "") {
  if (
    nodeGraphGpuAdditiveCanUseWebGpu(params) &&
    typeof nodeGraphRenderGpuAdditiveChunk === "function"
  ) {
    return nodeGraphRenderGpuAdditiveChunk(params, {
      cacheKey,
      frameCount: chunkFrames,
      sampleRate,
    });
  }
  return {
    backend: "cpu-chunk",
    diagnostics: {
      reason: "WebGPU additive renderer unavailable",
    },
    samples: nodeGraphGpuAdditiveCpuRender(params, chunkFrames, sampleRate),
  };
}

function nodeGraphStartGpuAdditiveProducer(plan, audio) {
  nodeGraphStopGpuAdditiveProducer();
  if (!nodeGraphMvp.live.usesWorklet || !nodeGraphMvp.live.node?.port) {
    return;
  }
  const sampleRate = Math.max(1, Number(audio?.clampedEngineSampleRate) || nodeGraphMvp.sampleRate || 44100);
  const nodes = (plan.nodes || [])
    .filter((node) => node?.type === "gpuAdditiveOsc" && nodeGraphGpuAdditiveChunkSafe(plan, node));
  if (!nodes.length || typeof nodeGraphGpuAdditiveCpuRender !== "function") {
    return;
  }
  const producer = nodeGraphMvp.live.gpuAdditive;
  const chunkFrames = nodeGraphGpuAdditiveChunkFrames;
  const defaultTargetChunks = nodeGraphGpuAdditiveDefaultTargetChunks;
  const maxTargetChunks = nodeGraphGpuAdditiveMaxTargetChunks;
  producer.nodes = new Map(nodes.map((node) => [node.id, {
    completedChunks: new Map(),
    generation: 0,
    inFlightSlots: new Set(),
    nextChunkSequence: 0,
    pendingChunks: 0,
    phase: nodeGraphPhaseRadians(nodeGraphGpuAdditiveNodeParam(node, "phase", 0)),
    queueChunks: 0,
    sendChunkSequence: 0,
    targetChunks: defaultTargetChunks,
    version: nodeGraphGpuAdditiveNodeVersion(node, sampleRate),
  }]));

  const postOrderedGpuAdditiveChunks = (node, state, version) => {
    if (!nodeGraphMvp.live.node?.port || nodeGraphMvp.live.sessionId <= 0) {
      return;
    }
    while (state.completedChunks.has(state.sendChunkSequence)) {
      const chunk = state.completedChunks.get(state.sendChunkSequence);
      state.completedChunks.delete(state.sendChunkSequence);
      state.sendChunkSequence += 1;
      state.backend = chunk.backend;
      state.diagnostics = chunk.diagnostics;
      if (!(chunk.samples instanceof Float32Array) || chunk.samples.length <= 0) {
        continue;
      }
      state.queueChunks += 1;
      nodeGraphMvp.live.node.port.postMessage({
        backend: chunk.backend,
        nodeId: node.id,
        planSerial: nodeGraphMvp.live.planSerial,
        samples: chunk.samples,
        sequence: chunk.sequence,
        sessionId: nodeGraphMvp.live.sessionId,
        type: "gpuAdditiveChunk",
        version,
      }, [chunk.samples.buffer]);
    }
  };

  const reserveGpuAdditiveRenderSlot = (state) => {
    for (let slot = 0; slot < nodeGraphGpuAdditiveMaxInFlightChunks; slot += 1) {
      if (!state.inFlightSlots.has(slot)) {
        state.inFlightSlots.add(slot);
        state.pendingChunks += 1;
        return slot;
      }
    }
    return -1;
  };

  const releaseGpuAdditiveRenderSlot = (state, slot) => {
    if (!state) {
      return;
    }
    state.inFlightSlots.delete(slot);
    state.pendingChunks = Math.max(0, (Number(state.pendingChunks) || 0) - 1);
  };

  const produce = () => {
    if (!nodeGraphMvp.live.node?.port || nodeGraphMvp.live.sessionId <= 0) {
      nodeGraphStopGpuAdditiveProducer();
      return;
    }
    for (const node of nodes) {
      const state = producer.nodes.get(node.id);
      if (!state) {
        continue;
      }
      const version = nodeGraphGpuAdditiveNodeVersion(node, sampleRate);
      if (state.version !== version) {
        state.version = version;
        state.completedChunks.clear();
        state.generation = (Number(state.generation) || 0) + 1;
        state.inFlightSlots.clear();
        state.nextChunkSequence = 0;
        state.pendingChunks = 0;
        state.phase = nodeGraphPhaseRadians(nodeGraphGpuAdditiveNodeParam(node, "phase", 0));
        state.queueChunks = 0;
        state.sendChunkSequence = 0;
        state.targetChunks = defaultTargetChunks;
      }
      const targetChunks = Math.max(1, Math.min(maxTargetChunks, Number(state.targetChunks) || defaultTargetChunks));
      while (
        state.queueChunks + state.pendingChunks + state.completedChunks.size < targetChunks &&
        state.pendingChunks < nodeGraphGpuAdditiveMaxInFlightChunks
      ) {
        const renderSlot = reserveGpuAdditiveRenderSlot(state);
        if (renderSlot < 0) {
          break;
        }
        const renderGeneration = Number(state.generation) || 0;
        const renderSequence = state.nextChunkSequence;
        state.nextChunkSequence += 1;
        const renderPhase = state.phase;
        state.phase = wrapNodeSliderValue(
          state.phase + Math.PI * 2 * Math.max(0, nodeGraphGpuAdditiveNodeParam(node, "frequency", 220)) * (chunkFrames / sampleRate),
          0,
          Math.PI * 2,
        );
        const renderStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const params = {
          ...nodeGraphGpuAdditiveParams(node),
          phase: renderPhase,
        };
        nodeGraphRenderGpuAdditiveProducerChunk(params, chunkFrames, sampleRate, `${node.id}:${renderGeneration}:${renderSlot}`)
        .then((result) => {
          if (
            !nodeGraphMvp.live.node?.port ||
            nodeGraphMvp.live.sessionId <= 0 ||
            producer.nodes.get(node.id) !== state ||
            state.version !== version
          ) {
            return;
          }
          const samples = result?.samples instanceof Float32Array
            ? result.samples
            : new Float32Array(result?.samples || []);
          if (samples.length <= 0) {
            state.backend = "empty";
            state.completedChunks.set(renderSequence, {
              backend: state.backend,
              diagnostics: { empty: true, sequence: renderSequence },
              samples,
              sequence: renderSequence,
            });
            postOrderedGpuAdditiveChunks(node, state, version);
            return;
          }
          state.backend = result?.backend || "unknown";
          const renderEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          const diagnostics = {
            ...(result?.diagnostics || {}),
            generation: renderGeneration,
            renderMs: Math.max(0, renderEndedAt - renderStartedAt),
            pendingChunks: state.pendingChunks,
            renderSlot,
            sequence: renderSequence,
            targetChunks,
          };
          state.completedChunks.set(renderSequence, {
            backend: state.backend,
            diagnostics,
            samples,
            sequence: renderSequence,
          });
          postOrderedGpuAdditiveChunks(node, state, version);
        })
        .catch((error) => {
          const renderEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          state.backend = "cpu-chunk-error";
          const diagnostics = {
            error: error?.message || String(error),
            generation: renderGeneration,
            renderMs: Math.max(0, renderEndedAt - renderStartedAt),
            pendingChunks: state.pendingChunks,
            renderSlot,
            sequence: renderSequence,
            targetChunks,
          };
          const samples = nodeGraphGpuAdditiveCpuRender(params, chunkFrames, sampleRate);
          if (
            !nodeGraphMvp.live.node?.port ||
            nodeGraphMvp.live.sessionId <= 0 ||
            producer.nodes.get(node.id) !== state ||
            state.version !== version
          ) {
            return;
          }
          state.completedChunks.set(renderSequence, {
            backend: "cpu-chunk-error-fallback",
            diagnostics,
            samples,
            sequence: renderSequence,
          });
          postOrderedGpuAdditiveChunks(node, state, version);
        })
        .finally(() => {
          releaseGpuAdditiveRenderSlot(state, renderSlot);
          if (
            nodeGraphMvp.live.node?.port &&
            nodeGraphMvp.live.sessionId > 0 &&
            producer.nodes.get(node.id) === state &&
            state.queueChunks < Math.max(1, Math.min(maxTargetChunks, Number(state.targetChunks) || defaultTargetChunks))
          ) {
            window.setTimeout(produce, 0);
          }
        });
      }
    }
  };

  produce();
  producer.timer = setInterval(produce, 8);
}

function queueNodeGraphLivePatchCommand(command, nodeId = "") {
  const direction = command === "nextPatch" ? 1 : command === "previousPatch" ? -1 : 0;
  if (!direction) {
    return;
  }
  const key = `${command}:${nodeId || ""}`;
  if (!nodeGraphMvp.live.patchCommandQueue) {
    nodeGraphMvp.live.patchCommandQueue = new Set();
  }
  if (nodeGraphMvp.live.patchCommandQueue.has(key)) {
    return;
  }
  nodeGraphMvp.live.patchCommandQueue.add(key);
  window.setTimeout(async () => {
    nodeGraphMvp.live.patchCommandQueue?.delete(key);
    await loadAdjacentNodeGraphSavedPatch(direction);
  }, 0);
}

function handleNodeGraphLiveWorkletMessage(event) {
  const message = event.data || {};
  if (message.type === "meter") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    setNodeGraphLiveInputMeter(
      Number(message.inputPeak) || 0,
      Number(message.inputRms) || 0,
    );
    setNodeGraphLiveMeter(
      Number(message.peak) || 0,
      Number(message.rms) || 0,
      Number(message.clipCount) || 0,
      Number(message.protectionMuteCount) || 0,
      Number(message.badNumberCount) || 0,
      Number(message.overrunCount) || 0,
      Number(message.maxBlockProcessMs) || 0,
      Number(message.maxBlockBudgetRatio) || 0,
    );
    if (typeof syncNodeGraphAudioPlayerRuntimeStatus === "function") {
      syncNodeGraphAudioPlayerRuntimeStatus({
        nodeId: message.audioPlayerNodeId || "",
        nodeIds: message.audioPlayerNodeIds || [],
        peak: Number(message.audioPlayerPeak) || 0,
        phase: Number(message.audioPlayerPhase) || 0,
        reason: message.audioPlayerReason || "",
        samples: Number(message.audioPlayerSamples) || 0,
      });
    }
    if (Number(message.badNumberCount) > 0) {
      nodeGraphRecordBadValueEvent({
        count: Number(message.badNumberCount) || 1,
        engine: "worklet",
        force: Boolean(message.lastBadValueNodeId),
        nodeId: message.lastBadValueNodeId || "",
        reason: message.lastBadValueReason || "bad",
        source: message.lastBadValueSource || "worklet meter",
      });
      if (message.lastBadValueNodeId && typeof nodeGraphTrackNodeSilenceWindow === "function") {
        nodeGraphTrackNodeSilenceWindow(message.lastBadValueNodeId, true, message.lastBadValueReason || "bad");
      }
    } else if (typeof nodeGraphClearAllTrackedModuleSilence === "function") {
      nodeGraphClearAllTrackedModuleSilence();
    }
    if (Number(message.protectionMuteCount) > 0) {
      nodeGraphTripEarProtection({
        nodeId: message.protectionNodeId || "",
        protectionPeak: Number(message.protectionPeak) || 0,
        source: "worklet",
        protectionMuteCount: Number(message.protectionMuteCount) || 0,
      });
    }
  } else if (message.type === "nativeModuleStatus") {
    setNodeGraphLiveEvidence("native-module", message);
    if (message.status && message.status !== "ready") {
      setNodeGraphLivePlanStatus(
        `${message.name || "native module"} ${message.status}`,
        "warn",
      );
      if (typeof nodeGraphRecordNativeModuleFault === "function") {
        nodeGraphRecordNativeModuleFault(message);
      }
    }
  } else if (message.type === "patchCommand") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    queueNodeGraphLivePatchCommand(message.command, message.nodeId || "");
  } else if (message.type === "planApplied") {
    if (
      message.sessionId !== nodeGraphMvp.live.sessionId ||
      message.planSerial !== nodeGraphMvp.live.planSerial ||
      !nodeGraphMvp.live.node
    ) {
      return;
    }
    setNodeGraphLiveEvidence("plan-applied", message);
    setNodeGraphLivePlanStatus(nodeGraphLivePlanAppliedStatusText(message), "good");
    setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(message.order));
  } else if (message.type === "scope") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    pushNodeGraphLiveModuleScopeSnapshot(message.values || [], {
      patchFingerprint: message.patchFingerprint || nodeGraphPatchFingerprint(),
      sampleRate: message.sampleRate || nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    });
    if (Array.isArray(message.dataPorts) && message.dataPorts.length) {
      for (const [nodeId, port, value] of message.dataPorts) {
        writeNodeGraphDataOutput(String(nodeId), port, value);
      }
    }
  } else if (message.type === "visualControls") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    nodeGraphSetVisualControls({
      blue: Number(message.blue) || 0,
      chromaAlpha: Number(message.chromaAlpha) || 0,
      chromaDrift: Number(message.chromaDrift) || 0,
      chromaHue: Number(message.chromaHue) || 0,
      chromaLightness: Number(message.chromaLightness) || 0,
      chromaSaturation: Number(message.chromaSaturation) || 0,
      chromaSpread: Number(message.chromaSpread) || 0,
      green: Number(message.green) || 0,
      red: Number(message.red) || 0,
      scopePaused: Number(message.scopePaused) || 0,
      scopeTracesOff: Number(message.scopeTracesOff) || 0,
      screenDim: Number(message.screenDim) || 0,
      screenShake: Number(message.screenShake) || 0,
      visualBloom: Number(message.visualBloom) || 0,
      visualBrightness: Number(message.visualBrightness) || 0,
      visualGlow: Number(message.visualGlow) || 0,
      x: Number(message.x) || 0,
      y: Number(message.y) || 0,
    });
    if (nodeGraphMvp.live.lastEvidence) {
      nodeGraphMvp.live.lastEvidence.visualControls = {
        ...(nodeGraphMvp.live.lastEvidence.visualControls || {}),
        blue: Number(message.blue) || 0,
        chromaAlpha: Number(message.chromaAlpha) || 0,
        chromaDrift: Number(message.chromaDrift) || 0,
        chromaHue: Number(message.chromaHue) || 0,
        chromaLightness: Number(message.chromaLightness) || 0,
        chromaSaturation: Number(message.chromaSaturation) || 0,
        chromaSpread: Number(message.chromaSpread) || 0,
        green: Number(message.green) || 0,
        red: Number(message.red) || 0,
        scopePaused: Number(message.scopePaused) || 0,
        scopeTracesOff: Number(message.scopeTracesOff) || 0,
        screenDim: Number(message.screenDim) || 0,
        screenShake: Number(message.screenShake) || 0,
        visualBloom: Number(message.visualBloom) || 0,
        visualBrightness: Number(message.visualBrightness) || 0,
        visualGlow: Number(message.visualGlow) || 0,
        x: Number(message.x) || 0,
        y: Number(message.y) || 0,
      };
    }
  } else if (message.type === "gpuAdditiveStatus") {
    if (message.sessionId !== nodeGraphMvp.live.sessionId || !nodeGraphMvp.live.node) {
      return;
    }
    const producer = nodeGraphMvp.live.gpuAdditive;
    const enhancedQueues = (message.queues || []).map((queue) => {
      const state = producer?.nodes?.get?.(queue.nodeId);
      if (state) {
        state.queueChunks = Math.max(0, Number(queue.chunks) || 0);
        const underruns = Math.max(0, Number(message.underruns) || 0);
        const droppedChunks = Math.max(0, Number(queue.droppedChunks) || 0);
        if (underruns > 0 || droppedChunks > 0) {
          state.targetChunks = Math.min(
            nodeGraphGpuAdditiveMaxTargetChunks,
            (Number(state.targetChunks) || nodeGraphGpuAdditiveDefaultTargetChunks) + 1,
          );
        } else if (
          state.queueChunks > nodeGraphGpuAdditiveDefaultTargetChunks + 2 &&
          Number(queue.samples) > nodeGraphGpuAdditiveChunkFrames * (nodeGraphGpuAdditiveDefaultTargetChunks + 1)
        ) {
          state.targetChunks = Math.max(
            nodeGraphGpuAdditiveDefaultTargetChunks,
            (Number(state.targetChunks) || nodeGraphGpuAdditiveDefaultTargetChunks) - 1,
          );
        }
      }
      return {
        ...queue,
        diagnostics: {
          ...(state?.diagnostics || {}),
          droppedChunks: Math.max(0, Number(queue.droppedChunks) || 0),
          expectedSequence: Math.max(0, Number(queue.expectedSequence) || 0),
          heldGain: Number.isFinite(Number(queue.heldGain)) ? Number(queue.heldGain) : 1,
          heldSamples: Math.max(0, Number(queue.heldSamples) || 0),
          resetCount: Math.max(0, Number(queue.resetCount) || 0),
          targetChunks: Math.max(
            1,
            Math.min(
              nodeGraphGpuAdditiveMaxTargetChunks,
              Number(state?.targetChunks) || nodeGraphGpuAdditiveDefaultTargetChunks,
            ),
          ),
        },
      };
    });
    if (nodeGraphMvp.live.lastEvidence) {
      nodeGraphMvp.live.lastEvidence.gpuAdditive = {
        queues: enhancedQueues,
        underruns: Number(message.underruns) || 0,
      };
    }
    setNodeGraphGpuAdditiveStatus({
      queues: enhancedQueues,
      underruns: Number(message.underruns) || 0,
    });
    if (enhancedQueues.some((queue) => Number(queue.samples) > 0 || Number(queue.chunks) > 0)) {
      nodeGraphFinishGpuAdditivePrime("ready");
    }
  } else if (message.type === "paramsApplied") {
    if (
      message.sessionId !== nodeGraphMvp.live.sessionId ||
      message.planSerial !== nodeGraphMvp.live.planSerial ||
      !nodeGraphMvp.live.node
    ) {
      return;
    }
    setNodeGraphLiveEvidence("params-applied", message);
    setNodeGraphLivePlanStatus(nodeGraphLiveParametersAppliedStatusText(message), "good");
    setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(message.order));
  }
}

function nodeGraphLiveClapNodes(plan = {}) {
  return (plan.nodes || []).filter((node) => node?.type === "clapPlugin");
}

function nodeGraphLiveClapNodeTitle(node) {
  return nodeGraphPatchNodeTitle(nodeGraphPatchNode(node?.id) || node);
}

function assertNodeGraphLivePlanSupportsClap(plan = {}) {
  const clapNodes = nodeGraphLiveClapNodes(plan);
  if (!clapNodes.length) {
    return;
  }
  const names = clapNodes.map((node) => nodeGraphLiveClapNodeTitle(node)).join(", ");
  const error = new Error(`Live Audio does not route CLAP Plugin nodes yet. Use Render Sample for CLAP processing: ${names}`);
  error.issues = clapNodes.map((node) => `Live Audio CLAP routing unavailable: ${nodeGraphLiveClapNodeTitle(node)}`);
  throw error;
}

function nodeGraphLivePlanErrorIssues(error) {
  return Array.isArray(error?.issues) && error.issues.length
    ? error.issues.map((issue) => String(issue))
    : [String(error?.message || error || "unknown live plan failure")];
}

function nodeGraphLivePlanIssueRemovesOutputRoute(issue) {
  return issue === "output node missing" || issue === "missing Output speaker input";
}

function nodeGraphCurrentPatchHasSpeakerOutputRoute() {
  try {
    const plan = compileNodeGraphExecutionPlan(nodeGraphMvp.patch);
    const issues = Array.isArray(plan?.issues) ? plan.issues.map((issue) => String(issue)) : [];
    return Boolean(plan?.speakerOutputActive) && !issues.some(nodeGraphLivePlanIssueRemovesOutputRoute);
  } catch (_error) {
    return false;
  }
}

function nodeGraphShouldPreservePreviousLivePlanAfterError(error) {
  const issues = nodeGraphLivePlanErrorIssues(error);
  if (issues.some(nodeGraphLivePlanIssueRemovesOutputRoute)) {
    return false;
  }
  return nodeGraphCurrentPatchHasSpeakerOutputRoute();
}

function nodeGraphLivePlanShapeSignature(plan = {}) {
  return JSON.stringify({
    nodes: (Array.isArray(plan.nodes) ? plan.nodes : []).map((node) => [node.id, node.type]),
    order: Array.isArray(plan.order) ? plan.order : [],
    outputNode: plan.outputNode || "output",
    samples: (Array.isArray(plan.samples) ? plan.samples : []).map((sample) => sample?.id || ""),
    scopeCaptureNodeIds: Array.isArray(plan.scopeCaptureNodeIds) ? plan.scopeCaptureNodeIds : [],
    visualSinks: (Array.isArray(plan.visualSinks) ? plan.visualSinks : []).map((sink) => [
      sink.nodeId,
      sink.displayType,
      (Array.isArray(sink.bufferedInputs) ? sink.bufferedInputs : []).join(","),
    ]),
  });
}

function nodeGraphLiveConnectionUpdatePayload(plan = {}, audio = {}) {
  const pitchReference = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  return {
    connections: Array.isArray(plan.connections) ? plan.connections : [],
    engineSampleRate: audio.clampedEngineSampleRate,
    graphConnections: Array.isArray(plan.graphConnections) ? plan.graphConnections : [],
    modulations: Array.isArray(plan.modulations) ? plan.modulations : [],
    outputNode: plan.outputNode || "output",
    oversamplingRatio: audio.oversamplingRatio,
    patchFingerprint: plan.patchFingerprint,
    pitchReferenceHz: pitchReference.pitchReferenceHz,
    pitchReferenceMidiNote: pitchReference.pitchReferenceMidiNote,
    planSerial: nodeGraphMvp.live.planSerial,
    sampleRate: nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    scopeCaptureNodeIds: Array.isArray(plan.scopeCaptureNodeIds) ? plan.scopeCaptureNodeIds : [],
    sessionId: nodeGraphMvp.live.sessionId,
    type: "setConnections",
    visualSinks: Array.isArray(plan.visualSinks) ? plan.visualSinks : [],
  };
}

async function sendNodeGraphLivePlan() {
  if (!nodeGraphMvp.live.node && !nodeGraphMvp.live.context) {
    return;
  }
  const hadLivePlan = Boolean(
    nodeGraphMvp.live.planEvidence ||
    nodeGraphMvp.live.runtime ||
    nodeGraphMvp.live.planSerial > 0 ||
    nodeGraphMvp.live.activeNodeIds?.size,
  );

  try {
    const plan = nodeGraphBuildLivePlan();
    if (typeof nodeGraphEnsureLiveSamplesForPlan === "function") {
      await nodeGraphEnsureLiveSamplesForPlan(plan, nodeGraphMvp.patch);
    }
    assertNodeGraphLivePlanSupportsClap(plan);
    const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
    const planShapeSignature = nodeGraphLivePlanShapeSignature(plan);
    const canSendConnectionUpdate = Boolean(
      hadLivePlan &&
      nodeGraphMvp.live.planShapeSignature &&
      nodeGraphMvp.live.planShapeSignature === planShapeSignature,
    );
    nodeGraphMvp.live.activeNodeIds = new Set(plan.order);
    beginNodeGraphLiveModuleScopeCapture(plan, {
      sampleRate: nodeGraphMvp.live.usesWorklet
        ? audio.clampedEngineSampleRate
        : nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    });
    nodeGraphMvp.live.planSerial += 1;
    nodeGraphMvp.live.planEvidence = nodeGraphLivePlanEvidenceDetails(plan, {
      engineSampleRate: audio.clampedEngineSampleRate,
      oversamplingRatio: audio.oversamplingRatio,
      planSerial: nodeGraphMvp.live.planSerial,
      sampleRate: nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
    });
    if (nodeGraphMvp.live.usesWorklet) {
      setNodeGraphLiveEvidence("plan-sent", nodeGraphMvp.live.planEvidence);
      setNodeGraphLivePlanStatus(nodeGraphLivePlanSentStatusText(), "warn");
      setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(plan.order));
      if (canSendConnectionUpdate) {
        nodeGraphMvp.live.node?.port?.postMessage(nodeGraphLiveConnectionUpdatePayload(plan, audio));
      } else {
        {
          const pitchReference = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
          nodeGraphMvp.live.node?.port?.postMessage({
            engineSampleRate: audio.clampedEngineSampleRate,
            oversamplingRatio: audio.oversamplingRatio,
            plan,
            patchFingerprint: plan.patchFingerprint,
            pitchReferenceHz: pitchReference.pitchReferenceHz,
            pitchReferenceMidiNote: pitchReference.pitchReferenceMidiNote,
            planSerial: nodeGraphMvp.live.planSerial,
            sampleRate: nodeGraphMvp.live.context?.sampleRate || nodeGraphMvp.sampleRate,
            sessionId: nodeGraphMvp.live.sessionId,
            type: "setPlan",
          });
        }
        nodeGraphStartGpuAdditiveProducer(plan, audio);
      }
    } else if (nodeGraphMvp.live.runtime) {
      if (canSendConnectionUpdate && typeof updateNodeGraphLiveRuntimeConnections === "function") {
        updateNodeGraphLiveRuntimeConnections(nodeGraphMvp.live.runtime, plan);
      } else {
        updateNodeGraphLiveRuntimePlan(nodeGraphMvp.live.runtime, plan);
      }
      setNodeGraphLiveEvidence("plan-applied", nodeGraphMvp.live.planEvidence);
      setNodeGraphLivePlanStatus(nodeGraphLivePlanStatusText(plan), "good");
      setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(plan.order));
    } else {
      nodeGraphMvp.live.runtime = createNodeGraphLiveRuntime(plan);
      setNodeGraphLiveEvidence("plan-applied", nodeGraphMvp.live.planEvidence);
      setNodeGraphLivePlanStatus(nodeGraphLivePlanStatusText(plan), "good");
      setNodeGraphLivePlanTitle(nodeGraphLivePlanScheduleTitle(plan.order));
    }
    if (!nodeGraphBeginGpuAdditivePrime(plan)) {
      nodeGraphSetLivePlanRunningStatus(plan);
    }
    nodeGraphMvp.live.planShapeSignature = planShapeSignature;
  } catch (error) {
    const issues = nodeGraphLivePlanErrorIssues(error);
    nodeGraphClearGpuAdditivePrime();
    error.issues = issues;
    const canPreservePlan = hadLivePlan && nodeGraphShouldPreservePreviousLivePlanAfterError(error);
    if (!canPreservePlan) {
      setNodeGraphLiveOutputMuted(true);
      nodeGraphMvp.live.runtime = null;
      nodeGraphMvp.live.node?.port?.postMessage({ type: "stop", sessionId: nodeGraphMvp.live.sessionId, planSerial: nodeGraphMvp.live.planSerial });
    }
    setNodeGraphLiveBlockedError("plan", error, { preservePreviousPlan: canPreservePlan });
  }
}

function sendNodeGraphLiveParameterUpdate() {
  if (!nodeGraphMvp.live.node && !nodeGraphMvp.live.context) {
    return;
  }

  try {
    const nodes = nodeGraphBuildLiveParameterNodes(nodeGraphMvp.live.activeNodeIds);
    const patchFingerprint = nodeGraphPatchFingerprint();
    const now = performance.now();
    const previous = Number(nodeGraphMvp.live.lastParameterUpdateTime) || 0;
    const measuredSeconds = previous > 0 ? (now - previous) / 1000 : nodeGraphMvp.live.autoSmoothingSeconds;
    nodeGraphMvp.live.lastParameterUpdateTime = now;
    if (!nodeGraphMvp.live.autoSmoothingManual) {
      nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(
        (Number(nodeGraphMvp.live.autoSmoothingSeconds) || nodeGraphAutoSmoothingDefaultSeconds) * 0.82 +
        clampNodeGraphAutoSmoothingSeconds(measuredSeconds) * 0.18,
      );
    } else {
      nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(nodeGraphMvp.live.autoSmoothingSeconds);
    }
    const autoSmoothingSeconds = nodeGraphMvp.live.autoSmoothingSeconds;
    syncNodeGraphGlobalSmoothingControl();
    updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint);
    nodeGraphMvp.live.planSerial += 1;
    if (nodeGraphMvp.live.usesWorklet) {
      setNodeGraphLiveEvidence("params-sent", {
        autoSmoothingSeconds,
        nodeCount: nodes.length,
        parameterCount: nodeGraphLiveParameterCount(nodes),
        patchFingerprint,
        planSerial: nodeGraphMvp.live.planSerial,
      });
      setNodeGraphLivePlanStatus(nodeGraphLiveParametersSentStatusText(nodes), "warn");
      nodeGraphMvp.live.node?.port?.postMessage({
        nodes,
        autoSmoothingSeconds,
        patchFingerprint,
        planSerial: nodeGraphMvp.live.planSerial,
        sessionId: nodeGraphMvp.live.sessionId,
        type: "setParams",
      });
      const plan = nodeGraphBuildLivePlan();
      const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
      nodeGraphStartGpuAdditiveProducer(plan, audio);
    } else if (nodeGraphMvp.live.runtime) {
      nodeGraphMvp.live.runtime.autoSmoothingSeconds = autoSmoothingSeconds;
      updateNodeGraphLiveRuntimeParameters(nodeGraphMvp.live.runtime, nodes);
      setNodeGraphLiveEvidence("params-applied", {
        autoSmoothingSeconds,
        nodeCount: nodes.length,
        parameterCount: nodeGraphLiveParameterCount(nodes),
        patchFingerprint,
        planSerial: nodeGraphMvp.live.planSerial,
      });
      setNodeGraphLivePlanStatus(
        nodeGraphLiveParametersAppliedStatusText({
          nodeCount: nodes.length,
          parameterCount: nodeGraphLiveParameterCount(nodes),
          patchFingerprint,
          planSerial: nodeGraphMvp.live.planSerial,
        }),
        "good",
      );
    }
    setNodeGraphLiveStatus("running", "good");
    clearNodeGraphLiveStatusTitle();
  } catch (error) {
    setNodeGraphLiveBlockedError("params", error, { schedule: false });
  }
}

function sendNodeGraphLiveMidiKeyboardSignal(signal = nodeGraphMvp.midiKeyboardSignal) {
  const payload = signal && typeof signal === "object" ? { ...signal } : null;
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.midiKeyboardSignal = payload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      signal: payload,
      type: "setMidiKeyboardSignal",
    });
  }
}

function sendNodeGraphLiveMacroControls(values = nodeGraphMvp.macroControls) {
  const payload = Array.from({ length: 8 }, (_, index) => (
    Math.max(0, Math.min(1, Number(values?.[index]) || 0))
  ));
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.macroControls = payload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      values: payload,
      type: "setMacroControls",
    });
  }
}

function sendNodeGraphLiveMidiKeyboardHeldKeysBitmask(
  low = nodeGraphMvp.midiKeyboardHeldKeysLowBitmask,
  high = nodeGraphMvp.midiKeyboardHeldKeysHighBitmask,
) {
  const safeLow = Math.floor(Number(low));
  const safeHigh = Math.floor(Number(high));
  const lowPayload = Number.isFinite(safeLow) && safeLow >= 0 ? safeLow : 0;
  const highPayload = Number.isFinite(safeHigh) && safeHigh >= 0 ? safeHigh : 0;
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.midiKeyboardHeldKeysLowBitmask = lowPayload;
    nodeGraphMvp.live.runtime.midiKeyboardHeldKeysHighBitmask = highPayload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      high: highPayload,
      low: lowPayload,
      type: "setMidiKeyboardHeldKeysBitmask",
    });
  }
}

function nodeGraphPitchModWheelPayload() {
  return {
    mod: Math.max(0, Math.min(1, Number(nodeGraphMvp.modWheelSignal) || 0)),
    pitch: Math.max(-1, Math.min(1, Number(nodeGraphMvp.pitchWheelSignal) || 0)),
  };
}

function sendNodeGraphLivePitchModWheelSignal(signal = nodeGraphPitchModWheelPayload()) {
  const source = signal && typeof signal === "object" ? signal : {};
  const pitch = Number(source.pitch);
  const payload = {
    mod: Math.max(0, Math.min(1, Number(source.mod) || 0)),
    pitch: Math.max(-1, Math.min(1, Number.isFinite(pitch) ? pitch : 0)),
  };
  if (nodeGraphMvp.live.runtime) {
    nodeGraphMvp.live.runtime.pitchModWheelSignal = payload;
  }
  if (nodeGraphMvp.live.usesWorklet && nodeGraphMvp.live.node?.port) {
    nodeGraphMvp.live.node.port.postMessage({
      signal: payload,
      type: "setPitchModWheelSignal",
    });
  }
}

function nodeGraphGlobalSmoothingSamples() {
  return nodeGraphSmoothingSamplesFromSeconds(
    nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
  );
}

function nodeGraphGlobalSmoothingSeconds() {
  return clampNodeGraphAutoSmoothingSeconds(
    nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
  );
}

function formatNodeGraphGlobalSmoothingSeconds(seconds) {
  const value = clampNodeGraphAutoSmoothingSeconds(seconds);
  if (typeof limit_decimals === "function") {
    return limit_decimals(String(value), 5, 3, 4, false);
  }
  return value.toFixed(4).replace(/0$/, "");
}

function syncNodeGraphGlobalSmoothingControl(options = {}) {
  const input = document.getElementById("nodeSceneGlobalSmoothingSeconds");
  if (!input) {
    return;
  }
  if (!options.force && document.activeElement === input) {
    return;
  }
  input.value = formatNodeGraphGlobalSmoothingSeconds(nodeGraphGlobalSmoothingSeconds());
}

function setNodeGraphGlobalSmoothingSamples(samples, options = {}) {
  setNodeGraphGlobalSmoothingSeconds(nodeGraphSmoothingSecondsFromSamples(samples), options);
}

function setNodeGraphGlobalSmoothingSeconds(seconds, options = {}) {
  const normalized = clampNodeGraphAutoSmoothingSeconds(seconds);
  nodeGraphMvp.live.autoSmoothingSeconds = normalized;
  nodeGraphMvp.live.autoSmoothingManual = options.manual !== false;
  syncNodeGraphGlobalSmoothingControl({ force: true });
  scheduleNodeGraphLiveParameterSync();
  if (typeof saveNodeGraphWorkspaceViewToUserSettings === "function") {
    saveNodeGraphWorkspaceViewToUserSettings({ status: false });
  }
}

function nodeGraphGlobalSmoothingDragStep(event) {
  const multiplier = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  return 0.01 * multiplier;
}

function handleNodeGraphGlobalSmoothingSecondsChange() {
  const input = document.getElementById("nodeSceneGlobalSmoothingSeconds");
  if (!input) {
    return;
  }
  setNodeGraphGlobalSmoothingSeconds(input.value);
  input.readOnly = true;
}

function handleNodeGraphGlobalSmoothingSecondsKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  handleNodeGraphGlobalSmoothingSecondsChange();
  event.currentTarget?.blur?.();
}

function beginNodeGraphGlobalSmoothingSecondsEdit(event) {
  const input = document.getElementById("nodeSceneGlobalSmoothingSeconds");
  if (!input) {
    return;
  }
  input.readOnly = false;
  input.focus();
  input.select();
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphGlobalSmoothingSecondsDrag(event) {
  const input = document.getElementById("nodeSceneGlobalSmoothingSeconds");
  if (!input || event.button > 0 || event.detail > 1) {
    return;
  }
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const resetToDefaultOnClick = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
  nodeGraphMvp.globalSmoothingSecondsDragging = {
    input,
    moved: false,
    pointerId: event.pointerId ?? null,
    resetToDefaultOnClick,
    startValue: nodeGraphGlobalSmoothingSeconds(),
    startX: event.clientX,
    startY: event.clientY,
    step: nodeGraphGlobalSmoothingDragStep(event),
  };
  input.readOnly = true;
  input.classList.add("value-dragging");
  input.closest(".scene-context-global-smoothing-control")?.classList.add("value-dragging");
  if (event.pointerId !== undefined) {
    input.setPointerCapture?.(event.pointerId);
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphGlobalSmoothingSeconds(event) {
  const drag = nodeGraphMvp.globalSmoothingSecondsDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  const horizontalDelta = event.clientX - drag.startX;
  const verticalDelta = drag.startY - event.clientY;
  if (Math.abs(horizontalDelta) > 1 || Math.abs(verticalDelta) > 1) {
    drag.moved = true;
  }
  if (drag.resetToDefaultOnClick && !drag.moved) {
    event.preventDefault();
    return;
  }
  setNodeGraphGlobalSmoothingSeconds(drag.startValue + (horizontalDelta + verticalDelta) * drag.step);
  event.preventDefault();
}

function endNodeGraphGlobalSmoothingSecondsDrag(event) {
  const drag = nodeGraphMvp.globalSmoothingSecondsDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  if (drag.resetToDefaultOnClick && !drag.moved) {
    setNodeGraphGlobalSmoothingSeconds(nodeGraphDefaultSmoothingBlockSeconds());
  }
  drag.input.classList.remove("value-dragging");
  drag.input.closest(".scene-context-global-smoothing-control")?.classList.remove("value-dragging");
  drag.input.readOnly = true;
  if (event.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
    drag.input.releasePointerCapture(event.pointerId);
  }
  nodeGraphMvp.globalSmoothingSecondsDragging = null;
  event.preventDefault();
}

function scheduleNodeGraphLiveSync(mode = "plan") {
  if (!nodeGraphMvp.live.node || nodeGraphMvp.live.syncFrame || nodeGraphMvp.live.syncTimer) {
    if (mode === "plan") {
      nodeGraphMvp.live.syncMode = "plan";
    }
    return;
  }
  nodeGraphMvp.live.syncMode = mode;
  const flush = () => flushNodeGraphLivePlanSync();
  nodeGraphMvp.live.syncFrame = window.requestAnimationFrame(flush);
  nodeGraphMvp.live.syncTimer = window.setTimeout(flush, 50);
}

function scheduleNodeGraphLivePlanSync() {
  scheduleNodeGraphLiveSync("plan");
}

function scheduleNodeGraphLiveParameterSync() {
  scheduleNodeGraphLiveSync("params");
}

function clearNodeGraphLivePlanSync() {
  if (nodeGraphMvp.live.syncFrame) {
    window.cancelAnimationFrame(nodeGraphMvp.live.syncFrame);
    nodeGraphMvp.live.syncFrame = 0;
  }
  if (nodeGraphMvp.live.syncTimer) {
    window.clearTimeout(nodeGraphMvp.live.syncTimer);
    nodeGraphMvp.live.syncTimer = 0;
  }
}

function flushNodeGraphLivePlanSync() {
  const mode = nodeGraphMvp.live.syncMode || "plan";
  nodeGraphMvp.live.syncMode = "";
  clearNodeGraphLivePlanSync();
  if (mode === "params") {
    sendNodeGraphLiveParameterUpdate();
  } else {
    sendNodeGraphLivePlan();
  }
}

async function stopNodeGraphLiveAudio() {
  clearNodeGraphLivePlanSync();
  stopNodeGraphLiveInputSource();
  const liveNode = nodeGraphMvp.live.node;
  const liveContext = nodeGraphMvp.live.context;
  const scriptNode = nodeGraphMvp.live.scriptNode;
  nodeGraphMvp.live.node = null;
  nodeGraphMvp.live.context = null;
  nodeGraphMvp.live.meterGain = null;
  nodeGraphMvp.live.outputGain = null;
  nodeGraphMvp.live.activeNodeIds = new Set();
  nodeGraphMvp.live.lastEvidence = null;
  nodeGraphMvp.live.lastParameterUpdateTime = 0;
  nodeGraphMvp.live.planEvidence = null;
  nodeGraphMvp.live.planSerial = 0;
  nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(nodeGraphMvp.live.autoSmoothingSeconds);
  nodeGraphMvp.live.runtime = null;
  nodeGraphMvp.live.scriptNode = null;
  nodeGraphMvp.live.sessionId += 1;
  nodeGraphMvp.live.syncMode = "";
  nodeGraphMvp.live.usesWorklet = false;
  nodeGraphStopGpuAdditiveProducer();
  if (typeof clearNodeGraphModuleScopeBuffers === "function") {
    clearNodeGraphModuleScopeBuffers({
      preserveBuffers: true,
      preserveDisplay: true,
    });
  }
  nodeGraphClearVisualControls();

  try {
    liveNode?.port?.postMessage({ type: "stop", sessionId: nodeGraphMvp.live.sessionId, planSerial: nodeGraphMvp.live.planSerial });
    liveNode?.disconnect();
    scriptNode?.disconnect();
  } catch (_error) {
    // Live shutdown is best effort; a disconnected worklet is already silent.
  }
  if (liveContext && liveContext.state !== "closed") {
    await liveContext.close();
  }
  setNodeGraphLiveStatus("stopped");
  setNodeGraphLiveEvidence("stopped");
  setNodeGraphLiveEngineStatus();
  setNodeGraphLiveEngineTitle();
  setNodeGraphLivePlanStatus();
  setNodeGraphLivePlanTitle();
  setNodeGraphLiveInputMeter();
  setNodeGraphLiveMeter();
  setNodeGraphGpuAdditiveStatus();
  setNodeGraphLiveScheduleStatus("schedule stopped");
  clearNodeGraphLiveStatusTitle();
  renderNodeGraphLiveControls(false);
}

// Ordered source files assembled into one Blob and loaded via a single
// addModule() call -- AudioWorkletGlobalScope can only load ONE static
// module URL, so this is how multiple files get concatenated into that one
// module instead of the whole processor living in a single giant file.
// Order matters: core defines the processor class (no registerProcessor
// call), then per-module chunks would go here as they migrate out of core,
// then register.js calls registerProcessor last, once everything above it
// has finished defining/registering.
const nodeGraphLiveWorkletSourceFiles = [
  "./public/node-live-audio-worklet-core.js?v=wall-delay-ray-bounce-dsp-20260718",
  "./public/modules/codeblock/codeblock-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/moduleGroup/module-group-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/ellipsoid/ellipsoid-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/sineWavetable/sine-wavetable-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/additiveOsc/additive-osc-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/polyBlep/poly-blep-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/noiseGenerator/noise-generator-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/randomWalk/random-walk-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/piSpigotNoise/pi-spigot-noise-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/bradley2a/bradley-2a-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/antisaw/antisaw-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/fractalBrownianNoise/fractal-brownian-noise-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/logisticMap/logistic-map-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/turingMachine/turing-machine-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/henonMap/henon-map-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/chuaAttractor/chua-attractor-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/chordMemory/chord-memory-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/pitchQuantizer/pitch-quantizer-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/wirdoSpiral/wirdo-spiral-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/blubb/blubb-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/mushroom/mushroom-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/boing/boing-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/torus/torus-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/keplerBouwkamp/kepler-bouwkamp-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/nyquistShannon/nyquist-shannon-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/surgeOscillator/surge-oscillator-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/dsfOscillator/dsf-oscillator-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/robinSupersaw/robin-supersaw-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/hypersaw/hypersaw-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/chordSequencer/chord-sequencer-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/lutCell/lut-cell-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/passiveFilter/passive-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/papoulisFilter/papoulis-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/phosphillator/phosphillator-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/cookbookFilter/cookbook-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/ladderFilter/ladder-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/flowerChildFilter/flower-child-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/rsmetFilter/rsmet-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/yellowjacketFilter/yellowjacket-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/superloveFilter/superlove-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/chaoticPhaseLockingFilter/chaotic-phase-locking-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/resonatorFilter/resonator-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/humanFilter/human-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/pulseExplosion/pulse-explosion-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/comparator/comparator-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/minMax/min-max-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/aliasSine/alias-sine-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/tb303Filter/tb303-filter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/delayEffect/delay-effect-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/pingPongDelay/ping-pong-delay-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/wallDelay/wall-delay-worklet-evaluator.js?v=wall-delay-nudge-helper-20260718",
  "./public/modules/reverbEffect/reverb-effect-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/pll/pll-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/helmholtzPitch/helmholtz-pitch-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/slewLimiter/slew-limiter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/sampleHold/sample-hold-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/expAdsr/exp-adsr-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/linearEnvelope/linear-envelope-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/pluckEnvelope/pluck-envelope-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/vactrolEnvelopeSeries/vactrol-envelope-series-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/impulseButton/impulse-button-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/flowerChildEnvelopeFollower/flower-child-envelope-follower-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/spiral/spiral-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/fractalSpiral/fractal-spiral-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/logSpiral/log-spiral-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/lorenzAttractor/lorenz-attractor-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/clock/clock-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/transport/transport-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/randomClock/random-clock-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/triggerDivider/trigger-divider-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/delayedTrigger/delayed-trigger-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/triggerCounter/trigger-counter-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/stepSequencer/step-sequencer-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/stepGrid/step-grid-worklet-evaluator.js?v=stepgrid-20260714",
  "./public/modules/nextPatch/next-patch-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/softClipper/soft-clipper-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/rgbaHsla/rgba-hsla-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/screenSpaceShader/screen-space-shader-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/metallicRatio/metallic-ratio-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/speakerProtection/speaker-protection-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/badvalMonitor/badval-monitor-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/radar/radar-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/audioPlayer/audio-player-worklet-evaluator.js?v=worklet-dedup-20260712",
  "./public/modules/videoscope/videoscope-worklet-evaluator.js?v=videoscope-20260713",
  "./public/node-live-audio-worklet-register.js?v=blob-loader-20260711",
];

async function buildNodeGraphLiveWorkletBlobUrl(sourceFiles) {
  const sources = await Promise.all(sourceFiles.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch AudioWorklet source "${url}": ${response.status}`);
    }
    return response.text();
  }));
  const combined = sources.join("\n;\n");
  const blob = new Blob([combined], { type: "text/javascript" });
  return URL.createObjectURL(blob);
}

async function createNodeGraphLiveWorkletNode(context, plan = null) {
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") {
    throw new Error("AudioWorklet unavailable");
  }
  const blobUrl = await buildNodeGraphLiveWorkletBlobUrl(nodeGraphLiveWorkletSourceFiles);
  try {
    await nodeGraphLiveAwaitStartup(
      context.audioWorklet.addModule(blobUrl),
      "AudioWorklet startup timed out",
    );
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  const workletNode = new AudioWorkletNode(
    context,
    "node-live-audio-processor",
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    },
  );
  workletNode.port.onmessage = handleNodeGraphLiveWorkletMessage;
  workletNode.onprocessorerror = () => {
    setNodeGraphLiveProcessorError("AudioWorklet processor crashed");
  };
  sendNodeGraphLiveNativeModules(workletNode, plan);
  return workletNode;
}

function nodeGraphLiveAwaitStartup(promise, message = "live audio startup timed out", timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

function createNodeGraphLiveScriptProcessorNode(context, plan) {
  const scriptNode = context.createScriptProcessor(nodeGraphAudioBlockSize, 2, 2);
  scriptNode.onaudioprocess = renderNodeGraphLiveScriptBlock;
  nodeGraphMvp.live.runtime = createNodeGraphLiveRuntime(plan);
  nodeGraphMvp.live.runtime.earProtector = createNodeGraphEarProtector(context.sampleRate);
  nodeGraphMvp.live.scriptNode = scriptNode;
  return scriptNode;
}

function stopNodeGraphLiveInputSource() {
  const source = nodeGraphMvp.live.inputSource;
  const stream = nodeGraphMvp.live.inputStream;
  nodeGraphMvp.live.inputSource = null;
  nodeGraphMvp.live.inputStream = null;
  cleanupNodeGraphMockInputStream();
  try {
    source?.disconnect();
  } catch (_error) {
    // Already disconnected input sources are harmless.
  }
  for (const track of stream?.getTracks?.() || []) {
    track.stop();
  }
  setNodeGraphLiveInputStatus(
    nodeGraphMvp.live.inputActive ? nodeGraphLiveInputRouteState().state : "off",
    nodeGraphMvp.live.inputActive
      ? nodeGraphLiveInputRouteState().message
      : ""
  );
  setNodeGraphLiveMicStatus(
    nodeGraphMvp.live.inputActive ? "armed" : "off",
    nodeGraphMvp.live.inputActive
      ? "Start OUTPUT to request browser microphone permission."
      : ""
  );
}

async function startNodeGraphLiveInputSource() {
  const context = nodeGraphMvp.live.context;
  const liveNode = nodeGraphMvp.live.node;
  if (!context || !liveNode || nodeGraphMvp.live.inputStream) {
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const message = window.isSecureContext
      ? "Browser audio input unavailable."
      : "Browser audio input needs HTTPS or localhost.";
    setNodeGraphLiveInputStatus("blocked", message);
    setNodeGraphLiveMicStatus("blocked", message);
    const error = new Error(message);
    error.nodeGraphInputError = true;
    throw error;
  }
  setNodeGraphLiveInputStatus("requesting", "Requesting browser microphone permission.");
  setNodeGraphLiveMicStatus("requesting", "Requesting browser microphone permission.");
  try {
    let stream = null;
    try {
      stream = await requestNodeGraphLiveInputStream();
    } catch (error) {
      if (!nodeGraphMvp.live.inputDeviceId || !nodeGraphLiveInputDeviceIsUnavailable(error)) {
        throw error;
      }
      nodeGraphMvp.live.inputDeviceId = "";
      setNodeGraphLiveInputStatus("requesting", "Selected input unavailable; retrying default input.");
      setNodeGraphLiveMicStatus("requesting", "Selected input unavailable; retrying default input.");
      await refreshNodeGraphLiveInputDevices();
      stream = await requestNodeGraphLiveInputStream("");
    }
    const source = context.createMediaStreamSource(stream);
    source.connect(liveNode);
    nodeGraphMvp.live.inputStream = stream;
    nodeGraphMvp.live.inputSource = source;
    nodeGraphMvp.live.inputPermissionStatus = "granted";
    setNodeGraphLiveInputStatus("connected", "Live INPUT is connected to the browser audio engine.");
    setNodeGraphLiveMicStatus("connected", "Browser microphone stream is connected.");
    refreshNodeGraphLiveInputDevices();
  } catch (error) {
    const message = nodeGraphLiveInputErrorMessage(error);
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      nodeGraphMvp.live.inputPermissionStatus = "denied";
    }
    setNodeGraphLiveInputStatus("blocked", message);
    setNodeGraphLiveMicStatus("blocked", message);
    error.nodeGraphInputError = true;
    throw error;
  }
}

async function syncNodeGraphLiveInputSource() {
  if (nodeGraphMvp.live.inputActive) {
    await startNodeGraphLiveInputSource();
  } else {
    stopNodeGraphLiveInputSource();
  }
}

async function startNodeGraphLiveAudio(outputSerial = nodeGraphMvp.live.outputToggleSerial) {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphTripEarProtection({ source: "live" });
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return;
  }
  if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
    renderNodeGraphLiveControls(false);
    renderNodeGraphExecutionPlanDebug();
    return;
  }
  try {
    if (!nodeGraphScriptReadyForGraphAction("live audio")) {
      markNodeGraphLiveScriptBlocked();
      renderNodeGraphLiveControls(false);
      return;
    }
    setNodeGraphLiveStatus("starting", "warn");
    renderNodeGraphLiveControls(false);
    stopNodeGraphRenderedPlayback();
    if (nodeGraphMvp.live.node || nodeGraphMvp.live.context) {
      await stopNodeGraphLiveAudio();
      if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
        renderNodeGraphLiveControls(false);
        renderNodeGraphExecutionPlanDebug();
        return;
      }
      setNodeGraphLiveStatus("starting", "warn");
      renderNodeGraphLiveControls(false);
    }

    const plan = nodeGraphBuildLivePlan();
    assertNodeGraphLivePlanSupportsClap(plan);
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Web Audio API unavailable");
    }
    const context = new AudioContextConstructor();
    nodeGraphMvp.live.sessionId += 1;
    nodeGraphMvp.live.planSerial = 0;
    if (context.state === "suspended") {
      await context.resume();
    }
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      await context.close();
      renderNodeGraphLiveControls(false);
      renderNodeGraphExecutionPlanDebug();
      return;
    }
    const outputGain = context.createGain();
    outputGain.gain.value = 1;
    let liveNode = null;
    let usesWorklet = false;
    try {
      liveNode = await createNodeGraphLiveWorkletNode(context, plan);
      usesWorklet = true;
    } catch (error) {
      liveNode = createNodeGraphLiveScriptProcessorNode(context, plan);
      setNodeGraphLiveEngineStatus("engine fallback", "warn");
      setNodeGraphLiveEngineTitle(error.message);
    }
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      try {
        liveNode?.disconnect();
      } catch (_error) {
        // A not-yet-connected live node is already silent.
      }
      await context.close();
      renderNodeGraphLiveControls(false);
      renderNodeGraphExecutionPlanDebug();
      return;
    }
    nodeGraphMvp.live.context = context;
    nodeGraphMvp.live.meterGain = null;
    nodeGraphMvp.live.node = liveNode;
    nodeGraphMvp.live.outputGain = outputGain;
    nodeGraphMvp.live.usesWorklet = usesWorklet;
    liveNode.connect(outputGain);
    outputGain.connect(context.destination);
    await syncNodeGraphLiveInputSource();
    if (nodeGraphLiveOutputStartCancelled(outputSerial)) {
      await stopNodeGraphLiveAudio();
      renderNodeGraphExecutionPlanDebug();
      return;
    }
    sendNodeGraphLivePlan();
    sendNodeGraphLiveMacroControls();
    sendNodeGraphLivePitchModWheelSignal();
    if (usesWorklet) {
      setNodeGraphLiveEngineStatus("engine worklet", "good");
      setNodeGraphLiveEngineTitle();
    }
    await context.resume();
    clearNodeGraphLiveStatusTitle();
    renderNodeGraphLiveControls(true);
  } catch (error) {
    const inputError = Boolean(error.nodeGraphInputError);
    const inputErrorMessage = inputError ? nodeGraphLiveInputErrorMessage(error) : "";
    await stopNodeGraphLiveAudio();
    if (inputError) {
      nodeGraphMvp.live.outputEnabled = false;
      setNodeGraphLiveInputStatus("blocked", inputErrorMessage);
      setNodeGraphLiveMicStatus("blocked", inputErrorMessage);
      setNodeGraphLiveBlockedError("input", error, { schedule: false });
    } else {
      setNodeGraphLiveBlockedError("plan", error);
    }
    renderNodeGraphLiveControls(false);
  }
}
