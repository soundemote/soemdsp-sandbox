const fs = require("fs");
const path = require("path");
const wasmPath = path.join(
  __dirname,
  "..",
  "native_modules",
  "combined",
  "soemdsp_combined.wasm",
);
const buf = fs.readFileSync(wasmPath);
WebAssembly.instantiate(buf, {}).then((r) => {
  const e = r.instance.exports;
  for (const name of [
    "soemdsp_graph_set_param",
    "soemdsp_graph_set_param_mod",
    "soemdsp_graph_set_param_domain",
  ]) {
    if (typeof e[name] !== "function") {
      throw new Error(`missing export ${name}`);
    }
    console.log(name, "ok");
  }
  const h = e.soemdsp_graph_create();
  e.soemdsp_graph_set_sample_rate(h, 44100);
  const id = 0x12345678;
  // type 1 = polyBlep in many builds; tolerate failure and still exercise APIs
  e.soemdsp_graph_add_node(h, id, 1);
  e.soemdsp_graph_set_param(h, id, 10, 440);
  e.soemdsp_graph_set_param_domain(h, id, 10, 20, 20000, 0);
  e.soemdsp_graph_set_param_mod(h, id, 10, 0.25, 0);
  e.soemdsp_graph_destroy(h);
  console.log("param mod smoke ok");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
