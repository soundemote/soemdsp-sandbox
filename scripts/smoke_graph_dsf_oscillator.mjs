// Headless: dsfOscillator → output (440 Hz saw).
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

const TYPE_DSF = 46;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13; // morph

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xc601 >>> 0;
  const hOut = 0xc602 >>> 0;
  if ((add(g, hOsc, TYPE_DSF) | 0) !== 0) throw new Error("dsfOscillator add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 440);
  setParam(g, hOsc, PARAM_WAVEFORM, 1); // saw
  setParam(g, hOsc, PARAM_SHAPE, 1);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let peak = 0;
  let sumSq = 0;
  let n = 0;
  // DSF leaky integrators need settle time.
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hOsc, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      const a = Math.abs(y);
      if (a > peak) peak = a;
      sumSq += y * y;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peak > 0.05 && peak <= 1.6)) throw new Error(`dsfOscillator peak=${peak}`);
  if (!(rms > 0.01)) throw new Error(`dsfOscillator rms=${rms}`);
  console.log(`dsfOscillator ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
}

if ((version() | 0) < 41) throw new Error(`graph version ${version()} expected >= 41`);
console.log(`smoke_graph_dsf_oscillator ok: version=${version() | 0}`);
