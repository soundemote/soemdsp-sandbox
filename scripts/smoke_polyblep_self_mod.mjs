// Self-mod: PolyBLEP Wave → own Amplitude MOD must affect output (1-sample hist).
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
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const addMod = must("soemdsp_graph_add_param_mod_edge");
const clearMod = must("soemdsp_graph_clear_param_mod_edges");
const setParam = must("soemdsp_graph_set_param");
const setDomain = must("soemdsp_graph_set_param_domain");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const outL = must("soemdsp_graph_block_output_left_ptr");
const destroy = must("soemdsp_graph_destroy");

const TYPE_POLY = 1;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 2;
const PARAM_AMP = 4;
const PARAM_WAVE = 3;
const FRAMES = 128;
const SR = 48000;

const fnv = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

function rmsFromOut(h) {
  process(h, FRAMES);
  const ptr = outL(h) >>> 0;
  const view = new Float64Array(mem.buffer, ptr, FRAMES);
  let s = 0;
  for (let i = 0; i < FRAMES; i++) s += view[i] * view[i];
  return Math.sqrt(s / FRAMES);
}

function build(withSelfMod) {
  const h = create();
  setSr(h, SR);
  const poly = fnv("poly");
  const out = fnv("out");
  add(h, poly, TYPE_POLY);
  add(h, out, TYPE_OUT);
  connect(h, poly, PORT_MONO, out, PORT_MONO);
  clearMod(h);
  if (withSelfMod) {
    // Wave (mono) → Amplitude Control (VCA-style unit MOD)
    addMod(h, poly, PORT_MONO, poly, PARAM_AMP);
  }
  compile(h);
  setParam(h, poly, PARAM_FREQ, 220);
  setParam(h, poly, PARAM_WAVE, 5); // sine
  // Amp knob = 1 depth; domain 0…1 + VCA bit so live MOD multiplies
  setDomain(h, poly, PARAM_AMP, 0, 1, 4); // bit2 = VCA
  setParam(h, poly, PARAM_AMP, withSelfMod ? 1 : 1);
  if (!withSelfMod) {
    // Open circuit without self-mod: silence amp via knob 0 for baseline contrast
    // Actually compare: with self-mod VCA, envelope follows |wave|; rms should be > 0
    // without mod and amp=0 → silent. Better: without mod amp=1 full tone;
    // with mod amp=1 VCA * wave → quieter / different rms (half-wave rectify-ish product).
  }
  snap(h);
  for (let i = 0; i < 8; i++) process(h, FRAMES);
  return h;
}

const hOpen = build(false);
setParam(hOpen, fnv("poly"), PARAM_AMP, 1);
snap(hOpen);
for (let i = 0; i < 4; i++) process(hOpen, FRAMES);
const rmsOpen = rmsFromOut(hOpen);
destroy(hOpen);

const hSelf = build(true);
let rmsSelf = 0;
for (let i = 0; i < 16; i++) rmsSelf = Math.max(rmsSelf, rmsFromOut(hSelf));
destroy(hSelf);

console.log({ rmsOpen, rmsSelf });
// Self VCA (amp * wave) must produce audio (hist not stuck at 0).
if (!(rmsSelf > 1e-4)) {
  throw new Error(`self-mod silent: rmsSelf=${rmsSelf}`);
}
// And must differ from unity open tone (product of sine with itself ≠ full sine).
if (!(Math.abs(rmsSelf - rmsOpen) > 1e-3)) {
  throw new Error(`self-mod ineffective: rmsSelf=${rmsSelf} rmsOpen=${rmsOpen}`);
}
console.log("polyblep self-mod smoke OK");
