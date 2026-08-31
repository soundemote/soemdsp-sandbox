function nodeGraphSliderForParameter(node, key) {
  return nodeGraphNodeElement(node)?.querySelector(
    `input[data-param="${CSS.escape(key)}"]`,
  );
}

function nodeGraphNormalizedParameterSignalBounds(signal, metadata = {}) {
  return metadata.wraparound
    ? wrapNodeSliderValue(Number(signal) || 0, 0, 1)
    : clampNodeSliderValue(Number(signal) || 0, 0, 1);
}

/** Last posted scope sample for `nodeId:port` only — never fall back to Out. */
function nodeGraphGhostSliderScopeSample(nodeId, port) {
  const id = String(nodeId || "").trim();
  const name = String(port || "").trim();
  if (!id || !name || typeof nodeGraphModuleScopeState === "undefined") {
    return null;
  }
  const buffer = nodeGraphModuleScopeState?.buffers?.get?.(`${id}:${name}`);
  if (!buffer?.length) {
    return null;
  }
  const sample = Number(buffer[buffer.length - 1]);
  return Number.isFinite(sample) ? sample : null;
}

/**
 * Cheap MOD sample for a ghost: last scope frame if we already have it,
 * else a parameter port's current slider (unit-mapped like the engine).
 * Does not request new capture — no extra buffers.
 */
function nodeGraphGhostSliderControllerOutSample(nodeId, port) {
  const p = String(port || "").trim();
  if (p !== "Out" && p !== "Bias") {
    return null;
  }
  const type = typeof nodeGraphPatchNodeType === "function"
    ? nodeGraphPatchNodeType(nodeId)
    : "";
  if (
    type !== "toggleButton"
    && type !== "momentaryButton"
    && type !== "knob"
    && type !== "pluginSlider"
  ) {
    return null;
  }
  // Prefer live Bias/Out when scope has it (efficient peel / full JS).
  if (typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, p, Number.NaN));
    if (Number.isFinite(live)) {
      return live;
    }
    if (p === "Out") {
      const bias = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "Bias", Number.NaN));
      if (Number.isFinite(bias)) return bias;
    }
  }
  const read = (key, fallback) => {
    const n = typeof nodeGraphReadNodeNumber === "function"
      ? Number(nodeGraphReadNodeNumber(nodeId, key))
      : Number.NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  // Knob: hidden control is `offset` (domain). Plugin slider: `value`.
  // Toggle/momentary: unit `value` mapped through Min/Max.
  if (type === "knob" || type === "pluginSlider") {
    const domain = type === "knob" ? read("offset", 0) : read("value", 0);
    const rangeMin = read("rangeMin", type === "pluginSlider" ? -1 : 0);
    const rangeMax = read("rangeMax", 1);
    const polarity = read("polarity", 0);
    if (typeof nodeGraphDspControllerRange === "function") {
      const range = nodeGraphDspControllerRange(rangeMin, rangeMax, polarity);
      const lo = Number(range.min);
      const hi = Number(range.max);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        return domain < lo ? lo : (domain > hi ? hi : domain);
      }
    }
    return domain;
  }
  const unit = read("value", 0);
  const rangeMin = read("rangeMin", 0);
  const rangeMax = read("rangeMax", 1);
  if (typeof nodeGraphDspControllerUnitToRange === "function") {
    return nodeGraphDspControllerUnitToRange(unit, rangeMin, rangeMax);
  }
  const t = unit < 0 ? 0 : (unit > 1 ? 1 : unit);
  return rangeMin + (rangeMax - rangeMin) * t;
}

function nodeGraphGhostSliderModSample(sourceNode, sourcePort) {
  const port = String(sourcePort || "").trim();
  const scoped = nodeGraphGhostSliderScopeSample(sourceNode, port);
  if (scoped != null) {
    return scoped;
  }
  const nodeId = String(sourceNode || "").trim();
  if (!nodeId || !port) {
    return null;
  }
  const fromController = nodeGraphGhostSliderControllerOutSample(nodeId, port);
  if (fromController != null && Number.isFinite(fromController)) {
    return fromController;
  }
  const sourceType = typeof nodeGraphPatchNodeType === "function"
    ? nodeGraphPatchNodeType(nodeId)
    : null;
  if (!sourceType || typeof nodeGraphParameterOutputPort !== "function") {
    return null;
  }
  if (!nodeGraphParameterOutputPort(sourceType, port)) {
    // Audio/CV with no posted frame yet — skip rather than invent a value.
    const loose = nodeGraphModuleScopeState?.buffers?.get?.(nodeId);
    if (loose?.length) {
      const sample = Number(loose[loose.length - 1]);
      if (Number.isFinite(sample)) {
        return sample;
      }
    }
    return null;
  }
  const sourceSlider = nodeGraphSliderForParameter(nodeId, port);
  const domain = sourceSlider
    ? nodeGraphReadNodeNumber(nodeId, port)
    : nodeGraphReadPatchParameterValue(nodeId, port);
  if (!Number.isFinite(Number(domain))) {
    return null;
  }
  const sourceMeta = nodeGraphReadPatchParameterMetadata(nodeId, port);
  if (typeof nodeGraphParamDomainToModOutput === "function") {
    return nodeGraphParamDomainToModOutput(domain, sourceMeta);
  }
  if (typeof normalizeNodeGraphParameterOutputValue === "function") {
    return normalizeNodeGraphParameterOutputValue(domain, sourceMeta);
  }
  return nodeGraphParameterValueToNormalizedSignal(domain, sourceMeta);
}

function nodeGraphParameterGhostSignal(node, key) {
  const patchNode = nodeGraphPatchNode(node);
  if (!patchNode) {
    return null;
  }
  const metadata = nodeGraphReadPatchParameterMetadata(patchNode, key) || {};
  const targetSlider = nodeGraphSliderForParameter(node, key);
  const baseDomain = targetSlider
    ? nodeGraphReadNodeNumber(node, key)
    : nodeGraphReadPatchParameterValue(patchNode, key);
  const sources = [];
  for (const modulation of nodeGraphMvp.patch.modulations || []) {
    if (modulation.destinationNode !== node || modulation.destinationParam !== key) {
      continue;
    }
    const sample = nodeGraphGhostSliderModSample(
      modulation.sourceNode,
      modulation.sourcePort,
    );
    if (sample == null) {
      continue;
    }
    if (typeof nodeGraphParamNormalizeModInput === "function") {
      sources.push(nodeGraphParamNormalizeModInput(sample, metadata));
    } else {
      const n = Number(sample);
      sources.push(Number.isFinite(n) ? n : 0);
    }
  }
  if (!sources.length) {
    return null;
  }
  let effective = Number(baseDomain) || 0;
  if (typeof nodeGraphParamFoldModSources === "function") {
    effective = nodeGraphParamFoldModSources(effective, sources, metadata);
  } else if (typeof nodeGraphApplyParameterModulation === "function") {
    effective = nodeGraphApplyParameterModulation(
      effective,
      sources.reduce((sum, value) => sum + value, 0),
      metadata,
    );
  } else {
    const baseUnit = nodeGraphParameterValueToNormalizedSignal(effective, metadata);
    const contrib = sources.reduce((sum, value) => sum + value, 0);
    return nodeGraphNormalizedParameterSignalBounds(baseUnit + contrib, metadata);
  }
  if (typeof nodeGraphParamDomainToUnit === "function") {
    return nodeGraphNormalizedParameterSignalBounds(
      nodeGraphParamDomainToUnit(effective, metadata),
      metadata,
    );
  }
  return nodeGraphNormalizedParameterSignalBounds(
    nodeGraphParameterValueToNormalizedSignal(effective, metadata),
    metadata,
  );
}

let nodeGraphGhostSliderLiveFrame = 0;
let nodeGraphGhostSliderHadAny = false;

function syncNodeGraphGhostSliders() {
  const mods = nodeGraphMvp?.patch?.modulations;
  if (!mods?.length) {
    if (!nodeGraphGhostSliderHadAny) {
      return;
    }
    for (const readout of document.querySelectorAll(".node-slider-readout.has-ghost-slider")) {
      readout.classList.remove("has-ghost-slider");
      readout.style.removeProperty("--ghost-start");
      readout.style.removeProperty("--ghost-end");
    }
    nodeGraphGhostSliderHadAny = false;
    return;
  }
  let any = false;
  for (const slider of document.querySelectorAll(".dsp-node input[data-param]")) {
    if (
      typeof nodeGraphElementInSkippedContentVisibility === "function"
      && nodeGraphElementInSkippedContentVisibility(slider)
    ) {
      continue;
    }
    const node = slider.closest(".dsp-node")?.dataset.node;
    const key = slider.dataset.param;
    const readout = slider.closest("label")?.querySelector(".node-slider-readout");
    if (!node || !key || !readout) {
      continue;
    }
    const ghostSignal = nodeGraphParameterGhostSignal(node, key);
    readout.classList.toggle("has-ghost-slider", ghostSignal !== null);
    if (ghostSignal === null) {
      readout.style.removeProperty("--ghost-start");
      readout.style.removeProperty("--ghost-end");
      continue;
    }
    any = true;
    const range = nodeSliderHandleRangeFromTravel(
      slider,
      readout,
      clampNodeSliderValue(ghostSignal, 0, 1),
    );
    readout.style.setProperty("--ghost-start", `${range.start}px`);
    readout.style.setProperty("--ghost-end", `${range.end}px`);
  }
  nodeGraphGhostSliderHadAny = any;
}

function scheduleNodeGraphGhostSlidersFromLive() {
  if (nodeGraphGhostSliderLiveFrame) {
    return;
  }
  nodeGraphGhostSliderLiveFrame = window.requestAnimationFrame(() => {
    nodeGraphGhostSliderLiveFrame = 0;
    syncNodeGraphGhostSliders();
  });
}

if (typeof addNodeGraphModuleScopeSnapshotListener === "function") {
  addNodeGraphModuleScopeSnapshotListener(scheduleNodeGraphGhostSlidersFromLive);
}
