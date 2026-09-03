// Headless: binaryClock (type 152) free-run bits + external clock advance + reset.
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

const bcCreate = must("soemdsp_binary_clock_create");
const bcDestroy = must("soemdsp_binary_clock_destroy");
const bcSample = must("soemdsp_binary_clock_sample");
const bcBit0 = must("soemdsp_binary_clock_bit0");
const bcBit1 = must("soemdsp_binary_clock_bit1");
const bcGate = must("soemdsp_binary_clock_gate");

const TYPE_OUT = 6;
const TYPE_CLOCK = 28;
const TYPE_BINARY_CLOCK = 152;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const PORT_SAW = 3;
const PORT_RAMP = 4;
const PORT_SQUARE = 5;
const PORT_TRIGGER = 20;
const PORT_RESET = 19;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_STAGES = 22;

const ver = version() | 0;
if (ver < 107) {
  throw new Error(`graph version ${ver} < 107 (binaryClock not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

// --- Kernel: external clock advances; reset clears; bits exact ---
{
  const h = bcCreate() | 0;
  if (h <= 0) throw new Error("binary_clock create");
  const outs = [];
  for (let i = 0; i < 5; i++) {
    bcSample(h, 0, 1, 0, 2, 4, 48000);
    const out = bcSample(h, 1, 1, 0, 2, 4, 48000);
    outs.push(out);
    if (!(bcGate(h) > 0.5)) throw new Error("clocked gate pulse missing");
    bcSample(h, 0, 1, 0, 2, 4, 48000); // fall
    if (bcGate(h) !== 0) throw new Error("clocked gate should be 1-sample");
  }
  // count 1..5 → Out = n/16
  for (let i = 0; i < 5; i++) {
    const expect = (i + 1) / 16;
    if (Math.abs(outs[i] - expect) > 1e-12) {
      throw new Error(`kernel out[${i}]=${outs[i]} want ${expect}`);
    }
  }
  if (bcBit0(h) !== 1 || bcBit1(h) !== 0) {
    throw new Error(`bits after 5: bit0=${bcBit0(h)} bit1=${bcBit1(h)}`);
  }
  // Reset
  bcSample(h, 0, 1, 0, 2, 4, 48000);
  const afterReset = bcSample(h, 0, 1, 1, 2, 4, 48000);
  if (afterReset !== 0) throw new Error(`reset out=${afterReset}`);
  if (bcBit0(h) !== 0) throw new Error("reset bit0");
  bcDestroy(h);
  console.log("binary_clock kernel ok");
}

// --- Kernel free-run: Out moves without Clock connected ---
{
  const h = bcCreate() | 0;
  let last = bcSample(h, 0, 0, 0, 1000, 4, 48000);
  let changed = false;
  let gateHigh = false;
  for (let i = 0; i < 200; i++) {
    const out = bcSample(h, 0, 0, 0, 1000, 4, 48000);
    if (out !== last) changed = true;
    if (bcGate(h) > 0.5) gateHigh = true;
    last = out;
  }
  if (!changed) throw new Error("free-run Out stuck");
  if (!gateHigh) throw new Error("free-run Gate never high");
  bcDestroy(h);
  console.log("binary_clock free-run ok");
}

// --- Graph: free-run → outs present ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hBc = 0xcc01 >>> 0;
  const hOut = 0xcc02 >>> 0;
  if ((add(g, hBc, TYPE_BINARY_CLOCK) | 0) !== 0) throw new Error("bc add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  setParam(g, hBc, PARAM_FREQUENCY, 64);
  setParam(g, hBc, PARAM_STAGES, 4);
  if ((connect(g, hBc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("bc→out");
  }
  if ((compile(g) | 0) !== 0) throw new Error("compile free");
  snap(g);
  let outPeak = 0;
  let bit0Peak = 0;
  let gatePeak = 0;
  for (let n = 0; n < 40; n++) {
    process(g, 128);
    const o = view(portPtr(g, hBc, PORT_MONO) | 0, 128);
    const b0 = view(portPtr(g, hBc, PORT_LEFT) | 0, 128);
    const gt = view(portPtr(g, hBc, PORT_SQUARE) | 0, 128);
    for (let k = 0; k < 128; k++) {
      outPeak = Math.max(outPeak, Math.abs(o[k]));
      bit0Peak = Math.max(bit0Peak, Math.abs(b0[k]));
      gatePeak = Math.max(gatePeak, Math.abs(gt[k]));
    }
  }
  destroy(g);
  if (!(outPeak > 0)) throw new Error(`graph free-run Out silent (${outPeak})`);
  if (!(bit0Peak > 0.5)) throw new Error(`graph Bit0 silent (${bit0Peak})`);
  if (!(gatePeak > 0.5)) throw new Error(`graph Gate silent (${gatePeak})`);
  console.log(
    `ok binaryClock graph free-run out=${outPeak.toFixed(4)} bit0=${bit0Peak} gate=${gatePeak} version=${ver}`
  );
}

// --- Graph: external Clock advances Bit0 ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0xcc11 >>> 0;
  const hBc = 0xcc12 >>> 0;
  const hOut = 0xcc13 >>> 0;
  if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clk add");
  if ((add(g, hBc, TYPE_BINARY_CLOCK) | 0) !== 0) throw new Error("bc add2");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add2");
  setParam(g, hClk, PARAM_FREQUENCY, 32);
  setParam(g, hClk, PARAM_AMPLITUDE, 1);
  setParam(g, hBc, PARAM_FREQUENCY, 2);
  setParam(g, hBc, PARAM_STAGES, 4);
  if ((connect(g, hClk, PORT_MONO, hBc, PORT_TRIGGER) | 0) !== 0) {
    throw new Error("clk→bc");
  }
  if ((connect(g, hBc, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("bc→out2");
  }
  if ((compile(g) | 0) !== 0) throw new Error("compile clocked");
  snap(g);
  let bit0Peak = 0;
  let bit1Peak = 0;
  let bit2Peak = 0;
  let bit3Peak = 0;
  for (let n = 0; n < 80; n++) {
    process(g, 128);
    const b0 = view(portPtr(g, hBc, PORT_LEFT) | 0, 128);
    const b1 = view(portPtr(g, hBc, PORT_RIGHT) | 0, 128);
    const b2 = view(portPtr(g, hBc, PORT_SAW) | 0, 128);
    const b3 = view(portPtr(g, hBc, PORT_RAMP) | 0, 128);
    for (let k = 0; k < 128; k++) {
      bit0Peak = Math.max(bit0Peak, Math.abs(b0[k]));
      bit1Peak = Math.max(bit1Peak, Math.abs(b1[k]));
      bit2Peak = Math.max(bit2Peak, Math.abs(b2[k]));
      bit3Peak = Math.max(bit3Peak, Math.abs(b3[k]));
    }
  }
  destroy(g);
  if (!(bit0Peak > 0.5) || !(bit1Peak > 0.5)) {
    throw new Error(`clocked bits quiet b0=${bit0Peak} b1=${bit1Peak}`);
  }
  console.log(
    `ok binaryClock clocked bits b0=${bit0Peak} b1=${bit1Peak} b2=${bit2Peak} b3=${bit3Peak}`
  );
}
