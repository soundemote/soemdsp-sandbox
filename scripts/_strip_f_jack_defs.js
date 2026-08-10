/**
 * Remove absolute-Hz "f" input jacks from module definitions only.
 * Leaves signal outputs named "f" alone (if any).
 */
const fs = require("fs");
const path = "public/node-graph-module-definitions.js";
let s = fs.readFileSync(path, "utf8");
const before = s;

// inputs: [..., "f"] or ["f"] or ["f", ...]
s = s.replace(/inputs:\s*\[([^\]]*)\]/g, (full, inner) => {
  const parts = inner
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p !== '"f"' && p !== "'f'");
  return `inputs: [${parts.join(", ")}]`;
});

// inputLabels / inputAliases object entries f: "f"
s = s.replace(/,?\s*\bf:\s*"f"/g, "");
// Clean double commas and trailing commas before }
s = s.replace(/,(\s*,)+/g, ",");
s = s.replace(/,(\s*\})/g, "$1");

// Comments about f jack
s = s.replace(
  /^\s*\/\/\s*f\s*=\s*universal linear frequency jack[^\n]*\n/gm,
  "",
);
s = s.replace(
  /Wire f for absolute Hz CV\.\s*/g,
  "Domain-add MOD on Frequency (set base 0 for absolute Hz sources). ",
);
s = s.replace(
  /Signed\/reverse-phase:\s*wire f or widen Min in parameter settings \(domain is not hard-clamped\)\./g,
  "Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides.",
);

fs.writeFileSync(path, s);
console.log("changed", before !== s, "len", before.length, "->", s.length);
// sanity: no inputs with "f"
const bad = [];
const re = /inputs:\s*\[([^\]]*)\]/g;
let m;
while ((m = re.exec(s))) {
  if (/"f"/.test(m[1])) bad.push(m[0].slice(0, 80));
}
console.log("inputs still with f:", bad.length, bad.slice(0, 5));
console.log('total "f" strings:', (s.match(/"f"/g) || []).length);
