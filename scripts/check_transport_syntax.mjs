import fs from "fs";
import { createRequire } from "module";
const path = "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/modules/transport/transport-display.js";
const buf = fs.readFileSync(path);
console.log("len", buf.length, "bom", buf[0], buf[1], buf[2]);
const s = buf.toString("utf8");
// Find non-ascii
const odd = [];
for (let i = 0; i < s.length; i++) {
  const c = s.charCodeAt(i);
  if (c > 127 || c < 9 || (c > 13 && c < 32)) odd.push([i, c, s.slice(Math.max(0, i - 10), i + 10)]);
}
console.log("odd chars", odd.slice(0, 20));
try {
  new Function(s);
  console.log("new Function OK");
} catch (e) {
  console.log("new Function FAIL", e.message);
}
try {
  createRequire(import.meta.url)("fs"); // noop
  // Use vm.Script
  const vm = await import("vm");
  new vm.Script(s, { filename: path });
  console.log("vm.Script OK");
} catch (e) {
  console.log("vm.Script FAIL", e.message);
}
// Try espree/acorn if present
try {
  const acorn = await import("acorn");
  acorn.parse(s, { ecmaVersion: "latest" });
  console.log("acorn OK");
} catch (e) {
  console.log("acorn", e.message);
}
