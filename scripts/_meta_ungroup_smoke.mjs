/**
 * Smoke: metamodule portal stitch + ungroup (no DOM).
 * Run: node scripts/_meta_ungroup_smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(
  path.join(root, "public/modules/metamodule/metamodule-core.js"),
  "utf8",
);

const nodeGraphMvp = {
  patch: null,
  metamoduleViewStack: [],
  activeNodes: new Set(),
  selected: null,
};

const sandbox = {
  console,
  nodeGraphMvp,
  nodeGraphPatchNode(id) {
    return (nodeGraphMvp.patch?.nodes || []).find((n) => n?.id === id) || null;
  },
  createNodeGraphPatchNode(type, opts = {}) {
    return { type, params: {}, paramMeta: {}, ...opts };
  },
  updateNodeGraphMetamoduleBreadcrumb() {},
  setNodeInteractionHelp() {},
  commitNodeGraphPatch() {},
  selectNodeGraphItem() {},
  nodeGraphSyncMetamoduleVisibilityToDom() {},
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const {
  nodeGraphMetamodulePortalizeCrossing,
  ungroupNodeGraphMetamoduleInPlace,
  nodeGraphEnsureMetamodulePayload,
  NODE_GRAPH_METAMODULE_TYPE,
} = sandbox;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Build: Outside → Child (inbound) and Child → Outside2 (outbound)
const patch = {
  nodes: [
    { id: "out-src", type: "gain", gx: 0, gy: 0, params: {} },
    { id: "child", type: "hypersaw2", gx: 4, gy: 0, params: {} },
    { id: "out-dst", type: "gain", gx: 8, gy: 0, params: {} },
    {
      id: "metamodule-1",
      type: "metamodule",
      gx: 4,
      gy: 0,
      params: { amplitude: 1, voices: 4, playmode: 0 },
      metamodule: { boundary: [], displays: [], paramVisibility: {} },
    },
  ],
  connections: [
    { sourceNode: "out-src", sourcePort: "Out", destinationNode: "child", destinationPort: "Pitch" },
    { sourceNode: "child", sourcePort: "Left", destinationNode: "out-dst", destinationPort: "In" },
  ],
  modulations: [],
  graphConnections: [],
  bypassedNodes: [],
};
nodeGraphMvp.patch = patch;
nodeGraphMvp.activeNodes = new Set(patch.nodes.map((n) => n.id));

const meta = patch.nodes.find((n) => n.id === "metamodule-1");
const child = patch.nodes.find((n) => n.id === "child");
child.ownerMetamoduleId = "metamodule-1";
nodeGraphEnsureMetamodulePayload(meta).displays = [{ childId: "child", enabled: false, order: 0 }];

const crossing = {
  inbound: [{
    kind: "signal",
    connection: patch.connections[0],
    sourceNode: "out-src",
    sourcePort: "Out",
    destinationNode: "child",
    destinationPort: "Pitch",
  }],
  outbound: [{
    kind: "signal",
    connection: patch.connections[1],
    sourceNode: "child",
    sourcePort: "Left",
    destinationNode: "out-dst",
    destinationPort: "In",
  }],
};

nodeGraphMetamodulePortalizeCrossing(meta, crossing, [child], patch);

assert(patch.nodes.some((n) => n.type === "metamoduleIn"), "expected metamoduleIn portal");
assert(patch.nodes.some((n) => n.type === "metamoduleOut"), "expected metamoduleOut portal");
assert(
  !patch.connections.some((c) => c.sourceNode === "out-src" && c.destinationNode === "child"),
  "direct inbound should be portalized",
);

const removed = ungroupNodeGraphMetamoduleInPlace("metamodule-1", patch);
assert(removed.includes("metamodule-1"), "shell should be removed");
assert(!patch.nodes.some((n) => n.type === "metamodule"), "no metamodule left");
assert(!patch.nodes.some((n) => n.type === "metamoduleIn" || n.type === "metamoduleOut"), "portals gone");
assert(!child.ownerMetamoduleId, "child ownership cleared");
assert(
  patch.connections.some((c) =>
    c.sourceNode === "out-src" && c.destinationNode === "child" && c.destinationPort === "Pitch"
  ),
  "inbound wire restored",
);
assert(
  patch.connections.some((c) =>
    c.sourceNode === "child" && c.sourcePort === "Left" && c.destinationNode === "out-dst"
  ),
  "outbound wire restored",
);

// --- Shell ports + connect rewrite (S1c) ---
{
  const patch2 = {
    nodes: [
      { id: "src", type: "gain", gx: 0, gy: 0, params: {} },
      { id: "child", type: "hypersaw2", gx: 4, gy: 0, params: {} },
      { id: "dst", type: "gain", gx: 8, gy: 0, params: {} },
      {
        id: "metamodule-1",
        type: "metamodule",
        gx: 4,
        gy: 0,
        params: { amplitude: 1, voices: 4, playmode: 0 },
        metamodule: { boundary: [], displays: [], paramVisibility: {} },
      },
    ],
    connections: [
      { sourceNode: "src", sourcePort: "Out", destinationNode: "child", destinationPort: "Pitch" },
      { sourceNode: "child", sourcePort: "Left", destinationNode: "dst", destinationPort: "In" },
    ],
    modulations: [],
    graphConnections: [],
    bypassedNodes: [],
  };
  nodeGraphMvp.patch = patch2;
  nodeGraphMvp.activeNodes = new Set(patch2.nodes.map((n) => n.id));
  nodeGraphMvp.metamoduleViewStack = [];

  const meta = patch2.nodes.find((n) => n.id === "metamodule-1");
  const child = patch2.nodes.find((n) => n.id === "child");
  child.ownerMetamoduleId = "metamodule-1";
  nodeGraphEnsureMetamodulePayload(meta).displays = [{ childId: "child", enabled: false, order: 0 }];
  sandbox.nodeGraphMetamodulePortalizeCrossing(
    meta,
    {
      inbound: [{
        kind: "signal",
        connection: patch2.connections[0],
        sourceNode: "src",
        sourcePort: "Out",
        destinationNode: "child",
        destinationPort: "Pitch",
      }],
      outbound: [{
        kind: "signal",
        connection: patch2.connections[1],
        sourceNode: "child",
        sourcePort: "Left",
        destinationNode: "dst",
        destinationPort: "In",
      }],
    },
    [child],
    patch2,
  );

  const ports = sandbox.nodeGraphMetamoduleShellPorts(meta);
  assert(ports.inputs.includes("Poly"), "shell keeps Poly");
  assert(ports.inputs.includes("Pitch"), `expected Pitch inlet, got ${ports.inputs.join(",")}`);
  assert(ports.outputs.includes("Left"), `expected Left outlet, got ${ports.outputs.join(",")}`);

  const rewrittenIn = sandbox.nodeGraphMetamoduleRewriteShellConnection(
    "src",
    "Out",
    "metamodule-1",
    "Pitch",
  );
  assert(rewrittenIn.destinationPort === "In", "shell Pitch rewrites to portal In");
  assert(
    patch2.nodes.some((n) => n.id === rewrittenIn.destinationNode && n.type === "metamoduleIn"),
    "rewrite dest is metamoduleIn",
  );

  const rewrittenOut = sandbox.nodeGraphMetamoduleRewriteShellConnection(
    "metamodule-1",
    "Left",
    "dst",
    "In",
  );
  assert(rewrittenOut.sourcePort === "Out", "shell Left rewrites to portal Out");
  assert(
    patch2.nodes.some((n) => n.id === rewrittenOut.sourceNode && n.type === "metamoduleOut"),
    "rewrite src is metamoduleOut",
  );

  const inPortal = patch2.nodes.find((n) => n.type === "metamoduleIn");
  const visual = sandbox.nodeGraphMetamoduleWireVisualEndpoint(inPortal.id, "In", "input");
  assert(visual?.nodeId === "metamodule-1", "visual dest is shell");
  assert(visual?.port === "Pitch", "visual port is Pitch");
}

console.log("meta ungroup + shell proxy smoke OK");
