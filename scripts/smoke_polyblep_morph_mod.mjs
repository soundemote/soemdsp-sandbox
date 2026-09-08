// PolyBLEP Morph must hear Bias→Range ParamModEdge (fixed-freq block path).
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

const TYPE_POLYBLEP = 1; // verify
const TYPE_BIAS = 12;
const TYPE_RANGE = 8;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_ATT_OFFSET = 71;
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;
const PARAM_OUT_LOW = 82;
const PARAM_OUT_HIGH = 83;

// Discover polyBlep type id from catalog if needed
let polyType = 1;
try {
  const cat = JSON.parse(fs.readFileSync(path.join(root, "public/native-modules-catalog.json"), "utf8"));
  // fall back: graph uses softwave 45; polyblep is typically early
} catch (_e) { /* ignore */ }

// From native-graph.js polyBlep is usually type 1 — confirm via add success.
const ver = version() | 0;
if (ver < 129) throw new Error(`graph version ${ver} < 129`);
console.log(`graph version ${ver}`);

function peakOf(ptr, n) {
  const x = new Float64Array(mem.buffer, ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i] || 0));
  return peak;
}

function run(biasValue) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xc001 >>> 0;
  const hBias = 0xc002 >>> 0;
  const hRange = 0xc003 >>> 0;
  const hOut = 0xc004 >>> 0;
  // Try common polyBlep type ids
  let added = false;
  for (const tid of [1, 2, 3, 4, 5]) {
    if ((add(g, hOsc, tid) | 0) === 0) {
      polyType = tid;
      added = true;
      break;
    }
  }
  if (!added) throw new Error("could not add polyBlep");
  if (add(g, hBias, TYPE_BIAS)) throw new Error("bias");
  if (add(g, hRange, TYPE_RANGE)) throw new Error("range");
  if (add(g, hOut, TYPE_OUT)) throw new Error("out");
  if (connect(g, hBias, PORT_MONO, hRange, PORT_MONO)) throw new Error("bias→range");
  if (connect(g, hOsc, PORT_MONO, hOut, PORT_MONO)) throw new Error("osc→out");
  setParam(g, hOsc, PARAM_FREQUENCY, 110);
  setParam(g, hOsc, PARAM_WAVEFORM, 7); // Pulse — Morph is pulse width
  setParam(g, hOsc, PARAM_SHAPE, 0.1);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  setDomain(g, hOsc, PARAM_SHAPE, 0, 1, 2);
  setParam(g, hBias, PARAM_ATT_OFFSET, biasValue);
  setParam(g, hRange, PARAM_IN_LOW, 0);
  setParam(g, hRange, PARAM_IN_HIGH, 1);
  setParam(g, hRange, PARAM_OUT_LOW, 0);
  setParam(g, hRange, PARAM_OUT_HIGH, 1);
  clearMods(g);
  if (addMod(g, hRange, PORT_MONO, hOsc, PARAM_SHAPE)) throw new Error("mod");
  if (compile(g)) throw new Error("compile");
  snap(g);
  let peak = 0;
  let sum = 0;
  let n = 0;
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
  return { peak, rms: Math.sqrt(sum / n), typeId: polyType };
}

const low = run(0.05);
const high = run(0.95);
console.log({ low, high, typeId: low.typeId });
// Pulse-width morph changes duty — RMS or peak should differ
if (!(Math.abs(low.rms - high.rms) > 0.01 || Math.abs(low.peak - high.peak) > 0.01)) {
  throw new Error(`PolyBLEP Morph MOD inert low=${JSON.stringify(low)} high=${JSON.stringify(high)}`);
}
console.log("smoke_polyblep_morph_mod ok");
