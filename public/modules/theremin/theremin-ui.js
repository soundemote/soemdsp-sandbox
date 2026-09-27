// Theremin face — reuses XY Pad body (puck + phosphor). X = pitch, Y = volume.

registerNodeGraphChromelessModuleUi("theremin", {
  createBody(node, type) {
    if (typeof createNodeGraphXyPadBody !== "function") {
      const fallback = document.createElement("div");
      fallback.className = "node-theremin node-xy-pad";
      fallback.dataset.node = node;
      fallback.dataset.nodeType = type || "theremin";
      fallback.textContent = "XY Pad UI missing";
      return fallback;
    }
    const pad = createNodeGraphXyPadBody(node, type || "theremin");
    pad.classList.add("node-theremin");
    const canvas = pad.querySelector(".node-xy-pad-canvas");
    if (canvas) {
      const name = typeof nodeGraphNodeDisplayName === "function"
        ? nodeGraphNodeDisplayName(node)
        : "Theremin";
      canvas.setAttribute("aria-label", `${name} theremin pad (X pitch / Y volume)`);
    }
    return pad;
  },
});
