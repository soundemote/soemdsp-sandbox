function cloneNodeGraphParamMeta(paramMeta = {}) {
  return Object.fromEntries(
    Object.entries(paramMeta || {}).map(([key, metadata]) => [
      key,
      {
        ...(metadata || {}),
        choices: [...(metadata?.choices || [])],
      },
    ]),
  );
}

function normalizeNodeGraphParamMetaForNode(type, paramMeta = {}) {
  const metadata = cloneNodeGraphParamMeta(paramMeta);
  if (type === "output" && metadata.volume) {
    metadata.volume = {
      ...metadata.volume,
      def: 0.1,
      kind: "decimal",
      max: 1,
      mid: 0.1,
      min: 0,
      showSign: false,
      unboundedMax: false,
      unboundedMin: false,
    };
  }
  return metadata;
}

function normalizeNodeGraphPatchPortMeta(portMeta = {}) {
  const source = portMeta && typeof portMeta === "object" ? portMeta : {};
  const normalizeGroup = (group = {}) => Object.fromEntries(
    Object.entries(group || {})
      .map(([port, metadata]) => [
        String(port || "").trim(),
        { alias: normalizeNodeGraphPatchMetadataAlias(metadata?.alias) },
      ])
      .filter(([port, metadata]) => port && metadata.alias),
  );
  const input = normalizeGroup(source.input);
  const output = normalizeGroup(source.output);
  return {
    ...(Object.keys(input).length ? { input } : {}),
    ...(Object.keys(output).length ? { output } : {}),
  };
}

function normalizeNodeGraphPatchNodeUi(ui = {}) {
  const source = ui && typeof ui === "object" ? ui : {};
  return {
    buttonsHidden: Boolean(source.buttonsHidden),
    displayHeightOffsetGu: normalizeNodeGraphModuleDisplayHeightOffsetUnits(source.displayHeightOffsetGu),
    displayModeKey: String(source.displayModeKey || "").trim(),
    ioHidden: Boolean(source.ioHidden),
    interfaceControlsHidden: Boolean(source.interfaceControlsHidden),
    movementLocked: Boolean(source.movementLocked),
    oscilloscopeHidden: Boolean(source.oscilloscopeHidden),
    slidersHidden: Boolean(source.slidersHidden),
    titleHidden: Boolean(source.titleHidden),
  };
}

function normalizeNodeGraphPatchNodeDisplayModeKey(type, value = "") {
  const key = String(value || "").trim();
  if (!key) {
    return "";
  }
  const modes = typeof nodeGraphModuleDisplayModesForType === "function"
    ? nodeGraphModuleDisplayModesForType(type)
    : [];
  return modes.some((mode) => mode.key === key) ? key : "";
}

function nodeGraphEffectivePatchNodeUi(ui = {}) {
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui);
  return {
    ...normalizedUi,
    buttonsHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.buttonsHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleButtonsVisible : true,
    ),
    oscilloscopeHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.oscilloscopeHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleOscilloscopesVisible : true,
    ),
    interfaceControlsHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.interfaceControlsHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleInterfaceControlsVisible : true,
    ),
    slidersHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.slidersHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleSlidersVisible : true,
    ),
  };
}

function nodeGraphPatchNodeSectionVisible(localHidden, globalVisible) {
  return !Boolean(localHidden) && globalVisible !== false;
}

function normalizeNodeGraphPatchNodeAlias(alias) {
  return String(alias ?? "").trim().slice(0, 64);
}

function normalizeNodeGraphGraphConnections(graphConnections = []) {
  if (!Array.isArray(graphConnections)) {
    return [];
  }
  return graphConnections.map((connection) => ({
    destinationGraphInput: String(connection.destinationGraphInput || "").trim(),
    destinationNode: String(connection.destinationNode || "").trim(),
    sourceNode: String(connection.sourceNode || "").trim(),
    sourcePort: String(connection.sourcePort || "").trim(),
    ...(nodeGraphWireTypePatchValue(connection.wireType)
      ? { wireType: nodeGraphWireTypePatchValue(connection.wireType) }
      : {}),
    ...(normalizeNodeGraphTracePoints(connection.tracePoints).length
      ? { tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints) }
      : {}),
  })).filter((connection) =>
    connection.sourceNode &&
    connection.sourcePort &&
    connection.destinationNode &&
    connection.destinationGraphInput,
  );
}

const nodeGraphLedDefaultColor = "#ff0000";
const nodeGraphLedCenterColor = "#ffffff";

function normalizeNodeGraphLedLayout(layout = {}) {
  const source = layout && typeof layout === "object" ? layout : {};
  return {
    color: normalizeNodeGraphModuleScopeDotCoreColor(source.color ?? nodeGraphLedDefaultColor, nodeGraphLedDefaultColor),
    kind: "led",
  };
}

function normalizeNodeGraphClapAudioPorts(ports = []) {
  if (!Array.isArray(ports)) {
    return [];
  }
  return ports.slice(0, 32).map((port, index) => {
    const source = port && typeof port === "object" ? port : {};
    const id = Number(source.id);
    const sourceIndex = Number(source.index);
    const channelCount = Number(source.channelCount);
    return {
      channelCount: Number.isFinite(channelCount) ? Math.max(0, Math.min(64, Math.round(channelCount))) : 0,
      flags: Number.isFinite(Number(source.flags)) ? Math.round(Number(source.flags)) : 0,
      id: Number.isFinite(id) ? Math.round(id) : index,
      inPlacePair: Number.isFinite(Number(source.inPlacePair)) ? Math.round(Number(source.inPlacePair)) : -1,
      index: Number.isFinite(sourceIndex) ? Math.round(sourceIndex) : index,
      name: String(source.name || "").trim().slice(0, 128),
      portType: String(source.portType || "").trim().slice(0, 128),
    };
  });
}

function normalizeNodeGraphClapPluginBinding(clap = {}) {
  const source = clap && typeof clap === "object" ? clap : {};
  const catalogId = String(source.catalogId ?? source.pluginId ?? "").trim().slice(0, 128);
  const clapId = String(source.clapId ?? "").trim().slice(0, 256);
  const path = String(source.path ?? "").trim().slice(0, 2048);
  const name = String(source.name ?? "").trim().slice(0, 128);
  const vendor = String(source.vendor ?? "").trim().slice(0, 128);
  const instanceId = String(source.instanceId ?? "").trim().slice(0, 128);
  const stateBase64 = String(source.stateBase64 ?? "").trim().slice(0, 6_000_000);
  const stateByteCount = Number(source.stateByteCount);
  const stateSavedAt = String(source.stateSavedAt ?? "").trim().slice(0, 64);
  const binding = {};
  if (catalogId) binding.catalogId = catalogId;
  if (clapId) binding.clapId = clapId;
  if (path) binding.path = path;
  if (name) binding.name = name;
  if (vendor) binding.vendor = vendor;
  if (instanceId) binding.instanceId = instanceId;
  if (stateBase64 && /^[A-Za-z0-9+/=]+$/.test(stateBase64)) binding.stateBase64 = stateBase64;
  if (Number.isFinite(stateByteCount) && stateByteCount >= 0) {
    binding.stateByteCount = Math.floor(stateByteCount);
  }
  if (stateSavedAt) binding.stateSavedAt = stateSavedAt;
  const audioInputs = normalizeNodeGraphClapAudioPorts(source.audioInputs);
  const audioOutputs = normalizeNodeGraphClapAudioPorts(source.audioOutputs);
  if (audioInputs.length) binding.audioInputs = audioInputs;
  if (audioOutputs.length) binding.audioOutputs = audioOutputs;
  return binding;
}

function nodeGraphDefaultNodeTitle(type, id) {
  const label = nodeGraphNodeLabels[type] || String(type || "");
  const idText = String(id || "").trim();
  const suffix = idText.split("-").at(-1) || "";
  if (id === type || idText.toLowerCase() === label.toLowerCase() || suffix.toLowerCase() === label.toLowerCase()) {
    return label;
  }
  return `${label} ${suffix}`;
}

function nodeGraphPatchNodeTitle(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (!patchNode) {
    return nodeGraphNodeLabels[nodeGraphNodeType(node)] || String(node || "");
  }
  if (patchNode.type === "moduleGroup") {
    return normalizeNodeGraphPatchNodeAlias(patchNode.alias) ||
      normalizeNodeGraphModuleGroup(patchNode.moduleGroup).name ||
      nodeGraphNodeLabels.moduleGroup;
  }
  if (patchNode.type === "clapPlugin") {
    return normalizeNodeGraphPatchNodeAlias(patchNode.alias) ||
      normalizeNodeGraphClapPluginBinding(patchNode.clap).name ||
      nodeGraphNodeLabels.clapPlugin;
  }
  return normalizeNodeGraphPatchNodeAlias(patchNode.alias) || nodeGraphDefaultNodeTitle(patchNode.type, patchNode.id);
}

function cloneNodeGraphTypedDisplaySettings(node) {
  const displayType = typeof nodeGraphModuleDisplaySettingsSchemaForNode === "function"
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : nodeGraphModuleDefinitions?.[node?.type]?.displayType || "";
  const isOutput = node?.type === "output";
  const migrate = typeof migrateNodeGraphLegacyDot2Settings === "function"
    ? migrateNodeGraphLegacyDot2Settings
    : (settings) => settings;
  if (displayType === "dot") {
    return { zeroDBurnSettings: normalizeNodeGraphZeroDBurnSettings(migrate(node.zeroDBurnSettings, false)) };
  }
  if (displayType === "lineBurn") {
    return { traceDisplaySettings: normalizeNodeGraphLineBurnSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "value") {
    return { traceDisplaySettings: normalizeNodeGraphValueOscilloscopeSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "scope2d") {
    return { traceDisplaySettings: normalizeNodeGraphScope2dSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "scope2dTrace") {
    return { traceDisplaySettings: normalizeNodeGraphScope2dTraceSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "trace" && Object.hasOwn(node, "traceDisplaySettings")) {
    return { traceDisplaySettings: normalizeNodeGraphTraceDisplaySettings(migrate(node.traceDisplaySettings, isOutput)) };
  }
  return {};
}

function cloneNodeGraphPatch(patch) {
  const cameraState = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  return {
    activeCameraId: cameraState.activeCameraId,
    audio: normalizeNodeGraphPatchAudio(patch.audio),
    bypassedNodes: Array.isArray(patch.bypassedNodes) ? [...patch.bypassedNodes] : [],
    cameras: cameraState.cameras,
    codeScreen: normalizeNodeGraphCodeScreen(patch.codeScreen),
    connections: (patch.connections || []).map((connection) => ({
      ...connection,
      tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints),
    })),
    format: { ...(patch.format || nodeGraphPatchFormat) },
    grid: normalizeNodeGraphPatchGrid(patch.grid),
    graphConnections: normalizeNodeGraphGraphConnections(patch.graphConnections),
    info: normalizeNodeGraphPatchInfo(patch.info),
    modularOnlyControlsVisible: Boolean(patch.modularOnlyControlsVisible),
    modulations: (patch.modulations || []).map((modulation) => ({
      ...modulation,
      tracePoints: normalizeNodeGraphTracePoints(modulation.tracePoints),
    })),
    monitors: normalizeNodeGraphPatchMonitors(patch.monitors, patch),
    nodes: (patch.nodes || []).map((node) => {
      const ui = nodeGraphModuleDefinitions[node.type]?.layout === "textBox" && !Object.hasOwn(node, "ui")
        ? { buttonsHidden: true }
        : normalizeNodeGraphPatchNodeUi(node.ui);
      ui.displayModeKey = normalizeNodeGraphPatchNodeDisplayModeKey(node.type, ui.displayModeKey);
      return {
        ...node,
        ...(normalizeNodeGraphPatchNodeAlias(node.alias)
          ? { alias: normalizeNodeGraphPatchNodeAlias(node.alias) }
          : {}),
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "textBox"
          ? { layout: normalizeNodeGraphTextBoxLayout(node.layout) }
          : {}),
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "image"
          ? { layout: normalizeNodeGraphImageLayout(node.layout) }
          : {}),
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "led"
          ? { led: normalizeNodeGraphLedLayout(node.led) }
          : {}),
        ...(nodeGraphModuleIsGraphType(node.type)
          ? {
            graph: nodeGraphGraphEndpointYLockEnabledForNode(node)
              ? nodeGraphGraphWithLockedEndpointY(node.graph)
              : normalizeNodeGraphGraph(node.graph),
          }
          : {}),
        ...(node.type === "codeblock"
          ? { codeblock: normalizeNodeGraphCodeblock(node.codeblock) }
          : {}),
        ...(node.type === "scriptBox"
          ? { scriptBox: normalizeNodeGraphScriptBox(node.scriptBox) }
          : {}),
        ...(node.type === "canvas"
          ? { canvasScript: normalizeNodeGraphCanvasScript(node.canvasScript) }
          : {}),
        ...(node.type === "screenSpaceShader"
          ? { screenSpaceShader: normalizeNodeGraphScreenSpaceShader(node.screenSpaceShader) }
          : {}),
        ...cloneNodeGraphTypedDisplaySettings(node),
        ...(Object.hasOwn(node, "scopeShader")
          ? { scopeShader: normalizeNodeGraphScopeShader(node.scopeShader) }
          : {}),
        ...(node.type === "moduleGroup"
          ? { moduleGroup: normalizeNodeGraphModuleGroup(node.moduleGroup) }
          : {}),
        ...(node.type === "clapPlugin"
          ? { clap: normalizeNodeGraphClapPluginBinding(node.clap) }
          : {}),
        ...((node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") && normalizeNodeGraphSampleId(node.sample?.id)
          ? { sample: { id: normalizeNodeGraphSampleId(node.sample?.id) } }
          : {}),
        ...(node.type === "audioPlayer" && Object.hasOwn(node, "phosphorWaveformSettings")
          ? { phosphorWaveformSettings: normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings) }
          : {}),
        paramMeta: normalizeNodeGraphParamMetaForNode(node.type, node.paramMeta),
        ...(Object.keys(normalizeNodeGraphPatchPortMeta(node.portMeta)).length
          ? { portMeta: normalizeNodeGraphPatchPortMeta(node.portMeta) }
          : {}),
        params: { ...(node.params || {}) },
        ...(ui.buttonsHidden || ui.displayModeKey || ui.ioHidden || ui.interfaceControlsHidden || ui.movementLocked || ui.titleHidden || ui.oscilloscopeHidden || ui.slidersHidden || ui.displayHeightOffsetGu ? { ui } : {}),
      };
    }),
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patch)
      : [],
    samples: typeof normalizeNodeGraphPatchSamples === "function"
      ? normalizeNodeGraphPatchSamples(patch.samples)
      : [],
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems: normalizeNodeGraphPatchUiItems(patch.uiItems),
    view: normalizeNodeGraphPatchView(patch.view),
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: normalizeNodeGraphPatchWindows(patch.windows),
  };
}
