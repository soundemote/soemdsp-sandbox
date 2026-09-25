// Toggle and momentary faces. Same Bias parameter as Knob.
// Toggle writes min or max. Momentary writes max while held, min on release.
// The on-color follows the Bias smoother (same time and curve as the audio
// parameter). There is no separate hover or CSS fade.

function nodeGraphPluginWriteParamValue(nodeId, key, value, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id || !key) return;
  if (
    window.soemdspPerformMode
    && key === "offset"
    && window.soemdspPerform
    && typeof window.soemdspPerform._handleControllerWrite === "function"
  ) {
    const pluginId = window.soemdspPerform._pluginIdForNodeId
      ? window.soemdspPerform._pluginIdForNodeId(id)
      : null;
    if (pluginId != null) {
      const status = String(options?.status || "");
      let phase = "set";
      if (status === "momentary") {
        // Momentary writes max on press and min on release — map to begin/end.
        const unit = typeof window.soemdspPerform._handleControllerWrite === "function"
          ? null
          : null;
        const metaHigh = typeof nodeGraphControllerBiasAtHighThrow === "function"
          ? nodeGraphControllerBiasAtHighThrow(id, value)
          : Number(value) > 0;
        phase = metaHigh ? "begin" : "end";
      } else if (status === "toggle") {
        phase = "set";
      }
      if (window.soemdspPerform._handleControllerWrite(id, value, phase)) {
        // Paint already done inside handle; still refresh button face chrome.
        return;
      }
    }
  }
  const numeric = Number(value);
  const slider = document.getElementById(`node-${id}-${key}`);
  if (slider) {
    if (Number.isFinite(numeric)) {
      slider.dataset.domainValue = String(numeric);
    }
    if (typeof setNodeSliderValue === "function" && Number.isFinite(numeric)) {
      setNodeSliderValue(slider, numeric, {
        record: Boolean(options.record),
        status: options.status || "controller",
      });
    } else {
      slider.value = String(value);
      if (typeof applyNodeGraphInputUnboundedValue === "function") {
        applyNodeGraphInputUnboundedValue(slider, Number.isFinite(numeric) ? numeric : value);
      }
      if (typeof syncNodeGraphPatchParameterFromSlider === "function") {
        syncNodeGraphPatchParameterFromSlider(slider, {
          domainValue: Number.isFinite(numeric) ? numeric : undefined,
          record: Boolean(options.record),
          status: options.status || "controller",
        });
      }
    }
    if (typeof scheduleNodeGraphLiveParameterSync === "function") {
      scheduleNodeGraphLiveParameterSync();
    }
    if (typeof scheduleNodeGraphGhostSlidersFromLive === "function") {
      scheduleNodeGraphGhostSlidersFromLive();
    }
    return;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (patchNode) {
    if (!patchNode.params || typeof patchNode.params !== "object") patchNode.params = {};
    patchNode.params[key] = Number.isFinite(numeric) ? numeric : value;
    if (typeof scheduleNodeGraphLiveParameterSync === "function") {
      scheduleNodeGraphLiveParameterSync();
    }
  }
}

function nodeGraphPluginReadParamDom(nodeId, key, fallback = 0) {
  const slider = document.getElementById(`node-${nodeId}-${key}`);
  if (slider) {
    const domain = Number(slider.dataset?.domainValue);
    if (Number.isFinite(domain)) return domain;
    const n = Number(slider.value);
    if (Number.isFinite(n)) return n;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const stored = Number(patchNode?.params?.[key]);
  return Number.isFinite(stored) ? stored : fallback;
}

function nodeGraphControllerBiasMeta(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (typeof nodeGraphKnobFaceOffsetMetadata === "function") {
    return nodeGraphKnobFaceOffsetMetadata(patchNode);
  }
  const raw = patchNode?.paramMeta?.offset;
  return raw && typeof raw === "object" ? raw : { min: 0, max: 1 };
}

function nodeGraphControllerBiasAtHighThrow(nodeId, value) {
  return nodeGraphParamControlPosition(value, nodeGraphControllerBiasMeta(nodeId)) >= 0.5;
}

function nodeGraphControllerBiasEnd(nodeId, high) {
  return nodeGraphParamDomainFromControlPosition(high ? 1 : 0, nodeGraphControllerBiasMeta(nodeId));
}

function nodeGraphControllerFaceSampleRate() {
  if (typeof nodeGraphSmoothingSampleRate === "function") {
    const rate = Number(nodeGraphSmoothingSampleRate());
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return 44100;
}

function nodeGraphControllerFaceSmoothingType(meta) {
  const raw = meta?.smoothingType;
  if (raw != null && String(raw).trim() !== "" && typeof normalizeNodeGraphParameterSmootherFilterType === "function") {
    return normalizeNodeGraphParameterSmootherFilterType(raw);
  }
  if (meta?.linearSmoothing === false) return "none";
  const key = String(raw || "").trim();
  if (key === "none" || key === "off" || key === "instant") return "none";
  if (key === "linear" || key === "L" || key === "lerp") return "linear";
  return key || "onePole";
}

function nodeGraphControllerFaceSmoothingSeconds(meta) {
  const mode = typeof nodeSmoothingModeNormalize === "function"
    ? nodeSmoothingModeNormalize(meta?.smoothingMode)
    : String(meta?.smoothingMode || "internal");
  // Off ≡ Internal with samples 0.
  if (mode === "off" || mode === "blockSize") return 0;
  const rate = nodeGraphControllerFaceSampleRate();
  const raw = Number(meta?.smoothingSeconds);
  // Dual encoding: (0,1)=seconds, ≥1=sample counts. Samples ≤ 1 = instant.
  let internalSamples = 0;
  if (Number.isFinite(raw) && raw > 0) {
    internalSamples = (raw > 0 && raw < 1)
      ? Math.max(1, Math.round(raw * rate))
      : Math.max(0, Math.round(raw));
  }
  if (internalSamples <= 1) {
    internalSamples = 0;
  }
  const internal = internalSamples > 0 ? internalSamples / rate : 0;
  const globalSeconds = Number(nodeGraphMvp?.live?.autoSmoothingSeconds);
  const globalSafe = Number.isFinite(globalSeconds) && globalSeconds > 0 ? globalSeconds : 0;
  if (mode === "global") return globalSafe;
  if (mode === "internalGlobal") return Math.max(0, internal) + globalSafe;
  return Math.max(0, internal);
}

/** Bias as the audio smoother currently has it. Not a UI timer. */
function nodeGraphControllerFaceChasedBias(nodeId, target) {
  const meta = nodeGraphControllerBiasMeta(nodeId);
  const type = nodeGraphControllerFaceSmoothingType(meta);
  const seconds = nodeGraphControllerFaceSmoothingSeconds(meta);
  const now = performance.now();
  const key = String(nodeId || "");
  let state = nodeGraphControllerFaceChasedBias._states.get(key);
  if (!state) {
    state = { value: target, lastNow: now, smoother: null, type: "" };
    nodeGraphControllerFaceChasedBias._states.set(key, state);
  }
  const dt = Math.max(0, Math.min(0.25, (now - state.lastNow) / 1000));
  state.lastNow = now;
  const snap = type === "none" || !(seconds > 0) || typeof nodeGraphParameterSmootherFilterAdvance !== "function";
  if (snap) {
    state.value = target;
    state.smoother = null;
    state.settled = true;
    return target;
  }
  if (!state.smoother || state.type !== type) {
    const start = Number.isFinite(state.value) ? state.value : target;
    const signal = typeof nodeGraphParamValueToNormalizedSignal === "function"
      ? nodeGraphParamValueToNormalizedSignal(start, meta)
      : start;
    state.smoother = { smoothingType: type, metadata: meta, outputBuffer: signal, filterState: null };
    state.type = type;
  }
  state.smoother.metadata = meta;
  state.smoother.smoothingType = type;
  const targetSignal = typeof nodeGraphParamValueToNormalizedSignal === "function"
    ? nodeGraphParamValueToNormalizedSignal(target, meta)
    : target;
  const rate = nodeGraphControllerFaceSampleRate();
  const frames = Math.max(1, Math.round(dt * rate));
  const signal = nodeGraphParameterSmootherFilterAdvance(state.smoother, targetSignal, 1 / seconds, rate, frames);
  const value = typeof nodeGraphParamNormalizedSignalToValue === "function"
    ? nodeGraphParamNormalizedSignalToValue(signal, meta)
    : signal;
  state.value = Number.isFinite(value) ? value : target;
  state.settled = Math.abs(state.value - target) <= 1e-4;
  return state.value;
}
nodeGraphControllerFaceChasedBias._states = new Map();

function nodeGraphControllerShownBias(nodeId, patchNode) {
  const target = nodeGraphPluginReadParamDom(nodeId, "offset", 0);
  const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
    ? nodeGraphDspControllerDisplayIsMouse(patchNode)
    : true;
  if (!wantsMouse && typeof nodeGraphModuleScopeLatestOutputValue === "function") {
    const live = Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "Bias", Number.NaN));
    if (Number.isFinite(live)) return live;
  }
  return target;
}

function createNodeGraphToggleButtonFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-plugin-toggle-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type;

  const label = document.createElement("span");
  label.className = "node-plugin-button-label";
  label.dataset.pluginBtnLabel = "true";
  label.hidden = true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "node-plugin-toggle-button";
  btn.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} toggle`);
  const btnText = document.createElement("span");
  btnText.className = "btn-fit";
  btn.append(btnText);

  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
      ? nodeGraphDspControllerDisplayIsMouse(patchNode)
      : true;
    const target = nodeGraphPluginReadParamDom(node, "offset", 0);
    const chased = nodeGraphControllerFaceChasedBias(node, target);
    const unit = nodeGraphParamControlPosition(chased, nodeGraphControllerBiasMeta(node));
    const mix = Number.isFinite(unit) ? Math.max(0, Math.min(1, unit)) : 0;
    btn.style.setProperty("--plugin-btn-value", String(mix));
    face._pluginBtnChaseActive = nodeGraphControllerFaceChasedBias._states.get(String(node))?.settled === false;
    const shown = wantsMouse ? chased : nodeGraphControllerShownBias(node, patchNode);
    const on = nodeGraphControllerBiasAtHighThrow(node, shown);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "Off", on: "On" };
    btnText.textContent = (on ? labels.on : labels.off) || "";
    face._pluginBtnPaintLook?.();
  };

  btn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
  });
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = nodeGraphPluginReadParamDom(node, "offset", 0);
    const next = nodeGraphControllerBiasEnd(node, !nodeGraphControllerBiasAtHighThrow(node, current));
    nodeGraphPluginWriteParamValue(node, "offset", next, { record: true, status: "toggle" });
    sync();
    face._pluginBtnKickChase?.();
  });
  face.append(btn, label);
  face.syncFromParameters = sync;
  const chase = () => {
    if (!face.isConnected) return;
    sync();
    if (face._pluginBtnChaseActive) {
      face._pluginBtnChaseRaf = requestAnimationFrame(chase);
    } else {
      face._pluginBtnChaseRaf = 0;
    }
  };
  face._pluginBtnKickChase = () => {
    if (face._pluginBtnChaseRaf) return;
    face._pluginBtnChaseRaf = requestAnimationFrame(chase);
  };
  if (typeof nodeGraphPluginButtonBindLook === "function") {
    nodeGraphPluginButtonBindLook(face, node);
  }
  requestAnimationFrame(sync);
  return face;
}

function createNodeGraphMomentaryButtonFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-plugin-momentary-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type;

  const label = document.createElement("span");
  label.className = "node-plugin-button-label";
  label.dataset.pluginBtnLabel = "true";
  label.hidden = true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "node-plugin-momentary-button";
  btn.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} momentary`);
  const btnText = document.createElement("span");
  btnText.className = "btn-fit";
  btn.append(btnText);

  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const target = nodeGraphPluginReadParamDom(node, "offset", 0);
    const chased = nodeGraphControllerFaceChasedBias(node, target);
    const unit = nodeGraphParamControlPosition(chased, nodeGraphControllerBiasMeta(node));
    const mix = Number.isFinite(unit) ? Math.max(0, Math.min(1, unit)) : 0;
    btn.style.setProperty("--plugin-btn-value", String(mix));
    face._pluginBtnChaseActive = nodeGraphControllerFaceChasedBias._states.get(String(node))?.settled === false;
    const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
      ? nodeGraphDspControllerDisplayIsMouse(patchNode)
      : true;
    const shown = wantsMouse ? chased : nodeGraphControllerShownBias(node, patchNode);
    const down = nodeGraphControllerBiasAtHighThrow(node, shown);
    btn.classList.toggle("is-down", down);
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "Off", on: "On" };
    btnText.textContent = (down ? labels.on : labels.off) || "";
    face._pluginBtnPaintLook?.();
  };

  const setDown = (down) => {
    nodeGraphPluginWriteParamValue(node, "offset", nodeGraphControllerBiasEnd(node, down), {
      record: false,
      status: "momentary",
    });
    btn.classList.toggle("is-held", Boolean(down));
    sync();
    face._pluginBtnKickChase?.();
  };

  btn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    btn.setPointerCapture?.(event.pointerId);
    setDown(true);
    face._pluginBtnKickChase?.();
  });
  const release = (event) => {
    if (event && btn.hasPointerCapture?.(event.pointerId)) {
      btn.releasePointerCapture(event.pointerId);
    }
    setDown(false);
  };
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("lostpointercapture", () => setDown(false));

  face.append(btn, label);
  face.syncFromParameters = sync;
  const chase = () => {
    if (!face.isConnected) return;
    sync();
    if (face._pluginBtnChaseActive) {
      face._pluginBtnChaseRaf = requestAnimationFrame(chase);
    } else {
      face._pluginBtnChaseRaf = 0;
    }
  };
  face._pluginBtnKickChase = () => {
    if (face._pluginBtnChaseRaf) return;
    face._pluginBtnChaseRaf = requestAnimationFrame(chase);
  };
  if (typeof nodeGraphPluginButtonBindLook === "function") {
    nodeGraphPluginButtonBindLook(face, node);
  }
  requestAnimationFrame(sync);
  return face;
}

