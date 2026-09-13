// Metamodule shell face. Meta In/Out use TitleBarAndPorts — no custom face.
// Pinned child displays (layout canvas / Show in canvas) live on this face
// when viewing Root. See metamodule-display-mirror.js.

function createNodeGraphMetamoduleFace(nodeId, type) {
  const face = document.createElement("div");
  face.className = "node-metamodule-face";
  face.dataset.metamoduleFace = "1";
  face.dataset.node = String(nodeId || "");
  face.dataset.nodeType = String(type || "metamodule");

  const empty = document.createElement("div");
  empty.className = "node-metamodule-face-empty";
  empty.textContent = "Double-click to enter";
  face.appendChild(empty);

  const stage = document.createElement("div");
  stage.className = "node-metamodule-canvas-stage";
  stage.hidden = true;
  face.appendChild(stage);

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
    if (typeof nodeGraphMetamodulePresentCanvasOnFace === "function") {
      nodeGraphMetamodulePresentCanvasOnFace(nodeId);
    } else if (typeof nodeGraphMetamodulePaintMirror === "function") {
      nodeGraphMetamodulePaintMirror(nodeId);
    }
  },
};

registerNodeGraphChromelessModuleUi("metamodule", nodeGraphMetamoduleFaceUi);
registerNodeGraphChromelessModuleUi("group", nodeGraphMetamoduleFaceUi);
