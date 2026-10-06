// Headless: PowerDecay (type 204).
// 1) Direct export: env = height * amp * pow(1 - t / decay, power), 0 after decay.
// 2) Graph: clock -> powerDecay -> output fires and decays.
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

// --- 1) direct kernel vs formula ---
const pdCreate = must("soemdsp_power_decay_create");
const pdDestroy = must("soemdsp_power_decay_destroy");
const pdSample = must("soemdsp_power_decay_sample");
const pdIdle = must("soemdsp_power_decay_is_idle");

const SR = 1000;
const DECAY = 0.5;
function expected(n, height, amp, power) {
  const t = n / SR;
  if (t >= DECAY) return 0;
  return height * amp * Math.pow(1 - t / DECAY, power);
}

for (const [power, height, amp] of [[2, 1, 1], [1, 0.5, 1], [0, 1, 0.8], [5, 1, 1]]) {
  const h = pdCreate() | 0;
  if (!(h > 0)) throw new Error("power_decay create");
  if ((pdIdle(h) | 0) !== 1) throw new Error("should start idle");
  let maxErr = 0;
  for (let n = 0; n < 700; n++) {
    const trig = n === 0 ? height : 0; // one-sample Trigger
    const y = pdSample(h, trig, DECAY, power, amp, SR);
    const err = Math.abs(y - expected(n, height, amp, power));
    if (err > maxErr) maxErr = err;
  }
  // pow_pos uses the library dsp_exp/dsp_ln approximations (~1e-6).
  if (!(maxErr < 1e-5)) throw new Error(`power=${power} maxErr=${maxErr}`);
  if ((pdIdle(h) | 0) !== 1) throw new Error("should be idle after decay");
  // Retrigger restarts from the top.
  const y0 = pdSample(h, height, DECAY, power, amp, SR);
  if (Math.abs(y0 - height * amp) > 1e-9) throw new Error(`retrigger y0=${y0}`);
  pdDestroy(h);
  console.log(`ok power_decay power=${power} height=${height} amp=${amp} maxErr=${maxErr.toExponential(2)}`);
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
const TYPE_PD = 204;
const PORT_MONO = 0;
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;
const PARAM_SHAPE = 13;
const PARAM_TIME_DEN = 53;

const ver = version() | 0;
if (ver < 157) throw new Error(`graph version ${ver} < 157 (powerDecay missing)`);

const g = create() | 0;
setSr(g, 48000);
const hClk = 0x9d01 >>> 0;
const hEnv = 0x9d02 >>> 0;
const hOut = 0x9d03 >>> 0;
if ((add(g, hClk, TYPE_CLOCK) | 0) !== 0) throw new Error("clock add");
if ((add(g, hEnv, TYPE_PD) | 0) !== 0) throw new Error("powerDecay add");
if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
if ((connect(g, hClk, PORT_MONO, hEnv, PORT_MONO) | 0) !== 0) throw new Error("clk->pd");
if ((connect(g, hEnv, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("pd->out");
setParam(g, hClk, PARAM_FREQUENCY, 4);
setParam(g, hEnv, PARAM_TIME_DEN, 0.1);
setParam(g, hEnv, PARAM_SHAPE, 2);
setParam(g, hEnv, PARAM_AMPLITUDE, 1);
if ((compile(g) | 0) !== 0) throw new Error("compile");
snap(g);

let peak = 0;
let zeros = 0;
for (let q = 0; q < 400; q++) {
  process(g, 128);
  const buf = new Float64Array(mem.buffer, portPtr(g, hEnv, PORT_MONO) | 0, 128);
  for (let i = 0; i < 128; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
    if (a === 0) zeros += 1;
  }
}
destroy(g);
if (!(peak > 0.5 && peak <= 1.0 + 1e-9)) throw new Error(`powerDecay graph peak ${peak}`);
if (!(zeros > 0)) throw new Error("powerDecay never reached 0 between hits");
console.log(`ok powerDecay graph type=${TYPE_PD} version=${ver} peak=${peak.toFixed(4)}`);
