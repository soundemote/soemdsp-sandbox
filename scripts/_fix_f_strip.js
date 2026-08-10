/* Fix syntax damage from _strip_f_jack.js */
const fs = require("fs");
const path = require("path");

{
  let s = fs.readFileSync("public/node-graph-module-definitions.js", "utf8");
  s = s.replace(/\r?\n\s*f:\s*\},/g, "");
  s = s.replace(/\r?\n\s*f:\s*\}/g, "");
  // Remove trailing commas left before closing braces in objects
  s = s.replace(/,(\s*\}\s*,\s*\r?\n\s*(outputAliases|outputs|outputLabels|parameters|displayModes|defaultDisplayMode))/g, "$1");
  s = s.replace(/,(\s*\}\s*\r?\n\s*(outputAliases|outputs|outputLabels|parameters))/g, "$1");
  fs.writeFileSync("public/node-graph-module-definitions.js", s);
  console.log("defs f: } left", (s.match(/f:\s*\}/g) || []).length);
  console.log('defs "f" left', (s.match(/"f"/g) || []).length);
}

function fixTernary(file) {
  let s = fs.readFileSync(file, "utf8");
  const b = s;
  // : ((expr), );  from resolveFrequencyHz strip — unwrap to : (expr);
  s = s.replace(/:\s*\(\(([\s\S]*?)\),\s*\);/g, ": ($1);");
  if (s !== b) {
    fs.writeFileSync(file, s);
    console.log("fixed ternary", file);
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".js")) fixTernary(p);
  }
}
walk("public");
console.log("done fix");
