// Speaker Protector 2.0 state-machine checks against the native module
// (native_modules/speaker_protector2/speaker_protector2.wasm).
// Run: node scripts/test_speaker_protector_2.js
const fs = require("fs");
const path = require("path");

const wasmPath = path.join(__dirname, "..", "native_modules", "speaker_protector2", "speaker_protector2.wasm");
const sp2 = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(wasmPath)), {}).exports;

const RATE = 48000;
const DROP = 0.008;
const HOLD = 0.333;
const RISE = 0.375;
const PLANCK = 1e-7;
const OUT = sp2.soemdsp_speaker_protector2_block_left_ptr();
const outView = () => new Float64Array(sp2.memory.buffer, OUT, 3);

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

function ok(name) {
  console.log("ok", name);
}

function create() {
  const handle = sp2.soemdsp_speaker_protector2_create();
  if (!(handle > 0)) throw new Error("soemdsp_speaker_protector2_create failed");
  return handle;
}

// One frame through the module path (default drop/hold/rise).
function frame(handle, left, right = left) {
  sp2.soemdsp_speaker_protector2_sample(handle, left, right, RATE, DROP, HOLD, RISE, OUT, OUT + 8, OUT + 16);
  const out = outView();
  return { left: out[0], right: out[1], mono: out[2], gain: sp2.soemdsp_speaker_protector2_gain(handle) };
}

// Render Sample path: in-place block, returns protection count.
function block(handle, lefts, rights = lefts) {
  const cap = sp2.soemdsp_speaker_protector2_max_block_frames();
  const l = new Float64Array(sp2.memory.buffer, sp2.soemdsp_speaker_protector2_block_left_ptr(), cap);
  const r = new Float64Array(sp2.memory.buffer, sp2.soemdsp_speaker_protector2_block_right_ptr(), cap);
  for (let i = 0; i < lefts.length; i += 1) {
    l[i] = lefts[i];
    r[i] = rights[i];
  }
  const count = sp2.soemdsp_speaker_protector2_process_block(handle, lefts.length, RATE);
  return { count, left: Array.from(l.subarray(0, lefts.length)), right: Array.from(r.subarray(0, lefts.length)) };
}

function blast(handle, n) {
  let last = null;
  // HF square: DC would die in the 1 kHz high-pass detector.
  for (let i = 0; i < n; i += 1) last = frame(handle, i & 1 ? 8 : -8);
  return last;
}

function silence(handle, n) {
  let last = null;
  for (let i = 0; i < n; i += 1) last = frame(handle, 0);
  return last;
}

// 1. Quiet signal stays at gain 1 and passes untouched
{
  const h = create();
  let worst = 0;
  let last = null;
  for (let i = 0; i < RATE; i += 1) {
    const x = 0.2 * Math.sin((2 * Math.PI * 220 * i) / RATE);
    last = frame(h, x);
    worst = Math.max(worst, Math.abs(last.left - x));
  }
  if (last.gain !== 1 || worst !== 0) fail(`quiet should stay gain=1 untouched, gain=${last.gain} diff=${worst}`);
  else ok("quiet stays gain 1");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 2. Danger drops gain to 0 in about dropTime
{
  const h = create();
  const last = blast(h, Math.ceil(DROP * RATE) + 4);
  if (last.gain > 1e-4) fail(`drop should reach 0, gain=${last.gain}`);
  else ok("drop reaches 0");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 3. Hold stays at 0 for 0.333 s after danger stops, then rises
{
  const h = create();
  blast(h, Math.ceil(DROP * RATE) + 8);
  const holdSamples = Math.round(HOLD * RATE);
  const mid = silence(h, holdSamples - 8);
  if (mid.gain !== 0) fail(`mid-hold should be gain=0, got ${mid.gain}`);
  else ok("hold stays muted");
  const after = silence(h, 16);
  if (!(after.gain > 0)) fail(`after hold gain should rise, got ${after.gain}`);
  else ok("hold lasts ~0.333s then rises");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 4. Rise reaches 1 in about riseTime
{
  const h = create();
  blast(h, Math.ceil(DROP * RATE) + 8);
  silence(h, Math.round(HOLD * RATE) + 4);
  const last = silence(h, Math.ceil(RISE * RATE) + 8);
  if (last.gain !== 1) fail(`rise should reach 1, got ${last.gain}`);
  else ok("rise reaches 1");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 5. Pulse during rise restarts drop
{
  const h = create();
  blast(h, Math.ceil(DROP * RATE) + 8);
  silence(h, Math.round(HOLD * RATE) + 4);
  silence(h, Math.floor(RISE * RATE * 0.3));
  const midRise = frame(h, 0);
  if (!(midRise.gain > 0.05 && midRise.gain < 1)) fail(`expected mid-rise, gain=${midRise.gain}`);
  const retrig = blast(h, Math.ceil(DROP * RATE) + 8);
  if (retrig.gain > 1e-4) fail(`retrigger during rise should drop to 0, gain=${retrig.gain}`);
  else ok("retrigger during rise drops");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 6. Pulse during hold resets the hold clock; stays muted
{
  const h = create();
  blast(h, Math.ceil(DROP * RATE) + 8);
  silence(h, Math.round(HOLD * RATE * 0.8));
  blast(h, 4);
  const still = silence(h, Math.round(HOLD * RATE * 0.5));
  if (still.gain > 1e-4) fail(`hold retrigger should stay muted, gain=${still.gain}`);
  else ok("hold retrigger stays muted");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 7. Output is input * gain, stereo linked (mid-rise)
{
  const h = create();
  blast(h, Math.ceil(DROP * RATE) + 8);
  silence(h, Math.round(HOLD * RATE) + 4);
  silence(h, Math.floor(RISE * RATE * 0.5));
  const out = frame(h, 0.4, -0.2);
  if (Math.abs(out.left - 0.4 * out.gain) > 1e-12 || Math.abs(out.right + 0.2 * out.gain) > 1e-12 || !(out.gain > 0 && out.gain < 1)) {
    fail(`VCA mismatch L=${out.left} R=${out.right} g=${out.gain}`);
  } else {
    ok("output is input * gain");
  }
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 8. Over-unity is scaled, never flattened
{
  const h = create();
  const out = frame(h, 3, -1.5);
  if (Math.abs(out.left - 1) > 1e-9 || Math.abs(out.right + 0.5) > 1e-9) fail(`expected 1 / -0.5, got ${out.left} / ${out.right}`);
  else ok("over-unity is scaled not clipped");
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 9. Unity must not trip; 1 + planck must trip (Render Sample block count)
{
  const h = create();
  const unity = block(h, new Array(64).fill(1), new Array(64).fill(1));
  if (unity.count !== 0 || unity.left.some((x) => x !== 1)) fail(`0 dB peak should not trip, count=${unity.count}`);
  else ok("0 dB does not trip");
  const edge = block(h, [1 + PLANCK], [-(1 + PLANCK)]);
  if (edge.count < 1) fail(`1 + ${PLANCK} should trip`);
  else ok("1e-7 over unity trips");
  const hb = create();
  const bad = block(hb, [NaN, Infinity], [0, 0]);
  if (bad.count < 2 || bad.left.some((x) => x !== 0)) fail(`non-finite should trip and output 0, count=${bad.count}`);
  else ok("non-finite trips and outputs 0");
  sp2.soemdsp_speaker_protector2_destroy(hb);
  sp2.soemdsp_speaker_protector2_destroy(h);
}

// 10. Render block path equals the per-frame module path
{
  const a = create();
  const b = create();
  const n = 4000;
  const xs = [];
  for (let i = 0; i < n; i += 1) xs.push(i > 1000 && i < 1010 ? 1.4 : 0.6 * Math.sin(i / 9));
  const blk = block(b, xs, xs.map((x) => -x * 0.5));
  let worst = 0;
  for (let i = 0; i < n; i += 1) {
    const f = frame(a, xs[i], -xs[i] * 0.5);
    worst = Math.max(worst, Math.abs(f.left - blk.left[i]), Math.abs(f.right - blk.right[i]));
  }
  if (worst !== 0) fail(`process_block should equal per-frame sample, max diff=${worst}`);
  else ok("process_block equals per-frame sample");
  sp2.soemdsp_speaker_protector2_destroy(a);
  sp2.soemdsp_speaker_protector2_destroy(b);
}

if (process.exitCode) {
  console.error("speaker protector 2 tests failed");
} else {
  console.log("speaker protector 2 tests passed");
}
