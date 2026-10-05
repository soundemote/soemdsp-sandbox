var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "node-graph-stdlib", "node-graph-control-bus-helpers.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var live = nodeGraphDspSandboxIoFrame({ Left: 0.5, Right: 0.5, Out: 0.5 }, 0.1, 0, 0);
assert(Math.abs(live.Left - 0.6) < 1e-9, "inlet mix live+mono");
assert(Math.abs(live.Right - 0.6) < 1e-9, "inlet mix live+mono R");

console.log("ok portal math");
