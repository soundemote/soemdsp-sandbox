var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "portal", "portal-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphPortalClampChannel(-3) === 0, "channel floor");
assert(nodeGraphPortalClampChannel(99) === 31, "channel ceil");
assert(nodeGraphPortalChannelFromNode({ params: { channel: 1 } }) === 1, "params channel");
assert(nodeGraphPortalPickChannel({ Left: 0.2, Right: 0.8, Out: 0.5 }, 0) === 0.2, "pick L");
assert(nodeGraphPortalPickChannel({ Left: 0.2, Right: 0.8, Out: 0.5 }, 1) === 0.8, "pick R");
assert(nodeGraphPortalPickChannel({ Left: 0.2, Right: 0.8, Out: 0.5 }, 2) === 0.5, "pick M");
var nodes = [
  { id: "a", type: "portalOutlet", params: { channel: 0 } },
  { id: "b", type: "portalOutlet", params: { channel: 1 } },
];
function mix(id) {
  return id === "a" ? 0.3 : 0.4;
}
var mixed = nodeGraphPortalMixOutlets(nodes, mix, 0, 0);
assert(Math.abs(mixed.left - 0.3) < 1e-9, "mix L");
assert(Math.abs(mixed.right - 0.4) < 1e-9, "mix R");
console.log("ok portal math");
