const nodeGraphCameraDragMinSize = Object.freeze({
  height: 80,
  width: 120,
});

function nodeGraphCameraState() {
  const normalized = normalizeNodeGraphPatchCameras(nodeGraphMvp.patch.cameras, nodeGraphMvp.patch.activeCameraId);
  nodeGraphMvp.patch.cameras = normalized.cameras;
  nodeGraphMvp.patch.activeCameraId = normalized.activeCameraId;
  return normalized;
}

function nodeGraphActiveCamera() {
  const state = nodeGraphCameraState();
  return state.cameras.find((camera) => camera.id === state.activeCameraId) || state.cameras[0];
}

function nodeGraphCameraAspectRatio(camera) {
  const width = Number(camera?.resolutionWidth);
  const height = Number(camera?.resolutionHeight);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? Math.max(0.01, width / height)
    : 16 / 9;
}

function nodeGraphCameraSnapStep(axis) {
  const step = axis === "y" && typeof nodeGraphGridHeight === "function"
    ? nodeGraphGridHeight()
    : typeof nodeGraphGridWidth === "function"
      ? nodeGraphGridWidth()
      : 28;
  return Number.isFinite(step) && step > 0 ? step : 28;
}

function nodeGraphSnapCameraValue(value, axis = "x") {
  const step = nodeGraphCameraSnapStep(axis);
  return Math.max(0, Math.round(Number(value) / step) * step);
}

function nodeGraphSnapCameraPoint(point) {
  return {
    x: nodeGraphSnapCameraValue(point.x, "x"),
    y: nodeGraphSnapCameraValue(point.y, "y"),
  };
}

function nodeGraphCameraWithAspect(camera, primary = "width") {
  const ratio = nodeGraphCameraAspectRatio(camera);
  const next = { ...camera };
  if (primary === "height") {
    next.height = Math.max(nodeGraphCameraDragMinSize.height, Math.round(Number(next.height) || 0));
    next.width = Math.max(nodeGraphCameraDragMinSize.width, Math.round(next.height * ratio));
  } else {
    next.width = Math.max(nodeGraphCameraDragMinSize.width, Math.round(Number(next.width) || 0));
    next.height = Math.max(nodeGraphCameraDragMinSize.height, Math.round(next.width / ratio));
  }
  next.x = nodeGraphSnapCameraValue(next.x, "x");
  next.y = nodeGraphSnapCameraValue(next.y, "y");
  next.width = Math.min(4000, Math.round(next.width));
  next.height = Math.min(4000, Math.round(next.height));
  return next;
}

function nodeGraphCameraWithAspectFromCenter(camera, previousCamera) {
  const ratio = nodeGraphCameraAspectRatio(camera);
  const previous = previousCamera || camera;
  const center = {
    x: Number(previous.x) + Number(previous.width) / 2,
    y: Number(previous.y) + Number(previous.height) / 2,
  };
  const previousArea = Math.max(
    nodeGraphCameraDragMinSize.width * nodeGraphCameraDragMinSize.height,
    Number(previous.width) * Number(previous.height),
  );
  const next = { ...camera };
  next.width = Math.max(nodeGraphCameraDragMinSize.width, Math.round(Math.sqrt(previousArea * ratio)));
  next.height = Math.max(nodeGraphCameraDragMinSize.height, Math.round(next.width / ratio));
  next.x = nodeGraphSnapCameraValue(center.x - next.width / 2, "x");
  next.y = nodeGraphSnapCameraValue(center.y - next.height / 2, "y");
  return nodeGraphCameraWithAspect(next, "width");
}

function patchNodeGraphCamera(camera) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const state = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  patch.cameras = state.cameras.map((candidate) =>
    candidate.id === camera.id ? normalizeNodeGraphCamera(camera, state.cameras.indexOf(candidate)) : candidate
  );
  patch.activeCameraId = state.activeCameraId;
  commitNodeGraphPatch(patch, { status: "camera adjusted" });
}

function bindNodeGraphCameraControls() {
  const widthInput = document.getElementById("nodeCameraResolutionWidth");
  const heightInput = document.getElementById("nodeCameraResolutionHeight");
  if (!widthInput || !heightInput || widthInput.dataset.boundCameraResolution === "true") {
    return;
  }
  const handleResolutionChange = () => handleNodeGraphCameraResolutionChange();
  widthInput.addEventListener("change", handleResolutionChange);
  heightInput.addEventListener("change", handleResolutionChange);
  widthInput.dataset.boundCameraResolution = "true";
  heightInput.dataset.boundCameraResolution = "true";
}

function renderNodeGraphCameraControls(camera) {
  bindNodeGraphCameraControls();
  const widthInput = document.getElementById("nodeCameraResolutionWidth");
  const heightInput = document.getElementById("nodeCameraResolutionHeight");
  if (!widthInput || !heightInput || !camera) {
    return;
  }
  if (document.activeElement !== widthInput) {
    widthInput.value = String(camera.resolutionWidth);
  }
  if (document.activeElement !== heightInput) {
    heightInput.value = String(camera.resolutionHeight);
  }
}

function handleNodeGraphCameraResolutionChange() {
  const camera = nodeGraphActiveCamera();
  const widthInput = document.getElementById("nodeCameraResolutionWidth");
  const heightInput = document.getElementById("nodeCameraResolutionHeight");
  if (!camera || !widthInput || !heightInput) {
    return;
  }
  const next = nodeGraphCameraWithAspectFromCenter(
    {
      ...camera,
      resolutionHeight: heightInput.value,
      resolutionWidth: widthInput.value,
    },
    camera,
  );
  patchNodeGraphCamera(next);
}

function nodeGraphCameraCloneWireSvg(liveSvg) {
  if (!liveSvg) {
    return null;
  }
  const clone = liveSvg.cloneNode(true);
  clone.removeAttribute("id");
  clone.classList.add("node-camera-preview-wire-svg");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("focusable", "false");
  clone.style.pointerEvents = "none";
  clone.style.width = "100%";
  clone.style.height = "100%";
  const viewBox = liveSvg.getAttribute("viewBox");
  if (viewBox) {
    clone.setAttribute("viewBox", viewBox);
  }
  const rect = liveSvg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));
  }
  const idMap = new Map();
  clone.querySelectorAll("defs [id]").forEach((element) => {
    const oldId = element.id;
    const newId = `camera-preview-${oldId}`;
    idMap.set(oldId, newId);
    element.id = newId;
  });
  if (idMap.size) {
    clone.querySelectorAll("*").forEach((element) => {
      for (const attribute of ["clip-path", "fill", "filter", "mask", "stroke"]) {
        const value = element.getAttribute(attribute);
        if (!value) {
          continue;
        }
        let nextValue = value;
        for (const [oldId, newId] of idMap) {
          nextValue = nextValue.replaceAll(`url(#${oldId})`, `url(#${newId})`);
        }
        if (nextValue !== value) {
          element.setAttribute(attribute, nextValue);
        }
      }
    });
  }
  return clone;
}

function copyNodeGraphCameraWorldCanvases(source, clone) {
  const sourceCanvases = [...source.querySelectorAll("canvas")];
  const cloneCanvases = [...clone.querySelectorAll("canvas")];
  sourceCanvases.forEach((sourceCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas || !sourceCanvas.width || !sourceCanvas.height) {
      return;
    }
    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;
    try {
      cloneCanvas.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
    } catch {
      // WebGL canvases can be unreadable in some contexts; the camera feed should keep rendering.
    }
  });
}

function createNodeGraphCameraWorldClone(source, wireSvg) {
  const clone = source.cloneNode(true);
  clone.classList.add("node-camera-preview-world");
  clone.style.setProperty("--node-graph-pan-x", "0px");
  clone.style.setProperty("--node-graph-pan-y", "0px");
  clone.style.setProperty("--node-graph-zoom", "1");
  clone.querySelector("#nodeModularOnlyBackButton")?.remove();
  clone.querySelector("#nodeCameraOverlayLayer")?.remove();
  clone.querySelector("#nodeSelectionMarquee")?.remove();
  clone.querySelector("#nodeSelectionHitTrail")?.remove();
  clone.querySelector("#nodeWireSvg, .node-wire-svg")?.remove();
  clone.querySelector("#nodeWireEndpointSvg, .node-wire-endpoint-svg")?.remove();
  const zoomSurface = clone.querySelector("#nodeGraphZoomSurface, .node-graph-zoom-surface") || clone;
  if (wireSvg) {
    zoomSurface.prepend(wireSvg);
  }
  // Cap layer above modules (same order as live graph).
  const endpointSvg = nodeGraphCameraCloneWireSvg(document.getElementById("nodeWireEndpointSvg"));
  if (endpointSvg) {
    endpointSvg.classList.add("node-wire-endpoint-svg");
    const nodes = zoomSurface.querySelector(".node-graph-nodes");
    if (nodes?.nextSibling) {
      zoomSurface.insertBefore(endpointSvg, nodes.nextSibling);
    } else if (nodes) {
      nodes.after(endpointSvg);
    } else {
      zoomSurface.append(endpointSvg);
    }
  }
  copyNodeGraphCameraWorldCanvases(source, clone);
  clone.querySelectorAll("[id]").forEach((element) => {
    if (element.closest("defs")) {
      return;
    }
    element.removeAttribute("id");
  });
  return clone;
}

function renderNodeGraphCameraFeed(options = {}) {
  const viewport = options.viewport || null;
  const surface = options.surface || null;
  const camera = options.camera || null;
  surface?.replaceChildren();
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!viewport || !surface || !camera || !workspace) {
    return false;
  }
  const workspaceStyle = getComputedStyle(workspace);
  for (let index = 0; index < workspaceStyle.length; index += 1) {
    const property = workspaceStyle[index];
    if (property.startsWith("--node-")) {
      viewport.style.setProperty(property, workspaceStyle.getPropertyValue(property));
    }
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires();
  }
  const wireSvg = nodeGraphCameraCloneWireSvg(document.getElementById("nodeWireSvg"));
  const clone = createNodeGraphCameraWorldClone(workspace, wireSvg);
  if (typeof options.decorateClone === "function") {
    options.decorateClone(clone, { camera, surface, viewport });
  }
  surface.append(clone);
  const scale = Math.min(
    viewport.clientWidth / Math.max(1, camera.width),
    viewport.clientHeight / Math.max(1, camera.height),
  );
  surface.style.setProperty("--camera-preview-height", `${camera.height}px`);
  surface.style.setProperty("--camera-preview-scale", String(Number.isFinite(scale) ? scale : 1));
  surface.style.setProperty("--camera-preview-width", `${camera.width}px`);
  clone.style.transform = `translate(${-camera.x}px, ${-camera.y}px)`;
  return true;
}

function nodeGraphUtilityCameraState() {
  if (!(nodeGraphMvp.utilityCameras instanceof Map)) {
    nodeGraphMvp.utilityCameras = new Map();
  }
  return nodeGraphMvp.utilityCameras;
}

function upsertNodeGraphUtilityCamera(camera) {
  if (!camera?.id) {
    return null;
  }
  nodeGraphUtilityCameraState().set(camera.id, camera);
  return camera;
}

function removeNodeGraphUtilityCamera(id) {
  nodeGraphUtilityCameraState().delete(String(id || ""));
}

function createNodeGraphUtilityCameraForElement(id, element, options = {}) {
  if (!element?.isConnected) {
    removeNodeGraphUtilityCamera(id);
    return null;
  }
  const bounds = typeof nodeGraphNodeBounds === "function"
    ? nodeGraphNodeBounds(element)
    : {
      bottom: element.offsetTop + element.offsetHeight,
      left: element.offsetLeft,
      right: element.offsetLeft + element.offsetWidth,
      top: element.offsetTop,
    };
  const padding = Math.max(0, Number(options.padding) || 0);
  const x = Math.max(0, Math.floor(bounds.left - padding));
  const y = Math.max(0, Math.floor(bounds.top - padding));
  const width = Math.max(1, Math.ceil(bounds.right - bounds.left + padding * 2));
  const height = Math.max(1, Math.ceil(bounds.bottom - bounds.top + padding * 2));
  return upsertNodeGraphUtilityCamera({
    color: options.color || "#7fc7d9",
    enabled: true,
    height,
    id: String(id || "utility-camera"),
    name: String(options.name || "Utility Camera"),
    resolutionHeight: Math.max(1, Math.round(height)),
    resolutionWidth: Math.max(1, Math.round(width)),
    utility: true,
    width,
    x,
    y,
  });
}

function nodeGraphCameraFrameHandleNames() {
  return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
}

function ensureNodeGraphCameraFrameElement(camera) {
  const layer = document.getElementById("nodeCameraOverlayLayer");
  if (!layer || !camera) {
    return null;
  }
  let frame = layer.querySelector(`[data-camera-id="${camera.id}"]`);
  if (!frame) {
    frame = document.createElement("div");
    frame.className = "node-camera-frame";
    frame.dataset.cameraId = camera.id;
    frame.tabIndex = 0;
    frame.setAttribute("role", "button");
    frame.addEventListener("pointerdown", beginNodeGraphCameraFrameDrag);
    const label = document.createElement("span");
    label.className = "node-camera-frame-label";
    frame.append(label);
    for (const handle of nodeGraphCameraFrameHandleNames()) {
      const grip = document.createElement("i");
      grip.className = "node-camera-frame-handle";
      grip.dataset.cameraHandle = handle;
      grip.addEventListener("pointerdown", beginNodeGraphCameraFrameDrag);
      frame.append(grip);
    }
    layer.append(frame);
  }
  return frame;
}

function renderNodeGraphCameraFrames() {
  const layer = document.getElementById("nodeCameraOverlayLayer");
  if (!layer) {
    return;
  }
  const state = nodeGraphCameraState();
  const visible = Boolean(nodeGraphMvp.videoViewVisible);
  layer.hidden = !visible;
  layer.setAttribute("aria-hidden", visible ? "false" : "true");
  const activeIds = new Set(state.cameras.map((camera) => camera.id));
  for (const frame of [...layer.querySelectorAll("[data-camera-id]")]) {
    if (!activeIds.has(frame.dataset.cameraId)) {
      frame.remove();
    }
  }
  if (!visible) {
    return;
  }
  for (const camera of state.cameras) {
    const frame = ensureNodeGraphCameraFrameElement(camera);
    if (!frame) {
      continue;
    }
    frame.style.setProperty("--camera-frame-color", camera.color);
    frame.style.setProperty("--camera-frame-height", `${camera.height}px`);
    frame.style.setProperty("--camera-frame-width", `${camera.width}px`);
    frame.style.setProperty("--camera-frame-x", `${camera.x}px`);
    frame.style.setProperty("--camera-frame-y", `${camera.y}px`);
    frame.classList.toggle("active", camera.id === state.activeCameraId);
    frame.setAttribute("aria-label", `${camera.name} camera frame`);
    frame.querySelector(".node-camera-frame-label").textContent = camera.name;
  }
}

function renderNodeGraphCameraPreview() {
  const panel = document.getElementById("nodeVideoViewPanel");
  const viewport = document.getElementById("nodeCameraPreviewViewport");
  const surface = document.getElementById("nodeCameraPreviewSurface");
  const status = document.getElementById("nodeVideoViewStatus");
  const name = document.getElementById("nodeVideoViewCameraName");
  const frame = document.querySelector(".node-video-view-frame");
  const camera = nodeGraphActiveCamera();
  if (!panel || !viewport || !surface || !camera) {
    return;
  }
  if (name) {
    name.textContent = camera.name;
  }
  if (status) {
    status.textContent = `${camera.resolutionWidth} x ${camera.resolutionHeight}`;
  }
  if (frame) {
    frame.style.setProperty("--camera-view-aspect", `${camera.resolutionWidth} / ${camera.resolutionHeight}`);
  }
  renderNodeGraphCameraControls(camera);
  if (panel.hidden) {
    return;
  }
  renderNodeGraphCameraFeed({ camera, surface, viewport });
}

function renderNodeGraphCameraView() {
  renderNodeGraphCameraFrames();
  renderNodeGraphCameraPreview();
}

function beginNodeGraphCameraFrameDrag(event) {
  if (event.button !== 0) {
    return;
  }
  const frame = event.currentTarget.closest("[data-camera-id]");
  const camera = nodeGraphCameraState().cameras.find((candidate) => candidate.id === frame?.dataset.cameraId);
  if (!frame || !camera) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  frame.setPointerCapture(event.pointerId);
  const point = nodeGraphClientPoint(event);
  nodeGraphMvp.cameraDragging = {
    camera: { ...camera },
    handle: event.currentTarget.dataset.cameraHandle || "move",
    pointerId: event.pointerId,
    start: nodeGraphSnapCameraPoint(point),
  };
  frame.addEventListener("pointermove", dragNodeGraphCameraFrame);
  frame.addEventListener("pointerup", endNodeGraphCameraFrameDrag);
  frame.addEventListener("pointercancel", endNodeGraphCameraFrameDrag);
}

function nodeGraphCameraFromDrag(point) {
  const drag = nodeGraphMvp.cameraDragging;
  if (!drag) {
    return null;
  }
  const snappedPoint = nodeGraphSnapCameraPoint(point);
  const dx = snappedPoint.x - drag.start.x;
  const dy = snappedPoint.y - drag.start.y;
  const base = drag.camera;
  let next = { ...base };
  const handle = drag.handle;
  if (handle === "move") {
    next.x = nodeGraphSnapCameraValue(base.x + dx, "x");
    next.y = nodeGraphSnapCameraValue(base.y + dy, "y");
  } else {
    const right = base.x + base.width;
    const bottom = base.y + base.height;
    if (handle.includes("e") || handle.includes("w")) {
      const edge = handle.includes("w")
        ? nodeGraphSnapCameraValue(base.x + dx, "x")
        : nodeGraphSnapCameraValue(right + dx, "x");
      const width = handle.includes("w") ? right - edge : edge - base.x;
      next.width = width;
      next = nodeGraphCameraWithAspect(next, "width");
      next.x = handle.includes("w") ? nodeGraphSnapCameraValue(right - next.width, "x") : base.x;
      next.y = handle.includes("n") ? nodeGraphSnapCameraValue(bottom - next.height, "y") : base.y;
    } else if (handle.includes("n") || handle.includes("s")) {
      const edge = handle.includes("n")
        ? nodeGraphSnapCameraValue(base.y + dy, "y")
        : nodeGraphSnapCameraValue(bottom + dy, "y");
      const height = handle.includes("n") ? bottom - edge : edge - base.y;
      next.height = height;
      next = nodeGraphCameraWithAspect(next, "height");
      next.x = base.x;
      next.y = handle.includes("n") ? nodeGraphSnapCameraValue(bottom - next.height, "y") : base.y;
    }
  }
  return nodeGraphCameraWithAspect(next, handle.includes("n") || handle.includes("s") ? "height" : "width");
}

function dragNodeGraphCameraFrame(event) {
  const drag = nodeGraphMvp.cameraDragging;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const camera = nodeGraphCameraFromDrag(nodeGraphClientPoint(event));
  if (!camera) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.cameras = patch.cameras.map((candidate) => candidate.id === camera.id ? camera : candidate);
  nodeGraphMvp.patch = patch;
  renderNodeGraphCameraView();
}

function endNodeGraphCameraFrameDrag(event) {
  const drag = nodeGraphMvp.cameraDragging;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const frame = event.currentTarget;
  frame.releasePointerCapture?.(event.pointerId);
  frame.removeEventListener("pointermove", dragNodeGraphCameraFrame);
  frame.removeEventListener("pointerup", endNodeGraphCameraFrameDrag);
  frame.removeEventListener("pointercancel", endNodeGraphCameraFrameDrag);
  const camera = nodeGraphCameraFromDrag(nodeGraphClientPoint(event));
  nodeGraphMvp.cameraDragging = null;
  if (camera) {
    patchNodeGraphCamera(camera);
  }
}
