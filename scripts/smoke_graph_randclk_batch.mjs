// Headless Batch 8: randomClock + triggerCounter.
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

const TYPE_RC = 31;
const TYPE_TC = 32;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_TRIG = 20;
const PARAM_TIME_NUM = 52;
const PARAM_TIME_DEN = 53;
const PARAM_SHAPE = 13;
const PARAM_OFFSET_MS = 55;
const PARAM_AMP = 12;
const PARAM_SEED = 48;
const PARAM_CENTER = 30;
const PARAM_STAGES = 22;
const PARAM_WIDTH = 31;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// randomClock with short intervals: Trigger and Gate should fire
{
  const g = create() | 0;
  setSr(g, 48000);
  const hRc = 0x7101 >>> 0;
  const hOut = 0x7102 >>> 0;
  if ((add(g, hRc, TYPE_RC) | 0) !== 0) throw new Error("rc add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("rc out");
  if ((connect(g, hRc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("rc conn");
  setParam(g, hRc, PARAM_TIME_NUM, 0.02);
  setParam(g, hRc, PARAM_TIME_DEN, 0.05);
  setParam(g, hRc, PARAM_SHAPE, 0.5);
  setParam(g, hRc, PARAM_OFFSET_MS, 0.005);
  setParam(g, hRc, PARAM_AMP, 1);
  setParam(g, hRc, PARAM_SEED, 42);
  if ((compile(g) | 0) !== 0) throw new Error("rc compile");
  snap(g);
  let trigHigh = 0;
  let gateHigh = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    const trig = view(portPtr(g, hRc, PORT_MONO) | 0, 128);
    const gate = view(portPtr(g, hRc, PORT_LEFT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      if (trig[i] > 0.5) trigHigh += 1;
      if (gate[i] > 0.5) gateHigh += 1;
    }
  }
  if (!(trigHigh > 5)) throw new Error(`randomClock trigger high=${trigHigh}`);
  if (!(gateHigh > 50)) throw new Error(`randomClock gate high=${gateHigh}`);
  console.log(`randomClock ok trig=${trigHigh} gate=${gateHigh}`);
}

// randomClock → triggerCounter countMax=4: Count should rise; Pulse should fire
{
  const g = create() | 0;
  setSr(g, 48000);
  const hRc = 0x7201 >>> 0;
  const hTc = 0x7202 >>> 0;
  const hOut = 0x7203 >>> 0;
  if ((add(g, hRc, TYPE_RC) | 0) !== 0) throw new Error("tc rc");
  if ((add(g, hTc, TYPE_TC) | 0) !== 0) throw new Error("tc add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("tc out");
  if ((connect(g, hRc, PORT_MONO, hTc, PORT_TRIG) | 0) !== 0) throw new Error("tc trig");
  if ((connect(g, hTc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("tc outc");
  setParam(g, hRc, PARAM_TIME_NUM, 0.02);
  setParam(g, hRc, PARAM_TIME_DEN, 0.04);
  setParam(g, hRc, PARAM_OFFSET_MS, 0.005);
  setParam(g, hRc, PARAM_AMP, 1);
  setParam(g, hRc, PARAM_SEED, 7);
  setParam(g, hTc, PARAM_STAGES, 4);
  setParam(g, hTc, PARAM_WIDTH, 1);
  setParam(g, hTc, PARAM_TIME_NUM, 0.005);
  setParam(g, hTc, PARAM_AMP, 1);
  setParam(g, hTc, PARAM_CENTER, 0);
  if ((compile(g) | 0) !== 0) throw new Error("tc compile");
  snap(g);
  let pulseHigh = 0;
  let countPeak = 0;
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    const pul = view(portPtr(g, hTc, PORT_MONO) | 0, 128);
    const cnt = view(portPtr(g, hTc, PORT_LEFT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      if (pul[i] > 0.5) pulseHigh += 1;
      countPeak = Math.max(countPeak, cnt[i]);
    }
  }
  if (!(pulseHigh > 5)) throw new Error(`triggerCounter pulse high=${pulseHigh}`);
  if (!(countPeak > 0.1)) throw new Error(`triggerCounter countPeak=${countPeak}`);
  console.log(`triggerCounter ok pulse=${pulseHigh} countPeak=${countPeak.toFixed(3)}`);
}

if ((version() | 0) < 31) throw new Error(`graph version ${version()} expected >= 31`);
console.log(`smoke_graph_randclk_batch ok: version=${version() | 0}`);
