// Group Input's UI -- see public/modules/led/led-ui.js for the pattern
// this follows: a fully custom, chromeless body with just the one port
// this module actually needs.
function createNodeGraphGroupInputFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-group-input-face";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} group input`);
  face.append(createNodeGraphPort(node, type, "Out", "output"));
  return face;
}

registerNodeGraphChromelessModuleUi("groupInput", {
  createBody: createNodeGraphGroupInputFace,
});
