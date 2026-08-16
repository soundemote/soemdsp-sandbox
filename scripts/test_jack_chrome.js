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
      inputs: ["Reset", "Speed", "Phase"],
      outputs: ["Mono", "Left", "Right", "Phase", "Trigger"],
      digitalInputs: ["Reset"],
      digitalOutputs: ["Trigger"],
    },
    loneR: {
      outputs: ["R"],
      outputLabels: { R: "R" },
    },
  },
  nodeGraphModuleStoreCatalog: {
    lorenzAttractor: { category: "chaos" },
    rasterRgb: { category: "visual" },
    output: { category: "io" },
  },
  nodeGraphNodeLabels: {
    output: "Output",
    gain: "Gain",
    rasterRgb: "Raster RGB",
    audioPlayer: "Music Player",
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
assert(ch("gain", "Out", "output") === "green", "gain Out is green");
assert(ch("gain", "In", "input") === "green", "gain In is green");
assert(ch("rasterRgb", "R", "output") === "red", "RGB R is red");
assert(ch("rasterRgb", "G", "input") === "green", "RGB G is green");
assert(ch("rasterRgb", "B", "output") === "blue", "RGB B is blue");
assert(ch("loneR", "R", "output") === "", "lone R is not Right and not RGB");
assert(ch("lorenzAttractor", "X", "output") === "red", "chaos X red");
assert(ch("lorenzAttractor", "Y", "output") === "blue", "chaos Y blue");
assert(ch("lorenzAttractor", "Z", "output") === "green", "chaos Z green");
assert(ch("quadrature", "Sin", "output") === "red", "sin red");
assert(ch("quadrature", "Cos", "output") === "blue", "cos blue");
assert(ch("audioPlayer", "Trigger", "output") === "", "digital trigger has no channel");
assert(ch("audioPlayer", "Reset", "input") === "", "digital reset has no channel");
assert(ch("audioPlayer", "Left", "output") === "red", "player Left red");
assert(ch("audioPlayer", "Right", "output") === "blue", "player Right blue");
assert(ch("audioPlayer", "Mono", "output") === "green", "player Mono green");

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
