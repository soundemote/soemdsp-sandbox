// Headless: polyBlep → each classical IIR (LP) → output.
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
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_RESONANCE = 20;
const PARAM_WIDTH = 31;

const FILTERS = [
  { name: "butterworth", typeId: 52 },
  { name: "linkwitzRiley", typeId: 53 },
  { name: "bessel", typeId: 54 },
  { name: "chebyshev", typeId: 55, ripple: true },
  { name: "elliptic", typeId: 56, ripple: true },
];

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

let base = 0xcc00;
for (const filt of FILTERS) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = (base + 1) >>> 0;
  const hFilt = (base + 2) >>> 0;
  const hOut = (base + 3) >>> 0;
  base += 0x10;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error(`${filt.name}: osc add`);
  if ((add(g, hFilt, filt.typeId) | 0) !== 0) throw new Error(`${filt.name}: filt add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${filt.name}: out add`);
  if ((connect(g, hOsc, PORT_MONO, hFilt, PORT_MONO) | 0) !== 0) {
    throw new Error(`${filt.name}: osc→filt`);
  }
  if ((connect(g, hFilt, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error(`${filt.name}: filt→out`);
  }
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hFilt, PARAM_FREQUENCY, 2000);
  setParam(g, hFilt, PARAM_MODE, 0); // LP
  setParam(g, hFilt, PARAM_STAGES, 4);
  setParam(g, hFilt, PARAM_WIDTH, 1);
  if (filt.ripple) setParam(g, hFilt, PARAM_RESONANCE, 1);
  if ((compile(g) | 0) !== 0) throw new Error(`${filt.name}: compile`);
  snap(g);

  let peak = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hFilt, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      const a = Math.abs(y);
      if (a > peak) peak = a;
      sumSq += y * y;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peak > 0.1 && peak <= 2.0)) throw new Error(`${filt.name} peak=${peak}`);
  if (!(rms > 0.02)) throw new Error(`${filt.name} rms=${rms}`);
  console.log(`${filt.name} ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

if ((version() | 0) < 43) throw new Error(`graph version ${version()} expected >= 43`);
console.log(`smoke_graph_scientific_filters ok: version=${version() | 0}`);
