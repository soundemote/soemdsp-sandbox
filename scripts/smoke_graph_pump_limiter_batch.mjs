// Headless: Pump Limiter (type 109) threshold/ratio GR.
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
const TYPE_PUMP = 109;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_GAIN = 3;
const PORT_ENV = 4;
const PARAM_FREQ = 10;
const PARAM_AMP = 12;
const PARAM_WIDTH = 31;
const PARAM_MODE = 21;
const PARAM_TIME_NUM = 52;
const PARAM_OFFSET_MS = 55;
const PARAM_LANE_BIAS1 = 104;
const PARAM_LANE_BIAS2 = 105;
const PARAM_GAIN_DB = 90;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x9201 >>> 0;
  const hLim = 0x9202 >>> 0;
  const hOut = 0x9203 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("pump osc");
  if ((add(g, hLim, TYPE_PUMP) | 0) !== 0) throw new Error("pump add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("pump out");
  if ((connect(g, hOsc, PORT_MONO, hLim, PORT_MONO) | 0) !== 0) throw new Error("pump in");
  if ((connect(g, hLim, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("pump outc");
  setParam(g, hOsc, PARAM_FREQ, 220);
  setParam(g, hOsc, PARAM_AMP, 1);
  setParam(g, hLim, PARAM_GAIN_DB, 12); // drive into threshold
  setParam(g, hLim, PARAM_LANE_BIAS2, -18); // threshold
  setParam(g, hLim, PARAM_WIDTH, 8); // ratio
  setParam(g, hLim, PARAM_MODE, 1); // look-ahead on
  setParam(g, hLim, PARAM_TIME_NUM, 2);
  setParam(g, hLim, PARAM_OFFSET_MS, 1); // fast attack
  setParam(g, hLim, PARAM_LANE_BIAS1, 80); // release
  setParam(g, hLim, PARAM_AMP, 1);
  if ((compile(g) | 0) !== 0) throw new Error("pump compile");
  snap(g);
  let peak = 0;
  let gainMin = 1;
  let envMax = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    const o = view(portPtr(g, hLim, PORT_MONO) | 0, 128);
    const gn = view(portPtr(g, hLim, PORT_GAIN) | 0, 128);
    const en = view(portPtr(g, hLim, PORT_ENV) | 0, 128);
    for (let i = 0; i < 128; i++) {
      peak = Math.max(peak, Math.abs(o[i]));
      gainMin = Math.min(gainMin, gn[i]);
      envMax = Math.max(envMax, en[i]);
    }
  }
  if (!(peak > 0.05)) throw new Error(`pumpLimiter peak=${peak} expected signal`);
  if (!(gainMin < 0.99)) throw new Error(`pumpLimiter gainMin=${gainMin} expected GR`);
  if (!(envMax > 0.01)) throw new Error(`pumpLimiter envMax=${envMax} expected env`);
  console.log(`pumpLimiter ok peak=${peak.toFixed(3)} gainMin=${gainMin.toFixed(3)} envMax=${envMax.toFixed(3)}`);
}

if ((version() | 0) < 61) throw new Error(`graph version ${version()} expected >= 61`);
console.log(`smoke_graph_pump_limiter_batch ok: version=${version() | 0}`);
