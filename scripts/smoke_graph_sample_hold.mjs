// Headless: sampleHold @ 100 Hz internal clock, no In → bipolar noise latch.
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

const TYPE_HOLD = 20;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10; // sampleFrequency
const PARAM_CENTER = 30; // threshold

const g = create() | 0;
if (!g) throw new Error("graph create failed");
setSr(g, 48000);

const hHold = 0x22222222 >>> 0;
const hOut = 0x33333333 >>> 0;

if ((add(g, hHold, TYPE_HOLD) | 0) !== 0) throw new Error("add sampleHold");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add output");
if ((connect(g, hHold, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect hold→out");

setParam(g, hHold, PARAM_FREQUENCY, 100); // 100 Hz internal clock
setParam(g, hHold, PARAM_CENTER, 0);
setParam(g, hOut, 0, -3);
if ((compile(g) | 0) !== 0) throw new Error("compile failed");
snap(g);

const frames = 128;
let peak = 0;
let holdRuns = 0;
let changes = 0;
let prev = null;
for (let q = 0; q < 40; q++) {
  const n = process(g, frames) | 0;
  if (n < 1) throw new Error(`process_block returned ${n}`);
  const p = portPtr(g, hHold, PORT_MONO) | 0;
  if (!p) throw new Error("port ptr null");
  const out = new Float64Array(mem.buffer, p, frames);
  for (let i = 0; i < frames; i++) {
    const v = out[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (prev !== null) {
      if (v === prev) holdRuns += 1;
      else changes += 1;
    }
    prev = v;
  }
}

if ((version() | 0) < 25) throw new Error(`graph version ${version()} expected >= 25`);
if (!(peak > 0.05)) throw new Error(`noise latch peak too low: ${peak}`);
if (!(changes > 5)) throw new Error(`expected several latch changes, got ${changes}`);
if (!(holdRuns > 100)) throw new Error(`expected held plateaus, holdRuns=${holdRuns}`);

console.log(
  `smoke_graph_sample_hold ok: version=${version() | 0} peak=${peak.toFixed(3)} changes=${changes} holdRuns=${holdRuns}`,
);
