function nodeGraphNodeIsPortalIo(nodeOrId) {
  const node = typeof nodeOrId === "string"
    ? (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeOrId) : null)
    : nodeOrId;
  return node?.type === "portalInlet" || node?.type === "portalOutlet";
}
