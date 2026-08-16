var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "tSeries", "t-series-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphTSeriesLastIndexForType("t") === 0, "t last 0");
assert(nodeGraphTSeriesLastIndexForType("t1") === 1, "1t last 1");
assert(nodeGraphTSeriesLastIndexForType("t10") === 10, "10t last 10");
assert(nodeGraphTSeriesType(0) === "t", "0 -> t");
assert(nodeGraphTSeriesType(2) === "t2", "2 -> t2");

var idle = nodeGraphTSeriesSample({ type: "t10" });
assert(idle["0"] === 0 && idle["10"] === 0, "unconnected silent");

var analogZero = nodeGraphTSeriesSample({ analog: 0, hasAnalog: true, type: "t10" });
assert(analogZero["0"] === 1 && analogZero["1"] === 0, "analog 0 -> out 0");

var analogMid = nodeGraphTSeriesSample({ analog: 0.5, hasAnalog: true, lastIndex: 2 });
assert(Math.abs(analogMid["1"] - 1) < 1e-9, "2t analog 0.5 -> path 1");
assert(analogMid["0"] === 0 && analogMid["2"] === 0, "2t analog 0.5 neighbors off");

var analogBlend = nodeGraphTSeriesSample({ analog: 0.25, hasAnalog: true, lastIndex: 2 });
assert(Math.abs(analogBlend["0"] - 0.5) < 1e-9, "2t analog 0.25 half on 0");
assert(Math.abs(analogBlend["1"] - 0.5) < 1e-9, "2t analog 0.25 half on 1");

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

var loneOn = nodeGraphTSeriesSample({ digital: 0, hasDigital: true, type: "t" });
assert(loneOn["0"] === 1, "t digital 0 sends");

var loneOff = nodeGraphTSeriesSample({ digital: 1, hasDigital: true, type: "t" });
assert(loneOff["0"] === 0, "t digital 1 does not send");

console.log("ok t-series");
