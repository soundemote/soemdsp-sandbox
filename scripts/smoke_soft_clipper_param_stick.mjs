// Stickiness: set Threshold/Knee ONCE, then process_block many times without
// rewriting params. Soft vs hard knee must stay different (APP_POLICY).
// Run: node scripts/smoke_soft_clipper_param_stick.mjs
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

const frames = 128;
const blocks = 48;

function rmsAfterSetOnce(knee) {
  const h = e.soemdsp_soft_clipper_create();
  if (!h) throw new Error("create failed");
  // drive=4, threshold=0.5, knee, amplitude=1 — hot drive into the knee
  e.soemdsp_soft_clipper_set_params(h, 4, 0.5, knee, 1);
  const inPtr = e.soemdsp_soft_clipper_block_input_ptr(h, 0);
  const outPtr = e.soemdsp_soft_clipper_block_output_ptr(h, 0);
  const mem = e.memory.buffer;
  const input = new Float64Array(mem, inPtr, frames);
  const out = new Float64Array(mem, outPtr, frames);

  let energy = 0;
  let n = 0;
  for (let b = 0; b < blocks; b += 1) {
    for (let i = 0; i < frames; i += 1) {
      input[i] = Math.sin((2 * Math.PI * (i + b * frames)) / 32);
    }
    e.soemdsp_soft_clipper_process_block(h, 0, frames);
    for (let i = 0; i < frames; i += 1) {
      energy += out[i] * out[i];
      n += 1;
    }
  }
  e.soemdsp_soft_clipper_destroy(h);
  return Math.sqrt(energy / Math.max(1, n));
}

const softRms = rmsAfterSetOnce(1);
const hardRms = rmsAfterSetOnce(0);
const ratio = softRms / Math.max(hardRms, 1e-30);

console.log({ softRms, hardRms, softOverHard: ratio });

if (!(hardRms > 1e-6)) {
  console.error("FAIL: hard knee produced near-silence");
  process.exit(1);
}
// Soft knee lets more energy through the headroom than hard clip at threshold.
if (!(ratio > 1.15)) {
  console.error(
    "FAIL: set-once knee did not stick — soft/hard ratio too small:",
    ratio,
  );
  process.exit(1);
}

console.log("soft_clipper param stickiness smoke OK");