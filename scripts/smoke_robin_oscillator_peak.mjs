// Peak/energy smoke for Robin Oscillator (graph type id 74).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

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

const TYPE_ROBIN_OSC = 74;
const TYPE_BIAS = 12;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_INCREMENT = 18;
const PARAM_FREQ = 10;
const PARAM_WAVE = 11;
const PARAM_AMP = 12;
const PARAM_WIDTH = 31;
const PARAM_BIAS_OFFSET = 71;
const SR = 48000;

function run(waveform) {
  const g = create() | 0;
  setSr(g, SR);
  const hOsc = 0xf001 >>> 0;
  const hOut = 0xf002 >>> 0;
  if (add(g, hOsc, TYPE_ROBIN_OSC)) throw new Error("add robinOscillator");
  if (add(g, hOut, TYPE_OUT)) throw new Error("add out");
  connect(g, hOsc, PORT_MONO, hOut, PORT_MONO);
  setParam(g, hOsc, PARAM_FREQ, 220);
  setParam(g, hOsc, PARAM_AMP, 1);
  setParam(g, hOsc, PARAM_WAVE, waveform);
  setParam(g, hOsc, PARAM_WIDTH, 0.5);
  if (compile(g)) throw new Error("compile");
  snap(g);
  let sum = 0;
  let n = 0;
  let peak = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const buf = new Float64Array(mem.buffer, portPtr(g, hOsc, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      peak = Math.max(peak, Math.abs(y));
      sum += y * y;
      n += 1;
    }
  }
  destroy(g);
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}

const saw = run(0);
const sine = run(4);
const pulse = run(5);
console.log({ saw, sine, pulse });
if (!(saw.peak > 0.2 && saw.rms > 0.05)) throw new Error(`saw weak ${JSON.stringify(saw)}`);
if (!(sine.peak > 0.2 && sine.rms > 0.05)) throw new Error(`sine weak ${JSON.stringify(sine)}`);
if (!(pulse.peak > 0.2 && pulse.rms > 0.05)) throw new Error(`pulse weak ${JSON.stringify(pulse)}`);

// Direct export: increment is cycles/sample (Hz / sampleRate). Mid-cycle jump stays finite.
const h = must("soemdsp_robin_oscillator_create")();
if (!h) throw new Error("create failed");
let energy = 0;
for (let i = 0; i < 2048; i++) {
  const hz = i < 1024 ? 55 : 880;
  const y = e.soemdsp_robin_oscillator_sample(h, hz / SR, 1, 0, 0, 0.5, i === 0 ? 1 : 0, 0);
  if (!(y === y)) throw new Error("NaN after mid-cycle warp");
  energy += y * y;
}
e.soemdsp_robin_oscillator_destroy(h);
if (!(energy > 1)) throw new Error(`warp energy too low ${energy}`);

function sawPeriods(samples) {
  const rises = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] - samples[i - 1] > 0.5) rises.push(i);
  }
  const deltas = [];
  for (let i = 1; i < rises.length; i++) deltas.push(rises[i] - rises[i - 1]);
  if (deltas.length < 4) return { n: deltas.length, mean: Infinity, min: 0, max: 0 };
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { n: deltas.length, mean, min: Math.min(...deltas), max: Math.max(...deltas) };
}

function directSaw(inc, n) {
  const handle = e.soemdsp_robin_oscillator_create();
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = e.soemdsp_robin_oscillator_sample(handle, inc, 1, 0, 0, 0.5, 1, i === 0 ? 1 : 0);
  }
  e.soemdsp_robin_oscillator_destroy(handle);
  return out;
}

function graphSaw(freqHz, portInc, n) {
  const g = create() | 0;
  setSr(g, SR);
  const hOsc = 0xf011 >>> 0;
  const hBias = 0xf012 >>> 0;
  const hOut = 0xf013 >>> 0;
  if (add(g, hOsc, TYPE_ROBIN_OSC)) throw new Error("add robin");
  if (add(g, hOut, TYPE_OUT)) throw new Error("add out");
  connect(g, hOsc, PORT_MONO, hOut, PORT_MONO);
  if (portInc !== 0) {
    if (add(g, hBias, TYPE_BIAS)) throw new Error("add bias");
    setParam(g, hBias, PARAM_BIAS_OFFSET, portInc);
    connect(g, hBias, PORT_MONO, hOsc, PORT_INCREMENT);
  }
  setParam(g, hOsc, PARAM_FREQ, freqHz);
  setParam(g, hOsc, PARAM_AMP, 1);
  setParam(g, hOsc, PARAM_WAVE, 0);
  setParam(g, hOsc, PARAM_WIDTH, 0.5);
  if (compile(g)) throw new Error("compile saw");
  snap(g);
  const out = [];
  while (out.length < n) {
    process(g, 128);
    const buf = new Float64Array(mem.buffer, portPtr(g, hOsc, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128 && out.length < n; i++) out.push(buf[i]);
  }
  destroy(g);
  return out;
}

const targetSamples = 100.5;
const inc = 1 / targetSamples;
const N = 8000;
const direct = sawPeriods(directSaw(inc, N));
const frozen = sawPeriods(directSaw(0, 512));
const knobOnly = sawPeriods(graphSaw(SR / targetSamples, 0, N));
const incOnly = sawPeriods(graphSaw(0, inc, N));
const summed = sawPeriods(graphSaw(SR / (targetSamples * 2), inc / 2, N));
console.log({ direct, frozen, knobOnly, incOnly, summed });

if (frozen.n !== 0) throw new Error(`zero increment still wrapped ${JSON.stringify(frozen)}`);
if (!(direct.mean > 90 && direct.mean < 110)) throw new Error(`direct period off ${JSON.stringify(direct)}`);
if (!(direct.max - direct.min >= 1)) throw new Error(`dither did not spread cycle length ${JSON.stringify(direct)}`);
for (const [name, stat] of [["knob", knobOnly], ["inc", incOnly], ["sum", summed]]) {
  if (!(Math.abs(stat.mean - direct.mean) < 1.5)) {
    throw new Error(`${name} period ${stat.mean} != direct ${direct.mean}`);
  }
}

console.log("smoke_robin_oscillator_peak ok");
