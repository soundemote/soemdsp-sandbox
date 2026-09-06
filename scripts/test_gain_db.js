const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "public/modules/gain/gain-math.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "public/modules/bias/bias-math.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "public/modules/_shared/output-amplitude.js"), "utf8"), sandbox);

function assertClose(name, got, want, eps) {
  const e = eps == null ? 1e-9 : eps;
  if (Math.abs(got - want) > e) {
    throw new Error(`${name}: got ${got}, want ${want}`);
  }
}

// Unity 0 dB, dual-mono In=0.5 → L/R 0.5, Average Out 0.5
let f = sandbox.nodeGraphGainFrameDb(0.5, 0, 0, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 1, offset: 0 });
assertClose("unity L", f.Left, 0.5);
assertClose("unity R", f.Right, 0.5);
assertClose("unity Out avg", f.Out, 0.5);

// +6.02 dB ≈ ×2
f = sandbox.nodeGraphGainFrameDb(0.25, 0, 0, { masterDb: 20 * Math.log10(2), leftDb: 0, rightDb: 0, monoSum: 1, offset: 0 });
assertClose("plus6 L", f.Left, 0.5, 1e-6);

// −inf floor mutes
f = sandbox.nodeGraphGainFrameDb(1, 0, 0, { masterDb: -140, leftDb: 0, rightDb: 0, monoSum: 0, offset: 0 });
assertClose("mute", f.Out, 0);

// Offset after gain
f = sandbox.nodeGraphGainFrameDb(1, 0, 0, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 1, offset: 0.25 });
assertClose("offset L", f.Left, 1.25);
assertClose("offset Out", f.Out, 1.25);

// Separate L/R
f = sandbox.nodeGraphGainFrameDb(0, 1, 1, { masterDb: 0, leftDb: 6.020599913, rightDb: -140, monoSum: 1, offset: 0 });
assertClose("left boost", f.Left, 2, 1e-5);
assertClose("right mute", f.Right, 0);
assertClose("avg of 2 and 0", f.Out, 1, 1e-5);

// Sum vs average (order: Sum=0, Average=1, Power=2, Equal-power=3, …)
f = sandbox.nodeGraphGainFrameDb(0, 0.5, 0.5, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 0, offset: 0 });
assertClose("sum", f.Out, 1);

f = sandbox.nodeGraphGainFrameDb(0, 0.5, 0.5, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 1, offset: 0 });
assertClose("average", f.Out, 0.5);

f = sandbox.nodeGraphGainFrameDb(0, 0.5, 0.5, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 3, offset: 0 });
assertClose("equal-power", f.Out, 1 * Math.SQRT1_2, 1e-9);

f = sandbox.nodeGraphGainFrameDb(0, 0.2, -0.8, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 4, offset: 0 });
assertClose("peak", f.Out, -0.8);

f = sandbox.nodeGraphGainFrameDb(0, 0.3, 0.9, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 5, offset: 0 });
assertClose("left only", f.Out, 0.3);

f = sandbox.nodeGraphGainFrameDb(0, 0.3, 0.9, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 6, offset: 0 });
assertClose("right only", f.Out, 0.9);

// Power of equal signals equals average
f = sandbox.nodeGraphGainFrameDb(0, 0.4, 0.4, { masterDb: 0, leftDb: 0, rightDb: 0, monoSum: 2, offset: 0 });
assertClose("power dual-mono", f.Out, 0.4);

// Legacy linear amount=2 → +6 dB
const db = sandbox.nodeGraphGainLegacyAmountToDb(2);
assertClose("legacy 2 → +6dB", db, 20 * Math.log10(2));
const resolved = sandbox.nodeGraphGainResolveMasterDb({ amount: 0.5 }, 0.5, 0);
assertClose("legacy resolve 0.5", resolved, 20 * Math.log10(0.5));
const resolvedNew = sandbox.nodeGraphGainResolveMasterDb({ gainDb: -6 }, 1, -6);
assertClose("new gainDb wins", resolvedNew, -6);

// Bias is In/Out only
const b = sandbox.nodeGraphBiasFrame(0.4, 9, 8, 0.1);
assertClose("bias out", b.Out, 0.5);
if (b.Left != null || b.Right != null) {
  throw new Error("bias should not emit Left/Right");
}

// Post-amplitude scales listed types only
const scaled = sandbox.nodeGraphApplyPostAmplitude("passiveFilter", { Out: 1, Left: 0.5, Right: 0.25 }, 0.5);
assertClose("post L", scaled.Left, 0.25);
const skipped = sandbox.nodeGraphApplyPostAmplitude("polyBlep", { Out: 1 }, 0.5);
assertClose("no double osc", skipped.Out, 1);

console.log("test_gain_db: ok");
