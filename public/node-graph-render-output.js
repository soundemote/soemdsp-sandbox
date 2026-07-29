function nodeGraphRenderPendingSummary() {
  try {
    return nodeGraphValidate().scheduleText;
  } catch (_error) {
    return "waiting for render";
  }
}

const nodeGraphClapMaxRenderTailSeconds = 10;

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
  return Math.max(
    -nodeGraphOutputClipLimit,
    Math.min(nodeGraphOutputClipLimit, Number(value)),
  );
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
  const number = Number(value);
  return !Number.isFinite(number) || Math.abs(number) > 1;
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
  const clapLatencyFrames = Math.max(0, Math.round(Number(details.clapLatencyFrames) || 0));
  const clapTailFrames = Math.max(0, Math.round(Number(details.clapTailFrames) || 0));
  const clapRenderedTailFrames = Math.max(0, Math.round(Number(details.clapRenderedTailFrames) || 0));
  const clapTailInfinite = Boolean(details.clapTailInfinite);
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
  audioStats.dataset.renderClapLatencyFrames = String(clapLatencyFrames);
  audioStats.dataset.renderClapTailFrames = String(clapTailFrames);
  audioStats.dataset.renderClapRenderedTailFrames = String(clapRenderedTailFrames);
  audioStats.dataset.renderClapTailInfinite = clapTailInfinite ? "true" : "false";
  const stateReadText = stateReadCount ? ` / ${nodeGraphStateReadText(stateReadCount)}` : "";
  const clipTitle = clipCount ? ` / ${nodeGraphOutputClipCountText(clipCount)}` : "";
  const protectionTitle = protectionMuteCount ? ` / ear protection muted ${protectionMuteCount} frames` : "";
  const badNumberTitle = badNumberCount ? ` / bad numbers recovered ${badNumberCount}` : "";
  const clapLatencyTitle = clapLatencyFrames ? ` / CLAP latency compensated ${clapLatencyFrames} engine frames` : "";
  const clapTailTitle = clapTailInfinite
    ? " / CLAP infinite tail reported"
    : clapRenderedTailFrames
      ? ` / CLAP finite tail rendered ${clapRenderedTailFrames} engine frames`
      : clapTailFrames ? ` / CLAP finite tail reported ${clapTailFrames} engine frames` : "";
  audioStats.title = frames > 0
    ? `Rendered sample: ${frames} frames / ${durationSeconds.toFixed(3)}s / ${sampleRate} Hz output / ${nodeGraphFormatSampleRate(engineSampleRate)} engine / ${nodeGraphFormatOversamplingRatio(oversamplingRatio)}${stateReadText}${clipTitle}${protectionTitle}${badNumberTitle}${clapLatencyTitle}${clapTailTitle}`
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

function nodeGraphPlanClapRenderNodes(plan) {
  const reachableNodeIds = new Set(plan.reachableNodes || plan.order || []);
  const nodeOrder = new Map((plan.order || []).map((nodeId, index) => [nodeId, index]));
  return (plan.nodes || [])
    .filter((node) =>
      node?.type === "clapPlugin" &&
      normalizeNodeGraphClapPluginBinding(node.clap).instanceId &&
      (!reachableNodeIds.size || reachableNodeIds.has(node.id))
    )
    .sort((a, b) =>
      (nodeOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (nodeOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
}

function nodeGraphClapFeedbackIssues(plan, clapNodeIds) {
  const nodeIds = clapNodeIds instanceof Set ? clapNodeIds : new Set(clapNodeIds || []);
  if (!nodeIds.size) {
    return [];
  }
  const feedbackSignals = Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections : [];
  const feedbackModulations = Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations : [];
  const issues = [];
  for (const connection of feedbackSignals) {
    if (!nodeIds.has(connection?.sourceNode) && !nodeIds.has(connection?.destinationNode)) {
      continue;
    }
    const source = nodeGraphNodeDisplayName(connection.sourceNode);
    const destination = nodeGraphNodeDisplayName(connection.destinationNode);
    issues.push(`${source}.${connection.sourcePort} -> ${destination}.${connection.destinationPort}`);
  }
  for (const modulation of feedbackModulations) {
    if (!nodeIds.has(modulation?.sourceNode) && !nodeIds.has(modulation?.destinationNode)) {
      continue;
    }
    const source = nodeGraphNodeDisplayName(modulation.sourceNode);
    const destination = nodeGraphNodeDisplayName(modulation.destinationNode);
    issues.push(`${source}.${modulation.sourcePort} -> ${destination}.${modulation.destinationParam}`);
  }
  return issues;
}

function assertNodeGraphClapRenderFeedbackSafe(plan, clapNodes) {
  const clapNodeIds = new Set((clapNodes || []).map((node) => node.id));
  const issues = nodeGraphClapFeedbackIssues(plan, clapNodeIds);
  if (issues.length) {
    throw new Error(`feedback involving CLAP Plugin nodes is not supported yet: ${issues.join("; ")}`);
  }
}

function assertNodeGraphClapRenderInstancesPresent(clapNodes) {
  if (typeof nodeGraphClapInstanceIsStale !== "function") {
    return;
  }
  const staleNodes = (clapNodes || []).filter((node) =>
    nodeGraphClapInstanceIsStale(normalizeNodeGraphClapPluginBinding(node.clap).instanceId)
  );
  if (staleNodes.length) {
    const names = staleNodes.map((node) => nodeGraphPatchNodeTitle(node)).join(", ");
    throw new Error(`CLAP host instance is stale: ${names}. Forget the instance, then create a new one.`);
  }
}

function nodeGraphClapProcessChunkFrames() {
  const frames = typeof nodeGraphClapHostMaxProcessFrames === "function"
    ? Number(nodeGraphClapHostMaxProcessFrames())
    : 48000;
  return Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : 48000;
}

function nodeGraphClapBase64FromF32Channel(source, start = 0, frames = source?.length || 0) {
  const buffer = new ArrayBuffer(Math.max(0, frames) * 4);
  const view = new DataView(buffer);
  for (let frame = 0; frame < frames; frame += 1) {
    const value = Number(source?.[start + frame]) || 0;
    view.setFloat32(frame * 4, Number.isFinite(value) ? value : 0, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function nodeGraphClapF32ChannelFromBase64(base64, frames) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  const output = new Float32Array(frames);
  const decodedFrames = Math.min(frames, Math.floor(bytes.length / 4));
  for (let frame = 0; frame < decodedFrames; frame += 1) {
    const value = view.getFloat32(frame * 4, true);
    output[frame] = nodeGraphClampOutputSample(Number.isFinite(value) ? value : 0);
  }
  return output;
}

function nodeGraphReadRuntimeInputPort(runtime, frameValues, nodeId, port, frame, frames) {
  const connections = runtime.inputConnections.get(nodeGraphInputKey(nodeId, port)) || [];
  return connections.reduce(
    (sum, connection) => sum + readNodeGraphRuntimePortOutput(
      runtime,
      frameValues,
      connection.sourceNode,
      connection.sourcePort,
      frame,
      frames,
    ),
    0,
  );
}

function nodeGraphClapRenderParameterEntries(clapNode) {
  return Object.entries(clapNode.paramMeta || {})
    .map(([key, metadata]) => {
      const parameterId = Number(metadata?.clapParamId);
      const storedValue = Number(clapNode.params?.[key]);
      const defaultValue = Number(metadata?.def);
      return {
        key,
        paramId: Number.isFinite(parameterId) ? Math.round(parameterId) : undefined,
        value: Number.isFinite(storedValue) ? storedValue : defaultValue,
      };
    })
    .filter((entry) => Number.isFinite(entry.paramId) && Number.isFinite(entry.value));
}

function nodeGraphRenderClapParameterValues(runtime, clapNode, entries, frame, frames, frameValues) {
  return entries.map((entry) => ({
    ...entry,
    value: readNodeGraphLiveEffectiveParam(
      runtime,
      clapNode,
      entry.key,
      entry.value,
      frame,
      frames,
      frameValues,
    ),
  }));
}

function nodeGraphClapRenderParameterPayload(entries) {
  return (entries || [])
    .map((entry) => ({
      paramId: entry.paramId,
      value: entry.value,
    }))
    .filter((entry) => Number.isFinite(entry.paramId) && Number.isFinite(entry.value));
}

function nodeGraphClapReportedLatencyFrames(latency = {}) {
  if (latency?.supported !== true) {
    return 0;
  }
  if (latency?.error) {
    if (typeof console?.warn === "function") {
      console.warn("CLAP latency report error:", latency.error, "(instance/summary:", latency, ")");
    }
    return 0;
  }
  const samples = Number(latency.samples);
  return Number.isFinite(samples) && samples > 0 ? Math.round(samples) : 0;
}

function nodeGraphClapReportedTailState(tail = {}) {
  if (tail?.supported !== true) {
    return {
      infinite: false,
      samples: 0,
    };
  }
  if (tail?.error) {
    if (typeof console?.warn === "function") {
      console.warn("CLAP tail report error:", tail.error, "(instance/summary:", tail, ")");
    }
    return {
      infinite: false,
      samples: 0,
    };
  }
  const samples = Number(tail.samples);
  return {
    infinite: tail.infinite === true,
    samples: Number.isFinite(samples) && samples > 0 ? Math.round(samples) : 0,
  };
}

function nodeGraphClapRenderTailFrameLimit(engineSampleRate) {
  const sampleRate = Number(engineSampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(nodeGraphClapMaxRenderTailSeconds * sampleRate));
}

function nodeGraphClapInitialTailState(clapNodes, engineSampleRate) {
  const limit = nodeGraphClapRenderTailFrameLimit(engineSampleRate);
  let reportedFrames = 0;
  let infinite = false;
  for (const node of clapNodes || []) {
    if (typeof nodeGraphClapInstanceSummary !== "function") {
      continue;
    }
    const binding = normalizeNodeGraphClapPluginBinding(node.clap);
    const summary = nodeGraphClapInstanceSummary(binding.instanceId);
    const tail = nodeGraphClapReportedTailState(summary?.tail);
    reportedFrames = Math.max(reportedFrames, tail.samples);
    infinite = Boolean(infinite || tail.infinite);
  }
  return {
    infinite,
    reportedFrames,
    renderFrames: infinite ? 0 : Math.min(reportedFrames, limit),
  };
}

function nodeGraphClapRenderNodeDependencies(renderNode, clapNodeIds, plan) {
  const dependencies = new Set();
  const nodeId = renderNode?.node?.id || "";
  for (const port of renderNode?.inputPorts || []) {
    const connections = plan.inputConnections instanceof Map
      ? plan.inputConnections.get(nodeGraphInputKey(nodeId, port)) || []
      : (plan.connections || []).filter((connection) =>
        connection.destinationNode === nodeId &&
        connection.destinationPort === port
      );
    for (const connection of connections) {
      if (connection.sourceNode !== nodeId && clapNodeIds.has(connection.sourceNode)) {
        dependencies.add(connection.sourceNode);
      }
    }
  }
  for (const modulation of plan.modulations || []) {
    if (
      modulation.destinationNode === nodeId &&
      modulation.sourceNode !== nodeId &&
      clapNodeIds.has(modulation.sourceNode)
    ) {
      dependencies.add(modulation.sourceNode);
    }
  }
  return dependencies;
}

function nodeGraphClapRenderBatchGroups(renderNodes, plan) {
  const clapNodeIds = new Set(renderNodes.map((renderNode) => renderNode.node.id));
  const dependencies = new Map(
    renderNodes.map((renderNode) => [
      renderNode.node.id,
      nodeGraphClapRenderNodeDependencies(renderNode, clapNodeIds, plan),
    ]),
  );
  const pending = new Set(renderNodes.map((renderNode) => renderNode.node.id));
  const groups = [];
  while (pending.size) {
    const group = renderNodes.filter((renderNode) => {
      if (!pending.has(renderNode.node.id)) {
        return false;
      }
      return ![...(dependencies.get(renderNode.node.id) || [])]
        .some((dependencyId) => pending.has(dependencyId));
    });
    const safeGroup = group.length
      ? group
      : [renderNodes.find((renderNode) => pending.has(renderNode.node.id))].filter(Boolean);
    if (!safeGroup.length) {
      break;
    }
    groups.push(safeGroup);
    for (const renderNode of safeGroup) {
      pending.delete(renderNode.node.id);
    }
  }
  return groups;
}

function nodeGraphPrepareClapRenderProcessPayload(
  renderNode,
  start,
  frames,
  engineSampleRate,
  outputs,
  inputEngineFrames,
) {
  const {
    binding,
    inputPorts,
    node: clapNode,
    parameterEntries,
    runtime,
  } = renderNode;
  const inputAudio = inputPorts.map(() => new Array(frames).fill(0));
  let processParameterEntries = parameterEntries;
  runtime.externalClapOutputs = outputs;
  runtime.tailInputFrames = inputEngineFrames;
  runtime.tailSilencedNodeIds = renderNode.tailSilencedNodeIds;
  for (let blockStart = start; blockStart < start + frames; blockStart += nodeGraphAudioBlockSize) {
    const blockFrames = Math.min(nodeGraphAudioBlockSize, start + frames - blockStart);
    for (let blockFrame = 0; blockFrame < blockFrames; blockFrame += 1) {
      const frame = blockStart + blockFrame;
      const chunkFrame = frame - start;
      runtime.absoluteFrame = frame;
      const frameOutput = evaluateNodeGraphPlanFrame(
        runtime,
        engineSampleRate,
        blockFrame,
        blockFrames,
      );
      if (parameterEntries.length && frame === start) {
        processParameterEntries = nodeGraphRenderClapParameterValues(
          runtime,
          clapNode,
          parameterEntries,
          blockFrame,
          blockFrames,
          frameOutput.frameValues,
        );
      }
      for (let portIndex = 0; portIndex < inputPorts.length; portIndex += 1) {
        inputAudio[portIndex][chunkFrame] = nodeGraphReadRuntimeInputPort(
          runtime,
          frameOutput.frameValues,
          clapNode.id,
          inputPorts[portIndex],
          blockFrame,
          blockFrames,
        );
      }
    }
    finishNodeGraphParameterSmoothing(runtime.smoothers, runtime);
  }

  return {
    frames,
    inputAudio: inputAudio.map((channel) => nodeGraphClapBase64FromF32Channel(channel, 0, frames)),
    inputAudioFormat: "planar-f32-base64",
    instanceId: binding.instanceId,
    parameters: nodeGraphClapRenderParameterPayload(processParameterEntries),
    renderSessionId: renderNode.renderSessionId || "",
    returnAudio: true,
    returnAudioFormat: "planar-f32-base64",
    sampleRate: engineSampleRate,
  };
}

function nodeGraphApplyClapRenderProcessPayload(renderNode, payload, frames, start) {
  const { binding, node: clapNode, outputAudio } = renderNode;
  if (payload?.ok !== true || payload.audioReturned !== true || !Array.isArray(payload.audio)) {
    const detail = payload?.error ? `: ${payload.error}` : "";
    throw new Error(`CLAP process failed for ${nodeGraphPatchNodeTitle(clapNode)}${detail}`);
  }
  const latencyFrames = nodeGraphClapReportedLatencyFrames(payload.latency);
  const tail = nodeGraphClapReportedTailState(payload.tail);
  renderNode.latencyFrames = Math.max(Number(renderNode.latencyFrames) || 0, latencyFrames);
  renderNode.tailFrames = Math.max(Number(renderNode.tailFrames) || 0, tail.samples);
  renderNode.tailInfinite = Boolean(renderNode.tailInfinite || tail.infinite);
  if (typeof nodeGraphClapCommitInstanceSummary === "function") {
    nodeGraphClapCommitInstanceSummary({
      instanceId: binding.instanceId,
      latency: payload.latency,
      safety: payload.safety,
      tail: payload.tail,
    });
    if (typeof syncNodeGraphClapPluginElements === "function") {
      syncNodeGraphClapPluginElements();
    }
  }
  if (payload.safetyMuted) {
    const reason = payload.safety?.reason ? `: ${payload.safety.reason}` : "";
    throw new Error(`CLAP safety muted ${nodeGraphPatchNodeTitle(clapNode)}${reason}`);
  }
  for (let portIndex = 0; portIndex < outputAudio.length; portIndex += 1) {
    if (payload.audioFormat === "planar-f32-base64") {
      const source = nodeGraphClapF32ChannelFromBase64(payload.audio[portIndex], frames);
      for (let frame = 0; frame < frames; frame += 1) {
        const outputFrame = start + frame - latencyFrames;
        if (outputFrame >= 0 && outputFrame < outputAudio[portIndex].length) {
          outputAudio[portIndex][outputFrame] = source[frame];
        }
      }
    } else {
      const source = Array.isArray(payload.audio[portIndex]) ? payload.audio[portIndex] : [];
      for (let frame = 0; frame < frames; frame += 1) {
        const outputFrame = start + frame - latencyFrames;
        if (outputFrame >= 0 && outputFrame < outputAudio[portIndex].length) {
          outputAudio[portIndex][outputFrame] = nodeGraphClampOutputSample(Number(source[frame]) || 0);
        }
      }
    }
  }
}

async function nodeGraphProcessClapRenderBatch(renderNodes, requests, frames, start) {
  const maxBatchItems = typeof nodeGraphClapHostMaxProcessBatchItems === "function"
    ? nodeGraphClapHostMaxProcessBatchItems()
    : 64;
  for (let offset = 0; offset < requests.length; offset += maxBatchItems) {
    const itemRequests = requests.slice(offset, offset + maxBatchItems);
    const payload = await postNodeGraphClapHostJson(
      "/process-batch",
      { items: itemRequests },
      20000,
    );
    if (payload?.ok !== true || !Array.isArray(payload.items)) {
      throw new Error("CLAP batch process failed");
    }
    for (let index = 0; index < itemRequests.length; index += 1) {
      nodeGraphApplyClapRenderProcessPayload(
        renderNodes[offset + index],
        payload.items[index],
        frames,
        start,
      );
    }
  }
}

async function nodeGraphBeginClapRenderSessions(renderNodes, engineSampleRate, maxBlockFrames) {
  for (const renderNode of renderNodes) {
    const payload = await postNodeGraphClapHostJson(
      `/instances/${encodeURIComponent(renderNode.binding.instanceId)}/render/begin`,
      {
        maxBlockFrames,
        sampleRate: engineSampleRate,
      },
      5000,
    );
    if (payload?.ok !== true || !payload.renderSessionId) {
      const detail = payload?.error ? `: ${payload.error}` : "";
      throw new Error(`CLAP render session begin failed for ${nodeGraphPatchNodeTitle(renderNode.node)}${detail}`);
    }
    renderNode.renderSessionId = payload.renderSessionId;
  }
}

async function nodeGraphEndClapRenderSessions(renderNodes) {
  const errors = [];
  for (const renderNode of renderNodes) {
    const renderSessionId = renderNode.renderSessionId || "";
    if (!renderSessionId) {
      continue;
    }
    renderNode.renderSessionId = "";
    try {
      await postNodeGraphClapHostJson(
        `/instances/${encodeURIComponent(renderNode.binding.instanceId)}/render/end`,
        { renderSessionId },
        5000,
      );
    } catch (error) {
      errors.push(`${nodeGraphPatchNodeTitle(renderNode.node)}: ${error?.message || error}`);
    }
  }
  return errors;
}

async function nodeGraphRenderExternalClapOutputs(plan, engineSampleRate, inputEngineFrames, engineFrames) {
  const clapNodes = nodeGraphPlanClapRenderNodes(plan);
  const outputs = new Map();
  if (!clapNodes.length) {
    return outputs;
  }
  assertNodeGraphClapRenderFeedbackSafe(plan, clapNodes);
  assertNodeGraphClapRenderInstancesPresent(clapNodes);
  if (nodeGraphClapHostState.status !== "connected" || typeof postNodeGraphClapHostJson !== "function") {
    throw new Error("CLAP host is not connected (CLAP is under construction — connect via the local launcher at tools\\webui-clap-host\\start_webui_clap_host.cmd)");
  }
  if (typeof nodeGraphClapHostCanProcessAudio === "function" && !nodeGraphClapHostCanProcessAudio()) {
    throw new Error("connected CLAP host does not report audio processing support");
  }
  if (typeof nodeGraphClapHostCanUseRenderSessions === "function" && !nodeGraphClapHostCanUseRenderSessions()) {
    throw new Error("connected CLAP host does not report offline render session support");
  }

  const renderNodes = clapNodes.map((clapNode) => {
    const outputPorts = nodeGraphPatchNodeClapAudioOutputPorts(clapNode);
    // Pad output buffer by max process chunk to absorb latency compensation shift.
    // Without this padding, the last latencyFrames of output are written to indices
    // beyond the buffer and silently dropped, leaving trailing zeros in the render.
    const bufferFrames = engineFrames + nodeGraphClapProcessChunkFrames();
    const outputAudio = outputPorts.map(() => new Float32Array(bufferFrames));
    outputs.set(
      clapNode.id,
      Object.fromEntries(outputPorts.map((port, index) => [port, outputAudio[index]])),
    );
    return {
      binding: normalizeNodeGraphClapPluginBinding(clapNode.clap),
      inputPorts: nodeGraphPatchNodeClapAudioInputPorts(clapNode),
      node: clapNode,
      outputAudio,
      outputPorts,
      parameterEntries: nodeGraphClapRenderParameterEntries(clapNode),
      renderSessionId: "",
      runtime: createNodeGraphLiveRuntime(plan),
      tailSilencedNodeIds: new Set(plan.sourceNodes || []),
      latencyFrames: 0,
      tailFrames: 0,
      tailInfinite: false,
    };
  });
  const batchGroups = nodeGraphClapRenderBatchGroups(renderNodes, plan);
  const chunkFrames = nodeGraphClapProcessChunkFrames();
  const canBatch = typeof nodeGraphClapHostCanProcessBatch === "function" &&
    nodeGraphClapHostCanProcessBatch();

  let renderError = null;
  try {
    await nodeGraphBeginClapRenderSessions(renderNodes, engineSampleRate, chunkFrames);
    for (let start = 0; start < engineFrames; start += chunkFrames) {
      const frames = Math.min(chunkFrames, engineFrames - start);
      for (const group of batchGroups) {
        const requests = group.map((renderNode) =>
          nodeGraphPrepareClapRenderProcessPayload(
            renderNode,
            start,
            frames,
            engineSampleRate,
            outputs,
            inputEngineFrames,
          )
        );
        if (canBatch && requests.length > 1) {
          await nodeGraphProcessClapRenderBatch(group, requests, frames, start);
          continue;
        }
        for (let index = 0; index < group.length; index += 1) {
          const payload = await postNodeGraphClapHostJson(
            `/instances/${encodeURIComponent(requests[index].instanceId)}/process`,
            requests[index],
            20000,
          );
          nodeGraphApplyClapRenderProcessPayload(group[index], payload, frames, start);
        }
      }
    }
  } catch (error) {
    renderError = error;
  } finally {
    const endErrors = await nodeGraphEndClapRenderSessions(renderNodes);
    if (!renderError && endErrors.length) {
      renderError = new Error(`CLAP render session end failed: ${endErrors.join("; ")}`);
    }
  }
  if (renderError) {
    throw renderError;
  }
  outputs.clapLatencyFrames = Math.max(
    0,
    ...renderNodes.map((renderNode) => Math.round(Number(renderNode.latencyFrames) || 0)),
  );
  outputs.clapTailFrames = Math.max(
    0,
    ...renderNodes.map((renderNode) => Math.round(Number(renderNode.tailFrames) || 0)),
  );
  outputs.clapTailInfinite = renderNodes.some((renderNode) => renderNode.tailInfinite === true);
  outputs.clapRenderedTailFrames = Math.max(0, Math.round(Number(engineFrames) - Number(inputEngineFrames)));

  return outputs;
}

async function renderNodeGraphAudio() {
  if (nodeGraphEarProtectionIsTripped()) {
    nodeGraphTripEarProtection({ source: "render" });
    return;
  }
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
  const renderStart = nodeGraphMvp.renderStartSeconds ?? 0;
  const renderEnd = nodeGraphMvp.renderEndSeconds ?? nodeGraphMvp.seconds ?? 2;
  const renderDuration = Math.max(0.05, renderEnd - renderStart);
  const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
  const outputSampleRate = audio.outputSampleRate;
  const engineSampleRate = audio.clampedEngineSampleRate;
  const patchFingerprint = nodeGraphPatchFingerprint();
  const requestedOutputFrames = Math.floor(outputSampleRate * renderDuration);
  const requestedEngineFrames = Math.max(1, Math.round(engineSampleRate * renderDuration));
  const plan = nodeGraphBuildLivePlan();
  const clapNodes = nodeGraphPlanClapRenderNodes(plan);
  const initialClapTail = nodeGraphClapInitialTailState(clapNodes, engineSampleRate);
  const clapInitialTailFrames = Math.max(0, Math.round(Number(initialClapTail.reportedFrames) || 0));
  const initialRenderedTailFrames = Math.max(0, Math.round(Number(initialClapTail.renderFrames) || 0));
  const engineFrames = requestedEngineFrames + initialRenderedTailFrames;
  const outputTailFrames = Math.max(
    0,
    Math.round(initialRenderedTailFrames * outputSampleRate / engineSampleRate),
  );
  const outputFrames = requestedOutputFrames + outputTailFrames;
  const engineLeftSamples = new Float32Array(engineFrames);
  const engineRightSamples = new Float32Array(engineFrames);
  const stateReadCount = nodeGraphStateReadCount(plan);
  let externalClapOutputs = new Map();
  try {
    renderStatus.textContent = "rendering";
    renderStatus.className = "pill";
    externalClapOutputs = await nodeGraphRenderExternalClapOutputs(
      plan,
      engineSampleRate,
      requestedEngineFrames,
      engineFrames,
    );
  } catch (error) {
    nodeGraphMvp.rendered = null;
    clearNodeGraphModuleScopeBuffers();
    clearNodeGraphRenderedAudioElement();
    labelPrimaryAudioTitle("Fix CLAP host before rendering", false);
    renderStatus.textContent = "render blocked";
    renderStatus.className = "pill warn";
    setNodeGraphAudioStats();
    const outputSummary = document.getElementById("nodeOutputSummary");
    if (outputSummary) {
      outputSummary.textContent = `CLAP render blocked: ${error?.message || error}`;
    }
    renderNodeGraphExecutionPlanDebug();
    drawNodeRenderedAudio();
    return;
  }
  const clapLatencyFrames = Math.max(0, Math.round(Number(externalClapOutputs.clapLatencyFrames) || 0));
  const clapTailFrames = Math.max(
    clapInitialTailFrames,
    Math.round(Number(externalClapOutputs.clapTailFrames) || 0),
  );
  const clapRenderedTailFrames = Math.max(
    0,
    Math.round(Number(externalClapOutputs.clapRenderedTailFrames) || initialRenderedTailFrames),
  );
  const clapTailInfinite = initialClapTail.infinite === true || externalClapOutputs.clapTailInfinite === true;
  const runtime = createNodeGraphLiveRuntime(plan);
  runtime.externalClapOutputs = externalClapOutputs;
  runtime.tailInputFrames = requestedEngineFrames;
  runtime.tailSilencedNodeIds = new Set(plan.sourceNodes || []);
  const scopeCapture = beginNodeGraphRenderedScopeCapture({
    frames: engineFrames,
    patch: nodeGraphMvp.patch,
    patchFingerprint,
    sampleRate: engineSampleRate,
  });
  const earProtector = createNodeGraphEarProtector(engineSampleRate);
  let clipCount = 0;
  let protectionMuteCount = 0;

  for (let blockStart = 0; blockStart < engineFrames; blockStart += nodeGraphAudioBlockSize) {
    const blockFrames = Math.min(nodeGraphAudioBlockSize, engineFrames - blockStart);
    for (let blockFrame = 0; blockFrame < blockFrames; blockFrame += 1) {
      const frame = blockStart + blockFrame;
      runtime.absoluteFrame = frame;
      const frameOutput = evaluateNodeGraphPlanFrame(
        runtime,
        engineSampleRate,
        blockFrame,
        blockFrames,
      );
      captureNodeGraphRenderedScopeFrame(
        scopeCapture,
        runtime,
        frameOutput.frameValues,
        frame,
        blockFrame,
        blockFrames,
      );
      if (nodeGraphOutputSampleClipped(frameOutput.left)) {
        clipCount += 1;
      }
      if (nodeGraphOutputSampleClipped(frameOutput.right)) {
        clipCount += 1;
      }
      if (
        nodeGraphOutputSampleTripsEarProtection(frameOutput.left) ||
        nodeGraphOutputSampleTripsEarProtection(frameOutput.right)
      ) {
        protectionMuteCount += 1;
        runtime.speakerProtectionPeak = Math.max(
          Number(runtime.speakerProtectionPeak) || 0,
          Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
          Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
        );
      }
      const protectedFrame = earProtector.protect(frameOutput.left, frameOutput.right);
      if (protectedFrame.muted) {
        protectionMuteCount += 1;
      }
      const left = nodeGraphClampOutputSample(protectedFrame.left);
      const right = nodeGraphClampOutputSample(protectedFrame.right);
      engineLeftSamples[frame] = left;
      engineRightSamples[frame] = right;
    }
    finishNodeGraphParameterSmoothing(runtime.smoothers, runtime);
  }
  finishNodeGraphRenderedScopeCapture(scopeCapture);
  protectionMuteCount += Number(runtime.speakerProtectionMuteCount) || 0;

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
    clapLatencyFrames,
    clapRenderedTailFrames,
    clapTailFrames,
    clapTailInfinite,
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
    badNumberCount: runtime.badNumberCount || 0,
  };
  if (protectionMuteCount > 0) {
    nodeGraphTripEarProtection({
      nodeId: runtime.lastSpeakerProtection?.nodeId || "",
      protectionPeak: Number(runtime.speakerProtectionPeak) || 0,
      source: "render",
      protectionMuteCount,
    });
    nodeGraphMvp.rendered = null;
    return;
  }
  syncNodeGraphRenderedAudioElement();
  renderStatus.textContent = "render ready";
  renderStatus.className = "pill good";
  setNodeGraphAudioStats(peak, rms, {
    frames: outputFrames,
    sampleRate: outputSampleRate,
    clipCount,
    clapLatencyFrames,
    clapRenderedTailFrames,
    clapTailFrames,
    clapTailInfinite,
    engineSampleRate,
    oversamplingRatio: audio.oversamplingRatio,
    protectionMuteCount,
    stateReadCount,
    badNumberCount: runtime.badNumberCount || 0,
  });
  renderNodeGraphExecutionPlanDebug();
  const outputSummary = document.getElementById("nodeOutputSummary");
  if (outputSummary) {
    outputSummary.textContent = validation.scheduleText;
  }
  drawNodeRenderedAudio();
}
