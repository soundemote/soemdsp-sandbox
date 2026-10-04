// Exponential Delay: N taps, no feedback, mix 1/N, last tap = Time.
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
const outL = must("soemdsp_graph_block_output_left_ptr");

const TYPE_POLY = 1;
const TYPE_DELAY = 203;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_STAGES = 22;
const PARAM_TIME_NUM = 52;
const PARAM_VOLUME_DB = 0;

function peakAt(ptr, n) {
  const view = new Float64Array(mem.buffer, ptr, n);
  let p = 0;
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(view[i] || 0));
  return p;
}

{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x20301 >>> 0;
  const hDel = 0x20302 >>> 0;
  const hOut = 0x20303 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("add osc");
  if ((add(g, hDel, TYPE_DELAY) | 0) !== 0) throw new Error("add earlyReflections");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add out");
  if ((connect(g, hOsc, PORT_MONO, hDel, PORT_MONO) | 0) !== 0) throw new Error("connect in");
  if ((connect(g, hDel, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect out");
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.5);
  setParam(g, hDel, PARAM_TIME_NUM, 0.1);
  setParam(g, hDel, PARAM_STAGES, 7);
  setParam(g, hDel, PARAM_AMPLITUDE, 1);
  setParam(g, hOut, PARAM_VOLUME_DB, 0);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  let peak = 0;
  for (let i = 0; i < 40; i++) {
    process(g, 256);
    peak = Math.max(peak, peakAt(outL(g) | 0, 256));
  }
  if (!(peak > 0.01)) throw new Error(`exponential delay silent peak=${peak}`);
  if (peak > 2.0) throw new Error(`exponential delay too hot peak=${peak}`);
  destroy(g);
  console.log("early reflections ok peak=" + peak.toFixed(4));
}

console.log("smoke_exponential_delay ok");
