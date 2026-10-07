// Headless: Robin Sinepulse (robinSinepulse, type 205), port of Robin Schmidt's
// SweepKicker (RS-MET).
// 1) Direct export: silent before Trigger, Env = velocity on the hit, exact 0 at
//    rest, Trigger hard-resets phase (Robin's noteOn), fHi clamp. No Reset port.
// 2) Graph: clock -> Trigger -> Kick on Mono, Env on Left.
// 3) Wave choice persists by name and resolves to the native choiceId.
// Parity against Robin's original: scripts/parity_robin_sinepulse.py.
import fs from "fs";
import path from "path";
import vm from "vm";
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

// --- 1) direct export ---
const kCreate = must("soemdsp_robin_sinepulse_create");
const kDestroy = must("soemdsp_robin_sinepulse_destroy");
const kSample = must("soemdsp_robin_sinepulse_sample");
const kEnv = must("soemdsp_robin_sinepulse_env");
const kIdle = must("soemdsp_robin_sinepulse_is_idle");
const SR = 48000;
const DEF = { hi: 10000, lo: 0, sweep: 0.2, chirp: 0, shape: 0, wave: 0, ws: 0, phase: 0, decay: 0.05, amp: 1 };
function step(h, trig, p = DEF) {
  const k = kSample(h, trig, p.hi, p.lo, p.sweep, p.chirp, p.shape, p.wave, p.ws, p.phase, p.decay, p.amp, SR);
  return [k, kEnv(h)];
}
{
  const h = kCreate() | 0;
  if (!(h > 0)) throw new Error("robinSinepulse create");
  for (let n = 0; n < 1000; n++) {
    const [k, env] = step(h, 0);
    if (k !== 0 || env !== 0) throw new Error("robinSinepulse not silent before the first Trigger");
  }
  if ((kIdle(h) | 0) !== 1) throw new Error("robinSinepulse should be idle before a hit");
  let [k0, e0] = step(h, 0.6);
  if (e0 !== 0.6) throw new Error(`Env on hit ${e0} != velocity 0.6`);
  if (k0 !== 0) throw new Error(`first sample of a fresh instance ${k0} != 0 (phase 0, Sine)`);
  let zeroAt = -1;
  let peakK = 0;
  for (let n = 1; n < 20000; n++) {
    const [k, env] = step(h, 0);
    peakK = Math.max(peakK, Math.abs(k));
    if (Math.abs(k) > env + 1e-12) throw new Error("|Kick| > Env");
    if (env === 0 && zeroAt < 0) zeroAt = n;
    if (zeroAt >= 0 && (env !== 0 || k !== 0)) throw new Error("Env/Kick not exact 0 at rest");
  }
  if (!(zeroAt > 0 && zeroAt < 0.05 * SR * 3)) throw new Error(`Env never reached exact 0 (${zeroAt})`);
  if (!(peakK > 0.3)) throw new Error(`Kick too quiet ${peakK}`);
  if ((kIdle(h) | 0) !== 1) throw new Error("robinSinepulse should be idle after Decay");
  // Trigger after silence hard-resets: first sample is 0 again (Sine, phase 0).
  [k0, e0] = step(h, 1);
  if (e0 !== 1 || k0 !== 0) throw new Error(`Trigger after silence should hard-reset phase (k0=${k0})`);
  // Mid-hit retrigger also hard-resets.
  for (let n = 0; n < 100; n++) step(h, 0);
  [k0, e0] = step(h, 1);
  if (e0 !== 1 || k0 !== 0) throw new Error(`mid-hit Trigger should hard-reset phase (k0=${k0})`);
  kDestroy(h);
  // fHi below 50 Hz is clamped: no upward sweep / blow-up.
  const h2 = kCreate() | 0;
  const low = { ...DEF, hi: 40, decay: 4 };
  for (let n = 0; n < 4 * SR; n++) {
    const [k, env] = step(h2, n === 0 ? 1 : 0, low);
    if (!Number.isFinite(k) || !Number.isFinite(env)) throw new Error("fHi clamp: non-finite output");
  }
  kDestroy(h2);
  console.log(`ok robinSinepulse direct: silent before hit, Env=velocity, exact 0 after ${zeroAt} samples, Trigger hard-resets phase, fHi clamp`);
}

// --- 2) graph ---
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

const TYPE_CLOCK = 28;
const TYPE_OUT = 6;
const TYPE_SINEPULSE = 205;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_TRIGGER = 20;
const P = {
  FREQUENCY: 10, WAVEFORM: 11, AMPLITUDE: 12, SHAPE: 13, PHASE: 14,
  CENTER: 30, WIDTH: 31, MIX: 40, TIME_NUMERATOR: 52, TIME_DENOMINATOR: 53,
};

const ver = version() | 0;
if (ver < 162) throw new Error(`graph version ${ver} < 162 (robinSinepulse)`);

function runGraph({ wave = 0, waveShape = 0, blocks = 750 } = {}) {
  const g = create() | 0;
  setSr(g, SR);
  const hClk = 0x9e01 >>> 0;
  const hSp = 0x9e02 >>> 0;
  const hOut = 0x9e03 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
  if ((add(g, hSp, TYPE_SINEPULSE) | 0) !== 0) throw new Error("robinSinepulse add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hClk, PORT_MONO, hSp, PORT_TRIGGER) | 0) !== 0) throw new Error("clk->sinepulse Trigger");
  if ((connect(g, hSp, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("sinepulse->out");
  setParam(g, hClk, P.FREQUENCY, 4);
  setParam(g, hSp, P.FREQUENCY, 10000);   // highFreq
  setParam(g, hSp, P.CENTER, 0);          // lowFreq
  setParam(g, hSp, P.TIME_NUMERATOR, 0.2); // sweepTime
  setParam(g, hSp, P.SHAPE, 0);           // chirp
  setParam(g, hSp, P.WIDTH, 0);           // chirpShape
  setParam(g, hSp, P.WAVEFORM, wave);     // wave choiceId
  setParam(g, hSp, P.MIX, waveShape);     // waveShape
  setParam(g, hSp, P.PHASE, 0);           // phase
  setParam(g, hSp, P.TIME_DENOMINATOR, 0.08); // decay
  setParam(g, hSp, P.AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  const sig = [];
  const env = [];
  for (let q = 0; q < blocks; q++) {
    process(g, 128);
    const kb = new Float64Array(mem.buffer, portPtr(g, hSp, PORT_MONO) | 0, 128);
    const eb = new Float64Array(mem.buffer, portPtr(g, hSp, PORT_LEFT) | 0, 128);
    for (let i = 0; i < 128; i++) { sig.push(kb[i]); env.push(eb[i]); }
  }
  destroy(g);
  const hits = [];
  for (let n = 1; n < env.length; n++) if (env[n - 1] === 0 && env[n] > 0) hits.push(n);
  if (env[0] > 0) hits.unshift(0);
  return { sig, env, hits };
}

{
  const a = runGraph();
  if (a.hits.length < 4) throw new Error(`graph: only ${a.hits.length} hits`);
  let peakEnv = 0;
  let peakSig = 0;
  for (let n = 0; n < a.sig.length; n++) {
    if (!Number.isFinite(a.sig[n]) || !Number.isFinite(a.env[n])) throw new Error("non-finite graph output");
    if (Math.abs(a.sig[n]) > a.env[n] + 1e-12) throw new Error("graph |Kick| > Env");
    peakEnv = Math.max(peakEnv, a.env[n]);
    peakSig = Math.max(peakSig, Math.abs(a.sig[n]));
  }
  if (!(Math.abs(peakEnv - 1) < 1e-9)) throw new Error(`graph Env peak ${peakEnv} != clock height 1`);
  if (!(peakSig > 0.3)) throw new Error(`graph Kick peak ${peakSig}`);
  // Every Trigger hard-resets: first sample of each hit is 0 (Sine, phase 0).
  for (const n of a.hits) {
    if (a.sig[n] !== 0 || !(a.sig[n + 1] > 0)) throw new Error(`Trigger hit at ${n} not a zero-phase start`);
  }
  // Hard-reset hits are identical (bit-exact) to the first one.
  const len = 0.2 * SR;
  for (const n of a.hits.slice(1)) {
    for (let i = 0; i < len && n + i < a.sig.length; i++) {
      if (a.sig[n + i] !== a.sig[a.hits[0] + i]) throw new Error(`hard-reset hit at ${n} differs at +${i}`);
    }
  }
  const c = runGraph({ wave: 2, waveShape: 0.5 });
  let diff = 0;
  for (let n = 0; n < c.sig.length; n++) diff = Math.max(diff, Math.abs(c.sig[n] - a.sig[n]));
  if (!(diff > 0.05)) throw new Error(`Wave TriSaw had no effect (${diff})`);
  console.log(`ok robinSinepulse graph type=${TYPE_SINEPULSE} version=${ver} hits=${a.hits.length} envPeak=${peakEnv.toFixed(6)} outPeak=${peakSig.toFixed(4)} triSawDiff=${diff.toFixed(3)}`);
}

// --- 3) Wave choice persists by name; Trigger only (no Reset); outputs Kick / Env ---
{
  const defsSrc = fs.readFileSync(path.join(root, "public", "node-graph-module-definitions.js"), "utf8");
  const needle = "\n  robinSinepulse: {";
  const i = defsSrc.indexOf(needle);
  if (i < 0) throw new Error("robinSinepulse definition not found");
  let depth = 0;
  let start = -1;
  let body = "";
  for (let p = i + 1; p < defsSrc.length; p++) {
    const ch = defsSrc[p];
    if (ch === "{") { if (depth === 0) start = p; depth += 1; }
    else if (ch === "}") { depth -= 1; if (depth === 0) { body = defsSrc.slice(start, p + 1); break; } }
  }
  const def = vm.runInNewContext(`(${body})`);
  if (JSON.stringify(def.inputs) !== JSON.stringify(["Trigger"])) throw new Error(`robinSinepulse inputs ${JSON.stringify(def.inputs)}, expected ["Trigger"] only`);
  if (def.inputs.includes("Reset")) throw new Error("Robin Sinepulse must not have a Reset input");
  const metaSrc = fs.readFileSync(path.join(root, "public", "node-graph-slider-metadata.js"), "utf8");
  const a = metaSrc.indexOf("function nodeGraphParameterByKey");
  const z = metaSrc.indexOf("function nodeGraphChoiceSliderValueForKey");
  if (a < 0 || z < 0) throw new Error("choice helpers not found in node-graph-slider-metadata.js");
  const ctx = { nodeGraphModuleDefinitions: { robinSinepulse: def } };
  vm.runInNewContext(`${metaSrc.slice(a, z)}\nthis.idFor = nodeGraphChoiceIdForKey;`, ctx);
  const wave = def.parameters.find((x) => x.key === "wave");
  if (JSON.stringify(wave.choiceKeys) !== JSON.stringify(["sine", "sinFatSaw", "triSaw"])) throw new Error("wave choiceKeys");
  if (wave.defaultValue !== "sine") throw new Error("wave default must be the name 'sine'");
  for (const [name, id] of [["sine", 0], ["sinFatSaw", 1], ["triSaw", 2]]) {
    const saved = JSON.parse(JSON.stringify({ type: "robinSinepulse", params: { wave: name } }));
    if (saved.params.wave !== name) throw new Error("wave not stored by name");
    const got = ctx.idFor("robinSinepulse", "wave", saved.params.wave);
    if (got !== id) throw new Error(`wave ${name} -> ${got}, expected ${id}`);
  }
  if (JSON.stringify(def.outputs) !== JSON.stringify(["Kick", "Env"])) throw new Error(`robinSinepulse outputs ${JSON.stringify(def.outputs)}`);
  if (/\n  kick: \{/.test(defsSrc)) throw new Error("leftover kick module key in definitions");
  console.log("ok robinSinepulse wave choice persists by name; inputs=[Trigger], outputs=[Kick, Env]");
}
