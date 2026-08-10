// Thin wrappers over param-surface helpers + smoother state.
// Canonical MOD/DOMAIN math: node-graph-param-surface-helpers.js (Phase F).

// Thin wrapper over the stdlib helper -- kept because this short name is used
// throughout the live/render evaluator lane.
function readNodeGraphLiveParam(node, key, fallback = 0) {
  return nodeGraphNodeParamNumber(node, key, fallback);
}

function readNodeGraphLiveSmoothedParam(runtime, node, key, fallback, frame, frames) {
  const smootherKey = nodeGraphParameterKey(node?.id, key);
  const smoother = runtime.smoothers.get(smootherKey);
  if (!smoother) {
    return readNodeGraphLiveParam(node, key, fallback);
  }
  return readNodeGraphSmoothedParameter(smoother, frame, frames, runtime, smootherKey);
}

function nodeGraphApplyParameterBounds(value, metadata = {}) {
  // DOMAIN: min/max are slider guides unless wraparound / resource constraint / hardClamp.
  if (typeof nodeGraphParamApplyDomainBounds === "function") {
    return nodeGraphParamApplyDomainBounds(value, metadata);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (metadata.wraparound) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      return wrapNodeSliderValue(n, min, max);
    }
  }
  const c = String(metadata.constraint || "").toLowerCase();
  const hard = metadata.hardClamp === true
    || c === "cpu" || c === "gpu" || c === "ram" || c === "memory";
  if (!hard) return n;
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return n;
  return clampNodeSliderValue(n, min, max);
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

/** DOMAIN → unit (parameter port used as a bus source). */
function normalizeNodeGraphParameterOutputValue(value, metadata = {}) {
  if (typeof nodeGraphParamDomainToModOutput === "function") {
    return nodeGraphParamDomainToModOutput(value, metadata);
  }
  return nodeGraphParameterValueToNormalizedSignal(value, metadata);
}

/** MOD surface: raw sample in domain units (no unit clamp). */
function normalizeNodeGraphParameterModulationInput(value, metadata = {}) {
  if (typeof nodeGraphParamNormalizeModInput === "function") {
    return nodeGraphParamNormalizeModInput(value, metadata);
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nodeGraphParameterSkewExponent(metadata = {}) {
  if (typeof nodeGraphParamSkewExponent === "function") {
    return nodeGraphParamSkewExponent(metadata);
  }
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
  if (typeof nodeGraphParamDomainToUnit === "function") {
    return nodeGraphParamDomainToUnit(value, metadata);
  }
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
  if (typeof nodeGraphParamUnitToDomain === "function") {
    return nodeGraphParamUnitToDomain(signal, metadata);
  }
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

/** DOMAIN + MOD → effective domain (linear unit map / absolute hybrid SSOT). */
function nodeGraphApplyParameterModulation(base, modulationSignal, metadata = {}) {
  if (typeof nodeGraphParamApplyMod === "function") {
    return nodeGraphParamApplyMod(base, modulationSignal, metadata);
  }
  // Fallback mirrors nodeGraphParamApplyMod (linear unit, no skew).
  const baseN = Number(base);
  const b = Number.isFinite(baseN) ? baseN : 0;
  let mod = Number(modulationSignal);
  if (!Number.isFinite(mod)) {
    mod = 0;
  }
  const bipolar = metadata && Object.hasOwn(metadata, "bipolar")
    ? Boolean(metadata.bipolar)
    : (Number(metadata?.min) < 0 && Number(metadata?.max) > 0);
  if (!bipolar) {
    mod = Math.max(0, mod);
  }
  const min = Number(metadata.min);
  const max = Number(metadata.max);
  const range = max - min;
  if (Number.isFinite(range) && range > 0 && Math.abs(mod) <= 1 + 1e-9) {
    const baseUnit = (b - min) / range;
    const unit = baseUnit + mod;
    const result = min + unit * range;
    return Number.isFinite(result) ? result : 0;
  }
  let result = b + mod;
  if (!Number.isFinite(result)) {
    return 0;
  }
  let shouldClamp = false;
  if (Object.hasOwn(metadata, "modClamp")) {
    shouldClamp = Boolean(metadata.modClamp);
  } else if (metadata.wraparound || metadata.hardClamp === true) {
    shouldClamp = true;
  } else {
    const c = String(metadata.constraint || "").toLowerCase();
    shouldClamp = c === "cpu" || c === "gpu" || c === "ram" || c === "memory";
  }
  return shouldClamp ? nodeGraphApplyParameterBounds(result, metadata) : result;
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
  // Skip unit-space round trip when nothing modulates this parameter.
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
