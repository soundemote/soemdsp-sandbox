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
  if (event?.altKey) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
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

const nodeGraphModuleHeaderButtonSelector = [
  ".node-drag-handle",
  ".node-display-settings-button",
  ".node-metaparameter-button",
  ".node-action-button",
  ".node-bypass-button",
].join(", ");

function nodeGraphModuleHeaderButtonFrom(target) {
  return target?.closest?.(nodeGraphModuleHeaderButtonSelector) || null;
}

function nodeGraphInvokeModuleHeaderButton(button, event) {
  if (!button || button.classList.contains("node-drag-handle")) {
    return false;
  }
  const forwarded = {
    altKey: Boolean(event?.altKey),
    button: event?.button,
    ctrlKey: Boolean(event?.ctrlKey),
    currentTarget: button,
    detail: event?.detail,
    metaKey: Boolean(event?.metaKey),
    preventDefault() {
      event?.preventDefault?.();
    },
    shiftKey: Boolean(event?.shiftKey),
    stopPropagation() {
      event?.stopPropagation?.();
    },
    target: button,
  };
  if (button.classList.contains("node-display-settings-button")) {
    openNodeModuleDisplaySettings(forwarded);
    return true;
  }
  if (button.classList.contains("node-metaparameter-button")) {
    openNodeModuleMetaparameters(forwarded);
    return true;
  }
  if (button.classList.contains("node-action-button")) {
    openNodeModuleActionMenu(forwarded);
    return true;
  }
  if (button.classList.contains("node-bypass-button")) {
    toggleNodeGraphModuleBypass(forwarded);
    return true;
  }
  return false;
}

function nodeGraphGuardModuleHeaderButtonClick(event) {
  const button = event.currentTarget;
  if (button?.dataset?.moduleDragMoved === "1" || button?.dataset?.moduleDragClicked === "1") {
    delete button.dataset.moduleDragMoved;
    delete button.dataset.moduleDragClicked;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}

function beginNodeGraphNodeDrag(event) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  const headerButton = nodeGraphModuleHeaderButtonFrom(event.target)
    || nodeGraphModuleHeaderButtonFrom(event.currentTarget);
  if (
    !headerButton
    && event.target.closest?.(
      // Jacks / controls block drag (wire handlers own jacks). Header chrome
      // buttons are allowed (drag to move; click-up opens if the box did not move).
      ".node-port, .node-param-port, button, input:not(.node-header-title-input), textarea, select, option, [contenteditable='true'], .node-xy-pad-canvas, .node-module-graph-display, .node-knob-face, .node-keypad-face, .node-keypad-grid, .node-keypad-key",
    )
  ) {
    return;
  }
  const handle = headerButton || event.currentTarget.closest(
    ".node-drag-handle, .node-execution-order-badge, .node-header-title-row, .node-led-face, .node-group-input-face, .node-group-output-face, .node-portal-face, .node-solid-module-shell, .node-solid-module-custom-ui, .node-knob-widget-body, .dsp-node-io-section, .node-parameter-row, .node-sample-phase-readout, .node-module-lip, .dsp-node.module-collapsed",
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
    // Locked: leave header buttons clickable; swallow empty-chrome drags.
    if (!headerButton || headerButton.classList.contains("node-drag-handle")) {
      event.preventDefault();
      event.stopPropagation();
    }
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
    headerButton: headerButton && !headerButton.classList.contains("node-drag-handle")
      ? headerButton
      : null,
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
    draggedNodes,
    handle,
    headerButton,
    ioBypassClickCandidate,
    moved,
    node,
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
  if (headerButton) {
    headerButton.dataset.moduleDragMoved = moved ? "1" : "0";
    headerButton.dataset.moduleDragClicked = moved ? "0" : "1";
  }
  if (!moved) {
    // Alt-double-click is still an alt-click. The first pointerup already
    // ran the alt action; the extra click must not undo it or open settings.
    if (event?.altKey && Number(event?.detail) > 1) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    if (ioBypassClickCandidate && toggleNodeGraphModuleBypassFromNode(node, event)) {
      return;
    }
    if (
      handle.classList.contains("node-header-title-row") &&
      nodeGraphModuleTitleBypassModifierActive(event) &&
      toggleNodeGraphModuleBypassFromNode(node, event)
    ) {
      return;
    }
    if (headerButton && nodeGraphInvokeModuleHeaderButton(headerButton, event)) {
      return;
    }
    toggleNodeGraphNodeSelection(node.dataset.node, additiveSelection);
    return;
  }
  // Moved: persist gx/gy only. Selection happens on mouse-up when the
  // pointer never crossed the drag threshold (plain click).
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
