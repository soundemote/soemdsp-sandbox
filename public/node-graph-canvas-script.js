const nodeGraphCanvasScriptModuleDefaultsStorageKey = "soemdsp-sandbox.canvasScriptModuleDefaults.v1";

const nodeGraphCanvasScriptState = {
  dialogDrag: null,
  targetNodeId: "",
};

function nodeGraphCanvasScriptDialog() {
  return document.getElementById("nodeCanvasScriptDialog");
}

function nodeGraphCanvasScriptSource() {
  return document.getElementById("nodeCanvasScriptSource");
}

function nodeGraphCanvasScriptDialogCanDragTarget(target) {
  return Boolean(target?.closest?.(".scene-context-heading, .scene-context-drag-handle")) &&
    !target?.closest?.(".panel-close-button, textarea, input, select, option");
}

function positionNodeGraphCanvasScriptDialog(left, top) {
  const dialog = nodeGraphCanvasScriptDialog();
  if (!dialog) {
    return;
  }
  const { left: nextLeft, top: nextTop } = nodeGraphFloatingWindowPosition(dialog, left, top);
  setNodeGraphFloatingWindowViewportPosition(dialog, nextLeft, nextTop);
  dialog.style.bottom = "auto";
}

function beginNodeGraphCanvasScriptDialogDrag(event) {
  if (event.button > 0 || !nodeGraphCanvasScriptDialogCanDragTarget(event.target)) {
    return;
  }
  const dialog = nodeGraphCanvasScriptDialog();
  if (!dialog || dialog.hidden) {
    return;
  }
  const rect = dialog.getBoundingClientRect();
  nodeGraphCanvasScriptState.dialogDrag = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    pointerId: event.pointerId ?? null,
  };
  dialog.classList.add("dragging");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphCanvasScriptDialog(event) {
  const drag = nodeGraphCanvasScriptState.dialogDrag;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  positionNodeGraphCanvasScriptDialog(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  event.preventDefault();
}

function endNodeGraphCanvasScriptDialogDrag(event) {
  const drag = nodeGraphCanvasScriptState.dialogDrag;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  nodeGraphCanvasScriptState.dialogDrag = null;
  nodeGraphCanvasScriptDialog()?.classList.remove("dragging");
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  event.preventDefault();
}

function nodeGraphCanvasScriptStatus(message = "ready", isError = false) {
  const status = document.getElementById("nodeCanvasScriptStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = `pill ${isError ? "warn" : "good"}`;
}

function nodeGraphCanvasScriptTargetNode() {
  const id = nodeGraphCanvasScriptState.targetNodeId;
  const node = id ? nodeGraphPatchNode(id) : null;
  return node?.type === "canvas" ? node : null;
}

function nodeGraphCanvasScriptLoadModuleDefaults() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(nodeGraphCanvasScriptModuleDefaultsStorageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function nodeGraphCanvasScriptSaveModuleDefaults(defaults) {
  try {
    window.localStorage.setItem(nodeGraphCanvasScriptModuleDefaultsStorageKey, JSON.stringify(defaults || {}));
  } catch {
    // Defaults are a convenience; patch-local scripts still save normally.
  }
}

function nodeGraphCanvasScriptModuleDefault(type = "canvas") {
  const defaults = nodeGraphCanvasScriptLoadModuleDefaults();
  return typeof defaults[type] === "string" ? defaults[type] : "";
}

function nodeGraphCanvasScriptSourceForNode(node) {
  const explicit = Object.hasOwn(node || {}, "canvasScript")
    ? normalizeNodeGraphCanvasScript(node.canvasScript).source
    : "";
  return explicit || nodeGraphCanvasScriptModuleDefault(node?.type) || nodeGraphCanvasScriptDefaultSource;
}

function syncNodeGraphCanvasScriptPreview() {
  const preview = document.getElementById("nodeCanvasScriptPreview");
  const source = nodeGraphCanvasScriptSource()?.value || "";
  const script = normalizeNodeGraphCanvasScript({ source });
  if (!preview) {
    return;
  }
  preview.style.setProperty("--node-canvas-preview-aspect", String(Math.max(0.001, Number(script.aspectRatio) || 1)));
  preview.dataset.canvasFaceBackground = script.faceBackground === "checkerboard" ? "checkerboard" : "color";
  preview.dataset.canvasScreenBackground = script.faceScreen === "checkerboard" ? "checkerboard" : "color";
  preview.dataset.canvasScreenFit = script.faceFit || "contain";
  preview.style.setProperty("--node-canvas-face-background", script.faceBackground === "checkerboard" ? "#000000" : script.faceBackground || "#000000");
  preview.style.setProperty("--node-canvas-screen-background", script.faceScreen === "checkerboard" ? "#000000" : script.faceScreen || "#000000");
  let layerHost = preview.querySelector("[data-node-canvas-script-layers]");
  if (!layerHost) {
    layerHost = document.createElement("div");
    layerHost.className = "node-canvas-script-preview-layers";
    layerHost.dataset.nodeCanvasScriptLayers = "true";
    preview.prepend(layerHost);
  }
  layerHost.replaceChildren(...(script.layers || []).map((layer, index) => {
    const element = document.createElement("span");
    element.className = "node-canvas-script-preview-layer";
    element.textContent = layer.id;
    element.style.setProperty("--node-canvas-layer-x", `${Math.max(0, Math.min(1, layer.x)) * 100}%`);
    element.style.setProperty("--node-canvas-layer-y", `${Math.max(0, Math.min(1, layer.y)) * 100}%`);
    element.style.setProperty("--node-canvas-layer-scale", String(Math.max(0, Number(layer.scale) || 0)));
    element.style.setProperty("--node-canvas-layer-opacity", String(Math.max(0, Math.min(1, Number(layer.opacity) || 0))));
    element.style.setProperty("--node-canvas-layer-rotation", `${Number(layer.rotation) || 0}deg`);
    element.style.setProperty("--node-canvas-layer-hue", String((index * 67) % 360));
    return element;
  }));
  const label = preview.querySelector("strong");
  if (label) {
    label.textContent = `${script.ratioWidth}:${script.ratioHeight} ${script.output || "canvas"} (${script.layers.length} layers)`;
  }
}

function setNodeGraphCanvasScriptDialogVisible(visible) {
  const dialog = nodeGraphCanvasScriptDialog();
  if (!dialog) {
    return;
  }
  dialog.hidden = !visible;
  if (visible) {
    syncNodeGraphCanvasScriptPreview();
    nodeGraphCanvasScriptSource()?.focus();
  }
}

function openNodeGraphCanvasScript(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "canvas") {
    return false;
  }
  nodeGraphCanvasScriptState.targetNodeId = node.id;
  const title = document.getElementById("nodeCanvasScriptTitle");
  if (title) {
    title.textContent = `Canvas Script: ${nodeGraphPatchNodeTitle(node)}`;
  }
  const source = nodeGraphCanvasScriptSource();
  if (source) {
    source.value = nodeGraphCanvasScriptSourceForNode(node);
  }
  setNodeGraphCanvasScriptDialogVisible(true);
  nodeGraphCanvasScriptStatus("ready", false);
  return true;
}

function openNodeGraphCanvasScriptFromContext() {
  const nodeId = nodeGraphModuleActionTargetNodeId();
  if (openNodeGraphCanvasScript(nodeId)) {
    closeNodeSceneContextMenu();
  }
}

function saveNodeGraphCanvasScriptFromDialog() {
  const targetNode = nodeGraphCanvasScriptTargetNode();
  if (!targetNode) {
    nodeGraphCanvasScriptStatus("canvas module missing", true);
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const node = patch.nodes.find((candidate) => candidate.id === targetNode.id);
  if (!node) {
    nodeGraphCanvasScriptStatus("canvas module missing", true);
    return false;
  }
  node.canvasScript = normalizeNodeGraphCanvasScript({
    ...node.canvasScript,
    source: nodeGraphCanvasScriptSource()?.value || "",
  });
  commitNodeGraphPatch(patch, { status: "canvas script saved" });
  refreshNodeGraphCanvasBodies();
  nodeGraphCanvasScriptStatus("saved", false);
  return true;
}

function saveNodeGraphCanvasScriptDefaultFromDialog() {
  const targetNode = nodeGraphCanvasScriptTargetNode();
  const type = targetNode?.type || "canvas";
  const defaults = nodeGraphCanvasScriptLoadModuleDefaults();
  defaults[type] = normalizeNodeGraphCanvasScript({
    source: nodeGraphCanvasScriptSource()?.value || "",
  }).source;
  nodeGraphCanvasScriptSaveModuleDefaults(defaults);
  nodeGraphCanvasScriptStatus(`${nodeGraphNodeLabels[type] || type} default saved`, false);
}

async function copyNodeGraphCanvasScriptSource() {
  try {
    await navigator.clipboard.writeText(nodeGraphCanvasScriptSource()?.value || "");
    nodeGraphCanvasScriptStatus("copied", false);
  } catch {
    nodeGraphCanvasScriptSource()?.focus();
    nodeGraphCanvasScriptSource()?.select();
    nodeGraphCanvasScriptStatus("copy blocked", true);
  }
}

async function pasteNodeGraphCanvasScriptSource() {
  try {
    const source = nodeGraphCanvasScriptSource();
    if (!source) {
      nodeGraphCanvasScriptStatus("script editor missing", true);
      return;
    }
    source.value = await navigator.clipboard.readText();
    syncNodeGraphCanvasScriptPreview();
    nodeGraphCanvasScriptStatus("pasted", false);
  } catch {
    nodeGraphCanvasScriptStatus("paste blocked", true);
  }
}

function exportNodeGraphCanvasScriptToDesktop() {
  const targetNode = nodeGraphCanvasScriptTargetNode();
  const source = nodeGraphCanvasScriptSource()?.value || "";
  const blob = new Blob([`${source}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = nodeGraphOneLineText(nodeGraphPatchNodeTitle(targetNode) || "canvas-script")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  link.href = url;
  link.download = `${safeName || "canvas-script"}.canvas.js`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  nodeGraphCanvasScriptStatus("sent to desktop", false);
}

function resetNodeGraphCanvasScriptStarter() {
  const source = nodeGraphCanvasScriptSource();
  if (!source) {
    return;
  }
  const targetNode = nodeGraphCanvasScriptTargetNode();
  source.value = nodeGraphCanvasScriptModuleDefault(targetNode?.type) || nodeGraphCanvasScriptDefaultSource;
  syncNodeGraphCanvasScriptPreview();
  nodeGraphCanvasScriptStatus("starter loaded", false);
}

function bindNodeGraphCanvasScriptEvents() {
  document.getElementById("nodeCanvasScriptClose")?.addEventListener("click", () =>
    setNodeGraphCanvasScriptDialogVisible(false));
  document.getElementById("nodeCanvasScriptSave")?.addEventListener("click", saveNodeGraphCanvasScriptFromDialog);
  document.getElementById("nodeCanvasScriptCopy")?.addEventListener("click", copyNodeGraphCanvasScriptSource);
  document.getElementById("nodeCanvasScriptPaste")?.addEventListener("click", pasteNodeGraphCanvasScriptSource);
  document.getElementById("nodeCanvasScriptToDesktop")?.addEventListener("click", exportNodeGraphCanvasScriptToDesktop);
  document.getElementById("nodeCanvasScriptStarter")?.addEventListener("click", resetNodeGraphCanvasScriptStarter);
  document.getElementById("nodeCanvasScriptSaveDefault")?.addEventListener("click", saveNodeGraphCanvasScriptDefaultFromDialog);
  document.getElementById("nodeCanvasScriptSource")?.addEventListener("input", syncNodeGraphCanvasScriptPreview);
  const panel = document.querySelector("#nodeCanvasScriptDialog .node-canvas-script-panel");
  panel?.addEventListener("pointerdown", beginNodeGraphCanvasScriptDialogDrag);
  panel?.addEventListener("pointermove", dragNodeGraphCanvasScriptDialog);
  panel?.addEventListener("pointerup", endNodeGraphCanvasScriptDialogDrag);
  panel?.addEventListener("pointercancel", endNodeGraphCanvasScriptDialogDrag);
}
