// Passive Filter BP is HP→LP in series. Crossing HPF above LPF must attenuate
// (collapsed passband) — never auto-sort cutoffs into a always-open band.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;

const must = (n) => {
  if (typeof e[n] !== "function") throw new Error(`missing ${n}`);
  return e[n];
};

const create = must("soemdsp_passive_filter_create");
const destroy = must("soemdsp_passive_filter_destroy");
const sample = must("soemdsp_passive_filter_sample_ex");
const version = must("soemdsp_passive_filter_version");

const SR = 44100;
const MODE_BP = 1;
const N = 4096;
const TONE_HZ = 800;

function rmsFor(hpf, lpf, slope = 3) {
  const h = create() | 0;
  if (!h) throw new Error("create");
  let phase = 0;
  const inc = (TONE_HZ * 2 * Math.PI) / SR;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const x = Math.sin(phase);
    phase += inc;
    const y = sample(h, x, MODE_BP, hpf, lpf, SR, slope, 1.0, 0.0, 1.0);
    sum += y * y;
  }
  destroy(h);
  return Math.sqrt(sum / N);
}

const ver = version() | 0;
if (ver < 3) throw new Error(`passive_filter version ${ver} < 3 (need no-sort BP)`);

const openBand = rmsFor(200, 2000); // HPF < tone < LPF
const crossed = rmsFor(2000, 200); // HPF > LPF — should crush
const narrow = rmsFor(700, 900); // tone near center of narrow band

console.log({ ver, openBand, crossed, narrow, ratio: openBand / Math.max(crossed, 1e-12) });

if (!(openBand > 0.05)) {
  throw new Error(`open BP too quiet: ${openBand}`);
}
if (!(crossed < openBand * 0.05)) {
  throw new Error(
    `crossed HPF>LPF did not collapse band: crossed=${crossed} open=${openBand} (auto-sort still active?)`,
  );
}
console.log("passive filter crossed BP smoke OK");
