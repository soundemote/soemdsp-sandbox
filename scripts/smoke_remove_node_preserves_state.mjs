// Deleting an unconnected node must not wipe survivors' DSP state.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const remove = must("soemdsp_graph_remove_node");
const clearConn = must("soemdsp_graph_clear_connections");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const version = must("soemdsp_graph_version");

const ver = version() | 0;
if (ver < 130) throw new Error(`graph version ${ver} < 130 (need remove_node)`);

const TYPE_POLY = 1;
const TYPE_CLOCK = 28;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 10;
const PARAM_WAVE = 11;
const PARAM_AMP = 12;

const fnv = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const g = create();
setSr(g, 48000);
const poly = fnv("poly");
const clock = fnv("clock");
const out = fnv("out");
if (add(g, poly, TYPE_POLY)) throw new Error("poly");
if (add(g, clock, TYPE_CLOCK)) throw new Error("clock");
if (add(g, out, TYPE_OUT)) throw new Error("out");
// Clock is intentionally unconnected.
connect(g, poly, PORT_MONO, out, PORT_MONO);
setParam(g, poly, PARAM_FREQ, 110);
setParam(g, poly, PARAM_WAVE, 5);
setParam(g, poly, PARAM_AMP, 1);
compile(g);
snap(g);

for (let i = 0; i < 20; i++) process(g, 128);
const before = new Float64Array(e.memory.buffer, portPtr(g, poly, PORT_MONO) >>> 0, 128).slice();

// Surgical remove of unconnected clock + recompile (wires unchanged).
if (remove(g, clock) !== 0) throw new Error("remove clock");
clearConn(g);
connect(g, poly, PORT_MONO, out, PORT_MONO);
if (compile(g) !== 0) throw new Error("recompile");

process(g, 128);
const after = new Float64Array(e.memory.buffer, portPtr(g, poly, PORT_MONO) >>> 0, 128);

// If poly was recreated, phase would restart near 0 and first samples would
// match a cold start — not a continuous sine mid-cycle. Continuity check:
// correlation of last-before vs first-after should stay high for a running sine.
let corr = 0;
let e1 = 0;
let e2 = 0;
for (let i = 0; i < 64; i++) {
  const a = before[64 + i];
  const b = after[i];
  corr += a * b;
  e1 += a * a;
  e2 += b * b;
}
const norm = Math.sqrt(e1 * e2) || 1;
const similarity = corr / norm;
destroy(g);

console.log({ version: ver, similarity });
if (!(similarity > 0.5)) {
  throw new Error(`poly state wiped on unconnected delete: similarity=${similarity}`);
}
console.log("smoke_remove_node_preserves_state ok");
