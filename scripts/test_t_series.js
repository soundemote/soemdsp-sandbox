var fs = require("fs");
var path = require("path");
function nodeGraphFiniteNumber(value, fallback) {
  var n = Number(value);
  if (Number.isFinite(n)) return n;
  var f = Number(fallback);
  return Number.isFinite(f) ? f : 0;
}
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "tSeries", "t-series-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphTSeriesLastIndexForType("t") === 0, "t last 0");
assert(nodeGraphTSeriesLastIndexForType("t1") === 1, "t1 last 1");
assert(nodeGraphTSeriesLastIndexForType("t10") === 10, "t10 last 10");
assert(nodeGraphTSeriesLastIndexForType("3t") === 3, "3t last 3");
assert(nodeGraphTSeriesLastIndexForType("10t") === 10, "10t last 10");
assert(nodeGraphTSeriesType(0) === "t", "0 -> t");
assert(nodeGraphTSeriesType(2) === "t2", "2 -> t2");
assert(nodeGraphTSeriesMuxType(3) === "3t", "mux 3 -> 3t");
assert(nodeGraphTSeriesIsMuxType("3t") === true, "3t is mux");
assert(nodeGraphTSeriesIsMuxType("t3") === false, "t3 is demux");

var idle = nodeGraphTSeriesSample({ type: "t10" });
assert(idle["0"] === 0 && idle["10"] === 0, "unconnected silent");

var analogZero = nodeGraphTSeriesSample({ analog: 0, hasAnalog: true, type: "t10" });
assert(analogZero["0"] === 1 && analogZero["1"] === 0, "analog 0 -> out 0");

var analogMid = nodeGraphTSeriesSample({ analog: 0.5, hasAnalog: true, lastIndex: 2 });
assert(Math.abs(analogMid["1"] - 1) < 1e-9, "t2 analog 0.5 -> path 1");
assert(analogMid["0"] === 0 && analogMid["2"] === 0, "t2 analog 0.5 neighbors off");

var analogBlend = nodeGraphTSeriesSample({ analog: 0.25, hasAnalog: true, lastIndex: 2 });
assert(Math.abs(analogBlend["0"] - 0.5) < 1e-9, "t2 analog 0.25 half on 0");
assert(Math.abs(analogBlend["1"] - 0.5) < 1e-9, "t2 analog 0.25 half on 1");

var analogLast = nodeGraphTSeriesSample({ analog: 1, hasAnalog: true, type: "t10" });
assert(analogLast["10"] === 1, "analog 1 -> out 10");

var digitalZero = nodeGraphTSeriesSample({ digital: 0, hasDigital: true, type: "t10" });
assert(digitalZero["0"] === 1, "digital 0 -> out 0");

var digitalFive = nodeGraphTSeriesSample({ digital: 5, hasDigital: true, type: "t10" });
assert(digitalFive["5"] === 1 && digitalFive["0"] === 0, "digital 5 -> out 5");

var digitalOob = nodeGraphTSeriesSample({ digital: 20, hasDigital: true, lastIndex: 2 });
assert(digitalOob["0"] === 0 && digitalOob["2"] === 0, "oob digital silent");

var routed = nodeGraphTSeriesSample({
  input: 0.5,
  hasIn: true,
  digital: 1,
  hasDigital: true,
  lastIndex: 2,
});
assert(routed["1"] === 0.5 && routed["0"] === 0, "In * digital path");

var lone = nodeGraphTSeriesSample({ analog: 0.25, hasAnalog: true, type: "t" });
assert(Math.abs(lone["0"] - 0.25) < 1e-9, "t analog is conduction");
assert(lone["1"] === undefined, "t has only out 0");

var loneOff = nodeGraphTSeriesSample({ digital: 0, hasDigital: true, type: "t" });
assert(loneOff["0"] === 0, "t digital 0 closed");

var loneOn = nodeGraphTSeriesSample({ digital: 1, hasDigital: true, type: "t" });
assert(loneOn["0"] === 1, "t digital >0 sends");

var loneTiny = nodeGraphTSeriesSample({ digital: 0.01, hasDigital: true, type: "t" });
assert(loneTiny["0"] === 1, "t digital any >0 sends");

// --- mux 3t ---
var inputs = [10, 20, 30, 40];
var muxD = nodeGraphTSeriesMuxSample({
  type: "3t",
  lastIndex: 3,
  inputs: inputs,
  digital: 1,
  hasDigital: true,
});
assert(muxD.Out === 20, "3t D=1 -> in1");

var muxAonly = nodeGraphTSeriesMuxSample({
  lastIndex: 3,
  inputs: inputs,
  analog: 1,
  hasAnalog: true,
});
assert(muxAonly.Out === 40, "3t A-only +1 -> last");

var muxAneg = nodeGraphTSeriesMuxSample({
  lastIndex: 3,
  inputs: inputs,
  analog: -1,
  hasAnalog: true,
});
assert(muxAneg.Out === 10, "3t A-only -1 -> first");

var muxBoth = nodeGraphTSeriesMuxSample({
  lastIndex: 3,
  inputs: inputs,
  digital: 1,
  hasDigital: true,
  analog: 0.5,
  hasAnalog: true,
});
assert(Math.abs(muxBoth.Out - 30) < 1e-9, "3t D=1 A=0.5 -> exactly in2");

var muxLow = nodeGraphTSeriesMuxSample({
  lastIndex: 3,
  inputs: inputs,
  digital: 1,
  hasDigital: true,
  analog: -0.5,
  hasAnalog: true,
});
assert(Math.abs(muxLow.Out - 15) < 1e-9, "3t D=1 A=-0.5 -> halfway 0|1");

var muxD0A05 = nodeGraphTSeriesMuxSample({
  lastIndex: 3,
  inputs: inputs,
  digital: 0,
  hasDigital: true,
  analog: 0.5,
  hasAnalog: true,
});
assert(Math.abs(muxD0A05.Out - 25) < 1e-9, "3t D=0 A=0.5 -> halfway 1|2");

var muxIdle = nodeGraphTSeriesMuxSample({ lastIndex: 3, inputs: inputs });
assert(muxIdle.Out === 0, "mux unconnected silent");

console.log("ok t-series");
