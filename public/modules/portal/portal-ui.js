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

function createNodeGraphPortalFace(node, type) {
  const kind = typeof nodeGraphPortalKindFromType === "function"
    ? nodeGraphPortalKindFromType(type)
    : "";
  const spec = typeof nodeGraphPortalLaneSpecFromType === "function"
    ? nodeGraphPortalLaneSpecFromType(type)
    : null;
  const face = document.createElement("div");
  face.className = `node-portal-face is-${kind || "inlet"}`;
  face.dataset.node = node;
  face.dataset.nodeType = type;
  const io = kind === "outlet" ? "input" : "output";
  const ports = kind === "outlet"
    ? (spec?.ports || ["Mono"])
    : (spec?.ports || ["Mono"]);
  const marks = ports.map((port) => ({
    port,
    letter: nodeGraphPortalLaneLetterForPort(port),
  }));
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(face, "face");
  }
  if (marks.length === 1) {
    const channel = document.createElement("span");
    channel.className = "node-portal-channel";
    channel.textContent = marks[0].letter;
    face.append(channel);
    if (typeof createNodeGraphPort === "function") {
      face.append(createNodeGraphPort(node, type, marks[0].port, io));
    }
    return face;
  }
  for (const mark of marks) {
    const row = document.createElement("div");
    row.className = "node-portal-lane";
    const channel = document.createElement("span");
    channel.className = "node-portal-channel";
    channel.textContent = mark.letter;
    row.append(channel);
    if (typeof createNodeGraphPort === "function") {
      row.append(createNodeGraphPort(node, type, mark.port, io));
    }
    face.append(row);
  }
  return face;
}

if (typeof registerNodeGraphChromelessModuleUi === "function"
  && typeof nodeGraphPortalAllTypes === "function") {
  for (const type of nodeGraphPortalAllTypes()) {
    registerNodeGraphChromelessModuleUi(type, {
      createBody: createNodeGraphPortalFace,
    });
  }
}
