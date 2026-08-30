// Headless: Wave 8 OMS/Jerobeam + phosphillator audio cores → output.
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

const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_PHASE = 14;
const PARAM_RESONANCE = 20;
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;
const PARAM_LEVEL = 51;
const PARAM_SEED = 48;

const ver = version() | 0;
if (ver < 51) throw new Error(`graph version ${ver} < 51`);
console.log(`graph version ${ver}`);

function peakOf(ptr, n) {
  const x = new Float64Array(mem.buffer, ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

const CORES = [
  { name: "spiral", id: 91, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_SHAPE, 1); setParam(g, h, PARAM_WIDTH, 0.5);
    setParam(g, h, PARAM_RESONANCE, 0.5);
  }},
  { name: "fractalSpiral", id: 92, freq: 32, setup(g, h) {
    setParam(g, h, PARAM_PHASE, 0.05); setParam(g, h, PARAM_WIDTH, 0.5);
    setParam(g, h, PARAM_SHAPE, 1.5); setParam(g, h, PARAM_RESONANCE, 0.5);
    setParam(g, h, PARAM_CENTER, 2); setParam(g, h, PARAM_STAGES, 5);
    setParam(g, h, PARAM_MIX, 0.382);
  }},
  { name: "logSpiral", id: 93, freq: 32, setup(g, h) {
    setParam(g, h, PARAM_PHASE, 0.05); setParam(g, h, PARAM_WIDTH, 0.5);
    setParam(g, h, PARAM_SHAPE, 3); setParam(g, h, PARAM_STAGES, 4);
  }},
  { name: "blubb", id: 94, freq: 55, setup() {} },
  { name: "boing", id: 95, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_SHAPE, 1);
  }},
  { name: "keplerBouwkamp", id: 96, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_CENTER, 3); setParam(g, h, PARAM_STAGES, 1);
    setParam(g, h, PARAM_SHAPE, 0.5);
  }},
  { name: "mushroom", id: 97, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_STAGES, 1); setParam(g, h, PARAM_SHAPE, 3);
    setParam(g, h, PARAM_MIX, 1); setParam(g, h, PARAM_CENTER, 0.67);
    setParam(g, h, PARAM_WIDTH, 0.5); setParam(g, h, PARAM_LEVEL, 1);
  }},
  { name: "nyquistShannon", id: 98, freq: 220, setup(g, h) {
    setParam(g, h, PARAM_SEED, 48); setParam(g, h, PARAM_CENTER, 20);
    setParam(g, h, PARAM_WIDTH, 5);
  }},
  { name: "radar", id: 99, freq: 32, setup(g, h) {
    setParam(g, h, PARAM_SHAPE, 1); setParam(g, h, PARAM_CENTER, 1);
    setParam(g, h, PARAM_WIDTH, 1); setParam(g, h, PARAM_STAGES, 1);
  }},
  { name: "torus", id: 100, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_SHAPE, 1); setParam(g, h, PARAM_WIDTH, 1);
    setParam(g, h, PARAM_RESONANCE, 0.5);
  }},
  { name: "wirdoSpiral", id: 101, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_SHAPE, 0.8); setParam(g, h, PARAM_WIDTH, 1);
    setParam(g, h, PARAM_STAGES, 1000); setParam(g, h, PARAM_FEEDBACK, 1);
  }},
  { name: "phosphillator", id: 102, freq: 55, setup(g, h) {
    setParam(g, h, PARAM_SHAPE, 0.5); setParam(g, h, PARAM_PHASE, 0);
  }},
];

const PARAM_FEEDBACK = 50;

let base = 0x9100;
for (const core of CORES) {
  const g = create() | 0;
  setSr(g, 48000);
  const h = (base + 1) >>> 0;
  const hOut = (base + 2) >>> 0;
  base += 0x10;
  if ((add(g, h, core.id) | 0) !== 0) throw new Error(`${core.name}: add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${core.name}: out`);
  if ((connect(g, h, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error(`${core.name}: conn`);
  }
  setParam(g, h, PARAM_FREQUENCY, core.freq);
  setParam(g, h, PARAM_AMPLITUDE, 1);
  core.setup(g, h);
  if ((compile(g) | 0) !== 0) throw new Error(`${core.name}: compile`);
  snap(g);
  let peak = 0;
  let yPeak = 0;
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    peak = Math.max(peak, peakOf(portPtr(g, h, PORT_MONO) | 0, 128));
    yPeak = Math.max(yPeak, peakOf(portPtr(g, h, PORT_LEFT) | 0, 128));
  }
  if (!(peak > 0.01 && peak < 8)) throw new Error(`${core.name} peak=${peak}`);
  console.log(`${core.name} ok peak=${peak.toFixed(4)} yPeak=${yPeak.toFixed(4)}`);
  destroy(g);
}

console.log("oms smoke ok");
