// Hitpoint / “snake” selection: drag a thick dotted trail on empty canvas;
// whatever the trail crosses is selected. First hit locks mode to modules XOR wires.
// Locked patch: trail + wire hits still run; modules are never selected.
// Samples the mouse path with lerp so fast drags do not skip over modules/wires.
// Wires also use geometric path hits (isPointInStroke / length sampling) because
// cable hit-paths live under modules and elementFromPoint alone misses them.

// Near-duplicate skip only. A 2px collapse + in-place tip rewrite was eating
// the first samples (dot, then delay) and turning the trail into a polyline.
const nodeGraphHitTrailMinStepPx = 0.12;
const nodeGraphHitTrailMaxPoints = 4000;
/**
 * Layout-px step along a segment when sampling hits.
 * Larger steps + polyline wire cache (not isPointInStroke per path) keep
 * snake select responsive on dense patches (crossovers, many ports).
 */
const nodeGraphHitTrailSampleStepPx = 14;
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

/**
 * Catmull–Rom → cubic Bézier for snake *display* only (hits stay on raw points).
 * Cheap C1 corners so the trail doesn't look like a polyline of hard elbows.
 * Tension 0.5 = standard centripetal-ish midpoint handles (1/6 chord rule).
 */
function nodeGraphHitTrailSmoothPathD(points) {
  if (!points || !points.length) {
    return "";
  }
  const pts = points.map((p) => ({
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
  }));
  if (pts.length === 1) {
    // A lone M does not paint a stroke — fake a tiny segment so the tip is visible.
    return `M ${pts[0].x} ${pts[0].y} l 0.5 0`;
  }
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  // Cubic Hermite/Catmull–Rom with endpoint doubling (open curve).
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    // Control points: p1 + (p2−p0)/6 , p2 − (p3−p1)/6
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function nodeGraphHitTrailKeptStrokes() {
  if (!Array.isArray(nodeGraphMvp.hitTrailKeptStrokes)) {
    nodeGraphMvp.hitTrailKeptStrokes = [];
  }
  return nodeGraphMvp.hitTrailKeptStrokes;
}

function nodeGraphHitTrailLivePen(zoom = nodeGraphHitTrailZoom()) {
  const z = Math.max(0.0001, Number(zoom) || 1);
  return {
    width: 6 / z,
    dash: `${14 / z} ${11 / z}`,
  };
}

function clearNodeGraphHitTrailKept() {
  nodeGraphMvp.hitTrailKeptStrokes = [];
}

function nodeGraphHitTrailPushKept(points, pen = null) {
  if (!points?.length) {
    return;
  }
  const style = pen || nodeGraphHitTrailLivePen();
  const strokes = nodeGraphHitTrailKeptStrokes();
  strokes.push({
    dash: style.dash,
    points: points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })),
    width: style.width,
  });
  while (strokes.length > 48) {
    strokes.shift();
  }
}

function nodeGraphHitTrailMirrorPoint(point, center) {
  // Vertical axis through the Shift+click: left↔right only (heart, not 180° spin).
  return {
    x: (2 * center.x) - point.x,
    y: point.y,
  };
}

function nodeGraphHitTrailMirrorStroke(points, center) {
  if (!points?.length || !center) {
    return [];
  }
  return points.map((p) => nodeGraphHitTrailMirrorPoint(p, center));
}

function nodeGraphHitTrailAllStrokes() {
  const strokes = nodeGraphHitTrailKeptStrokes().slice();
  const drag = nodeGraphMvp.marqueeSelection;
  const live = drag?.points;
  if (live?.length) {
    const pen = nodeGraphHitTrailLivePen();
    const liveStroke = { dash: pen.dash, live: true, points: live, width: pen.width };
    strokes.push(liveStroke);
    if (drag.mirrorDraw && nodeGraphMvp.hitTrailMirrorCenter) {
      strokes.push({
        dash: pen.dash,
        live: true,
        points: nodeGraphHitTrailMirrorStroke(live, nodeGraphMvp.hitTrailMirrorCenter),
        width: pen.width,
      });
    }
  }
  return strokes;
}

function nodeGraphHitTrailSyncPaths(svg, count) {
  const ns = "http://www.w3.org/2000/svg";
  const paths = [...svg.querySelectorAll("path")];
  while (paths.length < count) {
    const next = document.createElementNS(ns, "path");
    next.setAttribute("class", "node-selection-hit-trail-path");
    svg.append(next);
    paths.push(next);
  }
  while (paths.length > Math.max(1, count)) {
    paths.pop().remove();
  }
  return paths;
}

function renderNodeGraphMarqueeSelection() {
  // Legacy name kept for call sites. Renders the hit trail snake.
  const svg = nodeGraphHitTrailSvg();
  const marquee = document.getElementById("nodeSelectionMarquee");
  if (marquee) {
    marquee.hidden = true;
  }
  const strokes = nodeGraphHitTrailAllStrokes();
  if (!svg) {
    return;
  }
  if (!strokes.length) {
    svg.setAttribute("hidden", "");
    svg.style.display = "none";
    nodeGraphHitTrailSyncPaths(svg, 1)[0]?.removeAttribute("d");
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

  const paths = nodeGraphHitTrailSyncPaths(svg, strokes.length);
  for (let i = 0; i < strokes.length; i += 1) {
    const stroke = strokes[i];
    const el = paths[i];
    const d = nodeGraphHitTrailSmoothPathD(stroke.points);
    el.setAttribute("d", d);
    el.setAttribute("fill", "none");
    el.style.strokeWidth = String(stroke.width);
    el.style.strokeDasharray = stroke.dash;
    el.style.opacity = "0.95";
  }
}

function clampNodeGraphSnakeMouseSmooth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphSnakeMouseSmoothAmount() {
  return clampNodeGraphSnakeMouseSmooth(nodeGraphMvp?.snakeMouseSmooth);
}

function syncNodeGraphSnakeMouseSmoothControl() {
  const input = document.getElementById("nodeSnakeMouseSmoothSlider");
  if (!input) {
    return;
  }
  const amount = nodeGraphSnakeMouseSmoothAmount();
  if (document.activeElement !== input) {
    input.value = String(amount);
  }
  input.setAttribute("aria-valuetext", `${Math.round(amount * 100)}%`);
}

function persistNodeGraphSnakeMouseSmoothSetting() {
  if (typeof serializeNodeUiDevSettings !== "function") {
    return;
  }
  if (typeof saveNodeUiDevLocalDefaultSettings === "function") {
    saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
  }
}

function setNodeGraphSnakeMouseSmooth(value, options = {}) {
  nodeGraphMvp.snakeMouseSmooth = clampNodeGraphSnakeMouseSmooth(value);
  if (options.sync !== false) {
    syncNodeGraphSnakeMouseSmoothControl();
  }
  if (options.persist) {
    persistNodeGraphSnakeMouseSmoothSetting();
  }
  return nodeGraphMvp.snakeMouseSmooth;
}

function bindNodeGraphSnakeMouseSmoothControl() {
  const input = document.getElementById("nodeSnakeMouseSmoothSlider");
  if (!input || input.dataset.snakeMouseSmoothBound === "true") {
    return;
  }
  input.dataset.snakeMouseSmoothBound = "true";
  input.min = "0";
  input.max = "1";
  input.step = "0.01";
  input.addEventListener("input", (event) => {
    setNodeGraphSnakeMouseSmooth(event.currentTarget.value, { persist: false, sync: false });
    event.currentTarget.setAttribute(
      "aria-valuetext",
      `${Math.round(nodeGraphSnakeMouseSmoothAmount() * 100)}%`,
    );
  });
  input.addEventListener("change", (event) => {
    setNodeGraphSnakeMouseSmooth(event.currentTarget.value, { persist: true, sync: false });
  });
  syncNodeGraphSnakeMouseSmoothControl();
}

function nodeGraphHitTrailEnsureMouseSmooth(drag, point, amount) {
  if (!drag || typeof createNodeGraphMouseSmoothState !== "function") {
    return null;
  }
  if (!drag.mouseSmooth) {
    drag.mouseSmooth = createNodeGraphMouseSmoothState(point.x, point.y);
    if (typeof nodeGraphMouseSmoothBegin === "function") {
      nodeGraphMouseSmoothBegin(drag.mouseSmooth, amount, point.x, point.y);
    }
  }
  return drag.mouseSmooth;
}

function nodeGraphHitTrailSmoothPointer(drag, point) {
  const amount = nodeGraphSnakeMouseSmoothAmount();
  let sx = Number(point.x) || 0;
  let sy = Number(point.y) || 0;
  const filter = nodeGraphHitTrailEnsureMouseSmooth(drag, point, amount);
  if (filter && typeof nodeGraphMouseSmoothPoint === "function") {
    const smoothed = nodeGraphMouseSmoothPoint(filter, sx, sy, amount);
    sx = smoothed.x;
    sy = smoothed.y;
  }
  // Amount 0: Papoulis is passthrough. Keep the former light 1-frame EMA so
  // the lowest slider notch is the original (working) snake feel.
  if (amount <= 1e-4 && drag.points?.length) {
    const last = drag.points[drag.points.length - 1];
    const ema = 0.65;
    sx = last.x + (sx - last.x) * ema;
    sy = last.y + (sy - last.y) * ema;
  }
  return { x: sx, y: sy };
}

function nodeGraphHitTrailAppendPoint(drag, point) {
  const smoothed = nodeGraphHitTrailSmoothPointer(drag, point);
  if (!drag.points?.length) {
    drag.points = [smoothed];
    return true;
  }
  const last = drag.points[drag.points.length - 1];
  const dx = smoothed.x - last.x;
  const dy = smoothed.y - last.y;
  if ((dx * dx) + (dy * dy) < nodeGraphHitTrailMinStepPx * nodeGraphHitTrailMinStepPx) {
    return false;
  }
  drag.points.push(smoothed);
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

/**
 * Build once per snake drag: surface AABBs without re-reading offsetWidth every
 * sample (that forced layout thrash × module count).
 */
function nodeGraphHitTrailEnsureModuleBoundsCache(drag) {
  if (drag?.moduleBoundsCache) {
    return drag.moduleBoundsCache;
  }
  const cache = [];
  for (const node of document.querySelectorAll(".dsp-node:not(.removed)")) {
    const id = node.dataset?.node;
    if (!id) {
      continue;
    }
    const x = Number.parseFloat(node.style.getPropertyValue("--node-x")) || 0;
    const y = Number.parseFloat(node.style.getPropertyValue("--node-y")) || 0;
    // One layout read per module per drag, not per sample.
    const w = Math.max(1, node.offsetWidth || 0);
    const h = Math.max(1, node.offsetHeight || 0);
    cache.push({
      bottom: y + h,
      id,
      left: x,
      right: x + w,
      top: y,
    });
  }
  if (drag) {
    drag.moduleBoundsCache = cache;
  }
  return cache;
}

/** Geometric module hit in surface space (modules use pointer-events:none on the plate). */
function nodeGraphModulesContainingSurfacePoint(point, padPx = 0, boundsCache = null) {
  const hits = [];
  if (!point) {
    return hits;
  }
  const pad = Math.max(0, Number(padPx) || 0);
  const list = boundsCache
    || (typeof nodeGraphHitTrailEnsureModuleBoundsCache === "function"
      ? nodeGraphHitTrailEnsureModuleBoundsCache(nodeGraphMvp?.marqueeSelection)
      : null);
  if (Array.isArray(list) && list.length) {
    for (const b of list) {
      if (
        point.x >= b.left - pad
        && point.x <= b.right + pad
        && point.y >= b.top - pad
        && point.y <= b.bottom + pad
      ) {
        hits.push({ kind: "module", id: b.id });
      }
    }
    return hits;
  }
  // Fallback (no active drag cache).
  if (typeof nodeGraphNodeBounds !== "function") {
    return hits;
  }
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
      // Expand hit with a small axis-aligned ring (snake thickness). 4 probes
      // is enough; 8× paths × samples was a main-thread killer on busy patches.
      const r = Math.max(0, extraRadiusPx);
      if (r > 0) {
        const ring = [[r, 0], [-r, 0], [0, r], [0, -r]];
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
 * Pre-sample wire geometry once per drag into polylines + bboxes.
 * Runtime hits use pure JS segment distance — never isPointInStroke per move
 * (that was the snake main-thread freeze on multiport modules).
 */
function nodeGraphHitTrailEnsureWireGeomCache(drag) {
  if (drag?.wireGeomCache) {
    return drag.wireGeomCache;
  }
  const hitKeys = new Set();
  const pathEls = [];
  for (const pathEl of document.querySelectorAll(".node-wire-hit-path")) {
    if (!(pathEl instanceof SVGGeometryElement) || pathEl.classList.contains("temp")) {
      continue;
    }
    const idx = String(pathEl.dataset.connectionIndex ?? "");
    const kind = String(pathEl.dataset.connectionKind || "signal");
    if (idx) {
      hitKeys.add(`${kind}:${idx}`);
    }
    pathEls.push(pathEl);
  }
  for (const pathEl of document.querySelectorAll(".node-wire-path:not(.temp)")) {
    if (!(pathEl instanceof SVGGeometryElement)) {
      continue;
    }
    const idx = String(pathEl.dataset.connectionIndex ?? "");
    const kind = String(pathEl.dataset.connectionKind || "signal");
    if (idx && hitKeys.has(`${kind}:${idx}`)) {
      continue;
    }
    pathEls.push(pathEl);
  }

  const geoms = [];
  for (const pathEl of pathEls) {
    const wireHit = nodeGraphWireHitFromElement(pathEl);
    if (!wireHit) {
      continue;
    }
    let total = 0;
    try {
      total = Number(pathEl.getTotalLength()) || 0;
    } catch (_error) {
      total = 0;
    }
    if (!(total > 0)) {
      continue;
    }
    // ~24 samples per cable is enough for thick-stroke snake hits.
    const count = Math.max(4, Math.min(28, Math.ceil(total / 18)));
    const pts = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= count; i += 1) {
      const p = pathEl.getPointAtLength((total * i) / count);
      const x = Number(p.x) || 0;
      const y = Number(p.y) || 0;
      pts.push(x, y);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    geoms.push({
      maxX,
      maxY,
      minX,
      minY,
      pts,
      wireHit,
    });
  }
  if (drag) {
    drag.wireGeomCache = geoms;
    drag.wirePathCache = pathEls;
  }
  return geoms;
}

/** @deprecated name kept; returns polyline geom cache. */
function nodeGraphHitTrailEnsureWirePathCache(drag) {
  return nodeGraphHitTrailEnsureWireGeomCache(drag);
}

/**
 * Geometric wire hits in surface space via precomputed polylines.
 * @returns {Array<{ kind: "wire", wireKind: string, index: number }>}
 */
function nodeGraphWiresNearSurfacePoint(point, radiusPx = nodeGraphHitTrailHitRadiusPx, geomCache = null) {
  const hits = [];
  if (!point) {
    return hits;
  }
  const geoms = Array.isArray(geomCache)
    ? geomCache
    : nodeGraphHitTrailEnsureWireGeomCache(nodeGraphMvp?.marqueeSelection);
  if (!Array.isArray(geoms) || !geoms.length) {
    return hits;
  }
  const r = Math.max(0, Number(radiusPx) || 0);
  const r2 = r * r;
  const px = point.x;
  const py = point.y;
  const seen = new Set();
  for (const g of geoms) {
    if (!g?.pts?.length || !g.wireHit) {
      continue;
    }
    // Cheap AABB reject (expanded by radius).
    if (
      px < g.minX - r
      || px > g.maxX + r
      || py < g.minY - r
      || py > g.maxY + r
    ) {
      continue;
    }
    const pts = g.pts;
    let hit = false;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const d = nodeGraphDistPointToSegment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
      if (d * d <= r2) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      continue;
    }
    const key = `${g.wireHit.wireKind}:${g.wireHit.index}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hits.push(g.wireHit);
  }
  return hits;
}

function nodeGraphHitTrailApplyHit(drag, hit) {
  if (!drag || !hit) {
    return;
  }
  // Locked patch: trail and wire hits stay live; modules are not selectable.
  if (drag.skipModuleHits && hit.kind === "module") {
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
    // Defer DOM selection paint until end of sample segment (many hits / move).
    drag.selectionDirty = true;
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
  drag.selectionDirty = true;
}

function nodeGraphHitTrailFlushSelection(drag) {
  if (!drag?.selectionDirty) {
    return;
  }
  drag.selectionDirty = false;
  if (drag.lockMode === "modules") {
    if (!drag.skipModuleHits) {
      setNodeGraphNodeSelection([...(drag.hitNodeIds || [])]);
    }
    return;
  }
  if (drag.lockMode === "wires") {
    if (typeof setNodeGraphWireSelection === "function") {
      setNodeGraphWireSelection(drag.hitWires || []);
    } else if (drag.hitWires?.length) {
      const last = drag.hitWires[drag.hitWires.length - 1];
      setNodeGraphSelection({ type: "wire", kind: last.kind, index: last.index });
    }
  }
}

/**
 * Sample the segment from → to in surface space with lerp, hit-testing each
 * step. Modules: cached AABB. Wires: precomputed polylines (no SVG stroke API).
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
  const moduleBounds = drag.skipModuleHits
    ? null
    : nodeGraphHitTrailEnsureModuleBoundsCache(drag);
  // Only build wire geom when we might need it (unlocked or wire-locked).
  const mayHitWires = !drag.lockMode || drag.lockMode === "wires";
  const wireGeoms = mayHitWires ? nodeGraphHitTrailEnsureWireGeomCache(drag) : null;
  // Side probes only once locked to wires (or still unlocked on a short drag).
  const needWireSides = drag.lockMode === "wires";
  let nx = 0;
  let ny = 0;
  if (needWireSides && dist > 1e-6) {
    nx = -dy / dist;
    ny = dx / dist;
  }
  const side = nodeGraphHitTrailHitRadiusPx * 0.55;
  const wireOffsets = needWireSides && dist > 1e-6
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
    const center = { x: baseX, y: baseY };

    if (!drag.skipModuleHits && (!drag.lockMode || drag.lockMode === "modules")) {
      for (const hit of nodeGraphModulesContainingSurfacePoint(center, 2, moduleBounds)) {
        nodeGraphHitTrailApplyHit(drag, hit);
      }
      // Locked to modules: skip wire tests for the rest of this segment.
      if (drag.lockMode === "modules") {
        continue;
      }
    }

    if (!drag.lockMode || drag.lockMode === "wires") {
      for (const off of wireOffsets) {
        const surfacePt = { x: baseX + off.x, y: baseY + off.y };
        for (const hit of nodeGraphWiresNearSurfacePoint(
          surfacePt,
          nodeGraphHitTrailHitRadiusPx,
          wireGeoms,
        )) {
          nodeGraphHitTrailApplyHit(drag, hit);
        }
      }
    }
  }
  nodeGraphHitTrailFlushSelection(drag);
}

function updateNodeGraphMarqueeSelection(event = null) {
  const drag = nodeGraphMvp.marqueeSelection;
  if (!drag) {
    return;
  }
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    const raw = nodeGraphClientPoint(event);
    const fromSurface = drag.lastSampleSurface || drag.points?.[drag.points.length - 1] || drag.current || drag.start || raw;
    nodeGraphHitTrailAppendPoint(drag, raw);
    const tip = drag.points?.[drag.points.length - 1] || raw;
    if (!drag.cosmetic) {
      nodeGraphHitTrailSampleSegment(drag, fromSurface, tip);
    }
    drag.current = raw;
    drag.lastSampleSurface = { x: tip.x, y: tip.y };
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
  const keepCtrl = Boolean(event.ctrlKey);
  const mirrorDraw = Boolean(event.shiftKey);
  const cosmetic = keepCtrl || mirrorDraw;
  if (mirrorDraw) {
    // Shift+click plants the mirror origin. Drag never moves it.
    nodeGraphMvp.hitTrailMirrorCenter = { x: point.x, y: point.y };
  }
  const startSelectedWires = typeof nodeGraphSelectedWireEntries === "function"
    ? nodeGraphSelectedWireEntries()
    : [];
  const skipModuleHits = typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked();
  const smoothAmount = nodeGraphSnakeMouseSmoothAmount();
  const mouseSmooth = typeof createNodeGraphMouseSmoothState === "function"
    ? createNodeGraphMouseSmoothState(point.x, point.y)
    : null;
  if (mouseSmooth && typeof nodeGraphMouseSmoothBegin === "function") {
    nodeGraphMouseSmoothBegin(mouseSmooth, smoothAmount, point.x, point.y);
  }
  nodeGraphMvp.marqueeSelection = {
    additive: false,
    cosmetic,
    keepTrail: keepCtrl,
    mirrorDraw,
    current: point,
    hitNodeIds: new Set(),
    hitWires: [],
    hitWireKeys: new Set(),
    lastClient: { x: event.clientX, y: event.clientY },
    lastSampleSurface: { x: point.x, y: point.y },
    lockMode: null,
    moduleBoundsCache: null,
    mouseSmooth,
    moved: false,
    pointerId: event.pointerId,
    points: [{ x: point.x, y: point.y }],
    selectionDirty: false,
    skipModuleHits,
    start: point,
    startSelectedIds: [...nodeGraphSelectedNodeIds()],
    startSelectedWires,
    wireGeomCache: null,
    wirePathCache: null,
  };
  // Pre-warm module AABBs once on pointerdown. Wire polylines are built lazily
  // on first wire hunt (modules-only snakes never pay that cost). Locked patch
  // still draws and can hit wires; it never selects modules.
  if (!cosmetic) {
    if (!skipModuleHits) {
      nodeGraphHitTrailEnsureModuleBoundsCache(nodeGraphMvp.marqueeSelection);
      setNodeGraphSelection(null);
    }
    nodeGraphHitTrailSampleSegment(
      nodeGraphMvp.marqueeSelection,
      point,
      point,
    );
  }
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
  const wasMoved = drag.moved;
  drag.moved ||=
    Math.abs(point.x - drag.start.x) > 2 ||
    Math.abs(point.y - drag.start.y) > 2;
  if (drag.moved && !wasMoved && !drag.keepTrail && !drag.cosmetic) {
    clearNodeGraphHitTrailKept();
  }
  if (event.ctrlKey) {
    drag.keepTrail = true;
    drag.cosmetic = true;
  }
  updateNodeGraphMarqueeSelection(event);
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphMarqueeSelection(event) {
  const drag = nodeGraphMvp.marqueeSelection;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (event.ctrlKey) {
    drag.keepTrail = true;
  }
  if (drag.moved) {
    updateNodeGraphMarqueeSelection(event);
    if (!drag.cosmetic) {
      nodeGraphHitTrailFlushSelection(drag);
    }
  } else if (!drag.cosmetic && !drag.skipModuleHits) {
    setNodeGraphSelection(null);
  }
  if (drag.keepTrail && drag.moved && drag.points?.length) {
    const pen = nodeGraphHitTrailLivePen();
    nodeGraphHitTrailPushKept(drag.points, pen);
    if (drag.mirrorDraw && nodeGraphMvp.hitTrailMirrorCenter) {
      nodeGraphHitTrailPushKept(
        nodeGraphHitTrailMirrorStroke(drag.points, nodeGraphMvp.hitTrailMirrorCenter),
        pen,
      );
    }
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
