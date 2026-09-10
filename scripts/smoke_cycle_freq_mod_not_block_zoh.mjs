// Cycle PolyBLEP → (thru) → Frequency MOD must NOT hold one CV for a whole quantum.
// Block-rate FM on a sine sounds like same-pitch downsample / zipper.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasm = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasm), {});
const e = instance.exports;
const mem = e.memory;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

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
const TYPE_PASSIVE = 59; // passive filter if available — else use second poly as thru carrier
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

const h = create();
setSr(h, SR);
const poly = fnv("poly");
const mid = fnv("mid");
const out = fnv("out");
add(h, poly, TYPE_POLY);
// Prefer passive filter; fall back to second polyBlep as delay-ish carrier in the cycle.
const midType = TYPE_PASSIVE;
const midRc = add(h, mid, midType);
if (midRc !== 0) {
  // passive missing in this wasm build — use attenuverter/gain if needed
  throw new Error(`add mid failed ${midRc}`);
}
add(h, out, TYPE_OUT);
connect(h, poly, PORT_MONO, mid, PORT_MONO);
connect(h, mid, PORT_MONO, out, PORT_MONO);
clearMod(h);
addMod(h, mid, PORT_MONO, poly, PARAM_FREQ); // cycle: mid → poly frequency
compile(h);
setParam(h, poly, PARAM_WAVE, 5);
setParam(h, poly, PARAM_FREQ, 200);
setParam(h, poly, PARAM_AMP, 1);
setDomain(h, poly, PARAM_FREQ, 0, 20000, 0);
snap(h);
for (let i = 0; i < 32; i++) process(h, FRAMES);

// Capture one quantum of output; block-ZOH FM makes long plateaus then jumps.
process(h, FRAMES);
const view = new Float64Array(mem.buffer, outL(h) >>> 0, FRAMES);
let plateau = 1;
let maxPlateau = 1;
for (let i = 1; i < FRAMES; i++) {
  if (Math.abs(view[i] - view[i - 1]) < 1e-12) {
    plateau += 1;
    if (plateau > maxPlateau) maxPlateau = plateau;
  } else {
    plateau = 1;
  }
}
destroy(h);

console.log({ maxPlateau });
// A held frequency for ~whole quantum yields huge flat runs on a slow-changing
// sine; sample-varying FM should not stick for dozens of identical samples.
if (maxPlateau >= 64) {
  throw new Error(`block-rate FM suspected: maxPlateau=${maxPlateau}`);
}
console.log("cycle freq mod not block-ZOH smoke OK");
