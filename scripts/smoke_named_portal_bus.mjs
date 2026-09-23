// Named portal bus is C++-owned: matching bus keys mix Mono In → Out.
// node scripts/smoke_named_portal_bus.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(
  __dirname,
  "..",
  "native_modules",
  "combined",
  "soemdsp_combined.wasm",
);

const buf = fs.readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(buf, {});
const e = instance.exports;

function must(name) {
  if (typeof e[name] !== "function") {
    throw new Error(`missing export ${name}`);
  }
}
must("soemdsp_graph_create");
must("soemdsp_graph_set_named_portal");
must("soemdsp_graph_compile");
must("soemdsp_graph_process_block");
must("soemdsp_graph_node_port_ptr");

const kBias = 12;
const kPortalIn = 182;
const kPortalOut = 184;
const kOffset = 71;
const kMono = 0;
const frames = 64;

const h = e.soemdsp_graph_create() | 0;
if (!h) throw new Error("create failed");

const hash = (s) => {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return x >>> 0;
};

const bias = hash("bias");
const pin = hash("portal-in");
const pout = hash("portal-out");
const sink = hash("sink");
const bus = hash("\0trigger\0" + "0");

if ((e.soemdsp_graph_add_node(h, bias, kBias) | 0) !== 0) throw new Error("add bias");
if ((e.soemdsp_graph_add_node(h, pin, kPortalIn) | 0) !== 0) throw new Error("add in");
if ((e.soemdsp_graph_add_node(h, pout, kPortalOut) | 0) !== 0) throw new Error("add out");
if ((e.soemdsp_graph_add_node(h, sink, kBias) | 0) !== 0) throw new Error("add sink");

e.soemdsp_graph_set_named_portal(h, pin, bus, 1);
e.soemdsp_graph_set_named_portal(h, pout, bus, 2);

if ((e.soemdsp_graph_connect(h, bias, kMono, pin, kMono) | 0) !== 0) {
  throw new Error("connect bias→portal in");
}
if ((e.soemdsp_graph_connect(h, pout, kMono, sink, kMono) | 0) !== 0) {
  throw new Error("connect portal out→sink");
}
e.soemdsp_graph_set_param(h, bias, kOffset, 0.75);
e.soemdsp_graph_set_param(h, sink, kOffset, 0);
e.soemdsp_graph_snap_controls?.(h);

const crc = e.soemdsp_graph_compile(h) | 0;
if (crc !== 0) throw new Error(`compile ${crc}`);

e.soemdsp_graph_process_block(h, frames, 0);
const ptr = e.soemdsp_graph_node_port_ptr(h, sink, kMono) | 0;
if (!ptr) throw new Error("port ptr 0");
const view = new Float64Array(e.memory.buffer, ptr, frames);
const last = view[frames - 1];
console.log({ last, head: Array.from(view.slice(0, 4)) });
if (!(Math.abs(last - 0.75) < 1e-6)) {
  throw new Error(`splice did not land on sink: ${last}`);
}
console.log("ok: portal pair spliced into a direct wire");
