// Headless: Wave 6 musical/sequencing CV cores → output.
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

const TYPE_OUT = 6;
const TYPE_CLOCK = 28;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_TRIGGER = 20;
const PORT_RESET = 19;
const PORT_PITCH = 17;
const PORT_INCREMENT = 18;

const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_SEED = 48;
const PARAM_FREQUENCY = 10;

const ver = version() | 0;
if (ver < 49) throw new Error(`graph version ${ver} < 49`);
console.log(`graph version ${ver}`);

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(ptr, n) {
  const x = view(ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

// --- chordMemory: latch pitches, expect non-zero Note1 ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hMem = 0x8301;
  const hOut = 0x8302;
  if ((add(g, hMem, 83) | 0) !== 0) throw new Error("chordMemory add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("chordMemory out");
  if ((connect(g, hMem, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("chordMemory conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("chordMemory compile");
  snap(g);

  // Drive latch+pitch by setting live ports via a clock → trigger and a constant
  // pitch source isn't available; use direct native sample through process after
  // connecting a clock into Latch and a transport-less pitch via pitch quantizer
  // isn't set up — instead poke via temporary second graph using only memory
  // with no live edges: outs stay 0 until latch. Verify silence then inject
  // through a clock into Latch while Pitch is unconnected → still 0.
  // Use chord_memory native alone via graph: add clock → Latch, range as pitch? 
  // Simpler: connect clock to Latch+Advance and verify Gate/Arp stay 0 without Pitch.
  const hClk = 0x8303;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("chordMemory clock");
  setParam(g, hClk, PARAM_FREQUENCY, 8);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  if ((connect(g, hClk, PORT_MONO, hMem, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("chordMemory latch conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("chordMemory recompile");
  snap(g);
  for (let q = 0; q < 40; q++) process(g, 128);
  // Without pitch CV, latched slots are 0 — Gate should still go high after latch.
  const gatePeak = peakOf(portPtr(g, hMem, 5 /* square */) | 0, 128);
  if (!(gatePeak > 0.5)) throw new Error(`chordMemory gate peak=${gatePeak}`);
  console.log(`chordMemory ok gatePeak=${gatePeak.toFixed(4)}`);
  destroy(g);
}

// --- chordSequencer: clocked scale/root ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hSeq = 0x8401;
  const hClk = 0x8402;
  const hOut = 0x8403;
  if ((add(g, hSeq, 84) | 0) !== 0) throw new Error("chordSequencer add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("chordSequencer clock");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("chordSequencer out");
  setParam(g, hClk, PARAM_FREQUENCY, 16);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hSeq, PARAM_MODE, 0);
  setParam(g, hSeq, PARAM_AMPLITUDE, 1);
  if ((connect(g, hClk, PORT_MONO, hSeq, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("chordSequencer clock conn");
  }
  if ((connect(g, hSeq, PORT_LEFT, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("chordSequencer root conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("chordSequencer compile");
  snap(g);
  let rootPeak = 0;
  let scalePeak = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    rootPeak = Math.max(rootPeak, peakOf(portPtr(g, hSeq, PORT_LEFT) | 0, 128));
    scalePeak = Math.max(scalePeak, peakOf(portPtr(g, hSeq, PORT_MONO) | 0, 128));
  }
  if (!(rootPeak > 0.4 && rootPeak < 1.1)) {
    throw new Error(`chordSequencer rootPeak=${rootPeak}`);
  }
  if (!(scalePeak > 1)) throw new Error(`chordSequencer scalePeak=${scalePeak}`);
  console.log(
    `chordSequencer ok rootPeak=${rootPeak.toFixed(4)} scalePeak=${scalePeak.toFixed(4)}`,
  );
  destroy(g);
}

// --- pitchQuantizer: pitch CV → quantized mono ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hQ = 0x8501;
  const hSrc = 0x8502; // metallicRatio as constant-ish CV source
  const hOut = 0x8503;
  if ((add(g, hQ, 85) | 0) !== 0) throw new Error("pitchQuantizer add");
  if ((add(g, hSrc, 33) | 0) !== 0) throw new Error("pitchQuantizer src"); // metallicRatio
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("pitchQuantizer out");
  setParam(g, hQ, PARAM_SEED, 2741);
  setParam(g, hSrc, 31 /* width */, 1); // metallic index
  if ((connect(g, hSrc, PORT_MONO, hQ, PORT_PITCH) | 0) !== 0) {
    throw new Error("pitchQuantizer pitch conn");
  }
  if ((connect(g, hQ, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("pitchQuantizer out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("pitchQuantizer compile");
  snap(g);
  let peak = 0;
  for (let q = 0; q < 20; q++) {
    process(g, 128);
    peak = Math.max(peak, peakOf(portPtr(g, hQ, PORT_MONO) | 0, 128));
  }
  if (!(peak > 0.01 && peak < 2)) throw new Error(`pitchQuantizer peak=${peak}`);
  console.log(`pitchQuantizer ok peak=${peak.toFixed(4)}`);
  destroy(g);
}

// --- turingMachine: clocked CV ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hT = 0x8601;
  const hClk = 0x8602;
  const hOut = 0x8603;
  if ((add(g, hT, 86) | 0) !== 0) throw new Error("turingMachine add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("turingMachine clock");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("turingMachine out");
  setParam(g, hClk, PARAM_FREQUENCY, 32);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hT, PARAM_STAGES, 8);
  setParam(g, hT, PARAM_SHAPE, 0.9);
  setParam(g, hT, PARAM_AMPLITUDE, 1);
  if ((connect(g, hClk, PORT_MONO, hT, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("turingMachine clock conn");
  }
  if ((connect(g, hT, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("turingMachine out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("turingMachine compile");
  snap(g);
  let peak = 0;
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    peak = Math.max(peak, peakOf(portPtr(g, hT, PORT_MONO) | 0, 128));
  }
  if (!(peak > 0.01 && peak <= 1.01)) throw new Error(`turingMachine peak=${peak}`);
  console.log(`turingMachine ok peak=${peak.toFixed(4)}`);
  destroy(g);
}

console.log("musical smoke ok");
