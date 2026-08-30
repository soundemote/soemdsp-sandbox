// Headless Batch 9: metallicRatio + lutCell.
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

const TYPE_METAL = 33;
const TYPE_LUT = 34;
const TYPE_BIAS = 12;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_SAW = 3;
const PORT_TRIG = 20;
const PARAM_WIDTH = 31;
const PARAM_SEED = 48;
const PARAM_OFFSET = 71;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// metallicRatio index=1 → golden ≈ 1.618
{
  const g = create() | 0;
  setSr(g, 48000);
  const hM = 0x8101 >>> 0;
  const hOut = 0x8102 >>> 0;
  if ((add(g, hM, TYPE_METAL) | 0) !== 0) throw new Error("metal add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("metal out");
  if ((connect(g, hM, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("metal conn");
  setParam(g, hM, PARAM_WIDTH, 1);
  if ((compile(g) | 0) !== 0) throw new Error("metal compile");
  snap(g);
  process(g, 128);
  const r = view(portPtr(g, hM, PORT_MONO) | 0, 128)[0];
  const golden = 0.5 * (1 + Math.sqrt(5));
  if (Math.abs(r - golden) > 1e-6) throw new Error(`metallicRatio=${r} expected ${golden}`);
  console.log(`metallicRatio ok ratio=${r.toFixed(6)}`);
}

// lutCell: truthTable=1 → only A=0,B=0,C=0,D=0 yields 1; Clock latches Q
{
  const g = create() | 0;
  setSr(g, 48000);
  const hA = 0x8201 >>> 0;
  const hClk = 0x8202 >>> 0;
  const hLut = 0x8203 >>> 0;
  const hOut = 0x8204 >>> 0;
  if ((add(g, hA, TYPE_BIAS) | 0) !== 0) throw new Error("lut biasA");
  if ((add(g, hClk, TYPE_BIAS) | 0) !== 0) throw new Error("lut biasClk");
  if ((add(g, hLut, TYPE_LUT) | 0) !== 0) throw new Error("lut add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("lut out");
  // A on Mono; Clock on Trigger dest
  if ((connect(g, hA, PORT_MONO, hLut, PORT_MONO) | 0) !== 0) throw new Error("lut A");
  if ((connect(g, hClk, PORT_MONO, hLut, PORT_TRIG) | 0) !== 0) throw new Error("lut clk");
  if ((connect(g, hLut, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("lut outc");
  setParam(g, hA, PARAM_OFFSET, 0); // A low
  setParam(g, hClk, PARAM_OFFSET, 0);
  setParam(g, hLut, PARAM_SEED, 1); // bit0 = 1 for index 0
  if ((compile(g) | 0) !== 0) throw new Error("lut compile");
  snap(g);
  process(g, 128);
  let out0 = view(portPtr(g, hLut, PORT_MONO) | 0, 128)[0];
  let q0 = view(portPtr(g, hLut, PORT_LEFT) | 0, 128)[0];
  if (out0 !== 1) throw new Error(`lut Out before clock=${out0}`);
  if (q0 !== 0) throw new Error(`lut Q before clock=${q0}`);

  // Rising clock edge
  setParam(g, hClk, PARAM_OFFSET, 1);
  snap(g);
  process(g, 128);
  out0 = view(portPtr(g, hLut, PORT_MONO) | 0, 128)[0];
  q0 = view(portPtr(g, hLut, PORT_LEFT) | 0, 128)[0];
  if (out0 !== 1) throw new Error(`lut Out after clock=${out0}`);
  if (q0 !== 1) throw new Error(`lut Q after clock=${q0}`);
  console.log("lutCell ok Out=1 Q latched");
}

if ((version() | 0) < 32) throw new Error(`graph version ${version()} expected >= 32`);
console.log(`smoke_graph_metal_lut_batch ok: version=${version() | 0}`);
