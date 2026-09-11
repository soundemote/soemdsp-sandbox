import fs from "fs";
import vm from "vm";
const src = fs.readFileSync(
  "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/modules/transport/transport-display.js",
  "utf8",
);

// Split into preamble (1-21) and rest
const lines = src.split(/\r?\n/);
const pre = lines.slice(0, 22).join("\n");
const rest = lines.slice(22).join("\n");
for (const [name, code] of [
  ["pre", pre],
  ["rest", rest],
  ["pre+rest", pre + "\n" + rest],
  ["full", src],
]) {
  try {
    new vm.Script(code, { filename: name });
    console.log(name, "OK");
  } catch (e) {
    console.log(name, "FAIL", e.message);
  }
}

// Binary search which line in rest breaks when appended to pre
let good = 22;
for (let n = 23; n <= lines.length; n++) {
  const code = lines.slice(0, n).join("\n");
  try {
    new vm.Script(code, { filename: `n${n}` });
    good = n;
  } catch (e) {
    console.log("breaks at including line", n, e.message);
    console.log("line:", JSON.stringify(lines[n - 1]));
    // show open structure - count braces in good prefix
    const g = lines.slice(0, good).join("\n");
    let depth = 0;
    for (const ch of g) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    console.log("brace depth at good", good, depth);
    break;
  }
}
console.log("last good line count", good);
