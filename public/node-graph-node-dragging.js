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
  return Boolean(normalizeNodeGraphPatchNodeUi(patchNode?.ui, patchNode?.type).movementLocked);
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
  const ui = normalizeNodeGraphPatchNodeUi(patchNode.ui, patchNode.type);
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
      // Jacks / controls block drag (wire handlers own jacks). .node-io-row is
      // intentionally NOT listed: solid-module rows are a 1gu band around each
      // jack; geometric miss (see endpointHitboxClientRect) falls through to
      // shell/face drag without stopping here.
      // Graph face owns its own pointer gestures (points / phase) — never start
      // a module move from inside .node-module-graph-display.
      // Knob face is a Bias drag surface (same as .node-slider-readout).
      ".node-port, .node-param-port, button:not(.node-drag-handle), input:not(.node-header-title-input), textarea, select, option, [contenteditable='true'], .node-xy-pad-canvas, .node-module-graph-display, .node-knob-face",
    )
  ) {
    return;
  }
  const handle = event.currentTarget.closest(
    ".node-drag-handle, .node-execution-order-badge, .node-header-title-row, .node-led-face, .node-group-input-face, .node-group-output-face, .node-solid-module-shell, .node-solid-module-custom-ui, .node-knob-widget-body, .dsp-node-io-section, .node-parameter-row, .node-sample-phase-readout, .dsp-node.module-collapsed",
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

  // Ctrl/Cmd multi-select only. Shift is reserved for keyboard resize/nudge
  // (Shift+arrows) — treating Shift+click as additive made sole selection
  // toggle off when the user held Shift and re-clicked before resizing.
  const additiveSelection = event.ctrlKey || event.metaKey;
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

// A node visually snaps to the grid while dragging (positionNodeGraphNode
// snaps by default), so the pointer has to cross half a grid cell before
// the module actually moves on screen. Treating any smaller wiggle as "a
// drag started" made ordinary selection clicks get swallowed constantly --
// this threshold instead matches the exact point where a move first
// becomes visible, so a click only ever gets reclassified as a drag once
// one is genuinely underway.
function nodeGraphNodeDragMoveThresholdPx() {
  return {
    x: Math.max(1, nodeGraphGridWidth() / 2),
    y: Math.max(1, nodeGraphGridHeight() / 2),
  };
}

function dragNodeGraphNode(event) {
  if (!nodeGraphMvp.nodeDragging) {
    return;
  }

  const { draggedNodes, startPoint } = nodeGraphMvp.nodeDragging;
  const point = nodeGraphClientPoint(event);
  const deltaX = point.x - startPoint.x;
  const deltaY = point.y - startPoint.y;
  const threshold = nodeGraphNodeDragMoveThresholdPx();
  if (Math.abs(deltaX) >= threshold.x || Math.abs(deltaY) >= threshold.y) {
    nodeGraphMvp.nodeDragging.moved = true;
  }
  for (const dragged of draggedNodes) {
    positionNodeGraphNode(dragged.element, {
      x: dragged.startX + deltaX,
      y: dragged.startY + deltaY,
    }, { clamp: false });
  }
  drawNodeGraphWires();
  // Frozen faces live on the module DOM and move with it. Scheduling a
  // paused draw used to paint cold plates over LCD / trace residual.
  const frozen = typeof scopePaintIsFrozen === "function"
    ? scopePaintIsFrozen()
    : (typeof nodeGraphModuleScopePhosphorFrozen === "function"
      && nodeGraphModuleScopePhosphorFrozen());
  if (!frozen && typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
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
  // Micro-drag / move must leave modules selected so Shift+arrows work without
  // a second click. Previously only additive drags updated selection — a
  // slightly imperfect click moved the LED and left it unselected.
  if (additiveDragSelection) {
    setNodeGraphNodeSelection(pendingSelectionIds);
  } else {
    setNodeGraphNodeSelection(draggedNodes.map((dragged) => dragged.id));
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
  // layoutEdit: persist gx/gy + history without rebuilding every module/slider/face
  // (full applyNodeGraphPatchToDom was causing knob/face jitter on every move).
  commitNodeGraphPatch(patch, { status: "layout snapped", layoutEdit: true });
}
