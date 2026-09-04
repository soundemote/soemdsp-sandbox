// Headless stickiness: set feedback-filter cutoff ONCE, then process_block
// many times WITHOUT rewriting params. Open vs closed must stay different.
// Catches "works while dragging / reverts when released" regressions.
// Run: node scripts/smoke_ping_pong_param_stick.mjs
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
const blocks = 64;

function wetRmsAfterSetOnce(lpfHz) {
  const h = e.soemdsp_ping_pong_delay_create();
  if (!h) throw new Error("create failed");
  // set_params once — then only process_block (no per-sample rewrite).
  e.soemdsp_ping_pong_delay_set_params(
    h,
    0.95, // feedback
    1.0, // mix wet
    1.0, // amp
    1,
    64, // short delay
    0,
    0,
    0,
    0,
    0,
    0,
    1, // saturate
    lpfHz,
    20, // hpf
    120,
    sr,
  );
  const inPtr = e.soemdsp_ping_pong_delay_block_input_ptr(h);
  const outLPtr = e.soemdsp_ping_pong_delay_block_output_left_ptr(h);
  const mem = e.memory.buffer;
  const input = new Float64Array(mem, inPtr, frames);
  const outL = new Float64Array(mem, outLPtr, frames);

  let energy = 0;
  let n = 0;
  for (let b = 0; b < blocks; b += 1) {
    for (let i = 0; i < frames; i += 1) {
      // Short HF burst into the first block only.
      input[i] = b === 0 && i < 32
        ? Math.sin((2 * Math.PI * 4000 * i) / sr)
        : 0;
    }
    e.soemdsp_ping_pong_delay_process_block(h, frames);
    if (b >= 8) {
      for (let i = 0; i < frames; i += 1) {
        energy += outL[i] * outL[i];
        n += 1;
      }
    }
  }
  e.soemdsp_ping_pong_delay_destroy(h);
  return Math.sqrt(energy / Math.max(1, n));
}

const openRms = wetRmsAfterSetOnce(8000);
const closedRms = wetRmsAfterSetOnce(20);
const zeroRms = wetRmsAfterSetOnce(0);
const ratio = openRms / Math.max(closedRms, 1e-30);

console.log({
  openRms,
  closedRms,
  zeroRms,
  openOverClosed: ratio,
});

// Open feedback must stay much louder than a 20 Hz feedback LPF after
// many blocks with no further set_params. Zero must be near silent.
if (!(openRms > 1e-6)) {
  console.error("FAIL: open LPF produced near-silence");
  process.exit(1);
}
if (!(ratio > 8)) {
  console.error(
    "FAIL: set-once LPF did not stick — open/closed ratio too small:",
    ratio,
  );
  process.exit(1);
}
if (!(zeroRms < closedRms * 0.25 + 1e-9)) {
  console.error("FAIL: LPF=0 should be quieter than LPF=20 after set-once");
  process.exit(1);
}

console.log("ping_pong param stickiness smoke OK");
