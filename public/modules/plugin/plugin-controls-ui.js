// Toggle and momentary faces. Same Bias parameter as Knob.
// Toggle writes min or max. Momentary writes max while held, min on release.
// Smoothing is the Bias parameter smoother. The face does not interpolate.

function nodeGraphPluginWriteParamValue(nodeId, key, value, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id || !key) return;
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

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "node-plugin-toggle-button";
  btn.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} toggle`);

  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
      ? nodeGraphDspControllerDisplayIsMouse(patchNode)
      : true;
    const shown = nodeGraphControllerShownBias(node, patchNode);
    const on = nodeGraphControllerBiasAtHighThrow(node, shown);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "Off", on: "On" };
    if (wantsMouse) {
      const target = nodeGraphPluginReadParamDom(node, "offset", 0);
      btn.textContent = (nodeGraphControllerBiasAtHighThrow(node, target) ? labels.on : labels.off) || "";
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
    const current = nodeGraphPluginReadParamDom(node, "offset", 0);
    const next = nodeGraphControllerBiasEnd(node, !nodeGraphControllerBiasAtHighThrow(node, current));
    nodeGraphPluginWriteParamValue(node, "offset", next, { record: true, status: "toggle" });
    sync();
  });
  face.append(btn);
  face.syncFromParameters = sync;
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

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "node-plugin-momentary-button";
  btn.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} momentary`);

  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const shown = nodeGraphControllerShownBias(node, patchNode);
    const down = nodeGraphControllerBiasAtHighThrow(node, shown);
    btn.classList.toggle("is-down", down);
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "Off", on: "On" };
    btn.textContent = (down ? labels.on : labels.off) || "On";
    face._pluginBtnPaintLook?.();
  };

  const setDown = (down) => {
    nodeGraphPluginWriteParamValue(node, "offset", nodeGraphControllerBiasEnd(node, down), {
      record: false,
      status: "momentary",
    });
    sync();
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

  face.append(btn);
  face.syncFromParameters = sync;
  if (typeof nodeGraphPluginButtonBindLook === "function") {
    nodeGraphPluginButtonBindLook(face, node);
  }
  requestAnimationFrame(sync);
  return face;
}
