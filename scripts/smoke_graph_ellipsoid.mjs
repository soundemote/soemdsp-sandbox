// Headless: ellipsoid RoundShape → Bi X (sine at shape=0).
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

const TYPE_ELLIPSOID = 50;
const TYPE_OUT = 6;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xca01 >>> 0;
  const hOut = 0xca02 >>> 0;
  if ((add(g, hOsc, TYPE_ELLIPSOID) | 0) !== 0) throw new Error("ellipsoid add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_LEFT, hOut, PORT_LEFT) | 0) !== 0) throw new Error("conn L");
  if ((connect(g, hOsc, PORT_RIGHT, hOut, PORT_RIGHT) | 0) !== 0) throw new Error("conn R");
  setParam(g, hOsc, PARAM_FREQUENCY, 110);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  setParam(g, hOsc, PARAM_SHAPE, 0);
  setParam(g, hOsc, PARAM_MODE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let peakX = 0;
  let peakY = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const left = view(portPtr(g, hOsc, PORT_LEFT) | 0, 128);
    const right = view(portPtr(g, hOsc, PORT_RIGHT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const X = left[i];
      const Y = right[i];
      if (Math.abs(X) > peakX) peakX = Math.abs(X);
      if (Math.abs(Y) > peakY) peakY = Math.abs(Y);
      sumSq += X * X;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peakX > 0.5 && peakX <= 1.0001)) throw new Error(`ellipsoid peakX=${peakX}`);
  if (!(peakY > 0.5 && peakY <= 1.0001)) throw new Error(`ellipsoid peakY=${peakY}`);
  if (!(rms > 0.2)) throw new Error(`ellipsoid rms=${rms}`);
  console.log(`ellipsoid ok peakX=${peakX.toFixed(4)} peakY=${peakY.toFixed(4)} rms=${rms.toFixed(4)}`);
}

if ((version() | 0) < 42) throw new Error(`graph version ${version()} expected >= 42`);
console.log(`smoke_graph_ellipsoid ok: version=${version() | 0}`);
