// Headless: hypersaw → output (stereo Left tap, 440 Hz).
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

const TYPE_HYPERSAW = 47;
const TYPE_OUT = 6;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_STAGES = 22; // voices

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xc701 >>> 0;
  const hOut = 0xc702 >>> 0;
  if ((add(g, hOsc, TYPE_HYPERSAW) | 0) !== 0) throw new Error("hypersaw add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_LEFT, hOut, PORT_LEFT) | 0) !== 0) throw new Error("conn L");
  if ((connect(g, hOsc, PORT_RIGHT, hOut, PORT_RIGHT) | 0) !== 0) throw new Error("conn R");
  setParam(g, hOsc, PARAM_FREQUENCY, 440);
  setParam(g, hOsc, PARAM_STAGES, 8);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.35);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let peakL = 0;
  let peakR = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const left = view(portPtr(g, hOsc, PORT_LEFT) | 0, 128);
    const right = view(portPtr(g, hOsc, PORT_RIGHT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const L = left[i];
      const R = right[i];
      if (Math.abs(L) > peakL) peakL = Math.abs(L);
      if (Math.abs(R) > peakR) peakR = Math.abs(R);
      sumSq += L * L;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peakL > 0.05 && peakL <= 1.6)) throw new Error(`hypersaw peakL=${peakL}`);
  if (!(peakR > 0.05 && peakR <= 1.6)) throw new Error(`hypersaw peakR=${peakR}`);
  if (!(rms > 0.01)) throw new Error(`hypersaw rms=${rms}`);
  console.log(`hypersaw ok peakL=${peakL.toFixed(4)} peakR=${peakR.toFixed(4)} rms=${rms.toFixed(4)}`);
}

if ((version() | 0) < 41) throw new Error(`graph version ${version()} expected >= 41`);
console.log(`smoke_graph_hypersaw ok: version=${version() | 0}`);
