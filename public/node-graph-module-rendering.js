const NODE_GRAPH_KNOB_WIDGET_DRAG_DISTANCE_PX = 174;
const NODE_GRAPH_KNOB_WIDGET_MAX_SIZE_PX = 58;
const nodeGraphKnobWidgetResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      syncNodeGraphKnobWidgetSize(entry.target);
    }
  })
  : null;

function ensureNodeGraphDragHandle(node) {
  const actions = node.querySelector(".node-header-actions");
  if (!actions || actions.querySelector(".node-drag-handle")) {
    return;
  }

  const handle = document.createElement("button");
  handle.className = "node-drag-handle";
  handle.type = "button";
  handle.setAttribute("aria-label", `Move ${nodeGraphNodeDisplayName(node.dataset.node)} module`);
  nodeGraphApplyTooltip(handle, "module.move", {}, { title: false });
  handle.innerHTML = "&#x2725;";
  actions.prepend(handle);
}

function stopPropagation(event) {
  event.stopPropagation();
}

function handleNodeGraphIoRowMonitorPointerDown(event) {
  if (event.target.closest(".node-port")) {
    return;
  }
  toggleNodeGraphMonitorFromPortEvent(event);
}

function handleNodeGraphIoRowWireClick(event) {
  if (event.target.closest(".node-port")) {
    return;
  }
  nodeGraphWireInteractions.handlePortClick(event);
}

function nodeGraphKnobWidgetInputForControl(control) {
  const node = control?.closest?.(".dsp-node");
  const key = control?.dataset?.param || "value";
  return node?.querySelector?.(`.node-knob-widget-input[data-param="${CSS.escape(key)}"]`) || null;
}

function syncNodeGraphKnobWidgetSize(control) {
  if (!control) {
    return;
  }
  const size = Math.max(
    8,
    Math.min(
      NODE_GRAPH_KNOB_WIDGET_MAX_SIZE_PX,
      control.clientWidth || NODE_GRAPH_KNOB_WIDGET_MAX_SIZE_PX,
      control.clientHeight || NODE_GRAPH_KNOB_WIDGET_MAX_SIZE_PX,
    ),
  );
  control.style.setProperty("--knob-widget-slot-size", `${size}px`);
}

function observeNodeGraphKnobWidgetSize(control) {
  syncNodeGraphKnobWidgetSize(control);
  nodeGraphKnobWidgetResizeObserver?.observe(control);
  requestAnimationFrame(() => syncNodeGraphKnobWidgetSize(control));
}

function nodeGraphKnobWidgetDragSpeed(event) {
  return NODE_GRAPH_KNOB_WIDGET_DRAG_DISTANCE_PX *
    (event.shiftKey ? 3 : 1) *
    (event.ctrlKey || event.metaKey ? 10 : 1);
}

function syncNodeGraphKnobWidgetControl(control) {
  const input = nodeGraphKnobWidgetInputForControl(control);
  const node = control?.closest?.(".dsp-node");
  const parameter = nodeGraphPatchNodeParameterDefinitions(nodeGraphPatchNode(node?.dataset?.node))
    .find((candidate) => candidate.key === (control?.dataset?.param || "value"));
  if (!input || !parameter) {
    return;
  }
  const value = normalizeNodeSliderValue(input, Number(input.value));
  const min = Number(input.min);
  const max = Number(input.max);
  const range = max - min;
  const normalized = Number.isFinite(range) && range > 0
    ? clampNodeSliderValue((value - min) / range, 0, 1)
    : 0;
  control.style.setProperty("--knob-widget-value", String(normalized));
  control.style.setProperty("--knob-widget-angle", `${-132 + normalized * 264}deg`);
  control.setAttribute("aria-valuenow", String(value));
  const readout = control.closest(".node-knob-widget-body")?.querySelector("[data-knob-widget-value]");
  if (readout) {
    readout.textContent = formatNodeSliderNumber(value, {
      kind: input.dataset.kind,
      maxDigits: input.dataset.maxDigits,
      reserveSignSpace: true,
      showSign: nodeSliderShouldShowSign(input),
    });
  }
}

function setNodeGraphKnobWidgetValue(control, value, options = {}) {
  const input = nodeGraphKnobWidgetInputForControl(control);
  if (!input) {
    return;
  }
  input.value = String(normalizeNodeSliderValue(input, value));
  syncNodeGraphKnobWidgetControl(control);
  syncNodeGraphPatchParameterFromSlider(input, {
    deferUi: !options.record,
    record: options.record,
    status: options.status || "knob changed",
  });
  syncNodeGraphGhostSliders();
  markNodeGraphRenderPending();
  scheduleNodeGraphLiveParameterSync();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function beginNodeGraphKnobWidgetDrag(event) {
  if (!event.target?.closest?.(".node-knob-widget-face")) {
    return;
  }
  const control = event.currentTarget;
  const input = nodeGraphKnobWidgetInputForControl(control);
  if (!input) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  control.setPointerCapture?.(event.pointerId);
  control.dataset.knobDragStartX = String(event.clientX);
  control.dataset.knobDragStartY = String(event.clientY);
  control.dataset.knobDragStartValue = String(Number(input.value) || 0);
  control.classList.add("value-dragging");
}

function dragNodeGraphKnobWidget(event) {
  const control = event.currentTarget;
  if (!control.classList.contains("value-dragging")) {
    return;
  }
  const input = nodeGraphKnobWidgetInputForControl(control);
  if (!input) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const min = Number(input.min);
  const max = Number(input.max);
  const range = Number.isFinite(max - min) && max > min ? max - min : 1;
  const startX = Number(control.dataset.knobDragStartX) || event.clientX;
  const startY = Number(control.dataset.knobDragStartY) || event.clientY;
  const startValue = Number(control.dataset.knobDragStartValue) || 0;
  const speed = nodeGraphKnobWidgetDragSpeed(event);
  const delta = ((startY - event.clientY) + (event.clientX - startX)) / speed;
  setNodeGraphKnobWidgetValue(control, startValue + delta * range);
}

function endNodeGraphKnobWidgetDrag(event) {
  const control = event.currentTarget;
  if (!control.classList.contains("value-dragging")) {
    return;
  }
  control.classList.remove("value-dragging");
  control.releasePointerCapture?.(event.pointerId);
  delete control.dataset.knobDragStartX;
  delete control.dataset.knobDragStartY;
  delete control.dataset.knobDragStartValue;
  const input = nodeGraphKnobWidgetInputForControl(control);
  if (input) {
    syncNodeGraphPatchParameterFromSlider(input, {
      record: true,
      status: "knob changed",
    });
    scheduleNodeGraphLiveParameterSync();
  }
}

function attachNodeGraphNodeEvents(node) {
  ensureNodeGraphDragHandle(node);
  node.querySelector(".node-drag-handle")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-drag-handle")?.addEventListener("dblclick", toggleNodeGraphNodeMovementLock);
  node.querySelector(".node-execution-order-badge")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-header-title-row")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-header-title-row")?.addEventListener("dblclick", openNodeModuleActionMenu);
  node.querySelector(".node-header-title-row")?.addEventListener("contextmenu", openNodeModuleActionMenu);
  node.querySelector(".node-led-face")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-knob-widget-body")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  // Group Input/Output are chromeless (no .node-header-title-row to grab
  // or double-click, see public/modules/groupInput|groupOutput/*-ui.js) --
  // wire their own face to the exact same drag/settings behavior the
  // header row gives every other module. Safe against the single .node-port
  // each face contains: handlePortPointerDown (node-graph-wires.js)
  // stopPropagation()s before this could also fire, same guarantee LED's
  // face+port already relies on.
  node.querySelector(".node-group-input-face")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-group-input-face")?.addEventListener("dblclick", openNodeModuleActionMenu);
  node.querySelector(".node-group-output-face")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-group-output-face")?.addEventListener("dblclick", openNodeModuleActionMenu);
  node.querySelectorAll(".dsp-node-io-section")
    .forEach((section) => section.addEventListener("pointerdown", beginNodeGraphNodeDrag));
  node.querySelectorAll(".node-parameter-row")
    .forEach((row) => row.addEventListener("pointerdown", beginNodeGraphNodeDrag));
  node.querySelector(".node-bypass-button")?.addEventListener("click", toggleNodeGraphModuleBypass);
  node.querySelector(".node-display-settings-button")?.addEventListener("click", openNodeModuleDisplaySettings);
  node.querySelector(".node-display-settings-button")?.addEventListener("contextmenu", openNodeModuleDisplaySettings);
  node.querySelector(".node-action-button")?.addEventListener("click", openNodeModuleActionMenu);
  node.querySelector(".node-metaparameter-button")?.addEventListener("click", openNodeModuleMetaparameters);
  node.addEventListener("lostpointercapture", endNodeGraphNodeDrag);
  for (const port of node.querySelectorAll(".node-port")) {
    port.addEventListener("pointerdown", nodeGraphWireInteractions.handlePortPointerDown);
    port.addEventListener("pointerdown", toggleNodeGraphMonitorFromPortEvent, true);
    port.addEventListener("click", nodeGraphWireInteractions.handlePortClick);
  }
  for (const port of node.querySelectorAll(".node-param-port.modulation-input")) {
    port.addEventListener("pointerdown", nodeGraphWireInteractions.handlePortPointerDown);
    port.addEventListener("pointerdown", toggleNodeGraphMonitorFromPortEvent, true);
    port.addEventListener("click", nodeGraphWireInteractions.handlePortClick);
  }
  for (const port of node.querySelectorAll(".node-param-port.graph-input")) {
    port.addEventListener("pointerdown", nodeGraphWireInteractions.handlePortPointerDown);
    port.addEventListener("click", nodeGraphWireInteractions.handlePortClick);
  }
  for (const row of node.querySelectorAll(".node-io-row")) {
    row.addEventListener("pointerdown", nodeGraphWireInteractions.handlePortPointerDown);
    row.addEventListener("pointerdown", handleNodeGraphIoRowMonitorPointerDown, true);
    row.addEventListener("click", handleNodeGraphIoRowWireClick);
  }
  for (const slider of node.querySelectorAll('input[type="range"]')) {
    createNodeSliderReadout(slider);
    slider.addEventListener("input", () => {
      syncNodeSliderReadout(slider);
      syncNodeGraphPatchParameterFromSlider(slider);
      syncNodeGraphGhostSliders();
      markNodeGraphRenderPending();
      scheduleNodeGraphModuleScopeDraw();
      if (typeof scheduleNodeGraphFilterCurveDraw === "function") {
        scheduleNodeGraphFilterCurveDraw();
      }
      scheduleNodeGraphLiveParameterSync();
    });
  }
  for (const control of node.querySelectorAll("[data-knob-widget-control]")) {
    observeNodeGraphKnobWidgetSize(control);
    syncNodeGraphKnobWidgetControl(control);
    control.addEventListener("pointerdown", beginNodeGraphKnobWidgetDrag);
    control.addEventListener("pointermove", dragNodeGraphKnobWidget);
    control.addEventListener("pointerup", endNodeGraphKnobWidgetDrag);
    control.addEventListener("pointercancel", endNodeGraphKnobWidgetDrag);
    control.addEventListener("lostpointercapture", endNodeGraphKnobWidgetDrag);
  }
  node.querySelector(".node-module-shop-open-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openNodeGraphModuleShop(null);
  });
  node.querySelector(".node-module-home-open-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphMvp.sceneContextPoint = null;
    nodeGraphMvp.sceneContextTargetNode = null;
    nodeGraphMvp.sceneContextTargetWire = null;
    configureNodeSceneContextMenu("home");
    const rect = event.currentTarget.getBoundingClientRect();
    positionNodeSceneContextMenuHeaderAtPoint(
      document.getElementById("nodeSceneContextMenu"),
      rect.left + rect.width * 0.5,
      rect.top + rect.height * 0.5,
    );
  });
  node.querySelector("[data-screen-space-shader-apply]")?.addEventListener("click", applyNodeGraphScreenSpaceShaderScript);
  const screenSpaceShaderSource = node.querySelector("[data-screen-space-shader-source]");
  screenSpaceShaderSource?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  screenSpaceShaderSource?.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
  screenSpaceShaderSource?.addEventListener("input", (event) => {
    refreshNodeGraphScreenSpaceShaderBodyStatus(event.currentTarget.closest(".node-screen-space-shader-body"));
  });
}

function openNodeModuleDisplaySettings(event) {
  if (event?.altKey) {
    toggleNodeModuleDisplayVisibility(event);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const nodeId = event.currentTarget?.dataset?.node;
  if (nodeId && typeof openNodeGraphTraceDisplaySettings === "function" && openNodeGraphTraceDisplaySettings(nodeId, event)) {
    return;
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      typeof nodeGraphTooltipText === "function"
        ? nodeGraphTooltipText("module.displaySettings")
        : "Display button: click opens this module's display settings. Alt+click shows or hides the display.",
    );
  }
}

function toggleNodeModuleDisplayVisibility(event) {
  event.preventDefault();
  event.stopPropagation();
  const nodeId = event.currentTarget?.dataset?.node;
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!sourceNode || !nodeGraphPatchNodeHasHideableOscilloscope(sourceNode)) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("This module does not have a hideable display.");
    }
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphPatchNodeHasHideableOscilloscope(targetNode)) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.oscilloscopeHidden = !ui.oscilloscopeHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.oscilloscopeHidden ? "module display hidden" : "module display shown",
  });
  if (typeof configureNodeSceneContextMenu === "function") {
    configureNodeSceneContextMenu("module");
  }
}

function firstNodeModuleSliderReadout(nodeElement) {
  const readout = nodeElement?.querySelector?.(".node-slider-readout");
  if (readout) {
    return readout;
  }
  const slider = nodeElement?.querySelector?.('input[type="range"]');
  if (slider && typeof createNodeSliderReadout === "function") {
    createNodeSliderReadout(slider);
  }
  return nodeElement?.querySelector?.(".node-slider-readout") || null;
}

function toggleNodeModuleSlidersVisibility(event) {
  event.preventDefault();
  event.stopPropagation();
  const nodeId = event.currentTarget?.dataset?.node;
  const sourceNode = nodeGraphPatchNode(nodeId);
  if (!sourceNode || !nodeGraphModuleTypeHasHideableSliders(sourceNode.type)) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("This module does not have hideable sliders.");
    }
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphModuleTypeHasHideableSliders(targetNode.type)) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.slidersHidden = !ui.slidersHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.slidersHidden ? "module sliders hidden" : "module sliders shown",
  });
  if (typeof configureNodeSceneContextMenu === "function") {
    configureNodeSceneContextMenu("module");
  }
}

function openNodeModuleMetaparameters(event) {
  if (event?.altKey) {
    toggleNodeModuleSlidersVisibility(event);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const nodeElement = event.currentTarget?.closest?.(".dsp-node");
  const readout = firstNodeModuleSliderReadout(nodeElement);
  if (readout && typeof openNodeMetadataPopover === "function") {
    openNodeMetadataPopover(event, readout);
    return;
  }
  if (typeof openBlankNodeMetadataPopover === "function") {
    openBlankNodeMetadataPopover(event);
  }
}

function applyNodeGraphScreenSpaceShaderScript(event) {
  const body = event.currentTarget?.closest?.(".node-screen-space-shader-body");
  const nodeId = body?.dataset?.node || "";
  const source = body?.querySelector?.("[data-screen-space-shader-source]")?.value || "";
  const targetNode = nodeGraphPatchNode(nodeId);
  if (!targetNode || targetNode.type !== "screenSpaceShader") {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const node = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return false;
  }
  const screenSpaceShader = normalizeNodeGraphScreenSpaceShader({
    ...node.screenSpaceShader,
    source,
  });
  node.screenSpaceShader = screenSpaceShader;
  const inputSet = new Set(screenSpaceShader.inputs);
  patch.connections = (patch.connections || []).filter((connection) =>
    connection.destinationNode !== nodeId || inputSet.has(nodeGraphCanonicalInputPort("screenSpaceShader", connection.destinationPort)),
  );
  commitNodeGraphPatch(patch, { status: "screen space shader applied" });
  return true;
}

function nodeGraphModuleButtonsHiddenForNode(node) {
  if (!(node instanceof Element)) {
    return false;
  }
  return (
    nodeGraphMvp.moduleButtonsVisible === false ||
    node.classList.contains("buttons-hidden") ||
    node.closest(".node-graph-workspace")?.classList.contains("module-buttons-hidden")
  );
}

function nodeGraphModuleTitleBypassModifierActive(event) {
  return Boolean(event?.altKey);
}

function toggleNodeGraphModuleBypassFromNode(node, event) {
  if (!nodeGraphScriptReadyForGraphAction("bypass")) {
    return false;
  }
  const bypassButton = node?.querySelector?.(".node-bypass-button");
  if (!bypassButton) {
    return false;
  }
  const nodeId = node?.dataset?.node;
  if (nodeId === "output") {
    toggleNodeGraphLiveOutput();
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }
  if (!nodeId || !nodeGraphMvp.activeNodes.has(nodeId)) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const bypassed = new Set(patch.bypassedNodes || []);
  if (bypassed.has(nodeId)) {
    bypassed.delete(nodeId);
  } else {
    bypassed.add(nodeId);
  }
  patch.bypassedNodes = [...bypassed];
  commitNodeGraphPatch(patch, {
    status: bypassed.has(nodeId) ? "module bypassed" : "module active",
  });
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

function nodeGraphModuleLayoutClassNames(type, definition, layout) {
  const classes = ["dsp-node"];
  if (definition.output) {
    classes.push("output-node");
  }
  if (["samplePlayer", "sampleLooper", "audioPlayer"].includes(type)) {
    classes.push("sample-module-layout");
  }
  if (type === "audioPlayer") {
    classes.push("audio-player-layout");
  }
  const layoutClasses = {
    buttonWidget: "button-widget-layout",
    clapPlugin: "clap-plugin-layout",
    filterCurve: "filter-curve-layout",
    graph: "graph-node-layout",
    image: "image-node-layout",
    keyboardController: "keyboard-controller-layout",
    knobWidget: "knob-widget-layout",
    macroControls: "macro-controls-layout",
    patchCommand: "patch-command-layout",
    phosphillatorDraw: "phosphillator-draw-layout",
    phosphorWaveform: "phosphor-waveform-layout",
    pitchModWheel: "pitch-mod-wheel-layout",
    screenSpaceShader: "screen-space-shader-layout",
    sliderWidget: "slider-widget-layout",
    speakerProtection: "speaker-protection-layout",
    textBox: "text-box-layout",
    traceDisplay: "trace-display-layout",
    visualScope: "visual-scope-layout",
    wallRoomDisplay: "wall-room-display-layout",
    ...nodeGraphChromelessModuleLayoutClassEntries(),
  };
  if (definition.layout === "canvas") {
    classes.push("canvas-node-layout");
  }
  if (layoutClasses[layout]) {
    classes.push(layoutClasses[layout]);
  }
  return classes.join(" ");
}

function appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts) {
  const proxy = createNodeGraphIoProxySection(node, inputPorts, outputPorts);
  if (proxy) {
    ioSection.append(proxy);
  }
  article.append(ioSection);
}

function createNodeGraphSolidModuleShell(node, type, customBody, registration, inputPorts, outputPorts) {
  const shell = document.createElement("div");
  shell.className = "node-solid-module-shell";
  const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input") || document.createElement("div");
  const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output") || document.createElement("div");
  if (registration?.solidPortLabels === false) {
    inputColumn.classList.add("labels-hidden");
    outputColumn.classList.add("labels-hidden");
  }
  customBody.classList.add("node-solid-module-custom-ui");
  shell.append(inputColumn, customBody, outputColumn);
  return shell;
}

// Third UI tier alongside "generic" (knob/slider rows) and "generic + custom"
// (e.g. audioPlayer's waveform bolted onto the standard header/IO shell):
// fully custom, no shell at all. No header, no title, no drag handle, no
// labeled IO columns -- the module's own body IS the whole face, and ports
// are tiny absolutely-positioned buttons glued directly onto it. A module
// opts into this tier by self-registering (see
// node-graph-chromeless-module-registry.js and
// public/modules/stepGrid|led/*-register.js /-ui.js for the pattern) --
// nodeGraphChromelessModuleLayouts itself is defined there, not here.

function createNodeGraphModuleElement(type, node) {
  const definition = nodeGraphModuleDefinitions[type];
  const patchNode = nodeGraphPatchNode(node) || { id: node, type };
  const parameterDefinitions = nodeGraphPatchNodeParameterDefinitions(patchNode);
  const inputPorts = nodeGraphPatchNodeInputPorts(patchNode);
  const outputPorts = nodeGraphPatchNodeOutputPorts(patchNode).filter(
    (port) => !parameterDefinitions.some((parameter) => parameter.key === port),
  );
  const layout = nodeGraphPatchNodeLayout(patchNode);
  const widthGu = nodeGraphPatchNodeGridWidthUnits(patchNode);
  const heightGu = nodeGraphPatchNodeGridHeightUnits(patchNode);
  const article = document.createElement("article");
  article.className = nodeGraphModuleLayoutClassNames(type, definition, layout);
  article.dataset.node = node;
  article.dataset.nodeType = type;
  article.classList.toggle("solid-module-layout", nodeGraphChromelessModuleUsesSolidShell(type));
  article.dataset.portSignature = `${inputPorts.join(",")}=>${outputPorts.join(",")}`;
  article.dataset.gridWidthGu = String(widthGu);
  article.dataset.gridHeightGu = String(heightGu);
  article.style.setProperty("--node-grid-width-units", String(widthGu));
  article.style.setProperty("--node-grid-height-units", String(heightGu));
  article.style.setProperty("--node-module-display-height-units", String(nodeGraphPatchNodeDisplayCssHeightUnits(patchNode)));
  article.style.setProperty("--node-module-interface-controls-height-units", String(nodeGraphPatchNodeInterfaceControlsHeightUnits(patchNode)));
  if (layout === "knobWidget" && widthGu <= 1 && heightGu <= 1) {
    article.classList.add("knob-widget-compact");
  }
  const patchNodeUi = nodeGraphEffectivePatchNodeUi(patchNode.ui);
  article.classList.toggle("buttons-hidden", patchNodeUi.buttonsHidden);
  article.classList.toggle("io-hidden", patchNodeUi.ioHidden);
  article.classList.toggle("interface-controls-hidden", patchNodeUi.interfaceControlsHidden);
  article.classList.toggle("oscilloscope-hidden", patchNodeUi.oscilloscopeHidden);
  article.classList.toggle("sliders-hidden", patchNodeUi.slidersHidden);
  article.classList.toggle("title-hidden", patchNodeUi.titleHidden);

  const chromelessRegistration = nodeGraphChromelessModuleLayouts.has(layout)
    ? nodeGraphChromelessModuleRegistrations.get(layout)
    : null;
  if (chromelessRegistration) {
    const chromelessBody = chromelessRegistration.createBody(node, type);
    article.append(
      nodeGraphChromelessModuleUsesSolidShell(type)
        ? createNodeGraphSolidModuleShell(node, type, chromelessBody, chromelessRegistration, inputPorts, outputPorts)
        : chromelessBody,
    );
    chromelessRegistration.afterMount?.(article, chromelessBody, node, type);
  } else {
    article.append(createNodeGraphModuleHeader(type, node, definition));
  }
  const displayButton = article.querySelector(".node-display-settings-button");
  if (displayButton) {
    displayButton.setAttribute("aria-pressed", patchNodeUi.oscilloscopeHidden ? "false" : "true");
  }
  const metaparameterButton = article.querySelector(".node-metaparameter-button");
  if (metaparameterButton) {
    metaparameterButton.setAttribute("aria-pressed", patchNodeUi.slidersHidden ? "false" : "true");
  }
  if (chromelessRegistration) {
    // Body (and any afterMount setup) already appended above -- chromeless
    // modules carry their own inline ports, no separate IO section.
  } else if (layout === "knobWidget") {
    article.append(createNodeGraphKnobWidgetBody(node, type));
  } else if (layout === "textBox") {
    article.append(createNodeGraphTextBoxBody(node));
  } else if (layout === "image") {
    article.append(createNodeGraphImageBody(node));
    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    ioSection.append(document.createElement("div"));
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (layout === "screenSpaceShader") {
    article.append(createNodeGraphScreenSpaceShaderBody(node));
    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "canvas") {
    const canvasBody = createNodeGraphCanvasBody(node);
    if (layout === "visualScope") {
      canvasBody.classList.add("node-module-square-scope-window");
    }
    article.append(canvasBody);
    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (layout === "visualScope") {
    const scopeSection = createNodeGraphModuleScopeSection(node, type);
    scopeSection.classList.add("node-module-square-scope-window");
    article.append(scopeSection);
    registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (layout === "traceDisplay") {
    const scopeSection = createNodeGraphModuleScopeSection(node, type);
    scopeSection.classList.add("node-module-trace-display-window");
    article.append(scopeSection);
    registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "graph") {
    // Same side-by-side arrangement as the solid-shell modules (XY Pad,
    // Bug Button): inputs left, the interactive dot editor center, outputs
    // right, via the shared createNodeGraphSolidModuleShell helper -- rather
    // than the old stacked "display on top, IO strip below" layout. Graph
    // keeps its normal header/title bar (it isn't chromeless-registered, so
    // createNodeGraphModuleHeader above still ran), so the shell is pinned
    // to rows 2-3 of the standard 4-row .dsp-node grid (header / scope /
    // io / params) via .node-graph-solid-shell in styles.css, instead of
    // adopting the "solid-module-layout" 2-row grid those headerless
    // modules use.
    const graphSection = document.createElement("div");
    graphSection.className = "node-module-graph-display";
    graphSection.dataset.graphNode = node;
    graphSection.tabIndex = 0;
    graphSection.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} graph display`);
    renderNodeGraphGraphDisplay(graphSection, nodeGraphGraphForNode(patchNode), null, {
      smoothingMode: nodeGraphGraphSmoothingModeForNode(patchNode),
    });
    const graphShell = createNodeGraphSolidModuleShell(node, type, graphSection, null, inputPorts, outputPorts);
    graphShell.classList.add("node-graph-solid-shell");
    article.append(graphShell);
  } else if (definition.layout === "sliderWidget") {
    article.append(createNodeGraphSliderWidgetBody(node, type));

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section node-slider-widget-io-section";
    ioSection.append(document.createElement("div"));
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "buttonWidget") {
    article.append(createNodeGraphButtonWidgetBody(node, type));

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section node-button-widget-io-section";
    ioSection.append(document.createElement("div"));
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "keyboardController" || definition.layout === "macroControls" || definition.layout === "pitchModWheel") {
    if (definition.layout === "keyboardController") {
      article.append(createNodeGraphKeyboardControllerBody(node));
    } else if (definition.layout === "macroControls") {
      article.append(createNodeGraphMacroControlsBody(node));
    } else {
      article.append(createNodeGraphPitchModWheelBody(node));
    }
    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "patchCommand") {
    article.append(createNodeGraphPatchCommandBody(node));
    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (layout === "speakerProtection") {
    article.append(createNodeGraphSpeakerProtectionBody(node));
    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "clapPlugin") {
    if (typeof createNodeGraphClapPluginBody === "function") {
      article.append(createNodeGraphClapPluginBody(node));
    }

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "filterCurve") {
    if (!patchNodeUi.oscilloscopeHidden) {
      article.append(createNodeGraphFilterCurveDisplay(node, type));
    }

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "wallRoomDisplay") {
    if (!patchNodeUi.oscilloscopeHidden && typeof createNodeGraphWallRoomDisplay === "function") {
      article.append(createNodeGraphWallRoomDisplay(node, type));
    }

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "phosphillatorDraw") {
    article.append(createNodeGraphPhosphillatorDrawDisplay(node, type));

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "phosphorWaveform") {
    if (typeof createNodeGraphSampleModuleBody === "function") {
      article.append(createNodeGraphSampleModuleBody(node));
    }
    if (!patchNodeUi.oscilloscopeHidden) {
      article.append(createNodeGraphPhosphorWaveformDisplay(node, type));
    }

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else if (definition.layout === "pulseCurve") {
    if (!patchNodeUi.oscilloscopeHidden) {
      article.append(createNodeGraphPulseCurveDisplay(node, type));
    }

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  } else {
    let scopeSection = null;
    // xyPad's interactive pad IS its display -- no oscilloscope section.
    if (!patchNodeUi.oscilloscopeHidden && type !== "xyPad") {
      scopeSection = createNodeGraphModuleScopeSection(node, type);
      article.append(scopeSection);
    }
    if ((type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer") && typeof createNodeGraphSampleModuleBody === "function") {
      article.append(createNodeGraphSampleModuleBody(node));
    }
    if (type === "xyPad" && typeof createNodeGraphXyPadBody === "function") {
      article.append(createNodeGraphXyPadBody(node, type));
    }
    if (scopeSection) {
      registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });
    }

    const ioSection = document.createElement("div");
    ioSection.className = "dsp-node-io-section";
    const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
    const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
    if (inputColumn) {
      ioSection.append(inputColumn);
    } else {
      ioSection.append(document.createElement("div"));
    }
    if (outputColumn) {
      ioSection.append(outputColumn);
    } else {
      ioSection.append(document.createElement("div"));
    }
    appendNodeGraphModuleIoSection(article, ioSection, node, inputPorts, outputPorts);
  }

  if (type === "audioInput") {
    const stateBadge = document.createElement("div");
    stateBadge.className = "node-live-input-state-badge";
    stateBadge.dataset.micState = "off";
    stateBadge.textContent = "mic off";
    article.append(stateBadge);
  }

  if (
    definition.parameters?.length &&
    definition.layout !== "sliderWidget" &&
    layout !== "knobWidget" &&
    definition.layout !== "buttonWidget" &&
    (!nodeGraphChromelessModuleLayouts.has(layout) || nodeGraphChromelessModuleUsesSolidShell(type))
  ) {
    const body = document.createElement("div");
    body.className = "dsp-node-body";
    const graphInputSection = createNodeGraphInputSection(node, type);
    if (graphInputSection) {
      body.append(graphInputSection);
    }

    for (const parameter of definition.parameters) {
      body.append(createNodeGraphParameter(node, type, parameter));
    }
    article.append(body);
  }

  attachNodeGraphNodeEvents(article);
  return article;
}

function registerExistingNodeGraphNodes() {
  nodeGraphMvp.activeNodes = new Set();
  for (const node of document.querySelectorAll(".dsp-node")) {
    node.dataset.nodeType ||= node.dataset.node;
    nodeGraphMvp.activeNodes.add(node.dataset.node);
    const scopeElement = node.querySelector(".node-module-scope-window");
    if (scopeElement) {
      registerNodeGraphModuleScopeSlot(node, {
        nodeId: node.dataset.node,
        scopeElement,
        type: node.dataset.nodeType,
      });
    }
    attachNodeGraphNodeEvents(node);
  }
}

function toggleNodeGraphModuleBypass(event) {
  const button = event.currentTarget;
  const node = button.closest(".dsp-node");
  toggleNodeGraphModuleBypassFromNode(node, event);
}
