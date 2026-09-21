// After geometry has settled, changing only diffusionAmount must still
// change process_block wet. Catches the skip-applyDelayGeometry freeze.
// Run: node scripts/smoke_sabrina_diffusion_live.mjs
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

function setParams(h, diffusionAmount) {
  e.soemdsp_sabrina_reverb_set_params(
    h,
    1.0, // mix wet
    0.35, // diffusionSize
    diffusionAmount,
    0.08, // delaySize
    0.85, // recycle
    0.0, // lfoAmplitude (geometry settled, no extra motion)
    0.83,
    0.001,
    0,
  );
}

function processBlock(h, fill) {
  const inLPtr = e.soemdsp_sabrina_reverb_block_input_left_ptr(h);
  const inRPtr = e.soemdsp_sabrina_reverb_block_input_right_ptr(h);
  const outLPtr = e.soemdsp_sabrina_reverb_block_output_left_ptr(h);
  if (!inLPtr || !inRPtr || !outLPtr) {
    throw new Error("block ptr failed");
  }
  const mem = e.memory.buffer;
  const inL = new Float64Array(mem, inLPtr, frames);
  const inR = new Float64Array(mem, inRPtr, frames);
  const outL = new Float64Array(mem, outLPtr, frames);
  fill(inL, inR);
  e.soemdsp_sabrina_reverb_process_block(h, frames, 1);
  return outL;
}

function wetRmsAfterSettleThenAmount(amount) {
  const h = e.soemdsp_sabrina_reverb_create(sr);
  if (!h) throw new Error("create failed");
  setParams(h, 0.7);
  // ~0.25 s so Size/LFO ramps settle and applyDelayGeometry is skipped.
  const settleBlocks = Math.ceil((sr * 0.25) / frames);
  for (let b = 0; b < settleBlocks; b += 1) {
    processBlock(h, (inL, inR) => {
      for (let i = 0; i < frames; i += 1) {
        const x = 0.4 * Math.sin((2 * Math.PI * 220 * (b * frames + i)) / sr);
        inL[i] = x;
        inR[i] = x;
      }
    });
  }
  setParams(h, amount);
  let energy = 0;
  let n = 0;
  const measureBlocks = 48;
  for (let b = 0; b < measureBlocks; b += 1) {
    const outL = processBlock(h, (inL, inR) => {
      for (let i = 0; i < frames; i += 1) {
        const x = b === 0 && i < 16 ? 1.0 : 0.0;
        inL[i] = x;
        inR[i] = x;
      }
    });
    if (b >= 1) {
      for (let i = 0; i < frames; i += 1) {
        energy += outL[i] * outL[i];
        n += 1;
      }
    }
  }
  e.soemdsp_sabrina_reverb_destroy(h);
  return Math.sqrt(energy / Math.max(1, n));
}

const lowRms = wetRmsAfterSettleThenAmount(0.05);
const highRms = wetRmsAfterSettleThenAmount(0.95);
const ratio = highRms / Math.max(lowRms, 1e-30);

console.log({ lowRms, highRms, highOverLow: ratio });

if (!(lowRms > 1e-8) || !(highRms > 1e-8)) {
  console.error("FAIL: diffusion amount produced near-silence");
  process.exit(1);
}
if (!(ratio > 1.15) && !(1 / ratio > 1.15)) {
  console.error(
    "FAIL: diffusionAmount after settle did not change process_block wet:",
    ratio,
  );
  process.exit(1);
}
console.log("ok: sabrina diffusionAmount is live after geometry settle");
