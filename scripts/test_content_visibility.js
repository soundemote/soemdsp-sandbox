// Viewport-asleep bands use content-visibility:hidden. Measuring them
// (getBoundingClientRect) makes Chrome log:
// "Rendering was performed in a subtree hidden by content-visibility".

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..", "public");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function el(tag, className) {
  var classSet = new Set(String(className || "").split(/\s+/).filter(Boolean));
  var kids = [];
  var node = {
    tagName: String(tag).toUpperCase(),
    children: kids,
    parentNode: null,
    classList: {
      add: function () { for (var i = 0; i < arguments.length; i++) classSet.add(arguments[i]); },
      contains: function (name) { return classSet.has(name); },
    },
    closest: function (sel) {
      var parts = String(sel).split(",").map(function (s) { return s.trim(); });
      var cur = node;
      while (cur) {
        for (var i = 0; i < parts.length; i++) {
          var token = parts[i];
          if (token.charAt(0) === "." && cur.classList.contains(token.slice(1))) return cur;
        }
        cur = cur.parentNode;
      }
      return null;
    },
    append: function (child) {
      kids.push(child);
      child.parentNode = node;
      return child;
    },
  };
  return node;
}

var sandbox = {
  console: console,
  nodeGraphViewportPerf: { persistTimer: 0, persistMs: 220 },
  window: { setTimeout: function () { return 0; }, clearTimeout: function () {} },
  document: { getElementById: function () { return null; } },
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "node-graph-viewport-perf.js"), "utf8"),
  sandbox,
  { filename: "node-graph-viewport-perf.js" },
);

var skip = sandbox.nodeGraphElementInSkippedContentVisibility;
assert(typeof skip === "function", "skip helper exists");
assert(typeof sandbox.nodeGraphModuleIsViewportAsleep === "function", "asleep helper exists");

var awake = el("article", "dsp-node");
var awakeBody = awake.append(el("div", "dsp-node-body"));
var awakePort = awakeBody.append(el("button", "node-param-port modulation-input"));
assert(!skip(awakePort), "awake param port is measurable");

var asleep = el("article", "dsp-node viewport-asleep");
var face = asleep.append(el("div", "node-module-face"));
var body = asleep.append(el("div", "dsp-node-body"));
var io = asleep.append(el("div", "dsp-node-io-section"));
var custom = asleep.append(el("div", "node-solid-module-custom-ui"));
var scope = asleep.append(el("div", "node-module-scope-window"));
var param = body.append(el("button", "node-param-port modulation-input"));
var jack = io.append(el("button", "node-port output"));
var faceKid = face.append(el("canvas", "node-module-scope-window"));
var customKid = custom.append(el("div", "xy-pad"));

assert(!skip(param), "asleep param port stays measurable");
assert(!skip(body), "asleep params band stays measurable");
assert(skip(face), "asleep face is skipped");
assert(skip(faceKid), "asleep face child is skipped");
assert(skip(custom), "asleep custom UI is skipped");
assert(skip(customKid), "asleep custom UI child is skipped");
assert(skip(scope), "asleep scope window is skipped");
assert(!skip(jack), "asleep I/O jack stays measurable");
assert(!skip(io), "asleep I/O section stays measurable");
assert(!skip(asleep), "module article itself is not a skipped band");
assert(!skip(null), "null is not skipped");

var sizeFn = sandbox.nodeGraphElementClientSize;
assert(typeof sizeFn === "function", "client size helper exists");
face._awakeClientWidth = 220;
face._awakeClientHeight = 110;
var skippedSize = sizeFn(face, 8, 12);
assert(skippedSize.skipped === true, "asleep face size is skipped");
assert(skippedSize.width === 220, "asleep face reuses last width");
assert(skippedSize.height === 110, "asleep face reuses last height");
awake._awakeClientWidth = 0;
awake.clientWidth = 64;
awake.clientHeight = 32;
var awakeSize = sizeFn(awake, 8, 12);
assert(awakeSize.skipped === false, "awake module size is live");
assert(awakeSize.width === 64, "awake width from clientWidth");
assert(awake._awakeClientWidth === 64, "awake size is cached");

var css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
assert(
  !/viewport-asleep \.dsp-node-body/.test(css)
  && /viewport-asleep .node-module-face/.test(css)
  && /content-visibility:\s*hidden/.test(css),
  "CSS skips faces only — not the params band",
);
assert(
  sandbox.NODE_GRAPH_VIEWPORT_ASLEEP_SKIP_SEL.indexOf(".dsp-node-body") < 0
  && sandbox.NODE_GRAPH_VIEWPORT_ASLEEP_SKIP_SEL.indexOf(".node-module-face") >= 0
  && sandbox.NODE_GRAPH_VIEWPORT_ASLEEP_SKIP_SEL.indexOf(".node-module-scope-window") >= 0
  && sandbox.NODE_GRAPH_VIEWPORT_ASLEEP_SKIP_SEL.indexOf(".node-solid-module-custom-ui") >= 0,
  "JS skip list matches CSS bands",
);

var wires = fs.readFileSync(path.join(root, "node-graph-wires.js"), "utf8");
assert(wires.indexOf("nodeGraphElementInSkippedContentVisibility") >= 0, "hit-test skips hidden bands");
var geo = fs.readFileSync(path.join(root, "node-graph-port-geometry.js"), "utf8");
assert(geo.indexOf("nodeGraphElementInSkippedContentVisibility") >= 0, "port geometry skips hidden bands");
var readout = fs.readFileSync(path.join(root, "node-graph-slider-readout.js"), "utf8");
assert(readout.indexOf("nodeGraphElementInSkippedContentVisibility") >= 0, "slider readout skips hidden bands");
var values = fs.readFileSync(path.join(root, "node-graph-slider-values.js"), "utf8");
assert(values.indexOf("nodeGraphElementInSkippedContentVisibility") >= 0, "slider layout skips hidden bands");
var ghost = fs.readFileSync(path.join(root, "node-graph-ghost-sliders.js"), "utf8");
assert(ghost.indexOf("nodeGraphElementInSkippedContentVisibility") >= 0, "ghost sliders skip hidden bands");

console.log("ok content-visibility skip");
