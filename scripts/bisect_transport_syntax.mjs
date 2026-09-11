import fs from "fs";
const path = "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/modules/transport/transport-display.js";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
console.log("lines", lines.length);

function ok(n) {
  const src = lines.slice(0, n).join("\n");
  try {
    new Function(src);
    return true;
  } catch {
    return false;
  }
}

let lo = 1, hi = lines.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (ok(mid)) lo = mid + 1;
  else hi = mid;
}
console.log("first failing line count", lo);
console.log("around:");
for (let i = Math.max(0, lo - 5); i < Math.min(lines.length, lo + 3); i++) {
  console.log(String(i + 1).padStart(4), JSON.stringify(lines[i]));
}

// Also try each cumulative with error message
for (const n of [20, 40, 60, 80, 100, 120, 140, 160, 178, 179]) {
  const src = lines.slice(0, n).join("\n");
  try {
    new Function(src);
    console.log(n, "OK");
  } catch (e) {
    console.log(n, "FAIL", e.message);
  }
}
