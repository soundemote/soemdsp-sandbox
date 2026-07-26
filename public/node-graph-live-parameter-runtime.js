// Thin wrapper over the stdlib helper -- kept because this short name is used
// throughout the live/render evaluator lane.
function readNodeGraphLiveParam(node, key, fallback = 0) {
  return nodeGraphNodeParamNumber(node, key, fallback);
}

function readNodeGraphLiveSmoothedParam(runtime, node, key, fallback, frame, frames) {
  const smoother = runtime.smoothers.get(nodeGraphParameterKey(node?.id, key));
  if (!smoother) {
    return readNodeGraphLiveParam(node, key, fallback);
  }
  return readNodeGraphSmoothedParameter(smoother, frame, frames);
}

function nodeGraphApplyParameterBounds(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  if (metadata.unboundedMin && metadata.unboundedMax) {
    return value;
  }
  if (metadata.unboundedMin && Number.isFinite(max)) {
    return Math.min(value, max);
  }
  if (metadata.unboundedMax && Number.isFinite(min)) {
    return Math.max(value, min);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return value;
  }
  return metadata.wraparound
    ? wrapNodeSliderValue(value, min, max)
    : clampNodeSliderValue(value, min, max);
}

function readNodeGraphRuntimeOutput(runtime, frameValues, nodeId, port = "Out") {
  const tailInputFrames = Number(runtime.tailInputFrames);
  const absoluteFrame = Number(runtime.absoluteFrame);
  const tailSilencedNodeIds = runtime.tailSilencedNodeIds;
  if (
    Number.isFinite(tailInputFrames) &&
    Number.isFinite(absoluteFrame) &&
    absoluteFrame >= tailInputFrames &&
    tailSilencedNodeIds?.has(nodeId)
  ) {
    return 0;
  }
  const output = frameValues?.has(nodeId)
    ? frameValues.get(nodeId)
    : runtime.nodeOutputs?.get(nodeId);
  if (output && typeof output === "object") {
    return Number(output[port] ?? output.Out ?? 0);
  }
  return output === undefined || output === null ? 0 : Number(output);
}

function normalizeNodeGraphParameterOutputValue(value, metadata = {}) {
  return nodeGraphParameterValueToNormalizedSignal(value, metadata);
}

function normalizeNodeGraphParameterModulationInput(value, metadata = {}) {
  const number = Number(value) || 0;
  return normalizeNodeMetadataKind(metadata.kind) === "frequency" && metadata.nonlinearSlider
    ? clampNodeSliderValue(number, -1, 1)
    : clampNodeSliderValue(number, 0, 1);
}

function nodeGraphParameterSkewExponent(metadata = {}) {
  if (!metadata.nonlinearSlider) {
    return 1;
  }
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const mid = Number(metadata.mid);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(mid)) {
    return 1;
  }
  const normalizedMid = clampNodeSliderValue((mid - min) / range, 0.000001, 0.999999);
  return Math.log(normalizedMid) / Math.log(0.5);
}

function nodeGraphParameterValueToNormalizedSignal(value, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return 0;
  }
  const bounded = metadata.wraparound
    ? wrapNodeSliderValue(Number(value) || 0, min, max)
    : clampNodeSliderValue(Number(value) || 0, min, max);
  const normalizedValue = clampNodeSliderValue((bounded - min) / range, 0, 1);
  return clampNodeSliderValue(
    normalizedValue ** (1 / nodeGraphParameterSkewExponent(metadata)),
    0,
    1,
  );
}

function nodeGraphNormalizedSignalToParameterValue(signal, metadata = {}) {
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    return Number.isFinite(min) ? min : 0;
  }
  const normalizedSignal = metadata.wraparound
    ? wrapNodeSliderValue(Number(signal) || 0, 0, 1)
    : clampNodeSliderValue(Number(signal) || 0, 0, 1);
  const normalizedValue = normalizedSignal ** nodeGraphParameterSkewExponent(metadata);
  return nodeGraphApplyParameterBounds(min + range * normalizedValue, metadata);
}

function nodeGraphApplyParameterModulation(base, modulationSignal, metadata = {}) {
  if (normalizeNodeMetadataKind(metadata.kind) === "frequency" && metadata.nonlinearSlider) {
    const baseFrequency = Math.max(0.000001, Number(base) || 0.000001);
    const octaves = (Number(modulationSignal) || 0) / 0.1;
    return nodeGraphApplyParameterBounds(baseFrequency * (2 ** octaves), metadata);
  }
  const baseSignal = nodeGraphParameterValueToNormalizedSignal(base, metadata);
  return nodeGraphNormalizedSignalToParameterValue(baseSignal + modulationSignal, metadata);
}

function readNodeGraphRuntimePortOutput(runtime, frameValues, nodeId, port = "Out", frame = 0, frames = 1) {
  const node = runtime.nodes?.get(nodeId);
  const parameter = nodeGraphParameterOutputPort(node, port);
  if (!parameter) {
    return readNodeGraphRuntimeOutput(runtime, frameValues, nodeId, port);
  }
  const metadata = node?.paramMeta?.[port] || {};
  const value = readNodeGraphLiveSmoothedParam(
    runtime,
    node,
    port,
    nodeGraphParameterFallback(node?.type, port),
    frame,
    frames,
  );
  return normalizeNodeGraphParameterOutputValue(value, metadata);
}

function readNodeGraphLiveEffectiveParam(
  runtime,
  node,
  key,
  fallback,
  frame,
  frames,
  frameValues,
) {
  const base = readNodeGraphLiveSmoothedParam(runtime, node, key, fallback, frame, frames);
  const modulations = runtime.modulationConnections?.get(nodeGraphParameterKey(node?.id, key));
  // See node-live-audio-worklet-core.js readEffectiveParameter: skip the
  // normalize/denormalize round trip (Math.log-based skew math) entirely
  // when nothing modulates this parameter, instead of paying it every
  // sample for every parameter regardless.
  if (!modulations || !modulations.length) {
    return base;
  }
  const metadata = node?.paramMeta?.[key] || {};
  const modulationSignal = modulations.reduce(
    (sum, modulation) =>
      sum + normalizeNodeGraphParameterModulationInput(readNodeGraphRuntimePortOutput(
        runtime,
        frameValues,
        modulation.sourceNode,
        modulation.sourcePort,
        frame,
        frames,
      ), metadata),
    0,
  );
  return nodeGraphApplyParameterModulation(base, modulationSignal, metadata);
}
