const nodeGraphMagnifierLimits = Object.freeze({
  defaultSize: 220,
  mag: 2,
  maxSize: 640,
  minSize: 80,
  sizeRatio: 1.12,
});

function nodeGraphMagnifierSession() {
  if (!nodeGraphMvp.magnifier) {
    nodeGraphMvp.magnifier = {
      active: false,
      host: null,
      lens: null,
      mag: nodeGraphMagnifierLimits.mag,
      pointerId: null,
      size: nodeGraphMagnifierLimits.defaultSize,
      blockContextUntil: 0,
      contextGuardBound: false,
      contextGuardTimer: 0,
      wheelBound: false,
      world: null,
      x: 0,
      y: 0,
    };
  }
  return nodeGraphMvp.magnifier;
}

function nodeGraphMagnifierIsActive() {
  return Boolean(nodeGraphMvp.magnifier?.active);
}

function clampNodeGraphMagnifierSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) {
    return nodeGraphMagnifierLimits.defaultSize;
  }
  return Math.max(nodeGraphMagnifierLimits.minSize, Math.min(nodeGraphMagnifierLimits.maxSize, size));
}

function ensureNodeGraphMagnifierHost() {
  const session = nodeGraphMagnifierSession();
  if (session.host instanceof HTMLElement) {
    return session.host;
  }
  const host = document.createElement("div");
  host.id = "nodeGraphMagnifier";
  host.className = "node-graph-magnifier";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  const lens = document.createElement("div");
  lens.className = "node-graph-magnifier-lens";
  const handle = document.createElement("div");
  handle.className = "node-graph-magnifier-handle";
  host.append(lens, handle);
  document.body.append(host);
  session.host = host;
  session.lens = lens;
  return host;
}

function nodeGraphMagnifierPaintRim(workspace) {
  const host = nodeGraphMagnifierSession().host;
  if (!host) {
    return;
  }
  const style = workspace ? getComputedStyle(workspace) : null;
  const color = typeof nodeGraphCssColorForSvgStroke === "function"
    ? nodeGraphCssColorForSvgStroke(style?.getPropertyValue("--node-selection-hit-trail-color") || "rgb(0 208 255)")
    : (style?.getPropertyValue("--node-selection-hit-trail-color") || "rgb(0 208 255)").trim();
  const alphaRaw = Number(style?.getPropertyValue("--node-selection-hit-trail-alpha"));
  const alpha = Number.isFinite(alphaRaw) ? Math.max(0, Math.min(1, alphaRaw)) : 0.95;
  host.style.setProperty("--node-graph-magnifier-color", color);
  host.style.setProperty("--node-graph-magnifier-alpha", String(alpha));
}

function nodeGraphMagnifierCloneWorkspace(workspace) {
  const clone = workspace.cloneNode(true);
  clone.removeAttribute("id");
  clone.classList.add("node-graph-magnifier-world");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  for (const selector of [
    "#nodeModularOnlyBackButton",
    "#nodeGraphResizeHandle",
    "#nodeGraphEmptyModuleButton",
    "#nodeSelectionMarquee",
    "#nodeSelectionHitTrail",
    "#nodeCameraOverlayLayer",
    "#nodeGraphMagnifier",
  ]) {
    clone.querySelector(selector)?.remove();
  }
  clone.querySelectorAll("[id]").forEach((element) => {
    if (!element.closest("defs")) {
      element.removeAttribute("id");
    }
  });
  clone.style.pointerEvents = "none";
  clone.style.border = "none";
  clone.style.borderRadius = "0";
  if (typeof copyNodeGraphCameraWorldCanvases === "function") {
    copyNodeGraphCameraWorldCanvases(workspace, clone);
  }
  return clone;
}

function applyNodeGraphMagnifierLayout() {
  const session = nodeGraphMvp.magnifier;
  if (!session?.active || !session.host) {
    return;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  session.host.style.left = `${session.x}px`;
  session.host.style.top = `${session.y}px`;
  session.host.style.setProperty("--magnifier-size", `${session.size}px`);
  nodeGraphMagnifierPaintRim(workspace);
  if (!workspace || !session.world) {
    return;
  }
  const rect = workspace.getBoundingClientRect();
  const mag = session.mag;
  const localX = session.x - rect.left;
  const localY = session.y - rect.top;
  session.world.style.width = `${rect.width}px`;
  session.world.style.height = `${rect.height}px`;
  session.world.style.transform =
    `translate(${session.size / 2 - localX * mag}px, ${session.size / 2 - localY * mag}px) scale(${mag})`;
}

function bindNodeGraphMagnifierWheelCapture(on) {
  const session = nodeGraphMagnifierSession();
  if (on) {
    if (session.wheelBound) {
      return;
    }
    document.addEventListener("wheel", handleNodeGraphMagnifierWheelCapture, { capture: true, passive: false });
    session.wheelBound = true;
    return;
  }
  if (!session.wheelBound) {
    return;
  }
  document.removeEventListener("wheel", handleNodeGraphMagnifierWheelCapture, true);
  session.wheelBound = false;
}

function handleNodeGraphMagnifierWheelCapture(event) {
  resizeNodeGraphMagnifierByWheel(event);
}

function nodeGraphMagnifierShouldBlockContext() {
  const session = nodeGraphMvp?.magnifier;
  if (!session) {
    return false;
  }
  if (session.active) {
    return true;
  }
  const until = Number(session.blockContextUntil) || 0;
  return until > 0 && performance.now() < until;
}

function handleNodeGraphMagnifierContextGuard(event) {
  if (!nodeGraphMagnifierShouldBlockContext()) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (event.type === "contextmenu" && nodeGraphMvp.magnifier && !nodeGraphMvp.magnifier.active) {
    nodeGraphMvp.magnifier.blockContextUntil = 0;
  }
}

function bindNodeGraphMagnifierContextGuard(on) {
  const session = nodeGraphMagnifierSession();
  if (on) {
    if (session.contextGuardBound) {
      return;
    }
    document.addEventListener("contextmenu", handleNodeGraphMagnifierContextGuard, true);
    document.addEventListener("auxclick", handleNodeGraphMagnifierContextGuard, true);
    session.contextGuardBound = true;
    return;
  }
  if (!session.contextGuardBound) {
    return;
  }
  document.removeEventListener("contextmenu", handleNodeGraphMagnifierContextGuard, true);
  document.removeEventListener("auxclick", handleNodeGraphMagnifierContextGuard, true);
  session.contextGuardBound = false;
}

function scheduleNodeGraphMagnifierContextGuardRelease() {
  const session = nodeGraphMagnifierSession();
  if (session.contextGuardTimer) {
    window.clearTimeout(session.contextGuardTimer);
  }
  session.contextGuardTimer = window.setTimeout(() => {
    session.contextGuardTimer = 0;
    session.blockContextUntil = 0;
    if (!session.active) {
      bindNodeGraphMagnifierContextGuard(false);
    }
  }, 400);
}

function endNodeGraphMagnifier() {
  const session = nodeGraphMvp.magnifier;
  const workspace = document.getElementById("nodeGraphWorkspace");
  bindNodeGraphMagnifierWheelCapture(false);
  if (session?.active) {
    session.blockContextUntil = performance.now() + 400;
    bindNodeGraphMagnifierContextGuard(true);
    scheduleNodeGraphMagnifierContextGuardRelease();
  }
  if (session?.pointerId != null && workspace?.hasPointerCapture?.(session.pointerId)) {
    workspace.releasePointerCapture(session.pointerId);
  }
  session?.world?.remove();
  if (session) {
    session.active = false;
    session.pointerId = null;
    session.world = null;
    if (session.host) {
      session.host.hidden = true;
    }
  }
  workspace?.classList.remove("node-graph-magnifying");
  document.body.classList.remove("node-graph-magnifying-active");
}

function beginNodeGraphMagnifier(event) {
  if (event.button !== 2 || typeof nodeGraphEventTargetIsEmptyWorkspaceArea !== "function") {
    return;
  }
  if (!nodeGraphEventTargetIsEmptyWorkspaceArea(event)) {
    return;
  }
  if (nodeGraphMvp.portConnectionMode || nodeGraphMvp.wireDragging?.active) {
    return;
  }
  event.preventDefault();
  const workspace = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const session = nodeGraphMagnifierSession();
  endNodeGraphMagnifier();
  const host = ensureNodeGraphMagnifierHost();
  session.active = true;
  session.mag = nodeGraphMagnifierLimits.mag;
  session.pointerId = event.pointerId;
  session.size = clampNodeGraphMagnifierSize(session.size || nodeGraphMagnifierLimits.defaultSize);
  session.x = event.clientX;
  session.y = event.clientY;
  session.lens?.replaceChildren();
  host.hidden = false;
  workspace.classList.add("node-graph-magnifying");
  document.body.classList.add("node-graph-magnifying-active");
  applyNodeGraphMagnifierLayout();
  bindNodeGraphMagnifierWheelCapture(true);
  bindNodeGraphMagnifierContextGuard(true);
  workspace.setPointerCapture?.(event.pointerId);
  const pointerId = event.pointerId;
  window.requestAnimationFrame(() => {
    if (!session.active || session.pointerId !== pointerId) {
      return;
    }
    const live = document.getElementById("nodeGraphWorkspace");
    if (!live) {
      return;
    }
    const world = nodeGraphMagnifierCloneWorkspace(live);
    if (!session.active || session.pointerId !== pointerId) {
      world.remove();
      return;
    }
    session.world = world;
    session.lens?.replaceChildren(world);
    applyNodeGraphMagnifierLayout();
  });
}

function moveNodeGraphMagnifier(event) {
  const session = nodeGraphMvp.magnifier;
  if (!session?.active || session.pointerId !== event.pointerId) {
    return;
  }
  session.x = event.clientX;
  session.y = event.clientY;
  applyNodeGraphMagnifierLayout();
}

function endNodeGraphMagnifierFromPointer(event) {
  if (event.button !== 2) {
    return;
  }
  const session = nodeGraphMvp.magnifier;
  if (!session?.active) {
    return;
  }
  if (session.pointerId != null && event.pointerId !== session.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  endNodeGraphMagnifier();
}

function resizeNodeGraphMagnifierByWheel(event) {
  const session = nodeGraphMvp.magnifier;
  if (!session?.active || !event.deltaY) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const steps = typeof nodeGraphWheelZoomSteps === "function"
    ? nodeGraphWheelZoomSteps(event)
    : -(Number(event.deltaY) || 0) / 100;
  if (!steps) {
    return true;
  }
  session.size = clampNodeGraphMagnifierSize(
    session.size * Math.exp(Math.log(nodeGraphMagnifierLimits.sizeRatio) * steps),
  );
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    session.x = event.clientX;
    session.y = event.clientY;
  }
  applyNodeGraphMagnifierLayout();
  return true;
}
