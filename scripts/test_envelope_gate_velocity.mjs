// B-094: envelopes peak at the Gate height (velocity), not at 1.
// Direct native exports from soemdsp_combined.wasm (no JS DSP).
//   node scripts/test_envelope_gate_velocity.mjs                 -> velocity asserts
//   node scripts/test_envelope_gate_velocity.mjs --dump-pluck F  -> write Pluck outputs to F
//   node scripts/test_envelope_gate_velocity.mjs --compare-pluck F -> assert Pluck == F
// Optional --wasm <path> picks another combined wasm (e.g. a pre-change copy).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const wasmPath = argValue("--wasm")
  || path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const must = (name) => {
  if (typeof e[name] !== "function") throw new Error(`missing export ${name}`);
  return e[name];
};

const SR = 48000;
const EPS = 1e-9;
let failures = 0;
function check(ok, msg) {
  if (ok) {
    console.log(`ok   ${msg}`);
  } else {
    failures += 1;
    console.log(`FAIL ${msg}`);
  }
}

// Run `seconds` of a constant gate through step(gate) and return {peak, last}.
function run(step, gate, seconds) {
  let peak = -Infinity;
  let last = 0;
  const n = Math.round(seconds * SR);
  for (let i = 0; i < n; i += 1) {
    last = step(gate);
    if (last > peak) peak = last;
  }
  return { peak, last };
}

const ENVELOPES = {
  "Curve AR": {
    prefix: "soemdsp_curve_attack_release",
    // gate, attack, attackShape, release, releaseShape, amplitude, inputMode, updateOnTrigger, sr
    step: (fn, h, g) => fn(h, g, 0.01, 0, 0.1, 0, 1, 0, 0, SR),
  },
  "Curve ADSR": {
    prefix: "soemdsp_exp_adsr",
    sustain: 0.5,
    // gate, delay, attack, attackShape, decay, sustain, release, releaseShape, loop, level, updateOnTrigger, sr
    step: (fn, h, g) => fn(h, g, 0, 0.01, 0, 0.05, 0.5, 0.1, 0, 0, 1, 0, SR),
  },
  "Linear ADSR": {
    prefix: "soemdsp_linear_envelope",
    sustain: 0.5,
    // gate, delay, attack, decay, sustain, release, loop, level, sr
    step: (fn, h, g) => fn(h, g, 0, 0.01, 0.05, 0.5, 0.1, 0, 1, SR),
  },
  "Linear AR": {
    prefix: "soemdsp_linear_attack_release",
    // gate, attack, release, amplitude, inputMode, sr
    step: (fn, h, g) => fn(h, g, 0.01, 0.1, 1, 0, SR),
  },
};

function velocityTests() {
  for (const [label, env] of Object.entries(ENVELOPES)) {
    const create = must(`${env.prefix}_create`);
    const destroy = must(`${env.prefix}_destroy`);
    const sample = must(`${env.prefix}_sample`);
    for (const gate of [0.3, 1.0]) {
      const h = create();
      const step = (g) => env.step(sample, h, g);
      const held = run(step, gate, 0.4);
      check(Math.abs(held.peak - gate) < EPS, `${label} gate ${gate}: peak ${held.peak.toFixed(6)}`);
      if (env.sustain !== undefined) {
        const want = gate * env.sustain;
        check(Math.abs(held.last - want) < 1e-6, `${label} gate ${gate}: sustain ${held.last.toFixed(6)} (want ${want})`);
      } else {
        check(Math.abs(held.last - gate) < EPS, `${label} gate ${gate}: hold ${held.last.toFixed(6)}`);
      }
      const rel = run(step, 0, 0.5);
      check(Math.abs(rel.last) < 1e-6, `${label} gate ${gate}: released to ${rel.last.toFixed(6)}`);
      destroy(h);
    }
  }

  // Re-strike glides from the current level (peak is a target, not a multiplier).
  {
    const env = ENVELOPES["Curve AR"];
    const sample = must(`${env.prefix}_sample`);
    const h = must(`${env.prefix}_create`)();
    const step = (g) => env.step(sample, h, g);
    run(step, 1.0, 0.1);
    const gap = step(0);
    const first = step(0.3);
    check(first > 0.9 && first <= gap + EPS, `Curve AR re-strike 1.0 -> 0.3 glides (first ${first.toFixed(4)})`);
    const after = run(step, 0.3, 0.1);
    check(Math.abs(after.last - 0.3) < EPS, `Curve AR re-strike settles at 0.3 (${after.last.toFixed(6)})`);
    must(`${env.prefix}_destroy`)(h);
  }
}

// Pluck Envelope fingerprint (gate/trigger modes, several gate heights).
function pluckOutputs() {
  const create = must("soemdsp_pluck_envelope_fb_create");
  const destroy = must("soemdsp_pluck_envelope_fb_destroy");
  const sample = must("soemdsp_pluck_envelope_fb_sample");
  const out = {};
  const cases = [
    { name: "trigger g1", mode: 1, kt: 0, ktOn: 0, gates: [1.0] },
    { name: "trigger g0.3", mode: 1, kt: 0, ktOn: 0, gates: [0.3] },
    { name: "gate g0.7 kt60", mode: 0, kt: 60, ktOn: 1, gates: [0.7] },
    { name: "gate seq", mode: 0, kt: 0, ktOn: 0, gates: [1.0, 0.3, 0.6] },
    { name: "trigger seq kt100", mode: 1, kt: 100, ktOn: 1, gates: [0.5, 1.0, 0.2] },
  ];
  for (const c of cases) {
    const h = create();
    const ys = [];
    for (const g of c.gates) {
      for (let i = 0; i < 6000; i += 1) {
        const gate = c.mode === 1 ? (i < 24 ? g : 0) : (i < 3000 ? g : 0);
        // gate, keyTrack, keyTrackConnected, attack, attackShape, release, releaseShape,
        // feedback(tail), bias, amplitude, inputMode, updateOnTrigger, sr
        ys.push(sample(h, gate, c.kt, c.ktOn, 0.2, -0.07, 0.117, 1, 0.68, 0.94, 1, c.mode, 0, SR));
      }
    }
    out[c.name] = ys;
    destroy(h);
  }
  return out;
}

const dumpPath = argValue("--dump-pluck");
const comparePath = argValue("--compare-pluck");
if (dumpPath) {
  fs.writeFileSync(dumpPath, JSON.stringify(pluckOutputs()));
  console.log(`wrote Pluck fingerprint ${dumpPath}`);
} else {
  velocityTests();
  if (comparePath) {
    const base = JSON.parse(fs.readFileSync(comparePath, "utf8"));
    const now = pluckOutputs();
    for (const [name, ys] of Object.entries(base)) {
      const cur = now[name] || [];
      let maxDiff = cur.length === ys.length ? 0 : Infinity;
      let peak = 0;
      for (let i = 0; i < ys.length && i < cur.length; i += 1) {
        maxDiff = Math.max(maxDiff, Math.abs(ys[i] - cur[i]));
        peak = Math.max(peak, Math.abs(cur[i]));
      }
      check(maxDiff === 0, `Pluck "${name}" unchanged (max diff ${maxDiff}, peak ${peak.toFixed(4)})`);
    }
  }
  if (failures) {
    console.log(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("envelope gate velocity test ok");
}
