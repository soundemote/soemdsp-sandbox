// Code box — control-plane document editor for Graph `graph` JSON.
// Publishes Code out on the data bus. Never runs in the audio path.
// Payload is isomorphic to normalizeNodeGraphGraph (optional "v" tag only).

const CODE_BOX_DEFAULT_GRAPH = Object.freeze({
  cursorX: 0.5,
  nodes: Object.freeze([
    Object.freeze({ x: 0, y: 1, c: 0, shape: "linear" }),
    Object.freeze({ x: 1, y: 0, c: 0, shape: "linear" }),
  ]),
});

/** Compact JSON: one line per point, minimal wrapping. Still valid JSON. */
function serializeNodeGraphCurveToCodeText(graph) {
  const g = typeof normalizeNodeGraphGraph === "function"
    ? normalizeNodeGraphGraph(graph)
    : graph;
  const cursorX = Number(g?.cursorX);
  const nodes = (Array.isArray(g?.nodes) ? g.nodes : []).map((node) => ({
    x: Number(node?.x),
    y: Number(node?.y),
    c: Number(node?.c),
    shape: String(node?.shape || "linear"),
  }));
  const nodeLines = nodes.map((node) => `    ${JSON.stringify(node)}`);
  return [
    "{",
    `  "cursorX": ${JSON.stringify(cursorX)},`,
    `  "nodes": [`,
    nodeLines.join(",\n"),
    "  ]",
    "}",
    "",
  ].join("\n");
}

function nodeGraphCodeBoxDefaultLocalText() {
  return serializeNodeGraphCurveToCodeText(CODE_BOX_DEFAULT_GRAPH);
}

const CODE_BOX_DEFAULT_LOCAL_TEXT = nodeGraphCodeBoxDefaultLocalText();

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
  const value = readNodeGraphDataInput(nodeId, "Code");
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  // Object on the bus → same compact document form as Graph serialize.
  try {
    if (value && typeof value === "object" && Array.isArray(value.nodes)) {
      return serializeNodeGraphCurveToCodeText(value);
    }
    return `${JSON.stringify(value)}\n`;
  } catch (_error) {
    return String(value ?? "");
  }
}

function nodeGraphCodeBoxSourceGraphText(nodeId) {
  if (typeof nodeGraphModuleScopeConnectionsTo !== "function") {
    return undefined;
  }
  const connection = (nodeGraphModuleScopeConnectionsTo(nodeId, "Code") || [])
    .find((c) => c?.sourceNode && c?.sourcePort);
  if (!connection) {
    return undefined;
  }
  const source = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(connection.sourceNode)
    : null;
  if (!source || (source.type !== "smoothGraph" && source.type !== "stepGraph")) {
    return undefined;
  }
  return serializeNodeGraphCurveToCodeText(source.graph);
}

function nodeGraphCodeBoxEffectiveText(patchNode) {
  if (!patchNode) {
    return CODE_BOX_DEFAULT_LOCAL_TEXT;
  }
  const store = normalizeNodeGraphCodeBox(patchNode.codeBox);
  if (nodeGraphCodeBoxIsCodeInConnected(patchNode.id)) {
    const incoming = nodeGraphCodeBoxIncomingText(patchNode.id);
    if (incoming !== undefined && String(incoming).trim() !== "") {
      return String(incoming);
    }
    // Bus empty (publish not run yet) — read the wired Graph object directly.
    const fromSource = nodeGraphCodeBoxSourceGraphText(patchNode.id);
    if (fromSource !== undefined) {
      return fromSource;
    }
  }
  return store.localText;
}

/** Parse Code-jack payload → normalized graph, or { ok:false, message }. */
function nodeGraphParseCodeGraphDocument(textOrValue) {
  let raw = textOrValue;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, message: "Empty document." };
    }
    try {
      raw = JSON.parse(trimmed);
    } catch (error) {
      return { ok: false, message: `Invalid JSON: ${error?.message || "parse error"}` };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Document must be a JSON object ({ cursorX, nodes })." };
  }
  // Allow optional version tag; ignore unknown keys after normalize.
  const candidate = {
    cursorX: raw.cursorX,
    nodes: raw.nodes,
  };
  if (!Array.isArray(candidate.nodes)) {
    return { ok: false, message: "Missing nodes array." };
  }
  if (candidate.nodes.length < 2) {
    return { ok: false, message: "Need at least 2 points in nodes." };
  }
  if (typeof normalizeNodeGraphGraph !== "function") {
    return { ok: false, message: "Graph normalize unavailable." };
  }
  const graph = normalizeNodeGraphGraph(candidate);
  if (!Array.isArray(graph?.nodes) || graph.nodes.length < 2) {
    return { ok: false, message: "Normalize produced fewer than 2 points." };
  }
  return { ok: true, graph, message: "ok" };
}

function commitNodeGraphCodeBoxLocalText(nodeId, localText, status = "Code local text") {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("codeBox")) {
    return { ok: false, message: "Scripts not ready." };
  }
  if (!nodeId || (typeof nodeGraphMvp !== "undefined" && !nodeGraphMvp.activeNodes?.has?.(nodeId))) {
    return { ok: false, message: "Module not active." };
  }
  if (nodeGraphCodeBoxIsCodeInConnected(nodeId)) {
    return { ok: false, message: "Code in connected — local Apply disabled." };
  }
  const parsed = nodeGraphParseCodeGraphDocument(localText);
  if (!parsed.ok) {
    return parsed;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((n) => n.id === nodeId);
  if (!patchNode) {
    return { ok: false, message: "Node missing." };
  }
  // Persist canonical JSON (what the object is), not whatever the user typed with junk keys.
  const canonical = serializeNodeGraphCurveToCodeText(parsed.graph);
  patchNode.codeBox = normalizeNodeGraphCodeBox({ localText: canonical });
  commitNodeGraphPatch(patch, { status, record: true });
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(nodeId, "Code", canonical);
  }
  return { ok: true, graph: parsed.graph, message: "ok" };
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
  if (hint && !hint.dataset.stickyError) {
    hint.textContent = driven
      ? "Code in connected — display follows cable; disconnect restores saved document."
      : "JSON graph document ({ cursorX, nodes:[{x,y,c,shape}] }). Apply validates, then publishes Code out.";
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
  area.setAttribute("aria-label", "Graph JSON document");

  const hint = document.createElement("div");
  hint.className = "node-code-box-hint";

  const apply = () => {
    if (area.readOnly) {
      return;
    }
    const result = commitNodeGraphCodeBoxLocalText(nodeId, area.value, "Code Apply");
    if (hint) {
      if (result?.ok) {
        delete hint.dataset.stickyError;
        hint.textContent = "Applied — Code out updated.";
      } else {
        hint.dataset.stickyError = "1";
        hint.textContent = result?.message || "Apply failed.";
      }
    }
    syncNodeGraphCodeBoxFace(face, nodeId);
  };

  applyBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    apply();
  });
  area.addEventListener("pointerdown", (e) => e.stopPropagation());
  area.addEventListener("input", () => {
    if (hint?.dataset.stickyError) {
      delete hint.dataset.stickyError;
    }
  });
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
    const parsed = nodeGraphParseCodeGraphDocument(text);
    if (!parsed.ok) continue;
    if (typeof cloneNodeGraphPatch !== "function" || typeof commitNodeGraphPatch !== "function") continue;
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    const node = patch.nodes.find((n) => n.id === patchNode.id);
    if (!node) continue;
    node.graph = parsed.graph;
    node.ui = { ...(node.ui || {}), codeDriven: true, codeDrivenFingerprint: text };
    commitNodeGraphPatch(patch, { status: "Graph Code in", record: false });
  }
}

function publishNodeGraphGraphCodeOutputs() {
  if (typeof nodeGraphMvp === "undefined" || typeof writeNodeGraphDataOutput !== "function") return;
  for (const patchNode of nodeGraphMvp.patch?.nodes || []) {
    if (!patchNode || (patchNode.type !== "smoothGraph" && patchNode.type !== "stepGraph")) continue;
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

function nodeGraphCodeBoxStartSurfaceSync() {
  if (nodeGraphCodeBoxStartSurfaceSync.started) {
    return;
  }
  nodeGraphCodeBoxStartSurfaceSync.started = true;
  if (typeof addNodeGraphModuleScopeSnapshotListener === "function") {
    addNodeGraphModuleScopeSnapshotListener(syncAllNodeGraphCodeSurfaces);
  }
  setInterval(syncAllNodeGraphCodeSurfaces, 250);
  // Prime bus + faces once scripts are up.
  try {
    syncAllNodeGraphCodeSurfaces();
  } catch (_error) {
    // First tick is best-effort.
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", nodeGraphCodeBoxStartSurfaceSync);
  } else {
    nodeGraphCodeBoxStartSurfaceSync();
  }
}
