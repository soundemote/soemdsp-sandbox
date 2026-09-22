function nodeGraphSliderForParameter(node, key) {
  return nodeGraphNodeElement(node)?.querySelector(
    `input[data-param="${CSS.escape(key)}"]`,
  );
}

function nodeGraphNormalizedParameterSignalBounds(signal, metadata = {}) {
  return metadata.wraparound
    ? wrapNodeSliderValue(nodeGraphFiniteNumber(signal), 0, 1)
    : clampNodeSliderValue(nodeGraphFiniteNumber(signal), 0, 1);
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
  const domain = read("offset", 0);
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (type === "knob" || type === "pluginSlider") {
    const range = typeof nodeGraphDspKnobOffsetDomain === "function"
      ? nodeGraphDspKnobOffsetDomain(patchNode)
      : null;
    if (range) {
      const lo = Number(range.min);
      const hi = Number(range.max);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        return domain < lo ? lo : (domain > hi ? hi : domain);
      }
    }
    return domain;
  }
  const ends = typeof nodeGraphDspControllerBiasEnds === "function"
    ? nodeGraphDspControllerBiasEnds(patchNode, "offset")
    : null;
  if (ends) {
    const lo = Number(ends.min);
    const hi = Number(ends.max);
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      return domain < lo ? lo : (domain > hi ? hi : domain);
    }
  }
  return domain;
}

function nodeGraphGhostSliderModSample(sourceNode, sourcePort, depth = 0) {
  const port = String(sourcePort || "").trim();
  const scoped = nodeGraphGhostSliderScopeSample(sourceNode, port);
  if (scoped != null) {
    return scoped;
  }
  const nodeId = String(sourceNode || "").trim();
  if (!nodeId || !port) {
    return null;
  }
  // 1D Phosphor Thru (and other monitor thrus): no scope on Thru — sample In's upstream.
  if (depth < 6 && (port === "Thru" || port === "←")) {
    const sourceType = typeof nodeGraphPatchNodeType === "function"
      ? nodeGraphPatchNodeType(nodeId)
      : "";
    let inPort = "In";
    if (sourceType === "customDisplay") inPort = "In1";
    if (typeof nodeGraphModuleBypassPortMap === "function" && sourceType) {
      const map = nodeGraphModuleBypassPortMap(sourceType) || [];
      for (let i = 0; i < map.length; i += 1) {
        if (String(map[i]?.out || "") === port && map[i]?.in) {
          inPort = String(map[i].in);
          break;
        }
      }
    }
    const conns = nodeGraphMvp?.patch?.connections || [];
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (String(c?.destinationNode || "") !== nodeId) continue;
      if (String(c?.destinationPort || "") !== inPort) continue;
      const up = nodeGraphGhostSliderModSample(c.sourceNode, c.sourcePort, depth + 1);
      if (up != null && Number.isFinite(Number(up))) return up;
    }
    // Face may still have In scope even with no Thru buffer.
    const inScoped = nodeGraphGhostSliderScopeSample(nodeId, inPort);
    if (inScoped != null) return inScoped;
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

function nodeGraphParameterGhostModulationMatches(modulation, patchNode, key) {
  const destNode = String(modulation?.destinationNode || "");
  const destParam = String(modulation?.destinationParam || "");
  const id = String(patchNode?.id || "");
  const param = String(key || "");
  if (!destNode || !destParam || !id || !param) {
    return false;
  }
  if (destNode === id && destParam === param) {
    return true;
  }
  // Root face: cables into an owned child still ghost on the exposed mx_* row.
  if (
    param.startsWith("mx_")
    && typeof nodeGraphMetamoduleResolveExposeTarget === "function"
    && typeof nodeGraphIsContainerShellType === "function"
    && nodeGraphIsContainerShellType(patchNode?.type)
  ) {
    const resolved = nodeGraphMetamoduleResolveExposeTarget(patchNode, param);
    if (
      resolved
      && destNode === String(resolved.childId || "")
      && destParam === String(resolved.paramKey || "")
    ) {
      return true;
    }
  }
  return false;
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
    if (!nodeGraphParameterGhostModulationMatches(modulation, patchNode, key)) {
      continue;
    }
    const sample = nodeGraphGhostSliderModSample(
      modulation.sourceNode,
      modulation.sourcePort,
    );
    if (sample == null) {
      continue;
    }
    let normalized;
    if (typeof nodeGraphParamNormalizeModInput === "function") {
      normalized = nodeGraphParamNormalizeModInput(sample, metadata);
    } else {
      const n = Number(sample);
      normalized = Number.isFinite(n) ? n : 0;
    }
    const srcNode = nodeGraphPatchNode(modulation.sourceNode);
    const srcType = String(srcNode?.type || "");
    const srcPort = String(modulation.sourcePort || "");
    const srcParamMeta = (typeof nodeGraphReadPatchParameterMetadata === "function"
      ? nodeGraphReadPatchParameterMetadata(srcNode, srcPort)
      : null) || {};
    if (typeof nodeGraphNormPitchFrequencyModFromSource === "function") {
      const converted = nodeGraphNormPitchFrequencyModFromSource(
        String(patchNode?.type || ""),
        key,
        srcType,
        srcNode,
        normalized,
      );
      if (converted) {
        sources.push(converted);
        continue;
      }
    }
    const taggedDomain = srcParamMeta.outputDomain === true
      || srcType === "range"
      || srcType === "Range"
      || metadata.outputDomain === true;
    sources.push(taggedDomain ? { value: Number(normalized), domain: true } : normalized);
  }
  if (!sources.length) {
    return null;
  }
  let effective = nodeGraphFiniteNumber(baseDomain);
  if (typeof nodeGraphParamFoldModSources === "function") {
    effective = nodeGraphParamFoldModSources(effective, sources, metadata);
  } else if (typeof nodeGraphApplyParameterModulation === "function") {
    const modSum = sources.reduce((sum, value) => {
      const n = Number(value && typeof value === "object" ? value.value : value);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    effective = nodeGraphApplyParameterModulation(effective, modSum, metadata);
  } else {
    const baseUnit = nodeGraphParameterValueToNormalizedSignal(effective, metadata);
    const contrib = sources.reduce((sum, value) => {
      const n = Number(value && typeof value === "object" ? value.value : value);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return {
      signal: nodeGraphNormalizedParameterSignalBounds(baseUnit + contrib, metadata),
      effectiveDomain: effective,
    };
  }
  // Ghost position uses unit mapped into min/max zoom window (may clip visually).
  // effectiveDomain is the value actually sent (unclipped under domain REPLACE).
  let signal;
  if (typeof nodeGraphParamDomainToUnit === "function") {
    signal = nodeGraphNormalizedParameterSignalBounds(
      nodeGraphParamDomainToUnit(effective, metadata),
      metadata,
    );
  } else {
    signal = nodeGraphNormalizedParameterSignalBounds(
      nodeGraphParameterValueToNormalizedSignal(effective, metadata),
      metadata,
    );
  }
  return { signal, effectiveDomain: effective };
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
    const ghost = nodeGraphParameterGhostSignal(node, key);
    const ghostSignal = ghost && typeof ghost === "object" && "signal" in ghost
      ? ghost.signal
      : ghost;
    readout.classList.toggle("has-ghost-slider", ghostSignal !== null);
    if (ghostSignal === null) {
      readout.style.removeProperty("--ghost-start");
      readout.style.removeProperty("--ghost-end");
      delete slider.dataset.sentDomainValue;
      continue;
    }
    any = true;
    // Keep sentDomainValue for diagnostics only. Do not rewrite the readout
    // number or thumb — those stay on editable domainValue; ghost CSS shows sent.
    if (ghost && typeof ghost === "object" && Number.isFinite(Number(ghost.effectiveDomain))) {
      slider.dataset.sentDomainValue = String(ghost.effectiveDomain);
    }
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
    // Live mod ghosts share Simulation FPS. Mouse drag / input call
    // syncNodeGraphGhostSliders() directly (ungated) for immediate feedback.
    if (
      typeof nodeGraphSimFpsShouldPaint === "function"
      && !nodeGraphSimFpsShouldPaint("__ghost-sliders", false)
    ) {
      if (typeof nodeGraphSimFpsRate === "function" && !(nodeGraphSimFpsRate() > 0)) {
        return;
      }
      scheduleNodeGraphGhostSlidersFromLive();
      return;
    }
    syncNodeGraphGhostSliders();
  });
}

if (typeof addNodeGraphModuleScopeSnapshotListener === "function") {
  addNodeGraphModuleScopeSnapshotListener(scheduleNodeGraphGhostSlidersFromLive);
}
