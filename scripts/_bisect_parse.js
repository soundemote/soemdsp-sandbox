const fs = require("fs");
const vm = require("vm");
const s = fs.readFileSync("public/modules/transport/transport-display.js", "utf8");
// Try parsing as script with sourceURL
try {
  new vm.Script(s, { filename: "transport-display.js" });
  console.log("vm OK");
} catch (e) {
  console.log("vm", e.message, e.stack?.split("\n").slice(0,4).join(" | "));
}
// Binary search for parse failure
const lines = s.split(/\n/);
let lo = 0, hi = lines.length;
while (lo + 1 < hi) {
  const mid = (lo + hi) >> 1;
  const chunk = lines.slice(0, mid).join("\n");
  try {
    new vm.Script(chunk, { filename: "t.js" });
    lo = mid;
  } catch {
    hi = mid;
  }
}
console.log("fails when adding line", hi, "content:", JSON.stringify(lines[hi-1]));
console.log("prev:", JSON.stringify(lines[hi-2]));
console.log("next:", JSON.stringify(lines[hi]));
