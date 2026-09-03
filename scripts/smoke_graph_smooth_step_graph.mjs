// Headless: smoothGraph (146) + stepGraph (147) LFO ramp → non-silent Out.
// Does not require efficient allowlist — exercises native graph opcodes only.
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
const nodeHandle = must("soemdsp_graph_node_native_handle");
const version = must("soemdsp_graph_version");

const TYPE_SMOOTH = 146;
const TYPE_STEP = 147;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10; // rate
const PARAM_WAVEFORM = 11; // step segmentShape
const PARAM_SHAPE = 13; // smooth tension
const PARAM_PHASE = 14;
const PARAM_MODE = 21;
const PARAM_STAGES = 22; // smooth smoothingMode
const PARAM_CENTER = 30; // step curveOffset
const PARAM_IN_LOW = 80;
const PARAM_IN_HIGH = 81;
const PARAM_OUT_LOW = 82;
const PARAM_OUT_HIGH = 83;

const ver = version() | 0;
if (ver < 104) {
  throw new Error(`graph version ${ver} < 104 (smooth/step graph not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(g, hNode) {
  let peak = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hNode, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

function uploadRamp(setPoints, xPtrFn, yPtrFn, handle, cPtrFn = null, shapePtrFn = null) {
  const xPtr = xPtrFn(handle) | 0;
  const yPtr = yPtrFn(handle) | 0;
  if (!(xPtr > 0) || !(yPtr > 0)) throw new Error("points ptr missing");
  new Float32Array(mem.buffer, xPtr, 2).set([0, 1]);
  new Float32Array(mem.buffer, yPtr, 2).set([0, 1]);
  if (cPtrFn && shapePtrFn) {
    const cPtr = cPtrFn(handle) | 0;
    const sPtr = shapePtrFn(handle) | 0;
    if (cPtr > 0) new Float32Array(mem.buffer, cPtr, 2).set([0, 0]);
    if (sPtr > 0) new Float32Array(mem.buffer, sPtr, 2).set([0, 0]);
  }
  if ((setPoints(handle, 2) | 0) !== 1) throw new Error("set_points failed");
}

function smokeOne(typeId, label) {
  const g = create() | 0;
  setSr(g, 48000);
  const hGraph = (0xaa00 + typeId) >>> 0;
  const hOut = (0xbb00 + typeId) >>> 0;
  if ((add(g, hGraph, typeId) | 0) !== 0) throw new Error(`${label} add`);
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error(`${label} out add`);
  if ((connect(g, hGraph, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error(`${label} connect`);
  }

  // LFO mode, 2 Hz ramp 0→1 over out range.
  setParam(g, hGraph, PARAM_MODE, 1);
  setParam(g, hGraph, PARAM_FREQUENCY, 2);
  setParam(g, hGraph, PARAM_PHASE, 0);
  setParam(g, hGraph, PARAM_IN_LOW, 0);
  setParam(g, hGraph, PARAM_IN_HIGH, 1);
  setParam(g, hGraph, PARAM_OUT_LOW, 0);
  setParam(g, hGraph, PARAM_OUT_HIGH, 1);
  if (typeId === TYPE_SMOOTH) {
    setParam(g, hGraph, PARAM_STAGES, 0); // linear
    setParam(g, hGraph, PARAM_SHAPE, 1);
  } else {
    setParam(g, hGraph, PARAM_WAVEFORM, 0); // linear segments
    setParam(g, hGraph, PARAM_CENTER, 0);
  }

  if ((compile(g) | 0) !== 0) throw new Error(`${label} compile`);
  snap(g);

  const handle = nodeHandle(g, hGraph) | 0;
  if (!(handle > 0)) throw new Error(`${label} native handle`);

  if (typeId === TYPE_SMOOTH) {
    uploadRamp(
      must("soemdsp_smooth_graph_set_points"),
      must("soemdsp_smooth_graph_points_x_ptr"),
      must("soemdsp_smooth_graph_points_y_ptr"),
      handle,
    );
  } else {
    uploadRamp(
      must("soemdsp_step_graph_set_points"),
      must("soemdsp_step_graph_points_x_ptr"),
      must("soemdsp_step_graph_points_y_ptr"),
      handle,
      must("soemdsp_step_graph_points_c_ptr"),
      must("soemdsp_step_graph_points_shape_ptr"),
    );
  }

  const peak = peakOf(g, hGraph);
  destroy(g);
  if (!(peak > 1e-4) || !(peak < 2.0)) {
    throw new Error(`${label} peak ${peak} out of range`);
  }
  return peak;
}

const smoothPeak = smokeOne(TYPE_SMOOTH, "smoothGraph");
const stepPeak = smokeOne(TYPE_STEP, "stepGraph");
console.log(
  `ok smoothGraph type=${TYPE_SMOOTH} peak=${smoothPeak.toFixed(4)} `
  + `stepGraph type=${TYPE_STEP} peak=${stepPeak.toFixed(4)} version=${ver}`,
);
