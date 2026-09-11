const fs = require("fs");
const vm = require("vm");
let s = fs.readFileSync("public/modules/transport/transport-display.js", "utf8");
// Strip block and line comments roughly
s = s.replace(/\/\*[\s\S]*?\*\//g, "");
s = s.replace(/^\s*\/\/.*$/gm, "");
// Replace non-ascii
s = s.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "_");
try {
  new vm.Script(s);
  console.log("stripped OK");
} catch (e) {
  console.log("stripped FAIL", e.message);
}
// Show code points around fonts.load
const raw = fs.readFileSync("public/modules/transport/transport-display.js", "utf8");
const i = raw.indexOf("fonts.load");
console.log([...raw.slice(i, i+80)].map(c => c + "(" + c.charCodeAt(0) + ")").join(" "));
// Try require as if it were CJS in isolation via Function with use strict
try {
  Function('"use strict";\n' + raw)();
  console.log("exec OK");
} catch (e) {
  console.log("exec", e.name, e.message);
}
