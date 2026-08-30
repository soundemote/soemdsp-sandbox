// Headless: clock/noise → Wave 3 envelopes → output.
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

const TYPE_CLOCK = 28;
const TYPE_NOISE = 14;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_TRIGGER = 20;

const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;
const PARAM_DIFFUSION_SIZE = 41;
const PARAM_DIFFUSION_AMOUNT = 42;
const PARAM_DELAY_SIZE = 43;
const PARAM_RECYCLE = 44;
const PARAM_FEEDBACK = 50;
const PARAM_LEVEL = 51;
const PARAM_TIME_NUM = 52;
const PARAM_TIME_DEN = 53;
const PARAM_MODE = 21;
const PARAM_OFFSET_MS = 55;
const PARAM_ATT_OFFSET = 71;

const ENVELOPES = [
  {
    name: "expAdsr",
    typeId: 70,
    drive: "clock",
    setup(g, h) {
      setParam(g, h, PARAM_TIME_NUM, 0);
      setParam(g, h, PARAM_TIME_DEN, 0.01);
      setParam(g, h, PARAM_FEEDBACK, 0.05);
      setParam(g, h, PARAM_MIX, 0.6);
      setParam(g, h, PARAM_OFFSET_MS, 0.08);
      setParam(g, h, PARAM_SHAPE, 0.3);
      setParam(g, h, PARAM_CENTER, 0.0001);
      setParam(g, h, PARAM_MODE, 1); // loop
      setParam(g, h, PARAM_LEVEL, 1);
    },
    peakMax: 1.2,
  },
  {
    name: "linearEnvelope",
    typeId: 71,
    drive: "clock",
    setup(g, h) {
      setParam(g, h, PARAM_TIME_NUM, 0);
      setParam(g, h, PARAM_TIME_DEN, 0.01);
      setParam(g, h, PARAM_FEEDBACK, 0.05);
      setParam(g, h, PARAM_MIX, 0.6);
      setParam(g, h, PARAM_OFFSET_MS, 0.08);
      setParam(g, h, PARAM_MODE, 1);
      setParam(g, h, PARAM_LEVEL, 1);
    },
    peakMax: 1.2,
  },
  {
    name: "pluckEnvelope",
    typeId: 72,
    drive: "pluck",
    setup(g, h) {
      setParam(g, h, PARAM_TIME_NUM, 0);
      setParam(g, h, PARAM_TIME_DEN, 0.002);
      setParam(g, h, PARAM_FEEDBACK, 0.35);
      setParam(g, h, PARAM_DIFFUSION_SIZE, 0.08);
      setParam(g, h, PARAM_DIFFUSION_AMOUNT, 0.55);
      setParam(g, h, PARAM_DELAY_SIZE, 0.8);
      setParam(g, h, PARAM_SHAPE, 0);
      setParam(g, h, PARAM_FREQUENCY, 1.5);
      setParam(g, h, PARAM_OFFSET_MS, 0.08);
      setParam(g, h, PARAM_RECYCLE, 0.35);
      setParam(g, h, PARAM_WIDTH, 1);
      setParam(g, h, PARAM_CENTER, 0);
      setParam(g, h, PARAM_LEVEL, 1);
    },
    peakMax: 1.5,
  },
  {
    name: "flowerChildEnvelopeFollower",
    typeId: 73,
    drive: "noise",
    setup(g, h) {
      setParam(g, h, PARAM_TIME_NUM, 0.001);
      setParam(g, h, PARAM_TIME_DEN, 0.001);
      setParam(g, h, PARAM_FEEDBACK, 0.05);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
    peakMax: 1.2,
  },
  {
    name: "vactrolEnvelope",
    typeId: 74,
    drive: "noise",
    setup(g, h) {
      setParam(g, h, PARAM_TIME_NUM, 0.0025);
      setParam(g, h, PARAM_TIME_DEN, 0.035);
      setParam(g, h, PARAM_SHAPE, 1);
      setParam(g, h, PARAM_WIDTH, 1);
      setParam(g, h, PARAM_CENTER, 0);
      setParam(g, h, PARAM_MIX, 0);
      setParam(g, h, PARAM_AMPLITUDE, 1);
    },
    peakMax: 1.2,
  },
];

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

const ver = version() | 0;
if (ver < 46) throw new Error(`graph version ${ver} < 46`);
console.log(`graph version ${ver}`);

let base = 0xee00;
for (const env of ENVELOPES) {
  const g = create() | 0;
  setSr(g, 48000);
  const hSrc = (base + 1) >>> 0;
  const hEnv = (base + 2) >>> 0;
  const hOut = (base + 3) >>> 0;
  base += 0x10;

  if (env.drive === "clock" || env.drive === "pluck") {
    if ((add(g, hSrc, TYPE_CLOCK) | 0) !== 0) throw new Error(`${env.name}: clock add`);
  } else {
    if ((add(g, hSrc, TYPE_NOISE) | 0) !== 0) throw new Error(`${env.name}: noise add`);
  }
  if ((add(g, hEnv, env.typeId) | 0) !== 0) throw new Error(`${env.name}: env add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${env.name}: out add`);

  if (env.drive === "pluck") {
    // Clock Pulse/T → Right; map as Trigger dest.
    if ((connect(g, hSrc, PORT_RIGHT, hEnv, PORT_TRIGGER) | 0) !== 0) {
      throw new Error(`${env.name}: clock→trigger`);
    }
  } else if (env.drive === "clock") {
    // Digital Out → Mono Gate.
    if ((connect(g, hSrc, PORT_MONO, hEnv, PORT_MONO) | 0) !== 0) {
      throw new Error(`${env.name}: clock→gate`);
    }
  } else {
    if ((connect(g, hSrc, PORT_MONO, hEnv, PORT_MONO) | 0) !== 0) {
      throw new Error(`${env.name}: noise→in`);
    }
  }
  if ((connect(g, hEnv, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error(`${env.name}: env→out`);
  }

  if (env.drive === "clock" || env.drive === "pluck") {
    setParam(g, hSrc, PARAM_FREQUENCY, 8); // Hz
    setParam(g, hSrc, PARAM_AMPLITUDE, 1);
  } else {
    setParam(g, hSrc, PARAM_MODE, 0);
    setParam(g, hSrc, PARAM_AMPLITUDE, 1);
    setParam(g, hSrc, PARAM_ATT_OFFSET, 0.5); // mean so light stays up
    setParam(g, hSrc, PARAM_WIDTH, 0.5);
  }
  env.setup(g, hEnv);
  if ((compile(g) | 0) !== 0) throw new Error(`${env.name}: compile`);
  snap(g);

  let peak = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hEnv, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      const a = Math.abs(y);
      if (a > peak) peak = a;
      sumSq += y * y;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peak > 0.02 && peak <= env.peakMax)) {
    throw new Error(`${env.name} peak=${peak}`);
  }
  if (!(rms > 0.0005)) throw new Error(`${env.name} rms=${rms}`);
  console.log(`${env.name} ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

console.log("envelopes smoke ok");
