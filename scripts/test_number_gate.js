var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "keypad", "keypad-math.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "public", "modules", "numberGate", "number-gate-math.js"), "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var idle = nodeGraphNumberGateSample({});
assert(idle["0"] === 0 && idle["5"] === 0 && idle["12"] === 0, "unconnected silent");

var analogIdle = nodeGraphNumberGateSample({ analog: 0, hasAnalog: true });
assert(analogIdle["0"] === 1, "analog 0 -> out 0");
assert(analogIdle["1"] === 0, "analog 0 not key 1");

var analogOne = nodeGraphNumberGateSample({ analog: 1 / 12, hasAnalog: true });
assert(analogOne["1"] === 1 && analogOne["0"] === 0, "analog 1/12 -> out 1");

var analogLast = nodeGraphNumberGateSample({ analog: 1, hasAnalog: true });
assert(analogLast["12"] === 1, "analog 1 -> out 12");

var digitalIdle = nodeGraphNumberGateSample({ digital: 0, hasDigital: true });
assert(digitalIdle["0"] === 1, "digital 0 -> out 0");

var digitalFive = nodeGraphNumberGateSample({ digital: 5, hasDigital: true });
assert(digitalFive["5"] === 1 && digitalFive["0"] === 0, "digital 5 -> out 5");

var bothSame = nodeGraphNumberGateSample({
  analog: 5 / 12,
  digital: 5,
  hasAnalog: true,
  hasDigital: true,
});
assert(bothSame["5"] === 1, "same selection is one gate");
var highCount = 0;
for (var i = 0; i <= 12; i += 1) {
  if (bothSame[String(i)]) highCount += 1;
}
assert(highCount === 1, "same A/D only one high");

var poly = nodeGraphNumberGateSample({
  analog: 1 / 12,
  digital: 7,
  hasAnalog: true,
  hasDigital: true,
});
assert(poly["1"] === 1 && poly["7"] === 1 && poly["0"] === 0, "A and D can both be high");

var two = nodeGraphNumberGateSample({ analog: 1, hasAnalog: true, lastIndex: 2 });
assert(two["2"] === 1 && two["0"] === 0 && two["1"] === 0, "2Gate analog 1 -> out 2");
assert(two["3"] === undefined, "2Gate has no out 3");

var eight = nodeGraphNumberGateSample({ digital: 8, hasDigital: true, lastIndex: 8 });
assert(eight["8"] === 1 && eight["0"] === 0, "8Gate digital 8 -> out 8");

console.log("ok number gate");
