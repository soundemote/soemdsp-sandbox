var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..", "public");
eval(fs.readFileSync(path.join(root, "modules", "kickEnvelope", "kick-envelope-math.js"), "utf8"));
eval(fs.readFileSync(path.join(root, "modules", "ellipsoid", "ellipsoid-settings.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphKickEnvelopeClampUnit(2, 0) === 1, "clamp high");
assert(nodeGraphKickEnvelopeReadUnit(0.25, 40, 0) === 0.25, "prefer new unit");
assert(nodeGraphKickEnvelopeReadUnit(NaN, 40, 0) === 0, "legacy Hz ignored");
assert(nodeGraphKickEnvelopeReadUnit(NaN, 0.4, 0) === 0.4, "legacy unit kept");

var sine0 = nodeGraphKickEnvelopeEnv01(0, 0);
var sine1 = nodeGraphKickEnvelopeEnv01(1, 0);
assert(Math.abs(sine0 - 1) < 1e-9, "sine start 1");
assert(Math.abs(sine1) < 1e-9, "sine end 0");
assert(Math.abs(nodeGraphKickEnvelopeEnv01(0.5, 0) - Math.SQRT1_2) < 1e-9, "quarter-cos mid still high");
assert(nodeGraphKickEnvelopeEnv01(0.5, 1) === 1, "sharpness 1 holds mid");
assert(nodeGraphKickEnvelopeEnv01(1, 1) === 0, "sharpness 1 ends 0");
assert(nodeGraphKickEnvelopeEnv01(0.5, 0.5) > nodeGraphKickEnvelopeEnv01(0.5, 0), "sharpness lifts mid vs sine");

assert(Math.abs(nodeGraphKickEnvelopeMapA(1, 0.2, 0.8) - 0.8) < 1e-9, "high maps");
assert(Math.abs(nodeGraphKickEnvelopeMapA(0, 0.2, 0.8) - 0.2) < 1e-9, "low maps");

var state = createNodeGraphKickEnvelopeState();
var silent = nodeGraphKickEnvelopeSample(state, 0, 0.1, 0.9, 0, 48000);
assert(Math.abs(silent.A - 0.1) < 1e-9, "idle rests at Low");

var started = nodeGraphKickEnvelopeSample(state, 1, 0, 1, 0, 48000);
assert(started.A > 0.9 && started.A <= 1, "trigger near High");

var mid = started;
for (var i = 0; i < 2400; i += 1) {
  mid = nodeGraphKickEnvelopeSample(state, 1, 0, 1, 0, 48000);
}
assert(mid.A > 0 && mid.A < 1, "mid decay in range");

var frames = Math.ceil(0.2 * 48000) + 8;
var held = mid;
for (var n = 0; n < frames; n += 1) {
  held = nodeGraphKickEnvelopeSample(state, 0, 0.15, 1, 0, 48000);
}
assert(Math.abs(held.A - 0.15) < 1e-9, "done rests at Low");

var retrig = nodeGraphKickEnvelopeSample(state, 1, 0, 1, 0, 48000);
assert(retrig.A > 0.9, "rising T retriggers");

var muted = createNodeGraphKickEnvelopeState();
var mutedHit = nodeGraphKickEnvelopeSample(muted, 1, 0, 1, 0, 48000, 0, 0.2, 0);
assert(mutedHit.A === 0, "amplitude 0 silences A");

assert(Math.abs(nodeGraphKickEnvelopeDurationS(0.05) - 0.05) < 1e-12, "speed seconds");
var q0 = nodeGraphKickEnvelopeQuarterPoint(0, 0);
var q1 = nodeGraphKickEnvelopeQuarterPoint(1, 0);
assert(q0.x < -0.7 && Math.abs(q0.y) < 0.35, "quarter start is left");
assert(Math.abs(q1.x) < 0.35 && q1.y < -0.7, "quarter end is bottom");
var qSharp = nodeGraphKickEnvelopeQuarterPoint(0.5, 1);
var qRound = nodeGraphKickEnvelopeQuarterPoint(0.5, 0);
assert(Math.abs(qSharp.x - qRound.x) + Math.abs(qSharp.y - qRound.y) > 0.02, "face arc changes with sharpness");

var look = normalizeNodeGraphRoundShapeFaceSettings({
  backgroundColor: "#112233",
  strokeColor: "#abcdef",
  dotColor: "#fedcba",
  lineThickness: 3,
  lineBlur: 1.5,
  pixelDensity: 2,
});
assert(look.background === "#112233", "bg color");
assert(look.strokeColor === "#abcdef", "fg stroke");
assert(look.dotColor === "#fedcba", "dot color");

console.log("ok kick envelope");
