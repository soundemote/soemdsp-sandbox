// User-level "set as default" overrides for a module TYPE (see
// node-graph-module-actions.js) are lower priority than an explicit caller
// option but higher priority than the module definition's hardcoded
// defaultValue -- so every "add a module" call site automatically picks up
// the user's saved defaults for that type without having to know about them.
function nodeGraphModuleDefaultOverrideForType(type) {
  const overrides = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.moduleDefaultOverrides : null;
  return overrides && typeof overrides === "object" && overrides[type] && typeof overrides[type] === "object"
    ? overrides[type]
    : null;
}

function createNodeGraphPatchNode(type, options = {}) {
  // phosphorLight is a retired alias of scope2d (2D Phosphor).
  const resolvedType = type === "phosphorLight" ? "scope2d" : type;
  const override = nodeGraphModuleDefaultOverrideForType(resolvedType);
  const opts = override ? { ...override, ...options } : options;
  const node = {
    gx: Number.isFinite(Number(opts.gx)) ? Number(opts.gx) : 0,
    gy: Number.isFinite(Number(opts.gy)) ? Number(opts.gy) : 0,
    id: String(opts.id || resolvedType),
    paramMeta: nodeGraphDefaultParamMetaForType(resolvedType),
    params: nodeGraphDefaultParamsForType(resolvedType),
    type: resolvedType,
  };
  const paramsOverride = opts.params && typeof opts.params === "object" ? opts.params : null;
  if (paramsOverride) {
    for (const key of Object.keys(node.params)) {
      if (!Object.hasOwn(paramsOverride, key)) {
        continue;
      }
      const value = Number(paramsOverride[key]);
      if (Number.isFinite(value)) {
        node.params[key] = value;
      }
    }
  }
  const paramMetaOverride = opts.paramMeta && typeof opts.paramMeta === "object" ? opts.paramMeta : null;
  if (paramMetaOverride) {
    for (const key of Object.keys(node.paramMeta)) {
      if (Object.hasOwn(paramMetaOverride, key) && paramMetaOverride[key] && typeof paramMetaOverride[key] === "object") {
        node.paramMeta[key] = { ...node.paramMeta[key], ...paramMetaOverride[key] };
      }
    }
  }
  if (Object.hasOwn(opts, "widthGu")) {
    node.widthGu = normalizeNodeGraphModuleWidthUnits(resolvedType, opts.widthGu);
  }
  const alias = normalizeNodeGraphPatchNodeAlias(opts.alias);
  if (alias) {
    node.alias = alias;
  }
  const ui = nodeGraphModuleDefinitions[resolvedType]?.layout === "textBox" && !Object.hasOwn(opts, "ui")
    ? { buttonsHidden: true }
    : normalizeNodeGraphPatchNodeUi(opts.ui, resolvedType);
  if (ui.buttonsHidden || ui.titleHidden) {
    node.ui = ui;
  }
  if (nodeGraphModuleDefinitions[resolvedType]?.layout === "textBox") {
    node.layout = normalizeNodeGraphTextBoxLayout(opts.layout);
  } else if (nodeGraphModuleDefinitions[resolvedType]?.layout === "image") {
    node.layout = normalizeNodeGraphImageLayout(opts.layout);
  } else if (nodeGraphModuleDefinitions[resolvedType]?.layout === "led") {
    node.led = normalizeNodeGraphLedLayout(opts.led);
  }
  if (nodeGraphModuleIsGraphType(resolvedType)) {
    node.graph = normalizeNodeGraphGraph(opts.graph);
  }
  if (resolvedType === "codeblock") {
    node.codeblock = normalizeNodeGraphCodeblock(opts.codeblock);
  }
  if (resolvedType === "customDisplay") {
    node.customDisplay = normalizeNodeGraphCustomDisplay(opts.customDisplay);
  }
  if (resolvedType === "canvas") {
    node.canvasScript = normalizeNodeGraphCanvasScript(opts.canvasScript);
  }
  if (resolvedType === "screenSpaceShader") {
    node.screenSpaceShader = normalizeNodeGraphScreenSpaceShader(opts.screenSpaceShader);
  }
  if (Object.hasOwn(opts, "scopeShader")) {
    node.scopeShader = normalizeNodeGraphScopeShader(opts.scopeShader);
  }
  if (resolvedType === "moduleGroup") {
    node.moduleGroup = normalizeNodeGraphModuleGroup(options.moduleGroup);
  }
  if (resolvedType === "clapPlugin") {
    node.clap = normalizeNodeGraphClapPluginBinding(options.clap);
  }
  if (resolvedType === "valueSlider" && typeof normalizeNodeGraphValueSliderFace === "function") {
    const face = normalizeNodeGraphValueSliderFace(opts.valueSliderFace);
    if (typeof nodeGraphValueSliderFaceIsNonDefault === "function"
      ? nodeGraphValueSliderFaceIsNonDefault(face)
      : (face.mid?.dataUrl || face.bottom?.dataUrl || face.top?.dataUrl || face.rotateLikeKnob)) {
      node.valueSliderFace = face;
    }
  }
  return node;
}

const nodeGraphDefaultNodeConfigs = Object.freeze([
  {
    ...createNodeGraphPatchNode("audioPlayer", { id: "audioPlayer-1", gx: -9, gy: -9, widthGu: 8 }),
    params: { ...nodeGraphDefaultParamsForType("audioPlayer"), speed: 1, transport: 4 },
  },
  {
    ...createNodeGraphPatchNode("output", { id: "output", gx: 2, gy: -5 }),
    params: { ...nodeGraphDefaultParamsForType("output"), volume: 0.8 },
  },
]);

const nodeGraphDefaultConnections = Object.freeze([
  { sourceNode: "audioPlayer-1", sourcePort: "Left", destinationNode: "output", destinationPort: "Left" },
  { sourceNode: "audioPlayer-1", sourcePort: "Right", destinationNode: "output", destinationPort: "Right" },
]);

const nodeGraphDefaultPatch = Object.freeze({
  activeCameraId: "camera-1",
  audio: {
    targetSampleRate: 44100,
    pitchReferenceMidiNote: 48,
    pitchReferenceHz: 100,
  },
  bypassedNodes: [],
  cameras: [
    {
      color: "#ff3333",
      enabled: true,
      height: 489,
      id: "camera-1",
      midiTrigger: null,
      name: "Camera 1",
      resolutionHeight: 1080,
      resolutionWidth: 1920,
      width: 868,
      x: 0,
      y: 0,
    },
  ],
  info: {
    author: "",
    description: "",
    name: "Init",
    tags: "",
  },
  visual: {
    background: {
      h: 210,
      l: 5,
      s: 0,
    },
    mode: "auto",
    scale: 1,
    style: "glow",
    theme: "cyan-violet",
    trail: 0.35,
  },
  timing: {
    tempoBpm: 120,
    timeSignatureDenominator: 4,
    timeSignatureNumerator: 4,
  },
  windows: {
    metadata: { left: null, top: null },
    moduleActions: { left: null, top: null },
  },
  grid: { ...nodeGraphGrid },
  view: { widthGu: 20, heightGu: 20, zoom: 1 },
  nodes: nodeGraphDefaultNodeConfigs.map((node) => ({ ...node })),
  connections: nodeGraphDefaultConnections.map((connection) => ({ ...connection })),
  graphConnections: [],
  modulations: [],
  monitors: [],
  requiredAssets: [],
  samples: [],
  uiItems: [],
});
