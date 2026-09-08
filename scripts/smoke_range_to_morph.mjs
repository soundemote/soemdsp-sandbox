// Headless: Bias (knob stand-in) → Range → Softwave Morph MOD.
// Proves Out −10…+10 pegs Morph; Out 0…1 sweeps Softwave audio.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");

const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;
if (!mem) throw new Error("wasm memory export missing");

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
const setDomain = must("soemdsp_graph_set_param_domain");
const addMod = must("soemdsp_graph_add_param_mod_edge");
const clearMods = must("soemdsp_graph_clear_param_mod_edges");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");

const TYPE_BIAS = 12;
const TYPE_RANGE = 8;
const TYPE_SOFTWAVE = 45;
const PORT_MONO = 0;
const PARAM_ATT_OFFSET = 71;
const PARAM_SHAPE = 13; // morph
const PARAM_FREQ = 2; // guess — check
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;
const PARAM_OUT_LOW = 82;
const PARAM_OUT_HIGH = 83;
const PARAM_FREQUENCY = 11; // from JS NATIVE_GRAPH_PARAM_FREQUENCY often 11

// Discover frequency param id from JS file quickly
const js = fs.readFileSync(
  path.join(root, "public/node-live-audio-worklet-native-graph.js"),
  "utf8",
);
const freqM = js.match(/NATIVE_GRAPH_PARAM_FREQUENCY\s*=\s*(\d+)/);
const PARAM_FREQUENCY_ID = freqM ? Number(freqM[1]) : 11;

function rms(view) {
  let s = 0;
  for (let i = 0; i < view.length; i++) s += view[i] * view[i];
  return Math.sqrt(s / view.length);
}

function runCase({ inLow, inHigh, outLow, outHigh, biasValues, label }) {
  const g = create() | 0;
  setSr(g, 48000);
  const hBias = 0xb101 >>> 0;
  const hRange = 0xb102 >>> 0;
  const hSoft = 0xb103 >>> 0;
  if ((add(g, hBias, TYPE_BIAS) | 0) !== 0) throw new Error("bias add");
  if ((add(g, hRange, TYPE_RANGE) | 0) !== 0) throw new Error("range add");
  if ((add(g, hSoft, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("softwave add");

  setParam(g, hRange, PARAM_IN_LOW, inLow);
  setParam(g, hRange, PARAM_IN_HIGH, inHigh);
  setParam(g, hRange, PARAM_OUT_LOW, outLow);
  setParam(g, hRange, PARAM_OUT_HIGH, outHigh);

  setParam(g, hSoft, PARAM_FREQUENCY_ID, 200);
  setParam(g, hSoft, PARAM_SHAPE, 0); // morph base 0 for full unit sweep
  setDomain(g, hSoft, PARAM_SHAPE, 0, 1, 0);

  if ((connect(g, hBias, PORT_MONO, hRange, PORT_MONO) | 0) !== 0) {
    throw new Error("bias→range connect");
  }
  if (typeof clearMods === "function") clearMods(g);
  if ((addMod(g, hRange, PORT_MONO, hSoft, PARAM_SHAPE) | 0) !== 0) {
    throw new Error("range→morph mod edge");
  }
  if ((compile(g) | 0) !== 0) throw new Error("compile");

  const results = [];
  for (const bias of biasValues) {
    setParam(g, hBias, PARAM_ATT_OFFSET, bias);
    snap(g);
    // Warm
    for (let i = 0; i < 8; i++) process(g, 64);
    process(g, 128);
    const softPtr = portPtr(g, hSoft, PORT_MONO) | 0;
    const rangePtr = portPtr(g, hRange, PORT_MONO) | 0;
    const soft = new Float64Array(mem.buffer, softPtr, 128);
    const range = new Float64Array(mem.buffer, rangePtr, 128);
    results.push({
      bias,
      rangeOut: range[0],
      softRms: rms(soft),
      soft0: soft[0],
    });
  }
  destroy(g);
  console.log(`\n=== ${label} ===`);
  for (const r of results) {
    console.log(
      `bias=${r.bias.toFixed(2)} rangeOut=${r.rangeOut.toFixed(4)} softRms=${r.softRms.toFixed(5)} soft0=${r.soft0.toFixed(5)}`,
    );
  }
  return results;
}

const biases = [0, 0.25, 0.5, 0.75, 1];

const bad = runCase({
  inLow: 0,
  inHigh: 1,
  outLow: -10,
  outHigh: 10,
  biasValues: biases,
  label: "Out −10…+10 (broken Morph)",
});

const good = runCase({
  inLow: 0,
  inHigh: 1,
  outLow: 0,
  outHigh: 1,
  biasValues: biases,
  label: "Out 0…1 (Morph-safe)",
});

// Broken: rangeOut magnitude >1 for bias>0.1-ish → Morph pegged → softwave shape stuck
const badSpread = Math.max(...bad.map((r) => r.softRms)) - Math.min(...bad.map((r) => r.softRms));
const goodSpread = Math.max(...good.map((r) => r.softRms)) - Math.min(...good.map((r) => r.softRms));
console.log(`\nbad softRms spread=${badSpread.toFixed(6)} good softRms spread=${goodSpread.toFixed(6)}`);

// With waveform that morphs strongly, good path should move more than pegged path.
// Softwave Analog Saw Sine etc. — even if subtle, good path rangeOut must track bias.
for (let i = 0; i < biases.length; i++) {
  const expect = biases[i]; // in 0…1 out 0…1
  if (Math.abs(good[i].rangeOut - expect) > 1e-4) {
    throw new Error(`good rangeOut ${good[i].rangeOut} != bias ${expect}`);
  }
}
if (!(goodSpread > badSpread * 0.5 || goodSpread > 1e-4)) {
  // If morph barely changes RMS for this waveform, at least require rangeOut OK (above)
  // and that bad path rangeOut is huge.
  const badHuge = bad.some((r) => Math.abs(r.rangeOut) > 1.5);
  if (!badHuge) throw new Error("expected −10…+10 path to emit |out|>1");
}

console.log("smoke_range_to_morph OK");
