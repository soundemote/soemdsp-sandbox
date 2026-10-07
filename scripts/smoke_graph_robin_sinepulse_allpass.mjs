// Headless: Robin Sinepulse Allpass (robinSinepulseAllpass, type 206), port of
// Robin Schmidt's rsFlatZapper (RS-MET).
// 1) Direct export: idle before input, Trigger impulse height, impulse-response
//    energy 1 (allpass), coefficients recomputed only when a param changes.
// 2) Graph: clock -> Trigger -> Out on Mono equals the direct export; clock ->
//    In with Mix 0 passes the dry signal; Mode changes the sound; IsIdle port.
// 3) Definition: Trigger + In in, Out out, Mode persists by name.
// Parity against Robin's original: scripts/parity_robin_sinepulse_allpass.py.
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

const SR = 48000;
const apCreate = must("soemdsp_robin_sinepulse_allpass_create");
const apDestroy = must("soemdsp_robin_sinepulse_allpass_destroy");
const apSet = must("soemdsp_robin_sinepulse_allpass_set_params");
const apSample = must("soemdsp_robin_sinepulse_allpass_sample");
const apIdle = must("soemdsp_robin_sinepulse_allpass_is_idle");
const apUpdates = must("soemdsp_robin_sinepulse_allpass_update_count");
must("soemdsp_robin_sinepulse_allpass_process_chain");
must("soemdsp_robin_sinepulse_allpass_dry");
must("soemdsp_robin_sinepulse_allpass_out");

// Chain params: stages, mode, lowFreq, highFreq, freqShape, lowQ, highQ, qShape.
const CHAIN = [50, 1, 60, 8000, 0, 1, 1, 0];

// --- 1) direct export ---
{
  for (const mode of [0, 1]) {
    const h = apCreate() | 0;
    if (!(h > 0)) throw new Error("robinSinepulseAllpass create");
    apSet(h, CHAIN[0], mode, CHAIN[2], CHAIN[3], CHAIN[4], CHAIN[5], CHAIN[6], CHAIN[7], SR);
    if ((apIdle(h) | 0) !== 1) throw new Error("should be idle before input");
    for (let n = 0; n < 500; n++) {
      if (apSample(h, 0, 0, 1, 1, 1, 1) !== 0) throw new Error("not silent before input");
    }
    let energy = 0;
    let peak = 0;
    let idleAt = -1;
    for (let n = 0; n < 4 * SR; n++) {
      const o = apSample(h, n === 0 ? 1 : 0, 0, 1, 1, 1, 1);
      if (!Number.isFinite(o)) throw new Error("non-finite output");
      energy += o * o;
      peak = Math.max(peak, Math.abs(o));
      if (n > 0 && idleAt < 0 && (apIdle(h) | 0) === 1) idleAt = n;
    }
    if (Math.abs(energy - 1) > 1e-3) throw new Error(`mode ${mode}: impulse-response energy ${energy} != 1 (allpass)`);
    if (!(idleAt > 0)) throw new Error(`mode ${mode}: never went idle after the zap`);
    apDestroy(h);
    console.log(`ok robinSinepulseAllpass direct mode=${mode} energy=${energy.toFixed(6)} peak=${peak.toFixed(4)} idleAfter=${(idleAt / SR).toFixed(2)}s`);
  }
  // Trigger impulse height (stages 0 = wire): |0.8| x 0.5.
  const h = apCreate() | 0;
  apSet(h, 0, 1, 15, 8000, 0, 1, 1, 0, SR);
  const o1 = apSample(h, 0.8, 0, 0.5, 1, 1, 1);
  const o2 = apSample(h, 0.8, 0, 0.5, 1, 1, 1);
  if (Math.abs(o1 - 0.4) > 1e-15 || o2 !== 0) throw new Error(`impulse height ${o1}, held gate ${o2}`);
  // Coefficients only on change.
  const u0 = apUpdates(h) | 0;
  for (let b = 0; b < 1000; b++) apSet(h, 128, 1, 15, 8000, 0, 1, 1, 0, SR);
  const u1 = apUpdates(h) | 0;
  if (u1 - u0 !== 1) throw new Error(`1000 identical set_params -> ${u1 - u0} coefficient updates, expected 1`);
  apSet(h, 128, 1, 15, 7999, 0, 1, 1, 0, SR);
  if ((apUpdates(h) | 0) !== u1 + 1) throw new Error("changed param did not recompute");
  apDestroy(h);
  console.log("ok robinSinepulseAllpass impulse height |v| x Impulse; coefficients recomputed only on change");
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
const TYPE_ALLPASS = 206;
const PORT_MONO = 0;
const PORT_ISIDLE = 11;
const PORT_TRIGGER = 20;
const P = {
  FREQUENCY: 10, AMPLITUDE: 12, SHAPE: 13, RESONANCE: 20, MODE: 21, STAGES: 22,
  CENTER: 30, WIDTH: 31, MIX: 40, FEEDBACK: 50, LEVEL: 51, ATT_OFFSET: 71,
};

const ver = version() | 0;
if (ver < 162) throw new Error(`graph version ${ver} < 162 (robinSinepulseAllpass)`);

function runGraph({ toTrigger = true, mode = 1, impulse = 1, input = 1, mix = 1, amp = 1, blocks = 400, stagesAt = null } = {}) {
  const g = create() | 0;
  setSr(g, SR);
  const hClk = 0x9f01 >>> 0;
  const hAp = 0x9f02 >>> 0;
  const hOut = 0x9f03 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
  if ((add(g, hAp, TYPE_ALLPASS) | 0) !== 0) throw new Error("robinSinepulseAllpass add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hClk, PORT_MONO, hAp, toTrigger ? PORT_TRIGGER : PORT_MONO) | 0) !== 0) throw new Error("clk->allpass");
  if ((connect(g, hAp, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("allpass->out");
  setParam(g, hClk, P.FREQUENCY, 4);
  setParam(g, hAp, P.STAGES, CHAIN[0]);
  setParam(g, hAp, P.MODE, mode);
  setParam(g, hAp, P.CENTER, CHAIN[2]);     // lowFreq
  setParam(g, hAp, P.FREQUENCY, CHAIN[3]);  // highFreq
  setParam(g, hAp, P.SHAPE, CHAIN[4]);      // freqShape
  setParam(g, hAp, P.RESONANCE, CHAIN[5]);  // lowQ
  setParam(g, hAp, P.WIDTH, CHAIN[6]);      // highQ
  setParam(g, hAp, P.ATT_OFFSET, CHAIN[7]); // qShape
  setParam(g, hAp, P.LEVEL, impulse);
  setParam(g, hAp, P.FEEDBACK, input);
  setParam(g, hAp, P.MIX, mix);
  setParam(g, hAp, P.AMPLITUDE, amp);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  const clk = [];
  const out = [];
  const idle = [];
  for (let q = 0; q < blocks; q++) {
    if (stagesAt && q === stagesAt.block) setParam(g, hAp, P.STAGES, stagesAt.value);
    process(g, 128);
    const cb = new Float64Array(mem.buffer, portPtr(g, hClk, PORT_MONO) | 0, 128);
    const ob = new Float64Array(mem.buffer, portPtr(g, hAp, PORT_MONO) | 0, 128);
    const ib = new Float64Array(mem.buffer, portPtr(g, hAp, PORT_ISIDLE) | 0, 128);
    for (let i = 0; i < 128; i++) { clk.push(cb[i]); out.push(ob[i]); idle.push(ib[i]); }
  }
  destroy(g);
  return { clk, out, idle };
}

{
  // Trigger path == direct export fed the same clock signal.
  const a = runGraph();
  const h = apCreate() | 0;
  let maxDiff = 0;
  let peak = 0;
  let hits = 0;
  for (let n = 0; n < a.out.length; n++) {
    if (n % 32 === 0) apSet(h, CHAIN[0], 1, CHAIN[2], CHAIN[3], CHAIN[4], CHAIN[5], CHAIN[6], CHAIN[7], SR);
    if (n > 0 && a.clk[n] !== 0 && a.clk[n - 1] === 0) hits++;
    const o = apSample(h, a.clk[n], 0, 1, 1, 1, 1);
    if (!Number.isFinite(a.out[n])) throw new Error("non-finite graph output");
    maxDiff = Math.max(maxDiff, Math.abs(o - a.out[n]));
    peak = Math.max(peak, Math.abs(a.out[n]));
  }
  apDestroy(h);
  if (hits < 3) throw new Error(`graph: only ${hits} clock hits`);
  if (maxDiff > 1e-12) throw new Error(`graph Trigger path differs from direct export by ${maxDiff}`);
  if (!(peak > 0.2)) throw new Error(`graph zap too quiet (${peak})`);
  if (a.idle[0] !== 0 && a.idle[0] !== 1) throw new Error("IsIdle not 0/1");
  // Mode One-Pole sounds different.
  const b = runGraph({ mode: 0 });
  let modeDiff = 0;
  for (let n = 0; n < b.out.length; n++) modeDiff = Math.max(modeDiff, Math.abs(b.out[n] - a.out[n]));
  if (!(modeDiff > 0.05)) throw new Error(`Mode One-Pole had no effect (${modeDiff})`);
  // In path with Mix 0: Out = Amplitude x Input x In exactly.
  const c = runGraph({ toTrigger: false, input: 0.5, mix: 0, amp: 0.8 });
  for (let n = 0; n < c.out.length; n++) {
    const want = 0.8 * (0 * 0 + 1 * (c.clk[n] * 0.5));
    if (c.out[n] !== want) throw new Error(`In / Mix 0 path at ${n}: ${c.out[n]} != ${want}`);
  }
  // In path wet: the chain smears the clock pulses (differs from dry).
  const d = runGraph({ toTrigger: false, input: 1, mix: 1 });
  let wetDiff = 0;
  for (let n = 0; n < d.out.length; n++) wetDiff = Math.max(wetDiff, Math.abs(d.out[n] - d.clk[n]));
  if (!(wetDiff > 0.05)) throw new Error(`In through the chain unchanged (${wetDiff})`);
  // Stage change mid-run stays finite.
  const s = runGraph({ stagesAt: { block: 100, value: 200 } });
  for (const v of s.out) if (!Number.isFinite(v) || Math.abs(v) > 10) throw new Error("stage change blew up");
  console.log(`ok robinSinepulseAllpass graph type=${TYPE_ALLPASS} version=${ver} hits=${hits} peak=${peak.toFixed(4)} graph-vs-direct=${maxDiff.toExponential(1)} modeDiff=${modeDiff.toFixed(3)} wetDiff=${wetDiff.toFixed(3)}`);
}

// --- 3) definition ---
{
  const defsSrc = fs.readFileSync(path.join(root, "public", "node-graph-module-definitions.js"), "utf8");
  const needle = "\n  robinSinepulseAllpass: {";
  const i = defsSrc.indexOf(needle);
  if (i < 0) throw new Error("robinSinepulseAllpass definition not found");
  let depth = 0;
  let start = -1;
  let body = "";
  for (let p = i + 1; p < defsSrc.length; p++) {
    const ch = defsSrc[p];
    if (ch === "{") { if (depth === 0) start = p; depth += 1; }
    else if (ch === "}") { depth -= 1; if (depth === 0) { body = defsSrc.slice(start, p + 1); break; } }
  }
  const def = vm.runInNewContext(`(${body})`);
  if (JSON.stringify(def.inputs) !== JSON.stringify(["Trigger", "In"])) throw new Error(`inputs ${JSON.stringify(def.inputs)}`);
  if (JSON.stringify(def.outputs) !== JSON.stringify(["Out"])) throw new Error(`outputs ${JSON.stringify(def.outputs)}`);
  const keys = def.parameters.map((x) => x.key);
  const want = ["stages", "mode", "lowFreq", "highFreq", "freqShape", "lowQ", "highQ", "qShape", "impulse", "input", "mix", "amplitude"];
  if (JSON.stringify(keys) !== JSON.stringify(want)) throw new Error(`param keys ${JSON.stringify(keys)}`);
  const metaSrc = fs.readFileSync(path.join(root, "public", "node-graph-slider-metadata.js"), "utf8");
  const a = metaSrc.indexOf("function nodeGraphParameterByKey");
  const z = metaSrc.indexOf("function nodeGraphChoiceSliderValueForKey");
  if (a < 0 || z < 0) throw new Error("choice helpers not found in node-graph-slider-metadata.js");
  const ctx = { nodeGraphModuleDefinitions: { robinSinepulseAllpass: def } };
  vm.runInNewContext(`${metaSrc.slice(a, z)}\nthis.idFor = nodeGraphChoiceIdForKey;`, ctx);
  const mode = def.parameters.find((x) => x.key === "mode");
  if (JSON.stringify(mode.choiceKeys) !== JSON.stringify(["onePole", "biquad"])) throw new Error("mode choiceKeys");
  if (mode.defaultValue !== "biquad") throw new Error("mode default must be the name 'biquad'");
  for (const [name, id] of [["onePole", 0], ["biquad", 1]]) {
    const saved = JSON.parse(JSON.stringify({ type: "robinSinepulseAllpass", params: { mode: name } }));
    const got = ctx.idFor("robinSinepulseAllpass", "mode", saved.params.mode);
    if (got !== id) throw new Error(`mode ${name} -> ${got}, expected ${id}`);
  }
  const wk = fs.readFileSync(path.join(root, "public", "node-live-audio-worklet-native-graph.js"), "utf8");
  if (!/\n  robinSinepulseAllpass: 206,/.test(wk)) throw new Error("worklet type id robinSinepulseAllpass: 206 missing");
  console.log("ok robinSinepulseAllpass definition: inputs=[Trigger, In], outputs=[Out], 12 params, Mode persists by name");
}
