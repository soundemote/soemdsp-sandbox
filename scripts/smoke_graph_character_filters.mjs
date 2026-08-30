// Headless: polyBlep → Wave 2 character / utility filters → output.
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
const PARAM_SHAPE = 13;
const PARAM_RESONANCE = 20;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_WIDTH = 31;
const PARAM_TIME_NUM = 52;
const PARAM_TIMING_MODE = 54;
const PARAM_LPF = 59;
const PARAM_HPF = 60;
const PARAM_GAIN_DB = 90;

const FILTERS = [
  {
    name: "eqFilter",
    typeId: 57,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 2000);
      setParam(g, h, PARAM_MODE, 2); // LP12
      setParam(g, h, PARAM_RESONANCE, 0.707);
      setParam(g, h, PARAM_GAIN_DB, 0);
    },
    peakMax: 2.0,
  },
  {
    name: "activeFilter",
    typeId: 58,
    setup(g, h) {
      setParam(g, h, PARAM_MODE, 3); // LP24
      setParam(g, h, PARAM_LPF, 2000);
      setParam(g, h, PARAM_HPF, 200);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_STAGES, 3);
      setParam(g, h, PARAM_TIMING_MODE, 1);
    },
    peakMax: 2.0,
  },
  {
    name: "passiveFilter",
    typeId: 59,
    setup(g, h) {
      setParam(g, h, PARAM_MODE, 0); // LP
      setParam(g, h, PARAM_HPF, 200);
      setParam(g, h, PARAM_LPF, 2000);
    },
    peakMax: 2.0,
  },
  {
    name: "tb303Filter",
    typeId: 60,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 2000);
      setParam(g, h, PARAM_MODE, 4); // LP24
      setParam(g, h, PARAM_RESONANCE, 20);
      setParam(g, h, PARAM_GAIN_DB, 0);
    },
    peakMax: 8.0,
  },
  {
    name: "flowerChildFilter",
    typeId: 61,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 0.5);
      setParam(g, h, PARAM_MODE, 0);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_SHAPE, 0);
    },
    peakMax: 8.0,
    oscAmp: 0.35,
  },
  {
    name: "yellowjacketFilter",
    typeId: 62,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 0.5);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_SHAPE, 0);
    },
    peakMax: 16.0,
    oscAmp: 0.25,
  },
  {
    name: "superloveFilter",
    typeId: 63,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 0.5);
      setParam(g, h, PARAM_MODE, 0);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_SHAPE, 0.5);
    },
    peakMax: 8.0,
    oscAmp: 0.35,
  },
  {
    name: "humanFilter",
    typeId: 64,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 0.5);
      setParam(g, h, PARAM_MODE, 0);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_SHAPE, 0);
    },
    peakMax: 8.0,
    oscAmp: 0.35,
  },
  {
    name: "resonatorFilter",
    typeId: 65,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 0.5);
      setParam(g, h, PARAM_MODE, 0);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_SHAPE, 0);
    },
    peakMax: 8.0,
    oscAmp: 0.35,
  },
  {
    name: "combResonator",
    typeId: 66,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 220);
      setParam(g, h, PARAM_TIME_NUM, 0.5);
      setParam(g, h, PARAM_TIMING_MODE, 0);
      setParam(g, h, PARAM_SHAPE, 0);
      setParam(g, h, PARAM_MODE, 0);
      setParam(g, h, PARAM_STAGES, 0);
      setParam(g, h, PARAM_WIDTH, 1);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
    peakMax: 2.0,
    oscAmp: 0.5,
  },
  {
    name: "modeResonator",
    typeId: 67,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 440);
      setParam(g, h, PARAM_TIME_NUM, 0.25);
      setParam(g, h, PARAM_TIMING_MODE, 0);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
    peakMax: 2.0,
    oscAmp: 0.5,
  },
  {
    name: "chaoticPhaseLockingFilter",
    typeId: 68,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 0.5);
      setParam(g, h, PARAM_RESONANCE, 0.2);
      setParam(g, h, PARAM_SHAPE, 1);
    },
    peakMax: 8.0,
    oscAmp: 0.35,
  },
  {
    name: "inertialFilter",
    typeId: 69,
    setup(g, h) {
      setParam(g, h, PARAM_FREQUENCY, 20000);
      setParam(g, h, PARAM_LPF, 20000);
    },
    peakMax: 2.0,
  },
];

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

let base = 0xdd00;
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
  setParam(g, hOsc, PARAM_AMPLITUDE, filt.oscAmp ?? 0.8);
  filt.setup(g, hFilt);
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
  if (!(peak > 0.02 && peak <= filt.peakMax)) {
    throw new Error(`${filt.name} peak=${peak}`);
  }
  if (!(rms > 0.001)) throw new Error(`${filt.name} rms=${rms}`);
  console.log(`${filt.name} ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

if ((version() | 0) < 45) throw new Error(`graph version ${version()} expected >= 45`);
console.log(`smoke_graph_character_filters ok: version=${version() | 0}`);
