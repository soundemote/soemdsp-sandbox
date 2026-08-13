function nodeGraphNodeIsPortalIo(nodeOrId) {
  const node = typeof nodeOrId === "string"
    ? (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeOrId) : null)
    : nodeOrId;
  return node?.type === "portalInlet" || node?.type === "portalOutlet";
}

function openNodePortalDisplaySettings(event, nodeElement = null) {
  const nodeEl = nodeElement
    || event?.currentTarget?.closest?.(".dsp-node")
    || event?.target?.closest?.(".dsp-node");
  const nodeId = String(nodeEl?.dataset?.node || "").trim();
  if (!nodeGraphNodeIsPortalIo(nodeId)) {
    return false;
  }
  if (typeof openNodeGraphTraceDisplaySettings !== "function") {
    return false;
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const opened = openNodeGraphTraceDisplaySettings(nodeId, event);
  window.requestAnimationFrame(() => {
    const field = document.querySelector("[data-portal-field=\"channel\"]");
    if (field) {
      field.focus();
      field.select?.();
    }
  });
  return opened;
}

function nodeGraphPortalPaintChannel(face, channel) {
  if (!face) {
    return;
  }
  const glyph = face.querySelector(".node-portal-channel");
  if (glyph) {
    glyph.textContent = String(
      typeof nodeGraphPortalClampChannel === "function"
        ? nodeGraphPortalClampChannel(channel)
        : Math.max(0, Math.round(Number(channel) || 0)),
    );
  }
}

function syncNodeGraphPortalElement(element, patchNode) {
  const face = element?.querySelector?.(".node-portal-face");
  if (!face || !patchNode) {
    return;
  }
  const channel = typeof nodeGraphPortalChannelFromNode === "function"
    ? nodeGraphPortalChannelFromNode(patchNode)
    : Number(patchNode.params?.channel) || 0;
  nodeGraphPortalPaintChannel(face, channel);
}

function createNodeGraphPortalBody(node, type) {
  const nodeId = String(node || "");
  const kind = String(type || "");
  const isOutlet = kind === "portalOutlet";
  const face = document.createElement("div");
  face.className = `node-portal-face node-module-face ${isOutlet ? "is-outlet" : "is-inlet"}`;
  face.dataset.node = nodeId;
  face.dataset.nodeType = kind;
  face.dataset.moduleBand = "face";
  face.setAttribute("aria-label", isOutlet ? "Outlet portal" : "Inlet portal");
  const glyph = document.createElement("span");
  glyph.className = "node-portal-channel";
  glyph.textContent = "0";
  face.append(glyph);
  if (isOutlet) {
    face.append(createNodeGraphPort(nodeId, kind, "In", "input"));
  } else {
    face.append(createNodeGraphPort(nodeId, kind, "Out", "output"));
  }
  face.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".node-port")) {
      return;
    }
    if (typeof beginNodeGraphNodeDrag === "function") {
      beginNodeGraphNodeDrag(event);
    }
  });
  face.addEventListener("dblclick", (event) => {
    if (event.target?.closest?.(".node-port")) {
      return;
    }
    openNodePortalDisplaySettings(event, face.closest(".dsp-node"));
  });
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  nodeGraphPortalPaintChannel(face, patchNode?.params?.channel);
  return face;
}

registerNodeGraphChromelessModuleUi("portalInlet", {
  createBody: (node, type) => createNodeGraphPortalBody(node, type || "portalInlet"),
});

registerNodeGraphChromelessModuleUi("portalOutlet", {
  createBody: (node, type) => createNodeGraphPortalBody(node, type || "portalOutlet"),
});
