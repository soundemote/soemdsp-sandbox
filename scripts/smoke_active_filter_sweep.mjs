// Dual Ladder Sweep (native graph): +12 st must move both HP and LP one octave
// so a bandpass keeps its interval. Same CENTER slot / units as Passive Filter.
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
const TYPE_ACTIVE = 58;
const TYPE_PASSIVE = 59;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_TIMING_MODE = 54;
const PARAM_LPF = 59;
const PARAM_HPF = 60;

const SR = 48000;
const BLOCK = 128;
const WARMUP = 24;
const MEASURE = 32;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function rmsFor(typeId, setup, toneHz, sweepSt) {
  const g = create() | 0;
  setSr(g, SR);
  const hOsc = 0xaf01;
  const hFilt = 0xaf02;
  const hOut = 0xaf03;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("osc add");
  if ((add(g, hFilt, typeId) | 0) !== 0) throw new Error("filt add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_MONO, hFilt, PORT_MONO) | 0) !== 0) throw new Error("osc→filt");
  if ((connect(g, hFilt, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("filt→out");
  setParam(g, hOsc, PARAM_FREQUENCY, toneHz);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hOsc, PARAM_WAVEFORM, 4); // sine
  setup(g, hFilt);
  setParam(g, hFilt, PARAM_CENTER, sweepSt);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < WARMUP + MEASURE; q++) {
    process(g, BLOCK);
    if (q < WARMUP) continue;
    const buf = view(portPtr(g, hFilt, PORT_MONO) | 0, BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      sumSq += buf[i] * buf[i];
      n += 1;
    }
  }
  destroy(g);
  return Math.sqrt(sumSq / n);
}

function setupActiveBp(g, h) {
  setParam(g, h, PARAM_WAVEFORM, 4); // HP 24
  setParam(g, h, PARAM_SHAPE, 4); // LP 24
  setParam(g, h, PARAM_HPF, 350);
  setParam(g, h, PARAM_LPF, 450);
  setParam(g, h, PARAM_STAGES, 0); // feedback Off — no res boost
  setParam(g, h, PARAM_TIMING_MODE, 1);
}

function setupPassiveBp(g, h) {
  setParam(g, h, PARAM_MODE, 1); // BP
  setParam(g, h, PARAM_HPF, 350);
  setParam(g, h, PARAM_LPF, 450);
  setParam(g, h, PARAM_STAGES, 3); // 24 dB
}

function assertBandMoves(name, typeId, setup) {
  const hz400s0 = rmsFor(typeId, setup, 400, 0);
  const hz800s0 = rmsFor(typeId, setup, 800, 0);
  const hz400s12 = rmsFor(typeId, setup, 400, 12);
  const hz800s12 = rmsFor(typeId, setup, 800, 12);
  const hz400s1 = rmsFor(typeId, setup, 400, 1);
  console.log({
    name,
    hz400s0,
    hz800s0,
    hz400s12,
    hz800s12,
    hz400s1,
  });
  // sweep=0: 400 Hz in 350–450, 800 Hz above LPF.
  if (!(hz400s0 > hz800s0 * 1.25)) {
    throw new Error(`${name} sweep=0: 400 Hz should pass BP 350–450 more than 800 Hz (${hz400s0} vs ${hz800s0})`);
  }
  // +12 st → 700–900 Hz. 800 Hz enters; 400 Hz drops out.
  if (!(hz800s12 > hz400s12 * 1.25)) {
    throw new Error(
      `${name} sweep=+12: 800 Hz should pass the octave-shifted band more than 400 Hz (${hz800s12} vs ${hz400s12})`,
    );
  }
  if (!(hz400s0 > hz400s12 * 1.3)) {
    throw new Error(`${name} +12 st must attenuate 400 Hz (was ${hz400s0}, now ${hz400s12})`);
  }
  if (!(hz800s12 > hz800s0 * 1.3)) {
    throw new Error(`${name} +12 st must raise 800 Hz (was ${hz800s0}, now ${hz800s12})`);
  }
  // Unit is semitones: +1 st is not +1 octave, so 400 Hz stays in-band.
  if (!(hz400s1 > hz800s0 * 1.2) || !(hz400s1 > hz400s12)) {
    throw new Error(
      `${name} sweep=+1 st must not be treated as +1 octave (400 Hz still in-band: ${hz400s1})`,
    );
  }
}

if ((version() | 0) < 148) {
  throw new Error(`graph version ${version()} expected >= 148 (Dual Ladder sweep)`);
}

assertBandMoves("activeFilter", TYPE_ACTIVE, setupActiveBp);
assertBandMoves("passiveFilter", TYPE_PASSIVE, setupPassiveBp);
console.log("smoke_active_filter_sweep ok");
