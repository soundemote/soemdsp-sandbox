// Named portal wirelessRole: first cable locks port kind; incompatible connect refuses;
// Portal splice from a noteMask edge locks the bus; Out re-publishes the kind.
// node scripts/smoke_portal_wireless_role.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sandbox = {
  normalizeNodeGraphPatchNodeAlias: (a) => String(a ?? "").trim().slice(0, 64),
  nodeGraphPatchNodeTitle: (node) => {
    const a = String(node?.alias ?? "").trim();
    return a || String(node?.type || "");
  },
  nodeGraphPatchNodePortDisplayLabel: (_node, type, port, io) => {
    if (io === "output" && type === "keyboard" && port === "Play Keys") return "Play Keys";
    if (io === "output" && type === "keyboard" && port === "pitch") return "\u266f/\u266d";
    return String(port || "");
  },
  nodeGraphModuleDefinitions: {
    namedPortalIn: { inputs: ["In"], outputs: [] },
    namedPortalOut: { inputs: [], outputs: ["Out"] },
    keyboard: {
      outputs: ["Play Keys", "pitch", "Arp Keys", "Chord Memory"],
      digitalOutputs: ["Play Keys", "Arp Keys", "Chord Memory"],
    },
    voices: {
      inputs: ["Play Keys", "Arp Keys", "Chord Memory"],
      digitalInputs: ["Play Keys", "Arp Keys", "Chord Memory"],
    },
    ladderFilter: { inputs: ["frequency"], outputs: ["Out"] },
  },
  nodeGraphPortIsNoteBus: (port) => {
    const key = String(port || "").trim();
    return key === "Play Keys"
      || key === "Arp Keys"
      || key === "Keys"
      || key === "Chord Memory"
      || key === "Polyphony"
      || key === "Monophony"
      || key === "Voices"
      || key === "Scale";
  },
  nodeGraphPortIsCodeSignal: () => false,
  nodeGraphPortIsGraphChunkSignal: () => false,
  nodeGraphPortIsBlockRateSignal: () => false,
  nodeGraphPortIsDigitalSignal: (_t, port) => sandbox.nodeGraphPortIsNoteBus(port),
  nodeGraphPortIsDataPlane: () => false,
  nodeGraphPatchNode: (id) => {
    const live = sandbox.__patch;
    return (live?.nodes || []).find((n) => n && String(n.id) === String(id)) || null;
  },
  nodeGraphPatchNodeType: (idOrNode) => {
    if (idOrNode && typeof idOrNode === "object") return idOrNode.type || null;
    return sandbox.nodeGraphPatchNode(idOrNode)?.type || idOrNode;
  },
  console,
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "public", "modules", "portal", "portal-named.js"), "utf8"),
  sandbox,
  { filename: "portal-named.js" },
);
vm.runInContext(
  fs.readFileSync(path.join(root, "public", "node-graph-port-types.js"), "utf8"),
  sandbox,
  { filename: "port-types.js" },
);

const {
  nodeGraphNamedPortalApplyConnectWirelessRole,
  nodeGraphNamedPortalWirelessRole,
  nodeGraphNamedPortalSyncBusAlias,
  nodeGraphNamedPortalAliasFromSourceOutlet,
  nodeGraphNamedPortalInsertGridPoints,
  nodeGraphNamedPortalReconcileBusWirelessRole,
  nodeGraphSpliceNamedPortalCables,
  nodeGraphResolvePortType,
  nodeGraphPortTypesCompatible,
  nodeGraphWireEndpointsPortTypeMismatch,
} = sandbox;

assert(typeof nodeGraphResolvePortType === "function", "resolvePortType");
assert(typeof nodeGraphPortTypesCompatible === "function", "compatible");

// --- Unlocked portal accepts noteMask; first Play Keys cable locks bus ---
const patch = {
  nodes: [
    { id: "keyboard-1", type: "keyboard", alias: "Keyboard" },
    { id: "voices-1", type: "voices", alias: "Voices" },
    { id: "filt-1", type: "ladderFilter", alias: "" },
    { id: "pin-1", type: "namedPortalIn", alias: "KeysBus" },
    { id: "pout-1", type: "namedPortalOut", alias: "KeysBus" },
  ],
  connections: [],
  modulations: [],
};
sandbox.__patch = patch;

assert(nodeGraphResolvePortType("pin-1", "In", "input") == null, "unlocked In is null");
assert(nodeGraphResolvePortType("pout-1", "Out", "output") == null, "unlocked Out is null");
assert(
  nodeGraphPortTypesCompatible(nodeGraphResolvePortType("keyboard-1", "Play Keys", "output"), null),
  "Play Keys → unlocked portal compatible",
);

patch.connections.push({
  sourceNode: "keyboard-1",
  sourcePort: "Play Keys",
  destinationNode: "pin-1",
  destinationPort: "In",
});
const locked = nodeGraphNamedPortalApplyConnectWirelessRole(
  patch,
  "keyboard-1",
  "Play Keys",
  "pin-1",
  "In",
);
assert(locked.includes("pin-1") && locked.includes("pout-1"), `lock peers ${locked}`);
assert(nodeGraphNamedPortalWirelessRole(patch.nodes.find((n) => n.id === "pin-1")) === "noteMask", "In role");
assert(nodeGraphNamedPortalWirelessRole(patch.nodes.find((n) => n.id === "pout-1")) === "noteMask", "Out role");
assert(nodeGraphResolvePortType("pout-1", "Out", "output") === "noteMask", "Out re-publishes noteMask");

// Portal Out → Voices Play Keys stays compatible
assert(
  nodeGraphPortTypesCompatible(
    nodeGraphResolvePortType("pout-1", "Out", "output"),
    nodeGraphResolvePortType("voices-1", "Play Keys", "input"),
  ),
  "Out → Play Keys ok",
);

// Incompatible audio → locked noteMask portal → refuse + mismatch (wire-break path)
assert(
  !nodeGraphPortTypesCompatible(
    nodeGraphResolvePortType("filt-1", "Out", "output") || "audio",
    nodeGraphResolvePortType("pin-1", "In", "input"),
  ),
  "audio → noteMask portal incompatible",
);
assert(
  nodeGraphWireEndpointsPortTypeMismatch(
    { node: "filt-1", port: "Out", io: "output" },
    { node: "pin-1", port: "In", io: "input" },
  ),
  "mismatch arms wire-break",
);

// Lock must not overwrite
patch.nodes.find((n) => n.id === "pin-1").wirelessRole = "noteMask";
const noOverwrite = nodeGraphNamedPortalApplyConnectWirelessRole(
  patch,
  "filt-1",
  "Out",
  "pin-1",
  "In",
);
assert(noOverwrite.length === 0, "locked role not overwritten");
assert(nodeGraphNamedPortalWirelessRole(patch.nodes.find((n) => n.id === "pin-1")) === "noteMask", "still noteMask");

// SyncBusAlias keeps role on rename
nodeGraphNamedPortalSyncBusAlias(patch, "pin-1", "PlayBus");
assert(patch.nodes.find((n) => n.id === "pout-1").alias === "PlayBus", "alias synced");
assert(nodeGraphNamedPortalWirelessRole(patch.nodes.find((n) => n.id === "pout-1")) === "noteMask", "role survived rename");

// Reconcile clears when bus has no cables
patch.connections = [];
const cleared = nodeGraphNamedPortalReconcileBusWirelessRole(patch, "pin-1");
assert(cleared.includes("pin-1") && cleared.includes("pout-1"), `cleared ${cleared}`);
assert(nodeGraphNamedPortalWirelessRole(patch.nodes.find((n) => n.id === "pin-1")) == null, "role cleared");

// --- Splice from a Play Keys wireless edge locks role ---
const splicePatch = {
  nodes: [
    { id: "keyboard-1", type: "keyboard", alias: "Keyboard", gx: 0, gy: 0 },
    { id: "voices-1", type: "voices", alias: "", gx: 18, gy: 0 },
  ],
  connections: [
    { sourceNode: "keyboard-1", sourcePort: "Play Keys", destinationNode: "voices-1", destinationPort: "Play Keys" },
  ],
  modulations: [],
};
sandbox.__patch = splicePatch;
const alias = nodeGraphNamedPortalAliasFromSourceOutlet(splicePatch, "keyboard-1", "Play Keys");
assert(alias === "Keyboard Play Keys", `splice alias ${JSON.stringify(alias)}`);
const points = nodeGraphNamedPortalInsertGridPoints(splicePatch, "keyboard-1", "voices-1", 0);
splicePatch.connections = [];
const seed = "__portal_splice_1";
splicePatch.nodes.push(
  { id: "namedPortalIn-1", type: "namedPortalIn", alias: seed, gx: points.in.gx, gy: points.in.gy },
  { id: "namedPortalOut-1", type: "namedPortalOut", alias: seed, gx: points.out.gx, gy: points.out.gy },
);
nodeGraphNamedPortalSyncBusAlias(splicePatch, "namedPortalIn-1", alias);
splicePatch.connections.push(
  { sourceNode: "keyboard-1", sourcePort: "Play Keys", destinationNode: "namedPortalIn-1", destinationPort: "In" },
  { sourceNode: "namedPortalOut-1", sourcePort: "Out", destinationNode: "voices-1", destinationPort: "Play Keys" },
);
nodeGraphNamedPortalApplyConnectWirelessRole(
  splicePatch,
  "keyboard-1",
  "Play Keys",
  "namedPortalIn-1",
  "In",
);
nodeGraphNamedPortalApplyConnectWirelessRole(
  splicePatch,
  "namedPortalOut-1",
  "Out",
  "voices-1",
  "Play Keys",
);
assert(
  nodeGraphNamedPortalWirelessRole(splicePatch.nodes.find((n) => n.id === "namedPortalIn-1")) === "noteMask",
  "splice In locked",
);
assert(
  nodeGraphNamedPortalWirelessRole(splicePatch.nodes.find((n) => n.id === "namedPortalOut-1")) === "noteMask",
  "splice Out locked",
);

const spliced = nodeGraphSpliceNamedPortalCables(
  splicePatch.nodes,
  splicePatch.connections,
  splicePatch.modulations,
);
assert(
  spliced.connections.some((c) =>
    c.sourceNode === "keyboard-1"
    && c.sourcePort === "Play Keys"
    && c.destinationNode === "voices-1"
    && c.destinationPort === "Play Keys"),
  "compiled wireless path A→B",
);

// Audio portal stays audio-locked (normal mod/audio path)
const audioPatch = {
  nodes: [
    { id: "osc-1", type: "ladderFilter", alias: "Osc" },
    { id: "pin-a", type: "namedPortalIn", alias: "A" },
    { id: "pout-a", type: "namedPortalOut", alias: "A" },
  ],
  connections: [
    { sourceNode: "osc-1", sourcePort: "Out", destinationNode: "pin-a", destinationPort: "In" },
  ],
  modulations: [],
};
sandbox.__patch = audioPatch;
nodeGraphNamedPortalApplyConnectWirelessRole(audioPatch, "osc-1", "Out", "pin-a", "In");
assert(nodeGraphNamedPortalWirelessRole(audioPatch.nodes.find((n) => n.id === "pin-a")) === "audio", "audio lock");
assert(
  !nodeGraphPortTypesCompatible("noteMask", nodeGraphResolvePortType("pin-a", "In", "input")),
  "noteMask refused on audio portal",
);

console.log("ok: portal wirelessRole lock + splice + incompatible break");
