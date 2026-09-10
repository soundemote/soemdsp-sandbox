// Robin Sinusoid Amp ParamModEdge without live ƒ must force sample path.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const setDomain = must("soemdsp_graph_set_param_domain");
const clearMods = must("soemdsp_graph_clear_param_mod_edges");
const addMod = must("soemdsp_graph_add_param_mod_edge");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");

const TYPE_BIAS = 12;
const TYPE_RANGE = 8;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 10;
const PARAM_AMP = 12;
const PARAM_ATT = 71;
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;
const PARAM_OUT_LOW = 82;
const PARAM_OUT_HIGH = 83;

function run(biasValue) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xe001 >>> 0;
  const hBias = 0xe002 >>> 0;
  const hRange = 0xe003 >>> 0;
  const hOut = 0xe004 >>> 0;
  let robinType = -1;
  robinType = 15;
  if (add(g, hOsc, robinType)) throw new Error("robin sinusoid type");
  if (add(g, hBias, TYPE_BIAS)) throw new Error("bias");
  if (add(g, hRange, TYPE_RANGE)) throw new Error("range");
  if (add(g, hOut, TYPE_OUT)) throw new Error("out");
  connect(g, hOsc, PORT_MONO, hOut, PORT_MONO);
  connect(g, hBias, PORT_MONO, hRange, PORT_MONO);
  setParam(g, hOsc, PARAM_FREQ, 220);
  setParam(g, hOsc, PARAM_AMP, 1);
  setDomain(g, hOsc, PARAM_AMP, 0, 1, 4); // VCA
  setParam(g, hBias, PARAM_ATT, biasValue);
  setParam(g, hRange, PARAM_IN_LOW, 0);
  setParam(g, hRange, PARAM_IN_HIGH, 1);
  setParam(g, hRange, PARAM_OUT_LOW, 0);
  setParam(g, hRange, PARAM_OUT_HIGH, 1);
  clearMods(g);
  if (addMod(g, hRange, PORT_MONO, hOsc, PARAM_AMP)) throw new Error("mod");
  if (compile(g)) throw new Error("compile");
  snap(g);
  let sum = 0;
  let n = 0;
  let peak = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const buf = new Float64Array(mem.buffer, portPtr(g, hOsc, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      peak = Math.max(peak, Math.abs(y));
      sum += y * y;
      n += 1;
    }
  }
  destroy(g);
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), robinType };
}

const low = run(0.05);
const high = run(0.95);
console.log({ low, high });
if (!(Math.abs(low.rms - high.rms) > 0.01 || Math.abs(low.peak - high.peak) > 0.01)) {
  throw new Error(`robin amp MOD inert ${JSON.stringify({ low, high })}`);
}
console.log("smoke_robin_sinusoid_param_mod ok");
