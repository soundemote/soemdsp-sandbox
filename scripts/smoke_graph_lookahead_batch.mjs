// Headless Batch 10: lookaheadLimiter brickwall.
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
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const version = must("soemdsp_graph_version");

const TYPE_POLY = 1;
const TYPE_LIM = 35;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_GAIN = 3;
const PARAM_FREQ = 10;
const PARAM_AMP = 12;
const PARAM_GAIN_DB = 90;
const PARAM_MODE = 21;
const PARAM_TIME_NUM = 52;
const PARAM_OFFSET_MS = 55;
const PARAM_LANE_BIAS1 = 104;
const PARAM_TIMING_MODE = 54;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// Hot osc into brickwall at -6 dB ceiling: peak should sit near ceiling (no makeup).
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x9101 >>> 0;
  const hLim = 0x9102 >>> 0;
  const hOut = 0x9103 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("lim osc");
  if ((add(g, hLim, TYPE_LIM) | 0) !== 0) throw new Error("lim add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("lim out");
  if ((connect(g, hOsc, PORT_MONO, hLim, PORT_MONO) | 0) !== 0) throw new Error("lim in");
  if ((connect(g, hLim, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("lim outc");
  setParam(g, hOsc, PARAM_FREQ, 220);
  setParam(g, hOsc, PARAM_AMP, 1);
  setParam(g, hLim, PARAM_GAIN_DB, -6); // ceiling
  setParam(g, hLim, PARAM_MODE, 1); // look-ahead on
  setParam(g, hLim, PARAM_TIME_NUM, 2); // short LA ms for smoke
  setParam(g, hLim, PARAM_OFFSET_MS, 0); // instant attack
  setParam(g, hLim, PARAM_LANE_BIAS1, 50); // release
  setParam(g, hLim, PARAM_TIMING_MODE, 0); // no makeup
  if ((compile(g) | 0) !== 0) throw new Error("lim compile");
  snap(g);
  let peak = 0;
  let gainMin = 1;
  for (let q = 0; q < 60; q++) {
    process(g, 128);
    const o = view(portPtr(g, hLim, PORT_MONO) | 0, 128);
    const gn = view(portPtr(g, hLim, PORT_GAIN) | 0, 128);
    for (let i = 0; i < 128; i++) {
      peak = Math.max(peak, Math.abs(o[i]));
      gainMin = Math.min(gainMin, gn[i]);
    }
  }
  const ceilLin = Math.pow(10, -6 / 20);
  if (!(peak > 0.2 && peak < ceilLin * 1.15)) {
    throw new Error(`lookaheadLimiter peak=${peak} ceiling≈${ceilLin}`);
  }
  if (!(gainMin < 0.99)) throw new Error(`lookaheadLimiter gainMin=${gainMin} expected GR`);
  console.log(`lookaheadLimiter ok peak=${peak.toFixed(3)} gainMin=${gainMin.toFixed(3)}`);
}

if ((version() | 0) < 33) throw new Error(`graph version ${version()} expected >= 33`);
console.log(`smoke_graph_lookahead_batch ok: version=${version() | 0}`);
