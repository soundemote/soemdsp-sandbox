// Display-mode selection helpers extracted from node-graph-module-scopes.js
// (Phase D). Load after normalize.js, before scopes.js.

function nodeGraphDisplayModeSettingsSchemaForRenderer(renderer) {
  if (renderer === "phosphorWaveform") {
    return "phosphorWaveform";
  }
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
  if (["scope2d", "scope2dTrace", "vectorRgbFace", "gradientVectorscopeFace"].includes(renderer)) {
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


/**
 * One fixed face per module type.
 * Extra displayModes entries and Trace↔Spectrum companions are ignored for
 * selection — beautiful single-face modules only (no Mode dropdown).
 */
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
  if (!base.length) {
    return [];
  }
  // Prefer defaultDisplayMode when present; otherwise first declared mode only.
  const preferredKey = String(nodeGraphModuleDefinitions?.[type]?.defaultDisplayMode || "").trim();
  const preferred = preferredKey
    ? (base.find((mode) => mode.key === preferredKey) || base[0])
    : base[0];
  return preferred ? [preferred] : [];
}


function nodeGraphModuleDefaultDisplayModeKeyForType(type) {
  return nodeGraphModuleDisplayModesForType(type)[0]?.key || "";
}


function nodeGraphModuleSelectedDisplayMode(node) {
  // Always the sole mode for the type — ui.displayModeKey no longer switches faces.
  return nodeGraphModuleDisplayModesForType(node?.type)[0] || null;
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
    // Soft Fractal + Evolve Field + Fractal Brownian Field: gradient / background in Display Settings.
    "rgbFractalFace",
    "evolveFieldFace",
    "fbmFieldFace",
    // Macro Controls face: bg / arc colors / names (global bank).
    "macroControlsFace",
    "keyboardControllerFace",
    // Knob module: macro dial colors, image layers, centered span, readout.
    "knobFace",
    // Keypad look: fonts, weight, button size, Sound Color Widgets.
    "keypadFace",
    // Music Player waveform / playlist look.
    "phosphorWaveform",
    // Text Box look: mode, align, size, Sound Color Widgets.
    "textBoxFace",
    "portalFace",
    "roundShapeFace",
    // Patch identity plate — not Trace.
    "patchFace",
    "vectorRgbFace",
    "rasterRgbFace",
    "gradientVectorscopeFace",
    "traceXyz",
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
  return nodeGraphTraceDisplaySettingsForNode(nodeGraphModuleScopeNodeForSlot(slot));
}

