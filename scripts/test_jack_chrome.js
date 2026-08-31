// Jack chrome SSOT + visibility helpers.
// Classification is color-first (red/green/blue). Lone R is never Right.

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..", "public");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function el(tag) {
  var classSet = new Set();
  var attrs = {};
  var kids = [];
  var dataset = {};
  var node = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children: kids,
    childNodes: kids,
    dataset: dataset,
    hidden: false,
    textContent: "",
    style: {
      _map: {},
      setProperty: function (k, v) { this._map[k] = String(v); },
      getPropertyValue: function (k) { return this._map[k] || ""; },
    },
    classList: {
      add: function () {
        for (var i = 0; i < arguments.length; i++) classSet.add(arguments[i]);
      },
      remove: function () {
        for (var i = 0; i < arguments.length; i++) classSet.delete(arguments[i]);
      },
      contains: function (name) { return classSet.has(name); },
    },
    append: function () {
      for (var i = 0; i < arguments.length; i++) {
        kids.push(arguments[i]);
        arguments[i].parentNode = node;
      }
    },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return attrs[k]; },
    closest: function () { return null; },
    getBoundingClientRect: function () { return { width: 8, height: 16, top: 0, left: 0 }; },
    querySelectorAll: function () { return []; },
  };
  Object.defineProperty(node, "className", {
    get: function () { return Array.from(classSet).join(" "); },
    set: function (value) {
      classSet.clear();
      String(value || "").split(/\s+/).filter(Boolean).forEach(function (name) { classSet.add(name); });
    },
  });
  return node;
}

var sandbox = {
  console: console,
  Map: Map,
  Set: Set,
  document: { createElement: el },
  window: {},
  nodeGraphModuleDefinitions: {
    output: {
      inputs: ["Mono", "Left", "Right"],
      inputLabels: { Mono: "Mono", Left: "Left", Right: "Right" },
    },
    gain: {
      inputs: ["In", "Left", "Right"],
      outputs: ["Out", "Left", "Right"],
      inputLabels: { In: "In", Left: "Left", Right: "Right" },
      outputLabels: { Out: "Out", Left: "Left", Right: "Right" },
    },
    mixStereo: {
      inputs: ["Mono", "L1", "R1", "L2", "R2", "L3", "R3", "L4", "R4"],
      outputs: ["Mono", "Left", "Right"],
    },
    rasterRgb: {
      inputs: ["R", "G", "B"],
      outputs: ["R", "G", "B"],
      inputLabels: { R: "R", G: "G", B: "B" },
      outputLabels: { R: "R", G: "G", B: "B" },
    },
    lorenzAttractor: {
      outputs: ["X", "Y", "Z"],
      outputLabels: { X: "X", Y: "Y", Z: "Z" },
    },
    quadrature: {
      outputs: ["Sin", "Cos"],
      outputLabels: { Sin: "Sin", Cos: "Cos" },
    },
    audioPlayer: {
      inputs: ["Reset", "Start Time", "End Time", "Speed", "Phase"],
      outputs: ["Mono", "Left", "Right", "Phase", "Trigger"],
      digitalInputs: ["Reset", "Start Time", "End Time"],
      digitalOutputs: ["Trigger"],
    },
    loneR: {
      outputs: ["R"],
      outputLabels: { R: "R" },
    },
    fbmField: {
      inputs: ["In"],
      inputAliases: { Reset: "In" },
      inputLabels: { In: "→" },
      outputs: ["X", "Y", "Z"],
      outputLabels: { X: "X", Y: "Y", Z: "Z" },
    },
    fractalBrownianNoise: {
      outputs: ["Out X", "Out Y", "Out Z"],
      outputAliases: { X: "Out X", Y: "Out Y", Z: "Out Z" },
    },
    phoneTone: {
      outputs: ["Tone", "ToneL", "ToneR", "ƒ1", "ƒ2"],
      digitalOutputs: ["ƒ1", "ƒ2"],
    },
    additiveGenerator: {
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveLinearFilter: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveAnalogFilter: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveBubble: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveNoisyFreq: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveNoisyPhase: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveNoisyPan: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveNoisyAmp: {
      dataInputs: ["Graph"],
      dataOutputs: ["Graph"],
      outputs: [],
    },
    additiveOut: {
      dataInputs: ["Graph"],
      outputs: ["Mono", "Left", "Right"],
    },
    // Hypothetical CMYK Parameter port — only listed types get cyan.
    cmykParamDemo: {
      inputs: ["Morph"],
      blockRateInputs: ["Morph"],
      outputs: ["Out"],
    },
    polyBlep: {
      inputs: ["Morph"],
      outputs: ["Wave Out"],
    },
  },
  nodeGraphModuleStoreCatalog: {
    lorenzAttractor: { category: "chaos" },
    rasterRgb: { category: "visual" },
    output: { category: "io" },
    fbmField: { category: "noise" },
    fractalBrownianNoise: { category: "noise" },
  },
  nodeGraphNodeLabels: {
    output: "Output",
    gain: "Gain",
    mixStereo: "MixStereo",
    rasterRgb: "Pixel Grid",
    audioPlayer: "Music Player",
    fbmField: "Fractal Brownian Field",
    fractalBrownianNoise: "Fractal Brownian Motion",
    phoneTone: "Phone Tone",
  },
  nodeGraphLabel: function (node, port) { return String(port || ""); },
  nodeGraphPatchNode: function () { return null; },
  normalizeNodeGraphPatchMetadataAlias: function (value) { return value ? String(value).trim() : ""; },
  nodeGraphPortIsDigitalSignal: function (type, port, io) {
    var def = sandbox.nodeGraphModuleDefinitions[type];
    if (!def) return false;
    if (port === "Scale") return true;
    if (io !== "output" && def.digitalInputs && def.digitalInputs.indexOf(port) >= 0) return true;
    if (io !== "input" && def.digitalOutputs && def.digitalOutputs.indexOf(port) >= 0) return true;
    return false;
  },
  nodeGraphPortIsGraphChunkSignal: function (type, port, io) {
    var def = sandbox.nodeGraphModuleDefinitions[type];
    if (!def || port !== "Graph") return false;
    if (io !== "output" && def.dataInputs && def.dataInputs.indexOf(port) >= 0) return true;
    if (io !== "input" && def.dataOutputs && def.dataOutputs.indexOf(port) >= 0) return true;
    return false;
  },
  nodeGraphPortIsBlockRateSignal: function (type, port, io) {
    var def = sandbox.nodeGraphModuleDefinitions[type];
    if (!def) return false;
    if (io !== "output" && def.blockRateInputs && def.blockRateInputs.indexOf(port) >= 0) return true;
    if (io !== "input" && def.blockRateOutputs && def.blockRateOutputs.indexOf(port) >= 0) return true;
    return false;
  },
  nodeGraphFrequencyValuePortDisplayLabel: function (raw) { return raw; },
  nodeGraphModuleUsesLayoutB: function () { return false; },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
}
load("node-graph-jack-chrome.js");
load("node-graph-module-factories.js");

var ch = sandbox.nodeGraphJackChannel;
assert(ch("output", "Left", "input") === "red", "output Left is red");
assert(ch("output", "Mono", "input") === "green", "output Mono is green");
assert(ch("output", "Right", "input") === "blue", "output Right is blue");
assert(ch("mixStereo", "Mono", "input") === "green", "MixStereo Mono in is green");
assert(ch("mixStereo", "L1", "input") === "red", "MixStereo L1 is red");
assert(ch("mixStereo", "R1", "input") === "blue", "MixStereo R1 is blue");
assert(ch("mixStereo", "L4", "input") === "red", "MixStereo L4 is red");
assert(ch("mixStereo", "R4", "input") === "blue", "MixStereo R4 is blue");
assert(ch("mixStereo", "Mono", "output") === "green", "MixStereo Mono out is green");
assert(ch("mixStereo", "Left", "output") === "red", "MixStereo Left is red");
assert(ch("mixStereo", "Right", "output") === "blue", "MixStereo Right is blue");
assert(ch("gain", "Out", "output") === "purple", "gain Out is purple (In/Out rule)");
assert(ch("gain", "In", "input") === "purple", "gain In is purple (In/Out rule)");
assert(ch("rasterRgb", "R", "output") === "red", "RGB R is red");
assert(ch("rasterRgb", "G", "input") === "green", "RGB G is green");
assert(ch("rasterRgb", "B", "output") === "blue", "RGB B is blue");
assert(ch("loneR", "R", "output") === "", "lone R is not Right and not RGB");
assert(ch("lorenzAttractor", "X", "output") === "red", "chaos X red");
assert(ch("lorenzAttractor", "Y", "output") === "blue", "chaos Y blue");
assert(ch("lorenzAttractor", "Z", "output") === "green", "chaos Z green");
assert(ch("fbmField", "X", "output") === "red", "fBf X red");
assert(ch("fbmField", "Y", "output") === "blue", "fBf Y blue");
assert(ch("fbmField", "Z", "output") === "green", "fBf Z green");
assert(ch("fbmField", "In", "input") === "purple", "fBf In is purple (In/Out rule)");
assert(ch("fractalBrownianNoise", "Out X", "output") === "red", "fBm Out X red");
assert(ch("fractalBrownianNoise", "Out Y", "output") === "blue", "fBm Out Y blue");
assert(ch("fractalBrownianNoise", "Out Z", "output") === "green", "fBm Out Z green");
assert(ch("phoneTone", "ToneL", "output") === "red", "Phone ToneL red");
assert(ch("phoneTone", "ToneR", "output") === "blue", "Phone ToneR blue");
assert(ch("phoneTone", "ƒ1", "output") === "", "Phone ƒ1 is digital Hz");
assert(ch("quadrature", "Sin", "output") === "red", "sin red");
assert(ch("quadrature", "Cos", "output") === "blue", "cos blue");
assert(ch("audioPlayer", "Trigger", "output") === "", "digital trigger has no channel");
assert(ch("audioPlayer", "Reset", "input") === "", "digital reset has no channel");
assert(ch("audioPlayer", "Start Time", "input") === "", "digital start time has no channel");
assert(ch("audioPlayer", "End Time", "input") === "", "digital end time has no channel");
assert(ch("audioPlayer", "Left", "output") === "red", "player Left red");
assert(ch("audioPlayer", "Right", "output") === "blue", "player Right blue");
assert(ch("audioPlayer", "Mono", "output") === "green", "player Mono green");

// CMYK additive plane: Yellow Graph, Cyan Parameter only when blockRate-listed (M/K unused).
assert(ch("additiveGenerator", "Graph", "output") === "yellow", "Graph out is yellow");
assert(ch("additiveLinearFilter", "Graph", "input") === "yellow", "Linear Filter Graph in is yellow");
assert(ch("additiveLinearFilter", "Graph", "output") === "yellow", "Linear Filter Graph out is yellow");
assert(ch("additiveBubble", "Graph", "input") === "yellow", "Bubble Graph in is yellow");
assert(ch("additiveNoisyFreq", "Graph", "output") === "yellow", "NoisyFreq Graph out is yellow");
assert(ch("additiveNoisyPan", "Graph", "input") === "yellow", "NoisyPan Graph in is yellow");
assert(ch("additiveOut", "Left", "output") !== "yellow", "Additive Out Left is audio not Graph");
assert(ch("additiveOut", "Graph", "input") === "yellow", "Out Graph in is yellow");
assert(ch("cmykParamDemo", "Morph", "input") === "cyan", "listed Parameter Morph is cyan");
assert(ch("polyBlep", "Morph", "input") === "", "PolyBLEP Morph is gold (no channel)");
assert(sandbox.nodeGraphJackChannelCssColor("yellow") === "#ffe600", "yellow wire CSS");
assert(sandbox.nodeGraphJackChannelCssColor("cyan") === "#00e5ff", "cyan wire CSS");
assert(sandbox.nodeGraphJackChannelCssColor("turquoise") === "#00e5ff", "legacy turquoise aliases cyan");

sandbox.nodeGraphMvp = { wiresFollowPortColors: true };
assert(sandbox.nodeGraphWiresFollowPortColors() === true, "follow default on");
assert(sandbox.nodeGraphJackWireColor("rasterRgb", "R", "output") === "#f25d5d", "follow RGB R wire");
assert(sandbox.nodeGraphJackWireColor("output", "Left", "input") === "#f25d5d", "follow stereo L wire");
assert(sandbox.nodeGraphJackWireColor("output", "Right", "input") === "#4d8dff", "follow stereo R wire");
assert(sandbox.nodeGraphJackWireColor("audioPlayer", "Phase", "output") === "", "uncolored analog no follow color");
assert(sandbox.nodeGraphJackWireColor("audioPlayer", "Trigger", "output") === "#ffffff", "digital wire stays white");
sandbox.nodeGraphMvp.wiresFollowPortColors = false;
assert(sandbox.nodeGraphJackWireColor("rasterRgb", "R", "output") === "", "follow off leaves RGB to analog gold");
sandbox.nodeGraphMvp.wiresFollowPortColors = true;

assert(sandbox.nodeGraphOutletChannelKind("output", "Left", "input") === "left", "legacy left");
assert(sandbox.nodeGraphOutletChannelKind("output", "Mono", "input") === "mono", "legacy mono");
assert(sandbox.nodeGraphOutletChannelKind("output", "Right", "input") === "right", "legacy right");
assert(sandbox.nodeGraphOutletChannelKind("rasterRgb", "R", "output") === "left", "legacy RGB R maps red→left slot");

var mark = el("button");
var applied = sandbox.nodeGraphApplyJackChrome(mark, "output", "Left", "input");
assert(applied === "red", "apply returns red");
assert(mark.dataset.jackChannel === "red", "dataset.jackChannel set");
assert(!mark.dataset.outletChannel, "legacy outletChannel cleared");
assert(!mark.classList.contains("node-outlet-left"), "legacy class cleared");

var analog = el("button");
sandbox.nodeGraphApplyJackChrome(analog, "audioPlayer", "Phase", "output");
assert(!analog.dataset.jackChannel, "uncolored analog has no channel");

var column = sandbox.createNodeGraphIoColumn("n1", "output", ["Mono", "Left", "Right"], "input");
assert(column, "io column created");
assert(column.children.length === 3, "three inlet rows");
var buttons = [];
function walk(node) {
  if (!node) return;
  if (node.classList && node.classList.contains("node-port")) buttons.push(node);
  (node.children || []).forEach(walk);
}
walk(column);
assert(buttons.length === 3, "three inlet buttons, got " + buttons.length);
assert(buttons[0].classList.contains("input"), "inlet class");
assert(buttons[0].dataset.port === "Mono", "first port Mono");
assert(column.children[0].dataset.jackChannel === "green", "Mono row green");
assert(column.children[1].dataset.jackChannel === "red", "Left row red");
assert(column.children[2].dataset.jackChannel === "blue", "Right row blue");
assert(buttons[1].dataset.jackChannel === "red", "Left button red");

var rgbCol = sandbox.createNodeGraphIoColumn("rgb", "rasterRgb", ["R", "G", "B"], "output");
assert(rgbCol.children[0].dataset.jackChannel === "red", "RGB out R");
assert(rgbCol.children[1].dataset.jackChannel === "green", "RGB out G");
assert(rgbCol.children[2].dataset.jackChannel === "blue", "RGB out B");
assert(sandbox.nodeGraphStereoJackDisplayLabel("R", "rasterRgb", "R") === "R", "RGB R label stays R");
assert(sandbox.nodeGraphStereoJackDisplayLabel("R", "gain", "R") === "Right", "non-RGB R spells Right");

var fakePort = el("button");
fakePort.classList.add("node-port", "input");
fakePort.dataset.node = "output";
fakePort.dataset.port = "Left";
fakePort.dataset.io = "input";
fakePort.dataset.jackChannel = "red";
assert(sandbox.nodeGraphJackIsSignalPort(fakePort), "signal port helper");
var vis = sandbox.nodeGraphJackElementVisibility(fakePort);
assert(vis.painted, "mock port counts as painted (8x16)");
assert(vis.channel === "red", "visibility sees channel");

var param = el("button");
param.classList.add("node-port", "node-param-port", "input");
assert(!sandbox.nodeGraphJackIsSignalPort(param), "param jack is not a signal port");

var css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
assert(css.includes('data-jack-channel="red"'), "CSS paints red channel");
assert(css.includes('data-jack-channel="green"'), "CSS paints green channel");
assert(css.includes('data-jack-channel="blue"'), "CSS paints blue channel");
assert(css.includes("--node-jack-red"), "CSS defines jack red");
assert(/\.node-port\s*\{[\s\S]*?display:\s*block/.test(css), "base .node-port is a block jack");
assert(/\.dsp-node\.unused-hidden .node-port:not\(\.connected-port\)/.test(css), "unused hide is opt-in");
assert(/\.dsp-node\.io-hidden .dsp-node-io-section/.test(css), "io hide is opt-in");
assert(!/\.node-port\s*\{\s*display:\s*none/.test(css), "default .node-port is not display:none");
assert(css.includes("max-height: none;"), "row jacks do not collapse via max-height:100%");

var empty = sandbox.nodeGraphJackVisibilityCensus({
  querySelectorAll: function (sel) {
    if (sel === ".dsp-node") return [];
    if (sel === ".node-port") return [];
    return [];
  },
  querySelector: function () { return null; },
});
assert(empty.ok === false, "empty census is not ok");
assert(empty.portCount === 0, "empty census has no ports");

console.log("ok jack chrome + visibility");
