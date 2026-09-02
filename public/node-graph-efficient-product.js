// MVEP efficient-product surface (PR-E0). Single allowlist SSOT for shop UI + plan refuse.
// Hard cutover: no JS DSP fallback for foreign types. See docs/APP_POLICY.md §0b.
// Classification is frozen-set-only so host and worklet cannot diverge.

const NODE_GRAPH_EFFICIENT_PRODUCT_AUDIO_TYPES = Object.freeze([
  "polyBlep",
  "ladderFilter",
  "softClipper",
  "reverbEffect",
  "pingPongDelay",
  "attenuverter",
  "range",
  "inv",
  "u2b",
  "b2u",
  "bias",
  // Controller face widgets (Bias / Gate / pad) — shop under Controller.
  "knob",
  "pluginSlider",
  "toggleButton",
  "momentaryButton",
  "xyPad",
  "keypad",
  "phoneTone",
  // Singleton live Input — unique, undeleteable, shop-visible (APP_POLICY).
  "audioInput",
  "macroControls",
  "keyboardController",
  "pitchModWheel",
  "gain",
  "noiseGenerator",
  "robinSinusoid",
  "robinSupersaw",
  "slewLimiter",
  "comparator",
  "sampleDelay",
  "sampleHold",
  "minMax",
  "mix",
  "mixStereo",
  "clipperLimiter",
  "midSideEncode",
  "vectorscopeTransform",
  "rotate3dTo2d",
  "clock",
  "triggerDivider",
  "delayedTrigger",
  "randomClock",
  "triggerCounter",
  "metallicRatio",
  "harmonicSeries",
  "lutCell",
  "lookaheadLimiter",
  "limiter",
  // Music Player — interim JS peel on efficient blob until native PCM upload (Phase B).
  "audioPlayer",
  "stepSequencer",
  "transport",
  "aliasSine",
  "blit",
  "sineWavetable",
  "antisaw",
  "archimedes",
  "additiveGenerator",
  "additiveLinearFilter",
  "additiveAnalogFilter",
  "additiveLadderFilter",
  "additiveBubble",
  "curveEnvelopeMod",
  "pluckEnvelopeMod",
  "additiveFrequencySkew",
  "additiveQuantizeFreq",
  "additiveQuantizePhase",
  "additiveNoisyFreq",
  "additiveNoisyPhase",
  "additivePan",
  "additiveNoisyPan",
  "additiveNoisyAmp",
  "additivePhaseEntry",
  "additiveBlaster",
  "additiveDiffusor",
  "additiveOut",
  "surgeOscillator",
  "softwaveOsc",
  "dsfOscillator",
  "hypersaw",
  "sinc",
  "bradley2a",
  "ellipsoid",
  "snowflake",
  "butterworth",
  "linkwitzRiley",
  "bessel",
  "papoulisFilter",
  "chebyshev",
  "elliptic",
  "eqFilter",
  "activeFilter",
  "passiveFilter",
  "tb303Filter",
  "flowerChildFilter",
  "yellowjacketFilter",
  "superloveFilter",
  "humanFilter",
  "resonatorFilter",
  "combResonator",
  "modeResonator",
  "chaoticPhaseLockingFilter",
  "inertialFilter",
  "expAdsr",
  "linearEnvelope",
  "pluckEnvelope",
  "flowerChildEnvelopeFollower",
  "delayEffect",
  "soemReverb",
  "pll",
  "lorenzAttractor",
  "logisticMap",
  "henonMap",
  "chuaAttractor",
  "rayBouncer",
  "chordMemory",
  "chordSequencer",
  "pitchQuantizer",
  "turingMachine",
  "fractalBrownianNoise",
  "piSpigotNoise",
  "randomWalk",
  "cheapWalk",
  "pulseExplosion",
  "spiral",
  "fractalSpiral",
  "logSpiral",
  "blubb",
  "boing",
  "keplerBouwkamp",
  "mushroom",
  "nyquistShannon",
  "radar",
  "torus",
  "wirdoSpiral",
  "phosphillator",
  "crossover2",
  "crossover3",
  "crossover4",
  "crossover5",
  "crossover6",
  "output",
]);

const NODE_GRAPH_EFFICIENT_PRODUCT_AUDIO_TYPE_SET = new Set(NODE_GRAPH_EFFICIENT_PRODUCT_AUDIO_TYPES);

// Scope / monitor faces that only observe engine buffers (non-DSP chrome).
// Keep this list exhaustive — do not consult definitions/catalog at runtime.
const NODE_GRAPH_EFFICIENT_PRODUCT_OBSERVER_TYPES = Object.freeze([
  "asciiscope",
  "badvalMonitor",
  "bloomGlow",
  "canvas",
  "chromaColor",
  "customDisplay",
  "dotOscilloscope",
  "gradientVectorscope",
  "helmholtzPitch",
  "lineBurnOscilloscope",
  "lufs",
  "matrixDisplay",
  "matrixWaterfall",
  "noiseDetector",
  "numberReadout",
  "oscilloscopeBank",
  "phosphorLight",
  "pixelGrid",
  "rasterRgb",
  "rgbaHsla",
  "rms",
  "rmsStereo",
  "sandboxVisuals",
  "scope2d",
  "scope2dTrace",
  "screenSpaceShader",
  "spectrogram",
  "speedColorInertia",
  "textStream",
  "traceDisplay",
  "traceDisplayStereo",
  "traceDisplayXyz",
  "traceRgb",
  "traceXyz",
  "valueLcd",
  "valueOscilloscope",
  "vectorDot",
  "vectorRgb",
  "videoscope",
  "visualOscilloscope",
]);

const NODE_GRAPH_EFFICIENT_PRODUCT_OBSERVER_TYPE_SET = new Set(
  NODE_GRAPH_EFFICIENT_PRODUCT_OBSERVER_TYPES,
);

// Non-DSP layout chrome that may remain in patches (not offered as DSP).
const NODE_GRAPH_EFFICIENT_PRODUCT_CHROME_TYPES = Object.freeze([
  "animatedTextBox",
  "textBox",
  // Slim repeatable Portal I/O (native thru / inlet silence until mic bus).
  "portalInlet",
  "portalInletMono",
  "portalInletLeft",
  "portalInletRight",
  "portalInletLeftRight",
  "portalOutlet",
  "portalOutletMono",
  "portalOutletLeft",
  "portalOutletRight",
  "portalOutletLeftRight",
]);

const NODE_GRAPH_EFFICIENT_PRODUCT_CHROME_TYPE_SET = new Set(
  NODE_GRAPH_EFFICIENT_PRODUCT_CHROME_TYPES,
);

const NODE_GRAPH_EFFICIENT_PRODUCT_FOREIGN_STATUS = "not in efficient build";

function nodeGraphEfficientProductEnabled() {
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp && typeof nodeGraphMvp === "object") {
    if (Object.hasOwn(nodeGraphMvp, "efficientProduct")) {
      return nodeGraphMvp.efficientProduct !== false;
    }
  }
  return true;
}

function nodeGraphEfficientProductAudioTypeAllowed(type) {
  return NODE_GRAPH_EFFICIENT_PRODUCT_AUDIO_TYPE_SET.has(String(type || "").trim());
}

function nodeGraphModuleIsEfficientProductObserverType(type) {
  return NODE_GRAPH_EFFICIENT_PRODUCT_OBSERVER_TYPE_SET.has(String(type || "").trim());
}

function nodeGraphModuleIsEfficientProductChromeType(type) {
  return NODE_GRAPH_EFFICIENT_PRODUCT_CHROME_TYPE_SET.has(String(type || "").trim());
}

/** Shop / Add Module: allowlisted live audio + observers + layout chrome. */
function nodeGraphModuleIsEfficientProductShopType(type) {
  const t = String(type || "").trim();
  if (!t) {
    return false;
  }
  return nodeGraphEfficientProductAudioTypeAllowed(t)
    || nodeGraphModuleIsEfficientProductObserverType(t)
    || nodeGraphModuleIsEfficientProductChromeType(t);
}

/** Plan apply: allowlist + observers + layout chrome. Everything else is foreign. */
function nodeGraphModuleIsEfficientProductPlanType(type) {
  const t = String(type || "").trim();
  if (!t) {
    return false;
  }
  return nodeGraphEfficientProductAudioTypeAllowed(t)
    || nodeGraphModuleIsEfficientProductObserverType(t)
    || nodeGraphModuleIsEfficientProductChromeType(t);
}

function nodeGraphEfficientProductForeignTypesFromNodes(nodes = []) {
  const foreign = [];
  const seen = new Set();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const t = String(node?.type || "").trim();
    if (!t || seen.has(t) || nodeGraphModuleIsEfficientProductPlanType(t)) {
      continue;
    }
    seen.add(t);
    foreign.push(t);
  }
  return foreign;
}

function nodeGraphEfficientProductRefuseMessage(foreignTypes = []) {
  const types = (Array.isArray(foreignTypes) ? foreignTypes : []).filter(Boolean);
  if (!types.length) {
    return NODE_GRAPH_EFFICIENT_PRODUCT_FOREIGN_STATUS;
  }
  return `${NODE_GRAPH_EFFICIENT_PRODUCT_FOREIGN_STATUS}: ${types.join(", ")}`;
}

function nodeGraphEfficientProductRefuseIssues(foreignTypes = []) {
  return (Array.isArray(foreignTypes) ? foreignTypes : [])
    .filter(Boolean)
    .map((type) => `${type}: ${NODE_GRAPH_EFFICIENT_PRODUCT_FOREIGN_STATUS}`);
}

/**
 * Throws when efficient product is on and the plan/patch has foreign audio (or other) types.
 * Prefer strip-on-live-plan for host audio; worklet may still hard-refuse as a backstop.
 */
function nodeGraphEfficientProductAssertPlanAllowed(nodes = [], options = {}) {
  if (options.enabled === false) {
    return null;
  }
  const enabled = options.enabled != null ? Boolean(options.enabled) : nodeGraphEfficientProductEnabled();
  if (!enabled) {
    return null;
  }
  const foreign = nodeGraphEfficientProductForeignTypesFromNodes(nodes);
  if (!foreign.length) {
    return null;
  }
  const message = nodeGraphEfficientProductRefuseMessage(foreign);
  const error = new Error(message);
  error.issues = nodeGraphEfficientProductRefuseIssues(foreign);
  error.efficientProduct = true;
  error.foreignTypes = foreign;
  throw error;
}

/**
 * Drop foreign DSP from a live plan so allowlisted modules still run.
 * Foreign types stay in the editor patch; they are simply not scheduled.
 * Returns { plan, foreignTypes }.
 */
function nodeGraphEfficientProductStripForeignFromLivePlan(plan, options = {}) {
  const enabled = options.enabled != null ? Boolean(options.enabled) : nodeGraphEfficientProductEnabled();
  if (!enabled || !plan || typeof plan !== "object") {
    return { plan, foreignTypes: [] };
  }
  const nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
  const foreignTypes = nodeGraphEfficientProductForeignTypesFromNodes(nodes);
  if (!foreignTypes.length) {
    return { plan, foreignTypes: [] };
  }
  const foreignSet = new Set(foreignTypes);
  const keepId = new Set(
    nodes.filter((n) => !foreignSet.has(String(n?.type || "").trim())).map((n) => String(n.id)),
  );
  const filterConn = (list) => (Array.isArray(list) ? list : []).filter((c) => (
    keepId.has(String(c?.sourceNode || "")) && keepId.has(String(c?.destinationNode || ""))
  ));
  const filterMods = (list) => (Array.isArray(list) ? list : []).filter((m) => (
    keepId.has(String(m?.sourceNode || "")) && keepId.has(String(m?.destinationNode || ""))
  ));
  const next = {
    ...plan,
    nodes: nodes.filter((n) => keepId.has(String(n?.id || ""))),
    order: (Array.isArray(plan.order) ? plan.order : []).filter((id) => keepId.has(String(id))),
    sourceNodes: (Array.isArray(plan.sourceNodes) ? plan.sourceNodes : [])
      .filter((id) => keepId.has(String(id))),
    bypassedNodes: (Array.isArray(plan.bypassedNodes) ? plan.bypassedNodes : [])
      .filter((id) => keepId.has(String(id))),
    connections: filterConn(plan.connections),
    feedbackConnections: filterConn(plan.feedbackConnections),
    graphConnections: filterConn(plan.graphConnections),
    feedbackGraphConnections: filterConn(plan.feedbackGraphConnections),
    modulations: filterMods(plan.modulations),
    feedbackModulations: filterMods(plan.feedbackModulations),
    scopeCaptureNodeIds: (Array.isArray(plan.scopeCaptureNodeIds) ? plan.scopeCaptureNodeIds : [])
      .filter((id) => keepId.has(String(id))),
    visualSinks: (Array.isArray(plan.visualSinks) ? plan.visualSinks : [])
      .filter((s) => keepId.has(String(s?.nodeId || ""))),
    efficientForeignStripped: foreignTypes.slice(),
  };
  return { plan: next, foreignTypes };
}
