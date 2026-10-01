// Hyperpluck: PolyBLEP unison bank, shared phase start, Supersaw detune.
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

const create = must("soemdsp_hyperpluck_create");
const destroy = must("soemdsp_hyperpluck_destroy");
const process = must("soemdsp_hyperpluck_process_block");
const leftPtr = must("soemdsp_hyperpluck_block_output_left_ptr");
const voiceCount = must("soemdsp_hyperpluck_voice_count");
const voiceX = must("soemdsp_hyperpluck_voice_x");
const version = must("soemdsp_hyperpluck_version");

if ((version() | 0) < 1) throw new Error("hyperpluck version");

const mem = e.memory;
const f64 = () => new Float64Array(mem.buffer);

function run(h, opts = {}) {
  const {
    freq = 220,
    detune = 30,
    voices = 7,
    stereo = 1, // Alternating
    algo = 2,
    wave = 1, // Saw
    reset = 0,
    inc = 0,
    frames = 128,
  } = opts;
  process(h, freq, 44100, detune, voices, 1, stereo, algo, wave, 20000, reset, inc, frames);
}

const h = create() | 0;
if (!h) throw new Error("create");
run(h, { frames: 256 });
const n = voiceCount(h) | 0;
if (n !== 7) throw new Error(`alternating voice count ${n} !== 7`);
const xs = [];
for (let i = 0; i < n; i++) xs.push(voiceX(h, i));
const span = Math.max(...xs) - Math.min(...xs);
if (!(span > 0.01)) throw new Error(`detune face span ${span} too small`);

const ptr = leftPtr(h) | 0;
if (!ptr) throw new Error("left ptr");
const samples = f64().subarray(ptr >> 3, (ptr >> 3) + 256);
let peak = 0;
for (let i = 0; i < samples.length; i++) {
  const a = samples[i] < 0 ? -samples[i] : samples[i];
  if (a > peak) peak = a;
}
if (!(peak > 0.05)) throw new Error(`silent output peak=${peak}`);

run(h, { stereo: 0, frames: 8 });
const dualN = voiceCount(h) | 0;
if (dualN !== 14) throw new Error(`dual face count ${dualN} !== 14`);

run(h, { reset: 1, frames: 1 });
run(h, { reset: 0, freq: 0, inc: 0, frames: 64 });
const quietPtr = leftPtr(h) | 0;
const quiet = f64().subarray(quietPtr >> 3, (quietPtr >> 3) + 64);
let maxDelta = 0;
for (let i = 1; i < quiet.length; i++) {
  const d = quiet[i] - quiet[0];
  const a = d < 0 ? -d : d;
  if (a > maxDelta) maxDelta = a;
}
if (maxDelta > 1e-9) throw new Error(`0 Hz after reset still moving ${maxDelta}`);

destroy(h);
console.log("hyperpluck smoke OK", { peak, span, dualN });
