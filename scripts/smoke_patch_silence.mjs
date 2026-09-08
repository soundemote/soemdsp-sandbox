// Reproduce "not working patch" audio path: Chaosfly→Out L/R + SinCos amp-mod→clip→Mono.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;

function must(name) {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing ${name}`);
  return fn;
}

const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const setDomain = must("soemdsp_graph_set_param_domain");
const clearMods = must("soemdsp_graph_clear_param_mod_edges");
const addMod = must("soemdsp_graph_add_param_mod_edge");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const outL = must("soemdsp_graph_block_output_left_ptr");
const outR = must("soemdsp_graph_block_output_right_ptr");

const fnv = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const TYPE = {
  bias: 12,
  ampCurve: 157,
  sinCos: 153,
  softClipper: 7, // may differ — probe
  chaosfly: 161,
  output: 6,
};
const PARAM = { frequency: 10, amplitude: 12, volumeDb: 1, pan: 2, mode: 21, attOffset: 71 };
const PORT = { mono: 0, left: 1, right: 2 };

function peakAt(ptr, n) {
  const view = new Float64Array(mem.buffer, ptr, n);
  let p = 0;
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(view[i] || 0));
  return p;
}

console.log("graph version", e.soemdsp_graph_version());

// --- A: Chaosfly → Output L/R only ---
{
  const g = create() | 0;
  setSr(g, 44100);
  const hChaos = fnv("chaosfly-1");
  const hOut = fnv("output");
  if (add(g, hChaos, TYPE.chaosfly)) throw new Error("add chaos");
  if (add(g, hOut, TYPE.output)) throw new Error("add out");
  setParam(g, hChaos, PARAM.frequency, 55);
  setParam(g, hChaos, PARAM.amplitude, 0.5);
  setParam(g, hOut, PARAM.volumeDb, -8.97);
  if (connect(g, hChaos, PORT.mono, hOut, PORT.left)) throw new Error("connect L");
  if (connect(g, hChaos, PORT.left, hOut, PORT.right)) throw new Error("connect R");
  if (compile(g)) throw new Error("compile A");
  snap(g);
  process(g, 256);
  const pL = peakAt(outL(g) | 0, 256);
  const pR = peakAt(outR(g) | 0, 256);
  const pX = peakAt(portPtr(g, hChaos, PORT.mono) | 0, 256);
  const pY = peakAt(portPtr(g, hChaos, PORT.left) | 0, 256);
  console.log("A chaos→out", { pX, pY, pL, pR });
  if (!(pX > 1e-4 && pY > 1e-4)) throw new Error("chaos node silent");
  if (!(pL > 1e-5 && pR > 1e-5)) throw new Error("output silent despite chaos");
  destroy(g);
}

// --- B: Bias→AmpCurve MOD→SinCos amp=0 ---
{
  const g = create() | 0;
  setSr(g, 44100);
  const hBias = fnv("bias-1");
  const hAmp = fnv("ampCurve-1");
  const hOsc = fnv("sinCos-2");
  const hOut = fnv("output");
  if (add(g, hBias, TYPE.bias)) throw new Error("bias");
  if (add(g, hAmp, TYPE.ampCurve)) throw new Error("amp");
  if (add(g, hOsc, TYPE.sinCos)) throw new Error("osc");
  if (add(g, hOut, TYPE.output)) throw new Error("out");
  setParam(g, hBias, PARAM.attOffset, 0.8);
  setParam(g, hAmp, PARAM.mode, 0);
  setParam(g, hOsc, PARAM.frequency, 390);
  setParam(g, hOsc, PARAM.amplitude, 0);
  setDomain(g, hOsc, PARAM.amplitude, 0, 1, 4);
  setParam(g, hOut, PARAM.volumeDb, -9);
  if (connect(g, hBias, PORT.mono, hAmp, PORT.mono)) throw new Error("c1");
  if (connect(g, hOsc, PORT.mono, hOut, PORT.mono)) throw new Error("c2");
  clearMods(g);
  if (addMod(g, hAmp, PORT.mono, hOsc, PARAM.amplitude)) throw new Error("mod");
  if (compile(g)) throw new Error("compile B");
  snap(g);
  process(g, 256);
  const pOsc = peakAt(portPtr(g, hOsc, PORT.mono) | 0, 256);
  const pL = peakAt(outL(g) | 0, 256);
  console.log("B amp0 VCA→out", { pOsc, pL });
  if (!(pOsc > 0.1)) throw new Error("osc silent amp0 VCA");
  if (!(pL > 1e-5)) throw new Error("output silent B");
  destroy(g);
}

console.log("smoke_patch_silence OK");
