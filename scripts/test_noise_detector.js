// Node check: sine → high fidelity, white-ish noise → lower fidelity, gate vs threshold.
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(
  path.join(__dirname, "..", "public", "modules", "noiseDetector", "noise-detector-math.js"),
  "utf8",
);
eval(src);

function feed(kind, samples, threshold) {
  var state = createNodeGraphNoiseDetectorState();
  var last = { Fidelity: 0, Gate: 0 };
  for (var i = 0; i < samples; i++) {
    var x = 0;
    if (kind === "sine") x = Math.sin(2 * Math.PI * 440 * i / 48000);
    else if (kind === "noise") x = Math.sin(i * i * 12.9898) * 2 % 2 - 1;
    last = nodeGraphNoiseDetectorSample(state, x, 0, 0, threshold, 48000, true, false, false);
  }
  return last;
}

var sine = feed("sine", 4000, 0.9);
var noise = feed("noise", 4000, 0.9);
if (!(sine.Fidelity > 0.85)) {
  throw new Error("sine fidelity too low: " + sine.Fidelity);
}
if (sine.Gate !== 1) {
  throw new Error("sine should gate at 0.9, fid=" + sine.Fidelity);
}
if (!(noise.Fidelity < sine.Fidelity)) {
  throw new Error("noise fid " + noise.Fidelity + " should be below sine " + sine.Fidelity);
}
if (sine.Left === 0 && sine.Mono !== 0) {
  throw new Error("L thru should pass the left sample");
}
console.log("ok sineFid=" + sine.Fidelity.toFixed(4) + " noiseFid=" + noise.Fidelity.toFixed(4));
