// Metamodule shell face. Meta In/Out use TitleBarAndPorts (standard IO section) — no custom face.
// Enabled metamodule.displays layers blit additively onto a present canvas
// (see metamodule-display-mirror.js + lib/visual/display-layer-compositor.js).

function createNodeGraphMetamoduleFace(nodeId, type) {
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  const face = document.createElement("div");
  face.className = "node-metamodule-face";
  face.dataset.metamoduleFace = "1";
  face.dataset.node = String(nodeId || "");
  face.dataset.nodeType = String(type || "metamodule");

  const empty = document.createElement("div");
  empty.className = "node-metamodule-face-empty";
  empty.textContent = "Double-click to enter";
  face.appendChild(empty);

  const canvas = document.createElement("canvas");
  canvas.className = "node-metamodule-mirror-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  face.appendChild(canvas);

  const payload = typeof nodeGraphEnsureMetamodulePayload === "function"
    ? nodeGraphEnsureMetamodulePayload(patchNode)
    : (patchNode?.metamodule || {});
  const enabled = Array.isArray(payload?.displays)
    ? payload.displays.filter((d) => d && d.enabled && d.childId)
    : [];
  if (enabled.length) {
    empty.hidden = true;
    empty.textContent = "";
    canvas.hidden = false;
  }

  face.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof enterNodeGraphMetamoduleView === "function") {
      enterNodeGraphMetamoduleView(nodeId);
    }
  });
  return face;
}

const nodeGraphMetamoduleFaceUi = {
  createBody: createNodeGraphMetamoduleFace,
  afterMount(article, body, nodeId) {
    // Whole shell enters — face dblclick can miss if the face isn't mounted.
    if (!article || article.dataset.metaEnterBound === "1") return;
    article.dataset.metaEnterBound = "1";
    article.addEventListener("dblclick", (event) => {
      if (event.target?.closest?.(".node-port, .node-param-port, input, button, textarea")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof enterNodeGraphMetamoduleView === "function") {
        enterNodeGraphMetamoduleView(nodeId);
      }
    });
    if (typeof nodeGraphMetamodulePaintMirror === "function") {
      nodeGraphMetamodulePaintMirror(nodeId);
      const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      const enabled = typeof nodeGraphMetamoduleEnabledDisplayEntries === "function"
        ? nodeGraphMetamoduleEnabledDisplayEntries(meta)
        : [];
      if (enabled.length && typeof nodeGraphMetamoduleArmMirrorLoop === "function") {
        nodeGraphMetamoduleArmMirrorLoop(nodeId);
      }
    }
  },
};

registerNodeGraphChromelessModuleUi("metamodule", nodeGraphMetamoduleFaceUi);
registerNodeGraphChromelessModuleUi("group", nodeGraphMetamoduleFaceUi);
