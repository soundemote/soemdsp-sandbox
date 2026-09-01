// Sample-accurate mod control packets. Run: node scripts/test_additive_mod_control.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = {
  console,
  Math,
  Number,
  String,
  Object,
  Array,
  Float32Array,
  Math,
};
vm.createContext(sandbox);
sandbox.clampNodeSliderValue = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
sandbox.nodeGraphSafeFilterNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
sandbox.nodeGraphMvp = { sampleRate: 44100 };
sandbox.nodeGraphLiveModuleEvaluators = {};
sandbox.readNodeGraphLiveEffectiveParam = () => 0;
vm.runInContext(
  fs.readFileSync(path.join(root, "public/modules/expAdsr/exp-adsr-math.js"), "utf8"),
  sandbox,
);
vm.runInContext(
  fs.readFileSync(path.join(root, "public/modules/pluckEnvelope/pluck-envelope-live-evaluator.js"), "utf8"),
  sandbox,
);
vm.runInContext(
  fs.readFileSync(path.join(root, "public/modules/additiveGraph/additive-mod-control.js"), "utf8"),
  sandbox,
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

const sr = 44100;
const N = 128;

// Scalar strip
{
  const c = sandbox.additiveModControlCreate("scalar", { value: 0.25, sampleRate: sr });
  const strip = sandbox.additiveModControlBakeStrip(c, N);
  assert(strip.length === N, "scalar length");
  assert(Math.abs(strip[0] - 0.25) < 1e-9 && Math.abs(strip[N - 1] - 0.25) < 1e-9, "scalar flat");
}

// Robin: one cycle over N when f = sr/N
{
  const c = sandbox.additiveModControlCreate("robin", {
    sampleRate: sr,
    frequency: sr / N,
    amplitude: 1,
    phase: 0,
    bipolar: true,
  });
  const strip = sandbox.additiveModControlBakeStrip(c, N);
  assert(strip[0] > 0.45 && strip[0] < 0.55, "robin start ~0.5 bipolar");
  const mid = strip[(N / 4) | 0];
  assert(mid > 0.9, "robin quarter ~1 got " + mid);
}

// ADSR: gate high → rises over attack
{
  const c = sandbox.additiveModControlCreate("adsr", {
    sampleRate: sr,
    gate: 1,
    attack: 0.01,
    decay: 0.05,
    sustain: 0.5,
    release: 0.05,
    level: 1,
    delay: 0,
    attackShape: 0.3,
    releaseShape: 0.0001,
  });
  const strip = sandbox.additiveModControlBakeStrip(c, N);
  assert(strip[0] < strip[N - 1] || strip[N - 1] > 0.4, "adsr rises or reaches sustain");
  assert(strip[N - 1] > 0.2, "adsr end audible " + strip[N - 1]);
  // Continuity: second block with gate still high should stay near sustain
  const strip2 = sandbox.additiveModControlBakeStrip(c, N);
  assert(Math.abs(strip2[0] - strip[N - 1]) < 0.15, "adsr continuity across blocks");
}

// Pluck: zero attack → peak then decay (sample-accurate strip)
{
  const c = sandbox.additiveModControlCreate("pluck", {
    sampleRate: sr,
    trigger: 1,
    release: 0,
    delayTime: 0,
    attackFeedback: 0,
    decay: 0.35,
    level: 1,
    velocity: 1,
    autoReleaseTime: 0.2,
  });
  const strip = sandbox.additiveModControlBakeStrip(c, N);
  const peak = Math.max(...strip);
  assert(peak > 0.5, "pluck peak after trigger got " + peak);
  const strip2 = sandbox.additiveModControlBakeStrip(
    Object.assign(c, { trigger: 0 }),
    N,
  );
  assert(strip2.length === N, "pluck second block length");
  assert(strip2[N - 1] < peak, "pluck decays across blocks");
}

// Packet source type helper
assert(sandbox.additiveModControlIsPacketSourceType("curveEnvelopeMod"));
assert(sandbox.additiveModControlIsPacketSourceType("pluckEnvelopeMod"));
assert(sandbox.additiveModControlIsPacketSourceType("additiveKnob"));
assert(!sandbox.additiveModControlIsPacketSourceType("expAdsr"));

console.log("test_additive_mod_control: ok");
