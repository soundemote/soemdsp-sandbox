// HarmonicFade build smoke: Instant/Smoothed round; Decimal trailing amp.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "public", "modules", "additiveGraph");
const code = fs.readFileSync(path.join(root, "additive-graph-math.js"), "utf8");
const ctx = {
  console,
  Math,
  Float32Array,
  Number,
  String,
  Array,
  Object,
  ADDITIVE_GRAPH_MAX_H: 4096,
};
vm.createContext(ctx);
vm.runInContext(code, ctx);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const build = ctx.additiveGraphBuildFromWaveform;
assert(typeof build === "function", "build_from_waveform exported");

const round32 = build(0, 0, 32.4, 0, 1); // Smoothed
assert(round32.harmonics === 32, `Smoothed H expected 32 got ${round32.harmonics}`);
assert(Math.abs(round32.harmonicsExact - 32) < 1e-9, "Smoothed exact rounded");

const instant = build(0, 0, 32.6, 0, 0);
assert(instant.harmonics === 33, `Instant round 32.6 → 33 got ${instant.harmonics}`);

const dec = build(0, 0, 32.4, 0, 2);
assert(dec.harmonics === 33, `Decimal H ceil 32.4 → 33 got ${dec.harmonics}`);
assert(Math.abs(dec.harmonicsExact - 32.4) < 1e-9, "Decimal exact preserved");
const full = build(0, 0, 33, 0, 2);
const expectedLast = (Number(full.amplitude[32]) || 0) * 0.4;
const gotLast = Number(dec.amplitude[32]) || 0;
assert(
  Math.abs(gotLast - expectedLast) < 1e-6,
  `Decimal last amp ${gotLast} vs expected ${expectedLast}`,
);

const whole = build(0, 0, 32, 0, 2);
assert(whole.harmonics === 32, "Decimal integer stays 32");
assert((Number(whole.amplitude[31]) || 0) > 0, "Decimal integer last slot full amp");

console.log("test_harmonic_fade: ok");
