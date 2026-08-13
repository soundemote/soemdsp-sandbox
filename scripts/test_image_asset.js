var fs = require("fs");
var path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "public", "node-graph-image-utils.js"), "utf8")
  .replace(/function nodeGraphOneLineText[\s\S]*?(?=\nfunction |\nconst |\n$)/, "function nodeGraphOneLineText(v){return String(v||\"\");}\n")
  .replace(/function refreshNodeGraphCanvasBodies[\s\S]*$/, "function refreshNodeGraphCanvasBodies(){}\n"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(nodeGraphNormalizeImageAsset(null).dataUrl === "", "empty asset");
assert(nodeGraphImageAssetLabel({ dataUrl: "" }) === "—", "empty label");
assert(nodeGraphImageFileLooksSupported({ name: "a.png", type: "image/png" }) === true, "png ok");
assert(nodeGraphImageFileLooksSupported({ name: "a.exe", type: "" }) === false, "exe no");
var kept = nodeGraphNormalizeImageAsset({
  dataUrl: "data:image/png;base64,abc",
  fileName: "wall.png",
});
assert(kept.fileName === "wall.png", "name kept");
assert(kept.dataUrl.indexOf("data:image/png") === 0, "url kept");
console.log("ok image asset");
