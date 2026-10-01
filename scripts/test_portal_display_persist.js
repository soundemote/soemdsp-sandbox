/**
 * Portal Display override must survive validate's node assembly, and sync
 * across same-Title In/Out peers (bus).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "public");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sandbox = { console };
vm.createContext(sandbox);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
}

load("node-graph-patch-clone.js");
load("modules/portal/portal-named.js");

assert(typeof sandbox.normalizeNodeGraphPatchNodeDisplay === "function", "display normalize exists");
assert(typeof sandbox.nodeGraphNamedPortalSyncBusDisplay === "function", "bus display sync exists");

// Mirror validateNodeGraphPatch's node-field keep list for display/wirelessRole.
function keepPortalFields(node) {
  const type = String(node.type || "");
  const out = { id: node.id, type, alias: node.alias };
  if (sandbox.normalizeNodeGraphPatchNodeDisplay(node.display)) {
    out.display = sandbox.normalizeNodeGraphPatchNodeDisplay(node.display);
  }
  if (
    sandbox.nodeGraphIsNamedPortalType(type)
    && sandbox.nodeGraphNamedPortalWirelessRole(node)
  ) {
    out.wirelessRole = sandbox.nodeGraphNamedPortalWirelessRole(node);
  }
  return out;
}

// Source-check: patch-core validate must include display keep (regression guard).
const patchCore = fs.readFileSync(path.join(root, "node-graph-patch-core.js"), "utf8");
assert(
  /normalizeNodeGraphPatchNodeDisplay\(node\.display\)/.test(patchCore),
  "validateNodeGraphPatch must preserve node.display",
);
assert(
  /wirelessRole/.test(patchCore) && /nodeGraphNamedPortalWirelessRole|node\.wirelessRole/.test(patchCore),
  "validateNodeGraphPatch must preserve portal wirelessRole",
);

const inNode = {
  id: "namedPortalIn-1",
  type: "namedPortalIn",
  alias: "BusA",
  display: "Hello Portal",
  wirelessRole: "audio",
};
const outNode = {
  id: "namedPortalOut-1",
  type: "namedPortalOut",
  alias: "BusA",
};
const otherBus = {
  id: "namedPortalIn-2",
  type: "namedPortalIn",
  alias: "Other",
  display: "Keep Me",
};

const keptIn = keepPortalFields(inNode);
assert(keptIn.display === "Hello Portal", `keep display, got ${keptIn.display}`);
assert(keptIn.wirelessRole === "audio", `keep wirelessRole, got ${keptIn.wirelessRole}`);

const patch = { nodes: [inNode, outNode, otherBus] };
const changed = sandbox.nodeGraphNamedPortalSyncBusDisplay(patch, "namedPortalIn-1", "Hello Portal");
assert(changed.includes("namedPortalOut-1"), `sync must change out peer, got ${JSON.stringify(changed)}`);
assert(outNode.display === "Hello Portal", `out peer display synced, got ${outNode.display}`);
assert(otherBus.display === "Keep Me", "other bus display unchanged");

const cleared = sandbox.nodeGraphNamedPortalSyncBusDisplay(patch, "namedPortalOut-1", "");
assert(cleared.includes("namedPortalIn-1") && cleared.includes("namedPortalOut-1"), "clear hits both peers");
assert(!inNode.display, "in display cleared");
assert(!outNode.display, "out display cleared");
assert(otherBus.display === "Keep Me", "other bus still intact");

console.log("portal display persist + bus sync OK");
