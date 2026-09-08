// Softwave Morph MOD from a processor (Bias/Range-style) must hear this block's
// audio — not a zeroed buffer because Softwave sorted before the MOD source.
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
  if (typeof fn !== "function") throw new Error(`missing ${name}`);
  return fn;
}

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
const version = must("soemdsp_graph_version");

const TYPE_SOFTWAVE = 45;
const TYPE_BIAS = 12;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_ATT_OFFSET = 71;

const ver = version() | 0;
if (ver < 128) throw new Error(`graph version ${ver} < 128`);
console.log(`graph version ${ver}`);

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(ptr, n) {
  const x = view(ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i] || 0));
  return peak;
}

// Softwave added FIRST (would sort before Bias without ParamModEdge deps).
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xa001 >>> 0;
  const hBias = 0xa002 >>> 0;
  const hOut = 0xa003 >>> 0;
  if ((add(g, hOsc, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("add softwave");
  if ((add(g, hBias, TYPE_BIAS) | 0) !== 0) throw new Error("add bias");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add out");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 110);
  setParam(g, hOsc, PARAM_WAVEFORM, 0);
  setParam(g, hOsc, PARAM_SHAPE, 0.1);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  setDomain(g, hOsc, PARAM_SHAPE, 0, 1, 2);
  setParam(g, hBias, PARAM_ATT_OFFSET, 0.85);
  clearMods(g);
  if ((addMod(g, hBias, PORT_MONO, hOsc, PARAM_SHAPE) | 0) !== 0) {
    throw new Error("add morph mod edge");
  }
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let peakMod = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    peakMod = Math.max(peakMod, peakOf(portPtr(g, hOsc, PORT_MONO) | 0, 128));
  }
  destroy(g);

  const g2 = create() | 0;
  setSr(g2, 48000);
  const hOsc2 = 0xa011 >>> 0;
  const hOut2 = 0xa012 >>> 0;
  if ((add(g2, hOsc2, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("add softwave2");
  if ((add(g2, hOut2, TYPE_OUT) | 0) !== 0) throw new Error("add out2");
  if ((connect(g2, hOsc2, PORT_MONO, hOut2, PORT_MONO) | 0) !== 0) throw new Error("conn2");
  setParam(g2, hOsc2, PARAM_FREQUENCY, 110);
  setParam(g2, hOsc2, PARAM_WAVEFORM, 0);
  setParam(g2, hOsc2, PARAM_SHAPE, 0.1);
  setParam(g2, hOsc2, PARAM_AMPLITUDE, 1);
  if ((compile(g2) | 0) !== 0) throw new Error("compile2");
  snap(g2);
  let peakNo = 0;
  for (let q = 0; q < 40; q++) {
    process(g2, 128);
    peakNo = Math.max(peakNo, peakOf(portPtr(g2, hOsc2, PORT_MONO) | 0, 128));
  }
  destroy(g2);

  console.log({ peakMod, peakNo, delta: Math.abs(peakMod - peakNo) });
  if (!(peakMod > 0.05 && peakNo > 0.01)) {
    throw new Error(`silent mod=${peakMod} nomod=${peakNo}`);
  }
  if (!(Math.abs(peakMod - peakNo) > 1e-3)) {
    throw new Error(
      `Morph MOD inert when Softwave added before Bias (order bug) mod=${peakMod} nomod=${peakNo}`,
    );
  }
  console.log("smoke_softwave_morph_mod_order ok");
}
