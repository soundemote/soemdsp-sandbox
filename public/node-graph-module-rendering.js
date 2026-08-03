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
  // Only when the pointer is in the jack neighborhood — empty solid-module
  // edge space must stay free for module drag/select.
  if (!nodeGraphIoRowPointerInPortHitbox(event)) {
    return;
  }
  if (event.target.closest(".node-port")) {
    return;
  }
  toggleNodeGraphMonitorFromPortEvent(event);
}

function handleNodeGraphIoRowWireClick(event) {
  if (!nodeGraphIoRowPointerInPortHitbox(event)) {
    return;
  }
  if (event.target.closest(".node-port")) {
    return;
  }
  nodeGraphWireInteractions.handlePortClick(event);
}

/** True when the event is inside the geometric jack hitbox for this io-row. */
function nodeGraphIoRowPointerInPortHitbox(event) {
  const row = event.currentTarget instanceof Element
    ? event.currentTarget
    : event.target?.closest?.(".node-io-row");
  if (!row?.classList?.contains("node-io-row")) {
    return false;
  }
  const helpers = typeof nodeGraphWireInteractions !== "undefined"
    ? nodeGraphWireInteractions?.helpers
    : null;
  if (!helpers?.endpointFromElement || !helpers?.pointInEndpointHitbox) {
    return Boolean(event.target?.closest?.(".node-port"));
  }
  const endpoint = helpers.endpointFromElement(row);
  if (!endpoint) {
    return false;
  }
  return helpers.pointInEndpointHitbox(endpoint, event.clientX, event.clientY, row);
}

/**
 * Shared solid-shell interaction contract (XY Pad, Number Readout, Ray Bouncer,
 * LED, Graph solid face, …):
 * - center face + shell gaps → select / drag / Module Settings
 * - jack neighborhood only → wire (geometric hitbox; see node-graph-wires.js)
 * Custom faces (pad canvas, bug button) stopPropagation for their own gestures.
 */
function attachNodeGraphSolidModuleShellEvents(node) {
  node.querySelectorAll(".node-solid-module-custom-ui").forEach((face) => {
    face.addEventListener("pointerdown", beginNodeGraphNodeDrag);
    // Graph face owns double-click (add/remove points). Knob face owns
    // double-click type-in (Bias). Do not open Module Settings from those.
    face.addEventListener("dblclick", (event) => {
      if (event.target?.closest?.(".node-module-graph-display, .node-knob-face")) {
        return;
      }
      openNodeModuleActionMenu(event);
    });
    face.addEventListener("contextmenu", openNodeModuleActionMenu);
  });
  node.querySelectorAll(".node-solid-module-shell").forEach((shell) => {
    shell.addEventListener("pointerdown", beginNodeGraphNodeDrag);
    shell.addEventListener("dblclick", (event) => {
      if (event.target?.closest?.(".node-module-graph-display, .node-knob-face")) {
        return;
      }
      openNodeModuleActionMenu(event);
    });
    shell.addEventListener("contextmenu", openNodeModuleActionMenu);
  });
}

function attachNodeGraphNodeEvents(node) {
  ensureNodeGraphDragHandle(node);
  node.querySelector(".node-drag-handle")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-drag-handle")?.addEventListener("dblclick", toggleNodeGraphNodeMovementLock);
  node.querySelector(".node-execution-order-badge")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-header-title-row")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-header-title-row")?.addEventListener("dblclick", openNodeModuleActionMenu);
  // Right-click anywhere on the module shell opens Module Settings (shared
  // path with document contextmenu). Slider readouts / display faces stop
  // propagation for their own settings first.
  node.addEventListener("contextmenu", openNodeModuleActionMenu);
  node.querySelector(".node-header-title-row")?.addEventListener("contextmenu", openNodeModuleActionMenu);
  // LED face is also .node-solid-module-custom-ui — drag is bound once via
  // attachNodeGraphSolidModuleShellEvents (do not double-bind pointerdown).
  // Group Input/Output are chromeless (no .node-header-title-row to grab
  // or double-click, see public/modules/groupInput|groupOutput/*-ui.js) --
  // wire their own face to the exact same drag/settings behavior the
  // header row gives every other module. Safe against the single .node-port
  // each face contains: handlePortPointerDown (node-graph-wires.js)
  // stopPropagation()s before this could also fire.
  node.querySelector(".node-group-input-face")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-group-input-face")?.addEventListener("dblclick", openNodeModuleActionMenu);
  node.querySelector(".node-group-output-face")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-group-output-face")?.addEventListener("dblclick", openNodeModuleActionMenu);
  attachNodeGraphSolidModuleShellEvents(node);
  node.querySelectorAll(".dsp-node-io-section")
    .forEach((section) => section.addEventListener("pointerdown", beginNodeGraphNodeDrag));
  node.querySelectorAll(".node-parameter-row")
    .forEach((row) => row.addEventListener("pointerdown", beginNodeGraphNodeDrag));
  // The Music Player / sample modules have no spare chrome to grab -- the body
  // is wall-to-wall controls -- so the phase readout doubles as a drag handle.
  // The copy button inside it is unaffected: beginNodeGraphNodeDrag bails on
  // any `button` target before it looks for a handle.
  node.querySelectorAll(".node-sample-phase-readout")
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
  // Shared display inspector for most faces. Music Player phosphor still owns
  // its own window; LED uses the shared form (ledLamp schema).
  if (nodeId && typeof openNodeGraphPhosphorWaveformSettings === "function" && openNodeGraphPhosphorWaveformSettings(nodeId, event)) {
    return;
  }
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
    filterCurve: "filter-curve-layout",
    graph: "graph-node-layout",
    image: "image-node-layout",
    keyboardController: "keyboard-controller-layout",
    pitchQuantizer: "pitch-quantizer-layout",
    chordPad: "chord-pad-layout",
    asciiscope: "asciiscope-layout",
    matrixDisplay: "matrix-display-layout",
    matrixWaterfall: "matrix-waterfall-layout",
    matrixPlate: "matrix-plate-layout",
    textStream: "text-stream-layout",
    macroControls: "macro-controls-layout",
    patchCommand: "patch-command-layout",
    phosphillatorDraw: "phosphillator-draw-layout",
    phosphorWaveform: "phosphor-waveform-layout",
    pitchModWheel: "pitch-mod-wheel-layout",
    screenSpaceShader: "screen-space-shader-layout",
    sliderWidget: "slider-widget-layout",
    badvalMonitor: "badval-monitor-layout",
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

/** Empty LayoutB IO column — zero width (display expands). Kept for grid structure. */
function createNodeGraphLayoutBIoColumnPlaceholder(io) {
  const column = document.createElement("div");
  column.className = `node-io-column ${io} node-layout-b-io-empty`;
  column.setAttribute("aria-hidden", "true");
  return column;
}

/** LayoutB shell: ports beside the face (in | face | out). Empty sides collapse. */
function createNodeGraphLayoutBShell(node, type, customBody, registration, inputPorts, outputPorts) {
  const shell = document.createElement("div");
  // node-solid-module-shell: legacy class name still used by CSS / hit-testing.
  shell.className = "node-solid-module-shell node-module-chrome-layout-b-shell";
  const hasInputs = Array.isArray(inputPorts) && inputPorts.length > 0;
  const hasOutputs = Array.isArray(outputPorts) && outputPorts.length > 0;
  const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input")
    || createNodeGraphLayoutBIoColumnPlaceholder("input");
  const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output")
    || createNodeGraphLayoutBIoColumnPlaceholder("output");
  // Layout B: no In/Out text chrome — jacks only; face expands into that space.
  // (solidPortLabels:false was the old per-module opt-out; now it's the default.)
  // Only real jack columns get labels-hidden (jack-band width). Empty placeholders
  // must stay node-layout-b-io-empty so the face claims that side (minus 1px pad).
  if (hasInputs) {
    inputColumn.classList.add("labels-hidden");
  }
  if (hasOutputs) {
    outputColumn.classList.add("labels-hidden");
  }
  shell.classList.toggle("layout-b-no-inputs", !hasInputs);
  shell.classList.toggle("layout-b-no-outputs", !hasOutputs);
  customBody.classList.add("node-solid-module-custom-ui");
  shell.append(inputColumn, customBody, outputColumn);
  return shell;
}

/** LayoutB: no param rows / sliders-hidden → shell fills; no empty bottom lip. */
function syncNodeGraphLayoutBNoParamsClass(element, type, ui = null) {
  if (!element?.classList) {
    return;
  }
  if (!element.classList.contains("chrome-layout-b") && !element.classList.contains("solid-module-layout")) {
    element.classList.remove("layout-b-no-params");
    return;
  }
  const patchUi = ui || nodeGraphEffectivePatchNodeUi(
    nodeGraphPatchNode(element.dataset?.node)?.ui,
    type || element.dataset?.nodeType,
  );
  const rows = typeof nodeGraphModuleVisibleSliderRowCountForUi === "function"
    ? nodeGraphModuleVisibleSliderRowCountForUi(type || element.dataset?.nodeType, patchUi)
    : 0;
  element.classList.toggle("layout-b-no-params", rows <= 0);
}

/** LayoutA I/O strip: ports under the face. */
function createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts, options = {}) {
  const ioSection = document.createElement("div");
  ioSection.className = options.className || "dsp-node-io-section";
  const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
  const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
  if (options.inputsOnly) {
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(document.createElement("div"));
  } else if (options.outputsOnly) {
    ioSection.append(document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
  } else {
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
  }
  return ioSection;
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
  const chrome = typeof nodeGraphModuleChrome === "function"
    ? nodeGraphModuleChrome(type)
    : {
      layout: NodeGraphModuleChromeLayout?.LayoutA || "LayoutA",
      portsBeside: false,
      headerless: false,
      cssLayoutClass: "chrome-layout-a",
    };
  article.dataset.chromeLayout = chrome.layout;
  article.classList.toggle("chrome-layout-a", Boolean(chrome.portsUnder ?? !chrome.portsBeside));
  article.classList.toggle("chrome-layout-b", Boolean(chrome.portsBeside));
  // Headerless LayoutB (XY Pad contract): shell + params + 1gu bottom clearance.
  // Legacy class name solid-module-layout kept for existing CSS.
  article.classList.toggle("solid-module-layout", Boolean(chrome.headerless));
  article.dataset.portSignature = `${inputPorts.join(",")}=>${outputPorts.join(",")}`;
  article.dataset.gridWidthGu = String(widthGu);
  article.dataset.gridHeightGu = String(heightGu);
  article.style.setProperty("--node-grid-width-units", String(widthGu));
  article.style.setProperty("--node-grid-height-units", String(heightGu));
  if (typeof nodeGraphApplyModuleShellHeightCssVars === "function") {
    nodeGraphApplyModuleShellHeightCssVars(article, patchNode);
  } else {
    article.style.setProperty("--node-module-display-height-units", String(nodeGraphPatchNodeDisplayCssHeightUnits(patchNode)));
    article.style.setProperty("--node-module-shell-height-units", String(nodeGraphPatchNodeDisplayCssHeightUnits(patchNode)));
  }
  article.style.setProperty("--node-module-interface-controls-height-units", String(nodeGraphPatchNodeInterfaceControlsHeightUnits(patchNode)));
  const patchNodeUi = nodeGraphEffectivePatchNodeUi(patchNode.ui, type);
  article.classList.toggle("buttons-hidden", patchNodeUi.buttonsHidden);
  article.classList.toggle("io-hidden", patchNodeUi.ioHidden);
  article.classList.toggle("interface-controls-hidden", patchNodeUi.interfaceControlsHidden);
  article.classList.toggle("oscilloscope-hidden", patchNodeUi.oscilloscopeHidden);
  article.classList.toggle("sliders-hidden", patchNodeUi.slidersHidden);
  article.classList.toggle("title-hidden", patchNodeUi.titleHidden);
  if (typeof syncNodeGraphLayoutBNoParamsClass === "function") {
    syncNodeGraphLayoutBNoParamsClass(article, type, patchNodeUi);
  }

  const chromelessRegistration = nodeGraphChromelessModuleLayouts.has(layout)
    ? nodeGraphChromelessModuleRegistrations.get(layout)
    : null;
  if (chromelessRegistration) {
    // Title bar on headerless LayoutB chromeless modules (default on).
    if (chrome.headerless && !patchNodeUi.titleHidden) {
      article.append(createNodeGraphModuleHeader(type, node, definition));
    }
    const chromelessBody = chromelessRegistration.createBody(node, type);
    // LayoutB → ports beside; otherwise chromeless face owns its own ports.
    article.append(
      chrome.portsBeside
        ? createNodeGraphLayoutBShell(node, type, chromelessBody, chromelessRegistration, inputPorts, outputPorts)
        : chromelessBody,
    );
    chromelessRegistration.afterMount?.(article, chromelessBody, node, type);
  } else if (chrome.headerless) {
    // Headerless LayoutB (e.g. knob): title + face + side ports.
    if (!patchNodeUi.titleHidden) {
      article.append(createNodeGraphModuleHeader(type, node, definition));
    }
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
  } else if (layout === "textBox") {
    article.append(createNodeGraphTextBoxBody(node));
  } else if (layout === "image") {
    article.append(createNodeGraphImageBody(node));
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts, { outputsOnly: true }),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (layout === "screenSpaceShader") {
    article.append(createNodeGraphScreenSpaceShaderBody(node));
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts, { inputsOnly: true }),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "canvas") {
    const canvasBody = createNodeGraphCanvasBody(node);
    if (layout === "visualScope") {
      canvasBody.classList.add("node-module-square-scope-window");
    }
    article.append(canvasBody);
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (layout === "visualScope") {
    const scopeSection = createNodeGraphModuleScopeSection(node, type);
    scopeSection.classList.add("node-module-square-scope-window");
    article.append(scopeSection);
    registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (layout === "traceDisplay") {
    const scopeSection = createNodeGraphModuleScopeSection(node, type);
    scopeSection.classList.add("node-module-trace-display-window");
    article.append(scopeSection);
    registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts, { inputsOnly: true }),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "graph") {
    // LayoutB: ports beside graph face.
    const graphSection = document.createElement("div");
    graphSection.className = "node-module-graph-display";
    graphSection.dataset.graphNode = node;
    graphSection.tabIndex = 0;
    graphSection.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} graph display`);
    renderNodeGraphGraphDisplay(graphSection, nodeGraphGraphForNode(patchNode), null, {
      smoothingMode: nodeGraphGraphSmoothingModeForNode(patchNode),
      stepCount: typeof nodeGraphGraphStepCountForNode === "function"
        ? nodeGraphGraphStepCountForNode(patchNode)
        : 0,
      tension: Number(patchNode?.params?.tension) ?? 1,
    });
    const graphShell = createNodeGraphLayoutBShell(node, type, graphSection, null, inputPorts, outputPorts);
    graphShell.classList.add("node-graph-solid-shell");
    article.append(graphShell);
  } else if (definition.layout === "sliderWidget") {
    // LayoutB (XY Pad contract): slim I/O beside a large face; Bias/control under.
    // Plugin shelf: Knob (knob), Slider, Toggle, Momentary each pick a face.
    let face = null;
    if (type === "pluginSlider" && typeof createNodeGraphPluginSliderFace === "function") {
      face = createNodeGraphPluginSliderFace(node, type);
    } else if (type === "toggleButton" && typeof createNodeGraphToggleButtonFace === "function") {
      face = createNodeGraphToggleButtonFace(node, type);
    } else if (type === "momentaryButton" && typeof createNodeGraphMomentaryButtonFace === "function") {
      face = createNodeGraphMomentaryButtonFace(node, type);
    } else if (typeof createNodeGraphKnobFace === "function") {
      face = createNodeGraphKnobFace(node, type);
    } else {
      face = createNodeGraphSliderWidgetBody(node, type);
    }
    face.classList.add("node-module-scope-window");
    if (face.dataset && face.dataset.lightStrength == null) {
      face.dataset.lightStrength = "0";
    }
    const shell = createNodeGraphLayoutBShell(node, type, face, null, inputPorts, outputPorts);
    shell.classList.add("node-knob-shell");
    if (type === "pluginSlider") shell.classList.add("node-plugin-slider-shell");
    if (type === "toggleButton" || type === "momentaryButton") {
      shell.classList.add("node-plugin-button-shell");
    }
    article.append(shell);
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        type,
        scopeElement: face,
      });
    }
    if (type === "knob" && typeof renderNodeGraphKnobFace === "function") {
      renderNodeGraphKnobFace(face, node);
    }
    face?.syncFromParameters?.();
  } else if (definition.layout === "keyboardController" || definition.layout === "macroControls" || definition.layout === "pitchModWheel") {
    if (definition.layout === "keyboardController") {
      article.append(createNodeGraphKeyboardControllerBody(node));
    } else if (definition.layout === "macroControls") {
      article.append(createNodeGraphMacroControlsBody(node));
    } else {
      article.append(createNodeGraphPitchModWheelBody(node));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "patchCommand") {
    article.append(createNodeGraphPatchCommandBody(node));
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts, { inputsOnly: true }),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (layout === "speakerProtection") {
    article.append(createNodeGraphSpeakerProtectionBody(node));
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (layout === "badvalMonitor") {
    if (typeof createNodeGraphBadvalMonitorBody === "function") {
      article.append(createNodeGraphBadvalMonitorBody(node));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "filterCurve") {
    if (!patchNodeUi.oscilloscopeHidden) {
      article.append(createNodeGraphFilterCurveDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "pitchQuantizer") {
    if (typeof createNodeGraphPitchQuantizerFace === "function") {
      article.append(createNodeGraphPitchQuantizerFace(node));
    }
  } else if (definition.layout === "chordPad") {
    if (typeof createNodeGraphChordPadFace === "function") {
      article.append(createNodeGraphChordPadFace(node));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "matrixWaterfall") {
    const rainFace = typeof createNodeGraphMatrixWaterfallFace === "function"
      ? createNodeGraphMatrixWaterfallFace(node)
      : (typeof createNodeGraphAsciiscopeFace === "function"
        ? createNodeGraphAsciiscopeFace(node)
        : null);
    if (rainFace) {
      article.append(rainFace);
      // Slot kept only for room-dimmer / light punches — no Trace overlay (selfPaint).
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        type,
        scopeElement: rainFace,
      });
    }
    // No I/O section — parameter-only module.
  } else if (definition.layout === "matrixPlate" || definition.layout === "asciiscope") {
    // matrixPlate = Matrix Display (Info/Serial). "asciiscope" kept as alias.
    const plateFace = typeof createNodeGraphMatrixPlateFace === "function"
      ? createNodeGraphMatrixPlateFace(node)
      : (typeof createNodeGraphAsciiscopeFace === "function"
        ? createNodeGraphAsciiscopeFace(node)
        : null);
    if (plateFace) {
      article.append(plateFace);
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        type,
        scopeElement: plateFace,
      });
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "matrixDisplay") {
    const matrixFace = typeof createNodeGraphMatrixDisplayFace === "function"
      ? createNodeGraphMatrixDisplayFace(node)
      : null;
    if (matrixFace) {
      article.append(matrixFace);
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        type,
        scopeElement: matrixFace,
      });
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "textStream") {
    const textFace = typeof createNodeGraphTextStreamFace === "function"
      ? createNodeGraphTextStreamFace(node)
      : null;
    if (textFace) {
      article.append(textFace);
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "wallRoomDisplay") {
    if (!patchNodeUi.oscilloscopeHidden && typeof createNodeGraphWallRoomDisplay === "function") {
      article.append(createNodeGraphWallRoomDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "phosphillatorDraw") {
    article.append(createNodeGraphPhosphillatorDrawDisplay(node, type));
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "phosphorWaveform") {
    if (typeof createNodeGraphSampleModuleBody === "function") {
      article.append(createNodeGraphSampleModuleBody(node));
    }
    if (!patchNodeUi.oscilloscopeHidden) {
      article.append(createNodeGraphPhosphorWaveformDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "pulseCurve") {
    if (!patchNodeUi.oscilloscopeHidden) {
      article.append(createNodeGraphPulseCurveDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else {
    let scopeSection = null;
    // Chromeless LayoutB modules already mounted above — don't add a second face.
    if (!patchNodeUi.oscilloscopeHidden) {
      scopeSection = createNodeGraphModuleScopeSection(node, type);
      article.append(scopeSection);
    }
    if ((type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer") && typeof createNodeGraphSampleModuleBody === "function") {
      article.append(createNodeGraphSampleModuleBody(node));
    }
    if (scopeSection) {
      registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
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
    (!nodeGraphChromelessModuleLayouts.has(layout) || chrome.portsBeside)
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
