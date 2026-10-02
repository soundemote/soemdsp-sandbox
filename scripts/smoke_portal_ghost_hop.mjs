// Cheap portal-bus hop for param ghosts.
// node scripts/smoke_portal_ghost_hop.mjs
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sandbox = {
  console,
  CSS: { escape: (s) => String(s) },
  document: {
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
  },
  window: {
    requestAnimationFrame() {
      return 0;
    },
  },
  nodeGraphMvp: {
    patch: {
      nodes: [
        { id: "namedPortalIn-5", type: "namedPortalIn", alias: "Envelope" },
        { id: "namedPortalOut-5", type: "namedPortalOut", alias: "Envelope" },
        { id: "curveAttackRelease-1", type: "curveAttackRelease" },
        { id: "flowerChildFilter-2", type: "flowerChildFilter" },
        { id: "namedPortalIn-other", type: "namedPortalIn", alias: "Other" },
        { id: "namedPortalOut-other", type: "namedPortalOut", alias: "Other" },
        {
          id: "namedPortalIn-meta",
          type: "namedPortalIn",
          alias: "Envelope",
          ownerMetamoduleId: "mm-1",
        },
      ],
      connections: [
        {
          sourceNode: "curveAttackRelease-1",
          sourcePort: "Out",
          destinationNode: "namedPortalIn-5",
          destinationPort: "In",
        },
      ],
      modulations: [
        {
          sourceNode: "namedPortalOut-5",
          sourcePort: "Out",
          destinationNode: "flowerChildFilter-2",
          destinationParam: "frequency",
        },
      ],
    },
  },
  nodeGraphModuleScopeState: {
    buffers: new Map([["curveAttackRelease-1:Out", [0.42]]]),
  },
  nodeGraphPatchNode(id) {
    return sandbox.nodeGraphMvp.patch.nodes.find((n) => n.id === id) || null;
  },
  nodeGraphPatchNodeType(id) {
    return sandbox.nodeGraphPatchNode(id)?.type || "";
  },
  nodeGraphIsNamedPortalInType(type) {
    return String(type || "") === "namedPortalIn";
  },
  nodeGraphIsNamedPortalOutType(type) {
    return String(type || "") === "namedPortalOut";
  },
  nodeGraphNamedPortalBusKey(node) {
    return String(node?.alias || "").trim().toLowerCase();
  },
  nodeGraphNamedPortalUniverse(node) {
    return String(node?.ownerMetamoduleId || "").trim();
  },
  nodeGraphFiniteNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },
  clampNodeSliderValue(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  },
  wrapNodeSliderValue(v) {
    return Number(v);
  },
  nodeGraphReadNodeNumber() {
    return Number.NaN;
  },
  nodeGraphReadPatchParameterValue() {
    return Number.NaN;
  },
  nodeGraphReadPatchParameterMetadata() {
    return {};
  },
  nodeGraphParameterOutputPort() {
    return false;
  },
  nodeGraphParamNormalizeModInput(sample) {
    return Number(sample);
  },
  nodeGraphParamFoldModSources(base, sources) {
    return Number(base) + sources.reduce((s, v) => s + Number(v), 0);
  },
  nodeGraphParamDomainToUnit(v) {
    return Number(v);
  },
  nodeGraphNodeElement() {
    return null;
  },
  nodeGraphSliderForParameter() {
    return null;
  },
};

vm.createContext(sandbox);
const src = fs.readFileSync(
  path.join(root, "public", "node-graph-ghost-sliders.js"),
  "utf8",
);
vm.runInContext(src, sandbox, { filename: "node-graph-ghost-sliders.js" });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(typeof sandbox.nodeGraphGhostSliderModSample === "function", "mod sample");
assert(typeof sandbox.nodeGraphParameterGhostSignal === "function", "ghost signal");

const hopped = sandbox.nodeGraphGhostSliderModSample("namedPortalOut-5", "Out");
assert(hopped === 0.42, `portal Out hops to envelope scope, got ${hopped}`);

const other = sandbox.nodeGraphGhostSliderModSample("namedPortalOut-other", "Out");
assert(other == null, `empty other bus stays null, got ${other}`);

const wrongUniverse = sandbox.nodeGraphGhostSliderModSample("namedPortalOut-5", "Out");
// meta Envelope In must not pollute root Envelope Out sum (no cable / no scope on meta In)
assert(wrongUniverse === 0.42, "metamodule peer not mixed into root bus");

const ghost = sandbox.nodeGraphParameterGhostSignal("flowerChildFilter-2", "frequency");
assert(ghost && Number(ghost.signal) === 0.42, `cutoff ghost signal ${JSON.stringify(ghost)}`);

// Multi-In bus: second peer with scope adds.
sandbox.nodeGraphMvp.patch.nodes.push({
  id: "namedPortalIn-5b",
  type: "namedPortalIn",
  alias: "Envelope",
});
sandbox.nodeGraphModuleScopeState.buffers.set("namedPortalIn-5b:In", [0.1]);
const summed = sandbox.nodeGraphGhostSliderModSample("namedPortalOut-5", "Out");
assert(summed === 0.52, `multi-In bus sums, got ${summed}`);

console.log("smoke_portal_ghost_hop: ok");
