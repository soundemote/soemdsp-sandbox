// Headless: mono hilbert (type 151) +90 vs 0° differ; −90 ≈ −(+90).
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
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const version = must("soemdsp_graph_version");

const TYPE_POLYBLEP = 1;
const TYPE_OUT = 6;
const TYPE_HILBERT = 151;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_MODE = 21;

const ver = version() | 0;
if (ver < 107) {
  throw new Error(`graph version ${ver} < 107 (hilbert not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function capture(mode) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = (0xbb10 + mode) >>> 0;
  const hHilb = (0xbb20 + mode) >>> 0;
  const hOut = (0xbb30 + mode) >>> 0;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error(`osc add m${mode}`);
  if ((add(g, hHilb, TYPE_HILBERT) | 0) !== 0) throw new Error(`hilbert add m${mode}`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`out add m${mode}`);
  if ((connect(g, hOsc, PORT_MONO, hHilb, PORT_MONO) | 0) !== 0) {
    throw new Error(`osc→hilbert m${mode}`);
  }
  if ((connect(g, hHilb, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error(`hilbert→out m${mode}`);
  }
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hHilb, PARAM_MODE, mode);
  setParam(g, hHilb, PARAM_AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error(`compile m${mode}`);
  snap(g);
  // Warm the allpass state.
  for (let n = 0; n < 40; n++) process(g, 128);
  const samples = [];
  for (let n = 0; n < 8; n++) {
    process(g, 128);
    const buf = view(portPtr(g, hHilb, PORT_MONO) | 0, 128);
    for (let k = 0; k < 128; k++) samples.push(buf[k]);
  }
  destroy(g);
  return samples;
}

const plus90 = capture(0);
const minus90 = capture(1);
const zeroDeg = capture(2);

let peakPlus = 0;
let peakZero = 0;
let peakDiffModes = 0;
let peakNegMatch = 0;
for (let i = 0; i < plus90.length; i++) {
  peakPlus = Math.max(peakPlus, Math.abs(plus90[i]));
  peakZero = Math.max(peakZero, Math.abs(zeroDeg[i]));
  peakDiffModes = Math.max(peakDiffModes, Math.abs(plus90[i] - zeroDeg[i]));
  peakNegMatch = Math.max(peakNegMatch, Math.abs(minus90[i] + plus90[i]));
}

if (!(peakPlus > 1e-4)) throw new Error(`+90 silent peak=${peakPlus}`);
if (!(peakZero > 1e-4)) throw new Error(`0° silent peak=${peakZero}`);
if (!(peakDiffModes > 1e-3)) {
  throw new Error(`+90 vs 0° too similar diff=${peakDiffModes}`);
}
if (peakNegMatch > 1e-6) {
  throw new Error(`−90 should ≈ −(+90) err=${peakNegMatch}`);
}

console.log(
  `ok hilbert +90peak=${peakPlus.toFixed(4)} 0peak=${peakZero.toFixed(4)} ` +
  `diff=${peakDiffModes.toFixed(4)} negErr=${peakNegMatch.toExponential(2)} version=${ver}`
);
