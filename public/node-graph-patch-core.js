function nodeGraphBypassGlyph(bypassed) {
  return "\u{1F5F2}";
}

function normalizeNodeGraphPatchParameter(type, key, value, metadata = null) {
  const parameter = nodeGraphModuleDefinitions[type]?.parameters?.find(
    (candidate) => candidate.key === key,
  );
  if (!parameter && type !== "clapPlugin") {
    return null;
  }
  const number = Number(value);
  const fallback = Number(metadata?.def ?? parameter?.defaultValue);
  const candidate = Number.isFinite(number)
    ? number
    : Number.isFinite(fallback)
      ? fallback
      : 0;
  const min = Number(metadata?.min ?? parameter?.min);
  const max = Number(metadata?.max ?? parameter?.max);
  const unboundedMin = Boolean(metadata?.unboundedMin ?? parameter?.unboundedMin);
  const unboundedMax = Boolean(metadata?.unboundedMax ?? parameter?.unboundedMax);
  if (unboundedMin && unboundedMax) {
    return candidate;
  }
  if (unboundedMin && Number.isFinite(max)) {
    return Math.min(candidate, max);
  }
  if (unboundedMax && Number.isFinite(min)) {
    return Math.max(candidate, min);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return candidate;
  }
  return metadata?.wraparound || parameter?.wraparound
    ? wrapNodeSliderValue(candidate, min, max)
    : clampNodeSliderValue(candidate, min, max);
}

// "graph" (per-point curve shape/contour) is retired in favor of "graph2"
// (one global smoothing mode for the whole curve) -- both modules produced
// effectively the same result in practice, and graph2's approach was the
// one working well. Old patches with a "graph" node just drop it, same as
// any other retired type below, rather than crashing on load.
const nodeGraphRetiredNodeTypes = new Set([
  "bipolarKnob",
  "formulaVisual",
  "graph",
  "impulseButton",
  "macroKnob",
  "moduleHome",
  "moduleShop",
  "scriptBox",
]);

/**
 * Legacy phosphorLight → scope2d (2D Phosphor).
 * Ports stay X/Y; settings map color/brightness → dot1Color/dot1Brightness.
 */
function migrateNodeGraphPhosphorLightToScope2d(node) {
  if (!node || String(node.type || "").trim() !== "phosphorLight") {
    return node;
  }
  const src = node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  const migratedSettings = {
    ...src,
    background: src.background ?? src.backgroundColor,
    burn: src.burn,
    decay: src.decay,
    scale: src.scale,
    dot1Size: src.dot1Size,
    lineThickness: src.lineThickness ?? src.dot1Blur,
    pixelDensity: src.pixelDensity,
    dot1Color: src.dot1Color ?? src.color,
    dot1Brightness: src.dot1Brightness ?? src.brightness,
  };
  return {
    ...node,
    type: "scope2d",
    traceDisplaySettings: migratedSettings,
  };
}

function validateNodeGraphPatch(patch) {
  if (!patch || typeof patch !== "object") {
    throw new Error("patch must be an object");
  }

  if (patch.format !== undefined) {
    if (
      patch.format?.kind !== nodeGraphPatchFormat.kind ||
      Number(patch.format?.version) !== nodeGraphPatchFormat.version
    ) {
      throw new Error("unsupported patch format");
    }
  }

  const cameraState = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  const grid = normalizeNodeGraphPatchGrid(patch.grid);
  if (!Number.isFinite(grid.widthPx) || grid.widthPx <= 0) {
    throw new Error("grid.widthPx must be a positive number");
  }
  if (!Number.isFinite(grid.heightPx) || grid.heightPx <= 0) {
    throw new Error("grid.heightPx must be a positive number");
  }

  if (!Array.isArray(patch.nodes)) {
    throw new Error("nodes must be an array");
  }

  const retiredNodeTypes = nodeGraphRetiredNodeTypes;
  const retiredNodeIds = new Set(
    patch.nodes
      .filter((node) => retiredNodeTypes.has(String(node.type || "").trim()))
      .map((node) => String(node.id || "").trim())
      .filter(Boolean),
  );
  const ids = new Set();
  const nodes = patch.nodes
    .filter((node) => !retiredNodeTypes.has(String(node.type || "").trim()))
    .map((rawNode) => migrateNodeGraphPhosphorLightToScope2d(rawNode))
    .map((node) => {
    const id = String(node.id || "").trim();
    const type = String(node.type || "").trim();
    if (!id) {
      throw new Error("node id missing");
    }
    if (ids.has(id)) {
      throw new Error(`duplicate node id ${id}`);
    }
    if (!Object.hasOwn(nodeGraphModuleDefinitions, type)) {
      throw new Error(`unknown node type ${type}`);
    }
    if (type === "output" && id !== "output") {
      throw new Error("output module id must be output");
    }
    const gx = roundNodeGraphGridCoordinate(Number(node.gx));
    const gy = roundNodeGraphGridCoordinate(Number(node.gy));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
      throw new Error(`node ${id} grid position invalid`);
    }
    const sizingCapabilities = nodeGraphModuleSizingCapabilities(type);
    const hasCustomWidth = sizingCapabilities.width && Object.hasOwn(node, "widthGu");
    const widthGu = hasCustomWidth ? normalizeNodeGraphModuleWidthUnits(type, node.widthGu) : null;
    if (hasCustomWidth && !Number.isFinite(Number(node.widthGu))) {
      throw new Error(`node ${id} widthGu invalid`);
    }
    const hasCustomModuleHeight = ["custom", "textBox"].includes(sizingCapabilities.moduleHeight)
      && Object.hasOwn(node, "heightGu");
    const heightGu = hasCustomModuleHeight
      ? sizingCapabilities.moduleHeight === "textBox"
        ? normalizeNodeGraphTextBoxHeightUnits(node.heightGu)
        : normalizeNodeGraphModuleHeightUnits(type, node.heightGu, node.ui)
      : null;
    if (hasCustomModuleHeight && !Number.isFinite(Number(node.heightGu))) {
      throw new Error(`node ${id} heightGu invalid`);
    }
    const params = {};
    const paramMeta = {};
    for (const parameter of nodeGraphModuleDefinitions[type].parameters || []) {
      const metadata = normalizeNodeGraphPatchParameterMetadata(
        type,
        parameter.key,
        node.paramMeta?.[parameter.key],
      );
      paramMeta[parameter.key] = metadata;
      let value = Object.hasOwn(node.params || {}, parameter.key)
        ? node.params[parameter.key]
        : parameter.defaultValue;
      // Smooth Graph Curve: collapse old 6-choice layout (Linear/Smooth/Bezier/
      // Quadratic/Cubic/Catmull) where Smooth/Bezier/Catmull were one path.
      // Detect old layout via saved max≥5 or orphan indices 4–5.
      if (type === "graph2" && parameter.key === "smoothingMode") {
        const sourceMax = Number(node.paramMeta?.[parameter.key]?.max);
        const n = Math.round(Number(value));
        const looksLegacySix = (Number.isFinite(sourceMax) && sourceMax >= 5)
          || n === 4
          || n === 5;
        if (looksLegacySix && typeof nodeGraphGraph2SmoothingModeFourIndexFromLegacy === "function") {
          value = nodeGraphGraph2SmoothingModeFourIndexFromLegacy(value);
        } else if (looksLegacySix) {
          // Fallback if graph-utils not loaded yet (plan/worklet paths).
          const six = [0, 1, 1, 2, 3, 1];
          value = Number.isFinite(n) && n >= 0 && n < six.length ? six[n] : 1;
        }
      }
      params[parameter.key] = normalizeNodeGraphPatchParameter(
        type,
        parameter.key,
        value,
        metadata,
      );
    }
    if (type === "clapPlugin") {
      for (const [key, sourceMetadata] of Object.entries(node.paramMeta || {})) {
        if (Object.hasOwn(paramMeta, key)) {
          continue;
        }
        const metadata = normalizeNodeGraphPatchParameterMetadata(type, key, sourceMetadata);
        if (!metadata) {
          continue;
        }
        paramMeta[key] = metadata;
        params[key] = normalizeNodeGraphPatchParameter(
          type,
          key,
          Object.hasOwn(node.params || {}, key) ? node.params[key] : metadata.def,
          metadata,
        );
      }
    }
    ids.add(id);
    const normalizedNode = {
      gx,
      gy,
      id,
      paramMeta,
      params,
      type,
      ...(Object.keys(normalizeNodeGraphPatchPortMeta(node.portMeta)).length
        ? { portMeta: normalizeNodeGraphPatchPortMeta(node.portMeta) }
        : {}),
      ...(normalizeNodeGraphPatchNodeAlias(node.alias)
        ? { alias: normalizeNodeGraphPatchNodeAlias(node.alias) }
        : {}),
      ...(hasCustomWidth ? { widthGu } : {}),
      ...(hasCustomModuleHeight ? { heightGu } : {}),
    };
    if (nodeGraphModuleDefinitions[type].layout === "textBox") {
      normalizedNode.layout = normalizeNodeGraphTextBoxLayout(node.layout);
    } else if (nodeGraphModuleDefinitions[type].layout === "image") {
      normalizedNode.layout = normalizeNodeGraphImageLayout(node.layout);
    } else if (nodeGraphModuleDefinitions[type].layout === "led") {
      normalizedNode.led = normalizeNodeGraphLedLayout(node.led);
    }
    if (nodeGraphModuleIsGraphType(type)) {
      const phaseLinkedGraph = nodeGraphGraphWithPhaseCursor(normalizedNode, node.graph);
      normalizedNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(normalizedNode)
        ? nodeGraphGraphWithLockedEndpointY(phaseLinkedGraph)
        : phaseLinkedGraph;
    }
    if (type === "codeblock") {
      normalizedNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock);
    }
    if (type === "customDisplay") {
      normalizedNode.customDisplay = normalizeNodeGraphCustomDisplay(node.customDisplay);
    }
    if (type === "bugButton") {
      normalizedNode.bugButton = {
        glyph: normalizeNodeGraphBugButtonGlyph(node.bugButton?.glyph),
      };
    }
    if (type === "valueSlider" && typeof normalizeNodeGraphValueSliderFace === "function") {
      const face = normalizeNodeGraphValueSliderFace(node.valueSliderFace);
      if (typeof nodeGraphValueSliderFaceIsNonDefault === "function"
        ? nodeGraphValueSliderFaceIsNonDefault(face)
        : (face.mid?.dataUrl || face.bottom?.dataUrl || face.top?.dataUrl || face.rotateLikeKnob)) {
        normalizedNode.valueSliderFace = face;
      }
    }
    const normalizedPortScripts = normalizeNodeGraphPortScripts(type, node.portScripts);
    if (normalizedPortScripts) {
      normalizedNode.portScripts = normalizedPortScripts;
    }
    if (type === "canvas") {
      normalizedNode.canvasScript = normalizeNodeGraphCanvasScript(node.canvasScript);
    }
    if (type === "screenSpaceShader") {
      normalizedNode.screenSpaceShader = normalizeNodeGraphScreenSpaceShader(node.screenSpaceShader);
    }
    Object.assign(normalizedNode, cloneNodeGraphTypedDisplaySettings(node));
    if (Object.hasOwn(node, "scopeShader")) {
      normalizedNode.scopeShader = normalizeNodeGraphScopeShader(node.scopeShader);
    }
    if (type === "moduleGroup") {
      normalizedNode.moduleGroup = normalizeNodeGraphModuleGroup(node.moduleGroup);
    }
    if (type === "clapPlugin") {
      normalizedNode.clap = normalizeNodeGraphClapPluginBinding(node.clap);
    }
    if (
      (type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer") &&
      normalizeNodeGraphSampleId(node.sample?.id)
    ) {
      normalizedNode.sample = { id: normalizeNodeGraphSampleId(node.sample?.id) };
    }
    if (type === "audioPlayer" && Object.hasOwn(node, "phosphorWaveformSettings")) {
      normalizedNode.phosphorWaveformSettings = normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings);
    }
    // Remembered playhead (0..1) so Music Player restores position after refresh.
    if (type === "audioPlayer" && Object.hasOwn(node, "samplePhase")) {
      const samplePhase = Number(node.samplePhase);
      if (Number.isFinite(samplePhase)) {
        normalizedNode.samplePhase = Math.max(0, Math.min(1, samplePhase));
      }
    }
    if (type === "phosphillator") {
      const drawnPath = normalizeNodeGraphPhosphillatorDrawnPath(node.drawnPath);
      if (drawnPath) {
        normalizedNode.drawnPath = drawnPath;
      }
    }
    const ui = nodeGraphModuleDefinitions[type].layout === "textBox" && !Object.hasOwn(node, "ui")
      ? { buttonsHidden: true }
      : normalizeNodeGraphPatchNodeUi(node.ui, node.type);
    ui.displayModeKey = normalizeNodeGraphPatchNodeDisplayModeKey(type, ui.displayModeKey);
    if (ui.buttonsHidden || ui.displayModeKey || ui.ioHidden || ui.interfaceControlsHidden || ui.movementLocked || ui.titleHidden || ui.oscilloscopeHidden || ui.slidersHidden || ui.displayHeightOffsetGu) {
      normalizedNode.ui = ui;
    }
    return normalizedNode;
  });
  const uiItems = normalizeNodeGraphPatchUiItems(patch.uiItems, { nodeIds: ids });

  const bypassedNodes = [];
  const bypassedNodeIds = new Set();
  if (patch.bypassedNodes !== undefined && !Array.isArray(patch.bypassedNodes)) {
    throw new Error("bypassedNodes must be an array");
  }
  for (const value of patch.bypassedNodes || []) {
    const id = String(value || "").trim();
    if (!id) {
      throw new Error("bypassedNodes entry missing node id");
    }
    if (!ids.has(id)) {
      throw new Error(`bypassed node missing: ${id}`);
    }
    if (id === "output") {
      throw new Error("output module cannot be bypassed");
    }
    if (!bypassedNodeIds.has(id)) {
      bypassedNodeIds.add(id);
      bypassedNodes.push(id);
    }
  }

  const connectionKeys = new Set();
  const connections = (Array.isArray(patch.connections) ? patch.connections : []).flatMap((connection) => {
    const sourceNode = String(connection.sourceNode || "").trim();
    let sourcePort = String(connection.sourcePort || "").trim();
    const destinationNode = String(connection.destinationNode || "").trim();
    let destinationPort = String(connection.destinationPort || "").trim();
    const sourceType = nodes.find((node) => node.id === sourceNode)?.type;
    const destinationType = nodes.find((node) => node.id === destinationNode)?.type;
    if (!sourceType || !destinationType) {
      if (retiredNodeIds.has(sourceNode) || retiredNodeIds.has(destinationNode)) {
        return [];
      }
      throw new Error("connection references missing node");
    }
    sourcePort = nodeGraphCanonicalOutputPort(sourceType, sourcePort);
    if (!nodeGraphPatchNodeOutputPorts(nodes.find((node) => node.id === sourceNode)).includes(sourcePort)) {
      throw new Error(`connection source port invalid: ${sourceNode}.${sourcePort}`);
    }
    if (destinationType === "output" && destinationPort === "In") {
      destinationPort = "Mono";
    }
    destinationPort = nodeGraphCanonicalInputPort(destinationType, destinationPort);
    if (!nodeGraphPatchNodeInputPorts(nodes.find((node) => node.id === destinationNode)).includes(destinationPort)) {
      throw new Error(`connection destination port invalid: ${destinationNode}.${destinationPort}`);
    }
    const key = `${sourceNode}.${sourcePort}->${destinationNode}.${destinationPort}`;
    if (connectionKeys.has(key)) {
      return [];
    }
    connectionKeys.add(key);
    return [{
      destinationNode,
      destinationPort,
      sourceNode,
      sourcePort,
      ...(typeof nodeGraphWireOptionalPatchFields === "function"
        ? nodeGraphWireOptionalPatchFields(connection)
        : {
          ...(nodeGraphWireTypePatchValue(connection.wireType)
            ? { wireType: nodeGraphWireTypePatchValue(connection.wireType) }
            : {}),
          ...(normalizeNodeGraphTracePoints(connection.tracePoints).length
            ? { tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints) }
            : {}),
        }),
    }];
  });

  const modulationKeys = new Set();
  const modulations = (Array.isArray(patch.modulations) ? patch.modulations : [])
    .flatMap((modulation) => {
      const sourceNode = String(modulation.sourceNode || "").trim();
      let sourcePort = String(modulation.sourcePort || "").trim();
      const destinationNode = String(modulation.destinationNode || "").trim();
      const destinationParam = String(modulation.destinationParam || "").trim();
      if (!sourceNode || !sourcePort || !destinationNode || !destinationParam) {
        throw new Error("modulation entries require sourceNode, sourcePort, destinationNode, destinationParam");
      }
      const sourceType = nodes.find((node) => node.id === sourceNode)?.type;
      const destinationType = nodes.find((node) => node.id === destinationNode)?.type;
      if (!sourceType || !destinationType) {
        if (retiredNodeIds.has(sourceNode) || retiredNodeIds.has(destinationNode)) {
          return [];
        }
        throw new Error("modulation references missing node");
      }
      sourcePort = nodeGraphCanonicalOutputPort(sourceType, sourcePort);
      if (!nodeGraphPatchNodeOutputPorts(nodes.find((node) => node.id === sourceNode)).includes(sourcePort)) {
        throw new Error(`modulation source port invalid: ${sourceNode}.${sourcePort}`);
      }
      const destinationPatchNode = nodes.find((node) => node.id === destinationNode);
      if (!nodeGraphPatchNodeParameterDefinitions(destinationPatchNode).some((parameter) => parameter.key === destinationParam)) {
        throw new Error(`modulation destination parameter invalid: ${destinationNode}.${destinationParam}`);
      }
      const key = `${sourceNode}.${sourcePort}->${destinationNode}.${destinationParam}`;
      if (modulationKeys.has(key)) {
        return [];
      }
      modulationKeys.add(key);
      return [{
        destinationNode,
        destinationParam,
        sourceNode,
        sourcePort,
        ...(typeof nodeGraphWireOptionalPatchFields === "function"
          ? nodeGraphWireOptionalPatchFields(modulation)
          : {
            ...(nodeGraphWireTypePatchValue(modulation.wireType)
              ? { wireType: nodeGraphWireTypePatchValue(modulation.wireType) }
              : {}),
            ...(normalizeNodeGraphTracePoints(modulation.tracePoints).length
              ? { tracePoints: normalizeNodeGraphTracePoints(modulation.tracePoints) }
              : {}),
          }),
      }];
    });

  const graphConnectionKeys = new Set();
  const graphConnections = Array.isArray(patch.graphConnections) ? patch.graphConnections.flatMap((connection) => {
    const sourceNode = String(connection.sourceNode || "").trim();
    let sourcePort = String(connection.sourcePort || "").trim();
    const destinationNode = String(connection.destinationNode || "").trim();
    const destinationGraphInput = String(connection.destinationGraphInput || "").trim();
    if (!sourceNode || !sourcePort || !destinationNode || !destinationGraphInput) {
      throw new Error("graph connection entries require sourceNode, sourcePort, destinationNode, destinationGraphInput");
    }
    const sourcePatchNode = nodes.find((node) => node.id === sourceNode);
    const destinationPatchNode = nodes.find((node) => node.id === destinationNode);
    const sourceType = sourcePatchNode?.type;
    const destinationType = destinationPatchNode?.type;
    if (!sourceType || !destinationType) {
      throw new Error("graph connection references missing node");
    }
    sourcePort = nodeGraphCanonicalOutputPort(sourceType, sourcePort);
    if (!nodeGraphModuleIsGraphType(sourceType) || sourcePort !== "Out") {
      throw new Error(`graph connection source must be Graph.Out or Graph 2.Out: ${sourceNode}.${sourcePort}`);
    }
    if (!nodeGraphModuleGraphInputs(destinationType).includes(destinationGraphInput)) {
      throw new Error(`graph connection destination invalid: ${destinationNode}.${destinationGraphInput}`);
    }
    const key = `${sourceNode}.${sourcePort}->${destinationNode}.${destinationGraphInput}`;
    if (graphConnectionKeys.has(key)) {
      return [];
    }
    graphConnectionKeys.add(key);
    return [{
      destinationGraphInput,
      destinationNode,
      sourceNode,
      sourcePort,
      ...(typeof nodeGraphWireOptionalPatchFields === "function"
        ? nodeGraphWireOptionalPatchFields(connection)
        : {
          ...(nodeGraphWireTypePatchValue(connection.wireType)
            ? { wireType: nodeGraphWireTypePatchValue(connection.wireType) }
            : {}),
          ...(normalizeNodeGraphTracePoints(connection.tracePoints).length
            ? { tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints) }
            : {}),
        }),
    }];
  }) : [];

  const view = normalizeNodeGraphPatchView(patch.view);
  if (view.widthGu && view.widthGu < nodeGraphWorkspaceViewLimits.minWidthGu) {
    throw new Error(`view.widthGu must be 0 or at least ${nodeGraphWorkspaceViewLimits.minWidthGu}`);
  }
  if (view.heightGu && view.heightGu < nodeGraphWorkspaceViewLimits.minHeightGu) {
    throw new Error(`view.heightGu must be 0 or at least ${nodeGraphWorkspaceViewLimits.minHeightGu}`);
  }

  return {
    activeCameraId: cameraState.activeCameraId,
    audio: normalizeNodeGraphPatchAudio(patch.audio),
    bypassedNodes,
    cameras: cameraState.cameras,
    codeScreen: normalizeNodeGraphCodeScreen(patch.codeScreen),
    connections,
    format: { ...nodeGraphPatchFormat },
    graphConnections,
    grid,
    info: normalizeNodeGraphPatchInfo(patch.info),
    modularOnlyControlsVisible: Boolean(patch.modularOnlyControlsVisible),
    modulations,
    monitors: normalizeNodeGraphPatchMonitors(patch.monitors, {
      ...patch,
      nodes,
    }),
    nodes,
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch({
        ...patch,
        nodes,
        samples: typeof normalizeNodeGraphPatchSamples === "function"
          ? normalizeNodeGraphPatchSamples(patch.samples)
          : [],
      })
      : [],
    samples: typeof normalizeNodeGraphPatchSamples === "function"
      ? normalizeNodeGraphPatchSamples(patch.samples)
      : [],
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems,
    view,
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: normalizeNodeGraphPatchWindows(patch.windows),
  };
}

function loadNodeGraphPatchFromScript(text) {
  try {
    return validateNodeGraphPatch(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`script JSON parse failed: ${error.message}`);
    }
    throw new Error(`script validation failed: ${error.message}`);
  }
}

function nodeGraphModuleShouldBeVisible(node) {
  const type = typeof node === "string" ? nodeGraphPatchNodeType(node) : node?.type;
  return type !== "audioInput" || Boolean(nodeGraphMvp.live.inputActive);
}

function nodeGraphPatchNodeIsVisible(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  return Boolean(
    node &&
    nodeGraphModuleShouldBeVisible(node),
  );
}

function applyNodeGraphPatchToDom() {
  const container = document.getElementById("nodeGraphNodes");
  if (!container) {
    return;
  }

  applyNodeGraphWorkspaceView();
  const workspace = document.getElementById("nodeGraphWorkspace");
  const visiblePatchNodeCount = nodeGraphMvp.patch.nodes.filter((node) => nodeGraphModuleShouldBeVisible(node)).length;
  workspace?.classList.toggle("empty-patch", visiblePatchNodeCount === 0);
  const emptyButton = document.getElementById("nodeGraphEmptyModuleButton");
  if (emptyButton) {
    emptyButton.hidden = true;
  }

  for (const element of [...container.querySelectorAll(".dsp-node")]) {
    if (!nodeGraphPatchNode(element.dataset.node)) {
      element.remove();
    }
  }

  for (const patchNode of nodeGraphMvp.patch.nodes) {
    let element = nodeGraphNodeElement(patchNode.id);
    const outputPorts = nodeGraphPatchNodeOutputPorts(patchNode).filter(
      (port) => !(nodeGraphModuleDefinitions[patchNode.type]?.parameters || []).some((parameter) => parameter.key === port),
    );
    const portSignature = `${nodeGraphPatchNodeInputPorts(patchNode).join(",")}=>${outputPorts.join(",")}=>${nodeGraphModuleGraphInputs(patchNode.type).join(",")}`;
    const patchNodeUi = nodeGraphEffectivePatchNodeUi(patchNode.ui, patchNode.type);
    // Headerless LayoutB mounts/unmounts the title bar with titleHidden — rebuild
    // when that changes (scope-hidden already forces a rebuild for LayoutA displays).
    const structuralUiSignature = [
      patchNodeUi.oscilloscopeHidden ? "scope-hidden" : "scope-visible",
      patchNodeUi.titleHidden ? "title-hidden" : "title-visible",
    ].join("|");
    if (
      element &&
      (
        element.dataset.nodeType !== patchNode.type ||
        element.dataset.portSignature !== portSignature ||
        element.dataset.structuralUiSignature !== structuralUiSignature
      )
    ) {
      element.remove();
      element = null;
    }
    if (!element) {
      element = createNodeGraphModuleElement(patchNode.type, patchNode.id);
      container.append(element);
    }
    element.style.setProperty("--node-grid-width-units", String(nodeGraphPatchNodeGridWidthUnits(patchNode)));
    element.style.setProperty("--node-grid-height-units", String(nodeGraphPatchNodeGridHeightUnits(patchNode)));
    if (typeof nodeGraphApplyModuleShellHeightCssVars === "function") {
      nodeGraphApplyModuleShellHeightCssVars(element, patchNode);
    } else {
      element.style.setProperty("--node-module-display-height-units", String(nodeGraphPatchNodeDisplayHeightUnits(patchNode)));
    }
    element.style.setProperty("--node-module-interface-controls-height-units", String(nodeGraphPatchNodeInterfaceControlsHeightUnits(patchNode)));
    const point = nodeGraphGridToPixel(patchNode);
    positionNodeGraphNode(element, point, { clamp: false, snap: false });
    element.hidden = !nodeGraphModuleShouldBeVisible(patchNode);
    element.dataset.gridX = String(patchNode.gx);
    element.dataset.gridY = String(patchNode.gy);
    element.dataset.structuralUiSignature = structuralUiSignature;
    const titleText = element.querySelector(".node-header-title");
    if (titleText) {
      // Chrome bar always shows type/plugin name — never the user alias.
      const chromeTitle = typeof nodeGraphModuleChromeTitle === "function"
        ? nodeGraphModuleChromeTitle(patchNode)
        : nodeGraphDefaultNodeTitle(patchNode.type, patchNode.id);
      if (titleText.tagName === "INPUT") {
        if (document.activeElement !== titleText) {
          titleText.value = chromeTitle;
        }
      } else {
        titleText.textContent = chromeTitle;
      }
    }
    element.classList.toggle("buttons-hidden", patchNodeUi.buttonsHidden);
    element.classList.toggle("io-hidden", patchNodeUi.ioHidden);
    element.classList.toggle("interface-controls-hidden", patchNodeUi.interfaceControlsHidden);
    element.classList.toggle("movement-locked", patchNodeUi.movementLocked);
    element.classList.toggle("oscilloscope-hidden", patchNodeUi.oscilloscopeHidden);
    element.classList.toggle("sliders-hidden", patchNodeUi.slidersHidden);
    element.classList.toggle("title-hidden", patchNodeUi.titleHidden);
    if (typeof syncNodeGraphLayoutBNoParamsClass === "function") {
      syncNodeGraphLayoutBNoParamsClass(element, patchNode.type, patchNodeUi);
    }
    const dragHandle = element.querySelector(".node-drag-handle");
    if (dragHandle) {
      dragHandle.textContent = patchNodeUi.movementLocked ? "\uD83D\uDD12" : "\u2725";
      dragHandle.setAttribute(
        "aria-label",
        patchNodeUi.movementLocked
          ? `Unlock ${nodeGraphNodeDisplayName(patchNode.id)} module movement`
          : `Move ${nodeGraphNodeDisplayName(patchNode.id)} module`,
      );
      dragHandle.classList.toggle("node-drag-handle-locked", patchNodeUi.movementLocked);
    }
    const displayButton = element.querySelector(".node-display-settings-button");
    if (displayButton) {
      displayButton.setAttribute("aria-pressed", patchNodeUi.oscilloscopeHidden ? "false" : "true");
    }
    const metaparameterButton = element.querySelector(".node-metaparameter-button");
    if (metaparameterButton) {
      metaparameterButton.setAttribute("aria-pressed", patchNodeUi.slidersHidden ? "false" : "true");
    }
    const bypassed = nodeGraphNodeDisplaysBypassed(patchNode.id);
    element.classList.toggle("bypassed", bypassed);
    const bypassButton = element.querySelector(".node-bypass-button");
    if (bypassButton) {
      bypassButton.setAttribute("aria-pressed", bypassed ? "true" : "false");
      bypassButton.textContent = nodeGraphBypassGlyph(bypassed);
      nodeGraphApplyTooltip(
        bypassButton,
        patchNode.id === "output"
          ? (bypassed ? "module.outputOn" : "module.outputOff")
          : (bypassed ? "module.include" : "module.bypass"),
        {},
        { title: false },
      );
    }
    for (const parameter of nodeGraphModuleDefinitions[patchNode.type]?.parameters || []) {
      const input = element.querySelector(`input[data-param="${CSS.escape(parameter.key)}"]`);
      if (!input) {
        continue;
      }
      setNodeSliderMetadata(
        input,
        patchNode.paramMeta?.[parameter.key] ||
        nodeGraphParameterDefinitionMetadata(parameter),
      );
      const value = patchNode.params?.[parameter.key] ??
        nodeGraphParameterFallback(patchNode.type, parameter.key);
      if (typeof applyNodeGraphInputUnboundedValue === "function") {
        applyNodeGraphInputUnboundedValue(input, value);
      }
      input.value = String(value);
      syncNodeSliderReadout(input);
    }
    if (typeof syncNodeGraphParameterVisualsForNodeElement === "function") {
      syncNodeGraphParameterVisualsForNodeElement(element);
    } else {
      for (const visual of element.querySelectorAll("[data-parameter-visual]")) {
        visual.syncFromParameters?.();
      }
    }
    if (typeof syncNodeGraphModulePortLabels === "function") {
      syncNodeGraphModulePortLabels(element, patchNode);
    }
    if (nodeGraphModuleDefinitions[patchNode.type]?.layout === "textBox") {
      syncNodeGraphTextBoxElement(element, patchNode);
    } else if (nodeGraphModuleDefinitions[patchNode.type]?.layout === "graph") {
      syncNodeGraphGraphElement(element, patchNode);
    } else if (
      nodeGraphModuleDefinitions[patchNode.type]?.layout === "clapPlugin" &&
      typeof syncNodeGraphClapPluginElement === "function"
    ) {
      syncNodeGraphClapPluginElement(element, patchNode);
    }
  }
  syncNodeGraphInputModuleLiveState();
  if (typeof bindNodeGraphMacroControlModuleEvents === "function") {
    bindNodeGraphMacroControlModuleEvents();
  }
  if (typeof renderNodeGraphKeyboardControllerModules === "function") {
    renderNodeGraphKeyboardControllerModules();
  }
  if (typeof renderNodeGraphCameraView === "function") {
    renderNodeGraphCameraView();
  }
  syncNodeGraphHeaderTimingWidgets();
  updateNodeGraphGridHeatmap();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
  if (typeof syncNodeGraphModuleFramesAfterDom === "function") {
    syncNodeGraphModuleFramesAfterDom();
  }
  // Bottom 🔊 mirrors Output.volume + Input.level after every full DOM rebuild.
  if (typeof syncNodeGraphLiveVolumeMirrorsFromModules === "function") {
    syncNodeGraphLiveVolumeMirrorsFromModules();
  } else if (typeof syncNodeGraphLiveOutputVolumeFromOutputModule === "function") {
    syncNodeGraphLiveOutputVolumeFromOutputModule();
  }
}

/**
 * Layout-only path after module drag: positions are already on the DOM.
 * Avoid full applyNodeGraphPatchToDom (re-syncs every slider / face / knob),
 * live plan rebuild, and render-pending — none of those depend on gx/gy.
 */
function applyNodeGraphLayoutPositionsToDom(patch = nodeGraphMvp.patch) {
  for (const patchNode of patch?.nodes || []) {
    const element = typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(patchNode.id)
      : null;
    if (!element) {
      continue;
    }
    const point = typeof nodeGraphGridToPixel === "function"
      ? nodeGraphGridToPixel(patchNode)
      : null;
    if (point && typeof positionNodeGraphNode === "function") {
      positionNodeGraphNode(element, point, { clamp: false, snap: false });
    }
    element.dataset.gridX = String(patchNode.gx);
    element.dataset.gridY = String(patchNode.gy);
  }
  if (typeof updateNodeGraphGridHeatmap === "function") {
    updateNodeGraphGridHeatmap();
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
}

function commitNodeGraphPatch(patch, options = {}) {
  const isWireEdit = Boolean(options.wireEdit);
  // layoutEdit: module move / snap only — skip DOM rebuild + audio plan + render pending.
  const isLayoutEdit = Boolean(options.layoutEdit);
  nodeGraphMvp.patch = cloneNodeGraphPatch(validateNodeGraphPatch(patch));
  if (typeof preserveNodeGraphEditorZoomOnPatch === "function") {
    preserveNodeGraphEditorZoomOnPatch(nodeGraphMvp.patch);
  }
  syncNodeGraphRuntimeFromPatch();
  if (isLayoutEdit) {
    applyNodeGraphLayoutPositionsToDom(nodeGraphMvp.patch);
  } else if (!isWireEdit) {
    applyNodeGraphPatchToDom();
    if (typeof applyNodeGraphZoom === "function") {
      applyNodeGraphZoom();
    }
    syncNodeGraphMonitorIndicators();
    pruneNodeGraphSelectionAfterPatch();
  }
  // Positions do not change offline render output; keep existing render sample.
  if (options.markPending !== false && !isLayoutEdit) {
    markNodeGraphRenderPending();
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
  if (options.patchDirtyState) {
    nodeGraphMvp.patchDirtyState = options.patchDirtyState;
  } else if (options.autosaveWorkingPatch !== false) {
    nodeGraphMvp.patchDirtyState = "edited";
  }
  // Audio graph topology/params are unchanged by gx/gy — no plan push.
  if (!isLayoutEdit) {
    scheduleNodeGraphLivePlanSync();
  }

  const runDeferredUiPanels = () => {
    if (!isLayoutEdit) {
      renderNodePalette();
      renderNodeGraphConnectionList();
      syncNodeGraphGhostSliders();
      syncNodeGraphFilterCurveDisplays();
      renderNodeGraphVisualSettings();
      syncNodeGraphSettingsView();
      if (typeof renderNodeGraphMissingSampleAssetsDialog === "function") {
        renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
      }
      if (typeof renderNodeGraphCodeScreen === "function" && !document.getElementById("nodeCodeScreenView")?.hidden) {
        renderNodeGraphCodeScreen();
      }
      const scriptStatus = nodeGraphPatchScriptStatus(
        options.status || "script synced",
        options.ok ?? true,
      );
      syncNodeGraphScriptView(scriptStatus.message, scriptStatus.ok);
    } else if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
      // Light header dirty-state only — no full script panel rewrite.
      syncNodeGraphCurrentSavedPatchHeader();
    }
    if (options.record !== false) {
      recordNodeGraphHistory();
    } else {
      renderNodeGraphHistoryControls();
    }
    if (options.autosaveWorkingPatch !== false && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings();
    } else if (typeof syncNodeGraphCurrentSavedPatchHeader === "function" && !isLayoutEdit) {
      syncNodeGraphCurrentSavedPatchHeader();
    }
  };

  if (isWireEdit || isLayoutEdit) {
    window.requestAnimationFrame(() => {
      window.setTimeout(runDeferredUiPanels, 0);
    });
  } else {
    runDeferredUiPanels();
  }
}

function clearNodeGraphWires() {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.connections = [];
  patch.graphConnections = [];
  patch.modulations = [];
  setNodeGraphSelection(null);
  markNodeGraphRenderPending();
  commitNodeGraphPatch(patch, { status: "wires cleared" });
}

function deleteSelectedNodeGraphItem() {
  if (!nodeGraphScriptReadyForGraphAction("delete")) {
    return;
  }
  const selection = nodeGraphMvp.selected;
  if (!selection) {
    return;
  }

  if (selection.type === "wire") {
    disconnectNodeGraphConnection(selection.index, selection.kind || "signal");
    return;
  }

  const selectedNodeIds = nodeGraphSelectedNodeIds(selection);
  const hideOnlyNodeIds = new Set();
  const removableNodeIds = new Set();
  for (const nodeId of selectedNodeIds) {
    const node = nodeGraphPatchNode(nodeId);
    if (!nodeGraphNodeCanBeDeleted(node)) {
      continue;
    }
    if (nodeGraphNodeDeleteHidesOnly(node)) {
      hideOnlyNodeIds.add(nodeId);
    } else {
      removableNodeIds.add(nodeId);
    }
  }

  if (hideOnlyNodeIds.size) {
    nodeGraphMvp.live.inputActive = false;
    stopNodeGraphLiveInputSource();
  }

  if (removableNodeIds.size) {
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    patch.nodes = patch.nodes.filter((node) => !removableNodeIds.has(node.id));
    patch.bypassedNodes = patch.bypassedNodes.filter((nodeId) => !removableNodeIds.has(nodeId));
    patch.connections = patch.connections.filter(
      (connection) =>
        !removableNodeIds.has(connection.sourceNode) &&
        !removableNodeIds.has(connection.destinationNode),
    );
    patch.modulations = patch.modulations.filter(
      (modulation) =>
        !removableNodeIds.has(modulation.sourceNode) &&
        !removableNodeIds.has(modulation.destinationNode),
    );
    patch.graphConnections = patch.graphConnections.filter(
      (connection) =>
        !removableNodeIds.has(connection.sourceNode) &&
        !removableNodeIds.has(connection.destinationNode),
    );
    setNodeGraphSelection(null);
    commitNodeGraphPatch(patch, {
      status: removableNodeIds.size === 1 ? "module deleted" : "modules deleted",
    });
    renderNodeGraphLiveControls();
    return;
  }

  if (hideOnlyNodeIds.size) {
    setNodeGraphSelection(null);
    applyNodeGraphPatchToDom();
    drawNodeGraphWires();
    scheduleNodeGraphLivePlanSync();
    renderNodeGraphLiveControls();
    setNodeGraphScriptStatus("input module hidden; script preserved", true);
  }
}

function nodeGraphStableSeed(text) {
  let seed = 0x12345678;
  for (const character of text) {
    seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
  }
  return seed || 0x12345678;
}
