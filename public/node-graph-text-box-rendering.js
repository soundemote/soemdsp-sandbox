// Thin shim: Text Box face is the isolated widget (modules/textBox/).

function createNodeGraphTextBoxBody(node) {
  const body = document.createElement("div");
  body.className = "node-text-box-body";
  body.dataset.node = node;
  body.dataset.moduleBand = "face";
  body.classList.add("node-module-face");
  return body;
}

function syncNodeGraphTextBoxElement(element, patchNode) {
  if (typeof nodeGraphTextBoxHostSync === "function") {
    nodeGraphTextBoxHostSync(element, patchNode);
  }
}
