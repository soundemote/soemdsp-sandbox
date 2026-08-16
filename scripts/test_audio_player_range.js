// Music Player digital start/end time → 0…1 phase. Run: node scripts/test_audio_player_range.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const mathPath = path.join(__dirname, "..", "public", "modules", "audioPlayer", "audio-player-math.js");
const ctx = { Math, Number, console };
vm.runInNewContext(fs.readFileSync(mathPath, "utf8"), ctx);

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

function ok(name) {
  console.log("ok", name);
}

{
  const phase = ctx.nodeGraphAudioPlayerTimeSecondsToPhase(10, 441000, 44100);
  if (Math.abs(phase - 1) > 1e-12) {
    fail(`10s of 10s file should be 1, got ${phase}`);
  } else {
    ok("full-length time is phase 1");
  }
}

{
  const phase = ctx.nodeGraphAudioPlayerTimeSecondsToPhase(2.5, 441000, 44100);
  if (Math.abs(phase - 0.25) > 1e-12) {
    fail(`2.5s of 10s file should be 0.25, got ${phase}`);
  } else {
    ok("mid-file time is 0.25");
  }
}

{
  const phase = ctx.nodeGraphAudioPlayerTimeSecondsToPhase(-3, 441000, 44100);
  if (phase !== 0) {
    fail(`negative time should clamp to 0, got ${phase}`);
  } else {
    ok("negative time clamps to 0");
  }
}

{
  const phase = ctx.nodeGraphAudioPlayerTimeSecondsToPhase(99, 441000, 44100);
  if (phase !== 1) {
    fail(`over-duration time should clamp to 1, got ${phase}`);
  } else {
    ok("over-duration time clamps to 1");
  }
}

{
  const range = ctx.nodeGraphAudioPlayerResolvedPhaseRange({
    frames: 441000,
    sampleRate: 44100,
    readParam: (key, fallback) => (key === "start" ? 0.1 : key === "end" ? 0.9 : fallback),
    hasInput: () => false,
  });
  if (Math.abs(range.startPhase - 0.1) > 1e-12 || Math.abs(range.endPhase - 0.9) > 1e-12) {
    fail(`unconnected should use sliders, got ${range.startPhase}…${range.endPhase}`);
  } else {
    ok("unconnected uses sliders");
  }
}

{
  const range = ctx.nodeGraphAudioPlayerResolvedPhaseRange({
    frames: 441000,
    sampleRate: 44100,
    readParam: (key, fallback) => (key === "start" ? 0.1 : key === "end" ? 0.9 : fallback),
    hasInput: (port) => port === "Start Time" || port === "End Time",
    readInput: (port) => (port === "Start Time" ? 2 : 8),
  });
  if (Math.abs(range.startPhase - 0.2) > 1e-12 || Math.abs(range.endPhase - 0.8) > 1e-12) {
    fail(`connected seconds should become phase, got ${range.startPhase}…${range.endPhase}`);
  } else {
    ok("connected seconds become phase");
  }
}

if (process.exitCode) {
  console.error("audio player range tests failed");
} else {
  console.log("audio player range tests passed");
}
