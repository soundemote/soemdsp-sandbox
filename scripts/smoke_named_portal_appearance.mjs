// Named portal: title drives bus name + jack I/O label; color follows cable into In.
// Out mirrors matched In for title (SyncBusAlias) and color. Source-outlet auto-rename dropped.
// node scripts/smoke_named_portal_appearance.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = path.join(root, "public", "modules", "portal", "portal-named.js");

const sandbox = {
  normalizeNodeGraphPatchNodeAlias: (a) => String(a ?? "").trim().slice(0, 64),
  nodeGraphPatchNodePortDisplayLabel: (_node, type, port, io) => {
    if (io === "output" && type === "keyboard" && port === "pitch") return "\u266f/\u266d";
    if (io === "output" && type === "keyboard" && port === "Trigger") return "Trigger";
    if (io === "output" && port === "Left") return "Left";
    return String(port || "");
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(helperPath, "utf8"), sandbox, { filename: helperPath });

const {
  nodeGraphNamedPortalColorSource,
  nodeGraphNamedPortalSyncAliasFromSource,
  nodeGraphNamedPortalSyncAliasFromDestination,
  nodeGraphNamedPortalSyncBusAlias,
  nodeGraphNamedPortalIdsTouchedByWire,
  nodeGraphSpliceNamedPortalCables,
} = sandbox;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const patch = {
  nodes: [
    { id: "keyboard-1", type: "keyboard", alias: "Keyboard" },
    { id: "filt-1", type: "ladderFilter", alias: "" },
    { id: "pin-1", type: "namedPortalIn", alias: "A" },
    { id: "pout-1", type: "namedPortalOut", alias: "A" },
  ],
  connections: [
    { sourceNode: "keyboard-1", sourcePort: "pitch", destinationNode: "pin-1", destinationPort: "In" },
    { sourceNode: "pout-1", sourcePort: "Out", destinationNode: "filt-1", destinationPort: "frequency" },
  ],
  modulations: [],
};

const src = nodeGraphNamedPortalColorSource("pin-1", patch);
assert(src && src.nodeId === "keyboard-1" && src.port === "pitch", `In color source ${JSON.stringify(src)}`);

const srcOut = nodeGraphNamedPortalColorSource("pout-1", patch);
assert(srcOut && srcOut.nodeId === "keyboard-1" && srcOut.port === "pitch", `Out mirrors In ${JSON.stringify(srcOut)}`);

// Wiring no longer renames the bus from the source outlet.
const renamed = nodeGraphNamedPortalSyncAliasFromSource(patch, "pin-1", "keyboard-1", "pitch");
assert(renamed.length === 0, `source rename disabled ${renamed}`);
assert(patch.nodes.find((n) => n.id === "pin-1").alias === "A", "In title stays A");
assert(patch.nodes.find((n) => n.id === "pout-1").alias === "A", "Out title stays A");

const destAttempt = nodeGraphNamedPortalSyncAliasFromDestination(patch, "pout-1", "filt-1", "frequency");
assert(destAttempt.length === 0, "dest rename disabled");

const spliced = nodeGraphSpliceNamedPortalCables(patch.nodes, patch.connections, patch.modulations);
assert(
  spliced.connections.some((c) =>
    c.sourceNode === "keyboard-1"
    && c.sourcePort === "pitch"
    && c.destinationNode === "filt-1"
    && c.destinationPort === "frequency"),
  "splice still lands",
);

const touched = nodeGraphNamedPortalIdsTouchedByWire(patch, "keyboard-1", "pin-1");
assert(touched.includes("pin-1") && touched.includes("pout-1"), `touched ${touched}`);

// Manual rename syncs bus (In title drives Out).
const bus = nodeGraphNamedPortalSyncBusAlias(patch, "pin-1", "Cutoff");
assert(bus.includes("pin-1") && bus.includes("pout-1"), `bus ${bus}`);
assert(patch.nodes.find((n) => n.id === "pout-1").alias === "Cutoff", "Out followed rename");

// Still no source-outlet overwrite after a custom title.
const skipped = nodeGraphNamedPortalSyncAliasFromSource(patch, "pin-1", "keyboard-1", "Trigger");
assert(skipped.length === 0, "source rename still no-op");
assert(patch.nodes.find((n) => n.id === "pin-1").alias === "Cutoff", "still Cutoff");

// InletOutletLayout registration (IO-only chrome for named portals).
const registerSrc = fs.readFileSync(
  path.join(root, "public", "modules", "portal", "portal-named-register.js"),
  "utf8",
);
assert(registerSrc.includes('chrome: "InletOutletLayout"'), "named portals must use InletOutletLayout");
assert(!registerSrc.includes('chrome: "TitleBarAndPorts"'), "named portals must not use TitleBarAndPorts");

console.log("ok: named portal color + title-driven bus (no source-outlet rename)");
