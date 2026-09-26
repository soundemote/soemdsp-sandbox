const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox";
const sandbox = { console, Math, Number, Object, Array, String, Boolean };
vm.createContext(sandbox);
sandbox.limit_decimals = (s) => String(s);
sandbox.normalizeNodeGraphMetadataMaxDigits = (n) => Number(n) || 2;
sandbox.nodeGraphFiniteNumber = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

// Load only the choice helpers by extracting/evaluating the file with no-op stubs
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
];
for (const name of stubNames) {
  if (typeof sandbox[name] !== "function") {
    sandbox[name] = (...args) => {
      if (name.startsWith("nodeSliderShould") || name.startsWith("normalize") === false && name.includes("Should")) return false;
      if (name.startsWith("nodeSliderShould")) return false;
      if (name === "nodeSliderCurve") return "linear";
      if (name === "nodeSliderCurveAmount" || name === "normalizeNodeSliderCurveAmount") return 0;
      if (name.includes("SmoothingMode")) return "off";
      if (name.includes("SmoothingType")) return "none";
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

const meta = { displayChoices: true, choices: ["-1", "0", "+1"], min: -1, max: 1, step: 1 };
assert("idx-1", sandbox.nodeGraphPatchChoiceIndexFromValue(meta, -1) === 0);
assert("idx0", sandbox.nodeGraphPatchChoiceIndexFromValue(meta, 0) === 1);
assert("idx1", sandbox.nodeGraphPatchChoiceIndexFromValue(meta, 1) === 2);
assert("lab-1", sandbox.nodeGraphPatchChoiceLabel(meta, -1) === "-1");
assert("lab0", sandbox.nodeGraphPatchChoiceLabel(meta, 0) === "0");
assert("lab1", sandbox.nodeGraphPatchChoiceLabel(meta, 1) === "+1");

// Old label path treated value as index: value 0 → choices[0] = "-1"
assert("old-bug-demo", Math.max(0, Math.min(2, Math.round(0))) === 0);

const slider = {
  min: "-1", max: "1", value: "-1",
  dataset: { choices: "-1, 0, +1", step: "1", displayChoices: "true" },
};
assert("vfi0", sandbox.nodeSliderChoiceValueFromIndex(slider, 0) === -1);
assert("vfi1", sandbox.nodeSliderChoiceValueFromIndex(slider, 1) === 0);
assert("vfi2", sandbox.nodeSliderChoiceValueFromIndex(slider, 2) === 1);
assert("ifv-1", sandbox.nodeSliderChoiceIndexFromValue(slider, -1) === 0);
assert("ifv0", sandbox.nodeSliderChoiceIndexFromValue(slider, 0) === 1);
assert("ifv1", sandbox.nodeSliderChoiceIndexFromValue(slider, 1) === 2);

// Type-in fix contract: index → domain
const typed = (label) => {
  const choices = sandbox.parseNodeMetadataChoices(slider.dataset.choices);
  const idx = choices.findIndex((c) => c.toLowerCase() === String(label).trim().toLowerCase());
  return idx >= 0 ? sandbox.nodeSliderChoiceValueFromIndex(slider, idx) : Number(label);
};
assert("type-1", typed("-1") === -1);
assert("type0", typed("0") === 0);
assert("type+1", typed("+1") === 1);

console.log("test_knob_choice_neg ok");
