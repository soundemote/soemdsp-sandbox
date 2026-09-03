// Headless: polyBlep → phaseDisperse (type 148) → output. Expect non-silent.
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
const TYPE_PHASE_DISPERSE = 148;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_RESONANCE = 20; // pinch
const PARAM_STAGES = 22; // filters

const ver = version() | 0;
if (ver < 105) {
  throw new Error(`graph version ${ver} < 105 (phaseDisperse not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(g, hNode) {
  let peak = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hNode, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

const g = create() | 0;
setSr(g, 48000);
const hOsc = 0xee01 >>> 0;
const hDisp = 0xee02 >>> 0;
const hOut = 0xee03 >>> 0;
if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("osc add");
if ((add(g, hDisp, TYPE_PHASE_DISPERSE) | 0) !== 0) throw new Error("phaseDisperse add");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
if ((connect(g, hOsc, PORT_MONO, hDisp, PORT_MONO) | 0) !== 0) {
  throw new Error("osc→disp");
}
if ((connect(g, hDisp, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
  throw new Error("disp→out");
}
setParam(g, hOsc, PARAM_FREQUENCY, 220);
setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
setParam(g, hDisp, PARAM_FREQUENCY, 100);
setParam(g, hDisp, PARAM_STAGES, 32);
setParam(g, hDisp, PARAM_RESONANCE, 0.5);
setParam(g, hDisp, PARAM_AMPLITUDE, 1);
if ((compile(g) | 0) !== 0) throw new Error("compile");
snap(g);

const peak = peakOf(g, hDisp);
destroy(g);

if (!(peak > 1e-4) || !(peak < 2.0)) {
  throw new Error(`phaseDisperse peak ${peak} out of range`);
}
console.log(`ok phaseDisperse type=${TYPE_PHASE_DISPERSE} version=${ver} peak=${peak.toFixed(4)}`);
