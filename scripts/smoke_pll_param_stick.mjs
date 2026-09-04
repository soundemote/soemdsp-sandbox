// Stickiness: set PLL loop-filter cutoff ONCE, then process many samples
// without rewriting params. Low vs high cutoff must stay different (APP_POLICY).
// Run: node scripts/smoke_pll_param_stick.mjs
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
const samples = 8192;
const measureFrom = 2048;

function slewRmsAfterSetOnce(frequHz) {
  const h = e.soemdsp_pll_create(sr);
  if (!h) throw new Error("create failed");
  // sampleRate, range, offset, type (PC2), frequ — once only
  e.soemdsp_pll_set_params(h, sr, 1, 5, 1, frequHz);

  let energy = 0;
  let n = 0;
  let prev = e.soemdsp_pll_lpf_out(h);
  for (let i = 0; i < samples; i += 1) {
    // Square-ish external signal so PC chatters and LPF cutoff matters.
    const sig = ((i % 64) < 32) ? 1.0 : -1.0;
    e.soemdsp_pll_process(h, sig, 0, 0);
    const y = e.soemdsp_pll_lpf_out(h);
    if (i >= measureFrom) {
      const d = y - prev;
      energy += d * d;
      n += 1;
    }
    prev = y;
  }
  e.soemdsp_pll_destroy(h);
  return Math.sqrt(energy / Math.max(1, n));
}

const openSlew = slewRmsAfterSetOnce(2000);
const closedSlew = slewRmsAfterSetOnce(2);
const ratio = openSlew / Math.max(closedSlew, 1e-30);

console.log({ openSlew, closedSlew, openOverClosed: ratio });

if (!(openSlew > 1e-8)) {
  console.error("FAIL: open PLL LPF produced near-zero slew");
  process.exit(1);
}
if (!(ratio > 2)) {
  console.error(
    "FAIL: set-once PLL LPF did not stick — open/closed slew ratio too small:",
    ratio,
  );
  process.exit(1);
}

console.log("pll param stickiness smoke OK");
