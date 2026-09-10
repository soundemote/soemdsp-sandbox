// PolyBLEP Sine must be continuous across phase wrap (no once-per-cycle click).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");

const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;

function must(name) {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing ${name}`);
  return fn;
}

const create = must("soemdsp_polyblep_create");
const destroy = must("soemdsp_polyblep_destroy");
const process = must("soemdsp_polyblep_process_block");
const outPtr = must("soemdsp_polyblep_block_out_ptr");
const version = must("soemdsp_polyblep_version");

const h = create();
if (h <= 0) throw new Error("create failed");

const SR = 44100;
const HZ = 4;
const FRAMES = 128;
const phaseInc = HZ / SR;
// Start just before +π so the block crosses the wrap.
const phase0 = Math.PI - phaseInc * Math.PI * 2 * 2;

process(h, FRAMES, phase0, phaseInc, 5 /* Sine */, 1, 0.5, 1 /* Out only */);
const ptr = outPtr(h, 0) >>> 0;
const view = new Float64Array(e.memory.buffer, ptr, FRAMES);

let maxJump = 0;
for (let i = 1; i < FRAMES; i++) {
  const jump = Math.abs(view[i] - view[i - 1]);
  if (jump > maxJump) maxJump = jump;
}
destroy(h);

// At 4 Hz one sample step of a unit sine is ~2π*4/44100 ≈ 0.00057.
// Old Taylor-about-±π jumped ~0.014. Fail if we see a discontinuity-sized jump.
const limit = 0.002;
console.log({ version: version() | 0, maxJump, limit });
if (!(maxJump < limit)) {
  throw new Error(`sine wrap discontinuity: maxJump=${maxJump} >= ${limit}`);
}
console.log("polyblep sine wrap smoke OK");
