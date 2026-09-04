// Stickiness: set saturate (soft-clip latch) ONCE, then process many samples
// without rewriting params. Narrow vs wide must stay different (APP_POLICY).
// Soft-clip runs on the feedback path before wet in PreDelay — audible in wet.
// (Feedback LPF is applied after the wet tap in PostDelay, so it is a poor
// acoustic probe here; saturate covers the same flattened-latch contract.)
// Run: node scripts/smoke_soem_reverb_param_stick.mjs
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

function wetRmsAfterSetOnce(saturate) {
  const h = e.soemdsp_soem_reverb_create(sr);
  if (!h) throw new Error("create failed");
  e.soemdsp_soem_reverb_set_params(
    h,
    1.0, // mix wet
    1.0, // volume
    0.03,
    0.9,
    2,
    0.02,
    0.2,
    1,
    0,
    0.5,
    0,
    0,
    1, // PreDelay — clip(in+fb) before diffuse/echo/wet
    0,
    0,
    saturate,
    8000, // LPF (latched once with saturate; not rewritten later)
    20,
    1000,
    0,
    1,
    2,
    0,
    1,
    0.04,
  );

  let energy = 0;
  let n = 0;
  for (let i = 0; i < samples; i += 1) {
    // Hot drive so saturate width dominates wet RMS.
    const x = 3.0 * Math.sin((2 * Math.PI * 220 * i) / sr);
    e.soemdsp_soem_reverb_process(h, x, x);
    if (i >= measureFrom) {
      const w = e.soemdsp_soem_reverb_wet_left(h);
      energy += w * w;
      n += 1;
    }
  }
  e.soemdsp_soem_reverb_destroy(h);
  return Math.sqrt(energy / Math.max(1, n));
}

const wideRms = wetRmsAfterSetOnce(4.0);
const narrowRms = wetRmsAfterSetOnce(0.15);
const ratio = wideRms / Math.max(narrowRms, 1e-30);

console.log({ wideRms, narrowRms, wideOverNarrow: ratio });

if (!(narrowRms > 1e-8)) {
  console.error("FAIL: narrow saturate produced near-silence");
  process.exit(1);
}
if (!(ratio > 1.8)) {
  console.error(
    "FAIL: set-once reverb saturate did not stick — wide/narrow ratio too small:",
    ratio,
  );
  process.exit(1);
}

console.log("soem_reverb param stickiness smoke OK");
