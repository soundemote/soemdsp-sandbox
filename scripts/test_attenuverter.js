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

load("public/node-graph-slider-metadata.js");
load("public/node-graph-slider-values.js");
load("public/modules/attenuverter/attenuverter-math.js");

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

assertClose("unity", sandbox.nodeGraphAttenuverterSample(0.8, 1, 0), 0.8);
assertClose("mute", sandbox.nodeGraphAttenuverterSample(0.8, 0, 0), 0);
assertClose("invert", sandbox.nodeGraphAttenuverterSample(0.8, -1, 0), -0.8);
assertClose("offset", sandbox.nodeGraphAttenuverterSample(0.5, 0.5, -0.25), 0);
assertClose("frame", sandbox.nodeGraphAttenuverterFrame(1, 0.5, 0.1).Out, 0.6);

assert(sandbox.normalizeNodeSliderCurve("bipolar rational".replace(" ", "")) === "linear"
  || sandbox.normalizeNodeSliderCurve("bipolarRational") === "bipolarRational",
  "normalize bipolarRational");
assert(sandbox.normalizeNodeSliderCurve("bipolarRational") === "bipolarRational", "camel");
assert(sandbox.normalizeNodeSliderCurve("bipolar-rational") === "bipolarRational", "kebab");
assert(sandbox.nodeSliderCurveUsesSensitivity("bipolarRational"), "uses sensitivity");

assertClose("linear center", sandbox.nodeSliderBipolarRationalValueFromTravel(0.5, 0), 0.5);
assertClose("linear quarter", sandbox.nodeSliderBipolarRationalValueFromTravel(0.25, 0), 0.25);
assertClose("fine-center stays near mid", sandbox.nodeSliderBipolarRationalValueFromTravel(0.6, 0.8), 0.6, 0.1);
{
  const near = sandbox.nodeSliderBipolarRationalValueFromTravel(0.6, 0.8);
  assert(Math.abs(near - 0.5) < Math.abs(0.6 - 0.5), "positive amount compresses toward center");
}

for (const amount of [-0.9, -0.4, 0, 0.4, 0.55, 0.9]) {
  for (const t of [0, 0.1, 0.25, 0.5, 0.62, 0.75, 0.9, 1]) {
    const v = sandbox.nodeSliderBipolarRationalValueFromTravel(t, amount);
    const back = sandbox.nodeSliderBipolarRationalTravelFromValue(v, amount);
    assertClose(`roundtrip t=${t} a=${amount}`, back, t, 1e-6);
  }
}

console.log("test_attenuverter.js ok");
