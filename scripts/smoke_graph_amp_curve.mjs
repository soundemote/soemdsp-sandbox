// Headless: ampCurve (type 157) — Lin/Exp only (no Amount/Offset).
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
const ampSample = must("soemdsp_amp_curve_sample");
const ampVersion = must("soemdsp_amp_curve_version");

const TYPE_BIAS = 12;
const TYPE_AMP = 157;
const PORT_MONO = 0;
const PARAM_MODE = 21;
const PARAM_ATT_OFFSET = 71;

const ver = version() | 0;
if (ver < 126) throw new Error(`graph version ${ver} < 126 (amp curve)`);
if ((ampVersion() | 0) < 2) throw new Error(`amp_curve version ${ampVersion()} < 2`);

function near(a, b, eps = 1e-5) {
  return Math.abs(a - b) <= eps;
}

// Direct kernel: sample(input, mode)
{
  if (!near(ampSample(0.5, 0), 0.5)) throw new Error("lin mid");
  if (!near(ampSample(1, 0), 1)) throw new Error("lin top");
  if (!near(ampSample(0, 1), 0)) throw new Error("exp mute");
  if (!near(ampSample(1, 1), 1)) throw new Error("exp unity");
  const mid = ampSample(0.5, 1);
  if (!(mid > 0 && mid < 0.5)) throw new Error(`exp mid should be quieter than lin, got ${mid}`);
  console.log(`amp_curve kernel ok linMid=0.5 expMid=${mid.toFixed(6)}`);
}

// Graph: Bias → Amp Curve → read Mono
{
  const g = create() | 0;
  setSr(g, 48000);
  const hBias = 0xac01 >>> 0;
  const hAmp = 0xac02 >>> 0;
  if ((add(g, hBias, TYPE_BIAS) | 0) !== 0) throw new Error("bias add");
  if ((add(g, hAmp, TYPE_AMP) | 0) !== 0) throw new Error("amp add");
  setParam(g, hBias, PARAM_ATT_OFFSET, 0.5); // constant 0.5 (no In)
  setParam(g, hAmp, PARAM_MODE, 1); // Exp
  if ((connect(g, hBias, PORT_MONO, hAmp, PORT_MONO) | 0) !== 0) throw new Error("connect");
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  process(g, 64);
  const ptr = portPtr(g, hAmp, PORT_MONO) | 0;
  const view = new Float64Array(mem.buffer, ptr, 64);
  const y = view[0];
  const expect = ampSample(0.5, 1);
  if (!near(y, expect, 1e-4)) throw new Error(`graph exp mid ${y} != ${expect}`);
  destroy(g);
  console.log(`amp_curve graph ok y=${y.toFixed(6)} version=${ver}`);
}
