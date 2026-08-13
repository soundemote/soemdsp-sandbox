var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..", "public");
eval(fs.readFileSync(path.join(root, "modules", "kickEnvelope", "kick-envelope-math.js"), "utf8"));
eval(fs.readFileSync(path.join(root, "modules", "sineKick", "sine-kick-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphSineKickDecayS(0.28) === 0.28, "decay seconds");
assert(nodeGraphSineKickPitchHz(52) === 52, "pitch hz");
assert(nodeGraphSineKickPunchOct(5) === 4, "punch clamp");

var rest = nodeGraphSineKickHz(10, 52, 1.7, 0.28, 1);
assert(Math.abs(rest - 52) < 0.2, "pitch settles to rest");
var start = nodeGraphSineKickHz(0, 52, 1.7, 0.28, 1);
assert(start > 140 && start < 180, "punch raises start Hz");

var sine = createNodeGraphSineKickState();
var silent = nodeGraphSineKickSample(sine, 0, 80, 0, 0.3, 1, 48000, 1, 0);
assert(silent.Out === 0 && silent.A === 0, "idle silent");

var hit = nodeGraphSineKickSample(sine, 1, 80, 0, 0.3, 1, 48000, 1, 0);
assert(Math.abs(hit.Out) < 1e-6, "sine starts at 0");
assert(hit.A > 0.9, "trigger A near 1");

var sinePeak = 0;
for (var i = 0; i < 2000; i += 1) {
  var s = nodeGraphSineKickSample(sine, 0, 80, 0, 0.3, 1, 48000, 1, 0);
  if (Math.abs(s.Out) > sinePeak) sinePeak = Math.abs(s.Out);
}
assert(sinePeak > 0.4 && sinePeak < 1.05, "sine body near unity");

var sq = createNodeGraphSineKickState();
nodeGraphSineKickSample(sq, 1, 80, 0, 0.3, 1, 48000, 1, 1);
var sqNearOne = 0;
var samples = 0;
for (var k = 0; k < 2000; k += 1) {
  var q = nodeGraphSineKickSample(sq, 0, 80, 0, 0.3, 1, 48000, 1, 1);
  if (Math.abs(q.A) > 0.4) {
    samples += 1;
    if (Math.abs(q.Out) > 0.85 * q.A) sqNearOne += 1;
  }
}
assert(samples > 20, "square kick has body");
assert(sqNearOne / samples > 0.55, "sharpness 1 spends most of the cycle near the rails");

var muted = createNodeGraphSineKickState();
var muteHit = nodeGraphSineKickSample(muted, 1, 80, 0, 0.3, 0, 48000, 1, 0);
assert(muteHit.Out === 0 && muteHit.A === 0, "amplitude 0 silences");

console.log("ok sine kick");
