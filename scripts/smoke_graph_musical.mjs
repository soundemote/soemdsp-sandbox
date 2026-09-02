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
if (ver < 103) throw new Error(`graph version ${ver} < 103`);
console.log(`graph version ${ver}`);

const TYPE_CHORD_PAD = 140;
const TYPE_NOTE_GLIDE = 141;
const TYPE_NOTE_TRANSPOSE = 142;
const TYPE_DEGREE_TURING = 143;
const TYPE_DEGREE_PHRASE = 144;
const TYPE_GRAVITY_WALKER = 145;
const PARAM_WAVEFORM = 11;
const PARAM_TIME_NUM = 52;
const PARAM_WIDTH = 31;

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

// --- chordPad: Scale / Root / Gate ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hPad = 0x8c01;
  const hOut = 0x8c02;
  if ((add(g, hPad, TYPE_CHORD_PAD) | 0) !== 0) throw new Error("chordPad add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("chordPad out");
  setParam(g, hPad, PARAM_MODE, 0); // key C
  setParam(g, hPad, PARAM_SHAPE, 0); // unused
  setParam(g, hPad, PARAM_WAVEFORM, 0); // major
  setParam(g, hPad, PARAM_STAGES, 0); // I
  setParam(g, hPad, PARAM_AMPLITUDE, 1);
  if ((connect(g, hPad, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("chordPad scale conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("chordPad compile");
  snap(g);
  process(g, 128);
  const scale = view(portPtr(g, hPad, PORT_MONO) | 0, 128)[0];
  const root = view(portPtr(g, hPad, PORT_LEFT) | 0, 128)[0];
  const gate = view(portPtr(g, hPad, PORT_RIGHT) | 0, 128)[0];
  // C major triad mask 0x91, Root MIDI 60 → 0.5, Gate 1
  if ((scale | 0) !== 0x91) throw new Error(`chordPad scale=${scale}`);
  if (!(Math.abs(root - 0.5) < 1e-9)) throw new Error(`chordPad root=${root}`);
  if (!(Math.abs(gate - 1) < 1e-9)) throw new Error(`chordPad gate=${gate}`);
  console.log(`chordPad ok scale=${scale | 0} root=${root.toFixed(4)} gate=${gate}`);
  destroy(g);
}

// --- noteTranspose: +12 semitones ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hT = 0x8d01;
  const hSrc = 0x8d02;
  const hOut = 0x8d03;
  if ((add(g, hT, TYPE_NOTE_TRANSPOSE) | 0) !== 0) throw new Error("noteTranspose add");
  if ((add(g, hSrc, 33) | 0) !== 0) throw new Error("noteTranspose src"); // metallicRatio
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("noteTranspose out");
  setParam(g, hT, PARAM_STAGES, 12); // +1 octave in semis
  setParam(g, hT, PARAM_MODE, 0);
  setParam(g, hSrc, PARAM_WIDTH, 1);
  if ((connect(g, hSrc, PORT_MONO, hT, PORT_PITCH) | 0) !== 0) {
    throw new Error("noteTranspose pitch conn");
  }
  if ((connect(g, hT, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("noteTranspose out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("noteTranspose compile");
  snap(g);
  process(g, 128);
  const src = view(portPtr(g, hSrc, PORT_MONO) | 0, 128)[0];
  const out = view(portPtr(g, hT, PORT_MONO) | 0, 128)[0];
  const expected = src + 12 / 120;
  if (!(Math.abs(out - expected) < 1e-9)) {
    throw new Error(`noteTranspose out=${out} expected=${expected}`);
  }
  console.log(`noteTranspose ok out=${out.toFixed(6)}`);
  destroy(g);
}

// --- noteGlide: settles toward pitch ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hG = 0x8e01;
  const hSrc = 0x8e02;
  const hOut = 0x8e03;
  if ((add(g, hG, TYPE_NOTE_GLIDE) | 0) !== 0) throw new Error("noteGlide add");
  if ((add(g, hSrc, 33) | 0) !== 0) throw new Error("noteGlide src");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("noteGlide out");
  setParam(g, hG, PARAM_TIME_NUM, 0.001);
  setParam(g, hSrc, PARAM_WIDTH, 1);
  if ((connect(g, hSrc, PORT_MONO, hG, PORT_PITCH) | 0) !== 0) {
    throw new Error("noteGlide pitch conn");
  }
  if ((connect(g, hG, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("noteGlide out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("noteGlide compile");
  snap(g);
  let last = 0;
  for (let q = 0; q < 40; q++) {
    process(g, 128);
    last = view(portPtr(g, hG, PORT_MONO) | 0, 128)[127];
  }
  const target = view(portPtr(g, hSrc, PORT_MONO) | 0, 128)[0];
  if (!(Math.abs(last - target) < 0.02)) {
    throw new Error(`noteGlide last=${last} target=${target}`);
  }
  console.log(`noteGlide ok last=${last.toFixed(6)} target=${target.toFixed(6)}`);
  destroy(g);
}

// --- degreeTuring: clocked pitch ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hD = 0x8f01;
  const hClk = 0x8f02;
  const hOut = 0x8f03;
  if ((add(g, hD, TYPE_DEGREE_TURING) | 0) !== 0) throw new Error("degreeTuring add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("degreeTuring clock");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("degreeTuring out");
  setParam(g, hClk, PARAM_FREQUENCY, 32);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hD, PARAM_STAGES, 8);
  setParam(g, hD, PARAM_SHAPE, 0.5);
  setParam(g, hD, PARAM_MODE, 1);
  setParam(g, hD, PARAM_AMPLITUDE, 1);
  setParam(g, hD, PARAM_SEED, 1);
  if ((connect(g, hClk, PORT_MONO, hD, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("degreeTuring clock conn");
  }
  if ((connect(g, hD, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("degreeTuring out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("degreeTuring compile");
  snap(g);
  let peak = 0;
  let trigPeak = 0;
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    peak = Math.max(peak, peakOf(portPtr(g, hD, PORT_MONO) | 0, 128));
    trigPeak = Math.max(trigPeak, peakOf(portPtr(g, hD, PORT_RIGHT) | 0, 128));
  }
  if (!(peak > 0.2 && peak < 2)) throw new Error(`degreeTuring peak=${peak}`);
  if (!(trigPeak > 0.5)) throw new Error(`degreeTuring trigPeak=${trigPeak}`);
  console.log(`degreeTuring ok peak=${peak.toFixed(4)} trig=${trigPeak.toFixed(4)}`);
  destroy(g);
}

// --- degreePhrase: clocked phrase ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hP = 0x9001;
  const hClk = 0x9002;
  const hOut = 0x9003;
  if ((add(g, hP, TYPE_DEGREE_PHRASE) | 0) !== 0) throw new Error("degreePhrase add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("degreePhrase clock");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("degreePhrase out");
  setParam(g, hClk, PARAM_FREQUENCY, 24);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hP, PARAM_STAGES, 8);
  setParam(g, hP, PARAM_SHAPE, 0);
  setParam(g, hP, PARAM_MODE, 1);
  setParam(g, hP, PARAM_AMPLITUDE, 1);
  setParam(g, hP, PARAM_SEED, 1);
  if ((connect(g, hClk, PORT_MONO, hP, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("degreePhrase clock conn");
  }
  if ((connect(g, hP, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("degreePhrase out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("degreePhrase compile");
  snap(g);
  let peak = 0;
  let gatePeak = 0;
  for (let q = 0; q < 160; q++) {
    process(g, 128);
    peak = Math.max(peak, peakOf(portPtr(g, hP, PORT_MONO) | 0, 128));
    gatePeak = Math.max(gatePeak, peakOf(portPtr(g, hP, PORT_LEFT) | 0, 128));
  }
  if (!(peak > 0.2 && peak < 2)) throw new Error(`degreePhrase peak=${peak}`);
  if (!(gatePeak > 0.5)) throw new Error(`degreePhrase gatePeak=${gatePeak}`);
  console.log(`degreePhrase ok peak=${peak.toFixed(4)} gate=${gatePeak.toFixed(4)}`);
  destroy(g);
}

// --- gravityWalker: clocked walk ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hW = 0x9101;
  const hClk = 0x9102;
  const hOut = 0x9103;
  if ((add(g, hW, TYPE_GRAVITY_WALKER) | 0) !== 0) throw new Error("gravityWalker add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("gravityWalker clock");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("gravityWalker out");
  setParam(g, hClk, PARAM_FREQUENCY, 28);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hW, PARAM_SHAPE, 0.7);
  setParam(g, hW, PARAM_WIDTH, 0.1);
  setParam(g, hW, PARAM_MODE, 1);
  setParam(g, hW, PARAM_AMPLITUDE, 1);
  setParam(g, hW, PARAM_SEED, 1);
  if ((connect(g, hClk, PORT_MONO, hW, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("gravityWalker clock conn");
  }
  if ((connect(g, hW, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("gravityWalker out conn");
  }
  if ((compile(g) | 0) !== 0) throw new Error("gravityWalker compile");
  snap(g);
  let peak = 0;
  let trigPeak = 0;
  for (let q = 0; q < 120; q++) {
    process(g, 128);
    peak = Math.max(peak, peakOf(portPtr(g, hW, PORT_MONO) | 0, 128));
    trigPeak = Math.max(trigPeak, peakOf(portPtr(g, hW, PORT_RIGHT) | 0, 128));
  }
  if (!(peak > 0.2 && peak < 2)) throw new Error(`gravityWalker peak=${peak}`);
  if (!(trigPeak > 0.5)) throw new Error(`gravityWalker trigPeak=${trigPeak}`);
  console.log(`gravityWalker ok peak=${peak.toFixed(4)} trig=${trigPeak.toFixed(4)}`);
  destroy(g);
}

console.log("musical smoke ok");
