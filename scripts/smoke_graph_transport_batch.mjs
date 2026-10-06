// Headless Batch 12: transport Master Clock (+ digital f = BPM→Hz).
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

const TYPE_TRANSPORT = 37;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_F = 3; // Saw = f Hz
const PARAM_AMP = 12;
const PARAM_TIME_NUMERATOR = 52;
const PARAM_TIME_DENOMINATOR = 53;
const PARAM_TIMING_MODE = 54;
const PARAM_TEMPO = 61;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// 120 BPM, Numer/Denom 1/4 Normal → f = 2 Hz; Gate 0-1 only; Trigger edges
{
  const g = create() | 0;
  setSr(g, 48000);
  const hT = 0xb101 >>> 0;
  const hOut = 0xb102 >>> 0;
  if ((add(g, hT, TYPE_TRANSPORT) | 0) !== 0) throw new Error("transport add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("transport out");
  if ((connect(g, hT, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("transport conn");
  setParam(g, hT, PARAM_AMP, 1);
  setParam(g, hT, PARAM_TIME_NUMERATOR, 1);
  setParam(g, hT, PARAM_TIME_DENOMINATOR, 4);
  setParam(g, hT, PARAM_TIMING_MODE, 0);
  setParam(g, hT, PARAM_TEMPO, 120);
  if ((compile(g) | 0) !== 0) throw new Error("transport compile");
  snap(g);

  let trigHits = 0;
  let gateHigh = 0;
  let gateNeg = 0;
  let fVal = 0;
  // ~1.07 s at 48 kHz → a few edges at 2 Hz.
  for (let q = 0; q < 400; q++) {
    process(g, 128);
    const gate = view(portPtr(g, hT, PORT_MONO) | 0, 128);
    const gateLeft = view(portPtr(g, hT, PORT_LEFT) | 0, 128);
    const trig = view(portPtr(g, hT, PORT_RIGHT) | 0, 128);
    const freq = view(portPtr(g, hT, PORT_F) | 0, 128);
    fVal = freq[0];
    for (let i = 0; i < 128; i++) {
      if (trig[i] > 0.5) trigHits += 1;
      if (gate[i] > 0.5) gateHigh += 1;
      if (gate[i] < -0.5 || gateLeft[i] < -0.5) gateNeg += 1;
    }
  }
  if (Math.abs(fVal - 2) > 1e-6) throw new Error(`transport f=${fVal} expected 2 Hz @ 120 BPM 1/4`);
  if (!(trigHits >= 2)) throw new Error(`transport Trigger hits=${trigHits}`);
  if (!(gateHigh > 100) || gateNeg !== 0) {
    throw new Error(`transport Gate 0-1 high=${gateHigh} neg=${gateNeg}`);
  }
  console.log(`transport ok f=${fVal} trig=${trigHits} gateHigh=${gateHigh}`);
}

// Numer/Denom 1/8 Normal → f = 4 Hz at 120 BPM (eighth notes)
{
  const g = create() | 0;
  setSr(g, 48000);
  const hT = 0xb201 >>> 0;
  const hOut = 0xb202 >>> 0;
  if ((add(g, hT, TYPE_TRANSPORT) | 0) !== 0) throw new Error("div add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("div out");
  if ((connect(g, hT, PORT_F, hOut, PORT_MONO) | 0) !== 0) throw new Error("div f→out");
  setParam(g, hT, PARAM_TEMPO, 120);
  setParam(g, hT, PARAM_TIME_NUMERATOR, 1);
  setParam(g, hT, PARAM_TIME_DENOMINATOR, 8);
  setParam(g, hT, PARAM_TIMING_MODE, 0);
  if ((compile(g) | 0) !== 0) throw new Error("div compile");
  snap(g);
  process(g, 128);
  const fVal = view(portPtr(g, hT, PORT_F) | 0, 128)[0];
  if (Math.abs(fVal - 4) > 1e-6) throw new Error(`transport 1/8 f=${fVal} expected 4`);
  console.log(`transport 1/8 ok f=${fVal}`);
}

// --- Mode Sync / Free: BPM change mid-run must not jump the phase. ---
// Gate edges reveal phase: rising = wrap (phase 0), falling = phase crosses
// Pulse Width. Expected next wrap after a change at sample c with phase p:
// c + (1 - p) * sr / fNew.
const PARAM_WIDTH = 31;
const PARAM_MODE = 21; // 0 Free, 1 Sync
function runTransport({ mode, changeAt, bpmA, bpmB, sr = 48000, total }) {
  const g = create() | 0;
  setSr(g, sr);
  const hT = (0xc101 + mode * 16) >>> 0;
  const hOut = (0xc201 + mode * 16) >>> 0;
  if ((add(g, hT, TYPE_TRANSPORT) | 0) !== 0) throw new Error("mode add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("mode out");
  if ((connect(g, hT, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("mode conn");
  setParam(g, hT, PARAM_AMP, 1);
  setParam(g, hT, PARAM_TIME_NUMERATOR, 1);
  setParam(g, hT, PARAM_TIME_DENOMINATOR, 4);
  setParam(g, hT, PARAM_TIMING_MODE, 0);
  setParam(g, hT, PARAM_WIDTH, 0.5);
  setParam(g, hT, PARAM_MODE, mode);
  setParam(g, hT, PARAM_TEMPO, bpmA);
  if ((compile(g) | 0) !== 0) throw new Error("mode compile");
  snap(g);
  const block = 128;
  const gate = [];
  for (let s = 0; s < total; s += block) {
    if (s === changeAt) {
      setParam(g, hT, PARAM_TEMPO, bpmB);
      snap(g);
    }
    process(g, block);
    const v = view(portPtr(g, hT, PORT_MONO) | 0, block);
    for (let i = 0; i < block; i++) gate.push(v[i]);
  }
  return gate;
}
function rises(gate) {
  const out = [];
  for (let i = 1; i < gate.length; i++) if (gate[i] > 0.5 && gate[i - 1] <= 0.5) out.push(i);
  return out;
}
for (const mode of [1, 0]) {
  const name = mode === 1 ? "Sync" : "Free";
  const sr = 48000;
  // 120 BPM 1/4 → 2 Hz (24000 samples/beat). Change to 60 BPM (1 Hz) at
  // sample 30080 (block 235, phase ≈ 0.253): next wrap at 65920, not 48000
  // (the old (master − t0) × f formula jumped the phase to ≈ 0.627).
  const changeAt = 30080;
  const p = changeAt / 24000 - 1;
  const expectNext = Math.round(changeAt + (1 - p) * 48000);
  const gate = runTransport({ mode, changeAt, bpmA: 120, bpmB: 60, sr, total: 128 * 900 });
  const r = rises(gate);
  const after = r.filter((i) => i > changeAt);
  if (!after.length) throw new Error(`${name}: no wrap after BPM change`);
  if (Math.abs(after[0] - expectNext) > 1) {
    throw new Error(`${name}: first wrap after BPM change at ${after[0]}, expected ${expectNext} (phase jumped)`);
  }
  if (after.length > 1 && Math.abs(after[1] - after[0] - 48000) > 1) {
    throw new Error(`${name}: post-change period ${after[1] - after[0]} expected 48000`);
  }
  const before = r.filter((i) => i <= changeAt);
  if (before.length !== 1 || Math.abs(before[0] - 24000) > 1) {
    throw new Error(`${name}: pre-change wraps ${before.join(",")} expected [24000]`);
  }
  console.log(`transport ${name} BPM change ok: next wrap ${after[0]} (expected ${expectNext})`);
}

// Direct native: Reset zeroes the phase in both modes (wrap one period after Reset).
{
  const tcreate = must("soemdsp_transport_create");
  const tdestroy = must("soemdsp_transport_destroy");
  const tsample = must("soemdsp_transport_sample");
  const treset = must("soemdsp_transport_reset");
  const tuni = must("soemdsp_transport_unipolar");
  for (const mode of [1, 0]) {
    const name = mode === 1 ? "Sync" : "Free";
    const h = tcreate() | 0;
    if (h <= 0) throw new Error("transport create");
    const sr = 48000;
    const resetAt = 10000; // phase 10000/24000 at 2 Hz
    let prev = 0;
    const wraps = [];
    for (let s = 0; s < 80000; s++) {
      if (s === resetAt) treset(h, s);
      tsample(h, 1, 1, 4, 0, 120, 0.5, 4, mode, sr, s);
      const u = tuni(h);
      if (s === resetAt && !(u > 0.5)) throw new Error(`${name}: gate not high at Reset (phase not 0)`);
      if (u > 0.5 && prev <= 0.5) wraps.push(s);
      prev = u;
    }
    tdestroy(h);
    const after = wraps.filter((s) => s > resetAt);
    if (Math.abs(after[0] - (resetAt + 24000)) > 1) {
      throw new Error(`${name}: wrap after Reset at ${after[0]} expected ${resetAt + 24000}`);
    }
    console.log(`transport ${name} Reset ok: wraps ${wraps.join(",")}`);
  }
}

// Mode switch Sync → Free mid-beat keeps the phase (no jump).
{
  const tcreate = must("soemdsp_transport_create");
  const tdestroy = must("soemdsp_transport_destroy");
  const tsample = must("soemdsp_transport_sample");
  const tuni = must("soemdsp_transport_unipolar");
  const h = tcreate() | 0;
  let prev = 0;
  const wraps = [];
  for (let s = 0; s < 80000; s++) {
    const mode = s < 30000 ? 1 : 0;
    tsample(h, 1, 1, 4, 0, 120, 0.5, 4, mode, 48000, s);
    const u = tuni(h);
    if (u > 0.5 && prev <= 0.5) wraps.push(s);
    prev = u;
  }
  tdestroy(h);
  const want = [0, 24000, 48000, 72000];
  if (wraps.length !== want.length || wraps.some((s, i) => Math.abs(s - want[i]) > 1)) {
    throw new Error(`Sync→Free switch wraps ${wraps.join(",")} expected ${want.join(",")}`);
  }
  console.log(`transport Sync→Free switch ok: wraps ${wraps.join(",")}`);
}

if ((version() | 0) < 35) throw new Error(`graph version ${version()} expected >= 35`);
console.log(`smoke_graph_transport_batch ok: version=${version() | 0}`);
