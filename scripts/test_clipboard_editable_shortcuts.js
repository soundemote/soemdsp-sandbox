// Retest: Ctrl/Cmd+C/X/V must yield to native clipboard in text-editable fields
// (Sound Color Widget .scw-hex / Bg text), while module-copy still runs elsewhere.

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var root = path.join(__dirname, "..", "public");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeEl(tag, attrs) {
  attrs = attrs || {};
  var classSet = new Set(String(attrs.className || "").split(/\s+/).filter(Boolean));
  var node = {
    tagName: String(tag).toUpperCase(),
    type: attrs.type || "",
    readOnly: Boolean(attrs.readOnly),
    disabled: Boolean(attrs.disabled),
    parentNode: null,
    classList: {
      contains: function (name) { return classSet.has(name); },
    },
    closest: function (sel) {
      var parts = String(sel).split(",").map(function (s) { return s.trim(); });
      var cur = node;
      while (cur) {
        for (var i = 0; i < parts.length; i++) {
          var token = parts[i];
          if (token.charAt(0) === "." && cur.classList.contains(token.slice(1))) return cur;
          if (token.charAt(0) === "#" && cur.id === token.slice(1)) return cur;
          if (token.charAt(0) === "[" && token.indexOf("contenteditable") >= 0) {
            if (cur.contentEditable === "true") return cur;
            continue;
          }
          var tagTok = token.toUpperCase();
          if (token.charAt(0) !== "." && token.charAt(0) !== "#" && token.charAt(0) !== "[") {
            // support "input, textarea, select" style — match tag or "input"
            if (tagTok === cur.tagName) return cur;
            // "textarea, select, input" tokens without attrs
            if (token === "input" && cur.tagName === "INPUT") return cur;
            if (token === "textarea" && cur.tagName === "TEXTAREA") return cur;
            if (token === "select" && cur.tagName === "SELECT") return cur;
          }
        }
        cur = cur.parentNode;
      }
      return null;
    },
  };
  if (attrs.id) node.id = attrs.id;
  if (attrs.contentEditable) node.contentEditable = attrs.contentEditable;
  Object.setPrototypeOf(node, FakeElement.prototype);
  return node;
}

function FakeElement() {}
function FakeHTMLElement() {}

var copyCalls = 0;
var sandbox = {
  console: console,
  Object: Object,
  Boolean: Boolean,
  String: String,
  Array: Array,
  Number: Number,
  Math: Math,
  JSON: JSON,
  Set: Set,
  Map: Map,
  Error: Error,
  TypeError: TypeError,
  Element: FakeElement,
  HTMLElement: FakeHTMLElement,
  document: {
    activeElement: null,
    getElementById: function () { return null; },
  },
  window: {},
  nodeGraphWireInteractions: null,
  nodeGraphMvp: { live: null },
  copySelectedNodeGraphModule: function () {
    copyCalls += 1;
    return true;
  },
  duplicateFocusedNodeGraphGraphNode: function () { return false; },
  selectAllNodeGraphModules: function () {},
  undoNodeGraphPatch: function () {},
  redoNodeGraphPatch: function () {},
  alignNodeGraphViewToGrid: function () {},
  handleNodeGraphFloatingWindowKeyboardNudge: function () { return false; },
  nodeGraphTextBoxIsTyping: function () { return false; },
  nodeGraphTextBoxIsTypingElement: function () { return false; },
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "node-graph-keyboard-shortcuts.js"), "utf8"),
  sandbox,
  { filename: "node-graph-keyboard-shortcuts.js" }
);

assert(typeof sandbox.handleNodeGraphKeydown === "function", "handleNodeGraphKeydown exists");
assert(typeof sandbox.nodeGraphEventTargetIsTextEditable === "function", "isTextEditable exists");

var hex = makeEl("input", { type: "text", className: "scw-hex" });
assert(sandbox.nodeGraphEventTargetIsTextEditable(hex), "scw-hex input counts as text-editable");

function fire(key, target, mods) {
  mods = mods || {};
  var prevented = false;
  var ev = {
    key: key,
    code: key.length === 1 ? "Key" + key.toUpperCase() : key,
    ctrlKey: Boolean(mods.ctrlKey),
    metaKey: Boolean(mods.metaKey),
    altKey: Boolean(mods.altKey),
    shiftKey: Boolean(mods.shiftKey),
    target: target,
    preventDefault: function () { prevented = true; },
    stopPropagation: function () {},
  };
  sandbox.handleNodeGraphKeydown(ev);
  return prevented;
}

// --- editable: Ctrl+C must NOT preventDefault and must NOT copy module ---
copyCalls = 0;
var prevented = fire("c", hex, { ctrlKey: true });
assert(!prevented, "Ctrl+C in scw-hex does not preventDefault");
assert(copyCalls === 0, "Ctrl+C in scw-hex does not call copySelectedNodeGraphModule");

prevented = fire("c", hex, { metaKey: true });
assert(!prevented, "Cmd+C in scw-hex does not preventDefault");
assert(copyCalls === 0, "Cmd+C in scw-hex does not copy module");

prevented = fire("x", hex, { ctrlKey: true });
assert(!prevented, "Ctrl+X in scw-hex does not preventDefault");

prevented = fire("v", hex, { ctrlKey: true });
assert(!prevented, "Ctrl+V in scw-hex does not preventDefault");

// contenteditable text box field
var ce = makeEl("div", { className: "node-text-box-input", contentEditable: "true" });
ce.contentEditable = "true";
// closest for [contenteditable='true'] needs contentEditable prop — already set
assert(sandbox.nodeGraphEventTargetIsTextEditable(ce), "contenteditable text-box is text-editable");
copyCalls = 0;
prevented = fire("c", ce, { ctrlKey: true });
assert(!prevented, "Ctrl+C in contenteditable does not preventDefault");
assert(copyCalls === 0, "Ctrl+C in contenteditable does not copy module");

// --- non-editable: Ctrl+C still copies module and preventDefaults ---
var body = makeEl("div", { className: "dsp-node-body" });
assert(!sandbox.nodeGraphEventTargetIsTextEditable(body), "module body is not text-editable");
copyCalls = 0;
prevented = fire("c", body, { ctrlKey: true });
assert(prevented, "Ctrl+C outside editable preventDefaults");
assert(copyCalls === 1, "Ctrl+C outside editable copies module");

console.log("test_clipboard_editable_shortcuts ok");
