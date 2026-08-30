// Headless: sineWavetable → output (100 Hz, mode=sincos, amp=1).
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

const TYPE_SINE_WT = 40;
const TYPE_OUT = 6;
const PORT_MONO = 0; // A = sin
const PORT_LEFT = 1; // B = cos
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_MODE = 21;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xb401 >>> 0;
  const hOut = 0xb402 >>> 0;
  if ((add(g, hOsc, TYPE_SINE_WT) | 0) !== 0) throw new Error("sineWavetable add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 100);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  setParam(g, hOsc, PARAM_MODE, 2); // sincos
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let peakSin = 0;
  let peakCos = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const sinBuf = view(portPtr(g, hOsc, PORT_MONO) | 0, 128);
    const cosBuf = view(portPtr(g, hOsc, PORT_LEFT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const s = sinBuf[i];
      const c = cosBuf[i];
      if (Math.abs(s) > peakSin) peakSin = Math.abs(s);
      if (Math.abs(c) > peakCos) peakCos = Math.abs(c);
      sumSq += s * s;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peakSin > 0.5 && peakSin <= 1.0001)) throw new Error(`sineWavetable sin peak=${peakSin}`);
  if (!(peakCos > 0.5 && peakCos <= 1.0001)) throw new Error(`sineWavetable cos peak=${peakCos}`);
  if (!(rms > 0.3 && rms < 0.9)) throw new Error(`sineWavetable rms=${rms}`);
  console.log(`sineWavetable ok sinPeak=${peakSin.toFixed(4)} cosPeak=${peakCos.toFixed(4)} rms=${rms.toFixed(4)}`);
}

if ((version() | 0) < 40) throw new Error(`graph version ${version()} expected >= 40`);
console.log(`smoke_graph_sine_wavetable ok: version=${version() | 0}`);
