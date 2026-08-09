// Hitpoint / “snake” selection: drag a thick dotted trail on empty canvas;
// whatever the trail crosses is selected. First hit locks mode to modules XOR wires.
// Samples the mouse path with lerp so fast drags do not skip over modules/wires.
// Wires also use geometric path hits (isPointInStroke / length sampling) because
// cable hit-paths live under modules and elementFromPoint alone misses them.

const nodeGraphHitTrailMinStepPx = 1.25;
const nodeGraphHitTrailMaxPoints = 6000;
/** Layout-px step along a segment when sampling hits (finer = fewer misses). */
const nodeGraphHitTrailSampleStepPx = 2.5;
/**
 * Extra half-width (surface layout px) around the snake for wire/module hits.
 * Matches ~snake visual thickness so grazing a cable still counts.
 */
const nodeGraphHitTrailHitRadiusPx = 10;

function nodeGraphHitTrailSvg() {
  return document.getElementById("nodeSelectionHitTrail");
}

function nodeGraphHitTrailPath() {
  return document.getElementById("nodeSelectionHitTrailPath");
}

function nodeGraphHitTrailZoom() {
  return Math.max(0.0001, typeof nodeGraphZoom === "function" ? Number(nodeGraphZoom()) || 1 : 1);
}

/** Surface (layout) point → viewport client coordinates. */
function nodeGraphSurfacePointToClient(point, surface = typeof nodeGraphZoomSurface === "function" ? nodeGraphZoomSurface() : null) {
  const rect = surface?.getBoundingClientRect?.();
  if (!rect || !point) {
    return { x: 0, y: 0 };
  }
  const zoom = nodeGraphHitTrailZoom();
  return {
    x: rect.left + Number(point.x) * zoom,
    y: rect.top + Number(point.y) * zoom,
  };
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
      svg.setAttribute("hidden", "");
      svg.style.display = "none";
    }
    if (path) {
      path.removeAttribute("d");
    }
    return;
  }

  const surface = typeof nodeGraphZoomSurface === "function" ? nodeGraphZoomSurface() : null;
  const w = Math.max(1, Math.round(surface?.clientWidth || surface?.offsetWidth || 1));
  const h = Math.max(1, Math.round(surface?.clientHeight || surface?.offsetHeight || 1));
  // Match surface layout coords used by nodeGraphClientPoint / module --node-x/y.
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.removeAttribute("hidden");
  svg.style.display = "block";
  svg.style.visibility = "visible";
  svg.style.opacity = "1";
  svg.style.pointerEvents = "none";

  const points = drag.points;
  let d;
  if (points.length === 1) {
    // A lone M does not paint a stroke — fake a tiny segment so the tip is visible.
    const p = points[0];
    d = `M ${p.x} ${p.y} l 0.5 0`;
  } else {
    d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
  }
  path.setAttribute("d", d);
  // Keep ~6 screen-px thick dashes stable under workspace CSS zoom.
  const zoom = nodeGraphHitTrailZoom();
  path.setAttribute("stroke", "var(--accent, #7fc7d9)");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", String(6 / zoom));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-dasharray", `${14 / zoom} ${11 / zoom}`);
  path.style.opacity = "0.95";
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
    // Still update tip so the line tracks the cursor tightly.
    last.x = point.x;
    last.y = point.y;
    return false;
  }
  drag.points.push({ x: point.x, y: point.y });
  if (drag.points.length > nodeGraphHitTrailMaxPoints) {
    drag.points.splice(0, drag.points.length - nodeGraphHitTrailMaxPoints);
  }
  return true;
}

/**
 * Parse a wire hit from an element (hit-path or visible path).
 * @returns {{ kind: "wire", wireKind: string, index: number } | null}
 */
function nodeGraphWireHitFromElement(el) {
  if (!el || !(el instanceof Element) || el.classList?.contains("temp")) {
    return null;
  }
  const wire = el.closest?.(".node-wire-hit-path, .node-wire-path");
  if (!wire || wire.classList.contains("temp")) {
    return null;
  }
  const index = Number(wire.dataset.connectionIndex);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  return {
    kind: "wire",
    wireKind: wire.dataset.connectionKind || "signal",
    index,
  };
}

/**
 * What is under a client point (modules / wires).
 * Uses elementsFromPoint (full stack) so wires under modules still register.
 * Trail has pointer-events:none so it never steals hits.
 * @returns {Array<{ kind: string, id?: string, wireKind?: string, index?: number }>}
 */
function nodeGraphHitTestSelectionStackAtClient(clientX, clientY) {
  const hits = [];
  const seenWire = new Set();
  const seenModule = new Set();
  const stack = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter(Boolean);

  for (const el of stack) {
    if (!(el instanceof Element)) {
      continue;
    }
    const wireHit = nodeGraphWireHitFromElement(el);
    if (wireHit) {
      const key = `${wireHit.wireKind}:${wireHit.index}`;
      if (!seenWire.has(key)) {
        seenWire.add(key);
        hits.push(wireHit);
      }
      continue;
    }
    const node = el.closest?.(".dsp-node");
    if (node?.dataset?.node && !node.classList.contains("removed")) {
      const id = node.dataset.node;
      if (!seenModule.has(id)) {
        seenModule.add(id);
        hits.push({ kind: "module", id });
      }
    }
  }
  return hits;
}

/** Geometric module hit in surface space (modules use pointer-events:none on the plate). */
function nodeGraphModulesContainingSurfacePoint(point, padPx = 0) {
  const hits = [];
  if (!point || typeof nodeGraphNodeBounds !== "function") {
    return hits;
  }
  const pad = Math.max(0, Number(padPx) || 0);
  for (const node of document.querySelectorAll(".dsp-node:not(.removed)")) {
    const id = node.dataset?.node;
    if (!id) {
      continue;
    }
    const b = nodeGraphNodeBounds(node);
    if (
      point.x >= b.left - pad
      && point.x <= b.right + pad
      && point.y >= b.top - pad
      && point.y <= b.bottom + pad
    ) {
      hits.push({ kind: "module", id });
    }
  }
  return hits;
}

/**
 * Distance from point P to segment AB (surface space).
 */
function nodeGraphDistPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = (abx * abx) + (aby * aby);
  if (abLen2 <= 1e-9) {
    return Math.hypot(apx, apy);
  }
  let t = ((apx * abx) + (apy * aby)) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + (abx * t);
  const cy = ay + (aby * t);
  return Math.hypot(px - cx, py - cy);
}

/**
 * True if surface point is within radius of an SVG path's stroke geometry.
 * Prefers isPointInStroke (uses path stroke-width); falls back to length sampling.
 */
function nodeGraphSurfacePointHitsSvgPath(pathEl, surfaceX, surfaceY, extraRadiusPx = 0) {
  if (!pathEl || typeof pathEl.getTotalLength !== "function") {
    return false;
  }
  const svg = pathEl.ownerSVGElement;
  if (!svg) {
    return false;
  }

  // isPointInStroke: coordinates in the path's local user space (viewBox = surface).
  if (typeof pathEl.isPointInStroke === "function" && typeof svg.createSVGPoint === "function") {
    try {
      const pt = svg.createSVGPoint();
      pt.x = surfaceX;
      pt.y = surfaceY;
      if (pathEl.isPointInStroke(pt)) {
        return true;
      }
      // Expand hit with a few probes around the point (snake thickness).
      const r = Math.max(0, extraRadiusPx);
      if (r > 0) {
        const ring = [
          [r, 0], [-r, 0], [0, r], [0, -r],
          [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7],
          [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7],
        ];
        for (const [ox, oy] of ring) {
          pt.x = surfaceX + ox;
          pt.y = surfaceY + oy;
          if (pathEl.isPointInStroke(pt)) {
            return true;
          }
        }
      }
    } catch (_error) {
      // Fall through to length sampling.
    }
  }

  // Fallback: sample along path, distance in surface px.
  const total = pathEl.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) {
    return false;
  }
  const radius = Math.max(8, extraRadiusPx + 6);
  const step = Math.max(2, Math.min(8, radius * 0.45));
  let prev = pathEl.getPointAtLength(0);
  for (let d = 0; d <= total; d += step) {
    const cur = pathEl.getPointAtLength(Math.min(total, d));
    if (nodeGraphDistPointToSegment(surfaceX, surfaceY, prev.x, prev.y, cur.x, cur.y) <= radius) {
      return true;
    }
    prev = cur;
  }
  const end = pathEl.getPointAtLength(total);
  if (nodeGraphDistPointToSegment(surfaceX, surfaceY, prev.x, prev.y, end.x, end.y) <= radius) {
    return true;
  }
  return false;
}

/**
 * Geometric wire hits in surface space — works even when cables paint under modules.
 * @returns {Array<{ kind: "wire", wireKind: string, index: number }>}
 */
function nodeGraphWiresNearSurfacePoint(point, radiusPx = nodeGraphHitTrailHitRadiusPx) {
  const hits = [];
  if (!point) {
    return hits;
  }
  const seen = new Set();
  const paths = document.querySelectorAll(".node-wire-hit-path, .node-wire-path:not(.temp)");
  for (const pathEl of paths) {
    if (!(pathEl instanceof SVGGeometryElement)) {
      continue;
    }
    // Prefer dedicated hit paths; skip visual twin of the same wire when hit-path exists.
    if (pathEl.classList.contains("node-wire-path")) {
      const idx = String(pathEl.dataset.connectionIndex ?? "");
      const kind = String(pathEl.dataset.connectionKind || "signal");
      if (
        idx
        && document.querySelector(
          `.node-wire-hit-path[data-connection-index="${idx}"][data-connection-kind="${kind}"]`,
        )
      ) {
        continue;
      }
    }
    if (!nodeGraphSurfacePointHitsSvgPath(pathEl, point.x, point.y, radiusPx)) {
      continue;
    }
    const wireHit = nodeGraphWireHitFromElement(pathEl);
    if (!wireHit) {
      continue;
    }
    const key = `${wireHit.wireKind}:${wireHit.index}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hits.push(wireHit);
  }
  return hits;
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

/**
 * Sample the segment from → to in surface space with lerp, hit-testing each
 * step. Modules: AABB. Wires: geometric path stroke + full DOM stack under
 * point (wires under modules). Prevents skipping between pointermove events.
 */
function nodeGraphHitTrailSampleSegment(drag, fromSurface, toSurface) {
  if (!drag || !toSurface) {
    return;
  }
  const from = fromSurface || toSurface;
  const dx = toSurface.x - from.x;
  const dy = toSurface.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / nodeGraphHitTrailSampleStepPx));
  // Unit normal for side probes (snake width) — catches cables the centerline grazes.
  let nx = 0;
  let ny = 0;
  if (dist > 1e-6) {
    nx = -dy / dist;
    ny = dx / dist;
  }
  const side = nodeGraphHitTrailHitRadiusPx * 0.55;
  const offsets = dist > 1e-6
    ? [
      { x: 0, y: 0 },
      { x: nx * side, y: ny * side },
      { x: -nx * side, y: -ny * side },
    ]
    : [{ x: 0, y: 0 }];

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const baseX = from.x + dx * t;
    const baseY = from.y + dy * t;
    for (const off of offsets) {
      const surfacePt = { x: baseX + off.x, y: baseY + off.y };
      // Geometric plate hit (reliable even when module plate ignores pointer events).
      for (const hit of nodeGraphModulesContainingSurfacePoint(surfacePt, 2)) {
        nodeGraphHitTrailApplyHit(drag, hit);
      }
      // Geometric wire hit (works under modules; thick stroke radius).
      for (const hit of nodeGraphWiresNearSurfacePoint(surfacePt, nodeGraphHitTrailHitRadiusPx)) {
        nodeGraphHitTrailApplyHit(drag, hit);
      }
      // Full DOM stack: wires + modules that still receive pointer events.
      const client = nodeGraphSurfacePointToClient(surfacePt);
      for (const hit of nodeGraphHitTestSelectionStackAtClient(client.x, client.y)) {
        nodeGraphHitTrailApplyHit(drag, hit);
      }
    }
  }
}

function updateNodeGraphMarqueeSelection(event = null) {
  const drag = nodeGraphMvp.marqueeSelection;
  if (!drag) {
    return;
  }
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    const toSurface = nodeGraphClientPoint(event);
    const fromSurface = drag.lastSampleSurface || drag.current || drag.start || toSurface;
    nodeGraphHitTrailSampleSegment(drag, fromSurface, toSurface);
    drag.lastSampleSurface = { x: toSurface.x, y: toSurface.y };
    drag.lastClient = { x: event.clientX, y: event.clientY };
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
    lastClient: { x: event.clientX, y: event.clientY },
    lastSampleSurface: { x: point.x, y: point.y },
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
  nodeGraphHitTrailSampleSegment(
    nodeGraphMvp.marqueeSelection,
    point,
    point,
  );
  renderNodeGraphMarqueeSelection();
  try {
    workspace.setPointerCapture(event.pointerId);
  } catch (_error) {
    // Capture can throw if the element is not active for that pointer.
  }
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
    Math.abs(point.x - drag.start.x) > 2 ||
    Math.abs(point.y - drag.start.y) > 2;
  nodeGraphHitTrailAppendPoint(drag, point);
  // Always sample + render once moved (or every frame so the snake draws immediately).
  updateNodeGraphMarqueeSelection(event);
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
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // ignore
    }
  }
  event.preventDefault();
  event.stopPropagation();
}
