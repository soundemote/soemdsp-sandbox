const fs = require("fs");
const path = require("path");

function walk(d, files = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(p, files);
    } else if (/\.js$/.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

const files = walk("public");
const bad = [];
const re = /\{[^{}]*key:\s*"(?:seed|roomSeed)"[^{}]*\}/g;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(s))) {
    const b = m[0];
    const md = b.match(/maxDigits:\s*(\d+)/);
    if (!md || md[1] !== "0") {
      bad.push({
        f,
        maxDigits: md ? md[1] : "MISSING",
        snippet: b.slice(0, 220).replace(/\s+/g, " "),
      });
    }
  }
}
console.log(JSON.stringify(bad, null, 2));
console.log("count", bad.length);
