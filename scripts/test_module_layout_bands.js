// §7 band-stack checks for MODULE_LAYOUT_PLAN / B-036.
// Asserts hide-display omits the face track so I/O and sliders cannot share a row.

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..", "public");

var sandbox = {
  console: console,
  nodeGraphMvp: {
    moduleButtonsVisible: true,
    moduleOscilloscopesVisible: true,
    moduleInterfaceControlsVisible: true,
    moduleSlidersVisible: true,
  },
  nodeGraphChromelessModuleIsCompactTile: function () { return false; },
  nodeGraphEffectivePatchNodeUi: function (ui) {
    return ui || {};
  },
  nodeGraphNodeTypeHasTextBoxLayout: function (type) {
    return sandbox.nodeGraphModuleDefinitions?.[type]?.layout === "textBox";
  },
  nodeGraphModuleTypeHasCustomDisplayArea: function (type) {
    return Boolean(sandbox.nodeGraphModuleDefinitions?.[type]?.customDisplayArea);
  },
  nodeGraphModuleDefinitions: {
    output: {
      chrome: "LayoutA",
      displayType: "waterfall",
      inputs: ["Mono", "Left", "Right"],
      parameters: [{ key: "volume" }],
    },
    gain: {
      chrome: "LayoutA",
      inputs: ["In", "Left", "Right"],
      outputs: ["Out", "Left", "Right"],
      parameters: [{ key: "amount" }, { key: "offset" }],
    },
    samplePlayer: {
      chrome: "LayoutA",
      displayType: "waterfall",
      inputs: ["Trigger"],
      outputs: ["Out", "Left", "Right"],
      parameters: [{ key: "level" }, { key: "pitch" }],
    },
    sampleLooper: {
      chrome: "LayoutA",
      displayType: "waterfall",
      inputs: ["Gate"],
      outputs: ["Out", "Left", "Right"],
      parameters: [{ key: "level" }, { key: "pitch" }],
    },
    audioPlayer: {
      chrome: "LayoutA",
      layout: "sampleWaveform",
      displayType: "waterfall",
      inputs: ["Reset"],
      outputs: ["Mono", "Left", "Right"],
      parameters: [{ key: "amplitude" }, { key: "speed" }],
    },
    kickEnvelope: {
      chrome: "LayoutA",
      layout: "roundShape",
      customDisplayArea: true,
      displayType: "roundShapeFace",
      displayHeightGu: 5,
      inputs: ["T"],
      outputs: ["A"],
      parameters: [{ key: "amplitude" }, { key: "low" }, { key: "high" }, { key: "speed" }],
    },
    activeFilter: {
      chrome: "LayoutA",
      layout: "filterCurve",
      displayHeightGu: 5,
      inputs: ["In", "Left", "Right"],
      outputs: ["Out", "Left", "Right"],
      parameters: [{ key: "mode" }, { key: "frequency" }],
    },
    matrixWaterfall: {
      chrome: "LayoutA",
      layout: "matrixWaterfall",
      customDisplayArea: true,
      displayHeightGu: 10,
      inputs: ["Reset", "Spawn", "Speed"],
      parameters: [{ key: "density" }, { key: "speed" }],
    },
    smoothGraph: {
      chrome: "LayoutB",
      layout: "graph",
      customDisplayArea: true,
      displayHeightGu: 8,
      inputs: ["In"],
      outputs: ["Out"],
      parameters: [{ key: "mode" }, { key: "rate" }],
    },
    vectorscopeTransform: {
      chrome: "LayoutC",
      inputs: ["L", "R"],
      outputs: ["X", "Y"],
      parameters: [],
    },
    metamodule: {
      chrome: "MetamoduleLayout",
      customDisplayArea: true,
      displayHeightGu: 2,
      inputs: ["Poly", "Amplitude"],
      outputs: [],
      parameters: [{ key: "voices" }, { key: "playmode" }],
    },
    textBox: {
      chrome: "LayoutA",
      layout: "textBox",
      displayType: "textBoxFace",
      inputs: [],
      outputs: [],
      parameters: [],
    },
  },
  nodeGraphFiniteNumber: function (value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  },
  nodeGraphGrid: { heightPx: 28, sizePx: 28, widthPx: 28 },
  nodeGraphModuleLayout: {
    bodyRowGapGu: 0,
    fitCushionGu: 0,
    headerHeightGu: 76 / 28,
    moduleScopeHeightGu: 2,
    moduleGridInsetGu: 2 / 28,
    textBoxBodyMinGu: 2,
    ioRowHeightGu: 1,
    ioRowGapGu: 0,
    ioSectionMinHeightGu: 1,
    ioPaddingYGu: 0,
    sliderRowHeightGu: 1,
  },
  nodeGraphTextBoxHeightLimits: { minGu: 2, maxGu: 60 },
};
vm.createContext(sandbox);
function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
}
load("node-graph-module-chrome.js");
load("node-graph-patch-clone.js");
load("node-graph-module-sizing.js");
// patch-clone's function declaration replaces the pre-load stub. Restore a
// test double that passes ui through and applies workspace Displays-off.
sandbox.nodeGraphEffectivePatchNodeUi = function (ui) {
  const base = ui || {};
  const globalScopes = sandbox.nodeGraphMvp.moduleOscilloscopesVisible !== false;
  let oscilloscopeHidden = Boolean(base.oscilloscopeHidden);
  if (base.oscilloscopeForceShow) {
    oscilloscopeHidden = false;
  } else if (!globalScopes) {
    oscilloscopeHidden = true;
  }
  return { ...base, oscilloscopeHidden };
};
var nodeGraphModuleLayoutBands = sandbox.nodeGraphModuleLayoutBands;
var nodeGraphModuleHasFace = sandbox.nodeGraphModuleHasFace;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ids(bands) {
  return bands.filter((b) => b.visible && (b.heightGu > 0 || b.grow || b.id === "lip")).map((b) => b.id);
}

function bands(type, ui) {
  return nodeGraphModuleLayoutBands(type, ui || {});
}

function contentIds(type, ui) {
  return ids(bands(type, ui)).filter((id) => id !== "lip");
}

/** Top edge of a visible band in gu, from the stack order (0 = article top). */
function bandTop(type, ui, id) {
  let y = 0;
  const list = bands(type, ui).filter((b) => b.visible && (b.heightGu > 0 || b.grow || b.id === "lip"));
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === id) {
      return y;
    }
    y += Math.max(0, list[i].heightGu);
  }
  return null;
}

function hasFace(type) {
  return nodeGraphModuleHasFace(type);
}

var cases = [
  { type: "output", layout: "A", face: true, sliders: true, io: true },
  { type: "gain", layout: "A", face: true, sliders: true, io: true },
  { type: "samplePlayer", layout: "A", face: true, sliders: true, io: true, controls: true },
  { type: "sampleLooper", layout: "A", face: true, sliders: true, io: true, controls: true },
  { type: "audioPlayer", layout: "A", face: true, sliders: true, io: true },
  { type: "kickEnvelope", layout: "A", face: true, sliders: true, io: true },
  { type: "activeFilter", layout: "A", face: true, sliders: true, io: true },
  { type: "matrixWaterfall", layout: "A", face: true, sliders: true, io: true },
  { type: "smoothGraph", layout: "B", face: true, sliders: true, io: false },
  { type: "vectorscopeTransform", layout: "C", face: false, sliders: false, io: true },
  { type: "metamodule", layout: "M", face: true, sliders: true, io: true },
];

cases.forEach(function (c) {
  var shown = contentIds(c.type, {});
  if (c.layout === "C") {
    assert(shown.indexOf("face") < 0, c.type + " LayoutC has no face");
    assert(shown.indexOf("params") < 0, c.type + " LayoutC has no params");
    assert(shown.indexOf("header") === 0, c.type + " LayoutC starts with header");
    assert(shown.indexOf("io") >= 0, c.type + " LayoutC has io");
    return;
  }
  if (c.layout === "B") {
    assert(shown.indexOf("shell") >= 0, c.type + " LayoutB has shell");
    assert(shown.indexOf("io") < 0, c.type + " LayoutB has no under-face io track");
    var bOff = contentIds(c.type, { oscilloscopeHidden: true });
    assert(bOff.indexOf("face") < 0, c.type + " hide display does not add a face track");
    assert(bOff[0] === "header", c.type + " hide display still header first");
    assert(bOff.indexOf("shell") >= 0, c.type + " hide display keeps jack shell");
    var bNoSliders = contentIds(c.type, { oscilloscopeHidden: true, slidersHidden: true });
    assert(bNoSliders.indexOf("params") < 0, c.type + " hide display+sliders drops params");
    return;
  }
  if (c.layout === "M") {
    assert(shown[0] === "header", c.type + " MetamoduleLayout starts with header " + shown);
    assert(shown.indexOf("io") >= 0, c.type + " MetamoduleLayout has top io " + shown);
    assert(shown.indexOf("face") >= 0, c.type + " MetamoduleLayout has face " + shown);
    assert(shown.indexOf("io") < shown.indexOf("face"), c.type + " io before face " + shown);
    assert(shown.indexOf("shell") < 0, c.type + " MetamoduleLayout has no LayoutB shell");
    var all = ids(bands(c.type, {}));
    assert(all.indexOf("lip") >= 0, c.type + " MetamoduleLayout always has lip clearance " + all);
    var mOff = contentIds(c.type, { oscilloscopeHidden: true });
    assert(mOff.indexOf("face") < 0, c.type + " hide display drops face track");
    assert(mOff.indexOf("io") >= 0, c.type + " hide display keeps top io");
    var grid = sandbox.nodeGraphMetamoduleLayoutGridHeightUnits(c.type, {});
    var content = sandbox.nodeGraphMetamoduleLayoutContentHeightGu(c.type, {});
    assert(grid >= Math.ceil(content), c.type + " outer >= ceil(content)");
    var slackPx = (grid - content) * 28;
    assert(slackPx >= 2 - 1e-6, c.type + " clearance slack >= 2px got " + slackPx);
    return;
  }

  // LayoutA §7.1 display on
  assert(shown[0] === "header", c.type + " display on: header first " + shown);
  if (c.controls) {
    assert(shown.indexOf("controls") > shown.indexOf("header"), c.type + " controls after header");
  }
  if (c.face && hasFace(c.type)) {
    assert(shown.indexOf("face") >= 0, c.type + " display on: has face " + shown);
    if (shown.indexOf("io") >= 0) {
      assert(shown.indexOf("io") < shown.indexOf("face"),
        c.type + " io above face " + shown);
      const ioEdge = bandTop(c.type, {}, "io");
      const faceEdge = bandTop(c.type, {}, "face");
      assert(ioEdge != null && faceEdge != null && ioEdge < faceEdge,
        c.type + " io top edge above face top edge " + ioEdge + " vs " + faceEdge + " " + shown);
    }
    if (c.controls && shown.indexOf("controls") >= 0) {
      assert(shown.indexOf("face") < shown.indexOf("controls"),
        c.type + " sample controls stay under the face " + shown);
    }
  }
  if (c.io) {
    assert(shown.indexOf("io") >= 0, c.type + " display on: has io");
  }
  if (c.sliders) {
    assert(shown.indexOf("params") >= 0, c.type + " display on: has params");
    if (shown.indexOf("io") >= 0) {
      assert(shown.indexOf("io") < shown.indexOf("params"), c.type + " io before params " + shown);
    }
  }

  // §7.2 display off
  var off = contentIds(c.type, { oscilloscopeHidden: true });
  assert(off.indexOf("face") < 0, c.type + " display off: no face " + off);
  assert(off[0] === "header", c.type + " display off: header first");
  if (c.controls && off.indexOf("controls") >= 0) {
    assert(off.indexOf("controls") > off.indexOf("header"), c.type + " display off: controls remain under header");
  }
  if (c.io) {
    assert(off.indexOf("io") >= 0, c.type + " display off: io remains");
    assert(off[1] === "io", c.type + " display off: io under header, no face track " + off);
    if (c.controls && off.indexOf("controls") >= 0) {
      assert(off.indexOf("io") < off.indexOf("controls"), c.type + " display off: io above sample controls " + off);
    }
  }
  if (c.sliders && off.indexOf("io") >= 0) {
    assert(off.indexOf("io") < off.indexOf("params"), c.type + " display off: io before params " + off);
  }

  // §7.3 display off + sliders off
  var noSliders = contentIds(c.type, { oscilloscopeHidden: true, slidersHidden: true });
  assert(noSliders.indexOf("face") < 0, c.type + " no sliders: no face");
  assert(noSliders.indexOf("params") < 0, c.type + " no sliders: no params " + noSliders);
  if (c.io) {
    assert(noSliders.indexOf("io") >= 0, c.type + " no sliders: io remains");
  }

  // §7.4 display off + I/O off
  var noIo = contentIds(c.type, { oscilloscopeHidden: true, ioHidden: true });
  assert(noIo.indexOf("face") < 0, c.type + " no io: no face");
  assert(noIo.indexOf("io") < 0, c.type + " no io: io gone " + noIo);
  if (c.sliders) {
    assert(noIo.indexOf("params") >= 0, c.type + " no io: params remain " + noIo);
    assert(noIo.indexOf("params") > noIo.indexOf("header"), c.type + " no io: params under header");
  }

  // Display Height 0 omits the face track; I/O stays under the header.
  if (c.face && hasFace(c.type)) {
    var heightOff = contentIds(c.type, { displayHeightGu: 0 });
    assert(heightOff.indexOf("face") < 0, c.type + " display height 0: no face " + heightOff);
    assert(heightOff[0] === "header", c.type + " display height 0: header first " + heightOff);
    if (c.io) {
      assert(heightOff[1] === "io", c.type + " display height 0: io under header " + heightOff);
    }
  }

  // Display on + sliders off + I/O off: face grows; no leftover lip track.
  if (c.face && hasFace(c.type)) {
    var plate = bands(c.type, { slidersHidden: true, ioHidden: true });
    var plateFace = plate.find(function (b) { return b.id === "face" && b.visible; });
    var plateLip = plate.find(function (b) { return b.id === "lip" && b.visible; });
    assert(plateFace, c.type + " display-only: has face");
    assert(plateFace.grow, c.type + " display-only: face takes leftover plate");
    assert(!plateLip, c.type + " display-only: no lip " + ids(plate));
  }
});

// App-wide 1gu floor — one policy for every module / screen.
var textBoxMin = sandbox.nodeGraphTextBoxMinOuterHeightGu({});
assert(textBoxMin === 1, "text box min outer is the 1gu policy");
assert(
  sandbox.normalizeNodeGraphTextBoxHeightUnits(1) === 1,
  "heightGu=1 is legal",
);
assert(
  sandbox.nodeGraphModuleWidthLimitsForType("keyboardController").minGu === 1,
  "keyboard width floor is 1gu",
);
assert(
  sandbox.nodeGraphModuleHeightLimitsForType("output").minGu === 1,
  "output height floor is 1gu",
);
assert(
  sandbox.nodeGraphModuleDisplayHeightLimitsForType("audioPlayer").minGu === 0,
  "display height 0 is Off (face track omitted)",
);
assert(
  sandbox.nodeGraphModuleMinOuterHeightGu("audioPlayer", {}) === 1,
  "music player outer floor is 1gu",
);
// Workspace Displays-off: same omission as per-module hide. LayoutB shell stays.
sandbox.nodeGraphMvp.moduleOscilloscopesVisible = false;
var workspaceOff = contentIds("output", {});
assert(workspaceOff.indexOf("face") < 0, "workspace displays off: output has no face " + workspaceOff);
assert(workspaceOff[0] === "header" && workspaceOff[1] === "io",
  "workspace displays off: output io under header " + workspaceOff);
var workspaceSample = contentIds("audioPlayer", {});
assert(workspaceSample.indexOf("face") < 0, "workspace displays off: music player has no face " + workspaceSample);
assert(workspaceSample[1] === "io", "workspace displays off: music player io under header " + workspaceSample);
var workspaceB = contentIds("smoothGraph", {});
assert(workspaceB.indexOf("shell") >= 0, "workspace displays off: LayoutB keeps shell " + workspaceB);
assert(workspaceB.indexOf("io") < 0, "workspace displays off: LayoutB has no under-face io");
var workspaceC = contentIds("vectorscopeTransform", {});
assert(workspaceC.indexOf("face") < 0, "workspace displays off: InletOutletLayout still has no face");
assert(workspaceC.indexOf("header") === 0 && workspaceC.indexOf("io") > 0,
  "workspace displays off: InletOutletLayout stays header then io " + workspaceC);
sandbox.nodeGraphMvp.moduleOscilloscopesVisible = true;

var textBoxShown = contentIds("textBox", {});
assert(textBoxShown.indexOf("header") === 0, "text box starts with header");
assert(textBoxShown.indexOf("face") >= 0, "text box body is the face track " + textBoxShown);

console.log("ok module layout bands §7");
