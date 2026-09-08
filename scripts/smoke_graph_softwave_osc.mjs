// Headless: softwaveOsc → output (440 Hz) + Reset + sample-accurate Morph MOD.
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
const setDomain = must("soemdsp_graph_set_param_domain");
const clearMods = must("soemdsp_graph_clear_param_mod_edges");
const addMod = must("soemdsp_graph_add_param_mod_edge");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const poke = must("soemdsp_graph_poke_input");
const version = must("soemdsp_graph_version");
const softwaveVer = must("soemdsp_softwave_version");
const softwaveCreate = must("soemdsp_softwave_create");
const softwaveDestroy = must("soemdsp_softwave_destroy");
const softwaveReset = must("soemdsp_softwave_reset");
const softwaveSample = must("soemdsp_softwave_sample");

const TYPE_SOFTWAVE = 45;
const TYPE_BIAS = 12;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_RESET = 19;
const PARAM_FREQUENCY = 10;
const PARAM_WAVEFORM = 11;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13; // morph
const PARAM_ATT_OFFSET = 71; // Bias constant

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(ptr, n) {
  const x = view(ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

const swVer = softwaveVer() | 0;
if (swVer < 3) throw new Error(`softwave version ${swVer} < 3`);
console.log(`softwave version ${swVer}`);

// --- Direct WASM: reset zeros free-running phase ---
{
  const h = softwaveCreate() | 0;
  if (!h) throw new Error("softwave create");
  // Advance phase for a while at 1 Hz / 100 Hz sr → increment 0.01/sample.
  for (let i = 0; i < 50; i++) softwaveSample(h, 1, 100, 0, 0.5, 0, 1, 0);
  const before = softwaveSample(h, 0, 100, 0, 0.5, 0, 1, 0);
  softwaveReset(h);
  const after = softwaveSample(h, 0, 100, 0, 0.5, 0, 1, 0);
  softwaveDestroy(h);
  // At phase≈0 + morph mid, Analog Saw Sine is not identical to phase≈0.5.
  if (!(Math.abs(before - after) > 1e-6)) {
    throw new Error(`softwave reset no effect before=${before} after=${after}`);
  }
  console.log(`softwave reset ok delta=${Math.abs(before - after).toFixed(4)}`);
}

// --- Graph: 440 Hz tone ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xc501 >>> 0;
  const hOut = 0xc502 >>> 0;
  if ((add(g, hOsc, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("softwaveOsc add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 440);
  setParam(g, hOsc, PARAM_WAVEFORM, 0);
  setParam(g, hOsc, PARAM_SHAPE, 0.5);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let peak = 0;
  let sumSq = 0;
  let n = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    const buf = view(portPtr(g, hOsc, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = buf[i];
      const a = Math.abs(y);
      if (a > peak) peak = a;
      sumSq += y * y;
      n += 1;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  if (!(peak > 0.05 && peak <= 1.5)) throw new Error(`softwaveOsc peak=${peak}`);
  if (!(rms > 0.01)) throw new Error(`softwaveOsc rms=${rms}`);
  console.log(`softwaveOsc ok peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  destroy(g);
}

// --- Graph: Reset poke jumps free-running phase ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xc511 >>> 0;
  const hOut = 0xc512 >>> 0;
  if ((add(g, hOsc, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("reset add osc");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("reset add out");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("reset conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 100);
  setParam(g, hOsc, PARAM_WAVEFORM, 0);
  setParam(g, hOsc, PARAM_SHAPE, 0.5);
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("reset compile");
  snap(g);
  for (let q = 0; q < 20; q++) process(g, 128);
  const pre = peakOf(portPtr(g, hOsc, PORT_MONO) | 0, 128);
  if (!(pre > 0.01)) throw new Error(`reset pre-silent peak=${pre}`);
  // Rising-edge Reset impulse into live Reset port.
  if ((poke(g, hOsc, PORT_RESET, 1) | 0) !== 0) throw new Error("reset poke");
  process(g, 128);
  const postBuf = view(portPtr(g, hOsc, PORT_MONO) | 0, 128);
  // After reset, first sample is near phase 0 (+ increment). Must stay finite/non-NaN.
  if (!(Number.isFinite(postBuf[0]))) throw new Error(`reset post NaN ${postBuf[0]}`);
  console.log(`softwave Reset poke ok first=${postBuf[0].toFixed(4)}`);
  destroy(g);
}

// --- Graph: Bias → Morph param MOD changes output vs unmodded ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xc521 >>> 0;
  const hBias = 0xc522 >>> 0;
  const hOut = 0xc523 >>> 0;
  if ((add(g, hOsc, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("mod add osc");
  if ((add(g, hBias, TYPE_BIAS) | 0) !== 0) throw new Error("mod add bias");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("mod add out");
  if ((connect(g, hOsc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("mod conn");
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_WAVEFORM, 0);
  setParam(g, hOsc, PARAM_SHAPE, 0.1); // soft morph base
  setParam(g, hOsc, PARAM_AMPLITUDE, 1);
  // Morph domain 0…1 + modClamp so unit-band Bias CV maps into morph.
  setDomain(g, hOsc, PARAM_SHAPE, 0, 1, 2);
  setParam(g, hBias, PARAM_ATT_OFFSET, 0.8); // unit-band Morph MOD
  clearMods(g);
  if ((addMod(g, hBias, PORT_MONO, hOsc, PARAM_SHAPE) | 0) !== 0) {
    throw new Error("mod edge");
  }
  if ((compile(g) | 0) !== 0) throw new Error("mod compile");
  snap(g);
  let peakMod = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    peakMod = Math.max(peakMod, peakOf(portPtr(g, hOsc, PORT_MONO) | 0, 128));
  }
  destroy(g);

  // Same patch without Morph MOD — different morph → different peak character.
  const g2 = create() | 0;
  setSr(g2, 48000);
  const hOsc2 = 0xc531 >>> 0;
  const hOut2 = 0xc532 >>> 0;
  if ((add(g2, hOsc2, TYPE_SOFTWAVE) | 0) !== 0) throw new Error("nomod add osc");
  if ((add(g2, hOut2, TYPE_OUT) | 0) !== 0) throw new Error("nomod add out");
  if ((connect(g2, hOsc2, PORT_MONO, hOut2, PORT_MONO) | 0) !== 0) throw new Error("nomod conn");
  setParam(g2, hOsc2, PARAM_FREQUENCY, 220);
  setParam(g2, hOsc2, PARAM_WAVEFORM, 0);
  setParam(g2, hOsc2, PARAM_SHAPE, 0.1);
  setParam(g2, hOsc2, PARAM_AMPLITUDE, 1);
  if ((compile(g2) | 0) !== 0) throw new Error("nomod compile");
  snap(g2);
  let peakNo = 0;
  for (let q = 0; q < 40; q++) {
    process(g2, 128);
    peakNo = Math.max(peakNo, peakOf(portPtr(g2, hOsc2, PORT_MONO) | 0, 128));
  }
  destroy(g2);

  if (!(peakMod > 0.01 && peakNo > 0.01)) {
    throw new Error(`morph MOD silent mod=${peakMod} nomod=${peakNo}`);
  }
  if (!(Math.abs(peakMod - peakNo) > 1e-4)) {
    throw new Error(`morph MOD inert mod=${peakMod} nomod=${peakNo}`);
  }
  console.log(`softwave Morph MOD ok modPeak=${peakMod.toFixed(4)} noModPeak=${peakNo.toFixed(4)}`);
}

if ((version() | 0) < 41) throw new Error(`graph version ${version()} expected >= 41`);
console.log(`smoke_graph_softwave_osc ok: version=${version() | 0}`);
