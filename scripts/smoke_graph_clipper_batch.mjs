// Headless Batch 5: clipperLimiter + airClipper through graph_engine.
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
const TYPE_CLIP = 24;
const TYPE_AIR = 25;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 10;
const PARAM_AMP = 12;
const PARAM_GAIN_DB = 90;
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;
const PARAM_OVERSAMPLE = 32;
const PARAM_SHAPE = 13;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(g, hash, frames = 128, quanta = 30) {
  let peak = 0;
  for (let q = 0; q < quanta; q++) {
    process(g, frames);
    const p = portPtr(g, hash, PORT_MONO) | 0;
    if (!p) throw new Error("port null");
    const v = view(p, frames);
    for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(v[i]));
  }
  return peak;
}

// clipperLimiter: hot osc + gain should not explode past ~1
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x4101 >>> 0;
  const hClip = 0x4102 >>> 0;
  const hOut = 0x4103 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("clip add osc");
  if ((add(g, hClip, TYPE_CLIP) | 0) !== 0) throw new Error("clip add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("clip add out");
  if ((connect(g, hOsc, PORT_MONO, hClip, PORT_MONO) | 0) !== 0) throw new Error("clip conn");
  if ((connect(g, hClip, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("clip out");
  setParam(g, hOsc, PARAM_FREQ, 220);
  setParam(g, hOsc, PARAM_AMP, 1);
  setParam(g, hClip, PARAM_GAIN_DB, 24);
  setParam(g, hClip, PARAM_IN_LOW, -12);
  setParam(g, hClip, PARAM_IN_HIGH, 0);
  setParam(g, hClip, PARAM_OVERSAMPLE, 2);
  if ((compile(g) | 0) !== 0) throw new Error("clip compile");
  snap(g);
  const peak = peakOf(g, hClip);
  // Soft knee can overshoot ~1 slightly; must still crush +24 dB drive (not ~16).
  if (!(peak > 0.3 && peak < 3.0)) throw new Error(`clipperLimiter peak=${peak}`);
  console.log(`clipperLimiter ok peak=${peak.toFixed(3)}`);
}

// airClipper: density>0 should keep signal finite and audible
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x4201 >>> 0;
  const hAir = 0x4202 >>> 0;
  const hOut = 0x4203 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("air add osc");
  if ((add(g, hAir, TYPE_AIR) | 0) !== 0) throw new Error("air add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("air add out");
  if ((connect(g, hOsc, PORT_MONO, hAir, PORT_MONO) | 0) !== 0) throw new Error("air conn");
  if ((connect(g, hAir, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("air out");
  setParam(g, hOsc, PARAM_FREQ, 110);
  setParam(g, hOsc, PARAM_AMP, 1);
  setParam(g, hAir, PARAM_SHAPE, 0.4); // density
  setParam(g, hAir, PARAM_WIDTH, 0.0); // highpass
  setParam(g, hAir, PARAM_AMP, 1.0); // output
  setParam(g, hAir, PARAM_MIX, 1.0); // wet
  if ((compile(g) | 0) !== 0) throw new Error("air compile");
  snap(g);
  const peak = peakOf(g, hAir);
  if (!(peak > 0.2 && peak < 2.0)) throw new Error(`airClipper peak=${peak}`);
  console.log(`airClipper ok peak=${peak.toFixed(3)}`);
}

if ((version() | 0) < 27) throw new Error(`graph version ${version()} expected >= 27`);
console.log(`smoke_graph_clipper_batch ok: version=${version() | 0}`);
