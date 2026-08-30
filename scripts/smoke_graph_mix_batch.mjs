// Headless Batch 4: minMax + mix + mixStereo through graph_engine.
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

const TYPE_POLY = 1;
const TYPE_BIAS = 12;
const TYPE_MINMAX = 21;
const TYPE_MIX = 22;
const TYPE_MIXSTEREO = 23;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_IN4 = 3;
const PARAM_ATT_OFFSET = 71;
const PARAM_LANE_VOL1 = 100;
const PARAM_VOLUME_DB = 0;

function view(ptr, frames) {
  return new Float64Array(mem.buffer, ptr, frames);
}

// --- minMax: two biases (0.2 and 0.8) → Max≈0.8 Min≈0.2 ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hA = 0x1001 >>> 0;
  const hB = 0x1002 >>> 0;
  const hM = 0x1003 >>> 0;
  const hO = 0x1004 >>> 0;
  if ((add(g, hA, TYPE_BIAS) | 0) !== 0) throw new Error("minmax add biasA");
  if ((add(g, hB, TYPE_BIAS) | 0) !== 0) throw new Error("minmax add biasB");
  if ((add(g, hM, TYPE_MINMAX) | 0) !== 0) throw new Error("minmax add");
  if ((add(g, hO, TYPE_OUT) | 0) !== 0) throw new Error("minmax add out");
  // No audio into bias → out = offset only. Cable bias→minMax In1/In2.
  if ((connect(g, hA, PORT_MONO, hM, PORT_MONO) | 0) !== 0) throw new Error("conn A");
  if ((connect(g, hB, PORT_MONO, hM, PORT_LEFT) | 0) !== 0) throw new Error("conn B");
  if ((connect(g, hM, PORT_MONO, hO, PORT_MONO) | 0) !== 0) throw new Error("conn max→out");
  setParam(g, hA, PARAM_ATT_OFFSET, 0.2);
  setParam(g, hB, PARAM_ATT_OFFSET, 0.8);
  if ((compile(g) | 0) !== 0) throw new Error("minmax compile");
  snap(g);
  process(g, 128);
  process(g, 128);
  const maxV = view(portPtr(g, hM, PORT_MONO) | 0, 128);
  const minV = view(portPtr(g, hM, PORT_LEFT) | 0, 128);
  if (Math.abs(maxV[0] - 0.8) > 1e-6) throw new Error(`minMax Max=${maxV[0]} expected 0.8`);
  if (Math.abs(minV[0] - 0.2) > 1e-6) throw new Error(`minMax Min=${minV[0]} expected 0.2`);
  console.log("minMax ok");
}

// --- mix: poly → In1, Out1 to output; volume1=0.5 ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x2001 >>> 0;
  const hMix = 0x2002 >>> 0;
  const hOut = 0x2003 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("mix add osc");
  if ((add(g, hMix, TYPE_MIX) | 0) !== 0) throw new Error("mix add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("mix add out");
  if ((connect(g, hOsc, PORT_MONO, hMix, PORT_MONO) | 0) !== 0) throw new Error("mix conn in");
  if ((connect(g, hMix, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("mix conn out");
  setParam(g, hOsc, 10, 440);
  setParam(g, hOsc, 12, 1);
  setParam(g, hMix, PARAM_LANE_VOL1, 0.5);
  if ((compile(g) | 0) !== 0) throw new Error("mix compile");
  snap(g);
  let peak = 0;
  for (let q = 0; q < 20; q++) {
    process(g, 128);
    const o = view(portPtr(g, hMix, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(o[i]));
  }
  if (!(peak > 0.2 && peak < 0.7)) throw new Error(`mix Out1 peak=${peak} expected ~0.5`);
  console.log(`mix ok peak=${peak.toFixed(3)}`);
}

// --- mixStereo: mono in + amplitude 0 → unity to L/R ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0x3001 >>> 0;
  const hMs = 0x3002 >>> 0;
  const hOut = 0x3003 >>> 0;
  if ((add(g, hOsc, TYPE_POLY) | 0) !== 0) throw new Error("ms add osc");
  if ((add(g, hMs, TYPE_MIXSTEREO) | 0) !== 0) throw new Error("ms add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("ms add out");
  if ((connect(g, hOsc, PORT_MONO, hMs, PORT_MONO) | 0) !== 0) throw new Error("ms conn");
  if ((connect(g, hMs, PORT_LEFT, hOut, PORT_LEFT) | 0) !== 0) throw new Error("ms L");
  if ((connect(g, hMs, PORT_RIGHT, hOut, PORT_RIGHT) | 0) !== 0) throw new Error("ms R");
  setParam(g, hOsc, 10, 220);
  setParam(g, hOsc, 12, 1);
  setParam(g, hMs, PARAM_VOLUME_DB, 0); // Amplitude (All)
  if ((compile(g) | 0) !== 0) throw new Error("ms compile");
  snap(g);
  let peakL = 0;
  let peakR = 0;
  for (let q = 0; q < 20; q++) {
    process(g, 128);
    const l = view(portPtr(g, hMs, PORT_LEFT) | 0, 128);
    const r = view(portPtr(g, hMs, PORT_RIGHT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      peakL = Math.max(peakL, Math.abs(l[i]));
      peakR = Math.max(peakR, Math.abs(r[i]));
    }
  }
  if (!(peakL > 0.5 && peakR > 0.5)) throw new Error(`mixStereo peaks L=${peakL} R=${peakR}`);
  console.log(`mixStereo ok L=${peakL.toFixed(3)} R=${peakR.toFixed(3)}`);
}

if ((version() | 0) < 26) throw new Error(`graph version ${version()} expected >= 26`);
console.log(`smoke_graph_mix_batch ok: version=${version() | 0}`);
