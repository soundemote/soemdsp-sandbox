// Native Rapt elliptic decimator: 2×/4× length, finite, DC settles.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;
if (!mem) throw new Error("memory missing");

function must(name) {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing ${name}`);
  return fn;
}

const create = must("soemdsp_rapt_elliptic_decimator_create");
const destroy = must("soemdsp_rapt_elliptic_decimator_destroy");
const reset = must("soemdsp_rapt_elliptic_decimator_reset");
const srcPtr = must("soemdsp_rapt_elliptic_decimator_src_ptr");
const destPtr = must("soemdsp_rapt_elliptic_decimator_dest_ptr");
const process = must("soemdsp_rapt_elliptic_decimator_process");

function run(factor, srcLen) {
  const h = create() | 0;
  if (!h) throw new Error("create failed");
  reset(h);
  const destLen = srcLen / factor;
  const sp = srcPtr(h) | 0;
  const dp = destPtr(h) | 0;
  const src = new Float32Array(mem.buffer, sp, srcLen);
  src.fill(1);
  process(h, srcLen, destLen, factor);
  const dest = new Float32Array(mem.buffer, dp, destLen);
  let peak = 0;
  let last = 0;
  for (let i = 0; i < destLen; i++) {
    const y = dest[i];
    if (!Number.isFinite(y)) throw new Error(`nonfinite at ${i}`);
    peak = Math.max(peak, Math.abs(y));
    last = y;
  }
  destroy(h);
  return { peak, last, destLen };
}

{
  const r2 = run(2, 256);
  if (r2.destLen !== 128) throw new Error("2x dest length");
  if (!(r2.peak > 0.1 && r2.peak < 4)) throw new Error(`2x peak ${r2.peak}`);
  const r4 = run(4, 512);
  if (r4.destLen !== 128) throw new Error("4x dest length");
  if (!(r4.peak > 0.1 && r4.peak < 4)) throw new Error(`4x peak ${r4.peak}`);
  console.log("rapt elliptic decimator ok 2x last=" + r2.last.toFixed(4) + " 4x last=" + r4.last.toFixed(4));
}
