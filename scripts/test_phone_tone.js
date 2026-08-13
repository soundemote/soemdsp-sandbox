var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "robinSinusoid", "robin-sinusoid-math.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "phoneTone", "phone-tone-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphPhoneToneAnalogSlot(0) === null, "analog 0 idle");
assert(nodeGraphPhoneToneAnalogSlot(1 / 12) === 0, "analog 1/12 -> key 1");
assert(nodeGraphPhoneToneAnalogSlot(0.99) === 11, "analog near 1 -> #");
assert(nodeGraphPhoneToneDigitalSlot(0) === null, "digital 0 idle");
assert(nodeGraphPhoneToneDigitalSlot(1) === 0, "digital 1 -> key 1");
assert(nodeGraphPhoneTonePair(0)[0] === 697 && nodeGraphPhoneTonePair(0)[1] === 1209, "key 1 pair");
assert(nodeGraphPhoneTonePair(10)[0] === 941 && nodeGraphPhoneTonePair(10)[1] === 1336, "key 0 pair");
assert(nodeGraphPhoneToneWrap(12) === 0, "wrap");

var state = createNodeGraphPhoneToneState();
var silent = nodeGraphPhoneToneSample(state, { amplitude: 1, sampleRate: 48000 });
assert(silent.Out === 0 && silent.X === 0 && silent.Z === 0 && silent.Df1 === 0, "no ins silent");

var idleAnalog = nodeGraphPhoneToneSample(state, {
  amplitude: 1,
  analog: 0,
  hasAnalog: true,
  sampleRate: 48000,
});
assert(idleAnalog.Out === 0 && idleAnalog.X === 0 && idleAnalog.Df1 === 0, "analog 0 silent");

var one = nodeGraphPhoneToneSample(state, {
  amplitude: 1,
  analog: 1 / 12,
  freqOffset: 10,
  hasAnalog: true,
  sampleRate: 48000,
});
assert(one.Df1 === 707 && one.Df2 === 1219, "offset + report analog");
assert(Number.isFinite(one.X) && one.X !== 0, "X analog f1");
assert(Number.isFinite(one.Z) && one.Z !== 0, "Z analog f2");
assert(Math.abs(one.Out - (one.X + one.Z)) < 1e-9, "M is X+Z");

var digital = nodeGraphPhoneToneSample(state, {
  amplitude: 1,
  analog: 1 / 12,
  digital: 2,
  hasAnalog: true,
  hasDigital: true,
  sampleRate: 48000,
});
assert(digital.Df1 === 697 && digital.Df2 === 1336, "report prefers digital");

var gated = nodeGraphPhoneToneSample(state, {
  amplitude: 1,
  analog: 1 / 12,
  gate: 0,
  hasAnalog: true,
  hasGate: true,
  sampleRate: 48000,
});
assert(gated.Out === 0 && gated.X === 0 && gated.Z === 0 && gated.Df1 === 697, "gate closed mutes audio");

var ungated = nodeGraphPhoneToneSample(state, {
  amplitude: 1,
  analog: 1 / 12,
  gate: 1,
  hasAnalog: true,
  hasGate: true,
  sampleRate: 48000,
});
assert(Number.isFinite(ungated.Out) && ungated.Out !== 0, "gate open sounds");
assert(Number.isFinite(ungated.X) && ungated.X !== 0 && Number.isFinite(ungated.Z) && ungated.Z !== 0, "gate open X/Z");

assert(nodeGraphPhoneToneOctaveRatio(0) === 1, "0 oct = 1x");
assert(Math.abs(nodeGraphPhoneToneOctaveRatio(1) - 2) < 1e-12, "+1 oct = 2x");
assert(Math.abs(nodeGraphPhoneToneOctaveRatio(-1) - 0.5) < 1e-12, "-1 oct = 0.5x");
assert(Math.abs(nodeGraphPhoneTonePitchedHz(697, 1, 0, 1) - 1394) < 1e-9, "pitch offset doubles f1");
assert(Math.abs(nodeGraphPhoneTonePitchedHz(1209, 1, 10, 1) - 2428) < 1e-9, "pitch then freq offset");
assert(Math.abs(nodeGraphPhoneTonePitchCvRatio(false, 0.9, 0.4) - 1) < 1e-12, "unconnected 0.1V is 1x");
assert(Math.abs(nodeGraphPhoneTonePitchCvRatio(true, 0.5, 0.4) - 2) < 1e-12, "0.1V +0.1 from ref = +1 oct");

var octaved = nodeGraphPhoneToneSample(state, {
  amplitude: 1,
  analog: 1 / 12,
  hasAnalog: true,
  pitchOffset: 1,
  sampleRate: 48000,
});
assert(Math.abs(octaved.Df1 - 1394) < 1e-9 && Math.abs(octaved.Df2 - 2418) < 1e-9, "sample +1 oct reports");

console.log("ok phone tone");
