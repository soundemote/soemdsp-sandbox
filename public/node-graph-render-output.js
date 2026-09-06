function nodeGraphRenderPendingSummary() {
  try {
    return nodeGraphValidate().scheduleText;
  } catch (_error) {
    return "waiting for render";
  }
}

const nodeGraphRaptEllipticQuarterbandSos = Object.freeze([
  Object.freeze([1.3515101236634053e-04, 1.8481719657676747e-04, 1.3515101236634053e-04, 1, -1.5863119326809123, 0.6428204816292211]),
  Object.freeze([1, -0.3714014551732318, 0.9999999999999998, 1, -1.5620959364626055, 0.7161571320953768]),
  Object.freeze([1, -1.0298229723362611, 1, 1, -1.5310702081483014, 0.8130950789236201]),
  Object.freeze([1, -1.2676395426322578, 1.0000000000000002, 1, -1.50809401930334, 0.8931580864862605]),
  Object.freeze([1, -1.3628788519102755, 1.0000000000000002, 1, -1.4983265140498274, 0.9475287279522546]),
  Object.freeze([1, -1.3980241837651683, 1, 1, -1.5032624176850438, 0.9843747059042128]),
]);

function renderedNodeGraphWavBlob(rendered) {
  return nodeGraphRenderedWavBlob(rendered, nodeGraphMvp.sampleRate);
}

function nodeGraphOutputClipCountText(count = 0) {
  return count === 1 ? "1 clip" : `${count} clips`;
}

function nodeGraphClampOutputSample(value) {
  if (typeof nodeGraphBadValueReason === "function" && nodeGraphBadValueReason(value)) {
    return 0;
  }
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  return Number(value);
}

function nodeGraphOutputSampleClipped(value) {
  return (
    (typeof nodeGraphBadValueReason === "function" && Boolean(nodeGraphBadValueReason(value))) ||
    !Number.isFinite(Number(value)) ||
    value < -nodeGraphOutputClipLimit ||
    value > nodeGraphOutputClipLimit
  );
}

function nodeGraphOutputSampleTripsEarProtection(value) {
  if (typeof nodeGraphSpeakerProtector2SampleTrips === "function") {
    return nodeGraphSpeakerProtector2SampleTrips(value);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return true;
  }
  if (typeof nodeGraphOutsideUnity === "function") {
    return nodeGraphOutsideUnity(number);
  }
  const eps = typeof nodeGraphPlanck === "function"
    ? nodeGraphPlanck()
    : (typeof NODE_GRAPH_PLANCK === "number" ? NODE_GRAPH_PLANCK : 1e-7);
  return Math.abs(number) >= 1 + eps;
}

function nodeGraphTemporaryPrefilterForResample(samples, sourceRate, outputRate) {
  if (!samples?.length || !Number.isFinite(sourceRate) || !Number.isFinite(outputRate) || sourceRate <= outputRate) {
    return samples;
  }
  const radius = Math.max(1, Math.min(12, Math.ceil(sourceRate / outputRate)));
  const filtered = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    let sum = 0;
    let weightSum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sampleIndex = Math.max(0, Math.min(samples.length - 1, index + offset));
      const weight = radius + 1 - Math.abs(offset);
      sum += samples[sampleIndex] * weight;
      weightSum += weight;
    }
    filtered[index] = weightSum > 0 ? sum / weightSum : samples[index];
  }
  return filtered;
}

function nodeGraphCreateRaptEllipticRenderState() {
  return nodeGraphRaptEllipticQuarterbandSos.map(() => [0, 0]);
}

function nodeGraphRaptEllipticRenderSample(input, states) {
  let y = Number(input) || 0;
  for (let section = 0; section < nodeGraphRaptEllipticQuarterbandSos.length; section += 1) {
    const [b0, b1, b2, , a1, a2] = nodeGraphRaptEllipticQuarterbandSos[section];
    const z1 = states[section][0];
    const z2 = states[section][1];
    const sectionOut = b0 * y + z1;
    states[section][0] = b1 * y - a1 * sectionOut + z2;
    states[section][1] = b2 * y - a2 * sectionOut;
    y = sectionOut;
  }
  return y;
}

function nodeGraphRaptEllipticDecimateRenderedChannel(samples, factor, outputFrames) {
  const frames = Math.max(1, Math.floor(Number(outputFrames)));
  const out = new Float32Array(frames);
  const states = nodeGraphCreateRaptEllipticRenderState();
  let last = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let subframe = 0; subframe < factor; subframe += 1) {
      const sampleIndex = frame * factor + subframe;
      const input = sampleIndex < samples.length ? samples[sampleIndex] : 0;
      last = nodeGraphRaptEllipticRenderSample(input, states);
    }
    out[frame] = last;
  }
  return out;
}

function nodeGraphResampleLinear(samples, outputFrames) {
  const frames = Math.max(1, Math.floor(Number(outputFrames)));
  if (!samples?.length) {
    return new Float32Array(frames);
  }
  if (samples.length === frames) {
    return new Float32Array(samples);
  }
  if (frames === 1) {
    return new Float32Array([samples[0]]);
  }
  const resampled = new Float32Array(frames);
  const scale = (samples.length - 1) / (frames - 1);
  for (let frame = 0; frame < frames; frame += 1) {
    const position = frame * scale;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const blend = position - leftIndex;
    resampled[frame] = samples[leftIndex] * (1 - blend) + samples[rightIndex] * blend;
  }
  return resampled;
}

function nodeGraphResampleRenderedChannel(samples, sourceRate, outputRate, outputFrames) {
  const ratio = sourceRate / outputRate;
  const roundedRatio = Math.round(ratio);
  if (roundedRatio === 4 && Math.abs(ratio - roundedRatio) < 1e-6) {
    return nodeGraphRaptEllipticDecimateRenderedChannel(samples, roundedRatio, outputFrames);
  }
  const filtered = nodeGraphTemporaryPrefilterForResample(samples, sourceRate, outputRate);
  return nodeGraphResampleLinear(filtered, outputFrames);
}

function setNodeGraphAudioStats(peak = 0, rms = 0, details = {}) {
  const audioStats = document.getElementById("nodeAudioStats");
  if (!audioStats) {
    return;
  }
  const frames = Number(details.frames) || 0;
  const sampleRate = Number(details.sampleRate) || nodeGraphMvp.sampleRate;
  const engineSampleRate = Number(details.engineSampleRate) || sampleRate;
  const oversamplingRatio = Number(details.oversamplingRatio) || 1;
  const stateReadCount = Number(details.stateReadCount) || 0;
  const clipCount = Number(details.clipCount) || 0;
  const protectionMuteCount = Number(details.protectionMuteCount) || 0;
  const badNumberCount = Number(details.badNumberCount) || 0;
  const durationSeconds = frames > 0 && sampleRate > 0 ? frames / sampleRate : 0;
  const clipText = clipCount ? ` / ${nodeGraphOutputClipCountText(clipCount)}` : "";
  const protectionText = protectionMuteCount ? ` / protected ${protectionMuteCount}` : "";
  const badNumberText = badNumberCount ? ` / bad ${badNumberCount}` : "";
  audioStats.textContent = `peak ${peak.toFixed(3)} / rms ${rms.toFixed(3)}${clipText}${protectionText}${badNumberText}`;
  audioStats.className = `pill ${clipCount || protectionMuteCount || badNumberCount ? "warn" : ""}`.trim();
  audioStats.dataset.renderClips = String(clipCount);
  audioStats.dataset.renderProtectionMutes = String(protectionMuteCount);
  audioStats.dataset.renderBadNumbers = String(badNumberCount);
  audioStats.dataset.renderFrames = String(frames);
  audioStats.dataset.renderSampleRate = String(sampleRate);
  audioStats.dataset.renderEngineSampleRate = String(engineSampleRate);
  audioStats.dataset.renderOversamplingRatio = String(oversamplingRatio);
  audioStats.dataset.renderDuration = durationSeconds.toFixed(3);
  audioStats.dataset.renderStateReads = String(stateReadCount);
  const stateReadText = stateReadCount ? ` / ${nodeGraphStateReadText(stateReadCount)}` : "";
  const clipTitle = clipCount ? ` / ${nodeGraphOutputClipCountText(clipCount)}` : "";
  const protectionTitle = protectionMuteCount ? ` / ear protection muted ${protectionMuteCount} frames` : "";
  const badNumberTitle = badNumberCount ? ` / bad numbers recovered ${badNumberCount}` : "";
  audioStats.title = frames > 0
    ? `Rendered sample: ${frames} frames / ${durationSeconds.toFixed(3)}s / ${sampleRate} Hz output / ${nodeGraphFormatSampleRate(engineSampleRate)} engine / ${nodeGraphFormatOversamplingRatio(oversamplingRatio)}${stateReadText}${clipTitle}${protectionTitle}${badNumberTitle}`
    : "Rendered sample unavailable";
}

function markNodeGraphRenderPending(summary = "") {
  stopNodeGraphRenderedPlayback();
  nodeGraphMvp.rendered = null;
  clearNodeGraphRenderedModuleScopeBuffers();
  clearNodeGraphRenderedAudioElement();
  labelPrimaryAudioTitle("Render Sample creates preview audio here", false);
  document.getElementById("nodeGraphRenderStatus").textContent = "render pending";
  document.getElementById("nodeGraphRenderStatus").className = "pill warn";
  setNodeGraphAudioStats();
  const outputSummary = document.getElementById("nodeOutputSummary");
  if (outputSummary) {
    outputSummary.textContent = summary || nodeGraphRenderPendingSummary();
  }
  renderNodeGraphExecutionPlanDebug();
  drawNodeRenderedAudio();
}

async function renderNodeGraphAudio() {
  if (!nodeGraphScriptReadyForGraphAction("render")) {
    markNodeGraphRenderScriptBlocked();
    return;
  }
  stopNodeGraphRenderedPlayback();
  const validation = nodeGraphValidate();
  const renderStatus = document.getElementById("nodeGraphRenderStatus");
  if (!validation.valid) {
    nodeGraphMvp.rendered = null;
    clearNodeGraphModuleScopeBuffers();
    clearNodeGraphRenderedAudioElement();
    labelPrimaryAudioTitle("Fix graph before rendering", false);
    renderStatus.textContent = "render blocked";
    renderStatus.className = "pill warn";
    setNodeGraphAudioStats();
    const outputSummary = document.getElementById("nodeOutputSummary");
    if (outputSummary) {
      outputSummary.textContent = validation.scheduleText;
    }
    renderNodeGraphExecutionPlanDebug();
    drawNodeRenderedAudio();
    return;
  }

  syncNodeGraphRenderSecondsFromInput({ normalize: true });
  syncNodeGraphRenderRangeFromInputs();
  // Start/End are absolute simulation times. Always run the graph from t=0
  // through End, then keep only [Start, End) so envelopes / clocks / drift
  // match live. Start=0 → no skip.
  const renderStart = Math.max(0, Number(nodeGraphMvp.renderStartSeconds) || 0);
  const renderEndRaw = Number(nodeGraphMvp.renderEndSeconds);
  const renderEnd = Math.max(
    renderStart + 0.05,
    Number.isFinite(renderEndRaw) && renderEndRaw > 0
      ? renderEndRaw
      : (Number(nodeGraphMvp.seconds) || 2),
  );
  const keepDuration = Math.max(0.05, renderEnd - renderStart);
  const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
  const outputSampleRate = audio.outputSampleRate;
  const engineSampleRate = audio.clampedEngineSampleRate;
  const patchFingerprint = nodeGraphPatchFingerprint();
  // Full bounce length (0 → End). Kept window length (Start → End).
  const fullEngineFrames = Math.max(1, Math.round(engineSampleRate * renderEnd));
  const keepEngineFrames = Math.max(1, Math.round(engineSampleRate * keepDuration));
  const startEngineFrame = Math.max(
    0,
    Math.min(
      Math.round(engineSampleRate * renderStart),
      Math.max(0, fullEngineFrames - keepEngineFrames),
    ),
  );
  const requestedOutputFrames = Math.max(1, Math.floor(outputSampleRate * keepDuration));
  const requestedEngineFrames = keepEngineFrames;
  const plan = nodeGraphBuildLivePlan();
  const engineFrames = keepEngineFrames;
  const outputFrames = requestedOutputFrames;
  const engineLeftSamples = new Float32Array(engineFrames);
  const engineRightSamples = new Float32Array(engineFrames);
  const stateReadCount = nodeGraphStateReadCount(plan);
  renderStatus.textContent = renderStart > 0
    ? `rendering 0…${renderEnd.toFixed(2)}s (keep ${renderStart.toFixed(2)}…${renderEnd.toFixed(2)}s)`
    : "rendering";
  renderStatus.className = "pill";
  // APP_POLICY §0b / §2 / §5: Render Sample uses the same native graph as Live.
  // Never evaluateNodeGraphPlanFrame / JS live-evaluators.
  let clipCount = 0;
  let protectionMuteCount = 0;
  let badNumberCount = 0;
  try {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline || typeof createNodeGraphLiveWorkletNode !== "function") {
      throw new Error("native Render requires OfflineAudioContext + AudioWorklet");
    }
    const offlineCtx = new Offline(2, fullEngineFrames, engineSampleRate);
    const workletNode = await createNodeGraphLiveWorkletNode(offlineCtx, plan);
    workletNode.connect(offlineCtx.destination);
    const planSerial = (Number(nodeGraphMvp?.live?.planSerial) || 0) + 1;
    if (nodeGraphMvp?.live) nodeGraphMvp.live.planSerial = planSerial;
    workletNode.port.postMessage({
      type: "setPlan",
      plan,
      planSerial,
      patchFingerprint,
      sampleRate: engineSampleRate,
      engineSampleRate,
      oversamplingRatio: audio.oversamplingRatio,
      pitchReferenceHz: Number(nodeGraphMvp?.pitchReferenceHz) || 440,
      pitchReferenceMidiNote: Number(nodeGraphMvp?.pitchReferenceMidiNote) || 69,
      sessionId: Number(nodeGraphMvp?.live?.sessionId) || 1,
      timing: nodeGraphMvp?.patch?.timing || null,
    });
    // Queue play early — worklet boots at speed 0 and would bounce silence.
    workletNode.port.postMessage({ type: "setSpeed", speed: 1 });
    // Wait until native graph compiled (or timeout).
    await new Promise((resolve, reject) => {
      const timeoutMs = 15000;
      const t0 = performance.now();
      const onMsg = (event) => {
        const msg = event?.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "nativeGraphStatus" && msg.status === "compiled") {
          cleanup();
          resolve();
        }
        if (msg.type === "nativeGraphStatus" && msg.status === "error") {
          cleanup();
          reject(new Error(String(msg.detail || msg.message || "native graph compile failed")));
        }
      };
      const cleanup = () => {
        try { workletNode.port.removeEventListener("message", onMsg); } catch (_e) { /* */ }
        window.clearInterval(poll);
      };
      workletNode.port.addEventListener("message", onMsg);
      const poll = window.setInterval(() => {
        if (performance.now() - t0 > timeoutMs) {
          cleanup();
          // Fall through: startRendering may still have audio if setPlan applied.
          resolve();
        }
      }, 50);
    });
    // Worklet boots paused (speedMultiplier=0) and would render silence.
    // Play the simulation for the offline bounce (same as Live Play).
    workletNode.port.postMessage({ type: "setSpeed", speed: 1 });
    // Brief settle so first quantum is not silent.
    await new Promise((r) => window.setTimeout(r, 50));
    const renderedBuf = await offlineCtx.startRendering();
    const ch0 = renderedBuf.getChannelData(0);
    const ch1 = renderedBuf.numberOfChannels > 1
      ? renderedBuf.getChannelData(1)
      : ch0;
    const earProtector = createNodeGraphEarProtector(engineSampleRate);
    const available = Math.min(ch0.length, ch1.length);
    for (let i = 0; i < engineFrames; i += 1) {
      const src = startEngineFrame + i;
      const rawL = src < available ? (Number(ch0[src]) || 0) : 0;
      const rawR = src < available ? (Number(ch1[src]) || 0) : 0;
      if (nodeGraphOutputSampleClipped(rawL)) clipCount += 1;
      if (nodeGraphOutputSampleClipped(rawR)) clipCount += 1;
      if (
        nodeGraphOutputSampleTripsEarProtection(rawL)
        || nodeGraphOutputSampleTripsEarProtection(rawR)
      ) {
        protectionMuteCount += 1;
      }
      const protectedFrame = earProtector.protect(rawL, rawR);
      if (protectedFrame.muted) protectionMuteCount += 1;
      engineLeftSamples[i] = nodeGraphClampOutputSample(protectedFrame.left);
      engineRightSamples[i] = nodeGraphClampOutputSample(protectedFrame.right);
    }
    try { workletNode.disconnect(); } catch (_e) { /* */ }
  } catch (error) {
    const message = String(error?.message || error || "native Render failed");
    if (typeof window.SE?.ERROR === "function") {
      window.SE.ERROR(`Render Sample (native only): ${message}`);
    } else {
      console.error("[render] native bounce failed", error);
    }
    nodeGraphMvp.rendered = null;
    clearNodeGraphModuleScopeBuffers();
    clearNodeGraphRenderedAudioElement();
    labelPrimaryAudioTitle("Native render failed", false);
    renderStatus.textContent = "native render failed";
    renderStatus.className = "pill warn";
    setNodeGraphAudioStats();
    drawNodeRenderedAudio();
    return;
  }

  const leftSamples = nodeGraphResampleRenderedChannel(
    engineLeftSamples,
    engineSampleRate,
    outputSampleRate,
    outputFrames,
  );
  const rightSamples = nodeGraphResampleRenderedChannel(
    engineRightSamples,
    engineSampleRate,
    outputSampleRate,
    outputFrames,
  );
  const samples = new Float32Array(outputFrames);
  let peak = 0;
  let squareSum = 0;
  for (let frame = 0; frame < outputFrames; frame += 1) {
    const left = leftSamples[frame] || 0;
    const right = rightSamples[frame] || 0;
    samples[frame] = (left + right) * 0.5;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    squareSum += (left * left + right * right) * 0.5;
  }

  const rms = Math.sqrt(squareSum / outputFrames);
  nodeGraphMvp.rendered = {
    channels: 2,
    connectionCount: plan.connections.length,
    durationSeconds: outputFrames / outputSampleRate,
    engineFrames,
    engineSampleRate,
    feedbackConnectionCount: plan.feedbackConnections.length,
    feedbackModulationCount: plan.feedbackModulations.length,
    frames: outputFrames,
    modulationCount: plan.modulations.length,
    nodeCount: plan.nodes.length,
    oversamplingRatio: audio.oversamplingRatio,
    peak,
    renderStartSeconds: renderStart,
    renderEndSeconds: renderEnd,
    fullEngineFrames,
    startEngineFrame,
    requestedEngineFrames,
    requestedFrames: requestedOutputFrames,
    leftSamples,
    patchFingerprint,
    rightSamples,
    rms,
    sampleRate: outputSampleRate,
    samples,
    clipCount,
    protectionMuteCount,
    sourceNodes: validation.sourceNodes,
    stateReadCount,
    badNumberCount,
  };
  if (protectionMuteCount > 0 && typeof nodeGraphSetEarProtectionEngaged === "function") {
    nodeGraphSetEarProtectionEngaged(false, {
      nodeId: "",
      protectionPeak: 0,
      source: "render",
      protectionMuteCount,
    });
  }
  syncNodeGraphRenderedAudioElement();
  renderStatus.textContent = "render ready";
  renderStatus.className = "pill good";
  setNodeGraphAudioStats(peak, rms, {
    frames: outputFrames,
    sampleRate: outputSampleRate,
    clipCount,
    engineSampleRate,
    oversamplingRatio: audio.oversamplingRatio,
    protectionMuteCount,
    stateReadCount,
    badNumberCount,
  });
  renderNodeGraphExecutionPlanDebug();
  const outputSummary = document.getElementById("nodeOutputSummary");
  if (outputSummary) {
    outputSummary.textContent = validation.scheduleText;
  }
  drawNodeRenderedAudio();
}
