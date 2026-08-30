// Headless: polyBlep → comparator → output; assert Change/Sign/Thru taps.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const rspPath = path.join(root, "native_modules", "combined", "obj", "exports.rsp");

const bytes = fs.readFileSync(wasmPath);
const rsp = fs.readFileSync(rspPath, "utf8");
const exportNames = [...rsp.matchAll(/--export=([^\s]+)/g)].map((m) => m[1]);

const { instance } = await WebAssembly.instantiate(bytes, {});
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
const TYPE_CMP = 18;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_CHANGE = 5;
const PORT_SIGN = 7;
const PORT_THRU = 0;

const g = create() | 0;
if (!g) throw new Error("graph create failed");
setSr(g, 48000);

const hOsc = 0x11111111 >>> 0;
const hCmp = 0x22222222 >>> 0;
const hOut = 0x33333333 >>> 0;

if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("add poly");
if ((add(g, hCmp, TYPE_CMP) | 0) !== 0) throw new Error("add comparator");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add output");
if ((connect(g, hOsc, PORT_MONO, hCmp, PORT_MONO) | 0) !== 0) throw new Error("connect osc→cmp");
if ((connect(g, hCmp, PORT_THRU, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect thru→out");

setParam(g, hOsc, 10, 440); // frequency
setParam(g, hOsc, 12, 1); // amplitude
setParam(g, hOut, 0, -3); // volumeDb
if ((compile(g) | 0) !== 0) throw new Error("compile failed");
snap(g);

const frames = 128;
let sawChange = false;
let sawSignHigh = false;
let thruPeak = 0;
for (let q = 0; q < 40; q++) {
  const n = process(g, frames) | 0;
  if (n < 1) throw new Error(`process_block returned ${n}`);
  const changeP = portPtr(g, hCmp, PORT_CHANGE) | 0;
  const signP = portPtr(g, hCmp, PORT_SIGN) | 0;
  const thruP = portPtr(g, hCmp, PORT_THRU) | 0;
  if (!changeP || !signP || !thruP) throw new Error("port ptr null");
  const change = new Float64Array(mem.buffer, changeP, frames);
  const sign = new Float64Array(mem.buffer, signP, frames);
  const thru = new Float64Array(mem.buffer, thruP, frames);
  for (let i = 0; i < frames; i++) {
    if (change[i] === 1) sawChange = true;
    if (sign[i] === 1) sawSignHigh = true;
    const a = Math.abs(thru[i]);
    if (a > thruPeak) thruPeak = a;
  }
}

if ((version() | 0) < 23) throw new Error(`graph version ${version()} expected >= 23`);
if (!sawChange) throw new Error("expected Change pulses from sine/blep");
if (!sawSignHigh) throw new Error("expected Sign=1 on positive samples");
if (!(thruPeak > 0.1)) throw new Error(`Thru peak too low: ${thruPeak}`);

console.log(
  `smoke_graph_comparator ok: version=${version() | 0} thruPeak=${thruPeak.toFixed(3)} change=${sawChange} sign=${sawSignHigh} exports=${exportNames.length}`,
);
