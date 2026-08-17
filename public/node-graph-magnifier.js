const nodeGraphMagnifierLimits = Object.freeze({
  defaultSize: 220,
  mag: 2,
  maxMag: 8,
  minMag: 2,
  maxSize: 640,
  minSize: 10,
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

function clampNodeGraphMagnifierMag(value) {
  const mag = Number(value);
  const fallback = nodeGraphMagnifierLimits.mag;
  if (!Number.isFinite(mag) || mag <= 0) {
    return fallback;
  }
  return Math.max(nodeGraphMagnifierLimits.minMag, Math.min(nodeGraphMagnifierLimits.maxMag, mag));
}

function syncNodeGraphMagnifierZoomControl() {
  const button = document.getElementById("nodeMagnifierZoomSlider");
  if (!button) {
    return;
  }
  if (typeof button._syncToolbarFill === "function") {
    button._syncToolbarFill();
    return;
  }
  const mag = clampNodeGraphMagnifierMag(nodeGraphMvp?.magnifier?.mag ?? nodeGraphMagnifierLimits.mag);
  const min = nodeGraphMagnifierLimits.minMag;
  const max = nodeGraphMagnifierLimits.maxMag;
  const unit = (mag - min) / (max - min || 1);
  button.style.setProperty("--toolbar-fill", String(Math.max(0, Math.min(1, unit))));
  button.setAttribute("aria-valuenow", String(mag));
  button.setAttribute("aria-valuetext", `${mag.toFixed(2)}×`);
  button.setAttribute("aria-pressed", unit > 0.001 ? "true" : "false");
}

function setNodeGraphMagnifierMag(value) {
  const session = nodeGraphMagnifierSession();
  session.mag = clampNodeGraphMagnifierMag(value);
  syncNodeGraphMagnifierZoomControl();
  if (session.active) {
    applyNodeGraphMagnifierLayout();
  }
  return session.mag;
}

function syncNodeGraphMagnifierSizeControl() {
  const button = document.getElementById("nodeMagnifierSizeSlider");
  if (!button) {
    return;
  }
  if (typeof button._syncToolbarFill === "function") {
    button._syncToolbarFill();
    return;
  }
  const size = clampNodeGraphMagnifierSize(nodeGraphMvp?.magnifier?.size ?? nodeGraphMagnifierLimits.defaultSize);
  const min = nodeGraphMagnifierLimits.minSize;
  const max = nodeGraphMagnifierLimits.maxSize;
  const unit = (size - min) / (max - min || 1);
  button.style.setProperty("--toolbar-fill", String(Math.max(0, Math.min(1, unit))));
  button.setAttribute("aria-valuenow", String(size));
  button.setAttribute("aria-valuetext", `${Math.round(size)}px`);
  button.setAttribute("aria-pressed", unit > 0.001 ? "true" : "false");
}

function setNodeGraphMagnifierSize(value) {
  const session = nodeGraphMagnifierSession();
  session.size = clampNodeGraphMagnifierSize(value);
  syncNodeGraphMagnifierSizeControl();
  if (session.active) {
    applyNodeGraphMagnifierLayout();
  }
  return session.size;
}

function bindNodeGraphMagnifierZoomControl() {
  const button = document.getElementById("nodeMagnifierZoomSlider");
  if (!button || button.dataset.magnifierZoomBound === "true") {
    return;
  }
  button.dataset.magnifierZoomBound = "true";
  if (typeof bindNodeGraphToolbarFillSlider === "function") {
    bindNodeGraphToolbarFillSlider(button, {
      min: nodeGraphMagnifierLimits.minMag,
      max: nodeGraphMagnifierLimits.maxMag,
      get: () => clampNodeGraphMagnifierMag(nodeGraphMvp?.magnifier?.mag ?? nodeGraphMagnifierLimits.mag),
      set: (value) => {
        setNodeGraphMagnifierMag(value);
      },
      format: (value) => `${Number(value).toFixed(2)}×`,
    });
    return;
  }
  syncNodeGraphMagnifierZoomControl();
}

function bindNodeGraphMagnifierSizeControl() {
  const button = document.getElementById("nodeMagnifierSizeSlider");
  if (!button || button.dataset.magnifierSizeBound === "true") {
    return;
  }
  button.dataset.magnifierSizeBound = "true";
  if (typeof bindNodeGraphToolbarFillSlider === "function") {
    bindNodeGraphToolbarFillSlider(button, {
      min: nodeGraphMagnifierLimits.minSize,
      max: nodeGraphMagnifierLimits.maxSize,
      get: () => clampNodeGraphMagnifierSize(nodeGraphMvp?.magnifier?.size ?? nodeGraphMagnifierLimits.defaultSize),
      set: (value) => {
        setNodeGraphMagnifierSize(value);
      },
      format: (value) => `${Math.round(Number(value) || 0)}px`,
    });
    return;
  }
  syncNodeGraphMagnifierSizeControl();
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
    session.host.querySelector(".node-graph-magnifier-handle")?.remove();
    if (!session.host.querySelector(".node-graph-magnifier-rim")) {
      const existingRim = document.createElement("div");
      existingRim.className = "node-graph-magnifier-rim";
      existingRim.setAttribute("aria-hidden", "true");
      session.host.prepend(existingRim);
    }
    return session.host;
  }
  const host = document.createElement("div");
  host.id = "nodeGraphMagnifier";
  host.className = "node-graph-magnifier";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  const rim = document.createElement("div");
  rim.className = "node-graph-magnifier-rim";
  rim.setAttribute("aria-hidden", "true");
  const lens = document.createElement("div");
  lens.className = "node-graph-magnifier-lens";
  host.append(rim, lens);
  document.body.append(host);
  session.host = host;
  session.lens = lens;
  return host;
}

function nodeGraphMagnifierPaintRim(_workspace) {
  // Rim is a fixed black soft stroke (normal alpha glow). No selection tint.
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
  const rimW = Number.isFinite(Number(nodeGraphMvp?.magnifierBorderThickness))
    ? Number(nodeGraphMvp.magnifierBorderThickness)
    : 5;
  const rimS = Number.isFinite(Number(nodeGraphMvp?.magnifierBorderSoftness))
    ? Number(nodeGraphMvp.magnifierBorderSoftness)
    : 4;
  session.host.style.setProperty("--magnifier-rim-width", `${rimW}px`);
  session.host.style.setProperty("--magnifier-rim-softness", `${rimS}px`);
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
  zoomNodeGraphMagnifierByWheel(event);
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
  session.mag = clampNodeGraphMagnifierMag(session.mag || nodeGraphMagnifierLimits.mag);
  session.pointerId = event.pointerId;
  session.size = clampNodeGraphMagnifierSize(session.size || nodeGraphMagnifierLimits.defaultSize);
  syncNodeGraphMagnifierZoomControl();
  syncNodeGraphMagnifierSizeControl();
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

function zoomNodeGraphMagnifierByWheel(event) {
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
  setNodeGraphMagnifierMag(
    session.mag * Math.exp(Math.log(nodeGraphMagnifierLimits.sizeRatio) * steps),
  );
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    session.x = event.clientX;
    session.y = event.clientY;
  }
  return true;
}

function resizeNodeGraphMagnifierByWheel(event) {
  return zoomNodeGraphMagnifierByWheel(event);
}
