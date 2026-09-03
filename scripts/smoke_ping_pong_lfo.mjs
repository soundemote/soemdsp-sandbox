// Headless: Ping Pong LFO phase persists across blocks; Amp modulates delay.
// Run: node scripts/_smoke_ping_pong_lfo.mjs
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

const ver = e.soemdsp_ping_pong_delay_version();
console.log("ping_pong_delay version", ver);
if (ver < 15) {
  console.error("FAIL: expected version >= 15 (flat LFO; no JS twin)");
  process.exit(1);
}

const h = e.soemdsp_ping_pong_delay_create();
if (!h) {
  console.error("FAIL: create");
  process.exit(1);
}

const sr = 44100;
const frames = 128;
// 1/4 note @ 120 bpm = 0.5 s base; Amp 25 ms; Rate 1 Hz
e.soemdsp_ping_pong_delay_set_params(
  h,
  0.35, // feedback
  1.0, // mix (wet only — easier to hear/see delay motion)
  1.0, // amplitude
  1, // numer
  4, // denom
  0, // timing normal
  0, // offset ms
  25, // lfoAmp ms
  0, // style parabol
  1.0, // lfoRate Hz
  0.25, // vary
  1, // saturate
  8000,
  20,
  120, // bpm
  sr,
);

const inPtr = e.soemdsp_ping_pong_delay_block_input_ptr(h);
const outLPtr = e.soemdsp_ping_pong_delay_block_output_left_ptr(h);
const modLPtr = e.soemdsp_ping_pong_delay_block_output_mod_left_ptr(h);
const mem = e.memory.buffer;
const input = new Float64Array(mem, inPtr, frames);
const outL = new Float64Array(mem, outLPtr, frames);
const modL = new Float64Array(mem, modLPtr, frames);

// Impulse into first sample of first block so wet has something to delay.
input.fill(0);
input[0] = 1;

e.soemdsp_ping_pong_delay_process_block(h, frames);
const modBlock0First = modL[0];
const modBlock0Last = modL[frames - 1];
const outBlock0Peak = Math.max(...outL.map(Math.abs));

// Next blocks: silence in, LFO must keep advancing (not reset to block0 pattern).
input.fill(0);
e.soemdsp_ping_pong_delay_process_block(h, frames);
const modBlock1First = modL[0];
const modBlock1Last = modL[frames - 1];

e.soemdsp_ping_pong_delay_process_block(h, frames);
const modBlock2First = modL[0];

// sample()-path phase continuity
let sampleMods = [];
for (let i = 0; i < 256; i++) {
  e.soemdsp_ping_pong_delay_sample(
    h, 0, 0.35, 1, 1, 1, 4, 0, 0, 25, 0, 1, 0.25, 1, 8000, 20, 120, sr,
  );
  sampleMods.push(e.soemdsp_ping_pong_delay_mod_left(h));
}
const sampleSpan = Math.max(...sampleMods) - Math.min(...sampleMods);

console.log({
  modBlock0First,
  modBlock0Last,
  modBlock1First,
  modBlock1Last,
  modBlock2First,
  outBlock0Peak,
  sampleSpan,
});

const deltaWithin0 = Math.abs(modBlock0Last - modBlock0First);
const jumpedAcrossBlocks = Math.abs(modBlock1First - modBlock0Last) < 0.05;
const notIdenticalRestart =
  Math.abs(modBlock1First - modBlock0First) > 1e-4
  || Math.abs(modBlock2First - modBlock0First) > 1e-4;

let fail = false;
if (!(deltaWithin0 > 1e-4)) {
  console.error("FAIL: LFO did not move within block 0");
  fail = true;
}
if (!jumpedAcrossBlocks && Math.abs(modBlock1First - modBlock0Last) > 0.2) {
  // Allow wrap near ±1; just ensure we didn't hard-reset to block0 start.
  console.warn("WARN: large jump across blocks (may be wrap)");
}
if (!notIdenticalRestart) {
  console.error("FAIL: LFO pattern restarts every block (phase reset)");
  fail = true;
}
if (!(sampleSpan > 0.01)) {
  console.error("FAIL: sample() LFO stuck; span=", sampleSpan);
  fail = true;
}
// With mix=1 and impulse, after ~0.5s we should eventually see wet — but within
// first block (128/44100 ≈ 3ms) wet is still silence. Just check outs finite.
if (!Number.isFinite(outBlock0Peak)) {
  console.error("FAIL: non-finite audio");
  fail = true;
}

// Amp=0 must still advance gold LFO, but delay stays at base (mod outs move).
e.soemdsp_ping_pong_delay_set_params(
  h, 0.35, 1, 1, 1, 4, 0, 0, 0 /* amp */, 0, 2.0 /* rate */, 0, 1, 8000, 20, 120, sr,
);
input.fill(0);
e.soemdsp_ping_pong_delay_process_block(h, frames);
const amp0First = modL[0];
e.soemdsp_ping_pong_delay_process_block(h, frames);
const amp0Next = modL[0];
if (!(Math.abs(amp0Next - amp0First) > 1e-5)) {
  console.error("FAIL: Rate with Amp=0 should still advance LFO outs");
  fail = true;
}

e.soemdsp_ping_pong_delay_destroy(h);
if (fail) process.exit(1);
console.log("ping_pong LFO smoke OK");
