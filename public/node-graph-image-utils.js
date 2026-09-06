const nodeGraphImageLayoutKind = "image";
const nodeGraphImageAcceptedTypes = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const nodeGraphImageAssetAccept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";
const nodeGraphImageAssetMaxBytes = 6_000_000;
const nodeGraphRgbaImageCache = new Map();

function normalizeNodeGraphImageDataUrl(value) {
  const text = String(value || "");
  // Allow charset / base64 params before the comma (SVG often uses charset=utf-8).
  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(text)) {
    return "";
  }
  return text.length <= nodeGraphImageAssetMaxBytes ? text : "";
}

function nodeGraphImageFileLooksSupported(file) {
  if (!file) {
    return false;
  }
  const type = String(file.type || "").toLowerCase();
  if (type && nodeGraphImageAcceptedTypes.includes(type)) {
    return true;
  }
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(String(file.name || ""));
}

function nodeGraphNormalizeImageAsset(entry = {}, fallbackName = "") {
  const source = entry && typeof entry === "object" ? entry : {};
  const dataUrl = normalizeNodeGraphImageDataUrl(source.dataUrl || source.src);
  const name = String(source.fileName || source.name || fallbackName || "").trim().slice(0, 180);
  return {
    dataUrl,
    fileName: dataUrl ? name : "",
  };
}

function nodeGraphImageAssetLabel(asset, empty = "—") {
  const next = nodeGraphNormalizeImageAsset(asset);
  if (!next.dataUrl) {
    return empty;
  }
  return next.fileName || "image";
}

function nodeGraphReadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!nodeGraphImageFileLooksSupported(file)) {
      reject(new Error("unsupported image type"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("image read failed"));
    reader.onload = () => {
      const dataUrl = normalizeNodeGraphImageDataUrl(reader.result);
      if (!dataUrl) {
        reject(new Error("image too large or invalid"));
        return;
      }
      resolve({
        dataUrl,
        fileName: String(file.name || "image").slice(0, 180),
      });
    };
    reader.readAsDataURL(file);
  });
}

function nodeGraphPickImageFile(onPick) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = nodeGraphImageAssetAccept;
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) {
      return;
    }
    nodeGraphReadImageFile(file).then((asset) => {
      onPick?.(asset);
    }).catch((error) => {
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp(error?.message === "unsupported image type"
          ? "Image type not supported (use PNG, JPEG, WebP, GIF, or SVG)."
          : "Image is too large or invalid.");
      }
    });
  });
  document.body.append(input);
  input.click();
}

function nodeGraphSaveImageAsset(asset, fallbackName = "image") {
  const next = nodeGraphNormalizeImageAsset(asset, fallbackName);
  if (!next.dataUrl) {
    return false;
  }
  const link = document.createElement("a");
  link.href = next.dataUrl;
  link.download = typeof nodeGraphImageFileName === "function"
    ? nodeGraphImageFileName(next)
    : (next.fileName || fallbackName);
  document.body.append(link);
  link.click();
  link.remove();
  return true;
}

function nodeGraphEscapeImageAssetHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function nodeGraphBuildImageAssetRowHtml(options = {}) {
  const key = String(options.key || "image");
  const label = nodeGraphEscapeImageAssetHtml(options.label || "Image");
  const save = options.save !== false;
  return `
      <div class="node-led-settings-row node-image-asset-row" data-image-asset-row="${nodeGraphEscapeImageAssetHtml(key)}">
        <span>${label}</span>
        <button type="button" data-image-asset-action="load" data-image-asset="${nodeGraphEscapeImageAssetHtml(key)}">Load</button>
        ${save ? `<button type="button" data-image-asset-action="save" data-image-asset="${nodeGraphEscapeImageAssetHtml(key)}">Save</button>` : ""}
        <button type="button" data-image-asset-action="clear" data-image-asset="${nodeGraphEscapeImageAssetHtml(key)}">Clear</button>
        <small data-image-asset-name="${nodeGraphEscapeImageAssetHtml(key)}">—</small>
      </div>`;
}

function nodeGraphSyncImageAssetRow(root, key, asset, empty = "—") {
  const el = root?.querySelector?.(`[data-image-asset-name="${CSS.escape(String(key || ""))}"]`);
  if (!el) {
    return;
  }
  const label = nodeGraphImageAssetLabel(asset, empty);
  el.textContent = label;
  el.title = label === empty ? "no image" : label;
}

function nodeGraphBindImageAssetClicks(host, onAction) {
  if (!host || host.dataset.imageAssetBound === "true" || typeof onAction !== "function") {
    return;
  }
  host.dataset.imageAssetBound = "true";
  host.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-image-asset-action]");
    if (!button || !host.contains(button)) {
      return;
    }
    event.preventDefault();
    onAction(String(button.getAttribute("data-image-asset") || ""), button.getAttribute("data-image-asset-action"));
  });
}

function normalizeNodeGraphImageLayout(layout = {}) {
  const source = layout && typeof layout === "object" ? layout : {};
  return {
    dataUrl: normalizeNodeGraphImageDataUrl(source.dataUrl || source.src),
    fileName: nodeGraphOneLineText(source.fileName || source.name || "trace-image").slice(0, 96),
    kind: nodeGraphImageLayoutKind,
    refreshedAt: Math.max(0, Math.floor(Number(source.refreshedAt) || 0)),
  };
}

function nodeGraphImageLayoutForNode(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return normalizeNodeGraphImageLayout(patchNode?.layout);
}

function nodeGraphImageFileName(layout = {}) {
  const normalized = normalizeNodeGraphImageLayout(layout);
  const base = nodeGraphOneLineText(normalized.fileName || "trace-image").replace(/[\\/:*?"<>|]+/g, "-") || "trace-image";
  const extensionMatch = normalized.dataUrl.match(/^data:image\/([^;]+)/i);
  const extension = (extensionMatch?.[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

function createNodeGraphImageBody(nodeId) {
  const body = document.createElement("div");
  body.className = "node-image-body";
  body.dataset.node = nodeId;

  const preview = document.createElement("div");
  preview.className = "node-image-preview";
  preview.dataset.nodeImagePreview = nodeId;
  preview.setAttribute("aria-label", "Image preview");

  const status = document.createElement("span");
  status.className = "node-image-status";
  status.dataset.nodeImageStatus = nodeId;
  status.textContent = "no image";
  preview.append(status);
  body.append(preview);

  renderNodeGraphImageBody(body, nodeId);
  return body;
}

function renderNodeGraphImageBody(body, nodeId = body?.dataset?.node) {
  const preview = body?.querySelector?.("[data-node-image-preview]");
  const status = body?.querySelector?.("[data-node-image-status]");
  if (!preview || !status || !nodeId) {
    return;
  }
  const layout = nodeGraphImageLayoutForNode(nodeId);
  preview.style.backgroundImage = layout.dataUrl ? `url("${layout.dataUrl}")` : "";
  preview.dataset.hasImage = layout.dataUrl ? "true" : "false";
  status.textContent = layout.dataUrl ? layout.fileName || "image loaded" : "no image";
}

function refreshNodeGraphImageBodies() {
  for (const body of document.querySelectorAll(".node-image-body")) {
    renderNodeGraphImageBody(body);
  }
}

function nodeGraphImageOutputDataUrl(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "image") {
    return "";
  }
  return nodeGraphImageLayoutForNode(node).dataUrl;
}

function nodeGraphImageElementForDataUrl(dataUrl) {
  const source = String(dataUrl || "");
  if (!source) {
    return null;
  }
  const cached = nodeGraphRgbaImageCache.get(source);
  if (cached) {
    return cached;
  }
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    refreshNodeGraphCanvasBodies();
  };
  image.src = source;
  nodeGraphRgbaImageCache.set(source, image);
  if (nodeGraphRgbaImageCache.size > 64) {
    nodeGraphRgbaImageCache.delete(nodeGraphRgbaImageCache.keys().next().value);
  }
  return image;
}

function nodeGraphScopeCanvasCropToContext(sourceCanvas, sourceRect, targetContext, targetWidth, targetHeight) {
  if (!sourceCanvas || !sourceRect || !targetContext) {
    return false;
  }
  const sourceCanvasRect = sourceCanvas.getBoundingClientRect();
  if (
    sourceCanvasRect.width <= 0 ||
    sourceCanvasRect.height <= 0 ||
    sourceCanvas.width <= 0 ||
    sourceCanvas.height <= 0
  ) {
    return false;
  }
  const scaleX = sourceCanvas.width / sourceCanvasRect.width;
  const scaleY = sourceCanvas.height / sourceCanvasRect.height;
  const sourceX = clampNodeSliderValue((sourceRect.left - sourceCanvasRect.left) * scaleX, 0, Math.max(0, sourceCanvas.width - 1));
  const sourceY = clampNodeSliderValue((sourceRect.top - sourceCanvasRect.top) * scaleY, 0, Math.max(0, sourceCanvas.height - 1));
  const sourceWidth = Math.max(1, Math.min(sourceCanvas.width - sourceX, sourceRect.width * scaleX));
  const sourceHeight = Math.max(1, Math.min(sourceCanvas.height - sourceY, sourceRect.height * scaleY));
  try {
    targetContext.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );
    return true;
  } catch {
    return false;
  }
}

function nodeGraphVisualOscilloscopeOutputDataUrl(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "visualOscilloscope") {
    return "";
  }
  if (typeof drawNodeGraphModuleScopes === "function") {
    drawNodeGraphModuleScopes();
  }
  const liveNode = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(nodeId) : null;
  const liveScope = liveNode?.querySelector(".node-module-scope-window");
  const sourceRect = liveScope?.getBoundingClientRect?.();
  if (!sourceRect || sourceRect.width <= 0 || sourceRect.height <= 0) {
    return "";
  }
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, Math.ceil(sourceRect.width * (window.devicePixelRatio || 1)));
  surface.height = Math.max(1, Math.ceil(sourceRect.height * (window.devicePixelRatio || 1)));
  const context = surface.getContext("2d");
  if (!context) {
    return "";
  }
  let drew = false;
  drew = nodeGraphScopeCanvasCropToContext(
    document.getElementById("nodeModuleScopeCanvas"),
    sourceRect,
    context,
    surface.width,
    surface.height,
  ) || drew;
  drew = nodeGraphScopeCanvasCropToContext(
    document.getElementById("nodeModuleScopeLightCanvas"),
    sourceRect,
    context,
    surface.width,
    surface.height,
  ) || drew;
  return drew ? surface.toDataURL("image/png") : "";
}

function nodeGraphCanvasLayerSourceConnection(nodeId, inputPort) {
  const port = String(inputPort || "").trim();
  if (!port) {
    return null;
  }
  return (nodeGraphMvp.patch?.connections || []).find((connection) =>
    connection.destinationNode === nodeId &&
    nodeGraphCanonicalInputPort("canvas", connection.destinationPort) === port);
}

function nodeGraphRgbaOutputDataUrlForConnection(connection, visited = new Set()) {
  if (!connection) {
    return "";
  }
  const sourceNode = nodeGraphPatchNode(connection.sourceNode);
  const sourcePort = nodeGraphCanonicalOutputPort(sourceNode?.type, connection.sourcePort);
  if (!sourceNode || sourcePort !== "RGBA") {
    return "";
  }
  if (sourceNode.type === "image") {
    return nodeGraphImageOutputDataUrl(sourceNode.id);
  }
  if (sourceNode.type === "visualOscilloscope") {
    return nodeGraphVisualOscilloscopeOutputDataUrl(sourceNode.id);
  }
  if (sourceNode.type === "canvas") {
    return nodeGraphCanvasOutputDataUrl(sourceNode.id, visited);
  }
  return "";
}

function nodeGraphDrawCanvasLayerImage(context, surface, layer, image) {
  const width = surface.width * Math.max(0, layer.scale);
  const height = surface.height * Math.max(0, layer.scale);
  context.drawImage(image, -width * 0.5, -height * 0.5, width, height);
}

function nodeGraphCanvasOutputDataUrl(nodeId, visited = new Set()) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "canvas") {
    return "";
  }
  if (visited.has(nodeId)) {
    return "";
  }
  visited.add(nodeId);
  const script = nodeGraphCanvasScriptForNode(node);
  const surface = document.createElement("canvas");
  const maxDimension = 512;
  const aspect = Math.max(0.001, Number(script.aspectRatio) || 1);
  surface.width = Math.max(1, Math.round(aspect >= 1 ? maxDimension : maxDimension * aspect));
  surface.height = Math.max(1, Math.round(aspect >= 1 ? maxDimension / aspect : maxDimension));
  const context = surface.getContext("2d");
  if (!context) {
    return "";
  }
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{1})?$|^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(script.background)) {
    context.fillStyle = script.background;
    context.fillRect(0, 0, surface.width, surface.height);
  }
  const layers = Array.isArray(script.layers) ? script.layers : [];
  layers.forEach((layer, index) => {
    if (layer.visible === false || layer.opacity <= 0 || layer.scale <= 0) {
      return;
    }
    const x = surface.width * layer.x;
    const y = surface.height * layer.y;
    const connection = nodeGraphCanvasLayerSourceConnection(nodeId, layer.input);
    if (!connection) {
      return;
    }
    const image = nodeGraphImageElementForDataUrl(nodeGraphRgbaOutputDataUrlForConnection(connection, visited));
    if (!image?.complete || image.naturalWidth <= 0) {
      return;
    }
    context.save();
    context.translate(x, y);
    context.rotate((Number(layer.rotation) || 0) * Math.PI / 180);
    context.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    nodeGraphDrawCanvasLayerImage(context, surface, layer, image);
    context.restore();
  });
  visited.delete(nodeId);
  return surface.toDataURL("image/png");
}

function nodeGraphTraceImageDataUrl() {
  const patch = nodeGraphMvp.patch || {};
  const connection = (patch.connections || []).find((wire) => {
    const destinationNode = nodeGraphPatchNode(wire.destinationNode);
    return destinationNode?.type === "sandboxVisuals" &&
      nodeGraphCanonicalInputPort("sandboxVisuals", wire.destinationPort) === "Trace Image";
  });
  if (!connection) {
    return "";
  }
  return nodeGraphRgbaOutputDataUrlForConnection(connection);
}

function nodeGraphCanvasScriptForNode(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return normalizeNodeGraphCanvasScript(patchNode?.canvasScript);
}

function createNodeGraphCanvasBody(nodeId) {
  const body = document.createElement("div");
  body.className = "node-canvas-body";
  body.dataset.node = nodeId;

  const preview = document.createElement("div");
  preview.className = "node-canvas-preview";
  preview.dataset.nodeCanvasPreview = nodeId;
  preview.setAttribute("aria-label", "Canvas preview");

  const frame = document.createElement("div");
  frame.className = "node-canvas-frame";
  frame.dataset.nodeCanvasFrame = nodeId;

  const layers = document.createElement("div");
  layers.className = "node-canvas-layers";
  layers.dataset.nodeCanvasLayers = nodeId;

  const status = document.createElement("span");
  status.className = "node-canvas-status";
  status.dataset.nodeCanvasStatus = nodeId;
  status.textContent = "canvas";

  frame.append(layers, status);
  preview.append(frame);
  body.append(preview);
  renderNodeGraphCanvasBody(body, nodeId);
  return body;
}

function renderNodeGraphCanvasBody(body, nodeId = body?.dataset?.node) {
  const preview = body?.querySelector?.("[data-node-canvas-preview]");
  const frame = body?.querySelector?.("[data-node-canvas-frame]");
  const layers = body?.querySelector?.("[data-node-canvas-layers]");
  const status = body?.querySelector?.("[data-node-canvas-status]");
  if (!preview || !frame || !layers || !status || !nodeId) {
    return;
  }
  const script = nodeGraphCanvasScriptForNode(nodeId);
  const aspect = Math.max(0.001, Number(script.aspectRatio) || 1);
  preview.dataset.canvasFaceBackground = script.faceBackground === "checkerboard" ? "checkerboard" : "color";
  frame.dataset.canvasScreenBackground = script.faceScreen === "checkerboard" ? "checkerboard" : "color";
  frame.dataset.canvasScreenFit = script.faceFit || "contain";
  preview.style.setProperty("--node-canvas-face-background", script.faceBackground === "checkerboard" ? "#000000" : script.faceBackground || "#000000");
  frame.style.setProperty("--node-canvas-screen-background", script.faceScreen === "checkerboard" ? "#000000" : script.faceScreen || "#000000");
  frame.style.setProperty("--node-canvas-aspect", String(aspect));
  const visibleLayers = (script.layers || []).filter((layer) =>
    layer.visible !== false &&
    layer.opacity > 0 &&
    layer.scale > 0 &&
    nodeGraphCanvasLayerSourceConnection(nodeId, layer.input),
  );
  layers.replaceChildren(...visibleLayers.map((layer, index) => {
    const element = document.createElement("span");
    element.className = "node-canvas-layer";
    element.dataset.layer = layer.id;
    element.textContent = layer.id;
    element.style.setProperty("--node-canvas-layer-x", `${Math.max(0, Math.min(1, layer.x)) * 100}%`);
    element.style.setProperty("--node-canvas-layer-y", `${Math.max(0, Math.min(1, layer.y)) * 100}%`);
    element.style.setProperty("--node-canvas-layer-scale", String(Math.max(0, Number(layer.scale) || 0)));
    element.style.setProperty("--node-canvas-layer-opacity", String(Math.max(0, Math.min(1, Number(layer.opacity) || 0))));
    element.style.setProperty("--node-canvas-layer-rotation", `${Number(layer.rotation) || 0}deg`);
    element.style.setProperty("--node-canvas-layer-hue", String((index * 67) % 360));
    return element;
  }));
  status.textContent = `${script.ratioWidth}:${script.ratioHeight} ${script.output || "canvas"}`;
}

function refreshNodeGraphCanvasBodies() {
  for (const body of document.querySelectorAll(".node-canvas-body")) {
    renderNodeGraphCanvasBody(body);
  }
}
