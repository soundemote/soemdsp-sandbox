// Portal cables in the pluck envelope breadboard must compile to the same
// edges as the direct wires already in that patch.
// node scripts/smoke_portal_splice_breadboard.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchPath = path.join(
  root,
  "patches",
  "modulator breadboards",
  "pluck envelope.json",
);
const helperPath = path.join(root, "public", "modules", "portal", "portal-named.js");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(helperPath, "utf8"), sandbox, { filename: helperPath });
const splice = sandbox.nodeGraphSpliceNamedPortalCables;
if (typeof splice !== "function") {
  throw new Error("nodeGraphSpliceNamedPortalCables missing");
}

const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const { connections, modulations } = splice(patch.nodes, patch.connections, patch.modulations);

const edge = (list, src, srcPort, dst, dstPort) => list.some((c) =>
  c.sourceNode === src
  && c.sourcePort === srcPort
  && c.destinationNode === dst
  && (c.destinationPort === dstPort || c.destinationParam === dstPort));

// Required = post-splice equivalents of the breadboard's real portal buses
// (Trigger, Envelope, f). No clock / Note# / Reset / pitchManager.
const required = [
  ["keyboard-1", "Trigger", "curveAttackRelease-1", "Gate"],
  ["keyboard-1", "f", "polyBlep-1", "f"],
  ["curveAttackRelease-1", "Out", "flowerChildFilter-2", "frequency"],
];

const misses = required.filter(([s, sp, d, dp]) =>
  !edge(connections, s, sp, d, dp) && !edge(modulations, s, sp, d, dp));

const portalLeft = [...connections, ...modulations].filter((c) =>
  String(c.sourceNode || "").startsWith("namedPortal")
  || String(c.destinationNode || "").startsWith("namedPortal"));

console.log("spliced signal", connections.map((c) =>
  `${c.sourceNode}.${c.sourcePort} -> ${c.destinationNode}.${c.destinationPort}`));
console.log("spliced mods", modulations.map((m) =>
  `${m.sourceNode}.${m.sourcePort} -> ${m.destinationNode}.${m.destinationParam}`));

if (portalLeft.length) {
  console.error("FAIL: portal ids still in compiled cables", portalLeft);
  process.exit(1);
}
if (misses.length) {
  console.error("FAIL: missing direct-equivalent edges", misses);
  process.exit(1);
}
console.log("ok: breadboard portals compile to the same cables as the direct wires");