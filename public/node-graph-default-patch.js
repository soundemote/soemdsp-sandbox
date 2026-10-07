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

function nodeGraphResolveModuleTypeAlias(type) {
  const t = String(type || "").trim();
  // phosphorLight → scope2d (2D Phosphor).
  if (t === "phosphorLight") return "scope2d";
  // Gain Bias folded into Gain (offset lives on Gain now).
  if (t === "gainBias") return "gain";
  // GainBiasMix renamed to Mix.
  if (t === "gainBiasMix") return "mix";
  // Noisy → NoisyFreq (ratio jitter).
  if (t === "additiveNoisy") return "additiveNoisyFreq";
  // Pre-rename graph modules (keep patches; do not retire-drop).
  if (t === "graph2" || t === "graph") return "smoothGraph";
  if (t === "graphCopy") return "stepGraph";
  return t;
}

// --- Module seeds -----------------------------------------------------------
// patch.masterSeed: hidden uint32 saved in the patch (not a user control). It
// is consumed ONLY when the user creates a module (add / duplicate / paste):
// each kind:"seed" param of the new module takes the next value and the master
// advances. Loading, undo, engine rebuild and creation order never consume it.
// Each RNG module then owns its saved Seed param (0..SEED_MAX, 0 is a real
// seed) and native seeds from that alone (seed_mix / seed_to_rng_state).
const NODE_GRAPH_SEED_COMPONENT_MODULE = 0x5eed;
const NODE_GRAPH_SEED_COMPONENT_LEGACY = 0x1e6ac;

function nodeGraphNormalizeMasterSeed(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
}

function nodeGraphRandomMasterSeed() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const words = new Uint32Array(1);
    cryptoApi.getRandomValues(words);
    return words[0] >>> 0;
  }
  // Entropy source only (headless smoke hosts without Web Crypto).
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// Saved master seed, or a fresh random one (new patch / patch saved before
// master seeds existed). Never advances anything.
function nodeGraphPatchMasterSeedOrNew(value) {
  const saved = nodeGraphNormalizeMasterSeed(value);
  return saved === null ? nodeGraphRandomMasterSeed() : saved;
}

function nodeGraphSeedParamKeysForType(type) {
  const parameters = nodeGraphModuleDefinitions?.[type]?.parameters || [];
  return parameters
    .filter((parameter) => String(parameter?.kind || "") === "seed")
    .map((parameter) => parameter.key);
}

// Next module Seed from the patch master seed; advances patch.masterSeed.
function nodeGraphTakeNextModuleSeed(patch) {
  const master = nodeGraphPatchMasterSeedOrNew(patch.masterSeed);
  const seed = SoemMath.seedMix(master, NODE_GRAPH_SEED_COMPONENT_MODULE, 0) & SoemMath.SEED_MAX;
  patch.masterSeed = (master + 0x9e3779b9) >>> 0;
  return seed;
}

// User-created module (add / duplicate / paste): roll every Seed param.
function nodeGraphAssignFreshModuleSeeds(patch, node) {
  const keys = nodeGraphSeedParamKeysForType(node?.type);
  if (!keys.length) {
    return node;
  }
  if (!node.params || typeof node.params !== "object") {
    node.params = {};
  }
  for (const key of keys) {
    node.params[key] = nodeGraphTakeNextModuleSeed(patch);
  }
  return node;
}

// FNV-1a (32-bit) over UTF-16 code units. Stable text -> uint32 for seeds.
function nodeGraphSeedTextHash(text) {
  const s = String(text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    hash = Math.imul(hash ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Patch saved before this module had a Seed param: assign one at load from
// (node id, param key) ONLY -- not the master seed -- so every load of the same
// patch agrees, the master seed is not consumed, and the one-time file
// migration (scripts/migrate_patch_seeds.mjs) writes the same value. Saved from
// then on.
function nodeGraphLegacyModuleSeed(nodeId, key) {
  const hash = nodeGraphSeedTextHash(`${nodeId}\u0000${key}`);
  return SoemMath.seedMix(hash, NODE_GRAPH_SEED_COMPONENT_LEGACY, 0) & SoemMath.SEED_MAX;
}

function createNodeGraphPatchNode(type, options = {}) {
  const resolvedType = nodeGraphResolveModuleTypeAlias(type);
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
      const choiceKeys = typeof nodeGraphParameterChoiceKeys === "function"
        ? nodeGraphParameterChoiceKeys(resolvedType, key)
        : null;
      if (choiceKeys && choiceKeys.includes(String(paramsOverride[key] ?? "").trim())) {
        node.params[key] = String(paramsOverride[key]).trim();
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
  // Explicit opts.alias wins. Else definition.defaultAlias (e.g. Vectorscope → "Rotate").
  let aliasSource = opts.alias;
  if (!Object.hasOwn(opts, "alias")) {
    const defAlias = nodeGraphModuleDefinitions[resolvedType]?.defaultAlias;
    if (defAlias != null && String(defAlias).trim()) {
      aliasSource = defAlias;
    }
  }
  const alias = normalizeNodeGraphPatchNodeAlias(aliasSource);
  if (alias) {
    node.alias = alias;
  }
  // Chord Memory slots (Keyboard / Grid) — MIDI 0..127 → note lists.
  if (
    (resolvedType === "keyboard" || resolvedType === "gridKeyboard")
    && opts.chordMemory
    && typeof opts.chordMemory === "object"
  ) {
    node.chordMemory = typeof nodeGraphChordMemoryNormalizeSlots === "function"
      ? { slots: nodeGraphChordMemoryNormalizeSlots(opts.chordMemory) }
      : { slots: opts.chordMemory.slots || opts.chordMemory };
  }
  // Explicit opts.ui wins. Else module definition.defaultUi (e.g. Vectorscope
  // Rotation). Buttons default off except Input/Output (shown, still hideable).
  let uiSource = opts.ui;
  if (!Object.hasOwn(opts, "ui")) {
    const defUi = nodeGraphModuleDefinitions[resolvedType]?.defaultUi;
    if (defUi && typeof defUi === "object") {
      uiSource = defUi;
    } else if (nodeGraphModuleDefinitions[resolvedType]?.layout === "textBox") {
      uiSource = { buttonsHidden: true };
    }
  }
  const ui = normalizeNodeGraphPatchNodeUi(uiSource, resolvedType);
  // Stamp absolute face height at spawn so later type-default changes cannot
  // resize existing modules (offset-from-default used to leak spawn defaults).
  if (
    typeof nodeGraphModuleHasFace === "function"
    && nodeGraphModuleHasFace(resolvedType)
    && !Number.isFinite(Number(ui.displayHeightGu))
  ) {
    const faceGu = typeof nodeGraphModuleDefaultDisplayHeightUnits === "function"
      ? nodeGraphModuleDefaultDisplayHeightUnits(resolvedType)
      : Number(nodeGraphModuleDefinitions[resolvedType]?.displayHeightGu);
    if (Number.isFinite(faceGu) && faceGu > 0) {
      ui.displayHeightGu = faceGu;
      delete ui.displayHeightOffsetGu;
    }
  }
  if (
    ui.buttonsHidden
    || ui.buttonsForceShow
    || ui.titleHidden
    || ui.oscilloscopeHidden
    || ui.oscilloscopeForceShow
    || ui.ioHidden
    || ui.hideUnused
    || ui.slidersHidden
    || ui.slidersForceShow
    || ui.interfaceControlsHidden
    || ui.interfaceControlsForceShow
    || ui.movementLocked
    || Number.isFinite(Number(ui.displayHeightGu))
    || Number.isFinite(Number(ui.displayHeightOffsetGu))
  ) {
    node.ui = ui;
  }
  if (Object.hasOwn(opts, "widthGu")) {
    node.widthGu = normalizeNodeGraphModuleWidthUnits(resolvedType, opts.widthGu);
  } else if (typeof nodeGraphDefaultModuleGridWidthUnits === "function") {
    // Always persist spawn width (even when it matches the type default).
    node.widthGu = nodeGraphDefaultModuleGridWidthUnits(resolvedType);
  } else {
    const defW = Number(nodeGraphModuleDefinitions[resolvedType]?.defaultWidthGu);
    if (Number.isFinite(defW)) {
      node.widthGu = normalizeNodeGraphModuleWidthUnits(resolvedType, defW);
    }
  }
  if (Object.hasOwn(opts, "heightGu")) {
    node.heightGu = nodeGraphModuleDefinitions[resolvedType]?.layout === "textBox"
      && typeof normalizeNodeGraphTextBoxHeightUnits === "function"
      ? normalizeNodeGraphTextBoxHeightUnits(opts.heightGu, ui)
      : (typeof nodeGraphLayoutCGridHeightUnits === "function"
        && typeof nodeGraphModuleUsesLayoutC === "function"
        && nodeGraphModuleUsesLayoutC(resolvedType)
        ? nodeGraphLayoutCGridHeightUnits(resolvedType, ui, opts.heightGu)
        : normalizeNodeGraphModuleHeightUnits(resolvedType, opts.heightGu, ui));
  } else {
    const defH = Number(nodeGraphModuleDefinitions[resolvedType]?.defaultHeightGu);
    if (Number.isFinite(defH)) {
      node.heightGu = typeof nodeGraphLayoutCGridHeightUnits === "function"
        && typeof nodeGraphModuleUsesLayoutC === "function"
        && nodeGraphModuleUsesLayoutC(resolvedType)
        ? nodeGraphLayoutCGridHeightUnits(resolvedType, ui, defH)
        : normalizeNodeGraphModuleHeightUnits(resolvedType, defH, ui);
    }
  }
  if (nodeGraphModuleDefinitions[resolvedType]?.layout === "textBox") {
    node.layout = normalizeNodeGraphTextBoxLayout(opts.layout);
  } else if (resolvedType === "keypad" && typeof normalizeNodeGraphKeypadLayout === "function") {
    node.layout = normalizeNodeGraphKeypadLayout(opts.layout);
  } else if (nodeGraphModuleDefinitions[resolvedType]?.layout === "image") {
    node.layout = normalizeNodeGraphImageLayout(opts.layout);
  } else if (resolvedType === "led") {
    node.vectorDotSettings = typeof normalizeNodeGraphVectorDotSettings === "function"
      ? normalizeNodeGraphVectorDotSettings(opts.vectorDotSettings || opts.led)
      : (opts.vectorDotSettings || {});
  } else if (resolvedType === "lcdDot") {
    node.vectorDotSettings = typeof normalizeNodeGraphLcdDotSettings === "function"
      ? normalizeNodeGraphLcdDotSettings(opts.vectorDotSettings)
      : (opts.vectorDotSettings || {});
  }
  if (nodeGraphModuleIsGraphType(resolvedType)) {
    node.graph = normalizeNodeGraphGraph(opts.graph);
  }
  if (resolvedType === "codeBox" || nodeGraphModuleDefinitions[resolvedType]?.layout === "codeBox") {
    node.codeBox = typeof normalizeNodeGraphCodeBox === "function"
      ? normalizeNodeGraphCodeBox(opts.codeBox)
      : { localText: String(opts.codeBox?.localText ?? "") };
  }
  const defDisplay = nodeGraphModuleDefinitions[resolvedType]?.defaultDisplaySettings;
  if (defDisplay && typeof defDisplay === "object") {
    node.traceDisplaySettings = { ...defDisplay };
  }
  if (resolvedType === "matrixWaterfall" && typeof normalizeNodeGraphMatrixWaterfall === "function") {
    node.matrixWaterfall = normalizeNodeGraphMatrixWaterfall(
      opts.matrixWaterfall || opts.matrixDisplay || opts.asciiscope,
    );
  }
  if (resolvedType === "matrixDisplay") {
    if (typeof normalizeNodeGraphMatrixPlate === "function") {
      node.matrixDisplay = normalizeNodeGraphMatrixPlate(opts.matrixDisplay || opts.asciiscope);
    } else if (typeof normalizeNodeGraphAsciiscope === "function") {
      node.matrixDisplay = normalizeNodeGraphAsciiscope(opts.matrixDisplay || opts.asciiscope);
    }
  }
  if (resolvedType === "asciiscope" && typeof normalizeNodeGraphMatrixDisplay === "function") {
    node.asciiscope = normalizeNodeGraphMatrixDisplay(opts.asciiscope || opts.matrixDisplay);
  }
  if (resolvedType === "textStream" && typeof normalizeNodeGraphTextStream === "function") {
    node.textStream = normalizeNodeGraphTextStream(opts.textStream);
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
  if (resolvedType === "knob" && typeof normalizeNodeGraphKnobFace === "function") {
    const face = normalizeNodeGraphKnobFace(opts.knobFace);
    if (typeof nodeGraphKnobFaceIsNonDefault === "function"
      ? nodeGraphKnobFaceIsNonDefault(face)
      : (typeof nodeGraphKnobFaceHasAnyImage === "function"
        ? nodeGraphKnobFaceHasAnyImage(face)
        : face.layers?.some?.((layer) => layer?.dataUrl))) {
      node.knobFace = typeof nodeGraphKnobFaceToPatch === "function"
        ? nodeGraphKnobFaceToPatch(face)
        : face;
    }
  }
  return node;
}

// Offline last-resort only (file:// / fetch failure). Live boot still prefers
// patches/init.json. Clear Startup uses nodeGraphBlankStartupPatch() instead.
const nodeGraphDefaultNodeConfigs = Object.freeze([
  {
    ...createNodeGraphPatchNode("output", { id: "output", gx: 5, gy: -9 }),
    params: { ...nodeGraphDefaultParamsForType("output"), volume: -3 },
  },
  {
    ...createNodeGraphPatchNode("polyBlep", { id: "polyBlep-1", gx: -2, gy: -9 }),
    params: {
      ...nodeGraphDefaultParamsForType("polyBlep"),
      frequency: 220,
      waveform: 0,
      morph: 0.5,
      amplitude: 0.5,
    },
  },
]);

/** Blank project for Clear Startup: Output only, no file identity. */
function nodeGraphBlankStartupPatch() {
  const output = createNodeGraphPatchNode("output", { id: "output", gx: 5, gy: -9 });
  return {
    activeCameraId: "camera-1",
    audio: {
      oversamplingFactor: 1,
      targetSampleRate: 44100,
      pitchReferenceMidiNote: 69,
      pitchReferenceHz: 440,
      speedLimitHz: 22050,
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
      emoji: "",
      name: "",
    },
    visual: {
      background: { h: 210, l: 5, s: 0 },
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
    view: { widthGu: 48, heightGu: 24, zoom: 1 },
    nodes: [{ ...output }],
    connections: [],
    graphConnections: [],
    modulations: [],
    monitors: [],
    requiredAssets: [],
    samples: [],
    uiItems: [],
  };
}

const nodeGraphDefaultConnections = Object.freeze([
  { sourceNode: "polyBlep-1", sourcePort: "Wave", destinationNode: "output", destinationPort: "Mono" },
]);

const nodeGraphDefaultPatch = Object.freeze({
  activeCameraId: "camera-1",
  audio: {
    oversamplingFactor: 1,
    targetSampleRate: 44100,
    pitchReferenceMidiNote: 69,
    pitchReferenceHz: 440,
    speedLimitHz: 22050,
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
    description: "Offline fallback — live Init is patches/init.json",
    emoji: "",
    name: "Init",
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
  view: { widthGu: 48, heightGu: 24, zoom: 1 },
  nodes: nodeGraphDefaultNodeConfigs.map((node) => ({ ...node })),
  connections: nodeGraphDefaultConnections.map((connection) => ({ ...connection })),
  graphConnections: [],
  modulations: [],
  monitors: [],
  requiredAssets: [],
  samples: [],
  uiItems: [],
});
