// Headless Batch 6: midSideEncode + vectorscopeTransform + rotate3dTo2d.
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

const TYPE_BIAS = 12;
const TYPE_MS = 25;
const TYPE_VEC = 26;
const TYPE_ROT = 27;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PARAM_OFFSET = 71;
const PARAM_GAIN_DB = 90;
const PARAM_GAIN_LEFT_DB = 91;
const PARAM_LANE_BIAS1 = 104;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// midSideEncode: L=0.8 R=0.2 → Mid=0.5 Side=0.3 at 0 dB
{
  const g = create() | 0;
  setSr(g, 48000);
  const hL = 0x5101 >>> 0;
  const hR = 0x5102 >>> 0;
  const hMs = 0x5103 >>> 0;
  const hOut = 0x5104 >>> 0;
  if ((add(g, hL, TYPE_BIAS) | 0) !== 0) throw new Error("ms biasL");
  if ((add(g, hR, TYPE_BIAS) | 0) !== 0) throw new Error("ms biasR");
  if ((add(g, hMs, TYPE_MS) | 0) !== 0) throw new Error("ms add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("ms out");
  if ((connect(g, hL, PORT_MONO, hMs, PORT_LEFT) | 0) !== 0) throw new Error("ms L");
  if ((connect(g, hR, PORT_MONO, hMs, PORT_RIGHT) | 0) !== 0) throw new Error("ms R");
  if ((connect(g, hMs, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("ms mid→out");
  setParam(g, hL, PARAM_OFFSET, 0.8);
  setParam(g, hR, PARAM_OFFSET, 0.2);
  setParam(g, hMs, PARAM_GAIN_DB, 0);
  setParam(g, hMs, PARAM_GAIN_LEFT_DB, 0);
  if ((compile(g) | 0) !== 0) throw new Error("ms compile");
  snap(g);
  process(g, 128);
  process(g, 128);
  const mid = view(portPtr(g, hMs, PORT_MONO) | 0, 128)[0];
  const side = view(portPtr(g, hMs, PORT_LEFT) | 0, 128)[0];
  if (Math.abs(mid - 0.5) > 1e-6) throw new Error(`mid=${mid} expected 0.5`);
  if (Math.abs(side - 0.3) > 1e-6) throw new Error(`side=${side} expected 0.3`);
  console.log("midSideEncode ok");
}

// vectorscope: L=R=1 → X≈0 Y≈√2 at rotate 0
{
  const g = create() | 0;
  setSr(g, 48000);
  const hL = 0x5201 >>> 0;
  const hR = 0x5202 >>> 0;
  const hV = 0x5203 >>> 0;
  const hOut = 0x5204 >>> 0;
  if ((add(g, hL, TYPE_BIAS) | 0) !== 0) throw new Error("vec biasL");
  if ((add(g, hR, TYPE_BIAS) | 0) !== 0) throw new Error("vec biasR");
  if ((add(g, hV, TYPE_VEC) | 0) !== 0) throw new Error("vec add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("vec out");
  if ((connect(g, hL, PORT_MONO, hV, PORT_LEFT) | 0) !== 0) throw new Error("vec L");
  if ((connect(g, hR, PORT_MONO, hV, PORT_RIGHT) | 0) !== 0) throw new Error("vec R");
  if ((connect(g, hV, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("vec X→out");
  setParam(g, hL, PARAM_OFFSET, 1);
  setParam(g, hR, PARAM_OFFSET, 1);
  setParam(g, hV, PARAM_LANE_BIAS1, 0);
  if ((compile(g) | 0) !== 0) throw new Error("vec compile");
  snap(g);
  process(g, 128);
  process(g, 128);
  const x = view(portPtr(g, hV, PORT_MONO) | 0, 128)[0];
  const y = view(portPtr(g, hV, PORT_LEFT) | 0, 128)[0];
  if (Math.abs(x) > 1e-6) throw new Error(`vec X=${x} expected ~0`);
  if (Math.abs(y - Math.SQRT2) > 1e-4) throw new Error(`vec Y=${y} expected √2`);
  console.log("vectorscopeTransform ok");
}

// rotate3d: identity angles, X=0.5 Y=0.25 Z=0 → out X=0.5 Y=0.25
{
  const g = create() | 0;
  setSr(g, 48000);
  const hX = 0x5301 >>> 0;
  const hY = 0x5302 >>> 0;
  const hRot = 0x5303 >>> 0;
  const hOut = 0x5304 >>> 0;
  if ((add(g, hX, TYPE_BIAS) | 0) !== 0) throw new Error("rot biasX");
  if ((add(g, hY, TYPE_BIAS) | 0) !== 0) throw new Error("rot biasY");
  if ((add(g, hRot, TYPE_ROT) | 0) !== 0) throw new Error("rot add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("rot out");
  if ((connect(g, hX, PORT_MONO, hRot, PORT_MONO) | 0) !== 0) throw new Error("rot X");
  if ((connect(g, hY, PORT_MONO, hRot, PORT_LEFT) | 0) !== 0) throw new Error("rot Y");
  if ((connect(g, hRot, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("rot outX");
  setParam(g, hX, PARAM_OFFSET, 0.5);
  setParam(g, hY, PARAM_OFFSET, 0.25);
  if ((compile(g) | 0) !== 0) throw new Error("rot compile");
  snap(g);
  process(g, 128);
  process(g, 128);
  const ox = view(portPtr(g, hRot, PORT_MONO) | 0, 128)[0];
  const oy = view(portPtr(g, hRot, PORT_LEFT) | 0, 128)[0];
  if (Math.abs(ox - 0.5) > 1e-4) throw new Error(`rot X=${ox}`);
  if (Math.abs(oy - 0.25) > 1e-4) throw new Error(`rot Y=${oy}`);
  console.log("rotate3dTo2d ok");
}

if ((version() | 0) < 29) throw new Error(`graph version ${version()} expected >= 29`);
console.log(`smoke_graph_spatial_batch ok: version=${version() | 0}`);
