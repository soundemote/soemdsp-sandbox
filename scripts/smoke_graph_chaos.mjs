// Headless: Wave 5 chaos CV cores → output.
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
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;
const PARAM_DIFFUSION_SIZE = 41;
const PARAM_DIFFUSION_AMOUNT = 42;
const PARAM_FEEDBACK = 50;
const PARAM_LEVEL = 51;
const PARAM_TIME_NUM = 52;
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;
const PARAM_OUT_LOW = 82;
const PARAM_OUT_HIGH = 83;

const CORES = [
  {
    name: "lorenzAttractor",
    typeId: 78,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 8);
      setParam(g, h, PARAM_SHAPE, 10);
      setParam(g, h, PARAM_RESONANCE, 28);
      setParam(g, h, PARAM_WIDTH, 2.6667);
      setParam(g, h, PARAM_PHASE, 0);
      setParam(g, h, PARAM_CENTER, 1);
      setParam(g, h, PARAM_MIX, 0.4);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
  },
  {
    name: "logisticMap",
    typeId: 79,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 64);
      setParam(g, h, PARAM_SHAPE, 3.9);
      setParam(g, h, PARAM_CENTER, 0.5);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
  },
  {
    name: "henonMap",
    typeId: 80,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 64);
      setParam(g, h, PARAM_SHAPE, 1.4);
      setParam(g, h, PARAM_WIDTH, 0.3);
      setParam(g, h, PARAM_CENTER, 0.1);
      setParam(g, h, PARAM_MIX, 0.1);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
  },
  {
    name: "chuaAttractor",
    typeId: 81,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 4);
      setParam(g, h, PARAM_SHAPE, 15.6);
      setParam(g, h, PARAM_WIDTH, 28);
      setParam(g, h, PARAM_CENTER, -1.143);
      setParam(g, h, PARAM_MIX, -0.714);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
  },
  {
    name: "rayBouncer",
    typeId: 82,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 32);
      setParam(g, h, PARAM_PHASE, 30);
      setParam(g, h, PARAM_IN_LOW, 0);
      setParam(g, h, PARAM_IN_HIGH, 0);
      setParam(g, h, PARAM_WIDTH, 1);
      setParam(g, h, PARAM_CENTER, 1.5);
      setParam(g, h, PARAM_MIX, 0);
      setParam(g, h, PARAM_OUT_LOW, 0);
      setParam(g, h, PARAM_OUT_HIGH, 0);
      setParam(g, h, PARAM_TIME_NUM, 0);
      setParam(g, h, PARAM_FEEDBACK, 0);
      setParam(g, h, PARAM_DIFFUSION_SIZE, 0);
      setParam(g, h, PARAM_DIFFUSION_AMOUNT, 0);
      setParam(g, h, PARAM_LEVEL, 1);
    },
  },
];

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

const ver = version() | 0;
if (ver < 48) throw new Error(`graph version ${ver} < 48`);
console.log(`graph version ${ver}`);

let base = 0xab00;
for (const core of CORES) {
  const g = create() | 0;
  setSr(g, 48000);
  const hCore = (base + 1) >>> 0;
  const hOut = (base + 2) >>> 0;
  base += 0x10;
  if ((add(g, hCore, core.typeId) | 0) !== 0) throw new Error(`${core.name}: add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${core.name}: out`);
  if ((connect(g, hCore, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error(`${core.name}: conn`);
  }
  core.setup(g, hCore);
  if ((compile(g) | 0) !== 0) throw new Error(`${core.name}: compile`);
  snap(g);

  let peak = 0;
  let sumSq = 0;
  let n = 0;
  let leftPeak = 0;
  for (let q = 0; q < 100; q++) {
    process(g, 128);
    const x = view(portPtr(g, hCore, PORT_MONO) | 0, 128);
    const y = view(portPtr(g, hCore, PORT_LEFT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
      sumSq += x[i] * x[i];
      n += 1;
      leftPeak = Math.max(leftPeak, Math.abs(y[i]));
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peak > 0.01 && peak < 4)) throw new Error(`${core.name} peak=${peak}`);
  if (!(rms > 0.001)) throw new Error(`${core.name} rms=${rms}`);
  console.log(
    `${core.name} ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)} yPeak=${leftPeak.toFixed(4)}`,
  );
  destroy(g);
}

console.log("chaos smoke ok");
