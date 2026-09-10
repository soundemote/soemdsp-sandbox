// Module geometry SSOT — publish once after layout; wires/taps read, they do not
// remeasure every draw. Layout owners invalidate; Play/scopes are not owners.
//
// Attach points are zoom-surface coordinates (same space as wire SVG).

const nodeGraphModuleGeometryById = new Map(); // nodeId → ModuleGeometry
let nodeGraphModuleGeometryEpoch = 0;

/**
 * @typedef {{
 *   nodeId: string,
 *   epoch: number,
 *   box: { x: number, y: number, w: number, h: number },
 *   ports: Array<{ port: string, io: string, x: number, y: number, visible: boolean }>,
 *   paramJacks: Array<{ key: string, kind: string, x: number, y: number, visible: boolean }>,
 * }} ModuleGeometry
 */

function nodeGraphModuleGeometryKey(nodeId, port, io) {
  return `${String(nodeId || "")}\0${String(io || "")}\0${String(port || "")}`;
}

function nodeGraphModuleGeometryInvalidate(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    nodeGraphModuleGeometryById.clear();
    nodeGraphModuleGeometryEpoch += 1;
    return;
  }
  nodeGraphModuleGeometryById.delete(id);
  nodeGraphModuleGeometryEpoch += 1;
}

function nodeGraphModuleGeometryInvalidateAll() {
  nodeGraphModuleGeometryById.clear();
  nodeGraphModuleGeometryEpoch += 1;
}

function nodeGraphModuleGeometryGet(nodeId) {
  return nodeGraphModuleGeometryById.get(String(nodeId || "")) || null;
}

function nodeGraphModuleGeometryAttach(nodeId, port, io) {
  const geo = nodeGraphModuleGeometryGet(nodeId);
  if (!geo) return null;
  const wantPort = String(port || "");
  const wantIo = String(io || "");
  if (wantIo === "modulation" || wantIo === "graph") {
    const hit = geo.paramJacks.find((j) => j.key === wantPort && j.kind === wantIo && j.visible);
    return hit ? { x: hit.x, y: hit.y } : null;
  }
  const hit = geo.ports.find((p) => p.port === wantPort && p.io === wantIo && p.visible);
  return hit ? { x: hit.x, y: hit.y } : null;
}

/**
 * Publish geometry for one module from current DOM (one-shot after layout).
 * Callers: applyNodeGraphModuleLayout, module move settle — NOT Play/scope loops.
 */
function nodeGraphModuleGeometryPublishFromDom(nodeId) {
  const id = String(nodeId || "");
  if (!id || typeof nodeGraphNodeElement !== "function") {
    return null;
  }
  const el = nodeGraphNodeElement(id);
  if (!el || !el.isConnected) {
    nodeGraphModuleGeometryById.delete(id);
    return null;
  }
  const surface = typeof nodeGraphZoomSurface === "function" ? nodeGraphZoomSurface() : null;
  if (!surface) return null;

  const toSurface = (clientX, clientY) => {
    if (typeof nodeGraphClientToZoomSurfacePoint === "function") {
      return nodeGraphClientToZoomSurfacePoint(clientX, clientY);
    }
    const sr = surface.getBoundingClientRect();
    return { x: clientX - sr.left, y: clientY - sr.top };
  };

  const boxRect = el.getBoundingClientRect();
  const boxTl = toSurface(boxRect.left, boxRect.top);
  const boxBr = toSurface(boxRect.right, boxRect.bottom);
  const box = {
    x: boxTl.x,
    y: boxTl.y,
    w: Math.max(0, boxBr.x - boxTl.x),
    h: Math.max(0, boxBr.y - boxTl.y),
  };

  const ports = [];
  for (const portEl of el.querySelectorAll(":scope .node-port:not(.node-param-port)")) {
    const port = String(portEl.dataset?.port || "").trim();
    const io = String(portEl.dataset?.io || "").trim();
    if (!port || (io !== "input" && io !== "output")) continue;
    const visible = typeof nodeGraphPortElementIsLayoutVisible === "function"
      ? nodeGraphPortElementIsLayoutVisible(portEl)
      : (portEl.getBoundingClientRect().width > 0.5);
    if (!visible) {
      ports.push({ port, io, x: 0, y: 0, visible: false });
      continue;
    }
    const center = typeof nodeGraphElementPatchPointClientCenter === "function"
      ? nodeGraphElementPatchPointClientCenter(portEl, io)
      : (() => {
        const r = portEl.getBoundingClientRect();
        return { x: r.left + r.width * (io === "output" ? 1 : 0), y: r.top + r.height * 0.5 };
      })();
    const pt = toSurface(center.x, center.y);
    ports.push({ port, io, x: pt.x, y: pt.y, visible: true });
  }

  const paramJacks = [];
  for (const jack of el.querySelectorAll(":scope .node-param-port")) {
    const key = String(jack.dataset?.param || jack.dataset?.graphInput || jack.dataset?.port || "").trim();
    if (!key) continue;
    let kind = "modulation";
    if (jack.classList.contains("graph-input")) kind = "graph";
    else if (jack.classList.contains("parameter-output") || jack.dataset?.io === "output") kind = "output";
    else if (jack.dataset?.io === "modulation") kind = "modulation";
    const visible = typeof nodeGraphPortElementIsLayoutVisible === "function"
      ? nodeGraphPortElementIsLayoutVisible(jack)
      : (jack.getBoundingClientRect().width > 0.5);
    if (!visible) {
      paramJacks.push({ key, kind, x: 0, y: 0, visible: false });
      continue;
    }
    const center = typeof nodeGraphElementPatchPointClientCenter === "function"
      ? nodeGraphElementPatchPointClientCenter(jack, kind === "output" ? "output" : kind)
      : (() => {
        const r = jack.getBoundingClientRect();
        return { x: kind === "output" ? r.right : r.left, y: r.top + r.height * 0.5 };
      })();
    const pt = toSurface(center.x, center.y);
    paramJacks.push({ key, kind, x: pt.x, y: pt.y, visible: true });
  }

  /** @type {ModuleGeometry} */
  const geo = {
    nodeId: id,
    epoch: nodeGraphModuleGeometryEpoch,
    box,
    ports,
    paramJacks,
  };
  nodeGraphModuleGeometryById.set(id, geo);
  return geo;
}

/** Publish every connected module currently in the workspace. */
function nodeGraphModuleGeometryPublishVisible() {
  const nodes = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [];
  for (const node of nodes) {
    const id = String(node?.id || "");
    if (!id) continue;
    if (typeof nodeGraphPatchNodeIsVisible === "function" && !nodeGraphPatchNodeIsVisible(id)) {
      // Still publish if metamodule proxy targets need shell geometry on Root.
      const el = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(id) : null;
      if (!el?.isConnected) continue;
    }
    nodeGraphModuleGeometryPublishFromDom(id);
  }
}

/**
 * After article band layout settles — publish this module's attaches once.
 * Wired from applyNodeGraphModuleLayout.
 */
function nodeGraphModuleGeometryPublishAfterLayout(article, patchNode) {
  const id = String(patchNode?.id || article?.dataset?.node || "");
  if (!id) return;
  // Double-rAF was the old “wait for DOM” culture. One rAF after layout apply
  // is enough to publish; Play must not keep re-publishing.
  if (article?._geometryPublishRaf) {
    cancelAnimationFrame(article._geometryPublishRaf);
  }
  article._geometryPublishRaf = requestAnimationFrame(() => {
    article._geometryPublishRaf = 0;
    nodeGraphModuleGeometryPublishFromDom(id);
  });
}
