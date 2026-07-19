// Group Output's UI -- see public/modules/led/led-ui.js for the pattern
// this follows: a fully custom, chromeless body with just the one port
// this module actually needs (its declared "In" -- see
// group-output-register.js for why there's no visible "Out" port here).
function createNodeGraphGroupOutputFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-group-output-face";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} group output`);
  face.append(createNodeGraphPort(node, type, "In", "input"));
  return face;
}

registerNodeGraphChromelessModuleUi("groupOutput", {
  createBody: createNodeGraphGroupOutputFace,
});
