// Headless: polyBlep → delayEffect / soemReverb / pll → output.
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
const TYPE_DELAY = 75;
const TYPE_SOEM_REVERB = 76;
const TYPE_PLL = 77;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;

const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_RESONANCE = 20;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_MIX = 40;
const PARAM_DIFFUSION_SIZE = 41;
const PARAM_DIFFUSION_AMOUNT = 42;
const PARAM_DELAY_SIZE = 43;
const PARAM_RECYCLE = 44;
const PARAM_LFO_AMP = 45;
const PARAM_LFO_BASE = 46;
const PARAM_LFO_VAR = 47;
const PARAM_SEED = 48;
const PARAM_FEEDBACK = 50;
const PARAM_LEVEL = 51;
const PARAM_TIME_NUM = 52;
const PARAM_TIMING_MODE = 54;
const PARAM_OFFSET_MS = 55;
const PARAM_LFO_STYLE = 56;
const PARAM_LFO_RATE = 57;
const PARAM_SATURATE = 58;
const PARAM_LPF = 59;
const PARAM_HPF = 60;
const PARAM_ATT_OFFSET = 71;
const PARAM_GAIN_DB = 90;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

const ver = version() | 0;
if (ver < 47) throw new Error(`graph version ${ver} < 47`);
console.log(`graph version ${ver}`);

function measure(g, hNode, port, quants = 60) {
  let peak = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < quants; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hNode, port) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      const a = Math.abs(y);
      if (a > peak) peak = a;
      sumSq += y * y;
      n += 1;
    }
  }
  return { peak, rms: Math.sqrt(sumSq / n) };
}

// delayEffect
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xf101 >>> 0;
  const hFx = 0xf102 >>> 0;
  const hOut = 0xf103 >>> 0;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("delay osc");
  if ((add(g, hFx, TYPE_DELAY) | 0) !== 0) throw new Error("delay add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("delay out");
  if ((connect(g, hOsc, PORT_MONO, hFx, PORT_MONO) | 0) !== 0) throw new Error("delay conn1");
  if ((connect(g, hFx, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("delay conn2");
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hFx, PARAM_TIME_NUM, 0.12);
  setParam(g, hFx, PARAM_FEEDBACK, 0.4);
  setParam(g, hFx, PARAM_MIX, 0.5);
  setParam(g, hFx, PARAM_LEVEL, 1);
  setParam(g, hFx, PARAM_LFO_AMP, 0.02);
  setParam(g, hFx, PARAM_LFO_RATE, 0.5);
  setParam(g, hFx, PARAM_LFO_VAR, 0);
  if ((compile(g) | 0) !== 0) throw new Error("delay compile");
  snap(g);
  const { peak, rms } = measure(g, hFx, PORT_MONO);
  if (!(peak > 0.05 && peak < 4)) throw new Error(`delayEffect peak=${peak}`);
  if (!(rms > 0.005)) throw new Error(`delayEffect rms=${rms}`);
  console.log(`delayEffect ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

// soemReverb (max 1 instance)
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xf201 >>> 0;
  const hFx = 0xf202 >>> 0;
  const hOut = 0xf203 >>> 0;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("reverb osc");
  if ((add(g, hFx, TYPE_SOEM_REVERB) | 0) !== 0) throw new Error("reverb add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("reverb out");
  if ((connect(g, hOsc, PORT_MONO, hFx, PORT_MONO) | 0) !== 0) throw new Error("reverb conn1");
  if ((connect(g, hFx, PORT_LEFT, hOut, PORT_MONO) | 0) !== 0) throw new Error("reverb conn2");
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.6);
  setParam(g, hFx, PARAM_MIX, 0.6);
  setParam(g, hFx, PARAM_AMPLITUDE, 1);
  setParam(g, hFx, PARAM_DELAY_SIZE, 0.25);
  setParam(g, hFx, PARAM_RECYCLE, 0.5);
  setParam(g, hFx, PARAM_STAGES, 8);
  setParam(g, hFx, PARAM_DIFFUSION_SIZE, 0.35);
  setParam(g, hFx, PARAM_DIFFUSION_AMOUNT, 0.7);
  setParam(g, hFx, PARAM_SEED, 500);
  setParam(g, hFx, PARAM_LFO_AMP, 0.002);
  setParam(g, hFx, PARAM_LFO_BASE, 0.5);
  setParam(g, hFx, PARAM_LFO_VAR, 1);
  setParam(g, hFx, PARAM_LFO_STYLE, 0);
  setParam(g, hFx, PARAM_MODE, 0);
  setParam(g, hFx, PARAM_TIMING_MODE, 0);
  setParam(g, hFx, PARAM_WAVEFORM, 1);
  setParam(g, hFx, PARAM_SATURATE, 1);
  setParam(g, hFx, PARAM_LPF, 8000);
  setParam(g, hFx, PARAM_HPF, 20);
  setParam(g, hFx, PARAM_FREQUENCY, 1000);
  setParam(g, hFx, PARAM_GAIN_DB, 0);
  setParam(g, hFx, PARAM_RESONANCE, 1);
  setParam(g, hFx, PARAM_WIDTH, 2);
  setParam(g, hFx, PARAM_CENTER, 2);
  setParam(g, hFx, PARAM_FEEDBACK, 1);
  setParam(g, hFx, PARAM_OFFSET_MS, 0.04);
  if ((compile(g) | 0) !== 0) throw new Error("reverb compile");
  snap(g);
  const { peak, rms } = measure(g, hFx, PORT_LEFT, 80);
  if (!(peak > 0.02 && peak < 8)) throw new Error(`soemReverb peak=${peak}`);
  if (!(rms > 0.001)) throw new Error(`soemReverb rms=${rms}`);
  console.log(`soemReverb ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

// pll tracking a saw
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xf301 >>> 0;
  const hPll = 0xf302 >>> 0;
  const hOut = 0xf303 >>> 0;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("pll osc");
  if ((add(g, hPll, TYPE_PLL) | 0) !== 0) throw new Error("pll add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("pll out");
  if ((connect(g, hOsc, PORT_MONO, hPll, PORT_MONO) | 0) !== 0) throw new Error("pll conn1");
  if ((connect(g, hPll, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("pll conn2");
  setParam(g, hOsc, PARAM_FREQUENCY, 110);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hPll, PARAM_MODE, 1); // Mid
  setParam(g, hPll, PARAM_ATT_OFFSET, 5);
  setParam(g, hPll, PARAM_STAGES, 1); // RS Flip
  setParam(g, hPll, PARAM_FREQUENCY, 20);
  if ((compile(g) | 0) !== 0) throw new Error("pll compile");
  snap(g);
  const { peak, rms } = measure(g, hPll, PORT_MONO, 80);
  if (!(peak > 0.1 && peak < 2)) throw new Error(`pll peak=${peak}`);
  if (!(rms > 0.01)) throw new Error(`pll rms=${rms}`);
  console.log(`pll ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

console.log("delay/fx smoke ok");
