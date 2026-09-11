import fs from "fs";
const lines = fs.readFileSync(
  "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/modules/transport/transport-display.js",
  "utf8",
).split(/\r?\n/);
for (const n of [16, 17, 18, 19, 20, 21]) {
  const line = lines[n];
  console.log("---", n + 1, "---");
  console.log(line);
  console.log([...line].map((ch) => `${ch}:${ch.charCodeAt(0)}`).join(" "));
}

// Test minimal repro of lines 16-21
const chunk = lines.slice(16, 22).join("\n");
console.log("\nCHUNK:\n", chunk);
try {
  new Function(chunk);
  console.log("chunk OK");
} catch (e) {
  console.log("chunk FAIL", e.message);
}

// Whole file with line 17-21 removed
const stripped = [...lines.slice(0, 16), "let nodeGraphTransportBpmFontReady = false;", ...lines.slice(22)].join("\n");
try {
  new Function(stripped);
  console.log("stripped font load OK");
} catch (e) {
  console.log("stripped FAIL", e.message);
}
