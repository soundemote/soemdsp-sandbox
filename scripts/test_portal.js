var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "node-graph-stdlib", "node-graph-control-bus-helpers.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "portal", "portal-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var mix = nodeGraphPortalMixTrio(function (id, port) {
  if (id !== "a") return 0;
  if (port === "Mono") return 0.2;
  if (port === "Left") return 0.1;
  if (port === "Right") return 0.4;
  return 0;
}, "a");
assert(Math.abs(mix.Left - 0.3) < 1e-9, "trio L = mono+left");
assert(Math.abs(mix.Right - 0.6) < 1e-9, "trio R = mono+right");
assert(Math.abs(mix.Out - 0.45) < 1e-9, "trio M");

var out = nodeGraphPortalTrioOut(mix);
assert(out.Mono === out.Out && Math.abs(out.Left - 0.3) < 1e-9, "trio out");

var nodes = [
  { id: "a", type: "portalOutlet" },
  { id: "b", type: "portalOutlet" },
];
function mixPorts(id, port) {
  if (id === "a" && port === "Left") return 0.3;
  if (id === "b" && port === "Right") return 0.4;
  return 0;
}
var mixed = nodeGraphPortalMixOutlets(nodes, mixPorts, 0, 0);
assert(Math.abs(mixed.left - 0.3) < 1e-9, "mix L");
assert(Math.abs(mixed.right - 0.4) < 1e-9, "mix R");

var live = nodeGraphDspSandboxIoFrame({ Left: 0.5, Right: 0.5, Out: 0.5 }, 0.1, 0, 0);
assert(Math.abs(live.Left - 0.6) < 1e-9, "inlet mix live+mono");
assert(Math.abs(live.Right - 0.6) < 1e-9, "inlet mix live+mono R");

console.log("ok portal math");
