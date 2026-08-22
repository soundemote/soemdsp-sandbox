// Plugin control faces: Toggle, Momentary, Slider (Bias display, like Knob).

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

  const sync = () => {
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
    const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
      ? nodeGraphDspControllerDisplayIsMouse(patchNode)
      : true;
    const target = nodeGraphPluginReadParamDom(node, "value", 0);
    let shown = target;
    if (!wantsMouse && typeof nodeGraphModuleScopeLatestOutputValue === "function") {
      const live = Number(nodeGraphModuleScopeLatestOutputValue(node, "Out", Number.NaN));
      if (Number.isFinite(live)) {
        shown = live;
      }
    }
    const on = shown > 0.5;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "Off", on: "On" };
    if (wantsMouse) {
      btn.textContent = (target > 0.5 ? labels.on : labels.off) || "";
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
    const on = nodeGraphPluginReadParamDom(node, "value", 0) > 0.5;
    nodeGraphPluginWriteParamValue(node, "value", on ? 0 : 1, { record: true, status: "toggle" });
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

  const setDown = (down) => {
    const v = down ? 1 : 0;
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      if (!nodeGraphMvp.pluginMomentary) nodeGraphMvp.pluginMomentary = Object.create(null);
      nodeGraphMvp.pluginMomentary[node] = v;
    }
    nodeGraphPluginWriteParamValue(node, "value", v, { record: false, status: "momentary" });
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
    const target = nodeGraphPluginReadParamDom(node, "value", 0);
    let shown = target;
    if (!wantsMouse && typeof nodeGraphModuleScopeLatestOutputValue === "function") {
      const live = Number(nodeGraphModuleScopeLatestOutputValue(node, "Out", Number.NaN));
      if (Number.isFinite(live)) {
        shown = live;
      }
    }
    btn.classList.toggle("is-down", (wantsMouse ? target : shown) > 0.5);
    const labels = typeof nodeGraphPluginButtonFaceLabels === "function"
      ? nodeGraphPluginButtonFaceLabels(patchNode || node)
      : { off: "GATE", on: "GATE" };
    if (wantsMouse) {
      btn.textContent = ((wantsMouse ? target : shown) > 0.5 ? labels.on : labels.off) || "";
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

// —— Slider face = module DISPLAY of live Bias (same contract as Knob face) ——
// Parameter meta / raw `value` alone is NOT the display. The face shows
// final Bias (In + effective slider + mod). Drag still writes the real
// param-row `value` control via data-slider-target (beginNodeSliderDrag).

/**
 * Live Bias for the Slider module face.
 * Prefer scope Bias (worklet output); else In + effective `value` param.
 * Reuses Knob face helpers where present (same Bias bus).
 */
function nodeGraphPluginSliderFaceLiveBias(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) return 0;

  // Scope capture is the same Bias port as the Knob face.
  if (typeof nodeGraphKnobFaceLatestScopeSample === "function") {
    const scoped = nodeGraphKnobFaceLatestScopeSample(id);
    if (scoped != null && Number.isFinite(scoped)) return scoped;
  }

  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!patchNode) return 0;

  const metadata = typeof nodeGraphReadPatchParameterMetadata === "function"
    ? nodeGraphReadPatchParameterMetadata(patchNode, "value")
    : {};
  let base = typeof nodeGraphReadNodeNumber === "function"
    ? nodeGraphReadNodeNumber(id, "value")
    : Number(patchNode.params?.value);
  if (!Number.isFinite(base)) base = 0;

  // Param-row MOD CV on `value` (bipolar unit, Phase F).
  const modulations = Array.isArray(nodeGraphMvp?.patch?.modulations)
    ? nodeGraphMvp.patch.modulations
    : [];
  let contribution = 0;
  let hasMod = false;
  for (const modulation of modulations) {
    if (modulation.destinationNode !== id || modulation.destinationParam !== "value") {
      continue;
    }
    const src = typeof nodeGraphKnobFaceSourceSample === "function"
      ? nodeGraphKnobFaceSourceSample(modulation.sourceNode, modulation.sourcePort)
      : null;
    if (src == null || !Number.isFinite(src)) continue;
    hasMod = true;
    if (typeof normalizeNodeGraphParameterModulationInput === "function") {
      contribution += normalizeNodeGraphParameterModulationInput(src, metadata);
    } else if (typeof nodeGraphParamNormalizeModInput === "function") {
      contribution += nodeGraphParamNormalizeModInput(src, metadata);
    } else {
      contribution += src;
    }
  }
  let slider = base;
  if (hasMod) {
    if (typeof nodeGraphParamApplyMod === "function") {
      slider = nodeGraphParamApplyMod(base, contribution, metadata);
    } else if (typeof nodeGraphApplyParameterModulation === "function") {
      slider = nodeGraphApplyParameterModulation(base, contribution, metadata);
    } else {
      slider = base + contribution;
    }
  }

  // Dedicated signal In: domain add (same as worklet/live evaluator).
  let inputSum = 0;
  const connections = Array.isArray(nodeGraphMvp?.patch?.connections)
    ? nodeGraphMvp.patch.connections
    : [];
  for (const connection of connections) {
    if (connection.destinationNode !== id || connection.destinationPort !== "In") {
      continue;
    }
    const src = typeof nodeGraphKnobFaceSourceSample === "function"
      ? nodeGraphKnobFaceSourceSample(connection.sourceNode, connection.sourcePort)
      : null;
    if (src != null && Number.isFinite(src)) inputSum += src;
  }
  return inputSum + slider;
}

function createNodeGraphPluginSliderFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-plugin-slider-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  // Drag surface → real body param slider (control). Face paints Bias (display).
  face.dataset.sliderTarget = `node-${node}-value`;
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} slider display`);

  // Visual fader chrome on the face (display only — not a params-band row).
  const row = document.createElement("div");
  row.className = "node-plugin-slider-face-row";
  row.dataset.param = "value";
  row.dataset.pluginSliderDisplay = "true";

  const label = document.createElement("label");
  label.className = "node-plugin-slider-face-control";
  label.dataset.paramLabel = "";

  const input = document.createElement("input");
  input.type = "range";
  input.className = "node-plugin-slider-face-input";
  input.id = `node-plugin-slider-face-${node}-value`;
  input.dataset.param = "value";
  input.dataset.pluginSliderDisplay = "true";
  input.min = "-1";
  input.max = "1";
  input.step = "any";
  input.dataset.mid = "0";
  input.dataset.default = "0";
  input.dataset.kind = "decimal";
  input.dataset.nonlinearSlider = "false";
  input.dataset.showSign = "true";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");

  /** Paint face from live Bias — this is the module display. */
  const paintDisplay = () => {
    const bias = nodeGraphPluginSliderFaceLiveBias(node);
    const v = Number.isFinite(bias) ? bias : 0;
    face.dataset.liveBias = String(v);
    input.value = String(v);
    if (typeof applyNodeGraphInputUnboundedValue === "function") {
      applyNodeGraphInputUnboundedValue(input, v);
    }
    if (typeof refreshNodeSliderReadout === "function") {
      refreshNodeSliderReadout(input);
    } else if (typeof updateNodeSliderReadout === "function") {
      updateNodeSliderReadout(input);
    }
    // aria-valuenow for the face role=slider reflects displayed Bias
    face.setAttribute("aria-valuemin", input.min);
    face.setAttribute("aria-valuemax", input.max);
    face.setAttribute("aria-valuenow", String(v));
  };

  label.append(input);
  row.append(label);
  face.append(row);

  if (typeof beginNodeSliderDrag === "function") {
    face.addEventListener("pointerdown", beginNodeSliderDrag);
    face.addEventListener("mousedown", beginNodeSliderDrag);
  }
  if (typeof endNodeSliderDrag === "function") {
    face.addEventListener("lostpointercapture", endNodeSliderDrag);
  }
  if (typeof stepNodeSliderFromKeyboard === "function") {
    face.addEventListener("keydown", stepNodeSliderFromKeyboard);
  }

  face.syncFromParameters = paintDisplay;
  requestAnimationFrame(() => {
    if (typeof createNodeSliderReadout === "function") {
      createNodeSliderReadout(input);
    }
    const readout = face.querySelector(".node-slider-readout");
    if (readout) {
      readout.dataset.sliderTarget = `node-${node}-value`;
    }
    paintDisplay();
  });

  // When the body control moves, repaint Bias display.
  const bind = () => {
    const real = document.getElementById(`node-${node}-value`);
    if (!real || real.dataset.pluginSliderDisplayBound === "true") return;
    real.dataset.pluginSliderDisplayBound = "true";
    real.addEventListener("input", paintDisplay);
    real.addEventListener("change", paintDisplay);
  };
  requestAnimationFrame(bind);
  face.addEventListener("pointerenter", bind);

  return face;
}

// Faces are created by node-graph-module-rendering.js (layout: sliderWidget).
// Expose factories globally only — no chromeless double-registration.
