/**
 * B-063 smoke: Robin Oscillator morph ParamModEdge must target WIDTH (not SHAPE).
 * Softwave morph stays on SHAPE. No audio runtime — mapNativeGraphParamId only.
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(
  path.join(__dirname, "../public/node-live-audio-worklet-native-graph.js"),
  "utf8",
);

// Minimal stub so we can eval the mapper without the full worklet.
const NodeLiveAudioProcessor = function NodeLiveAudioProcessor() {};
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SHAPE = 13;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_WIDTH = 31;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_FEEDBACK = 20;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_PHASE = 12;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_KEY_IDS = Object.freeze({
  morph: NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SHAPE,
});

const start = src.indexOf("NodeLiveAudioProcessor.prototype.mapNativeGraphParamId");
if (start < 0) throw new Error("mapNativeGraphParamId not found");
const end = src.indexOf("\nNodeLiveAudioProcessor.prototype.fnv1aHash32", start);
if (end < 0) throw new Error("fnv1aHash32 marker not found");
// eslint-disable-next-line no-eval
eval(src.slice(start, end));

const map = NodeLiveAudioProcessor.prototype.mapNativeGraphParamId.bind({});
const P = NodeLiveAudioProcessor;
const cases = [
  ["softwaveOsc", "morph", P.NATIVE_GRAPH_PARAM_SHAPE, "Softwave Morph → SHAPE"],
  ["polyBlep", "morph", P.NATIVE_GRAPH_PARAM_SHAPE, "polyBlep Morph → SHAPE"],
  ["robinOscillator", "morph", P.NATIVE_GRAPH_PARAM_WIDTH, "Robin Morph → WIDTH (B-063)"],
  ["hypersaw2", "morph", P.NATIVE_GRAPH_PARAM_FEEDBACK, "Hypersaw Morph → FEEDBACK"],
  ["spiral", "morph", P.NATIVE_GRAPH_PARAM_PHASE, "Spiral Morph → PHASE"],
];
let failed = 0;
for (const [type, key, expect, label] of cases) {
  const got = map(type, key);
  if (got !== expect) {
    console.error(`FAIL ${label}: got ${got}, expected ${expect}`);
    failed += 1;
  } else {
    console.log(`ok  ${label} (${got})`);
  }
}

// analoghorror.json: morph MOD destination must map to WIDTH
const patchPath = path.join(
  __dirname,
  "../patches/demo patches/analoghorror.json",
);
const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const morphMods = (patch.modulations || []).filter(
  (m) => m.destinationNode === "robinOscillator-1" && m.destinationParam === "morph",
);
if (morphMods.length < 1) {
  console.error("FAIL analoghorror.json missing robin morph modulation");
  failed += 1;
} else {
  const id = map("robinOscillator", "morph");
  if (id !== P.NATIVE_GRAPH_PARAM_WIDTH) {
    console.error("FAIL analoghorror morph ParamModEdge would target wrong Control");
    failed += 1;
  } else {
    console.log(`ok  analoghorror robin morph MOD → WIDTH (src=${morphMods[0].sourceNode})`);
  }
}

if (failed) {
  console.error(`B-063 smoke FAILED (${failed})`);
  process.exit(1);
}
console.log("B-063 smoke OK");
