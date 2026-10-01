const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..", "public");

const sandbox = {
  console,
  window: {
    requestAnimationFrame(cb) { return 0; },
  },
  document: {
    createElement(tag) {
      // Minimal lip node for applyNodeGraphModuleLayout.
      const classSet = new Set();
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        children: [],
        dataset: {},
        hidden: false,
        classList: {
          add(...names) { names.forEach((n) => classSet.add(n)); },
          contains(name) { return classSet.has(name); },
        },
        setAttribute() {},
        addEventListener() {},
        style: { setProperty() {}, removeProperty() {} },
      };
    },
    getElementById() { return null; },
  },
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

assert(
  sandbox.nodeGraphModuleStripIoBandVisible("keyboard", { hideUnused: true }, { id: "kb1", type: "keyboard", ui: { hideUnused: true } }) === true,
  "strip IO visible when hide-unused still has connected jacks",
);
assert(
  sandbox.nodeGraphModuleStripIoBandVisible("keyboard", { hideUnused: true }, { id: "kb3", type: "keyboard", ui: { hideUnused: true } }) === false,
  "strip IO collapsed when hide-unused has zero connected jacks",
);
assert(
  sandbox.nodeGraphModuleStripIoBandVisible("keyboard", {}, { id: "kb2", type: "keyboard", ui: {} }) === true,
  "strip IO visible when hide-unused is off",
);

sandbox.nodeGraphModuleUsesLayoutB = function () { return true; };
assert(
  sandbox.nodeGraphModuleStripIoBandVisible("knob", {}, { id: "k1", type: "knob", ui: { hideUnused: true } }) === false,
  "LayoutB never exposes a strip IO band",
);
sandbox.nodeGraphModuleUsesLayoutB = function () { return false; };

const emptyBands = sandbox.nodeGraphModuleLayoutBands(
  "keyboard",
  { hideUnused: true },
  { id: "kb3", type: "keyboard", ui: { hideUnused: true } },
);
assert(!emptyBands.some((band) => band.id === "io" && band.visible), "empty hide-unused omits io band");

function mockEl(tag, className) {
  const classSet = new Set(String(className || "").split(/\s+/).filter(Boolean));
  const styleProps = new Map();
  const kids = [];
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: kids,
    dataset: {},
    hidden: false,
    isConnected: false,
    classList: {
      add(...names) { names.forEach((n) => classSet.add(n)); },
      remove(...names) { names.forEach((n) => classSet.delete(n)); },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === true) classSet.add(name);
        else if (force === false) classSet.delete(name);
        else if (classSet.has(name)) classSet.delete(name);
        else classSet.add(name);
        return classSet.has(name);
      },
    },
    style: {
      setProperty(k, v) { styleProps.set(k, String(v)); },
      getPropertyValue(k) { return styleProps.get(k) || ""; },
      removeProperty(k) {
        styleProps.delete(k);
        if (k === "grid-row") this._gridRow = "";
        if (k === "grid-column") this._gridColumn = "";
      },
      set gridRow(v) { this._gridRow = v; styleProps.set("grid-row", String(v)); },
      get gridRow() { return this._gridRow || ""; },
      set gridColumn(v) { this._gridColumn = v; styleProps.set("grid-column", String(v)); },
      get gridColumn() { return this._gridColumn || ""; },
      set gridTemplateColumns(v) { this._gtc = v; },
      get gridTemplateColumns() { return this._gtc || ""; },
      set gridTemplateRows(v) { this._gtr = v; },
      get gridTemplateRows() { return this._gtr || ""; },
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    append(child) { kids.push(child); return child; },
  };
  return node;
}

sandbox.applyNodeGraphModulePlateClip = function () {};
sandbox.nodeGraphModuleGeometryPublishAfterLayout = function () {};
sandbox.scheduleNodeGraphSliderReadoutRelayout = function () {};

const article = mockEl("article", "dsp-node chrome-layout-a");
article.dataset.nodeType = "keyboard";
const header = mockEl("div", "dsp-node-header");
const io = mockEl("div", "dsp-node-io-section");
io.style.gridRow = "2";
const face = mockEl("div", "node-module-face node-midi-keyboard-module");
article.append(header);
article.append(io);
article.append(face);

sandbox.applyNodeGraphModuleLayout(article, { id: "kb3", type: "keyboard", ui: { hideUnused: true } });
assert(article.classList.contains("io-strip-collapsed"), "article gets io-strip-collapsed when strip empty");
assert(io.hidden === true, "IO section hidden when strip collapsed");
assert(!io.style.gridRow, "collapsed IO clears stale grid-row");
assert(article.style.gridTemplateColumns === "minmax(0, 1fr)", "article stays single column");

sandbox.applyNodeGraphModuleLayout(article, { id: "kb1", type: "keyboard", ui: { hideUnused: true } });
assert(!article.classList.contains("io-strip-collapsed"), "io-strip-collapsed clears when jacks remain");
assert(io.hidden === false, "IO section shown when strip has connected jacks");

const layoutB = mockEl("article", "dsp-node chrome-layout-b");
layoutB.dataset.nodeType = "knob";
const shell = mockEl("div", "node-solid-module-shell node-module-chrome-layout-b-shell");
layoutB.append(mockEl("div", "dsp-node-header"));
layoutB.append(shell);
sandbox.nodeGraphModuleUsesLayoutB = function () { return true; };
sandbox.nodeGraphModuleDefinitions.knob = {
  chrome: "LayoutB",
  layout: "knob",
  inputs: ["In"],
  outputs: ["Out"],
  parameters: [],
};
sandbox.nodeGraphLayoutBShellHeightGu = function () { return 2; };
sandbox.nodeGraphModuleIsLayoutBDisplayOnly = function () { return false; };
sandbox.applyNodeGraphModuleLayout(layoutB, { id: "k1", type: "knob", ui: { hideUnused: true } });
assert(!layoutB.classList.contains("io-strip-collapsed"), "LayoutB never gets io-strip-collapsed");
sandbox.nodeGraphModuleUsesLayoutB = function () { return false; };

console.log("B-057 hide-unused IO lip OK", { full, hidden, hFull, hHide, none, outerFull, outerHide });
