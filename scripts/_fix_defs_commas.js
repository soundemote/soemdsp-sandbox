const fs = require("fs");
const path = "public/node-graph-module-definitions.js";
let s = fs.readFileSync(path, "utf8");
s = s.replace(/\{\s*,/g, "{");
s = s.replace(/,(\s*,)+/g, ",");
s = s.replace(/,(\s*\})/g, "$1");
fs.writeFileSync(path, s);
console.log("fixed leading commas");
