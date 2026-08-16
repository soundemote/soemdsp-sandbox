// Music Player 100-window library. Run: node scripts/test_audio_player_library.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const mathPath = path.join(__dirname, "..", "public", "modules", "audioPlayer", "audio-player-library.js");
const ctx = { Math, Number, console, globalThis: {} };
vm.runInNewContext(fs.readFileSync(mathPath, "utf8"), ctx);

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

function ok(name) {
  console.log("ok", name);
}

const catalog = Array.from({ length: 250 }, (_, i) => ({
  path: `C:/music/track-${String(i).padStart(3, "0")}.mp3`,
  name: `track-${String(i).padStart(3, "0")}.mp3`,
  bytes: 1000 + i,
}));

{
  const first = ctx.nodeGraphAudioPlayerLibraryPickWindow(catalog, [], 100, false);
  if (first.items.length !== 100) {
    fail(`first window should be 100, got ${first.items.length}`);
  } else if (first.items[0].path !== catalog[0].path || first.items[99].path !== catalog[99].path) {
    fail("sequential first window should be catalog 0..99");
  } else if (first.used.length !== 100) {
    fail(`used should be 100, got ${first.used.length}`);
  } else {
    ok("sequential first window is 100 in order");
  }

  const second = ctx.nodeGraphAudioPlayerLibraryPickWindow(catalog, first.used, 100, false);
  if (second.items.length !== 100) {
    fail(`second window should be 100, got ${second.items.length}`);
  } else if (second.items[0].path !== catalog[100].path) {
    fail("second window should start at catalog 100");
  } else {
    ok("sequential next 100 continues after used");
  }
}

{
  const first = ctx.nodeGraphAudioPlayerLibraryPickWindow(catalog, [], 100, true);
  const second = ctx.nodeGraphAudioPlayerLibraryPickWindow(catalog, first.used, 100, true);
  const overlap = second.items.filter((item) => first.used.includes(item.path));
  if (first.items.length !== 100 || second.items.length !== 100) {
    fail("shuffle windows should be 100");
  } else if (overlap.length) {
    fail("shuffle next 100 should not replay used paths");
  } else {
    ok("shuffle only applies when filling the next 100");
  }
}

{
  const first = ctx.nodeGraphAudioPlayerLibraryPickWindow(catalog, [], 100, false);
  const snapshot = first.items.map((item) => item.path).join("|");
  const again = ctx.nodeGraphAudioPlayerLibraryPickWindow(catalog, [], 100, false);
  if (again.items.map((item) => item.path).join("|") !== snapshot) {
    fail("unshuffled fill should stay stable");
  } else {
    ok("playing window order is not reshuffled");
  }
}

{
  const card = ctx.nodeGraphAudioPlayerLibraryNormalizeCard({
    path: "C:/music/album/song.wav",
    rel: "album/song.wav",
    bytes: 12,
  }, 0);
  if (!card || card.sampleId) {
    fail("catalog card should have path and no sampleId");
  } else if (card.name !== "album/song.wav") {
    fail(`dive card should show relative name, got ${card.name}`);
  } else {
    ok("cards store path metadata only");
  }
}

if (process.exitCode) {
  console.error("audio player library tests failed");
} else {
  console.log("audio player library tests passed");
}
