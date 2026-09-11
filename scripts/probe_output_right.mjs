import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { instance } = await WebAssembly.instantiate(
  fs.readFileSync(path.join(root, "native_modules/combined/soemdsp_combined.wasm")),
  {},
);
const e = instance.exports;
const mem = e.memory;
const fnv = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const g = e.soemdsp_graph_create() | 0;
e.soemdsp_graph_set_sample_rate(g, 44100);
const hC = fnv("chaosfly-1");
const hO = fnv("output");
e.soemdsp_graph_add_node(g, hC, 161);
e.soemdsp_graph_add_node(g, hO, 6);
e.soemdsp_graph_set_param(g, hC, 10, 55);
e.soemdsp_graph_set_param(g, hC, 12, 0.5);
e.soemdsp_graph_set_param(g, hO, 1, 0); // 0 dB
e.soemdsp_graph_set_param(g, hO, 2, 0); // pan center
const rc1 = e.soemdsp_graph_connect(g, hC, 0, hO, 1); // X→L
const rc2 = e.soemdsp_graph_connect(g, hC, 1, hO, 2); // Y→R
console.log({ rc1, rc2 });
console.log("compile", e.soemdsp_graph_compile(g));
e.soemdsp_graph_snap_controls(g);
e.soemdsp_graph_process_block(g, 128);
const peak = (ptr) => {
  const v = new Float64Array(mem.buffer, ptr | 0, 128);
  let p = 0;
  for (let i = 0; i < 128; i++) p = Math.max(p, Math.abs(v[i] || 0));
  return p;
};
console.log({
  x: peak(e.soemdsp_graph_node_port_ptr(g, hC, 0)),
  y: peak(e.soemdsp_graph_node_port_ptr(g, hC, 1)),
  outNodeL: peak(e.soemdsp_graph_node_port_ptr(g, hO, 1)),
  outNodeR: peak(e.soemdsp_graph_node_port_ptr(g, hO, 2)),
  busL: peak(e.soemdsp_graph_block_output_left_ptr(g)),
  busR: peak(e.soemdsp_graph_block_output_right_ptr(g)),
});
e.soemdsp_graph_destroy(g);
