// Headless Batch 11: stepSequencer.
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
const TYPE_SEQ = 36;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_TRIG = 20;
const PARAM_FREQ = 10;
const PARAM_AMP = 12;
const PARAM_STAGES = 22;
const PARAM_CENTER = 30;
const PARAM_LANE_VOL1 = 100;
const PARAM_LANE_VOL2 = 101;
const PARAM_LANE_VOL3 = 102;
const PARAM_LANE_VOL4 = 103;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// clock Pulse → stepSequencer (4 steps: 0.1, 0.2, 0.3, 0.4): Out should visit those values
{
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0xa101 >>> 0;
  const hSeq = 0xa102 >>> 0;
  const hOut = 0xa103 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("seq clock");
  if ((add(g, hSeq, TYPE_SEQ) | 0) !== 0) throw new Error("seq add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("seq out");
  if ((connect(g, hClk, PORT_RIGHT, hSeq, PORT_TRIG) | 0) !== 0) throw new Error("seq trig");
  if ((connect(g, hSeq, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("seq outc");
  setParam(g, hClk, PARAM_FREQ, 100);
  setParam(g, hClk, PARAM_AMP, 1);
  setParam(g, hSeq, PARAM_STAGES, 4);
  setParam(g, hSeq, PARAM_AMP, 1);
  setParam(g, hSeq, PARAM_CENTER, 0);
  setParam(g, hSeq, PARAM_LANE_VOL1, 0.1);
  setParam(g, hSeq, PARAM_LANE_VOL2, 0.2);
  setParam(g, hSeq, PARAM_LANE_VOL3, 0.3);
  setParam(g, hSeq, PARAM_LANE_VOL4, 0.4);
  if ((compile(g) | 0) !== 0) throw new Error("seq compile");
  snap(g);
  const seen = new Set();
  let gateHigh = 0;
  for (let q = 0; q < 80; q++) {
    process(g, 128);
    const out = view(portPtr(g, hSeq, PORT_MONO) | 0, 128);
    const gate = view(portPtr(g, hSeq, PORT_LEFT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const v = Math.round(out[i] * 100) / 100;
      if (v === 0.1 || v === 0.2 || v === 0.3 || v === 0.4) seen.add(v);
      if (gate[i] > 0.5) gateHigh += 1;
    }
  }
  if (seen.size < 4) throw new Error(`stepSequencer seen=${[...seen]} expected 0.1..0.4`);
  // Gate mirrors raw trigger (single-sample clock pulses), not a held gate.
  if (!(gateHigh > 5)) throw new Error(`stepSequencer gateHigh=${gateHigh}`);
  console.log(`stepSequencer ok steps=[${[...seen].sort().join(",")}] gateHigh=${gateHigh}`);
}

if ((version() | 0) < 34) throw new Error(`graph version ${version()} expected >= 34`);
console.log(`smoke_graph_stepseq_batch ok: version=${version() | 0}`);
