// Plugin control faces: Toggle, Momentary (Bias). Knob/Slider look is knob-face.js.

function nodeGraphPluginWriteParamValue(nodeId, key, value, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id || !key) return;
  const numeric = Number(value);
  const slider = document.getElementById(`node-${id}-${key}`);
  if (slider) {
    if (Number.isFinite(numeric)) {
      slider.dataset.domainValue = String(numeric);
    }
    slider.value = String(value);
    if (typeof applyNodeGraphInputUnboundedValue === "function") {
      applyNodeGraphInputUnboundedValue(slider, Number.isFinite(numeric) ? numeric : value);
    }
    if (typeof syncNodeGraphPatchParameterFromSlider === "function") {
      syncNodeGraphPatchParameterFromSlider(slider, {
        domainValue: Number.isFinite(numeric) ? numeric : undefined,
        record: Boolean(options.record),
        status: options.status || "plugin control",
      });
    } else {
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      if (options.record) {
        slider.dispatchEvent(new Event("change", { bubbles: true }));
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
  if (!patchNode) return;
  patchNode.params = { ...(patchNode.params || {}), [key]: String(value) };
  if (typeof scheduleNodeGraphLiveParameterSync === "function") {
    scheduleNodeGraphLiveParameterSync();
  }
  if (options.record && typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  if (typeof scheduleNodeGraphGhostSlidersFromLive === "function") {
    scheduleNodeGraphGhostSlidersFromLive();
  }
}

function nodeGraphPluginReadParamDom(nodeId, key, fallback = 0) {
  if (typeof nodeGraphReadNodeNumber === "function") {
    const n = nodeGraphReadNodeNumber(nodeId, key);
    if (Number.isFinite(n)) return n;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const raw = Number(patchNode?.params?.[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

// —— Toggle ————————————————————————————————————————————————————————————

function nodeGraphPluginButtonBindLook(face, nodeId) {
  const paint = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (typeof nodeGraphPluginButtonPaintFace === "function") {
      nodeGraphPluginButtonPaintFace(
        face,
        typeof nodeGraphPluginButtonDisplaySettingsForNode === "function"
          ? nodeGraphPluginButtonDisplaySettingsForNode(patchNode)
          : patchNode?.traceDisplaySettings,
      );
    }
  };
  face._pluginBtnPaintLook = paint;
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(paint);
    ro.observe(face);
    face._pluginBtnResize = ro;
  }
  requestAnimationFrame(paint);
}

function createNodeGraphToggleButtonFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-plugin-toggle-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "node-plugin-toggle-button";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} toggle`);

  const biasEnds = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    return typeof nodeGraphDspControllerBiasEnds === "function"
      ? nodeGraphDspControllerBiasEnds(patchNode, "offset")
      : { min: 0, max: 1 };
  };
  const biasIsOn = (v, ends) => (typeof nodeGraphDspControllerBiasIsOn === "function"
    ? nodeGraphDspControllerBiasIsOn(v, ends)
    : Number(v) > 0.5);
  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
      ? nodeGraphDspControllerDisplayIsMouse(patchNode)
      : true;
    const target = nodeGraphPluginReadParamDom(node, "offset", 0);
    const ends = biasEnds();
    let shown = target;
    if (!wantsMouse && typeof nodeGraphModuleScopeLatestOutputValue === "function") {
      const live = Number(nodeGraphModuleScopeLatestOutputValue(node, "Bias", Number.NaN));
      if (Number.isFinite(live)) shown = live;
    }
    const on = biasIsOn(shown, ends);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "Off", on: "On" };
    if (wantsMouse) {
      btn.textContent = (biasIsOn(target, ends) ? labels.on : labels.off) || "";
    } else {
      btn.textContent = Number.isFinite(shown) ? shown.toFixed(2) : "0.00";
    }
    face._pluginBtnPaintLook?.();
  };
  btn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
  });
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const ends = biasEnds();
    const on = biasIsOn(nodeGraphPluginReadParamDom(node, "offset", 0), ends);
    nodeGraphPluginWriteParamValue(node, "offset", on ? ends.min : ends.max, { record: true, status: "toggle" });
    sync();
    if (typeof scheduleNodeGraphGhostSlidersFromLive === "function") {
      scheduleNodeGraphGhostSlidersFromLive();
    }
  });
  face.append(btn);
  face.syncFromParameters = sync;
  nodeGraphPluginButtonBindLook(face, node);
  requestAnimationFrame(sync);
  return face;
}

// —— Momentary ————————————————————————————————————————————————————————

function createNodeGraphMomentaryButtonFace(node, type) {
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
    if (!nodeGraphMvp.pluginMomentary) nodeGraphMvp.pluginMomentary = Object.create(null);
  }
  const face = document.createElement("div");
  face.className = "node-plugin-momentary-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "node-plugin-momentary-button";
  btn.textContent = "GATE";
  btn.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} momentary`);

  const biasEnds = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    return typeof nodeGraphDspControllerBiasEnds === "function"
      ? nodeGraphDspControllerBiasEnds(patchNode, "offset")
      : { min: 0, max: 1 };
  };
  const biasIsOn = (v, ends) => (typeof nodeGraphDspControllerBiasIsOn === "function"
    ? nodeGraphDspControllerBiasIsOn(v, ends)
    : Number(v) > 0.5);
  const setDown = (down) => {
    const ends = biasEnds();
    const v = down ? ends.max : ends.min;
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      if (!nodeGraphMvp.pluginMomentary) nodeGraphMvp.pluginMomentary = Object.create(null);
      nodeGraphMvp.pluginMomentary[node] = v;
    }
    nodeGraphPluginWriteParamValue(node, "offset", v, { record: false, status: "momentary" });
    btn.classList.toggle("is-down", down);
    if (typeof scheduleNodeGraphLiveParameterSync === "function") {
      scheduleNodeGraphLiveParameterSync();
    }
  };

  btn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    btn.setPointerCapture?.(event.pointerId);
    setDown(true);
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
  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
      ? nodeGraphDspControllerDisplayIsMouse(patchNode)
      : true;
    const target = nodeGraphPluginReadParamDom(node, "offset", 0);
    const ends = biasEnds();
    let shown = target;
    if (!wantsMouse && typeof nodeGraphModuleScopeLatestOutputValue === "function") {
      const live = Number(nodeGraphModuleScopeLatestOutputValue(node, "Bias", Number.NaN));
      if (Number.isFinite(live)) shown = live;
    }
    btn.classList.toggle("is-down", biasIsOn(wantsMouse ? target : shown, ends));
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "GATE", on: "GATE" };
    if (wantsMouse) {
      btn.textContent = (biasIsOn(wantsMouse ? target : shown, ends) ? labels.on : labels.off) || "";
    } else {
      btn.textContent = Number.isFinite(shown) ? shown.toFixed(2) : "0.00";
    }
    face._pluginBtnPaintLook?.();
  };
  face.append(btn);
  face.syncFromParameters = sync;
  nodeGraphPluginButtonBindLook(face, node);
  requestAnimationFrame(sync);
  return face;
}

// Faces are created by node-graph-module-rendering.js (layout: sliderWidget).
