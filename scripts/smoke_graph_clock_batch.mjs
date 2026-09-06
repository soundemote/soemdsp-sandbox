// Headless Batch 7: clock + triggerDivider + delayedTrigger.
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

const TYPE_CLOCK = 28;
const TYPE_DIV = 29;
const TYPE_DELAY = 30;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PARAM_FREQ = 10;
const PARAM_SHAPE = 13;
const PARAM_AMP = 12;
const PARAM_STAGES = 22;
const PARAM_TIME_NUM = 52;
const PARAM_TIME_DEN = 53;
const PARAM_CENTER = 30;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// clock @ 100 Hz: Digital should pulse, Pulse ticks should fire
{
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0x6101 >>> 0;
  const hOut = 0x6102 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("clock out");
  if ((connect(g, hClk, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("clock conn");
  setParam(g, hClk, PARAM_FREQ, 100);
  setParam(g, hClk, PARAM_SHAPE, 0.5);
  setParam(g, hClk, PARAM_AMP, 1);
  if ((compile(g) | 0) !== 0) throw new Error("clock compile");
  snap(g);
  let digHigh = 0;
  let pulseHits = 0;
  let analogPeak = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const dig = view(portPtr(g, hClk, PORT_MONO) | 0, 128);
    const ana = view(portPtr(g, hClk, PORT_LEFT) | 0, 128);
    const pul = view(portPtr(g, hClk, PORT_RIGHT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      if (dig[i] > 0.5) digHigh += 1;
      if (pul[i] > 0.5) pulseHits += 1;
      analogPeak = Math.max(analogPeak, Math.abs(ana[i]));
    }
  }
  if (!(digHigh > 100)) throw new Error(`clock digital high samples=${digHigh}`);
  if (!(pulseHits > 5)) throw new Error(`clock pulse hits=${pulseHits}`);
  if (!(analogPeak > 0.1)) throw new Error(`clock analog peak=${analogPeak}`);
  console.log(`clock ok digHigh=${digHigh} pulses=${pulseHits} ana=${analogPeak.toFixed(3)}`);
}

// clock → triggerDivider /2: fewer output pulses than clock pulses
{
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0x6201 >>> 0;
  const hDiv = 0x6202 >>> 0;
  const hOut = 0x6203 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("div clock");
  if ((add(g, hDiv, TYPE_DIV) | 0) !== 0) throw new Error("div add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("div out");
  // Clock Pulse (Right) → Trigger dest on divider
  if ((connect(g, hClk, PORT_RIGHT, hDiv, 20) | 0) !== 0) throw new Error("div trig");
  if ((connect(g, hDiv, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("div outc");
  setParam(g, hClk, PARAM_FREQ, 50);
  setParam(g, hClk, PARAM_AMP, 1);
  setParam(g, hDiv, PARAM_STAGES, 2);
  setParam(g, hDiv, PARAM_TIME_NUM, 0.005);
  setParam(g, hDiv, PARAM_AMP, 1);
  setParam(g, hDiv, PARAM_CENTER, 0);
  if ((compile(g) | 0) !== 0) throw new Error("div compile");
  snap(g);
  let clockPulses = 0;
  let divPulses = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    const pul = view(portPtr(g, hClk, PORT_RIGHT) | 0, 128);
    const out = view(portPtr(g, hDiv, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      if (pul[i] > 0.5) clockPulses += 1;
      if (out[i] > 0.5) divPulses += 1;
    }
  }
  // ~50 Hz over ~0.21 s ≈ 10 single-sample clock pulses.
  if (!(clockPulses > 5)) throw new Error(`div clockPulses=${clockPulses}`);
  // Divided output is held for pulseTime, so sample-high count >> rising edges.
  if (!(divPulses > 5)) {
    throw new Error(`div out high=${divPulses} clockPulses=${clockPulses}`);
  }
  console.log(`triggerDivider ok clockPulses=${clockPulses} divHigh=${divPulses}`);
}

// clock → clockDivider /2 (timingMode=1): duty×measured period pulse
{
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0x6211 >>> 0;
  const hDiv = 0x6212 >>> 0;
  const hOut = 0x6213 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("cdiv clock");
  if ((add(g, hDiv, TYPE_DIV) | 0) !== 0) throw new Error("cdiv add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("cdiv out");
  // Clock Pulse (Right) → Clock dest (Trigger port) on divider
  if ((connect(g, hClk, PORT_RIGHT, hDiv, 20) | 0) !== 0) throw new Error("cdiv trig");
  if ((connect(g, hDiv, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("cdiv outc");
  setParam(g, hClk, PARAM_FREQ, 50);
  setParam(g, hClk, PARAM_AMP, 1);
  setParam(g, hDiv, PARAM_STAGES, 2);
  setParam(g, hDiv, PARAM_SHAPE, 0.5); // duty
  setParam(g, hDiv, PARAM_AMP, 1);
  setParam(g, hDiv, PARAM_CENTER, 0);
  setParam(g, hDiv, 54, 1); // PARAM_TIMING_MODE → clockDivider path
  if ((compile(g) | 0) !== 0) throw new Error("cdiv compile");
  snap(g);
  let clockPulses = 0;
  let divPulses = 0;
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    const pul = view(portPtr(g, hClk, PORT_RIGHT) | 0, 128);
    const out = view(portPtr(g, hDiv, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      if (pul[i] > 0.5) clockPulses += 1;
      if (out[i] > 0.5) divPulses += 1;
    }
  }
  if (!(clockPulses > 5)) throw new Error(`cdiv clockPulses=${clockPulses}`);
  // duty 0.5 × division 2 × ~20 ms period → ~20 ms pulses every 2 edges
  if (!(divPulses > 50)) {
    throw new Error(`cdiv out high=${divPulses} clockPulses=${clockPulses}`);
  }
  console.log(`clockDivider ok clockPulses=${clockPulses} divHigh=${divPulses}`);
}

// delayedTrigger: fire from clock pulse with short delay
{
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0x6301 >>> 0;
  const hDel = 0x6302 >>> 0;
  const hOut = 0x6303 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("del clock");
  if ((add(g, hDel, TYPE_DELAY) | 0) !== 0) throw new Error("del add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("del out");
  if ((connect(g, hClk, PORT_RIGHT, hDel, 20) | 0) !== 0) throw new Error("del trig");
  if ((connect(g, hDel, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("del outc");
  setParam(g, hClk, PARAM_FREQ, 20);
  setParam(g, hClk, PARAM_AMP, 1);
  setParam(g, hDel, PARAM_TIME_NUM, 0.01); // delay
  setParam(g, hDel, PARAM_TIME_DEN, 0.005); // pulse
  setParam(g, hDel, PARAM_AMP, 1);
  setParam(g, hDel, PARAM_CENTER, 0);
  if ((compile(g) | 0) !== 0) throw new Error("del compile");
  snap(g);
  let outHigh = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    const out = view(portPtr(g, hDel, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) if (out[i] > 0.5) outHigh += 1;
  }
  if (!(outHigh > 5)) throw new Error(`delayedTrigger high=${outHigh}`);
  console.log(`delayedTrigger ok high=${outHigh}`);
}

if ((version() | 0) < 30) throw new Error(`graph version ${version()} expected >= 30`);
console.log(`smoke_graph_clock_batch ok: version=${version() | 0}`);
