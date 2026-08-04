// Evolve Field UI — under construction shell only (no rAF / no heavy paint).
// Future: noise flow-field experiment (see evolve-field-register.js NOTE).

function createNodeGraphEvolveFieldBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-evolve-field-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "0";
  face.setAttribute(
    "aria-label",
    `${nodeGraphNodeDisplayName(node)} Evolve Field (under construction)`,
  );
  face.style.cssText = [
    "position:relative",
    "width:100%",
    "height:100%",
    "overflow:hidden",
    "background:#0a0a10",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-sizing:border-box",
    "padding:8px",
  ].join(";");

  const note = document.createElement("div");
  note.className = "node-evolve-field-uc-note";
  note.setAttribute("aria-hidden", "true");
  note.style.cssText = [
    "font:600 10px/1.35 ui-monospace,Consolas,monospace",
    "letter-spacing:0.04em",
    "text-align:center",
    "color:rgba(220,220,255,0.72)",
    "text-shadow:0 1px 2px #000",
    "user-select:none",
    "pointer-events:none",
    "max-width:92%",
  ].join(";");
  note.textContent = "UNDER CONSTRUCTION\nnoise flow field";
  note.style.whiteSpace = "pre-line";
  face.append(note);
  return face;
}

registerNodeGraphChromelessModuleUi("evolveField", {
  createBody: createNodeGraphEvolveFieldBody,
  afterMount(article, body, node, type) {
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        scopeElement: body,
        type,
        viewDrag: false,
      });
    }
  },
});
