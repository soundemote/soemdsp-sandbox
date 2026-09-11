const fs=require("fs");
const s=fs.readFileSync("public/node-graph-module-definitions.js","utf8");
const i=s.indexOf("hypersaw2: {");
const j=s.indexOf("vibratoGenerator: {", i);
const block=s.slice(i,j);
const keys=[...block.matchAll(/key: "([^"]+)"/g)].map(m=>m[1]);
console.log(keys.join("\n"));
const lab=block.match(/key: "distanceSlew"[\s\S]*?label: "([^"]+)"/);
console.log("distanceSlew label:", lab&&lab[1]);
