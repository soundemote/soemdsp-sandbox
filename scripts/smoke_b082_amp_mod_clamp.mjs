// B-082: unit-band MOD into PolyBLEP Amplitude clamps to paramMeta [min,max].
// Simulates Keyboard Gate + Toggle both ON (unitAdd ~= 2) with Amp base 0 or 1.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const setMod = must("soemdsp_graph_set_param_mod");
const setDomain = must("soemdsp_graph_set_param_domain");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const version = must("soemdsp_graph_version");

const TYPE_POLY = 1;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PARAM_FREQ = 10;
const PARAM_WAVE = 11;
const PARAM_AMP = 12;

const ver = version() | 0;
if (ver < 156) throw new Error(`graph version ${ver} < 156 (need B-082 clamp)`);

function peakFor({ ampBase, unitAdd, flags }) {
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xb0820001 >>> 0;
  const hOut = 0xb0820002 >>> 0;
  if (add(g, hOsc, TYPE_POLY)) throw new Error("poly");
  if (add(g, hOut, TYPE_OUT)) throw new Error("out");
  connect(g, hOsc, PORT_MONO, hOut, PORT_MONO);
  setParam(g, hOsc, PARAM_FREQ, 440);
  setParam(g, hOsc, PARAM_WAVE, 5); // sine
  setParam(g, hOsc, PARAM_AMP, ampBase);
  // bit1 = modClamp request; bit3 = legacy unbounded (native must still clamp unit-band)
  setDomain(g, hOsc, PARAM_AMP, 0, 1, flags);
  setMod(g, hOsc, PARAM_AMP, unitAdd, 0);
  if (compile(g)) throw new Error("compile");
  snap(g);
  let peak = 0;
  for (let q = 0; q < 32; q++) {
    process(g, 128);
    const buf = new Float64Array(mem.buffer, portPtr(g, hOut, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) peak = Math.max(peak, Math.abs(buf[i] || 0));
  }
  destroy(g);
  return peak;
}

// Gate+Toggle both ON into Amp@0 → unitAdd 2; must clamp to max 1.
const bothOn = peakFor({ ampBase: 0, unitAdd: 2, flags: 2 });
// Amp already at max + one unit source → still ≤ 1.
const ampMaxPlusGate = peakFor({ ampBase: 1, unitAdd: 1, flags: 2 });
// Legacy unbounded flag must not defeat unit-band clamp (SSOT).
const legacyUnbounded = peakFor({ ampBase: 0, unitAdd: 2, flags: 8 });

console.log({ ver, bothOn, ampMaxPlusGate, legacyUnbounded });

const lim = 1.05; // small headroom for AA / block edge
if (!(bothOn <= lim)) throw new Error(`bothOn peak ${bothOn} > ${lim}`);
if (!(ampMaxPlusGate <= lim)) throw new Error(`ampMaxPlusGate peak ${ampMaxPlusGate} > ${lim}`);
if (!(legacyUnbounded <= lim)) throw new Error(`legacyUnbounded peak ${legacyUnbounded} > ${lim}`);
// Sanity: modulation is audible / non-silent when base 0 + unitAdd 1 (clamped to 1).
const oneUnit = peakFor({ ampBase: 0, unitAdd: 1, flags: 2 });
if (!(oneUnit > 0.2)) throw new Error(`oneUnit peak too quiet ${oneUnit}`);

console.log("smoke_b082_amp_mod_clamp ok");
