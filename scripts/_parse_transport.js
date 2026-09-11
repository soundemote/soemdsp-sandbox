const fs = require("fs");
const s = fs.readFileSync("public/modules/transport/transport-display.js", "utf8");
let d = 0, p = 0, b = 0;
for (const c of s) {
  if (c === "{") d++;
  if (c === "}") d--;
  if (c === "(") p++;
  if (c === ")") p--;
  if (c === "[") b++;
  if (c === "]") b--;
}
console.log({ braces: d, parens: p, brackets: b, len: s.length });
console.log("tail:", JSON.stringify(s.slice(-80)));
try {
  new Function(s);
  console.log("Function OK");
} catch (e) {
  console.log("Function FAIL", e.message);
}
