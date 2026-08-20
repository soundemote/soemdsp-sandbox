// Trace wires render with `shape-rendering: crispEdges` (styles.css), so
// their coordinates are snapped to a half-integer (N + 0.5) to center a
// 1px stroke on a physical pixel -- the standard crisp-line trick. But
// this coordinate is in PRE-ZOOM local units (the zoom factor has already
// been divided out via nodeGraphClientToZoomSurfacePoint), and the SVG
// then sits inside a container with camera `scale()`, which scales the
// already-rounded value up afterward. Snap in screen space so zoom does
// not blow a local-unit round into a multi-pixel jump.
// Fix: snap in SCREEN space (after zoom), then divide back down to local
// units -- the crisp-pixel alignment this was already trying to do, just
// computed at the resolution it's actually meant for.
function nodeGraphTracePoint(value) {
  const number = Number(value) || 0;
  const zoom = typeof nodeGraphZoom === "function" ? nodeGraphZoom() : 1;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const screen = number * safeZoom;
  return (Math.round(screen - 0.5) + 0.5) / safeZoom;
}

function normalizeNodeGraphTracePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .map((point) => ({
      x: nodeGraphTracePoint(point?.x),
      y: nodeGraphTracePoint(point?.y),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function nodeGraphTraceWaypointAttribute(points) {
  return JSON.stringify(normalizeNodeGraphTracePoints(points));
}

function nodeGraphTracePushPoint(points, point) {
  const previous = points[points.length - 1];
  if (!previous || Math.abs(previous.x - point.x) > 0.001 || Math.abs(previous.y - point.y) > 0.001) {
    points.push(point);
  }
}

function nodeGraphTraceOrthogonalPoints(from, points, to) {
  const anchors = normalizeNodeGraphTracePoints([from, ...normalizeNodeGraphTracePoints(points), to]);
  if (anchors.length < 2) {
    return anchors;
  }
  const routed = [];
  nodeGraphTracePushPoint(routed, anchors[0]);
  for (const anchor of anchors.slice(1)) {
    const previous = routed[routed.length - 1];
    if (Math.abs(previous.x - anchor.x) > 0.001 && Math.abs(previous.y - anchor.y) > 0.001) {
      nodeGraphTracePushPoint(routed, { x: anchor.x, y: previous.y });
    }
    nodeGraphTracePushPoint(routed, anchor);
  }
  return routed;
}

function nodeGraphTracePathFromPoints(from, points, to) {
  const allPoints = nodeGraphTraceOrthogonalPoints(from, points, to);
  if (!allPoints.length) {
    return "";
  }
  const [start, ...rest] = allPoints;
  return [
    `M ${start.x} ${start.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
  ].join(" ");
}
