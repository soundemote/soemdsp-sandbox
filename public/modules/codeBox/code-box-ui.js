// Code box — control-plane editor. Publishes Code out on the data bus.
// Never runs in the audio path. localText persists; Code in overrides display.

const CODE_BOX_DEFAULT_LOCAL_TEXT = [
  "# codeBox curve v1",
  "p1  0.00  1.00  0.00",
  "p2  1.00  0.00  0.00",
  "",
].join("\n");

function normalizeNodeGraphCodeBox(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const localText = source.localText != null
    ? String(source.localText)
    : CODE_BOX_DEFAULT_LOCAL_TEXT;
  return { localText };
}

function nodeGraphCodeBoxIsCodeInConnected(nodeId) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return false;
  }
  const connections = nodeGraphModuleScopeConnectionsTo(nodeId, "Code") || [];
  return connections.some((c) => c?.sourceNode && c?.sourcePort);
}

function nodeGraphCodeBoxIncomingText(nodeId) {
  if (typeof readNodeGraphDataInput !== "function") {
    return undefined;
  }
  return readNodeGraphDataInput(nodeId, "Code");
}

function nodeGraphCodeBoxEffectiveText(patchNode) {
  if (!patchNode) {
    return CODE_BOX_DEFAULT_LOCAL_TEXT;
  }
  const store = normalizeNodeGraphCodeBox(patchNode.codeBox);
  if (nodeGraphCodeBoxIsCodeInConnected(patchNode.id)) {
    const incoming = nodeGraphCodeBoxIncomingText(patchNode.id);
    if (incoming !== undefined) {
      return String(incoming ?? "");
    }
  }
  return store.localText;
}

function commitNodeGraphCodeBoxLocalText(nodeId, localText, status = "Code local text") {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("codeBox")) {
    return false;
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((n) => n.id === nodeId);
  if (!patchNode) {
    return false;
  }
  // Refuse local edits while Code in is driving the face.
  if (nodeGraphCodeBoxIsCodeInConnected(nodeId)) {
    return false;
  }
  patchNode.codeBox = normalizeNodeGraphCodeBox({ localText: String(localText ?? "") });
  commitNodeGraphPatch(patch, { status, record: true });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(nodeId, "Code", patchNode.codeBox.localText);
  }
  return true;
}

function publishNodeGraphCodeBoxOutput(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode || patchNode.type !== "codeBox") {
    return;
  }
  if (typeof writeNodeGraphDataOutput !== "function") {
    return;
  }
  writeNodeGraphDataOutput(nodeId, "Code", nodeGraphCodeBoxEffectiveText(patchNode));
}

function syncNodeGraphCodeBoxFace(face, nodeId) {
  if (!face || !nodeId) {
    return;
  }
  const area = face.querySelector(".node-code-box-source");
  const applyBtn = face.querySelector(".node-code-box-apply");
  const hint = face.querySelector(".node-code-box-hint");
  if (!area) {
    return;
  }
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode) {
    return;
  }
  const driven = nodeGraphCodeBoxIsCodeInConnected(nodeId);
  const effective = nodeGraphCodeBoxEffectiveText(patchNode);
  area.readOnly = driven;
  if (applyBtn) {
    applyBtn.disabled = driven;
  }
  if (hint) {
    hint.textContent = driven
      ? "Code in connected — display follows cable; disconnect restores saved text."
      : "Edit + Apply publishes Code out. White square jacks are data, not audio.";
  }
  // Don't fight the caret while the user is typing local text.
  if (!driven && document.activeElement === area) {
    publishNodeGraphCodeBoxOutput(nodeId);
    return;
  }
  if (area.value !== effective) {
    area.value = effective;
  }
  publishNodeGraphCodeBoxOutput(nodeId);
}

function createNodeGraphCodeBoxFace(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const store = normalizeNodeGraphCodeBox(patchNode?.codeBox);

  const face = document.createElement("div");
  face.className = "node-code-box-face";
  face.dataset.node = nodeId;
  face.dataset.nodeType = "codeBox";
  face.setAttribute("aria-label", "Code box");

  const toolbar = document.createElement("div");
  toolbar.className = "node-code-box-toolbar";

  const label = document.createElement("div");
  label.className = "node-code-box-label";
  label.textContent = "Code";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "node-code-box-apply";
  applyBtn.textContent = "Apply";

  toolbar.append(label, applyBtn);

  const area = document.createElement("textarea");
  area.className = "node-code-box-source";
  area.spellcheck = false;
  area.autocomplete = "off";
  area.value = store.localText;
  area.setAttribute("aria-label", "Code source");

  const hint = document.createElement("div");
  hint.className = "node-code-box-hint";

  const apply = () => {
    if (area.readOnly) {
      return;
    }
    commitNodeGraphCodeBoxLocalText(nodeId, area.value, "Code Apply");
    syncNodeGraphCodeBoxFace(face, nodeId);
  };

  applyBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    apply();
  });
  area.addEventListener("pointerdown", (e) => e.stopPropagation());
  area.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "enter") {
      e.preventDefault();
      apply();
    }
  });

  face.append(toolbar, area, hint);
  face.addEventListener("pointerdown", (event) => {
    if (event.target.closest("textarea, button")) {
      event.stopPropagation();
    }
  });

  // Never commit during face mount — that re-enters applyNodeGraphPatchToDom and freezes the app.
  // Spawn/load stamps codeBox via createNodeGraphPatchNode / validate.
  if (patchNode && (!patchNode.codeBox || patchNode.codeBox.localText == null)) {
    patchNode.codeBox = normalizeNodeGraphCodeBox({ localText: store.localText });
  }

  syncNodeGraphCodeBoxFace(face, nodeId);
  return face;
}

function syncAllNodeGraphCodeBoxFaces() {
  document.querySelectorAll(".node-code-box-face[data-node]").forEach((face) => {
    syncNodeGraphCodeBoxFace(face, face.dataset.node);
  });
}


function nodeGraphParseCodeBoxCurveText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const nodes = [];
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) continue;
    let id = null;
    let x;
    let y;
    let bend;
    if (parts.length >= 4 && Number.isFinite(Number(parts[1]))) {
      id = String(parts[0]);
      x = Number(parts[1]);
      y = Number(parts[2]);
      bend = Number(parts[3]);
    } else {
      x = Number(parts[0]);
      y = Number(parts[1]);
      bend = Number(parts[2]);
    }
    if (![x, y, bend].every((n) => Number.isFinite(n))) continue;
    nodes.push({
      id: id || `p${nodes.length + 1}`,
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      c: Math.max(-1, Math.min(1, bend)),
      shape: "linear",
    });
  }
  if (nodes.length < 2) return null;
  nodes.sort((a, b) => a.x - b.x);
  return nodes.slice(0, 32);
}

function syncNodeGraphGraphCodeInputs() {
  if (typeof nodeGraphPatchNode !== "function" || typeof nodeGraphMvp === "undefined") return;
  const patchNodes = nodeGraphMvp.patch?.nodes || [];
  for (const patchNode of patchNodes) {
    if (!patchNode || (patchNode.type !== "smoothGraph" && patchNode.type !== "stepGraph")) continue;
    if (typeof nodeGraphCodeBoxIsCodeInConnected !== "function" || !nodeGraphCodeBoxIsCodeInConnected(patchNode.id)) {
      continue;
    }
    const incoming = nodeGraphCodeBoxIncomingText(patchNode.id);
    if (incoming === undefined) continue;
    const text = String(incoming ?? "");
    if (patchNode.ui?.codeDrivenFingerprint === text) continue;
    const parsed = nodeGraphParseCodeBoxCurveText(text);
    if (!parsed) continue;
    if (typeof cloneNodeGraphPatch !== "function" || typeof commitNodeGraphPatch !== "function") continue;
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    const node = patch.nodes.find((n) => n.id === patchNode.id);
    if (!node) continue;
    const prev = typeof normalizeNodeGraphGraph === "function"
      ? normalizeNodeGraphGraph(node.graph)
      : { cursorX: 0.5, nodes: [] };
    node.graph = typeof normalizeNodeGraphGraph === "function"
      ? normalizeNodeGraphGraph({ cursorX: prev.cursorX, nodes: parsed })
      : { cursorX: prev.cursorX, nodes: parsed };
    if (Array.isArray(node.graph?.nodes)) {
      for (let i = 0; i < node.graph.nodes.length && i < parsed.length; i += 1) {
        if (parsed[i].id) node.graph.nodes[i].id = parsed[i].id;
      }
    }
    node.ui = { ...(node.ui || {}), codeDriven: true, codeDrivenFingerprint: text };
    commitNodeGraphPatch(patch, { status: "Graph Code in", record: false });
  }
}


function serializeNodeGraphCurveToCodeText(graph) {
  const g = typeof normalizeNodeGraphGraph === "function"
    ? normalizeNodeGraphGraph(graph)
    : graph;
  const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
  const lines = ["# graph curve v1"];
  nodes.forEach((node, index) => {
    const id = node?.id || `p${index + 1}`;
    const x = Number(node?.x);
    const y = Number(node?.y);
    const c = Number(node?.c);
    if (![x, y].every((n) => Number.isFinite(n))) return;
    const bend = Number.isFinite(c) ? c : 0;
    lines.push(`${id}  ${x.toFixed(4)}  ${y.toFixed(4)}  ${bend.toFixed(4)}`);
  });
  return lines.join("\n") + "\n";
}

function publishNodeGraphGraphCodeOutputs() {
  if (typeof nodeGraphMvp === "undefined" || typeof writeNodeGraphDataOutput !== "function") return;
  for (const patchNode of nodeGraphMvp.patch?.nodes || []) {
    if (!patchNode || (patchNode.type !== "smoothGraph" && patchNode.type !== "stepGraph")) continue;
    // While Code in is driving, publish the incoming/effective curve text if any;
    // otherwise serialize local graph.nodes.
    let text;
    if (typeof nodeGraphCodeBoxIsCodeInConnected === "function"
      && nodeGraphCodeBoxIsCodeInConnected(patchNode.id)) {
      const incoming = nodeGraphCodeBoxIncomingText(patchNode.id);
      text = incoming !== undefined ? String(incoming ?? "") : serializeNodeGraphCurveToCodeText(patchNode.graph);
    } else {
      text = serializeNodeGraphCurveToCodeText(patchNode.graph);
    }
    writeNodeGraphDataOutput(patchNode.id, "Code", text);
  }
}

function syncAllNodeGraphCodeSurfaces() {
  syncAllNodeGraphCodeBoxFaces();
  syncNodeGraphGraphCodeInputs();
  publishNodeGraphGraphCodeOutputs();
}

// Keep driven faces / graphs in sync when cables or the data bus change.
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof addNodeGraphModuleScopeSnapshotListener === "function") {
      addNodeGraphModuleScopeSnapshotListener(syncAllNodeGraphCodeSurfaces);
    }
    setInterval(syncAllNodeGraphCodeSurfaces, 250);
  });
}
