// Headless: sampleHold @ 100 Hz internal clock.
// Ext (Mono) stays 0 when Ext In unwired; Left/Right = independent noise holds.
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
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PARAM_FREQUENCY = 10; // sampleFrequency
const PARAM_CENTER = 30; // threshold
const PARAM_PHASE = 14; // phaseOffset
const PARAM_MODE = 21; // polarity (0 bipolar / 1 unipolar)
const PARAM_AMPLITUDE = 12;
const PORT_SAW = 3; // face Left Raw probe
const PORT_RAMP = 4; // face Right Raw probe

const g = create() | 0;
if (!g) throw new Error("graph create failed");
setSr(g, 48000);

const hHold = 0x22222222 >>> 0;
const hOut = 0x33333333 >>> 0;

if ((add(g, hHold, TYPE_HOLD) | 0) !== 0) throw new Error("add sampleHold");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add output");
if ((connect(g, hHold, PORT_LEFT, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect Left→out");

setParam(g, hHold, PARAM_FREQUENCY, 100); // 100 Hz internal clock
setParam(g, hHold, PARAM_CENTER, 0);
setParam(g, hHold, PARAM_PHASE, 0.5); // Right halfway out of phase
setParam(g, hOut, 0, -3);
if ((compile(g) | 0) !== 0) throw new Error("compile failed");
snap(g);

const frames = 128;
let peakL = 0;
let peakExt = 0;
let holdRuns = 0;
let changes = 0;
let prev = null;
let mismatchLR = 0;
for (let q = 0; q < 40; q++) {
  const n = process(g, frames) | 0;
  if (n < 1) throw new Error(`process_block returned ${n}`);
  const pL = portPtr(g, hHold, PORT_LEFT) | 0;
  const pR = portPtr(g, hHold, PORT_RIGHT) | 0;
  const pE = portPtr(g, hHold, PORT_MONO) | 0;
  if (!pL || !pR || !pE) throw new Error("port ptr null");
  const left = new Float64Array(mem.buffer, pL, frames);
  const right = new Float64Array(mem.buffer, pR, frames);
  const ext = new Float64Array(mem.buffer, pE, frames);
  for (let i = 0; i < frames; i++) {
    const v = left[i];
    const a = Math.abs(v);
    if (a > peakL) peakL = a;
    const ae = Math.abs(ext[i]);
    if (ae > peakExt) peakExt = ae;
    if (left[i] !== right[i]) mismatchLR += 1;
    if (prev !== null) {
      if (v === prev) holdRuns += 1;
      else changes += 1;
    }
    prev = v;
  }
}

if ((version() | 0) < 155) throw new Error(`graph version ${version()} expected >= 155`);
if (!(peakL > 0.05)) throw new Error(`Left noise latch peak too low: ${peakL}`);
if (!(peakExt < 1e-9)) throw new Error(`unwired Ext should hold 0, peakExt=${peakExt}`);
if (!(changes > 5)) throw new Error(`expected several latch changes, got ${changes}`);
if (!(holdRuns > 100)) throw new Error(`expected held plateaus, holdRuns=${holdRuns}`);

if (!(mismatchLR > 50)) throw new Error(`expected L/R independent (phaseOffset), mismatchLR=${mismatchLR}`);

// Unipolar: audio Left/Right in 0..1; Saw/Ramp (Left Raw/Right Raw) stay bipolar (-1..1).
setParam(g, hHold, PARAM_MODE, 1);
setParam(g, hHold, PARAM_AMPLITUDE, 1);
snap(g);
let uniMin = Infinity;
let uniMax = -Infinity;
let sawMin = Infinity;
let sawMax = -Infinity;
let sawNeg = 0;
for (let q = 0; q < 40; q++) {
  const n = process(g, frames) | 0;
  if (n < 1) throw new Error(`unipolar process_block returned ${n}`);
  const pL = portPtr(g, hHold, PORT_LEFT) | 0;
  const pSaw = portPtr(g, hHold, PORT_SAW) | 0;
  if (!pL || !pSaw) throw new Error("unipolar port ptr null");
  const left = new Float64Array(mem.buffer, pL, frames);
  const saw = new Float64Array(mem.buffer, pSaw, frames);
  for (let i = 0; i < frames; i++) {
    const v = left[i];
    const s = saw[i];
    if (v < uniMin) uniMin = v;
    if (v > uniMax) uniMax = v;
    if (s < sawMin) sawMin = s;
    if (s > sawMax) sawMax = s;
    if (s < -0.05) sawNeg += 1;
  }
}
if (!(uniMin >= -1e-9 && uniMax <= 1 + 1e-9)) {
  throw new Error(`unipolar audio out of 0..1: min=${uniMin} max=${uniMax}`);
}
if (!(uniMax > 0.2)) throw new Error(`unipolar audio peak too low: ${uniMax}`);
if (!(sawMin < -0.05 && sawMax > 0.05 && sawNeg > 10)) {
  throw new Error(
    `face Saw should stay bipolar under Unipolar: sawMin=${sawMin} sawMax=${sawMax} sawNeg=${sawNeg}`,
  );
}


// Amplitude: audio Left scales; Saw (Left Raw) stays full bipolar.
setParam(g, hHold, PARAM_MODE, 0);
function peakAtAmp(amp) {
  setParam(g, hHold, PARAM_AMPLITUDE, amp);
  snap(g);
  let pL = 0;
  let pS = 0;
  for (let q = 0; q < 40; q++) {
    const n = process(g, frames) | 0;
    if (n < 1) throw new Error(`amp process_block returned ${n}`);
    const left = new Float64Array(mem.buffer, portPtr(g, hHold, PORT_LEFT) | 0, frames);
    const saw = new Float64Array(mem.buffer, portPtr(g, hHold, PORT_SAW) | 0, frames);
    for (let i = 0; i < frames; i++) {
      pL = Math.max(pL, Math.abs(left[i]));
      pS = Math.max(pS, Math.abs(saw[i]));
    }
  }
  return { pL, pS };
}
const amp1 = peakAtAmp(1);
const amp025 = peakAtAmp(0.25);
if (!(amp025.pL < amp1.pL * 0.4)) {
  throw new Error(`Left should scale with Amplitude: amp1=${amp1.pL} amp025=${amp025.pL}`);
}
if (!(amp025.pS > amp1.pS * 0.5)) {
  throw new Error(`Saw/Left Raw should stay full: amp1=${amp1.pS} amp025=${amp025.pS}`);
}


console.log(
  `smoke_graph_sample_hold ok: version=${version() | 0} peakL=${peakL.toFixed(3)} peakExt=${peakExt} changes=${changes} holdRuns=${holdRuns} mismatchLR=${mismatchLR} uni=[${uniMin.toFixed(3)},${uniMax.toFixed(3)}] saw=[${sawMin.toFixed(3)},${sawMax.toFixed(3)}] Amplitude scale: Left ${amp025.pL.toFixed(3)}/${amp1.pL.toFixed(3)} Saw ${amp025.pS.toFixed(3)}/${amp1.pS.toFixed(3)}`,
);