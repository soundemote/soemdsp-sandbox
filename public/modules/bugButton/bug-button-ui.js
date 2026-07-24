// Bug Button's complete pointer surface. The browser owns interaction events;
// browser/offline and AudioWorklet evaluators consume the same explicit state.

function nodeGraphBugButtonPointerPosition(control, event) {
  const rect = control.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const y = 1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y)),
  };
}

function syncNodeGraphBugButtonVisual(face) {
  const node = face?.dataset.node;
  const glyph = face?.querySelector(".node-bug-button-emoji");
  if (!node || !glyph) {
    return;
  }
  const value = (key, fallback) => {
    const number = Number(document.getElementById(`node-${node}-${key}`)?.value);
    return Number.isFinite(number) ? number : fallback;
  };
  const connected = (port) => (nodeGraphMvp.patch.connections || []).some((connection) =>
    connection.destinationNode === node && connection.destinationPort === port
  );
  const effective = (port, capturedPort, base) => connected(port)
    ? nodeGraphModuleScopeLatestOutputValue(node, capturedPort, base)
    : base;
  const size = effective("Size", "__VisualSize", value("size", 1));
  const x = effective("X", "__VisualX", value("xPosition", 0));
  const y = effective("Y", "__VisualY", value("yPosition", 0));
  const opacity = effective("Opacity", "__VisualOpacity", value("opacity", 1));
  glyph.style.setProperty("--node-bug-button-size", String(Math.max(0, Math.min(2, size))));
  glyph.style.setProperty("--node-bug-button-x", String(Math.max(-1, Math.min(1, x))));
  glyph.style.setProperty("--node-bug-button-y", String(Math.max(-1, Math.min(1, y))));
  glyph.style.opacity = String(Math.max(0, Math.min(1, opacity)));
}

function createNodeGraphBugButtonFace(node, type) {
  const patchNode = nodeGraphPatchNode(node);
  const face = document.createElement("div");
  face.className = "node-bug-button-face";
  face.dataset.parameterVisual = "true";
  face.dataset.node = node;
  face.dataset.nodeType = type;

  const control = document.createElement("button");
  control.type = "button";
  control.className = "node-bug-button-control";
  control.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} interaction button`);
  control.title = "Pointer button: down/up spikes, held/hover gates, bipolar X/Y. Edit the character in module settings.";

  const glyph = document.createElement("span");
  glyph.className = "node-bug-button-emoji";
  glyph.textContent = normalizeNodeGraphBugButtonGlyph(patchNode?.bugButton?.glyph);
  control.append(glyph);
  face.append(control);
  face.addEventListener("input", () => syncNodeGraphBugButtonVisual(face));
  face.syncFromParameters = () => syncNodeGraphBugButtonVisual(face);
  requestAnimationFrame(face.syncFromParameters);

  let pressed = false;
  let pendingMove = null;
  let moveFrame = 0;

  const sendPosition = (event, extra = {}) => {
    const position = nodeGraphBugButtonPointerPosition(control, event);
    setNodeGraphBugButtonInteraction(node, { ...position, ...extra });
  };
  const queuePosition = (event) => {
    pendingMove = { clientX: event.clientX, clientY: event.clientY };
    if (moveFrame) {
      return;
    }
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      if (pendingMove) {
        sendPosition(pendingMove);
        pendingMove = null;
      }
    });
  };

  control.addEventListener("pointerenter", (event) => {
    sendPosition(event, { hover: 1 });
  });
  control.addEventListener("pointerleave", (event) => {
    if (!pressed) sendPosition(event, { hover: 0 });
  });
  control.addEventListener("pointermove", (event) => {
    queuePosition(event);
  });
  control.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pressed = true;
    face.classList.add("pressed");
    try { control.setPointerCapture(event.pointerId); } catch (_) {}
    sendPosition(event, { down: 1, downPulse: true, hover: 1 });
  });
  control.addEventListener("pointerup", (event) => {
    if (!pressed) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pressed = false;
    face.classList.remove("pressed");
    sendPosition(event, { down: 0, upPulse: true });
    try { control.releasePointerCapture(event.pointerId); } catch (_) {}
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    setNodeGraphBugButtonInteraction(node, { hover: control.contains(underPointer) ? 1 : 0 });
  });
  control.addEventListener("pointercancel", (event) => {
    if (!pressed) {
      return;
    }
    pressed = false;
    face.classList.remove("pressed");
    sendPosition(event, { down: 0, hover: 0 });
  });

  return face;
}

registerNodeGraphChromelessModuleUi("bugButton", {
  createBody: createNodeGraphBugButtonFace,
});

addNodeGraphModuleScopeSnapshotListener(() => {
  for (const face of document.querySelectorAll(".node-bug-button-face")) {
    syncNodeGraphBugButtonVisual(face);
  }
});
