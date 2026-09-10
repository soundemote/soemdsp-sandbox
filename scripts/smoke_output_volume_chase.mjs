// B-043: Output Volume Control chase must be sample-accurate (no block zipper).
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
const setSmoothTime = must("soemdsp_graph_set_smooth_time");
const setSmoothMode = must("soemdsp_graph_set_smooth_mode");
const setSmoothType = must("soemdsp_graph_set_smooth_type");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const outL = must("soemdsp_graph_block_output_left_ptr");
const destroy = must("soemdsp_graph_destroy");

const TYPE_POLY = 1;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 2;
const PARAM_AMP = 4;
const PARAM_WAVE = 3;
const PARAM_VOLUME_DB = 0;
const FRAMES = 128;
const SR = 48000;

const fnv = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const h = create();
if (h <= 0) throw new Error("create failed");
setSr(h, SR);

const poly = fnv("poly");
const out = fnv("out");
if (add(h, poly, TYPE_POLY) !== 0) throw new Error("add poly");
if (add(h, out, TYPE_OUT) !== 0) throw new Error("add out");
if (connect(h, poly, PORT_MONO, out, PORT_MONO) !== 0) throw new Error("connect");
if (compile(h) !== 0) throw new Error("compile");

setParam(h, poly, PARAM_FREQ, 220);
setParam(h, poly, PARAM_AMP, 1);
setParam(h, poly, PARAM_WAVE, 0);

// Internal linear smooth ~33ms
const smoothSamples = Math.round(0.0333 * SR);
setSmoothMode(h, out, PARAM_VOLUME_DB, 0); // internal
setSmoothType(h, out, PARAM_VOLUME_DB, 0); // linear
setSmoothTime(h, out, PARAM_VOLUME_DB, smoothSamples);

setParam(h, out, PARAM_VOLUME_DB, -60);
snap(h);
for (let i = 0; i < 4; i++) process(h, FRAMES);

// Jump to 0 dB and capture sample peaks across several quanta
setParam(h, out, PARAM_VOLUME_DB, 0);
const peaks = [];
const blocks = 20;
for (let b = 0; b < blocks; b++) {
  process(h, FRAMES);
  const ptr = outL(h) >>> 0;
  const view = new Float64Array(mem.buffer, ptr, FRAMES);
  let peak = 0;
  for (let i = 0; i < FRAMES; i++) {
    const a = Math.abs(view[i]);
    if (a > peak) peak = a;
    if (i % 16 === 0) peaks.push(a);
  }
}

destroy(h);

// Zipper signature: long plateaus at identical peak for whole blocks, then a jump.
// Sample-accurate linear dB→lin chase should change nearly every probe.
let flatRuns = 0;
let maxFlat = 0;
for (let i = 1; i < peaks.length; i++) {
  if (Math.abs(peaks[i] - peaks[i - 1]) < 1e-9) {
    flatRuns += 1;
    if (flatRuns > maxFlat) maxFlat = flatRuns;
  } else {
    flatRuns = 0;
  }
}

const first = peaks.find((p) => p > 1e-6) ?? 0;
const last = peaks[peaks.length - 1] ?? 0;
console.log({
  probes: peaks.length,
  firstNonZero: first,
  last,
  maxFlatRun: maxFlat,
  mid: peaks[Math.floor(peaks.length / 2)],
});

if (!(last > first * 2)) {
  throw new Error(`expected rising envelope, first=${first} last=${last}`);
}
// Block zipper would hold ~FRAMES/16 identical probes per quantum (≥7).
if (maxFlat >= 6) {
  throw new Error(`zipper suspected: maxFlatRun=${maxFlat}`);
}
console.log("output volume chase smoke OK");
