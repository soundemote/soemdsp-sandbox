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
