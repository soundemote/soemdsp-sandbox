// Headless: Master Clock Trigger -> Acoustic Pluck Gate -> Out.
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
const ver = must("soemdsp_acoustic_pluck_version");

const TYPE_TRANSPORT = 37;
const TYPE_ACOUSTIC = 198;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_RIGHT = 2;
const PORT_TRIGGER = 20;

const PARAM_AMP = 12;
const PARAM_SHAPE = 13;
const PARAM_MODE = 21;
const PARAM_CENTER = 30;
const PARAM_WIDTH = 31;
const PARAM_FEEDBACK = 50;
const PARAM_TIME_NUM = 52;
const PARAM_TIME_DEN = 53;
const PARAM_TIMING_MODE = 54;
const PARAM_OFFSET_MS = 55;
const PARAM_TEMPO = 61;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

const v = ver() | 0;
if (v < 2) throw new Error(`acoustic_pluck version ${v} < 1`);
console.log(`acoustic_pluck version ${v}`);

function smoke(label, destPort) {
  const g = create() | 0;
  setSr(g, 48000);
  const hT = (0xa100 + destPort) >>> 0;
  const hE = (0xa200 + destPort) >>> 0;
  const hO = (0xa300 + destPort) >>> 0;
  if ((add(g, hT, TYPE_TRANSPORT) | 0) !== 0) throw new Error(`${label}: transport add`);
  if ((add(g, hE, TYPE_ACOUSTIC) | 0) !== 0) throw new Error(`${label}: acoustic add`);
  if ((add(g, hO, TYPE_OUT) | 0) !== 0) throw new Error(`${label}: out add`);
  if ((connect(g, hT, PORT_RIGHT, hE, destPort) | 0) !== 0) {
    throw new Error(`${label}: trigger connect`);
  }
  if ((connect(g, hE, PORT_MONO, hO, PORT_MONO) | 0) !== 0) {
    throw new Error(`${label}: out connect`);
  }
  setParam(g, hT, PARAM_AMP, 1);
  setParam(g, hT, PARAM_TIME_NUM, 1);
  setParam(g, hT, PARAM_TIME_DEN, 4);
  setParam(g, hT, PARAM_TIMING_MODE, 0);
  setParam(g, hT, PARAM_TEMPO, 120);
  setParam(g, hE, PARAM_TIMING_MODE, 0); // updateOnTrigger Off
  setParam(g, hE, PARAM_MODE, 1); // Trigger
  setParam(g, hE, PARAM_TIME_DEN, 0); // attack
  setParam(g, hE, PARAM_SHAPE, -0.07);
  setParam(g, hE, PARAM_OFFSET_MS, 0.11715292599242004);
  setParam(g, hE, PARAM_CENTER, 1);
  setParam(g, hE, PARAM_WIDTH, 0.6804373070396221);
  setParam(g, hE, PARAM_FEEDBACK, 0.9435542410230598);
  setParam(g, hE, PARAM_AMP, 1);
  if ((compile(g) | 0) !== 0) throw new Error(`${label}: compile`);
  snap(g);

  let peak = 0;
  let trigHits = 0;
  for (let q = 0; q < 400; q++) {
    process(g, 128);
    const out = view(portPtr(g, hE, PORT_MONO) | 0, 128);
    const trig = view(portPtr(g, hT, PORT_RIGHT) | 0, 128);
    for (let i = 0; i < 128; i++) {
      const y = Math.abs(out[i]);
      if (y > peak) peak = y;
      if (trig[i] > 0) trigHits += 1;
    }
  }
  if (!(trigHits >= 2)) throw new Error(`${label}: trigger hits=${trigHits}`);
  if (!(peak > 0.5)) throw new Error(`${label}: peak too low ${peak}`);
  console.log(`${label} ok peak=${peak.toFixed(4)} trig=${trigHits}`);
}

smoke("Trigger->Mono", PORT_MONO);
smoke("Trigger->kPortTrigger", PORT_TRIGGER);
console.log("acoustic pluck smoke ok");

