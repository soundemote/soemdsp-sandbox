// Headless: arp (type 150) + clock → output. Kernel demux + graph process.
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

const arpCreate = must("soemdsp_arp_create");
const arpDestroy = must("soemdsp_arp_destroy");
const arpSample = must("soemdsp_arp_sample");
const arpGate = must("soemdsp_arp_gate");
const arpTrigger = must("soemdsp_arp_trigger");
const arpStep = must("soemdsp_arp_step");

const TYPE_OUT = 6;
const TYPE_CLOCK = 28;
const TYPE_BIAS = 12;
const TYPE_ARP = 150;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_SAW = 3;
const PORT_TRIGGER = 20;
const PARAM_MODE = 21;
const PARAM_STAGES = 22;
const PARAM_SEED = 48;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_ATT_OFFSET = 71;
const PHASE = 2 ** 49;

const ver = version() | 0;
if (ver < 106) {
  throw new Error(`graph version ${ver} < 106 (arp not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peakOf(ptr, n) {
  const x = view(ptr, n);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  return peak;
}

// --- Direct kernel: C0+E0+G0 (bits 0,4,7) → up arp ---
{
  const h = arpCreate() | 0;
  if (h <= 0) throw new Error("arp create");
  const mask = (1 << 0) | (1 << 4) | (1 << 7); // C0, E0, G0
  let clock = 0;
  const pitches = [];
  for (let i = 0; i < 6; i++) {
    clock = 0;
    arpSample(h, mask, 1, clock, 0, 0, 8, 1);
    clock = 1;
    const pitch = arpSample(h, mask, 1, clock, 0, 0, 8, 1);
    pitches.push(Math.round(pitch * 120));
    if (!(arpGate(h) > 0.5)) throw new Error("arp gate low while held");
    if (!(arpTrigger(h) > 0.5)) throw new Error("arp trigger missing on clock");
  }
  // Play-then-advance Up: 24,28,31,24,28,31
  const expect = [24, 28, 31, 24, 28, 31];
  for (let i = 0; i < expect.length; i++) {
    if (pitches[i] !== expect[i]) {
      throw new Error(`arp up pitches ${pitches.join(",")} != ${expect.join(",")}`);
    }
  }
  // Empty mask → gate 0, hold pitch
  arpSample(h, 0, 1, 0, 0, 0, 8, 1);
  arpSample(h, 0, 1, 1, 0, 0, 8, 1);
  if (arpGate(h) !== 0) throw new Error("arp gate should clear when empty");
  arpDestroy(h);
  console.log(`arp kernel ok pitches=${pitches.join(",")}`);
}

// Phase-bit high half: key 49 (midi 73) alone.
{
  const h = arpCreate() | 0;
  const high = 1; // bit 0 of high half = key 49
  arpSample(h, PHASE + high, 1, 0, 0, 0, 0, 1);
  const pitch = arpSample(h, 0, 1, 1, 0, 0, 0, 1); // low half empty keeps prior high latch
  const midi = Math.round(pitch * 120);
  if (midi !== 73) throw new Error(`arp high-half midi=${midi} want 73`);
  arpDestroy(h);
  console.log("arp phase-bit demux ok");
}

// --- Graph: Bias feeder (held mask) + clock → arp → out ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hBias = 0xaa01 >>> 0;
  const hClk = 0xaa02 >>> 0;
  const hArp = 0xaa03 >>> 0;
  const hOut = 0xaa04 >>> 0;
  if ((add(g, hBias, TYPE_BIAS) | 0) !== 0) throw new Error("bias add");
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
  if ((add(g, hArp, TYPE_ARP) | 0) !== 0) throw new Error("arp add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");

  const mask = (1 << 0) | (1 << 4) | (1 << 7);
  setParam(g, hBias, PARAM_ATT_OFFSET, mask);
  setParam(g, hClk, PARAM_FREQUENCY, 32);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hArp, PARAM_MODE, 0);
  setParam(g, hArp, PARAM_STAGES, 8);
  setParam(g, hArp, PARAM_SEED, 1);

  if ((connect(g, hBias, PORT_MONO, hArp, PORT_MONO) | 0) !== 0) {
    throw new Error("bias→arp held");
  }
  if ((connect(g, hClk, PORT_MONO, hArp, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("clock→arp");
  }
  if ((connect(g, hArp, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("arp→out");
  }
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);

  let pitchPeak = 0;
  let gatePeak = 0;
  let trigPeak = 0;
  let stepPeak = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    pitchPeak = Math.max(pitchPeak, peakOf(portPtr(g, hArp, PORT_MONO) | 0, 128));
    gatePeak = Math.max(gatePeak, peakOf(portPtr(g, hArp, PORT_LEFT) | 0, 128));
    trigPeak = Math.max(trigPeak, peakOf(portPtr(g, hArp, PORT_RIGHT) | 0, 128));
    stepPeak = Math.max(stepPeak, peakOf(portPtr(g, hArp, PORT_SAW) | 0, 128));
  }
  destroy(g);

  // C0 = 24/120 = 0.2; G0 = 31/120 ≈ 0.258
  if (!(pitchPeak > 0.15 && pitchPeak < 0.4)) {
    throw new Error(`arp graph pitchPeak=${pitchPeak}`);
  }
  if (!(gatePeak > 0.5)) throw new Error(`arp graph gatePeak=${gatePeak}`);
  if (!(trigPeak > 0.5)) throw new Error(`arp graph trigPeak=${trigPeak}`);
  console.log(
    `ok arp type=${TYPE_ARP} version=${ver} pitch=${pitchPeak.toFixed(4)} gate=${gatePeak.toFixed(4)} trig=${trigPeak.toFixed(4)} step=${stepPeak.toFixed(4)}`,
  );
}
