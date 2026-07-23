// Bug Button's UI -- follows the LED pattern (see
// node-graph-chromeless-module-registry.js): a chromeless 1gu tile whose
// whole face is the control. Clicking the 🐞 fires a one-sample spike via
// the same nodeId-keyed trigger path impulseButton uses.

function createNodeGraphBugButtonFace(node, type) {
  const face = document.createElement("button");
  face.type = "button";
  face.className = "node-bug-button-face";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} -- click to send a one-sample spike`);
  face.title = "Click: send a 1-sample spike out of Spike";
  const bug = document.createElement("span");
  bug.className = "node-bug-button-emoji";
  bug.setAttribute("aria-hidden", "true");
  bug.textContent = "\u{1F41E}";
  face.append(bug, createNodeGraphPort(node, type, "Spike", "output"));
  face.addEventListener("pointerdown", (event) => {
    // The face IS the trigger -- don't let the workspace interpret the
    // press as the start of a node drag / marquee.
    event.stopPropagation();
  });
  face.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof triggerNodeGraphImpulseButton === "function") {
      triggerNodeGraphImpulseButton(node);
    }
    face.classList.remove("spiking");
    // restart the flash animation
    void face.offsetWidth;
    face.classList.add("spiking");
  });
  return face;
}

registerNodeGraphChromelessModuleUi("bugButton", {
  createBody: createNodeGraphBugButtonFace,
});
