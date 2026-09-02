// Headless: clock → attackDecay (type 136) → output.
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

const TYPE_CLOCK = 28;
const TYPE_OUT = 6;
const TYPE_AD = 136;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;
const PARAM_FEEDBACK = 50;
const PARAM_TIME_DEN = 53;
const PARAM_TIMING_MODE = 54;

const ver = version() | 0;
if (ver < 102) {
  throw new Error(`graph version ${ver} < 102 (attackDecay missing)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

const g = create() | 0;
setSr(g, 48000);
const hClk = 0xad01 >>> 0;
const hEnv = 0xad02 >>> 0;
const hOut = 0xad03 >>> 0;
if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
if ((add(g, hEnv, TYPE_AD) | 0) !== 0) throw new Error("attackDecay add");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
if ((connect(g, hClk, PORT_MONO, hEnv, PORT_MONO) | 0) !== 0) throw new Error("clk→ad");
if ((connect(g, hEnv, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("ad→out");
setParam(g, hClk, PARAM_FREQUENCY, 4);
setParam(g, hEnv, PARAM_TIME_DEN, 0.01);
setParam(g, hEnv, PARAM_FEEDBACK, 0.08);
setParam(g, hEnv, PARAM_SHAPE, 1);
setParam(g, hEnv, PARAM_MODE, 0); // Gate
setParam(g, hEnv, PARAM_TIMING_MODE, 0); // Off
setParam(g, hEnv, PARAM_AMPLITUDE, 1);
if ((compile(g) | 0) !== 0) throw new Error("compile");
snap(g);

let peak = 0;
for (let q = 0; q < 80; q++) {
  process(g, 128);
  const buf = view(portPtr(g, hEnv, PORT_MONO) | 0, 128);
  for (let i = 0; i < 128; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
}
destroy(g);

if (!(peak > 0.2) || !(peak <= 1.05)) {
  throw new Error(`attackDecay peak ${peak} out of range`);
}
console.log(`ok attackDecay type=${TYPE_AD} version=${ver} peak=${peak.toFixed(4)}`);
