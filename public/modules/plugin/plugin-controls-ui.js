// Plugin control faces: Toggle, Momentary, Slider (param-row mirror).

function nodeGraphPluginWriteParamValue(nodeId, key, value, options = {}) {
  const id = String(nodeId || "").trim();
  if (!id || !key) return;
  const slider = document.getElementById(`node-${id}-${key}`);
  if (slider) {
    slider.value = String(value);
    if (typeof applyNodeGraphInputUnboundedValue === "function") {
      applyNodeGraphInputUnboundedValue(slider, value);
    }
    if (typeof syncNodeGraphPatchParameterFromSlider === "function") {
      syncNodeGraphPatchParameterFromSlider(slider, {
        record: Boolean(options.record),
        status: options.status || "plugin control",
      });
    } else {
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      if (options.record) {
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      }
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
    const on = nodeGraphPluginReadParamDom(node, "value", 0) > 0.5;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "ON" : "OFF";
  };
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const on = nodeGraphPluginReadParamDom(node, "value", 0) > 0.5;
    nodeGraphPluginWriteParamValue(node, "value", on ? 0 : 1, { record: true, status: "toggle" });
    sync();
  });
  face.append(btn);
  face.syncFromParameters = sync;
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
  face.append(btn);
  return face;
}

// —— Slider face (mirrors param-row Layout slider) ————————————————

function createNodeGraphPluginSliderFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-plugin-slider-face node-module-scope-window";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.sliderTarget = `node-${node}-value`;
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} slider`);

  // Clone Layout parameter row chrome (label + range + readout shell).
  const row = document.createElement("div");
  row.className = "node-parameter-row node-plugin-slider-face-row";
  row.dataset.param = "value";

  const label = document.createElement("label");
  label.className = "node-parameter-control";
  label.dataset.paramLabel = "→";

  const input = document.createElement("input");
  input.type = "range";
  input.className = "node-plugin-slider-face-input";
  input.id = `node-plugin-slider-face-${node}-value`;
  input.dataset.param = "value";
  input.min = "-1";
  input.max = "1";
  input.step = "any";
  input.dataset.mid = "0";
  input.dataset.default = "0";
  input.dataset.kind = "decimal";
  input.dataset.nonlinearSlider = "false";
  input.dataset.showSign = "true";
  // Drive the real param slider via shared drag target id on the face.
  // Also keep this visible range in sync for the mirror look.
  const syncFromParam = () => {
    const v = nodeGraphPluginReadParamDom(node, "value", 0);
    input.value = String(v);
    if (typeof applyNodeGraphInputUnboundedValue === "function") {
      applyNodeGraphInputUnboundedValue(input, v);
    }
    if (typeof refreshNodeSliderReadout === "function") {
      refreshNodeSliderReadout(input);
    } else if (typeof updateNodeSliderReadout === "function") {
      updateNodeSliderReadout(input);
    }
  };

  input.addEventListener("input", () => {
    nodeGraphPluginWriteParamValue(node, "value", input.value, { record: false });
  });
  input.addEventListener("change", () => {
    nodeGraphPluginWriteParamValue(node, "value", input.value, { record: true, status: "slider" });
  });

  label.append(input);
  row.append(label);
  face.append(row);

  // Prefer face-wide drag onto the real parameter slider (same as Knob face).
  if (typeof beginNodeSliderDrag === "function") {
    face.addEventListener("pointerdown", (event) => {
      // Allow direct interaction with the mirror range without double-binding.
      if (event.target === input) return;
      beginNodeSliderDrag(event);
    });
    face.addEventListener("mousedown", (event) => {
      if (event.target === input) return;
      beginNodeSliderDrag(event);
    });
  }

  face.syncFromParameters = syncFromParam;
  requestAnimationFrame(() => {
    // Wire readout chrome if the slider stack expects it.
    if (typeof ensureNodeSliderReadout === "function") {
      ensureNodeSliderReadout(input);
    } else if (typeof attachNodeSliderReadout === "function") {
      attachNodeSliderReadout(input);
    }
    syncFromParam();
  });

  // Keep mirror in sync when the param-row slider moves.
  const article = () => (typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(node) : null);
  const bind = () => {
    const real = document.getElementById(`node-${node}-value`);
    if (!real || real.dataset.pluginSliderMirrorBound === "true") return;
    real.dataset.pluginSliderMirrorBound = "true";
    real.addEventListener("input", syncFromParam);
    real.addEventListener("change", syncFromParam);
  };
  requestAnimationFrame(bind);
  face.addEventListener("pointerenter", bind);

  return face;
}

// Faces are created by node-graph-module-rendering.js (layout: sliderWidget).
// Expose factories globally only — no chromeless double-registration.
