// Headless: basicShape (type 139) → output.
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

const TYPE_BASIC = 139;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_SINE = 7;
const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;

const ver = version() | 0;
if (ver < 102) {
  throw new Error(`graph version ${ver} < 102 (basicShape missing)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

const g = create() | 0;
setSr(g, 48000);
const hOsc = 0xbb01 >>> 0;
const hOut = 0xbb02 >>> 0;
if ((add(g, hOsc, TYPE_BASIC) | 0) !== 0) throw new Error("basicShape add");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("conn");
setParam(g, hOsc, PARAM_FREQUENCY, 55);
setParam(g, hOsc, PARAM_WAVEFORM, 0); // sine
setParam(g, hOsc, PARAM_MODE, 1); // CounterClock(Ph)
setParam(g, hOsc, PARAM_SHAPE, 0.5);
setParam(g, hOsc, PARAM_AMPLITUDE, 1);
if ((compile(g) | 0) !== 0) throw new Error("compile");
snap(g);

let peak = 0;
let sinePeak = 0;
for (let q = 0; q < 40; q++) {
  process(g, 128);
  const buf = view(portPtr(g, hOsc, PORT_MONO) | 0, 128);
  const sine = view(portPtr(g, hOsc, PORT_SINE) | 0, 128);
  for (let i = 0; i < 128; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
    const s = Math.abs(sine[i]);
    if (s > sinePeak) sinePeak = s;
  }
}
destroy(g);

if (!(peak > 0.5) || !(peak <= 1.05)) {
  throw new Error(`basicShape Wave peak ${peak} out of range`);
}
if (!(sinePeak > 0.5) || !(sinePeak <= 1.05)) {
  throw new Error(`basicShape Sine peak ${sinePeak} out of range`);
}
console.log(
  `ok basicShape type=${TYPE_BASIC} version=${ver} peak=${peak.toFixed(4)} sine=${sinePeak.toFixed(4)}`,
);
