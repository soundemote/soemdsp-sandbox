// Wire RC Portal insert: alias = C++-safe module title + outlet (symbolic labels fall back to port id); In/Out SyncBusAlias; path A→In / Out→B.
// node scripts/smoke_wire_portal_menu_insert.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(root, "public", "modules", "portal", "portal-named.js");

const sandbox = {
  normalizeNodeGraphPatchNodeAlias: (a) => String(a ?? "").trim().slice(0, 64),
  nodeGraphPatchNodeTitle: (node) => {
    const a = String(node?.alias ?? "").trim();
    return a || String(node?.type || "");
  },
  nodeGraphPatchNodePortDisplayLabel: (_node, type, port, io) => {
    if (io === "output" && type === "keyboard" && port === "pitch") return "\u266f/\u266d";
    return String(port || "");
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(helperPath, "utf8"), sandbox, { filename: helperPath });

const {
  nodeGraphNamedPortalAliasFromSourceOutlet,
  nodeGraphNamedPortalInsertGridPoints,
  nodeGraphNamedPortalSyncBusAlias,
  nodeGraphSpliceNamedPortalCables,
} = sandbox;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const patch = {
  nodes: [
    { id: "keyboard-1", type: "keyboard", alias: "Keyboard", gx: 0, gy: 0 },
    { id: "filt-1", type: "ladderFilter", alias: "", gx: 18, gy: 0 },
  ],
  connections: [
    { sourceNode: "keyboard-1", sourcePort: "pitch", destinationNode: "filt-1", destinationPort: "frequency" },
  ],
  modulations: [],
};

const alias = nodeGraphNamedPortalAliasFromSourceOutlet(patch, "keyboard-1", "pitch");
assert(alias === "Keyboard_pitch", `alias ${JSON.stringify(alias)}`);

const points = nodeGraphNamedPortalInsertGridPoints(patch, "keyboard-1", "filt-1", 0);
assert(points.in.gx === 6 && points.out.gx === 12, `points ${JSON.stringify(points)}`);

// Simulate insert (mirrors portalSelectedNodeGraphWires without DOM/createNode).
patch.connections = [];
const seed = "__portal_splice_1";
patch.nodes.push(
  { id: "namedPortalIn-1", type: "namedPortalIn", alias: seed, gx: points.in.gx, gy: points.in.gy },
  { id: "namedPortalOut-1", type: "namedPortalOut", alias: seed, gx: points.out.gx, gy: points.out.gy },
);
const synced = nodeGraphNamedPortalSyncBusAlias(patch, "namedPortalIn-1", alias);
assert(synced.includes("namedPortalIn-1") && synced.includes("namedPortalOut-1"), `sync ${synced}`);
assert(patch.nodes.find((n) => n.id === "namedPortalOut-1").alias === alias, "Out alias");

patch.connections.push(
  { sourceNode: "keyboard-1", sourcePort: "pitch", destinationNode: "namedPortalIn-1", destinationPort: "In" },
  { sourceNode: "namedPortalOut-1", sourcePort: "Out", destinationNode: "filt-1", destinationPort: "frequency" },
);

const spliced = nodeGraphSpliceNamedPortalCables(patch.nodes, patch.connections, patch.modulations);
assert(
  spliced.connections.some((c) =>
    c.sourceNode === "keyboard-1"
    && c.sourcePort === "pitch"
    && c.destinationNode === "filt-1"
    && c.destinationPort === "frequency"),
  "compiled path still A→B",
);
assert(
  !spliced.connections.some((c) =>
    String(c.sourceNode).startsWith("namedPortal") || String(c.destinationNode).startsWith("namedPortal")),
  "no portal ids left after compile splice",
);

console.log("ok: wire portal menu insert alias + SyncBusAlias + path");
