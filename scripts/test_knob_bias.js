const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = {
  console,
  Math,
  Number,
  Object,
};
vm.createContext(sandbox);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox);
}

load("public/node-graph-stdlib/node-graph-param-surface-helpers.js");
load("public/node-graph-stdlib/node-graph-control-bus-helpers.js");

function assert(name, cond) {
  if (!cond) {
    throw new Error(name);
  }
}

function assertClose(name, got, expected, eps = 1e-9) {
  if (!(Math.abs(got - expected) <= eps)) {
    throw new Error(`${name}: got ${got}, expected ${expected}`);
  }
}

// Patch knob: Bias 67 in 0…150 (superlove lp18 breadboard).
const knobNode = {
  id: "knob-1",
  type: "knob",
  params: {
    offset: 67.01009799903119,
    displaySource: 0,
    polarity: 0,
  },
  paramMeta: {
    offset: {
      min: 0,
      max: 150,
      mid: 0.5,
      bipolar: false,
      linearSmoothing: true,
      smoothingMode: "internal",
      smoothingSeconds: 1469,
      smoothingType: "linear",
    },
  },
};

const rangeBefore = sandbox.nodeGraphDspKnobOffsetDomain(knobNode);
assertClose("patch domain min", rangeBefore.min, 0);
assertClose("patch domain max", rangeBefore.max, 150);

sandbox.nodeGraphDspApplyControllerLiveSmoothing(knobNode);
const rangeAfter = sandbox.nodeGraphDspKnobOffsetDomain(knobNode);
assertClose("live-smoothing keeps min 0", rangeAfter.min, 0);
assertClose("live-smoothing keeps max 150", rangeAfter.max, 150);
assertClose("live-smoothing keeps offset 67", knobNode.params.offset, 67.01009799903119);
assert(knobNode.paramMeta.offset.max === 150, "paramMeta.max must stay 150, not snap to 1");

const published = sandbox.nodeGraphDspBiasFromIn(knobNode.params.offset, 0);
assertClose("Bias jack is smoothed domain (67), not unit 1", published.Bias, 67.01009799903119);
assertClose("Out aliases Bias", published.Out, published.Bias);

const withIn = sandbox.nodeGraphDspBiasFromIn(67, 3);
assertClose("In adds after smooth", withIn.Bias, 70);

const omittedRange = sandbox.nodeGraphDspBiasFromIn(67.5, 0);
assertClose("omitted min/max must not clamp to 0 (Number(null) trap)", omittedRange.Bias, 67.5);

const oldClamp = sandbox.nodeGraphDspBiasFromIn(67, 0, 0, 1);
assertClose("explicit 0…1 clamp still works when asked", oldClamp.Bias, 1);

console.log("test_knob_bias.js ok", {
  bias: published.Bias,
  domain: rangeAfter,
});
