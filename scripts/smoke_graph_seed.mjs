// Headless: module Seed contract (seeding rework).
//   - Same Seed => identical output, even for two instances in one graph
//     (no engine-slot / creation-order dependence).
//   - Different Seeds => different output.
//   - Seed 0 is a real seed: noise-type modules are non-silent at 0.
//   - Random Walk Left/Right lanes are independent at Seed 0.
//   - Seed 0 != Seed 1 (no 0 -> 1 aliasing), incl. vibrato, wow & flutter,
//     cheap walk, chorus, ensemble and random clock.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;

function must(name) {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing export ${name}`);
  return fn;
}
const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const compile = must("soemdsp_graph_compile");
const processBlock = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");

const TYPE_OUT = 6;
const TYPE_POLYBLEP = 1;
const TYPE_RANDOM_CLOCK = 31;
const TYPE_CHEAP_WALK = 108;
const TYPE_VIBRATO = 154;
const TYPE_WOW_FLUTTER = 155;
const TYPE_CHORUS = 188;
const TYPE_ENSEMBLE = 189;
const TYPE_CLOCK = 28;
const TYPE_NOISE = 14;
const TYPE_ROBIN_SUPERSAW = 16;
const TYPE_SAMPLE_HOLD = 20;
const TYPE_TURING = 86;
const TYPE_RANDOM_WALK = 89;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_TRIGGER = 20;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;
const PARAM_LFO_AMPLITUDE = 45;
const PARAM_LFO_VARIATION = 47;
const PARAM_SEED = 48;
const PARAM_LEVEL = 51;
const PARAM_TIME_NUMERATOR = 52;
const PARAM_TIME_DENOMINATOR = 53;
const PARAM_OFFSET_MS = 55;
const PARAM_LFO_RATE = 57;
const PARAM_LPF_FREQUENCY = 59;
const PARAM_HPF_FREQUENCY = 60;

const BLOCKS = 40;
const N = 128;

// Render `count` instances of typeId (all in ONE graph) with the given seeds.
function render(typeId, seeds, setup, opts = {}) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOut = 0x7f00;
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  let hClk = 0;
  if (opts.clockHz) {
    hClk = 0x7f01;
    if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
    setParam(g, hClk, PARAM_FREQUENCY, opts.clockHz);
    setParam(g, hClk, PARAM_AMPLITUDE, 1);
  }
  const handles = seeds.map((seed, i) => {
    const h = 0x7a00 + i * 7 + typeId;
    if ((add(g, h, typeId) | 0) !== 0) throw new Error(`add type ${typeId}`);
    if ((connect(g, h, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect out");
    if (hClk && (connect(g, hClk, PORT_MONO, h, PORT_TRIGGER) | 0) !== 0) throw new Error("connect clk");
    setup(g, h);
    setParam(g, h, PARAM_SEED, seed);
    return h;
  });
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  const port = opts.port ?? PORT_MONO;
  const out = handles.map(() => new Float64Array(BLOCKS * N));
  const outR = handles.map(() => new Float64Array(BLOCKS * N));
  for (let b = 0; b < BLOCKS; b++) {
    processBlock(g, N);
    handles.forEach((h, i) => {
      out[i].set(new Float64Array(mem.buffer, portPtr(g, h, port) | 0, N), b * N);
      outR[i].set(new Float64Array(mem.buffer, portPtr(g, h, PORT_RIGHT) | 0, N), b * N);
    });
  }
  destroy(g);
  return { out, outR };
}

const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const diff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`ok   ${name}${detail ? ` (${detail})` : ""}`);
  else { failures += 1; console.error(`FAIL ${name}${detail ? ` (${detail})` : ""}`); }
}

function contract(name, typeId, setup, opts = {}) {
  // Two instances, same Seed, one graph (different engine slots).
  const twin = render(typeId, [12345, 12345], setup, opts).out;
  check(`${name}: same Seed, two instances match`, same(twin[0], twin[1]), `peak=${peak(twin[0]).toFixed(4)}`);
  // Same Seed in a separate graph reproduces too.
  const again = render(typeId, [12345], setup, opts).out[0];
  check(`${name}: same Seed reproduces across graphs`, same(twin[0], again));
  const other = render(typeId, [12346], setup, opts).out[0];
  check(`${name}: different Seed differs`, diff(twin[0], other) > 1e-6, `maxDiff=${diff(twin[0], other).toFixed(4)}`);
  const zero = render(typeId, [0], setup, opts).out[0];
  check(`${name}: Seed 0 non-silent`, peak(zero) > (opts.minPeak ?? 0.01), `peak=${peak(zero).toFixed(4)}`);
  check(`${name}: Seed 0 differs from Seed 12345`, diff(zero, twin[0]) > 1e-6);
  // No 0 -> 1 aliasing: Seed 0 and Seed 1 are distinct streams.
  const one = render(typeId, [1], setup, opts).out[0];
  check(`${name}: Seed 0 differs from Seed 1`, diff(zero, one) > 1e-6, `maxDiff=${diff(zero, one).toFixed(4)}`);
}

contract("noiseGenerator", TYPE_NOISE, (g, h) => {
  setParam(g, h, PARAM_AMPLITUDE, 1);
});
contract("robinSupersaw", TYPE_ROBIN_SUPERSAW, (g, h) => {
  setParam(g, h, PARAM_FREQUENCY, 220);
  setParam(g, h, PARAM_STAGES, 7);
  setParam(g, h, PARAM_WIDTH, 30);
  setParam(g, h, PARAM_SHAPE, 1); // Random Phase
  setParam(g, h, PARAM_AMPLITUDE, 1);
});
contract("randomWalk", TYPE_RANDOM_WALK, (g, h) => {
  setParam(g, h, PARAM_MODE, 3);
  setParam(g, h, PARAM_FREQUENCY, 32);
  setParam(g, h, PARAM_WIDTH, 8);
  setParam(g, h, PARAM_AMPLITUDE, 1);
}, { minPeak: 0.001 });
contract("sampleHold", TYPE_SAMPLE_HOLD, (g, h) => {
  setParam(g, h, PARAM_FREQUENCY, 200); // internal Sample Freq
  setParam(g, h, PARAM_AMPLITUDE, 1);
}, { port: PORT_LEFT });
contract("turingMachine", TYPE_TURING, (g, h) => {
  setParam(g, h, PARAM_STAGES, 16);
  setParam(g, h, PARAM_SHAPE, 0.5);
  setParam(g, h, PARAM_AMPLITUDE, 1);
}, { clockHz: 400 });

contract("vibratoGenerator", TYPE_VIBRATO, (g, h) => {
  setParam(g, h, PARAM_FREQUENCY, 60);  // Speed: S&H redraws every cycle
  setParam(g, h, PARAM_AMPLITUDE, 1);   // Depth
  setParam(g, h, PARAM_WIDTH, 1);       // Random Freq
  setParam(g, h, PARAM_CENTER, 1);      // Random Amp
});
contract("wowAndFlutter", TYPE_WOW_FLUTTER, (g, h) => {
  setParam(g, h, PARAM_SHAPE, 0);       // Wow Amp off: isolate seeded flutter
  setParam(g, h, PARAM_LFO_RATE, 40);   // Flutter Frequency
  setParam(g, h, PARAM_WIDTH, 200);     // Flutter Jitter
  setParam(g, h, PARAM_CENTER, 1);      // Flutter Amp
  setParam(g, h, PARAM_AMPLITUDE, 1);   // Level
}, { minPeak: 0.001 });
contract("cheapWalk", TYPE_CHEAP_WALK, (g, h) => {
  setParam(g, h, PARAM_FREQUENCY, 4000);
  setParam(g, h, PARAM_AMPLITUDE, 1);
});
contract("randomClock", TYPE_RANDOM_CLOCK, (g, h) => {
  setParam(g, h, PARAM_TIME_NUMERATOR, 0.001);   // Min s
  setParam(g, h, PARAM_TIME_DENOMINATOR, 0.02);  // Max s
  setParam(g, h, PARAM_SHAPE, 0.5);              // Duty
  setParam(g, h, PARAM_OFFSET_MS, 0.001);        // Trigger time
  setParam(g, h, PARAM_AMPLITUDE, 1);
}, { port: PORT_LEFT });  // Gate
// Chorus / Ensemble: fixed PolyBLEP input; only the seeded modulation differs.
function withInput(setupFx) {
  return (g, h) => {
    const hOsc = h + 0x1000;
    if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("osc add");
    setParam(g, hOsc, PARAM_FREQUENCY, 220);
    setParam(g, hOsc, PARAM_AMPLITUDE, 1);
    if ((connect(g, hOsc, PORT_MONO, h, PORT_MONO) | 0) !== 0) throw new Error("osc connect");
    setupFx(g, h);
  };
}
contract("chorus", TYPE_CHORUS, withInput((g, h) => {
  setParam(g, h, PARAM_STAGES, 4);              // Voices
  setParam(g, h, PARAM_TIME_NUMERATOR, 10);     // Delay ms
  setParam(g, h, PARAM_LFO_AMPLITUDE, 5);       // Depth ms
  setParam(g, h, PARAM_MIX, 1);
  setParam(g, h, PARAM_WIDTH, 1);               // Spread
  setParam(g, h, PARAM_FREQUENCY, 40);          // Speed
  setParam(g, h, PARAM_LFO_VARIATION, 1);       // Random Freq
  setParam(g, h, PARAM_LEVEL, 1);               // Random Amp
  setParam(g, h, PARAM_HPF_FREQUENCY, 20);
  setParam(g, h, PARAM_LPF_FREQUENCY, 20000);
  setParam(g, h, PARAM_AMPLITUDE, 1);
}));
contract("ensemble", TYPE_ENSEMBLE, withInput((g, h) => {
  setParam(g, h, PARAM_STAGES, 4);
  setParam(g, h, PARAM_TIME_NUMERATOR, 10);
  setParam(g, h, PARAM_LFO_AMPLITUDE, 5);
  setParam(g, h, PARAM_MIX, 1);
  setParam(g, h, PARAM_WIDTH, 1);
  setParam(g, h, PARAM_FREQUENCY, 40);
  setParam(g, h, PARAM_MODE, 0);                // Random Walk
  setParam(g, h, PARAM_HPF_FREQUENCY, 20);
  setParam(g, h, PARAM_LPF_FREQUENCY, 20000);
  setParam(g, h, PARAM_AMPLITUDE, 1);
}));

// Random Walk Seed 0: Left / Right lanes independent (used to share 0x12345678).
{
  const r = render(TYPE_RANDOM_WALK, [0], (g, h) => {
    setParam(g, h, PARAM_MODE, 3);
    setParam(g, h, PARAM_FREQUENCY, 32);
    setParam(g, h, PARAM_WIDTH, 8);
    setParam(g, h, PARAM_AMPLITUDE, 1);
  }, { port: PORT_LEFT });
  check("randomWalk: Seed 0 Left != Right", diff(r.out[0], r.outR[0]) > 1e-6,
    `maxDiff=${diff(r.out[0], r.outR[0]).toFixed(4)}`);
}

if (failures) {
  console.error(`smoke_graph_seed: ${failures} failure(s)`);
  process.exit(1);
}
console.log("smoke_graph_seed: all ok");
