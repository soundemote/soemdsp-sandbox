// Headless: independent L/R filter state for mono-native MLR filters.
// Stereo: two polyBleps → filter Left/Right; assert outs differ.
// Mono: polyBlep → filter In; assert mono peak and L/R fan-out match.
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

const TYPE_POLY = 1;
const TYPE_LADDER = 2;
const TYPE_ROBIN_SUPERSAW = 16;
const TYPE_TB303 = 60;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_RESONANCE = 20;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_GAIN_DB = 90;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function stats(buf) {
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
    sumSq += buf[i] * buf[i];
  }
  return { peak, rms: Math.sqrt(sumSq / buf.length) };
}

function corr(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-18 || nb < 1e-18) return 1;
  return dot / Math.sqrt(na * nb);
}

function identical(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const ver = version() | 0;
if (ver < 53) throw new Error(`graph version ${ver} expected >= 53`);

// --- mono path still works (ladder) ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x5101 >>> 0;
  const hFilt = 0x5102 >>> 0;
  const hOut = 0x5103 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("mono add osc");
  if ((add(g, hFilt, TYPE_LADDER) | 0) !== 0) throw new Error("mono add filt");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("mono add out");
  if ((connect(g, hOsc, PORT_MONO, hFilt, PORT_MONO) | 0) !== 0) throw new Error("mono conn");
  if ((connect(g, hFilt, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("mono out");
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hFilt, PARAM_FREQUENCY, 2000);
  setParam(g, hFilt, PARAM_RESONANCE, 0.2);
  setParam(g, hFilt, PARAM_MODE, 0);
  setParam(g, hFilt, PARAM_STAGES, 4);
  if ((compile(g) | 0) !== 0) throw new Error("mono compile");
  snap(g);
  let peak = 0;
  for (let q = 0; q < 30; q++) {
    process(g, 128);
    const m = view(portPtr(g, hFilt, PORT_MONO) | 0, 128);
    const L = view(portPtr(g, hFilt, PORT_LEFT) | 0, 128);
    const R = view(portPtr(g, hFilt, PORT_RIGHT) | 0, 128);
    if (!identical(m, L) || !identical(m, R)) {
      throw new Error("mono path: L/R should fan from mono");
    }
    for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(m[i]));
  }
  if (!(peak > 0.1 && peak < 4)) throw new Error(`mono ladder peak=${peak}`);
  console.log(`mono ladder ok peak=${peak.toFixed(4)}`);
  destroy(g);
}

// --- stereo: supersaw L/R → ladder L/R must diverge ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hSaw = 0x5201 >>> 0;
  const hFilt = 0x5202 >>> 0;
  const hOut = 0x5203 >>> 0;
  if ((add(g, hSaw, TYPE_ROBIN_SUPERSAW) | 0) !== 0) throw new Error("stereo add saw");
  if ((add(g, hFilt, TYPE_LADDER) | 0) !== 0) throw new Error("stereo add filt");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("stereo add out");
  if ((connect(g, hSaw, PORT_LEFT, hFilt, PORT_LEFT) | 0) !== 0) throw new Error("stereo L");
  if ((connect(g, hSaw, PORT_RIGHT, hFilt, PORT_RIGHT) | 0) !== 0) throw new Error("stereo R");
  if ((connect(g, hFilt, PORT_LEFT, hOut, PORT_LEFT) | 0) !== 0) throw new Error("out L");
  if ((connect(g, hFilt, PORT_RIGHT, hOut, PORT_RIGHT) | 0) !== 0) throw new Error("out R");
  setParam(g, hSaw, PARAM_FREQUENCY, 110);
  setParam(g, hSaw, PARAM_AMPLITUDE, 0.5);
  setParam(g, hFilt, PARAM_FREQUENCY, 800);
  setParam(g, hFilt, PARAM_RESONANCE, 0.55);
  setParam(g, hFilt, PARAM_MODE, 0);
  setParam(g, hFilt, PARAM_STAGES, 4);
  if ((compile(g) | 0) !== 0) throw new Error("stereo compile");
  snap(g);

  let maxDiff = 0;
  let lastCorr = 1;
  let peakL = 0;
  let peakR = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const L = view(portPtr(g, hFilt, PORT_LEFT) | 0, 128);
    const R = view(portPtr(g, hFilt, PORT_RIGHT) | 0, 128);
    if (identical(L, R)) {
      // allow early warmup; track after a few blocks
      if (q > 5) throw new Error("ladder stereo: L identical to R (mono collapse)");
    }
    lastCorr = corr(L, R);
    for (let i = 0; i < 128; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(L[i] - R[i]));
      peakL = Math.max(peakL, Math.abs(L[i]));
      peakR = Math.max(peakR, Math.abs(R[i]));
    }
  }
  if (!(peakL > 0.01 && peakR > 0.01)) {
    throw new Error(`ladder stereo silent L=${peakL} R=${peakR}`);
  }
  if (!(maxDiff > 1e-4)) {
    throw new Error(`ladder stereo maxDiff=${maxDiff} (expected independent L/R)`);
  }
  console.log(
    `stereo ladder ok peakL=${peakL.toFixed(4)} peakR=${peakR.toFixed(4)} ` +
      `maxDiff=${maxDiff.toFixed(5)} corr=${lastCorr.toFixed(4)}`
  );
  destroy(g);
}

// --- stereo: two polyBleps → tb303 L/R ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hA = 0x5301 >>> 0;
  const hB = 0x5302 >>> 0;
  const hFilt = 0x5303 >>> 0;
  const hOut = 0x5304 >>> 0;
  if ((add(g, hA, TYPE_POLY) | 0) !== 0) throw new Error("tb add A");
  if ((add(g, hB, TYPE_POLY) | 0) !== 0) throw new Error("tb add B");
  if ((add(g, hFilt, TYPE_TB303) | 0) !== 0) throw new Error("tb add filt");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("tb add out");
  if ((connect(g, hA, PORT_MONO, hFilt, PORT_LEFT) | 0) !== 0) throw new Error("tb L");
  if ((connect(g, hB, PORT_MONO, hFilt, PORT_RIGHT) | 0) !== 0) throw new Error("tb R");
  if ((connect(g, hFilt, PORT_LEFT, hOut, PORT_LEFT) | 0) !== 0) throw new Error("tb outL");
  if ((connect(g, hFilt, PORT_RIGHT, hOut, PORT_RIGHT) | 0) !== 0) throw new Error("tb outR");
  setParam(g, hA, PARAM_FREQUENCY, 110);
  setParam(g, hA, PARAM_AMPLITUDE, 0.6);
  setParam(g, hB, PARAM_FREQUENCY, 330);
  setParam(g, hB, PARAM_AMPLITUDE, 0.6);
  setParam(g, hFilt, PARAM_FREQUENCY, 1200);
  setParam(g, hFilt, PARAM_RESONANCE, 30);
  setParam(g, hFilt, PARAM_MODE, 4);
  setParam(g, hFilt, PARAM_GAIN_DB, 0);
  if ((compile(g) | 0) !== 0) throw new Error("tb compile");
  snap(g);

  let maxDiff = 0;
  let peakL = 0;
  let peakR = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const L = view(portPtr(g, hFilt, PORT_LEFT) | 0, 128);
    const R = view(portPtr(g, hFilt, PORT_RIGHT) | 0, 128);
    if (q > 5 && identical(L, R)) throw new Error("tb303 stereo: L identical to R");
    for (let i = 0; i < 128; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(L[i] - R[i]));
      peakL = Math.max(peakL, Math.abs(L[i]));
      peakR = Math.max(peakR, Math.abs(R[i]));
    }
  }
  if (!(peakL > 0.01 && peakR > 0.01 && maxDiff > 1e-3)) {
    throw new Error(`tb303 stereo peakL=${peakL} peakR=${peakR} maxDiff=${maxDiff}`);
  }
  console.log(
    `stereo tb303 ok peakL=${peakL.toFixed(4)} peakR=${peakR.toFixed(4)} maxDiff=${maxDiff.toFixed(5)}`
  );
  destroy(g);
}

console.log(`smoke_graph_filter_stereo ok: version=${ver}`);
