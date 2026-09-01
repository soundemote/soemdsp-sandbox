const fs = require("fs");
const path = "public/node-graph-module-definitions.js";
let s = fs.readFileSync(path, "utf8");
let replaced = 0;
let inserted = 0;

// Within each `{ ... key: "seed" ... }` object (non-greedy, no nested braces), force maxDigits: 0.
s = s.replace(/\{[^{}]*key:\s*"seed"[^{}]*\}/g, (block) => {
  if (/maxDigits:\s*0\b/.test(block)) return block;
  if (/maxDigits:\s*\d+/.test(block)) {
    replaced += 1;
    return block.replace(/maxDigits:\s*\d+/, "maxDigits: 0");
  }
  inserted += 1;
  return block.replace(/(key:\s*"seed",)/, "$1\n        maxDigits: 0,");
});

fs.writeFileSync(path, s);
console.log(JSON.stringify({ replaced, inserted }));
