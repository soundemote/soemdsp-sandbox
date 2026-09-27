// Portal helpers. InletOutletLayout modules mount title + standard IO only -
// no custom face / createBody path (jacks live in .dsp-node-io-section).

function nodeGraphNodeIsPortalIo(nodeOrId) {
  const node = typeof nodeOrId === "string"
    ? (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeOrId) : null)
    : nodeOrId;
  const type = node?.type;
  if (typeof nodeGraphPortalKindFromType === "function") {
    return Boolean(nodeGraphPortalKindFromType(type));
  }
  return type === "portalInlet" || type === "portalOutlet";
}

function nodeGraphPortalLaneLetterForPort(port) {
  const key = String(port || "");
  if (key === "Mono") return "M";
  if (key === "Left") return "L";
  if (key === "Right") return "R";
  return key.slice(0, 1) || "";
}