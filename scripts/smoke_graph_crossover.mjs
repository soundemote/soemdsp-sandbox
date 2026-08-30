// Headless: polyBlep → crossover2..6 → sum low+high → output.
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
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_LPF = 59;
const PARAM_HPF = 60;

const ver = version() | 0;
if (ver < 52) throw new Error(`graph version ${ver} < 52`);
console.log(`graph version ${ver}`);

function peakOf(ptr, n) {
  const x = new Float64Array(mem.buffer, ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

const CASES = [
  { name: "crossover2", id: 103, bands: 2, freqs: [1000] },
  { name: "crossover3", id: 104, bands: 3, freqs: [300, 3000] },
  { name: "crossover4", id: 105, bands: 4, freqs: [200, 1000, 5000] },
  { name: "crossover5", id: 106, bands: 5, freqs: [150, 500, 2000, 8000] },
  { name: "crossover6", id: 107, bands: 6, freqs: [100, 300, 1000, 3000, 10000] },
];

let base = 0xdd00;
for (const c of CASES) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = (base + 1) >>> 0;
  const hXo = (base + 2) >>> 0;
  const hOut = (base + 3) >>> 0;
  base += 0x10;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error(`${c.name}: osc add`);
  if ((add(g, hXo, c.id) | 0) !== 0) throw new Error(`${c.name}: xo add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${c.name}: out add`);
  if ((connect(g, hOsc, PORT_MONO, hXo, PORT_MONO) | 0) !== 0) {
    throw new Error(`${c.name}: osc→xo`);
  }
  // Sum all band L taps into output mono (ports 0,2,4,…).
  for (let b = 0; b < c.bands; b++) {
    if ((connect(g, hXo, b * 2, hOut, PORT_MONO) | 0) !== 0) {
      throw new Error(`${c.name}: band${b}L→out`);
    }
  }
  setParam(g, hOsc, PARAM_FREQUENCY, 440);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hXo, PARAM_STAGES, 4);
  setParam(g, hXo, PARAM_AMPLITUDE, 1);
  const paramIds = [PARAM_FREQUENCY, PARAM_CENTER, PARAM_WIDTH, PARAM_LPF, PARAM_HPF];
  for (let i = 0; i < c.freqs.length; i++) {
    setParam(g, hXo, paramIds[i], c.freqs[i]);
  }
  if ((compile(g) | 0) !== 0) throw new Error(`${c.name}: compile`);
  snap(g);

  let peakSum = 0;
  let peakLow = 0;
  let peakHigh = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    peakSum = Math.max(peakSum, peakOf(portPtr(g, hOut, PORT_MONO) | 0, 128));
    peakLow = Math.max(peakLow, peakOf(portPtr(g, hXo, 0) | 0, 128));
    peakHigh = Math.max(
      peakHigh,
      peakOf(portPtr(g, hXo, (c.bands - 1) * 2) | 0, 128),
    );
  }
  if (!(peakSum > 0.05 && peakSum <= 4.0)) {
    throw new Error(`${c.name} sum peak=${peakSum}`);
  }
  if (!(peakLow > 0.001 || peakHigh > 0.001)) {
    throw new Error(`${c.name} silent bands low=${peakLow} high=${peakHigh}`);
  }
  console.log(
    `${c.name} ok sum=${peakSum.toFixed(4)} lowL=${peakLow.toFixed(4)} highL=${peakHigh.toFixed(4)}`,
  );
  destroy(g);
}

console.log(`smoke_graph_crossover ok: version=${ver}`);
