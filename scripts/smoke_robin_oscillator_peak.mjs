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
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 10;
const PARAM_WAVE = 11;
const PARAM_AMP = 12;
const PARAM_WIDTH = 31;

function run(waveform) {
  const g = create() | 0;
  setSr(g, 48000);
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

// Direct export mid-cycle warp: change Hz mid-block, expect continuous energy (no NaN).
const h = must("soemdsp_robin_oscillator_create")();
if (!h) throw new Error("create failed");
let energy = 0;
for (let i = 0; i < 2048; i++) {
  const hz = i < 1024 ? 55 : 880;
  const y = e.soemdsp_robin_oscillator_sample(h, hz, 1, 48000, 0, 0, 0.5, i === 0 ? 1 : 0);
  if (!(y === y)) throw new Error("NaN after mid-cycle warp");
  energy += y * y;
}
e.soemdsp_robin_oscillator_destroy(h);
if (!(energy > 1)) throw new Error(`warp energy too low ${energy}`);

console.log("smoke_robin_oscillator_peak ok");
