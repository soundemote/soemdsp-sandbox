// Text Stream face — message box only.

function createNodeGraphTextStreamFace(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const store = typeof normalizeNodeGraphTextStream === "function"
    ? normalizeNodeGraphTextStream(patchNode?.textStream)
    : { message: TEXT_STREAM_DEFAULT_MESSAGE };

  const face = document.createElement("div");
  face.className = "node-text-stream-face";
  face.dataset.node = nodeId;
  face.dataset.nodeType = "textStream";
  face.setAttribute("aria-label", "Text Stream message");

  const label = document.createElement("div");
  label.className = "node-text-stream-label";
  label.textContent = "Message → Char (serial)";

  const area = document.createElement("textarea");
  area.className = "node-text-stream-message";
  area.spellcheck = false;
  area.autocomplete = "off";
  area.rows = 5;
  area.value = store.message;
  area.setAttribute("aria-label", "Text to stream one character at a time");

  const commit = () => {
    commitNodeGraphTextStreamMessage(nodeId, area.value);
  };
  area.addEventListener("pointerdown", (e) => e.stopPropagation());
  area.addEventListener("keydown", (e) => e.stopPropagation());
  area.addEventListener("change", commit);
  area.addEventListener("blur", commit);

  face.append(label, area);
  face.addEventListener("pointerdown", (event) => {
    if (event.target.closest("textarea")) {
      event.stopPropagation();
    }
  });
  return face;
}

function commitNodeGraphTextStreamMessage(nodeId, message) {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("textStream")) {
    return false;
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((n) => n.id === nodeId);
  if (!patchNode) {
    return false;
  }
  patchNode.textStream = typeof normalizeNodeGraphTextStream === "function"
    ? normalizeNodeGraphTextStream({ message })
    : { message: String(message || "") };
  commitNodeGraphPatch(patch, {
    status: "Text Stream message",
    record: true,
  });
  return true;
}
