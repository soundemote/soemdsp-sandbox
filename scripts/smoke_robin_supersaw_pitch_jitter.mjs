// RobinSupersaw: pitch jitter depth = walk range; depth 0 freezes; face = detune+jitter.
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

const create = must("soemdsp_robin_supersaw_create");
const destroy = must("soemdsp_robin_supersaw_destroy");
const process = must("soemdsp_robin_supersaw_process_block");
const voiceCount = must("soemdsp_robin_supersaw_voice_count");
const voiceX = must("soemdsp_robin_supersaw_voice_x");
const version = must("soemdsp_robin_supersaw_version");

const ver = version() | 0;
if (ver < 24) throw new Error(`robin_supersaw version ${ver} < 24`);

function runBlock(h, opts) {
  const {
    freq = 220,
    detune = 0,
    voices = 7,
    jitSpeed = 8,
    jitDepth = 0,
    jitFilter = 40,
    jitSteps = 1, // Random
    maxHz = 20000,
    frames = 256,
  } = opts;
  process(
    h, freq, 44100, detune, voices, 1, 0, 0, 2,
    0, 0, 0, // porta min/max/style = hard bypass
    jitSpeed, jitDepth, jitFilter, jitSteps, 0, maxHz, 0, frames,
  );
}

function faceSpan(opts, blocks = 24) {
  const h = create() | 0;
  if (!h) throw new Error("create");
  for (let i = 0; i < 8; i++) runBlock(h, opts);
  const xs = [];
  for (let q = 0; q < blocks; q++) {
    runBlock(h, opts);
    const n = voiceCount(h) | 0;
    for (let i = 0; i < n; i++) xs.push(voiceX(h, i));
  }
  destroy(h);
  let minX = 1;
  let maxX = 0;
  for (const x of xs) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return { minX, maxX, span: maxX - minX };
}

// Warm walk then collapse depth — should freeze (span stays ~same across later blocks).
function freezeTest() {
  const h = create() | 0;
  for (let i = 0; i < 16; i++) {
    runBlock(h, { jitDepth: 50, jitSpeed: 12, jitFilter: 80 });
  }
  runBlock(h, { jitDepth: 50, jitSpeed: 12 });
  const n = voiceCount(h) | 0;
  const before = [];
  for (let i = 0; i < n; i++) before.push(voiceX(h, i));
  // Depth 0: freeze — more blocks must not wander
  for (let q = 0; q < 32; q++) {
    runBlock(h, { jitDepth: 0, jitSpeed: 12, jitFilter: 80 });
  }
  let maxDelta = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(voiceX(h, i) - before[i]);
    if (d > maxDelta) maxDelta = d;
  }
  destroy(h);
  return { maxDelta, n };
}

const off = faceSpan({ jitDepth: 0, detune: 0 });
const on = faceSpan({ jitDepth: 40, detune: 0, jitSteps: 1 });
const seated = faceSpan({ jitDepth: 0, detune: 60 }); // detune-only seats
const seatedPlus = faceSpan({ jitDepth: 30, detune: 60 });
const freeze = freezeTest();

console.log({ ver, off, on, seated, seatedPlus, freeze });

if (!(off.span < 0.02)) throw new Error(`depth0+detune0 should be still: ${off.span}`);
if (!(on.span > 0.01)) throw new Error(`depth>0 should move face: ${on.span}`);
// Detune alone spreads; jitter on top widens further from those seats.
if (!(seated.span > 0.02)) throw new Error(`detune should seat spread: ${seated.span}`);
if (!(seatedPlus.span > seated.span * 0.9)) {
  throw new Error(`jitter should wander around detune seats: seated=${seated.span} +jit=${seatedPlus.span}`);
}
if (!(freeze.maxDelta < 0.005)) {
  throw new Error(`depth→0 must freeze in place, not reset: maxDelta=${freeze.maxDelta}`);
}
console.log("robin supersaw pitch jitter smoke OK");
