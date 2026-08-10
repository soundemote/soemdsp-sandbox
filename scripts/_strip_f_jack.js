/* One-shot: retire absolute-Hz f jack from definitions + evaluators. */
const fs = require("fs");
const path = require("path");

function stripDefs() {
  const p = path.join("public", "node-graph-module-definitions.js");
  let s = fs.readFileSync(p, "utf8");
  const before = s.length;
  s = s.replace(/,\s*"f"/g, "");
  s = s.replace(/"f",\s*/g, "");
  s = s.replace(/,\s*f:\s*"f"/g, "");
  s = s.replace(/\bf:\s*"f",\s*/g, "");
  s = s.replace(/,\s*,/g, ",");
  s = s.replace(/,(\s*[\]}])/g, "$1");
  fs.writeFileSync(p, s);
  console.log("defs", before, "->", s.length, 'remaining "f"', (s.match(/"f"/g) || []).length);
}

function stripFile(file) {
  if (!fs.existsSync(file)) return;
  let s = fs.readFileSync(file, "utf8");
  const b = s;
  s = s.replace(/\s*const fHz = this\.readFInputHz\([^;]+;\r?\n/g, "\n");
  s = s.replace(
    /\s*const fHz = typeof nodeGraphReadFInputHz === "function"\r?\n\s*\? nodeGraphReadFInputHz\([^)]*\)\r?\n\s*: null;\r?\n/g,
    "\n",
  );
  s = s.replace(
    /\s*const fHz = typeof nodeGraphReadFInputHz === "function"[^;]+;\r?\n/g,
    "\n",
  );
  s = s.replace(/\r?\n\s*fHz,?/g, "");
  s = s.replace(/,\s*fHz\b/g, "");
  s = s.replace(
    /fHz != null \? fHz \/ Math\.max\(1, safeRate\) : normFromKnob/g,
    "normFromKnob",
  );
  s = s.replace(/fHz != null \? fHz \/ safeRate : normFromKnob/g, "normFromKnob");
  s = s.replace(/fHz != null \? fHz : freqKnob/g, "freqKnob");
  // resolveFrequencyHz(pitchExpr, fHz) → just use pitchExpr when second arg was fHz
  // Leave resolveFrequencyHz calls with null second arg if still present.
  s = s.replace(/this\.resolveFrequencyHz\(\s*([^,]+),\s*fHz\s*\)/g, "$1");
  s = s.replace(/this\.resolveFrequencyHz\(\s*([\s\S]*?),\s*null\s*\)/g, "($1)");
  if (s !== b) {
    fs.writeFileSync(file, s);
    console.log("updated", file);
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".js")) stripFile(p);
  }
}

stripDefs();
walk("public");
console.log("done");
