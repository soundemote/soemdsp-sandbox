function nodeGraphNodeIoSectionEmptyTarget(event, handle) {
  if (!handle?.classList?.contains("dsp-node-io-section")) {
    return false;
  }
  return !event.target.closest?.(
    ".node-io-row, .node-port, .node-param-port, button, input, textarea, select, option, label, [contenteditable='true']",
  );
}

function nodeGraphNodeIoBypassClickCandidate(event, handle) {
  return event.altKey && nodeGraphNodeIoSectionEmptyTarget(event, handle);
}

function nodeGraphPatchNodeMovementLocked(nodeId) {
  const patchNode = nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === nodeId);
  return Boolean(normalizeNodeGraphPatchNodeUi(patchNode?.ui).movementLocked);
}

function toggleNodeGraphNodeMovementLock(event) {
  const node = event.currentTarget?.closest?.(".dsp-node");
  const nodeId = node?.dataset?.node;
  if (!nodeId) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (!patchNode) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(patchNode.ui);
  ui.movementLocked = !ui.movementLocked;
  patchNode.ui = ui;
  commitNodeGraphPatch(patch, {
    status: ui.movementLocked ? "module movement locked" : "module movement unlocked",
  });
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphNodeDrag(event) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  if (
    event.target.closest?.(
      ".node-port, .node-param-port, button:not(.node-drag-handle), input:not(.node-header-title-input), textarea, select, option, [contenteditable='true']",
    )
  ) {
    return;
  }
  const handle = event.currentTarget.closest(
    ".node-drag-handle, .node-execution-order-badge, .node-header-title-row, .node-led-face, .node-group-input-face, .node-group-output-face, .node-knob-widget-body, .dsp-node-io-section, .node-parameter-row",
  );
  if (!handle) {
    return;
  }
  if (handle.classList.contains("dsp-node-io-section") && !nodeGraphNodeIoSectionEmptyTarget(event, handle)) {
    return;
  }

  const node = handle.closest(".dsp-node");
  if (!node) {
    return;
  }
  if (nodeGraphPatchNodeMovementLocked(node.dataset.node)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const additiveSelection = event.ctrlKey || event.metaKey || event.shiftKey;
  const selectedNodeIds = nodeGraphSelectedNodeIds();
  const wasSelectedAtStart = selectedNodeIds.has(node.dataset.node);
  const point = nodeGraphClientPoint(event);
  const additiveDragSelection = additiveSelection;
  const pendingSelectionIds = new Set(selectedNodeIds);
  if (additiveDragSelection) {
    pendingSelectionIds.add(node.dataset.node);
  }
  const draggedNodeIds = wasSelectedAtStart || additiveDragSelection
    ? pendingSelectionIds
    : new Set([node.dataset.node]);
  const draggedNodes = [...draggedNodeIds]
    .map((id) => nodeGraphNodeElement(id))
    .filter(Boolean)
    .map((element) => {
      const x = Number.parseFloat(element.style.getPropertyValue("--node-x")) || 0;
      const y = Number.parseFloat(element.style.getPropertyValue("--node-y")) || 0;
      return {
        element,
        id: element.dataset.node,
        startX: x,
        startY: y,
      };
    });

  nodeGraphMvp.nodeDragging = {
    draggedNodes,
    handle,
    ioBypassClickCandidate: nodeGraphNodeIoBypassClickCandidate(event, handle),
    moved: false,
    node,
    startPoint: point,
    additiveSelection,
    additiveDragSelection,
    pendingSelectionIds: [...pendingSelectionIds],
    wasSelectedAtStart,
  };
  for (const dragged of draggedNodes) {
    dragged.element.classList.add("dragging");
  }
  handle.classList.add("dragging");
  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events used by smoke/browser checks do not own capture.
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphNode(event) {
  if (!nodeGraphMvp.nodeDragging) {
    return;
  }

  const { draggedNodes, startPoint } = nodeGraphMvp.nodeDragging;
  const point = nodeGraphClientPoint(event);
  const deltaX = point.x - startPoint.x;
  const deltaY = point.y - startPoint.y;
  if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
    nodeGraphMvp.nodeDragging.moved = true;
  }
  for (const dragged of draggedNodes) {
    positionNodeGraphNode(dragged.element, {
      x: dragged.startX + deltaX,
      y: dragged.startY + deltaY,
    }, { clamp: false });
  }
  drawNodeGraphWires();
  scheduleNodeGraphModuleScopeDraw();
}

function endNodeGraphNodeDrag(event) {
  if (!nodeGraphMvp.nodeDragging) {
    return;
  }

  const {
    additiveSelection,
    additiveDragSelection,
    draggedNodes,
    handle,
    ioBypassClickCandidate,
    moved,
    node,
    pendingSelectionIds,
  } = nodeGraphMvp.nodeDragging;
  for (const dragged of draggedNodes) {
    dragged.element.classList.remove("dragging");
  }
  handle.classList.remove("dragging");
  if (handle.hasPointerCapture?.(event.pointerId)) {
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      // See setPointerCapture guard above.
    }
  }
  nodeGraphMvp.nodeDragging = null;
  if (!moved) {
    if (ioBypassClickCandidate && toggleNodeGraphModuleBypassFromNode(node, event)) {
      return;
    }
    if (
      handle.classList.contains("node-header-title-row") &&
      nodeGraphModuleTitleBypassModifierActive(event) &&
      nodeGraphModuleButtonsHiddenForNode(node) &&
      toggleNodeGraphModuleBypassFromNode(node, event)
    ) {
      return;
    }
    toggleNodeGraphNodeSelection(node.dataset.node, additiveSelection);
    return;
  }
  if (additiveDragSelection) {
    setNodeGraphNodeSelection(pendingSelectionIds);
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  for (const dragged of draggedNodes) {
    const x = Number.parseFloat(dragged.element.style.getPropertyValue("--node-x")) || 0;
    const y = Number.parseFloat(dragged.element.style.getPropertyValue("--node-y")) || 0;
    const gridPoint = nodeGraphPixelToGrid({ x, y });
    const patchNode = patch.nodes.find((candidate) => candidate.id === dragged.id);
    if (patchNode) {
      patchNode.gx = gridPoint.gx;
      patchNode.gy = gridPoint.gy;
    }
  }
  commitNodeGraphPatch(patch, { status: "layout snapped" });
}
