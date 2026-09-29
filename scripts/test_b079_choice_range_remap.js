const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox";
const sandbox = { console, Math, Number, Object, Array, String, Boolean };
vm.createContext(sandbox);
sandbox.limit_decimals = (s) => String(s);
sandbox.normalizeNodeGraphMetadataMaxDigits = (n) => Number(n) || 2;
sandbox.nodeGraphFiniteNumber = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

const src = fs.readFileSync(path.join(root, "public/node-graph-slider-metadata.js"), "utf8");
const stubNames = [
  "normalizeNodeSliderCurveAmount",
  "normalizeNodeGraphMetadataSmoothingMode",
  "normalizeNodeGraphMetadataSmoothingType",
  "nodeSliderShouldDisplayChoices",
  "nodeSliderShouldDivideChoicesVisibly",
  "nodeSliderShouldShowSign",
  "nodeSliderShouldWraparound",
  "nodeSliderCurve",
  "nodeSliderCurveAmount",
  "nodeSliderShouldRemoveTrailingZeros",
  "nodeSliderSmoothingMode",
  "nodeSliderSmoothingType",
  "nodeSliderShouldLinearSmoothing",
  "nodeSliderShouldNonlinearSlider",
  "nodeSliderShouldReverse",
  "nodeSliderShouldBipolar",
  "nodeSliderShouldVisible",
  "nodeSliderShouldUseLinearSmoothing",
  "nodeSliderShouldUseNonlinearSlider",
  "clampNodeSliderValue",
  "formatNodeSliderCompactNumber",
  "formatNodeSliderNumber",
  "normalizeNodeSliderCurve",
];
for (const name of stubNames) {
  if (typeof sandbox[name] !== "function") {
    sandbox[name] = (...args) => {
      if (String(name).includes("Should")) return false;
      if (name === "nodeSliderCurve" || name === "normalizeNodeSliderCurve") return "linear";
      if (name.includes("CurveAmount")) return 0;
      if (name.includes("SmoothingMode")) return "off";
      if (name.includes("SmoothingType")) return "none";
      if (name === "clampNodeSliderValue") {
        const [v, lo, hi] = args;
        return Math.max(lo, Math.min(hi, Number(v)));
      }
      return args[0];
    };
  }
}
sandbox.nodeSliderShouldDisplayChoices = (slider) => slider?.dataset?.displayChoices === "true";
sandbox.nodeSliderShouldDivideChoicesVisibly = (slider) => slider?.dataset?.divideChoicesVisibly === "true";

vm.runInContext(src, sandbox);

function assert(name, cond) {
  if (!cond) throw new Error(name);
}

// Legacy bipolar full range
const meta = { displayChoices: true, choices: ["-1", "0", "+1"], min: -1, max: 1, step: 1, choiceOriginMin: -1 };
assert("idx-1", sandbox.nodeGraphPatchChoiceIndexFromValue(meta, -1) === 0);
assert("idx0", sandbox.nodeGraphPatchChoiceIndexFromValue(meta, 0) === 1);
assert("idx1", sandbox.nodeGraphPatchChoiceIndexFromValue(meta, 1) === 2);
assert("lab-1", sandbox.nodeGraphPatchChoiceLabel(meta, -1) === "-1");
assert("lab0", sandbox.nodeGraphPatchChoiceLabel(meta, 0) === "0");
assert("lab1", sandbox.nodeGraphPatchChoiceLabel(meta, 1) === "+1");

const slider = {
  min: "-1", max: "1", value: "-1",
  dataset: { choices: "-1, 0, +1", step: "1", displayChoices: "true", choiceOriginMin: "-1" },
};
assert("vfi0", sandbox.nodeSliderChoiceValueFromIndex(slider, 0) === -1);
assert("vfi1", sandbox.nodeSliderChoiceValueFromIndex(slider, 1) === 0);
assert("vfi2", sandbox.nodeSliderChoiceValueFromIndex(slider, 2) === 1);
assert("ifv-1", sandbox.nodeSliderChoiceIndexFromValue(slider, -1) === 0);
assert("ifv0", sandbox.nodeSliderChoiceIndexFromValue(slider, 0) === 1);
assert("ifv1", sandbox.nodeSliderChoiceIndexFromValue(slider, 1) === 2);

// B-079 PolyBLEP Waveform range 4–5 (Triangle, Sine) of 10-choice catalog
const waves = ["Trisaw", "Saw", "Ramp", "Square", "Triangle", "Sine", "Center Square", "Pulse", "Analog Square", "Trisaw Center"];
const poly = {
  displayChoices: true,
  choices: waves,
  min: 4,
  max: 5,
  step: 1,
  choiceOriginMin: 0,
};
const resolved = sandbox.nodeGraphResolveChoiceSet(poly);
assert("subset-len", resolved.choices.length === 2);
assert("subset-0", resolved.choices[0] === "Triangle");
assert("subset-1", resolved.choices[1] === "Sine");
assert("poly-idx4", sandbox.nodeGraphPatchChoiceIndexFromValue(poly, 4) === 0);
assert("poly-idx5", sandbox.nodeGraphPatchChoiceIndexFromValue(poly, 5) === 1);
assert("poly-lab4", sandbox.nodeGraphPatchChoiceLabel(poly, 4) === "Triangle");
assert("poly-lab5", sandbox.nodeGraphPatchChoiceLabel(poly, 5) === "Sine");

// Without choiceOriginMin, 0-based inference still remaps PolyBLEP
const polyInfer = { displayChoices: true, choices: waves, min: 4, max: 5, step: 1 };
assert("infer-lab4", sandbox.nodeGraphPatchChoiceLabel(polyInfer, 4) === "Triangle");
assert("infer-lab5", sandbox.nodeGraphPatchChoiceLabel(polyInfer, 5) === "Sine");

// Bipolar clamped 0…1 with origin -1 → ["0","+1"]
const bipClamp = {
  displayChoices: true,
  choices: ["-1", "0", "+1"],
  min: 0,
  max: 1,
  step: 1,
  choiceOriginMin: -1,
};
assert("bip-sub", sandbox.nodeGraphResolveChoiceSet(bipClamp).choices.join(",") === "0,+1");
assert("bip-lab0", sandbox.nodeGraphPatchChoiceLabel(bipClamp, 0) === "0");
assert("bip-lab1", sandbox.nodeGraphPatchChoiceLabel(bipClamp, 1) === "+1");
assert("bip-idx0", sandbox.nodeGraphPatchChoiceIndexFromValue(bipClamp, 0) === 0);
assert("bip-idx1", sandbox.nodeGraphPatchChoiceIndexFromValue(bipClamp, 1) === 1);

const polySlider = {
  min: "4", max: "5", value: "4",
  dataset: {
    choices: waves.join(", "),
    step: "1",
    displayChoices: "true",
    divideChoicesVisibly: "true",
    choiceOriginMin: "0",
  },
};
assert("ps-lab", sandbox.nodeSliderChoiceLabel(polySlider) === "Triangle");
polySlider.value = "5";
assert("ps-lab5", sandbox.nodeSliderChoiceLabel(polySlider) === "Sine");
assert("ps-vfi0", sandbox.nodeSliderChoiceValueFromIndex(polySlider, 0) === 4);
assert("ps-vfi1", sandbox.nodeSliderChoiceValueFromIndex(polySlider, 1) === 5);

console.log("test_b079_choice_range_remap ok");
