// Headless: Mid-only and In+Side paths for quadrature (type 149).
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

const TYPE_POLYBLEP = 1;
const TYPE_OUT = 6;
const TYPE_QUADRATURE = 149;
const PORT_MONO = 0; // In / I
const PORT_LEFT = 1; // Side / Q
const PORT_RIGHT = 2; // Mid / MidI
const PORT_SAW = 3; // SideQ
const PARAM_FREQUENCY = 10;
const PARAM_AMPLITUDE = 12;

const ver = version() | 0;
if (ver < 105) {
  throw new Error(`graph version ${ver} < 105 (quadrature not in this WASM)`);
}

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function peaks(g, hNode) {
  let i = 0, q = 0, midI = 0, sideQ = 0;
  for (let n = 0; n < 60; n++) {
    process(g, 128);
    const bi = view(portPtr(g, hNode, PORT_MONO) | 0, 128);
    const bq = view(portPtr(g, hNode, PORT_LEFT) | 0, 128);
    const bm = view(portPtr(g, hNode, PORT_RIGHT) | 0, 128);
    const bs = view(portPtr(g, hNode, PORT_SAW) | 0, 128);
    for (let k = 0; k < 128; k++) {
      i = Math.max(i, Math.abs(bi[k]));
      q = Math.max(q, Math.abs(bq[k]));
      midI = Math.max(midI, Math.abs(bm[k]));
      sideQ = Math.max(sideQ, Math.abs(bs[k]));
    }
  }
  return { i, q, midI, sideQ };
}

// --- Mid-only: MidI moves; I/Q/SideQ ~0 ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xee11 >>> 0;
  const hQuad = 0xee12 >>> 0;
  const hOut = 0xee13 >>> 0;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("mid osc add");
  if ((add(g, hQuad, TYPE_QUADRATURE) | 0) !== 0) throw new Error("mid quad add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("mid out add");
  if ((connect(g, hOsc, PORT_MONO, hQuad, PORT_RIGHT) | 0) !== 0) {
    throw new Error("osc→Mid");
  }
  if ((connect(g, hQuad, PORT_RIGHT, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("MidI→out");
  }
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hQuad, PARAM_AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("mid compile");
  snap(g);
  const p = peaks(g, hQuad);
  destroy(g);
  if (!(p.midI > 1e-4)) throw new Error(`Mid-only MidI silent (${p.midI})`);
  if (p.i > 1e-3 || p.q > 1e-3 || p.sideQ > 1e-3) {
    throw new Error(`Mid-only leaked to I/Q/SideQ i=${p.i} q=${p.q} sideQ=${p.sideQ}`);
  }
  console.log(`ok quadrature Mid-only midI=${p.midI.toFixed(4)}`);
}

// --- In+Side: I/Q/SideQ move; MidI ~0 ---
{
  const g = create() | 0;
  setSr(g, 48000);
  const hOsc = 0xee21 >>> 0;
  const hQuad = 0xee22 >>> 0;
  const hOut = 0xee23 >>> 0;
  if ((add(g, hOsc, TYPE_POLYBLEP) | 0) !== 0) throw new Error("side osc add");
  if ((add(g, hQuad, TYPE_QUADRATURE) | 0) !== 0) throw new Error("side quad add");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("side out add");
  // Drive both In (Mono) and Side (Left) from the osc.
  if ((connect(g, hOsc, PORT_MONO, hQuad, PORT_MONO) | 0) !== 0) {
    throw new Error("osc→In");
  }
  if ((connect(g, hOsc, PORT_MONO, hQuad, PORT_LEFT) | 0) !== 0) {
    throw new Error("osc→Side");
  }
  if ((connect(g, hQuad, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) {
    throw new Error("I→out");
  }
  setParam(g, hOsc, PARAM_FREQUENCY, 220);
  setParam(g, hOsc, PARAM_AMPLITUDE, 0.8);
  setParam(g, hQuad, PARAM_AMPLITUDE, 1);
  if ((compile(g) | 0) !== 0) throw new Error("side compile");
  snap(g);
  const p = peaks(g, hQuad);
  destroy(g);
  if (!(p.i > 1e-4) || !(p.q > 1e-4) || !(p.sideQ > 1e-4)) {
    throw new Error(`In+Side silent i=${p.i} q=${p.q} sideQ=${p.sideQ}`);
  }
  if (Math.abs(p.q - p.sideQ) > 1e-9) {
    throw new Error(`SideQ must equal Q (q=${p.q} sideQ=${p.sideQ})`);
  }
  if (p.midI > 1e-3) {
    throw new Error(`In+Side leaked to MidI (${p.midI})`);
  }
  console.log(
    `ok quadrature In+Side i=${p.i.toFixed(4)} q=${p.q.toFixed(4)} sideQ=${p.sideQ.toFixed(4)} version=${ver}`
  );
}
