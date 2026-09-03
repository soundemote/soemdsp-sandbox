// Headless: sinCos (153) + sineWavetable method LUT path.
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

const TYPE_SIN_COS = 153;
const TYPE_SINE_WT = 40;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13; // method
const PARAM_MODE = 21;

const ver = version() | 0;
if (ver < 109) {
  throw new Error(`graph version ${ver} < 109 (sinCos / method switch not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakPair(typeId, method, mode) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = (0xc401 + typeId + method * 17) >>> 0;
  const hOut = (0xc501 + typeId + method * 17) >>> 0;
  if ((add(g, hOsc, typeId) | 0) !== 0) throw new Error(`add type=${typeId}`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 100);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  setParam(g, hOsc, PARAM_SHAPE, method);
  if (mode != null) setParam(g, hOsc, PARAM_MODE, mode);
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
  destroy(g);
  return { peakSin, peakCos, rms: Math.sqrt(sumSq / n) };
}

function assertOk(label, r) {
  if (!(r.peakSin > 0.5 && r.peakSin <= 1.0001)) {
    throw new Error(`${label} sin peak=${r.peakSin}`);
  }
  if (!(r.peakCos > 0.5 && r.peakCos <= 1.0001)) {
    throw new Error(`${label} cos peak=${r.peakCos}`);
  }
  if (!(r.rms > 0.3 && r.rms < 0.9)) {
    throw new Error(`${label} rms=${r.rms}`);
  }
  console.log(
    `${label} ok sinPeak=${r.peakSin.toFixed(4)} cosPeak=${r.peakCos.toFixed(4)} rms=${r.rms.toFixed(4)}`,
  );
}

assertOk("sinCos poly", peakPair(TYPE_SIN_COS, 0, null));
assertOk("sinCos wavetable", peakPair(TYPE_SIN_COS, 1, null));
assertOk("sineWavetable poly", peakPair(TYPE_SINE_WT, 0, 2));
assertOk("sineWavetable wavetable", peakPair(TYPE_SINE_WT, 1, 2));

console.log(`smoke_graph_sin_cos ok: version=${ver}`);
