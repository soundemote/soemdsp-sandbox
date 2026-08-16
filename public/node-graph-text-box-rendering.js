// Thin shim: Text Box face is the isolated widget (modules/textBox/).

function createNodeGraphTextBoxBody(node) {
  const body = document.createElement("div");
  body.className = "node-text-box-body node-module-face node-light-source";
  body.dataset.node = node;
  body.dataset.moduleBand = "face";
  body.dataset.lightSource = "screen";
  body.dataset.lightStrength = "0.5";
  if (typeof setNodeGraphLightStrength === "function") {
    setNodeGraphLightStrength(body, 0.5);
  }
  return body;
}

function syncNodeGraphTextBoxElement(element, patchNode) {
  if (typeof nodeGraphTextBoxHostSync === "function") {
    nodeGraphTextBoxHostSync(element, patchNode);
  }
}
