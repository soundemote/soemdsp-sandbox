// Headless: polyBlep → sampleDelay(samples=48) → output; assert Delayed lags Thru.
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
const TYPE_DELAY = 19;
const TYPE_OUT = 6;
const PORT_MONO = 0; // Delayed
const PORT_THRU = 3;
const PARAM_TIME = 52;
const PARAM_SAMPLES = 53;

const g = create() | 0;
if (!g) throw new Error("graph create failed");
setSr(g, 48000);

const hOsc = 0x11111111 >>> 0;
const hDel = 0x22222222 >>> 0;
const hOut = 0x33333333 >>> 0;

if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("add poly");
if ((add(g, hDel, TYPE_DELAY) | 0) !== 0) throw new Error("add sampleDelay");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add output");
if ((connect(g, hOsc, PORT_MONO, hDel, PORT_MONO) | 0) !== 0) throw new Error("connect osc→delay");
if ((connect(g, hDel, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect delayed→out");

setParam(g, hOsc, 10, 440);
setParam(g, hOsc, 12, 1);
setParam(g, hDel, PARAM_TIME, 0);
setParam(g, hDel, PARAM_SAMPLES, 48);
setParam(g, hOut, 0, -3);
if ((compile(g) | 0) !== 0) throw new Error("compile failed");
snap(g);

const frames = 128;
let maxDiff = 0;
let thruPeak = 0;
let delayedPeak = 0;
for (let q = 0; q < 20; q++) {
  const n = process(g, frames) | 0;
  if (n < 1) throw new Error(`process_block returned ${n}`);
  const thruP = portPtr(g, hDel, PORT_THRU) | 0;
  const delP = portPtr(g, hDel, PORT_MONO) | 0;
  if (!thruP || !delP) throw new Error("port ptr null");
  const thru = new Float64Array(mem.buffer, thruP, frames);
  const delayed = new Float64Array(mem.buffer, delP, frames);
  for (let i = 0; i < frames; i++) {
    const d = Math.abs(thru[i] - delayed[i]);
    if (d > maxDiff) maxDiff = d;
    const ta = Math.abs(thru[i]);
    const da = Math.abs(delayed[i]);
    if (ta > thruPeak) thruPeak = ta;
    if (da > delayedPeak) delayedPeak = da;
  }
}

if ((version() | 0) < 24) throw new Error(`graph version ${version()} expected >= 24`);
if (!(thruPeak > 0.1)) throw new Error(`Thru peak too low: ${thruPeak}`);
if (!(delayedPeak > 0.1)) throw new Error(`Delayed peak too low: ${delayedPeak}`);
// With 48-sample delay on a ~109-sample period (440Hz@48k), Thru and Delayed must diverge.
if (!(maxDiff > 0.05)) throw new Error(`Thru vs Delayed maxDiff too small: ${maxDiff}`);

console.log(
  `smoke_graph_sample_delay ok: version=${version() | 0} thruPeak=${thruPeak.toFixed(3)} delayedPeak=${delayedPeak.toFixed(3)} maxDiff=${maxDiff.toFixed(3)}`,
);
