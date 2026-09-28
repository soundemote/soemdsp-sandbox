const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..", "public");

const sandbox = {
  console,
  nodeGraphGrid: { heightPx: 28, sizePx: 28, widthPx: 28 },
  nodeGraphMvp: {
    patch: {
      nodes: [
        { id: "kb1", type: "keyboard", ui: { hideUnused: true } },
        { id: "kb2", type: "keyboard", ui: { hideUnused: false } },
      ],
      connections: [
        { sourceNode: "kb1", sourcePort: "Gate", destinationNode: "out", destinationPort: "Mono" },
        { sourceNode: "kb1", sourcePort: "pitch", destinationNode: "osc", destinationPort: "pitch" },
      ],
      modulations: [],
      graphConnections: [],
    },
    moduleButtonsVisible: true,
    moduleOscilloscopesVisible: true,
    moduleInterfaceControlsVisible: true,
    moduleSlidersVisible: true,
  },
  nodeGraphModuleDefinitions: {
    keyboard: {
      chrome: "LayoutA",
      layout: "keyboard",
      displayType: "keyboardControllerFace",
      displayHeightGu: 7,
      inputs: ["Play Keys", "Arp Keys", "Chord Memory"],
      outputs: [
        "Play Keys", "Arp Keys", "Chord Memory", "pitch", "inc",
        "Gate", "Trigger", "KeyIndex", "KeyNorm", "X", "Y",
      ],
      parameters: [],
    },
  },
  nodeGraphFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  },
  nodeGraphModuleLayout: {
    bodyRowGapGu: 0,
    fitCushionGu: 0,
    headerHeightGu: 76 / 28,
    headerTitleRowHeightGu: 1,
    moduleScopeHeightGu: 2,
    moduleGridInsetGu: 2 / 28,
    textBoxBodyMinGu: 2,
    ioRowHeightGu: 0.52,
    ioRowGapGu: 0,
    ioSectionMinHeightGu: 0.52,
    ioPaddingYGu: 0,
    sliderRowHeightGu: 1,
  },
  nodeGraphModuleGuPolicy: { minGu: 1, maxGu: 60 },
  nodeGraphEffectivePatchNodeUi(ui) { return ui || {}; },
  normalizeNodeGraphPatchNodeUi(ui) { return ui || {}; },
  nodeGraphModuleUsesLayoutB() { return false; },
  nodeGraphModuleUsesLayoutC() { return false; },
  nodeGraphModuleUsesMetamoduleLayout() { return false; },
  nodeGraphIsContainerShellType() { return false; },
  nodeGraphModuleDisplayVisibleForUi() { return true; },
  nodeGraphModuleTypeHasHideableSliders() { return false; },
  nodeGraphModuleInterfaceControlsVisibleForUi() { return false; },
  nodeGraphModuleDisplayHeightUnits() { return 7; },
  nodeGraphModuleSliderBodyHeightGu() { return 0; },
  nodeGraphModuleConfiguredDisplayHeightUnits() { return 7; },
  nodeGraphModuleDefaultDisplayHeightUnits() { return 7; },
  nodeGraphChromelessModuleLayouts: new Set(),
  nodeGraphChromelessModuleIsCompactTile() { return false; },
  nodeGraphChromelessModuleHasCustomDisplayArea() { return false; },
  nodeGraphNodeTypeHasTextBoxLayout() { return false; },
  nodeGraphModuleTypeHasCustomDisplayArea() { return false; },
  nodeGraphModuleTypeHasHideableOscilloscope() { return true; },
  nodeGraphModuleHasFace() { return true; },
};

vm.createContext(sandbox);
function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
}
load("node-graph-module-chrome.js");
load("node-graph-patch-clone.js");
sandbox.nodeGraphEffectivePatchNodeUi = function (ui) { return ui || {}; };
sandbox.normalizeNodeGraphPatchNodeUi = function (ui) { return ui || {}; };
load("node-graph-module-sizing.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const full = sandbox.nodeGraphModuleIoRowCount("keyboard", { id: "kb2", type: "keyboard", ui: { hideUnused: false } });
assert(full === 11, `full keyboard rows expected 11, got ${full}`);

const hidden = sandbox.nodeGraphModuleIoRowCount("keyboard", { id: "kb1", type: "keyboard", ui: { hideUnused: true } });
assert(hidden === 2, `hideUnused keyboard with Gate+pitch should be 2 rows, got ${hidden}`);

const hFull = sandbox.nodeGraphModuleIoSectionHeightGu("keyboard", { id: "kb2", type: "keyboard", ui: {} });
const hHide = sandbox.nodeGraphModuleIoSectionHeightGu("keyboard", { id: "kb1", type: "keyboard", ui: { hideUnused: true } });
assert(hHide < hFull, `hideUnused IO height ${hHide} should be < full ${hFull}`);

const none = sandbox.nodeGraphModuleIoRowCount("keyboard", {
  id: "kb3",
  type: "keyboard",
  ui: { hideUnused: true },
});
assert(none === 0, `hideUnused with no wires should be 0 rows, got ${none}`);
assert(
  sandbox.nodeGraphModuleIoSectionHeightGu("keyboard", { id: "kb3", type: "keyboard", ui: { hideUnused: true } }) === 0,
  "zero-row IO height must be 0",
);

const outerFull = sandbox.nodeGraphModuleOuterHeightGu("keyboard", {}, { id: "kb2", type: "keyboard", ui: {} });
const outerHide = sandbox.nodeGraphModuleOuterHeightGu("keyboard", { hideUnused: true }, { id: "kb1", type: "keyboard", ui: { hideUnused: true } });
assert(outerHide < outerFull, `outer hideUnused ${outerHide} should be < full ${outerFull}`);

console.log("B-057 hide-unused IO lip OK", { full, hidden, hFull, hHide, none, outerFull, outerHide });
