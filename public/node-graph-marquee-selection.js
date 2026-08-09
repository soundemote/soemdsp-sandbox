// Hitpoint / “snake” selection: drag a thick dotted trail on empty canvas;
// whatever the cursor hits is selected. First hit locks mode to modules XOR wires.

const nodeGraphHitTrailMinStepPx = 2;
const nodeGraphHitTrailMaxPoints = 4000;

function nodeGraphHitTrailSvg() {
  return document.getElementById("nodeSelectionHitTrail");
}

function nodeGraphHitTrailPath() {
  return document.getElementById("nodeSelectionHitTrailPath");
}

function renderNodeGraphMarqueeSelection() {
  // Legacy name kept for call sites. Renders the hit trail snake.
  const svg = nodeGraphHitTrailSvg();
  const path = nodeGraphHitTrailPath();
  const marquee = document.getElementById("nodeSelectionMarquee");
  if (marquee) {
    marquee.hidden = true;
  }
  const drag = nodeGraphMvp.marqueeSelection;
  if (!svg || !path || !drag?.points?.length) {
    if (svg) {
      svg.hidden = true;
    }
    if (path) {
      path.removeAttribute("d");
    }
    return;
  }

  const points = drag.points;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  path.setAttribute("d", d);
  // Keep ~5 screen-px thick dashes stable under workspace CSS zoom.
  const zoom = Math.max(0.0001, typeof nodeGraphZoom === "function" ? Number(nodeGraphZoom()) || 1 : 1);
  path.setAttribute("stroke-width", String(5 / zoom));
  path.setAttribute("stroke-dasharray", `${12 / zoom} ${10 / zoom}`);
  svg.hidden = false;
}

function nodeGraphHitTrailAppendPoint(drag, point) {
  if (!drag.points?.length) {
    drag.points = [{ x: point.x, y: point.y }];
    return true;
  }
  const last = drag.points[drag.points.length - 1];
  const dx = point.x - last.x;
  const dy = point.y - last.y;
  if ((dx * dx) + (dy * dy) < nodeGraphHitTrailMinStepPx * nodeGraphHitTrailMinStepPx) {
    return false;
  }
  drag.points.push({ x: point.x, y: point.y });
  if (drag.points.length > nodeGraphHitTrailMaxPoints) {
    drag.points.splice(0, drag.points.length - nodeGraphHitTrailMaxPoints);
  }
  return true;
}

/**
 * What is under the cursor in client space (modules / wires).
 * Trail has pointer-events:none so it never steals hits.
 */
function nodeGraphHitTestSelectionAtClient(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof Element)) {
    return null;
  }
  const wire = el.closest?.(".node-wire-hit-path, .node-wire-path");
  if (wire && !wire.classList.contains("temp")) {
    const index = Number(wire.dataset.connectionIndex);
    if (Number.isInteger(index) && index >= 0) {
      return {
        kind: "wire",
        wireKind: wire.dataset.connectionKind || "signal",
        index,
      };
    }
  }
  const node = el.closest?.(".dsp-node");
  if (node?.dataset?.node && !node.classList.contains("removed")) {
    return { kind: "module", id: node.dataset.node };
  }
  return null;
}

function nodeGraphHitTrailApplyHit(drag, hit) {
  if (!drag || !hit) {
    return;
  }
  // Lock to first hit type: modules XOR wires for this drag.
  if (!drag.lockMode) {
    drag.lockMode = hit.kind === "wire" ? "wires" : "modules";
  }
  if (drag.lockMode === "modules" && hit.kind !== "module") {
    return;
  }
  if (drag.lockMode === "wires" && hit.kind !== "wire") {
    return;
  }

  if (drag.lockMode === "modules") {
    if (!drag.hitNodeIds) {
      drag.hitNodeIds = new Set(drag.startSelectedIds || []);
    }
    if (!nodeGraphMvp.activeNodes.has(hit.id)) {
      return;
    }
    if (drag.hitNodeIds.has(hit.id)) {
      return;
    }
    drag.hitNodeIds.add(hit.id);
    setNodeGraphNodeSelection([...drag.hitNodeIds]);
    return;
  }

  // wires
  if (!drag.hitWires) {
    drag.hitWires = [...(drag.startSelectedWires || [])];
  }
  const key = `${hit.wireKind}:${hit.index}`;
  if (drag.hitWireKeys?.has(key)) {
    return;
  }
  if (!drag.hitWireKeys) {
    drag.hitWireKeys = new Set(drag.hitWires.map((w) => `${w.kind}:${w.index}`));
  }
  drag.hitWireKeys.add(key);
  drag.hitWires.push({ kind: hit.wireKind, index: hit.index });
  if (typeof setNodeGraphWireSelection === "function") {
    setNodeGraphWireSelection(drag.hitWires);
  } else {
    setNodeGraphSelection({ type: "wire", kind: hit.wireKind, index: hit.index });
  }
}

function updateNodeGraphMarqueeSelection(event = null) {
  const drag = nodeGraphMvp.marqueeSelection;
  if (!drag) {
    return;
  }
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    const hit = nodeGraphHitTestSelectionAtClient(event.clientX, event.clientY);
    nodeGraphHitTrailApplyHit(drag, hit);
  }
  renderNodeGraphMarqueeSelection();
}

function nodeGraphMarqueeTargetIsBlocked(target) {
  return Boolean(target?.closest?.(
    ".dsp-node, .node-port, .node-param-port, .node-slider-readout, .node-wire-hit-path, .node-wire-path, button, input, textarea, select",
  ));
}

function startNodeGraphMarqueeSelection(event, workspace) {
  // event.preventDefault() suppresses browser blur; blur title edit explicitly.
  if (document.activeElement?.classList?.contains("node-header-title")) {
    document.activeElement.blur();
  }
  const point = nodeGraphClientPoint(event);
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  const startSelectedWires = typeof nodeGraphSelectedWireEntries === "function"
    ? nodeGraphSelectedWireEntries()
    : [];
  nodeGraphMvp.marqueeSelection = {
    additive,
    current: point,
    hitNodeIds: additive ? new Set(nodeGraphSelectedNodeIds()) : new Set(),
    hitWires: additive ? [...startSelectedWires] : [],
    hitWireKeys: additive
      ? new Set(startSelectedWires.map((w) => `${w.kind}:${w.index}`))
      : new Set(),
    lockMode: null,
    moved: false,
    pointerId: event.pointerId,
    points: [{ x: point.x, y: point.y }],
    start: point,
    startSelectedIds: [...nodeGraphSelectedNodeIds()],
    startSelectedWires,
  };
  if (!additive) {
    setNodeGraphSelection(null);
  }
  // Sample under cursor immediately (usually empty at start).
  const hit = nodeGraphHitTestSelectionAtClient(event.clientX, event.clientY);
  nodeGraphHitTrailApplyHit(nodeGraphMvp.marqueeSelection, hit);
  renderNodeGraphMarqueeSelection();
  workspace.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphMarqueeSelection(event) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    nodeGraphMarqueeTargetIsBlocked(event.target)
  ) {
    return;
  }

  startNodeGraphMarqueeSelection(event, event.currentTarget);
}

function nodeGraphOutsideMarqueeStartIsBlocked(target) {
  return Boolean(target?.closest?.(
    "#nodeGraphWorkspace, #nodeSceneContextMenu, #nodeParameterMetadataPopover, #nodeUiDevHelper, #nodeUserUiSettingsPanel, button, input, textarea, select",
  ));
}

function trackNodeGraphOutsideMarqueePointer(event) {
  if (event.button !== 0 || nodeGraphOutsideMarqueeStartIsBlocked(event.target)) {
    nodeGraphMvp.marqueeSelectionEntryPointer = null;
    return;
  }
  nodeGraphMvp.marqueeSelectionEntryPointer = {
    additive: event.shiftKey || event.ctrlKey || event.metaKey,
    pointerId: event.pointerId,
  };
}

function clearNodeGraphOutsideMarqueePointer(event) {
  if (
    !nodeGraphMvp.marqueeSelectionEntryPointer ||
    nodeGraphMvp.marqueeSelectionEntryPointer.pointerId === event.pointerId
  ) {
    nodeGraphMvp.marqueeSelectionEntryPointer = null;
  }
}

function beginNodeGraphMarqueeSelectionOnEntry(event) {
  const entry = nodeGraphMvp.marqueeSelectionEntryPointer;
  if (
    !entry ||
    entry.pointerId !== event.pointerId ||
    !(event.buttons & 1) ||
    event.ctrlKey ||
    nodeGraphMvp.marqueeSelection ||
    nodeGraphMvp.dragging ||
    nodeGraphMvp.nodeDragging ||
    nodeGraphMvp.workspacePanning ||
    nodeGraphMvp.smoothZoomDragging ||
    nodeGraphMvp.workspaceResizing
  ) {
    return;
  }
  startNodeGraphMarqueeSelection(event, event.currentTarget);
  nodeGraphMvp.marqueeSelectionEntryPointer = null;
}

function dragNodeGraphMarqueeSelection(event) {
  const drag = nodeGraphMvp.marqueeSelection;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const point = nodeGraphClientPoint(event);
  drag.current = point;
  drag.moved ||=
    Math.abs(point.x - drag.start.x) > 3 ||
    Math.abs(point.y - drag.start.y) > 3;
  nodeGraphHitTrailAppendPoint(drag, point);
  if (drag.moved) {
    updateNodeGraphMarqueeSelection(event);
  } else {
    renderNodeGraphMarqueeSelection();
  }
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphMarqueeSelection(event) {
  const drag = nodeGraphMvp.marqueeSelection;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (drag.moved) {
    updateNodeGraphMarqueeSelection(event);
  } else if (!drag.additive) {
    setNodeGraphSelection(null);
  }
  nodeGraphMvp.marqueeSelection = null;
  renderNodeGraphMarqueeSelection();
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
  event.stopPropagation();
}
