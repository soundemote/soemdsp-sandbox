// Headless: Wave 7 noise/modulator cores → output.
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
const TYPE_CLOCK = 28;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_TRIGGER = 20;

const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;
const PARAM_SEED = 48;
const PARAM_TIME_NUM = 52;
const PARAM_TIME_DEN = 53;
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;

const ver = version() | 0;
if (ver < 50) throw new Error(`graph version ${ver} < 50`);
console.log(`graph version ${ver}`);

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function stats(ptr, n) {
  const x = view(ptr, n);
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    sumSq += x[i] * x[i];
  }
  return { peak, rms: Math.sqrt(sumSq / n) };
}

function runSource(name, typeId, setup, opts = {}) {
  const g = create() | 0;
  setSr(g, 48000);
  const h = 0x8700 + typeId;
  const hOut = h + 1;
  if ((add(g, h, typeId) | 0) !== 0) throw new Error(`${name} add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${name} out`);
  if ((connect(g, h, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error(`${name} conn`);
  setup(g, h);
  if ((compile(g) | 0) !== 0) throw new Error(`${name} compile`);
  snap(g);
  let peak = 0;
  let sumSq = 0;
  let n = 0;
  let yPeak = 0;
  for (let q = 0; q < (opts.blocks || 80); q++) {
    process(g, 128);
    const s = stats(portPtr(g, h, PORT_MONO) | 0, 128);
    peak = Math.max(peak, s.peak);
    sumSq += s.rms * s.rms * 128;
    n += 128;
    yPeak = Math.max(yPeak, stats(portPtr(g, h, PORT_LEFT) | 0, 128).peak);
  }
  const rms = Math.sqrt(sumSq / n);
  const minPeak = opts.minPeak ?? 0.01;
  const maxPeak = opts.maxPeak ?? 4;
  if (!(peak > minPeak && peak < maxPeak)) throw new Error(`${name} peak=${peak}`);
  if (!(rms > (opts.minRms ?? 0.001))) throw new Error(`${name} rms=${rms}`);
  console.log(`${name} ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)} yPeak=${yPeak.toFixed(4)}`);
  destroy(g);
}

runSource("fractalBrownianNoise", 87, (g, h) => {
  setParam(g, h, PARAM_FREQUENCY, 8);
  setParam(g, h, PARAM_STAGES, 4);
  setParam(g, h, PARAM_SHAPE, 0.5);
  setParam(g, h, PARAM_CENTER, 1);
  setParam(g, h, PARAM_SEED, 1);
  setParam(g, h, PARAM_AMPLITUDE, 1);
});

runSource("piSpigotNoise", 88, (g, h) => {
  setParam(g, h, PARAM_CENTER, 0);
  setParam(g, h, PARAM_STAGES, 1);
  setParam(g, h, PARAM_MODE, 0);
  setParam(g, h, PARAM_SHAPE, 0);
  setParam(g, h, PARAM_AMPLITUDE, 1);
}, { blocks: 200, minPeak: 0.05 });

runSource("randomWalk", 89, (g, h) => {
  setParam(g, h, PARAM_MODE, 3);
  setParam(g, h, PARAM_FREQUENCY, 32);
  setParam(g, h, PARAM_WIDTH, 8);
  setParam(g, h, PARAM_SEED, 7);
  setParam(g, h, PARAM_AMPLITUDE, 1);
});

// pulseExplosion needs a trigger clock
{
  const g = create() | 0;
  setSr(g, 48000);
  const h = 0x90a1;
  const hClk = 0x90a2;
  const hOut = 0x90a3;
  if ((add(g, h, 90) | 0) !== 0) throw new Error("pulseExplosion add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("pulseExplosion clock");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("pulseExplosion out");
  setParam(g, hClk, PARAM_FREQUENCY, 2);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, h, PARAM_TIME_NUM, 0);
  setParam(g, h, PARAM_CENTER, 0.05);
  setParam(g, h, PARAM_TIME_DEN, 0.2);
  setParam(g, h, PARAM_MIX, 0.5);
  setParam(g, h, PARAM_STAGES, 16);
  setParam(g, h, PARAM_IN_LOW, 0.5);
  setParam(g, h, PARAM_IN_HIGH, 1);
  setParam(g, h, PARAM_SEED, 42);
  if ((connect(g, hClk, PORT_MONO, h, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("pulseExplosion trig");
  }
  if ((connect(g, h, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("pulseExplosion out");
  }
  if ((compile(g) | 0) !== 0) throw new Error("pulseExplosion compile");
  snap(g);
  let peak = 0;
  let curvePeak = 0;
  for (let q = 0; q < 400; q++) {
    process(g, 128);
    peak = Math.max(peak, stats(portPtr(g, h, PORT_MONO) | 0, 128).peak);
    curvePeak = Math.max(curvePeak, stats(portPtr(g, h, PORT_LEFT) | 0, 128).peak);
  }
  if (!(peak > 0.4)) throw new Error(`pulseExplosion peak=${peak}`);
  if (!(curvePeak > 0.01)) throw new Error(`pulseExplosion curve=${curvePeak}`);
  console.log(`pulseExplosion ok peak=${peak.toFixed(4)} curvePeak=${curvePeak.toFixed(4)}`);
  destroy(g);
}

console.log("noise smoke ok");
