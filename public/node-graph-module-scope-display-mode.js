// Display-mode selection helpers extracted from node-graph-module-scopes.js
// (Phase D). Load after normalize.js, before scopes.js.

function nodeGraphDisplayModeSettingsSchemaForRenderer(renderer) {
  return nodeGraphDisplayModeRenderers.includes(renderer) ? renderer : "trace";
}


function normalizeNodeGraphDisplaySignal(signal, index = 0) {
  const raw = typeof signal === "string" ? { key: signal } : (signal && typeof signal === "object" ? signal : {});
  const key = String(raw.key || raw.name || raw.port || `signal${index + 1}`).trim();
  if (!key) {
    return null;
  }
  const kind = nodeGraphDisplayModeSignalKinds.includes(raw.kind) ? raw.kind : "scalar";
  return {
    key,
    kind,
    label: String(raw.label || key).trim() || key,
  };
}


function nodeGraphModuleOutputPortsForType(type) {
  const outputs = nodeGraphModuleDefinitions?.[type]?.outputs;
  return Array.isArray(outputs)
    ? outputs.map((output) => String(output || "").trim()).filter(Boolean)
    : [];
}


function nodeGraphModuleDefaultScalarDisplayPort(type) {
  const outputs = nodeGraphModuleOutputPortsForType(type);
  // Prefer the selected-waveform port used by LFO/PolyBLEP/BLIT (Wave Out)
  // before falling back to a fixed shape port like Saw.
  return outputs.find((port) => port === "Out") ||
    outputs.find((port) => port === "Wave Out") ||
    outputs.find((port) => port === "Mono") ||
    outputs.find((port) => port === "Wave") ||
    outputs[0] ||
    "";
}


function nodeGraphModuleDefaultXyDisplaySource(type) {
  const outputs = nodeGraphModuleOutputPortsForType(type);
  const x = outputs.find((port) => port === "X") ||
    outputs.find((port) => port === "Out X") ||
    outputs.find((port) => port === "Left") ||
    "";
  const y = outputs.find((port) => port === "Y") ||
    outputs.find((port) => port === "Out Y") ||
    outputs.find((port) => port === "Right") ||
    "";
  return x && y ? { x, y } : null;
}


function normalizeNodeGraphDisplayMode(mode, type = "", index = 0) {
  const raw = mode && typeof mode === "object" ? mode : {};
  const renderer = nodeGraphDisplayModeRenderers.includes(raw.renderer)
    ? raw.renderer
    : nodeGraphModuleDeclaredDisplayTypeForType(type);
  if (renderer === "legacy") {
    return null;
  }
  const key = String(raw.key || raw.name || `${renderer}${index + 1}`).trim();
  if (!key) {
    return null;
  }
  const source = raw.source && typeof raw.source === "object"
    ? { ...raw.source }
    : nodeGraphModuleImplicitDisplayModeSource(type, renderer);
  return {
    key,
    label: String(raw.label || key).trim() || key,
    renderer,
    settingsSchema: nodeGraphDisplayModeSettingsSchemaForRenderer(raw.settingsSchema || renderer),
    source,
  };
}


function nodeGraphModuleImplicitDisplayModeSource(type, renderer) {
  if (["scope2d", "scope2dTrace"].includes(renderer)) {
    return nodeGraphModuleDefaultXyDisplaySource(type) || { value: nodeGraphModuleDefaultScalarDisplayPort(type) };
  }
  return { value: nodeGraphModuleDefaultScalarDisplayPort(type) };
}


function nodeGraphModuleImplicitDisplayModeForType(type) {
  const renderer = nodeGraphModuleDeclaredDisplayTypeForType(type);
  if (renderer === "legacy") {
    return null;
  }
  return normalizeNodeGraphDisplayMode({
    key: renderer,
    label: nodeGraphDisplayModeSettingsSchemaForRenderer(renderer),
    renderer,
    settingsSchema: nodeGraphDisplayModeSettingsSchemaForRenderer(renderer),
    source: nodeGraphModuleImplicitDisplayModeSource(type, renderer),
  }, type, 0);
}


function nodeGraphModuleDisplayModesForType(type) {
  const declared = nodeGraphModuleDefinitions?.[type]?.displayModes;
  const modes = Array.isArray(declared)
    ? declared.map((mode, index) => normalizeNodeGraphDisplayMode(mode, type, index)).filter(Boolean)
    : [];
  const base = modes.length
    ? modes
    : (() => {
      const implicit = nodeGraphModuleImplicitDisplayModeForType(type);
      return implicit ? [implicit] : [];
    })();
  // Opt out (e.g. Output): one fixed face — no Mode dropdown (Trace vs Spectrum).
  if (nodeGraphModuleDefinitions?.[type]?.spectrumCompanion === false) {
    return base;
  }
  return nodeGraphModuleWithSpectrumCompanionMode(base);
}


function nodeGraphModuleDefaultDisplayModeKeyForType(type) {
  const declared = String(nodeGraphModuleDefinitions?.[type]?.defaultDisplayMode || "").trim();
  const modes = nodeGraphModuleDisplayModesForType(type);
  return modes.some((mode) => mode.key === declared)
    ? declared
    : (modes[0]?.key || "");
}


function nodeGraphModuleSelectedDisplayMode(node) {
  const modes = nodeGraphModuleDisplayModesForType(node?.type);
  const selected = String(node?.ui?.displayModeKey || nodeGraphModuleDefaultDisplayModeKeyForType(node?.type) || "").trim();
  return modes.find((mode) => mode.key === selected) || modes[0] || null;
}


function nodeGraphModuleDisplayRendererForNode(node) {
  return nodeGraphModuleSelectedDisplayMode(node)?.renderer || nodeGraphModuleDisplayTypeForType(node?.type);
}


function nodeGraphModuleDisplaySettingsSchemaForNode(node) {
  return nodeGraphModuleSelectedDisplayMode(node)?.settingsSchema || nodeGraphDisplayModeSettingsSchemaForRenderer(nodeGraphModuleDisplayRendererForNode(node));
}


function nodeGraphModuleDisplaySettingsSchemaForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  return node
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : nodeGraphDisplayModeSettingsSchemaForRenderer(nodeGraphModuleDisplayRendererForSlot(slot));
}


function nodeGraphModuleDisplayTypeHasLocalSettings(displayType) {
  return [
    "trace",
    "dot",
    "value",
    "lineBurn",
    "scope2d",
    "scope2dTrace",
    "phosphorLight",
    "numberReadout",
    "xyPad",
    "ledLamp",
    "spectrogramBurn",
    "videoscopeBurn",
    "oscilloscopeBankBurn",
    "hypersawBurn",
    "matrixFace",
    "matrixWaterfallFace",
    "matrixDisplayFace",
    // Soft Fractal + Fractal Brownian Field: gradient / background in Display Settings.
    "rgbFractalFace",
    "fbmFieldFace",
  ].includes(displayType);
}


function nodeGraphNodeHasLocalDisplaySettings(node) {
  return Boolean(node && nodeGraphModuleDisplayTypeHasLocalSettings(nodeGraphModuleDisplaySettingsSchemaForNode(node)));
}


function nodeGraphNodeCanOpenDisplaySettings(node) {
  return Boolean(
    nodeGraphNodeHasLocalDisplaySettings(node) ||
    (typeof nodeGraphPatchNodeHasHideableOscilloscope === "function" && nodeGraphPatchNodeHasHideableOscilloscope(node)),
  );
}


function nodeGraphTraceDisplaySettingsForSlot(slot) {
  // Plain Trace nodes intentionally share one global look (see
  // nodeGraphTraceDisplaySettingsEditingTraceDefaults). Output reuses the
  // "trace" schema for its Left/Right channels but each Output node's own
  // brightness/size/blur are per-node -- reading the global bucket here
  // meant those fields silently never reflected what was actually saved
  // on the node (only color worked, since the draw path reads color
  // straight off the node as a separate override).
  // Multi-mode Display (visualOscilloscope) also keeps per-node Trace settings
  // when Mode = 1D Trace.
  if (nodeGraphModuleDisplaySettingsSchemaForSlot(slot) === "trace") {
    const nodeType = nodeGraphModuleScopeNodeForSlot(slot)?.type;
    if (nodeType !== "output" && nodeType !== "visualOscilloscope") {
      return nodeGraphGlobalTraceSettings();
    }
  }
  return nodeGraphTraceDisplaySettingsForNode(nodeGraphModuleScopeNodeForSlot(slot));
}

