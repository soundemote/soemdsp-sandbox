// Stickiness: set ladder cutoff ONCE, then process_block many times without
// rewriting params. Open vs closed must stay different (APP_POLICY).
// Run: node scripts/smoke_ladder_param_stick.mjs
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

const sr = 44100;
const frames = 128;
const blocks = 32;

function rmsAfterSetOnce(freqHz) {
  const h = e.soemdsp_ladder_filter_create();
  if (!h) throw new Error("create failed");
  // frequency, resonance, mode (LP), stages, sampleRate — once only
  e.soemdsp_ladder_filter_set_params(h, freqHz, 0.2, 1, 4, sr);
  const inPtr = e.soemdsp_ladder_filter_block_input_ptr(h);
  const outPtr = e.soemdsp_ladder_filter_block_output_ptr(h);
  const mem = e.memory.buffer;
  const input = new Float64Array(mem, inPtr, frames);
  const out = new Float64Array(mem, outPtr, frames);

  let energy = 0;
  let n = 0;
  for (let b = 0; b < blocks; b += 1) {
    for (let i = 0; i < frames; i += 1) {
      input[i] = Math.sin((2 * Math.PI * 4000 * (i + b * frames)) / sr);
    }
    e.soemdsp_ladder_filter_process_block(h, frames);
    for (let i = 0; i < frames; i += 1) {
      energy += out[i] * out[i];
      n += 1;
    }
  }
  e.soemdsp_ladder_filter_destroy(h);
  return Math.sqrt(energy / Math.max(1, n));
}

const openRms = rmsAfterSetOnce(8000);
const closedRms = rmsAfterSetOnce(40);
const ratio = openRms / Math.max(closedRms, 1e-30);

console.log({ openRms, closedRms, openOverClosed: ratio });

if (!(openRms > 1e-6)) {
  console.error("FAIL: open ladder produced near-silence");
  process.exit(1);
}
if (!(ratio > 4)) {
  console.error(
    "FAIL: set-once ladder cutoff did not stick — open/closed ratio too small:",
    ratio,
  );
  process.exit(1);
}

console.log("ladder_filter param stickiness smoke OK");
