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

// 120 BPM, Numer/Denom 1/4 Normal → f = 2 Hz; bipolar/unipolar toggle; Trigger edges
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
  let uniHigh = 0;
  let biPos = 0;
  let biNeg = 0;
  let fVal = 0;
  // ~1.07 s at 48 kHz → a few edges at 2 Hz.
  for (let q = 0; q < 400; q++) {
    process(g, 128);
    const bi = view(portPtr(g, hT, PORT_MONO) | 0, 128);
    const uni = view(portPtr(g, hT, PORT_LEFT) | 0, 128);
    const trig = view(portPtr(g, hT, PORT_RIGHT) | 0, 128);
    const freq = view(portPtr(g, hT, PORT_F) | 0, 128);
    fVal = freq[0];
    for (let i = 0; i < 128; i++) {
      if (trig[i] > 0.5) trigHits += 1;
      if (uni[i] > 0.5) uniHigh += 1;
      if (bi[i] > 0.5) biPos += 1;
      if (bi[i] < -0.5) biNeg += 1;
    }
  }
  if (Math.abs(fVal - 2) > 1e-6) throw new Error(`transport f=${fVal} expected 2 Hz @ 120 BPM 1/4`);
  if (!(trigHits >= 2)) throw new Error(`transport Trigger hits=${trigHits}`);
  if (!(uniHigh > 100 && biPos > 100 && biNeg > 100)) {
    throw new Error(`transport wave uni=${uniHigh} bi+=${biPos} bi-=${biNeg}`);
  }
  console.log(`transport ok f=${fVal} trig=${trigHits} uniHigh=${uniHigh}`);
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

if ((version() | 0) < 35) throw new Error(`graph version ${version()} expected >= 35`);
console.log(`smoke_graph_transport_batch ok: version=${version() | 0}`);
