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
    // Module Settings is right-click only. Graph / keypad / text still
    // handle their own dblclick (add point, type-in) and stopPropagation.
    face.addEventListener("contextmenu", openNodeModuleActionMenu);
  });
  node.querySelectorAll(".node-solid-module-shell").forEach((shell) => {
    shell.addEventListener("pointerdown", beginNodeGraphNodeDrag);
    shell.addEventListener("contextmenu", openNodeModuleActionMenu);
  });
}

function attachNodeGraphNodeEvents(node) {
  ensureNodeGraphDragHandle(node);
  node.querySelector(".node-drag-handle")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-drag-handle")?.addEventListener("dblclick", toggleNodeGraphNodeMovementLock);
  for (const button of node.querySelectorAll(
    ".node-display-settings-button, .node-metaparameter-button, .node-action-button, .node-bypass-button",
  )) {
    button.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  }
  node.querySelector(".node-execution-order-badge")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-header-title-row")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-header-title-row")?.addEventListener("dblclick", (event) => {
    if (event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const titleField = node.querySelector(".node-header-title");
    if (typeof startNodeGraphModuleTitleEdit === "function" && titleField) {
      startNodeGraphModuleTitleEdit(titleField, event);
    }
  });
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
  node.querySelector(".node-group-output-face")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  attachNodeGraphSolidModuleShellEvents(node);
  node.querySelectorAll(".dsp-node-io-section")
    .forEach((section) => section.addEventListener("pointerdown", beginNodeGraphNodeDrag));
  node.querySelectorAll(".node-parameter-row")
    .forEach((row) => row.addEventListener("pointerdown", beginNodeGraphNodeDrag));
  node.querySelector(".node-module-lip")?.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  node.querySelector(".node-module-lip")?.addEventListener("contextmenu", openNodeModuleActionMenu);
  node.querySelector(".node-bypass-button")?.addEventListener("click", (event) => {
    if (typeof nodeGraphGuardModuleHeaderButtonClick === "function" && nodeGraphGuardModuleHeaderButtonClick(event)) {
      return;
    }
    toggleNodeGraphModuleBypass(event);
  });
  node.querySelector(".node-display-settings-button")?.addEventListener("click", (event) => {
    if (typeof nodeGraphGuardModuleHeaderButtonClick === "function" && nodeGraphGuardModuleHeaderButtonClick(event)) {
      return;
    }
    openNodeModuleDisplaySettings(event);
  });
  node.querySelector(".node-display-settings-button")?.addEventListener("contextmenu", openNodeModuleDisplaySettings);
  node.querySelector(".node-action-button")?.addEventListener("click", (event) => {
    if (typeof nodeGraphGuardModuleHeaderButtonClick === "function" && nodeGraphGuardModuleHeaderButtonClick(event)) {
      return;
    }
    openNodeModuleActionMenu(event);
  });
  node.querySelector(".node-metaparameter-button")?.addEventListener("click", (event) => {
    if (typeof nodeGraphGuardModuleHeaderButtonClick === "function" && nodeGraphGuardModuleHeaderButtonClick(event)) {
      return;
    }
    openNodeModuleMetaparameters(event);
  });
  if (node.classList.contains("module-collapsed")) {
    node.addEventListener("pointerdown", beginNodeGraphNodeDrag);
  }
  node.addEventListener("lostpointercapture", endNodeGraphNodeDrag);
  for (const port of node.querySelectorAll(".node-port")) {
    if (port.closest(".node-io-row")) {
      continue;
    }
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
    row.addEventListener("pointerdown", toggleNodeGraphMonitorFromPortEvent, true);
    row.addEventListener("click", nodeGraphWireInteractions.handlePortClick);
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
  if (nodeId && typeof openNodeKeypadDisplaySettings === "function") {
    const nodeEl = event.currentTarget?.closest?.(".dsp-node");
    if (openNodeKeypadDisplaySettings(event, nodeEl)) {
      return;
    }
  }
  // Shared display inspector (Music Player waveform included).
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
  commitNodeGraphPatch(patch, typeof nodeGraphChromeCommitOptions === "function"
    ? nodeGraphChromeCommitOptions([sourceNode.id], {
      deferLivePlan: true,
      status: ui.oscilloscopeHidden ? "module display hidden" : "module display shown",
    })
    : {
      status: ui.oscilloscopeHidden ? "module display hidden" : "module display shown",
    });
  if (typeof configureNodeSceneContextMenu === "function") {
    configureNodeSceneContextMenu("module");
  }
}

function firstNodeModuleSliderReadout(nodeElement) {
  if (!nodeElement) {
    return null;
  }
  const visibleReadout = [...nodeElement.querySelectorAll(".node-parameter-row")]
    .find((row) => !row.hidden && !row.classList.contains("node-parameter-row-hidden"))
    ?.querySelector(".node-slider-readout");
  if (visibleReadout) {
    return visibleReadout;
  }
  const readout = nodeElement.querySelector(".node-slider-readout");
  if (readout) {
    return readout;
  }
  const slider = nodeElement.querySelector('input[type="range"]');
  if (slider && typeof createNodeSliderReadout === "function") {
    createNodeSliderReadout(slider);
  }
  return nodeElement.querySelector(".node-slider-readout") || null;
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
  commitNodeGraphPatch(patch, typeof nodeGraphChromeCommitOptions === "function"
    ? nodeGraphChromeCommitOptions([sourceNode.id], {
      status: ui.slidersHidden ? "module sliders hidden" : "module sliders shown",
    })
    : {
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
  // Local force-show beats workspace global hide.
  if (node.classList.contains("buttons-forced-visible")) {
    return false;
  }
  return (
    node.classList.contains("buttons-hidden")
    || (
      node.closest(".node-graph-workspace")?.classList.contains("module-buttons-hidden")
      && !node.classList.contains("buttons-forced-visible")
    )
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
    envelopeCurve: "filter-curve-layout",
    roundShape: "filter-curve-layout",
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
    pitchDetector: "pitch-detector-layout",
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
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(shell, "shell");
  }
  const hasInputs = Array.isArray(inputPorts) && inputPorts.length > 0;
  const hasOutputs = Array.isArray(outputPorts) && outputPorts.length > 0;
  const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input")
    || createNodeGraphLayoutBIoColumnPlaceholder("input");
  const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output")
    || createNodeGraphLayoutBIoColumnPlaceholder("output");
  // Layout B default: jacks only (labels-hidden). Modules with layoutBPortLabels
  // keep short labels (→ in / ← out, X/Y, G/T, …) in the side band beside each jack.
  // Empty placeholders stay node-layout-b-io-empty so the face claims that side.
  const showPortLabels = Boolean(nodeGraphModuleDefinitions[type]?.layoutBPortLabels);
  if (hasInputs && !showPortLabels) {
    inputColumn.classList.add("labels-hidden");
  }
  if (hasOutputs && !showPortLabels) {
    outputColumn.classList.add("labels-hidden");
  }
  shell.classList.toggle("layout-b-port-labels", showPortLabels);
  shell.classList.toggle("layout-b-no-inputs", !hasInputs);
  shell.classList.toggle("layout-b-no-outputs", !hasOutputs);
  customBody.classList.add("node-solid-module-custom-ui", "node-module-face");
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
    ? nodeGraphModuleVisibleSliderRowCountForUi(
      type || element.dataset?.nodeType,
      patchUi,
      typeof nodeGraphPatchNode === "function"
        ? nodeGraphPatchNode(element.dataset?.node)
        : null,
    )
    : 0;
  element.classList.toggle("layout-b-no-params", rows <= 0);
}

/** LayoutA I/O strip: ports under the face. */
function createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts, options = {}) {
  const ioSection = document.createElement("div");
  ioSection.className = options.className || "dsp-node-io-section";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(ioSection, "io");
  }
  const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, "input");
  const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, "output");
  // Drive section track widths from each column's longest label (LayoutA
  // used to hard-cap sides at 2gu and clip Frequency / Fidelity / etc.).
  const inCh = Number(inputColumn?.dataset?.maxLabelChars) || 0;
  const outCh = Number(outputColumn?.dataset?.maxLabelChars) || 0;
  if (inCh > 0) {
    ioSection.style.setProperty("--node-io-input-label-ch", String(inCh));
  }
  if (outCh > 0) {
    ioSection.style.setProperty("--node-io-output-label-ch", String(outCh));
  }
  if (options.inputsOnly) {
    ioSection.classList.add("io-inputs-only");
    ioSection.append(inputColumn || document.createElement("div"));
  } else if (options.outputsOnly) {
    ioSection.classList.add("io-outputs-only");
    ioSection.append(outputColumn || document.createElement("div"));
  } else {
    ioSection.append(inputColumn || document.createElement("div"));
    ioSection.append(outputColumn || document.createElement("div"));
  }
  return ioSection;
}

function nodeGraphModuleLayoutAIoOptions(type, inputPorts, outputPorts) {
  if (type === "audioInput" || (typeof nodeGraphPortalIsInletType === "function" && nodeGraphPortalIsInletType(type))) {
    return { outputsOnly: true };
  }
  if (typeof nodeGraphPortalIsOutletType === "function" && nodeGraphPortalIsOutletType(type)) {
    return { inputsOnly: true };
  }
  if (Array.isArray(inputPorts) && inputPorts.length && !(Array.isArray(outputPorts) && outputPorts.length)) {
    return { inputsOnly: true };
  }
  if (Array.isArray(outputPorts) && outputPorts.length && !(Array.isArray(inputPorts) && inputPorts.length)) {
    return { outputsOnly: true };
  }
  return {};
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
  // Browser tooltip on module hover: short use-case from module store catalog.
  const storeEntry = typeof nodeGraphModuleStoreCatalog === "object"
    ? nodeGraphModuleStoreCatalog[type]
    : null;
  if (storeEntry?.description) {
    const name = nodeGraphNodeLabels?.[type] || storeEntry.label || type;
    article.title = `${name}: ${storeEntry.description}`;
  }
  const chrome = typeof nodeGraphModuleChrome === "function"
    ? nodeGraphModuleChrome(type)
    : {
      layout: NodeGraphModuleChromeLayout?.LayoutA || "LayoutA",
      portsBeside: false,
      headerless: false,
      cssLayoutClass: "chrome-layout-a",
    };
  article.dataset.chromeLayout = chrome.layout;
  const isLayoutC = Boolean(chrome.titleIoOnly)
    || chrome.layout === "LayoutC"
    || chrome.layout === (NodeGraphModuleChromeLayout?.LayoutC);
  article.classList.toggle("chrome-layout-a", Boolean(!isLayoutC && (chrome.portsUnder ?? !chrome.portsBeside)));
  article.classList.toggle("chrome-layout-b", Boolean(chrome.portsBeside));
  article.classList.toggle("chrome-layout-c", isLayoutC);
  // Headerless LayoutB (XY Pad contract): shell + params + 1gu bottom clearance.
  // Legacy class name solid-module-layout kept for existing CSS.
  article.classList.toggle("solid-module-layout", Boolean(chrome.headerless));
  article.dataset.portSignature = typeof nodeGraphModulePortSignature === "function"
    ? nodeGraphModulePortSignature(patchNode)
    : `${inputPorts.join(",")}=>${outputPorts.join(",")}`;
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
  article.classList.toggle("buttons-forced-visible", Boolean(patchNodeUi.buttonsForceShow));
  article.classList.toggle("oscilloscope-forced-visible", Boolean(patchNodeUi.oscilloscopeForceShow));
  article.classList.toggle("interface-controls-forced-visible", Boolean(patchNodeUi.interfaceControlsForceShow));
  article.classList.toggle("sliders-forced-visible", Boolean(patchNodeUi.slidersForceShow));
  article.classList.toggle("io-hidden", patchNodeUi.ioHidden);
  article.classList.toggle(
    "unused-hidden",
    Boolean(normalizeNodeGraphPatchNodeUi(patchNode.ui, type).hideUnused),
  );
  article.classList.toggle("interface-controls-hidden", patchNodeUi.interfaceControlsHidden);
  article.classList.toggle("oscilloscope-hidden", patchNodeUi.oscilloscopeHidden);
  article.classList.toggle("sliders-hidden", patchNodeUi.slidersHidden);
  article.classList.toggle("title-hidden", patchNodeUi.titleHidden);
  article.classList.toggle(
    "title-only",
    typeof nodeGraphModuleIsTitleOnlyUi === "function"
      && nodeGraphModuleIsTitleOnlyUi(type, patchNode.ui),
  );
  article.classList.toggle(
    "module-collapsed",
    typeof nodeGraphModuleIsCollapsedUi === "function"
      && nodeGraphModuleIsCollapsedUi(type, patchNode.ui),
  );
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
    // LayoutA chromeless still uses the normal header (title / display gear).
    if (!chrome.headerless && !chrome.portsBeside && !patchNodeUi.titleHidden) {
      article.append(createNodeGraphModuleHeader(type, node, definition));
    }
    const compactTile = typeof nodeGraphChromelessModuleIsCompactTile === "function"
      && nodeGraphChromelessModuleIsCompactTile(type);
    const hasCustomBody = typeof chromelessRegistration.createBody === "function";
    const mountFace = compactTile
      ? hasCustomBody
      : ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
        ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
        : !patchNodeUi.oscilloscopeHidden)
        && hasCustomBody);
    const chromelessBody = mountFace
      ? chromelessRegistration.createBody(node, type)
      : document.createElement("div");
    if (!mountFace && chromelessBody) {
      chromelessBody.className = "node-module-display-placeholder";
      chromelessBody.hidden = true;
      chromelessBody.setAttribute("aria-hidden", "true");
    }
    // LayoutB → ports beside face. LayoutA → face then ports under (labeled I/O strip).
    if (chrome.portsBeside) {
      article.append(
        createNodeGraphLayoutBShell(node, type, chromelessBody, chromelessRegistration, inputPorts, outputPorts),
      );
    } else {
      if (mountFace) {
        article.append(chromelessBody);
      }
      if (!compactTile) {
        appendNodeGraphModuleIoSection(
          article,
          createNodeGraphLayoutAIoSection(
            node,
            type,
            inputPorts,
            outputPorts,
            nodeGraphModuleLayoutAIoOptions(type, inputPorts, outputPorts),
          ),
          node,
          inputPorts,
          outputPorts,
        );
      }
    }
    if (mountFace) {
      chromelessRegistration.afterMount?.(article, chromelessBody, node, type);
    }
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
    // Show both I/O columns when the face declares thrus (Thru →, X/Y, …).
    // Previously inputsOnly hid 1D/2D Phosphor and Trace dry-outs entirely.
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(
        node,
        type,
        inputPorts,
        outputPorts,
        outputPorts.length ? {} : { inputsOnly: true },
      ),
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
      article.append(createNodeGraphMidiModuleBody(node));
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
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphBadvalMonitorBody === "function") {
      article.append(createNodeGraphBadvalMonitorBody(node));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (layout === "pitchDetector") {
    if (typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden) {
      const pitchFace = typeof createNodeGraphPitchDetectorBody === "function"
        ? createNodeGraphPitchDetectorBody(node)
        : null;
      if (pitchFace) {
        article.append(pitchFace);
        if (typeof mountNodeGraphPitchDetectorFace === "function") {
          mountNodeGraphPitchDetectorFace(article, pitchFace, node);
        }
      }
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "filterCurve") {
    // LayoutA filter face — same display hide policy as every other face.
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphFilterCurveDisplay === "function") {
      const curve = createNodeGraphFilterCurveDisplay(node, type);
      article.append(curve);
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (type === "phoneTone") {
    const mountFace = typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden;
    if (mountFace && typeof createNodeGraphPhoneToneDisplay === "function") {
      article.append(createNodeGraphPhoneToneDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "roundShape") {
    // Cheap static sine→square orbit — hideable like every display.
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphRoundShapeDisplay === "function") {
      article.append(createNodeGraphRoundShapeDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "envelopeCurve") {
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphEnvelopeCurveDisplay === "function") {
      article.append(createNodeGraphEnvelopeCurveDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "pitchQuantizer") {
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphPitchQuantizerFace === "function") {
      article.append(createNodeGraphPitchQuantizerFace(node));
    }
  } else if (definition.layout === "chordPad") {
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphChordPadFace === "function") {
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
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
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
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphTextStreamFace === "function") {
      const textFace = createNodeGraphTextStreamFace(node);
      if (textFace) {
        article.append(textFace);
      }
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "wallRoomDisplay") {
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphWallRoomDisplay === "function") {
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
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphPhosphillatorDrawDisplay === "function") {
      article.append(createNodeGraphPhosphillatorDrawDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (definition.layout === "phosphorWaveform") {
    if (typeof createNodeGraphSampleModuleBody === "function") {
      const sampleBody = createNodeGraphSampleModuleBody(node);
      if (sampleBody) {
        article.append(sampleBody);
      }
    }
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphPhosphorWaveformDisplay === "function") {
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
    if ((typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden)
      && typeof createNodeGraphPulseCurveDisplay === "function") {
      article.append(createNodeGraphPulseCurveDisplay(node, type));
    }
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
      node,
      inputPorts,
      outputPorts,
    );
  } else if (isLayoutC) {
    // LayoutC: title (above) + I/O only. No face, no param rows.
    // UC: jacks + labels sit above the construction plate.
    appendNodeGraphModuleIoSection(
      article,
      createNodeGraphLayoutAIoSection(
        node,
        type,
        inputPorts,
        outputPorts,
        nodeGraphModuleLayoutAIoOptions(type, inputPorts, outputPorts),
      ),
      node,
      inputPorts,
      outputPorts,
    );
    if (
      typeof nodeGraphModuleTypeIsUnderConstruction === "function"
      && nodeGraphModuleTypeIsUnderConstruction(type)
      && typeof createNodeGraphUnderConstructionFace === "function"
    ) {
      article.append(createNodeGraphUnderConstructionFace(node, type));
    }
  } else if (chrome.portsBeside) {
    const mountFace = typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden;
    const face = mountFace && typeof createNodeGraphModuleScopeSection === "function"
      ? createNodeGraphModuleScopeSection(node, type)
      : document.createElement("div");
    if (!mountFace) {
      face.className = "node-module-display-placeholder node-module-face";
      face.hidden = true;
      face.setAttribute("aria-hidden", "true");
    }
    article.append(createNodeGraphLayoutBShell(node, type, face, null, inputPorts, outputPorts));
    if (mountFace && typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: face });
    }
  } else {
    let scopeSection = null;
    const underConstruction = typeof nodeGraphModuleTypeIsUnderConstruction === "function"
      && nodeGraphModuleTypeIsUnderConstruction(type);
    // Chromeless LayoutB modules already mounted above — don't add a second face.
    // UC: inlets/outlets first, construction plate under them.
    if (underConstruction) {
      appendNodeGraphModuleIoSection(
        article,
        createNodeGraphLayoutAIoSection(node, type, inputPorts, outputPorts),
        node,
        inputPorts,
        outputPorts,
      );
      if (typeof createNodeGraphUnderConstructionFace === "function") {
        article.append(createNodeGraphUnderConstructionFace(node, type));
      }
    } else if (
      type === "audioInput"
      && (typeof nodeGraphModuleShouldMountDisplayFace === "function"
        ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
        : !patchNodeUi.oscilloscopeHidden)
    ) {
      const statusFace = typeof createNodeGraphAudioInputStatusFace === "function"
        ? createNodeGraphAudioInputStatusFace(node, type)
        : null;
      if (statusFace) {
        article.append(statusFace);
      }
    } else if (typeof nodeGraphModuleShouldMountDisplayFace === "function"
      ? nodeGraphModuleShouldMountDisplayFace(type, patchNode.ui)
      : !patchNodeUi.oscilloscopeHidden) {
      scopeSection = createNodeGraphModuleScopeSection(node, type);
      article.append(scopeSection);
    }
    if ((type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer") && typeof createNodeGraphSampleModuleBody === "function") {
      const sampleBody = createNodeGraphSampleModuleBody(node);
      if (sampleBody) {
        article.append(sampleBody);
      }
    }
    if (scopeSection) {
      registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection });
    }
    if (!underConstruction) {
      appendNodeGraphModuleIoSection(
        article,
        createNodeGraphLayoutAIoSection(
          node,
          type,
          inputPorts,
          outputPorts,
          nodeGraphModuleLayoutAIoOptions(type, inputPorts, outputPorts),
        ),
        node,
        inputPorts,
        outputPorts,
      );
    }
  }

  // Chromeless LayoutB always had params under the shell; LayoutA chromeless
  // (e.g. Soft Fractal multi-out) also needs the param rows.
  // LayoutC never mounts param sliders (title + I/O only).
  if (
    !isLayoutC
    && definition.parameters?.length
    && (!nodeGraphChromelessModuleLayouts.has(layout) || chrome.portsBeside || chrome.portsUnder)
  ) {
    const body = document.createElement("div");
    body.className = "dsp-node-body";
    if (typeof tagNodeGraphModuleBand === "function") {
      tagNodeGraphModuleBand(body, "params");
    }
    const graphInputSection = createNodeGraphInputSection(node, type);
    if (graphInputSection) {
      body.append(graphInputSection);
    }

    for (const parameter of definition.parameters) {
      body.append(createNodeGraphParameter(node, type, parameter));
    }
    article.append(body);
  }

  // Lip is a painted plate band with no other child. Without a hit target,
  // pointer-events:none on .dsp-node lets right-click fall through to the grid.
  const lip = document.createElement("div");
  lip.className = "node-module-lip";
  lip.setAttribute("aria-hidden", "true");
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(lip, "lip");
  }
  article.append(lip);

  if (typeof applyNodeGraphModuleLayout === "function") {
    applyNodeGraphModuleLayout(article, patchNode);
  }
  if (
    typeof scheduleNodeGraphFilterCurveDraw === "function"
    && article.querySelector(".node-filter-curve-display")
  ) {
    scheduleNodeGraphFilterCurveDraw();
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
