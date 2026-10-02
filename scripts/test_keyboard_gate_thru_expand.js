/**
 * Keyboard/GridKeyboard Gate|Trigger thru expansion:
 *   Src → KB.Gate + KB.Gate → Dst  ⇒  also Src → Dst
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = path.join(__dirname, "..", "public");
const sandbox = {
  console,
  Object,
  Array,
  Map,
  Set,
  String,
  Number,
  Boolean,
  Math,
  JSON,
  NodeLiveAudioProcessor: function NodeLiveAudioProcessor() {},
};
sandbox.NodeLiveAudioProcessor.prototype = {};
vm.createContext(sandbox);

// Load only the expand helper by evaluating the file and hoping it attaches.
// The file is large and depends on many globals; extract the function body instead.
const src = fs.readFileSync(
  path.join(root, "node-live-audio-worklet-native-graph.js"),
  "utf8",
);
const start = src.indexOf("NodeLiveAudioProcessor.CONTROLLER_DIGITAL_THRU_TYPES");
const end = src.indexOf(
  "NodeLiveAudioProcessor.prototype.syncNativeHostCvFeeders",
  start,
);
assert(start >= 0 && end > start, "could not locate thru expand helpers");
vm.runInContext(src.slice(start, end), sandbox, { filename: "thru-expand-slice.js" });

const P = sandbox.NodeLiveAudioProcessor;
const proto = P.prototype;

const nodes = new Map([
  ["clock-1", { type: "clock" }],
  ["keyboard-1", { type: "keyboard" }],
  ["env-1", { type: "pluckEnvelope3" }],
  ["grid-1", { type: "gridKeyboard" }],
  ["other-1", { type: "gain" }],
]);

const self = {
  nodes,
  expandControllerDigitalThruConnections: proto.expandControllerDigitalThruConnections,
};

const connections = [
  {
    sourceNode: "clock-1",
    sourcePort: "Digital Out",
    destinationNode: "keyboard-1",
    destinationPort: "Gate",
  },
  {
    sourceNode: "keyboard-1",
    sourcePort: "Gate",
    destinationNode: "env-1",
    destinationPort: "Trigger",
  },
  {
    sourceNode: "clock-1",
    sourcePort: "T",
    destinationNode: "keyboard-1",
    destinationPort: "Trigger",
  },
  {
    sourceNode: "keyboard-1",
    sourcePort: "Trigger",
    destinationNode: "env-1",
    destinationPort: "Trigger",
  },
  {
    sourceNode: "other-1",
    sourcePort: "Out",
    destinationNode: "env-1",
    destinationPort: "In",
  },
];

const expanded = self.expandControllerDigitalThruConnections(connections);
const thruLegs = expanded.filter((c) => c._controllerDigitalThru);

assert(
  thruLegs.some(
    (c) =>
      c.sourceNode === "clock-1"
      && c.sourcePort === "Digital Out"
      && c.destinationNode === "env-1"
      && c.destinationPort === "Trigger"
      && c._viaNode === "keyboard-1"
      && c._viaPort === "Gate",
  ),
  "Gate thru must expand Clock Digital Out → env Trigger",
);

assert(
  thruLegs.some(
    (c) =>
      c.sourceNode === "clock-1"
      && c.sourcePort === "T"
      && c.destinationNode === "env-1"
      && c.destinationPort === "Trigger"
      && c._viaPort === "Trigger",
  ),
  "Trigger thru must expand Clock T → env Trigger",
);

assert(
  !thruLegs.some((c) => c.sourceNode === "other-1"),
  "unrelated cables must not expand",
);

assert(
  expanded.length === connections.length + 2,
  `expected +2 thru legs, got ${expanded.length - connections.length}`,
);

// Idempotent: expanding again must not duplicate.
const twice = self.expandControllerDigitalThruConnections(expanded);
assert(twice.length === expanded.length, "second expand must not duplicate legs");

console.log("keyboard gate thru expand OK", {
  legs: thruLegs.map((c) => `${c.sourceNode}.${c.sourcePort}->${c.destinationNode}.${c.destinationPort} via ${c._viaNode}.${c._viaPort}`),
});
