// PolyBLEP phase ParamModEdge through a feedback group must stay sample-accurate.
// Repro: modulator → atten → phase MOD, plus carrier → filter → atten2 → same phase
// (feedback SCC). Bug: fb sample-major dispatched frames=1 so edge_read_sample
// always indexed buf[0] for the outside atten — quantum ZOH on phase.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

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

const TYPE_POLY = 1;
const TYPE_ATT = 7;
const TYPE_OUT = 6;
const TYPE_PASSIVE = 59;
const PORT_MONO = 0;
const PARAM_FREQ = 10;
const PARAM_WAVE = 11;
const PARAM_AMP = 12;
const PARAM_PHASE = 14;
const PARAM_ATT_AMP = 70;
const FRAMES = 128;
const SR = 44100;

const fnv = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

/** @param {{ att1: number, att2: number, wireFeedbackMod: boolean }} opts */
function capture(opts) {
  const { att1, att2, wireFeedbackMod } = opts;
  const g = create() | 0;
  setSr(g, SR);
  const hCar = fnv("polyBlep-5");
  const hMod = fnv("polyBlep-6");
  const hAtt1 = fnv("attenuverter-1");
  const hAtt2 = fnv("attenuverter-2");
  const hFilt = fnv("passiveFilter-2");
  const hOut = fnv("output");
  if (add(g, hCar, TYPE_POLY)) throw new Error("car");
  if (add(g, hMod, TYPE_POLY)) throw new Error("mod");
  if (add(g, hAtt1, TYPE_ATT)) throw new Error("att1");
  if (add(g, hAtt2, TYPE_ATT)) throw new Error("att2");
  if (add(g, hFilt, TYPE_PASSIVE)) throw new Error("filt");
  if (add(g, hOut, TYPE_OUT)) throw new Error("out");
  connect(g, hMod, PORT_MONO, hAtt1, PORT_MONO);
  connect(g, hCar, PORT_MONO, hFilt, PORT_MONO);
  connect(g, hFilt, PORT_MONO, hOut, PORT_MONO);
  connect(g, hFilt, PORT_MONO, hAtt2, PORT_MONO);
  // Near-0 Hz carrier makes quantum phase ZOH extremely audible / measurable.
  setParam(g, hCar, PARAM_FREQ, 0.58);
  setParam(g, hCar, PARAM_WAVE, 5);
  setParam(g, hCar, PARAM_AMP, 1);
  setParam(g, hCar, PARAM_PHASE, 2.9);
  setDomain(g, hCar, PARAM_PHASE, 0, 10, 1 | 2); // wrap + clamp
  setParam(g, hMod, PARAM_FREQ, 100);
  setParam(g, hMod, PARAM_WAVE, 5);
  setParam(g, hMod, PARAM_AMP, 1);
  setParam(g, hAtt1, PARAM_ATT_AMP, att1);
  setParam(g, hAtt2, PARAM_ATT_AMP, att2);
  clearMods(g);
  if (addMod(g, hAtt1, PORT_MONO, hCar, PARAM_PHASE)) throw new Error("mod1");
  // Feedback MOD creates the SCC even when att2 amp is 0 — that is the bug case:
  // outside atten (att1) must still be indexed by fbFrame, not buf[0].
  if (wireFeedbackMod) {
    if (addMod(g, hAtt2, PORT_MONO, hCar, PARAM_PHASE)) throw new Error("mod2");
  }
  if (compile(g)) throw new Error("compile");
  snap(g);
  for (let i = 0; i < 16; i++) process(g, FRAMES);
  const all = [];
  for (let q = 0; q < 32; q++) {
    process(g, FRAMES);
    const buf = new Float64Array(e.memory.buffer, portPtr(g, hCar, PORT_MONO) | 0, FRAMES);
    for (let i = 0; i < FRAMES; i++) all.push(buf[i]);
  }
  destroy(g);

  let jump = 0;
  let interior = 0;
  for (let i = 1; i < all.length - 1; i++) {
    const d2 = Math.abs(all[i + 1] - 2 * all[i] + all[i - 1]);
    if (i % FRAMES === 0 || i % FRAMES === FRAMES - 1) jump += d2;
    else interior += d2;
  }
  let diffVar = 0;
  for (let i = 1; i < all.length; i++) {
    const d = all[i] - all[i - 1];
    diffVar += d * d;
  }
  diffVar /= all.length;
  return { jump, interior, diffVar, peak: Math.max(...all.map(Math.abs)) };
}

const forwardNoScc = capture({ att1: 0.25, att2: 0, wireFeedbackMod: false });
// SCC present (feedback MOD edge) but only forward atten audible.
const forwardUnderScc = capture({ att1: 0.25, att2: 0, wireFeedbackMod: true });
const both = capture({ att1: 0.25, att2: 0.12, wireFeedbackMod: true });
console.log({ forwardNoScc, forwardUnderScc, both });

function assertAudioRate(label, m) {
  if (!(m.interior > 1 && m.diffVar > 1e-4)) {
    throw new Error(`${label} phase MOD dead/ZOH: ${JSON.stringify(m)}`);
  }
  if (m.interior < m.jump * 2) {
    throw new Error(`${label} staircase-like: interior=${m.interior} jump=${m.jump}`);
  }
}

assertAudioRate("forwardNoScc", forwardNoScc);
assertAudioRate("forwardUnderScc", forwardUnderScc);
assertAudioRate("both", both);
// Outside-mod under SCC must stay in the same ballpark as the no-SCC path
// (fbFrame index), not collapse toward quantum staircase.
if (forwardUnderScc.diffVar < forwardNoScc.diffVar * 0.25) {
  throw new Error(
    `forwardUnderScc starved vs forwardNoScc: ${forwardUnderScc.diffVar} < 0.25*${forwardNoScc.diffVar}`,
  );
}
console.log("polyblep phase MOD feedback sample-accurate smoke OK");
