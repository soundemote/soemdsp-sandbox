// Speaker Protector 2.0 state-machine checks. Run: node scripts/test_speaker_protector_2.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const mathPath = path.join(__dirname, "..", "public", "modules", "speakerProtector2", "speaker-protector-2-math.js");
const ctx = { Math, Number, console };
vm.runInNewContext(fs.readFileSync(mathPath, "utf8"), ctx);

const RATE = 48000;
const DROP = ctx.NODE_GRAPH_SPEAKER_PROTECTOR2_DROP_SECONDS;
const HOLD = ctx.NODE_GRAPH_SPEAKER_PROTECTOR2_HOLD_SECONDS;
const RISE = ctx.NODE_GRAPH_SPEAKER_PROTECTOR2_RISE_SECONDS;

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

function ok(name) {
  console.log("ok", name);
}

function blast(state, n) {
  let last = null;
  // HF square — DC would die in the 1 kHz high-pass detector.
  for (let i = 0; i < n; i += 1) {
    const x = i & 1 ? 8 : -8;
    last = ctx.nodeGraphSpeakerProtector2Protect(state, x, x, RATE);
  }
  return last;
}

function silence(state, n) {
  let last = null;
  for (let i = 0; i < n; i += 1) {
    last = ctx.nodeGraphSpeakerProtector2Protect(state, 0, 0, RATE);
  }
  return last;
}

function sineQuiet(state, n) {
  let last = null;
  for (let i = 0; i < n; i += 1) {
    const x = 0.2 * Math.sin((2 * Math.PI * 220 * i) / RATE);
    last = ctx.nodeGraphSpeakerProtector2Protect(state, x, x, RATE);
  }
  return last;
}

// 1. Silence stays idle / gain 1
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  const last = sineQuiet(state, RATE);
  if (last.mode !== "idle" || last.gain !== 1 || last.engaged) {
    fail(`silence should stay idle gain=1, got mode=${last.mode} gain=${last.gain}`);
  } else {
    ok("silence stays idle");
  }
}

// 2. Danger enters drop and reaches 0 in about dropTime
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  const dropSamples = Math.ceil(DROP * RATE) + 4;
  const last = blast(state, dropSamples);
  if (last.gain > 1e-4) {
    fail(`drop should reach 0 in ~${dropSamples} samples, gain=${last.gain}`);
  } else if (last.mode !== "hold" && last.mode !== "drop") {
    fail(`after drop expected hold/drop, got ${last.mode}`);
  } else {
    ok("drop reaches 0");
  }
}

// 3. Hold stays at 0 for 0.333s after danger stops
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  blast(state, Math.ceil(DROP * RATE) + 8);
  const holdSamples = Math.round(HOLD * RATE);
  const mid = silence(state, holdSamples - 8);
  if (mid.gain > 1e-4 || mid.mode !== "hold") {
    fail(`mid-hold should be gain=0 hold, got gain=${mid.gain} mode=${mid.mode}`);
  } else {
    ok("hold stays muted");
  }
  const after = silence(state, 16);
  if (after.mode !== "rise" && after.mode !== "idle") {
    fail(`after hold should rise, got ${after.mode}`);
  } else {
    ok("hold lasts ~0.333s then rises");
  }
}

// 4. Rise reaches 1 in about riseTime
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  blast(state, Math.ceil(DROP * RATE) + 8);
  silence(state, Math.round(HOLD * RATE) + 4);
  const last = silence(state, Math.ceil(RISE * RATE) + 8);
  if (last.gain < 1 - 1e-4 || last.mode !== "idle") {
    fail(`rise should reach idle/1, got gain=${last.gain} mode=${last.mode}`);
  } else {
    ok("rise reaches 1");
  }
}

// 5. Pulse during rise restarts drop
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  blast(state, Math.ceil(DROP * RATE) + 8);
  silence(state, Math.round(HOLD * RATE) + 4);
  silence(state, Math.floor(RISE * RATE * 0.3));
  const midRise = ctx.nodeGraphSpeakerProtector2Protect(state, 0, 0, RATE);
  if (midRise.mode !== "rise" || midRise.gain <= 0.05) {
    fail(`expected mid-rise, got mode=${midRise.mode} gain=${midRise.gain}`);
  }
  const retrig = blast(state, Math.ceil(DROP * RATE) + 8);
  if (retrig.gain > 1e-4) {
    fail(`retrigger during rise should drop to 0, gain=${retrig.gain}`);
  } else {
    ok("retrigger during rise drops");
  }
}

// 6. Pulse during hold resets hold clock; stays muted
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  blast(state, Math.ceil(DROP * RATE) + 8);
  silence(state, Math.round(HOLD * RATE * 0.8));
  blast(state, 4);
  const still = silence(state, Math.round(HOLD * RATE * 0.5));
  if (still.gain > 1e-4) {
    fail(`hold retrigger should stay muted, gain=${still.gain} mode=${still.mode}`);
  } else {
    ok("hold retrigger stays muted");
  }
}

// 7. Output is input * gain (stereo linked)
{
  const state = ctx.createNodeGraphSpeakerProtector2State(RATE);
  state.gain = 0.5;
  state.mode = "rise";
  const out = ctx.nodeGraphSpeakerProtector2Protect(state, 0.4, -0.2, RATE);
  const g = out.gain;
  if (Math.abs(out.left - 0.4 * g) > 1e-9 || Math.abs(out.right + 0.2 * g) > 1e-9) {
    fail(`VCA mismatch L=${out.left} R=${out.right} g=${g}`);
  } else {
    ok("output is input * gain");
  }
}

if (process.exitCode) {
  console.error("speaker protector 2 tests failed");
} else {
  console.log("speaker protector 2 tests passed");
}
