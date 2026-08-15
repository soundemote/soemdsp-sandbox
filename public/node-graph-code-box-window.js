// Floating Code Box window — peeled from node-graph-code-screen.js
// (docs/GRAPHIFY_WINS_PLAN.md Track 1.1). Satellite-loaded with Code Screen UI.
// Depends on code-screen kinds/helpers from node-graph-code-screen.js.

const nodeGraphCodeBoxWindowDefaultSize = Object.freeze({
  width: 360,
  height: 520,
  minWidth: 220,
  maxWidth: 720,
  minHeight: 220,
  maxHeight: 820,
});

let nodeGraphCodeBoxWindowPortsApplyTimer = 0;
let nodeGraphCodeBoxWindowTitleApplyTimer = 0;

function normalizeNodeGraphCodeBoxWindowSize(size = {}) {
  return normalizeNodeGraphFloatingWindowSize(size, nodeGraphCodeBoxWindowDefaultSize);
}

function applyNodeGraphCodeBoxWindowSize(size = nodeGraphMvp.codeBoxWindowSize) {
  const win = document.getElementById("nodeCodeBoxWindow");
  const normalized = normalizeNodeGraphCodeBoxWindowSize(size || nodeGraphCodeBoxWindowDefaultSize);
  nodeGraphMvp.codeBoxWindowSize = normalized;
  if (win) {
    applyNodeGraphFloatingWindowSizeVars(win, "node-code-box-window", nodeGraphCodeBoxWindowDefaultSize, normalized);
  }
  return normalized;
}

function nodeGraphCodeBoxWindowNode() {
  const explicit = nodeGraphPatchNode(nodeGraphMvp.codeBoxWindowTargetNodeId);
  if (explicit && Object.hasOwn(nodeGraphCodeScreenCodeBoxKinds, explicit.type)) {
    return explicit;
  }
  const selected = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (selected && Object.hasOwn(nodeGraphCodeScreenCodeBoxKinds, selected.type)) {
    return selected;
  }
  return nodeGraphCodeScreenCodeblockNodes()[0] || null;
}

function nodeGraphCodeBoxDraftFromWindow(node) {
  if (!node) {
    return null;
  }
  const kind = nodeGraphCodeScreenKindForNode(node);
  const current = kind.normalize(node[kind.property]);
  return kind.normalize({
    ...current,
    inputs: document.getElementById("nodeCodeBoxInputs")?.value ?? current.inputs,
    outputs: kind.nodeType === "customDisplay" ? [] : (document.getElementById("nodeCodeBoxOutputs")?.value ?? current.outputs),
    code: document.getElementById("nodeCodeBoxSource")?.value ?? current.code,
  });
}

function nodeGraphCodeBoxPortListsEqual(a = [], b = []) {
  if ((a || []).length !== (b || []).length) {
    return false;
  }
  return (a || []).every((port, index) => port === (b || [])[index]);
}

function normalizeNodeGraphCodeWidgetLanguage(value) {
  const language = String(value || "").trim().toLowerCase().split(/\s+/)[0] || "text";
  const aliases = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    md: "markdown",
    markdown: "markdown",
    json: "json",
    jsonc: "jsonc",
    html: "markup",
    htm: "markup",
    xml: "markup",
    css: "css",
    ps: "powershell",
    ps1: "powershell",
    pwsh: "powershell",
    powershell: "powershell",
    sh: "shell",
    bash: "shell",
    shell: "shell",
    text: "text",
    txt: "text",
    plain: "text",
  };
  return aliases[language] || language;
}

function highlightNodeGraphCodeWidgetMarkdownLine(line = "") {
  return nodeGraphCodeScreenEscapeHtml(line)
    .replace(/(\/\*.*?\*\/)/g, '<span class="node-code-widget-comment">$1</span>')
    .replace(/(^|\s)(\/\/.*)$/g, '$1<span class="node-code-widget-comment">$2</span>')
    .replace(/(`[^`]+`)/g, '<span class="node-code-widget-string">$1</span>')
    .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="node-code-widget-literal">$1</span>')
    .replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="node-code-widget-keyword">$1</span>');
}

function highlightNodeGraphCodeWidgetCodeLine(line = "", language = "javascript") {
  const normalizedLanguage = normalizeNodeGraphCodeWidgetLanguage(language);
  let rendered = nodeGraphCodeScreenEscapeHtml(line);

  if (normalizedLanguage === "markdown") {
    return highlightNodeGraphCodeWidgetMarkdownLine(line);
  }

  if (["json", "jsonc"].includes(normalizedLanguage)) {
    return rendered
      .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="node-code-widget-key">$1</span>$2')
      .replace(/(&quot;[^&]*?&quot;)/g, '<span class="node-code-widget-string">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="node-code-widget-literal">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="node-code-widget-number">$1</span>')
      .replace(/(\/\/.*)$/g, '<span class="node-code-widget-comment">$1</span>');
  }

  if (normalizedLanguage === "markup") {
    return rendered
      .replace(/(&lt;!--.*?--&gt;)/g, '<span class="node-code-widget-comment">$1</span>')
      .replace(/(&lt;\/?[\w:-]+|\/?&gt;)/g, '<span class="node-code-widget-keyword">$1</span>')
      .replace(/([\w:-]+)(=)/g, '<span class="node-code-widget-key">$1</span>$2')
      .replace(/(&quot;[^&]*?&quot;|'[^']*')/g, '<span class="node-code-widget-string">$1</span>');
  }

  if (normalizedLanguage === "css") {
    return rendered
      .replace(/(\/\*.*?\*\/)/g, '<span class="node-code-widget-comment">$1</span>')
      .replace(/([a-z-]+)(\s*:)/gi, '<span class="node-code-widget-key">$1</span>$2')
      .replace(/(#[0-9a-f]{3,8}\b)/gi, '<span class="node-code-widget-number">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*')/g, '<span class="node-code-widget-string">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)?)\b/g, '<span class="node-code-widget-number">$1</span>');
  }

  if (["powershell", "shell"].includes(normalizedLanguage)) {
    return rendered
      .replace(/(&quot;[^&]*?&quot;|'[^']*')/g, '<span class="node-code-widget-string">$1</span>')
      .replace(/(\$[\w:]+)/g, '<span class="node-code-widget-literal">$1</span>')
      .replace(/\b(function|param|if|else|elseif|foreach|for|while|return|try|catch|finally)\b/gi, '<span class="node-code-widget-keyword">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="node-code-widget-number">$1</span>')
      .replace(/(#.*)$/g, '<span class="node-code-widget-comment">$1</span>');
  }

  return rendered
    .replace(/(&quot;[^&]*?&quot;|'[^']*'|`[^`]*`)/g, '<span class="node-code-widget-string">$1</span>')
    .replace(/\b(function|return|const|let|var|if|else|for|while|class|async|await|import|export|from|new|try|catch|finally|throw)\b/g, '<span class="node-code-widget-keyword">$1</span>')
    .replace(/\b(true|false|null|undefined)\b/g, '<span class="node-code-widget-literal">$1</span>')
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="node-code-widget-number">$1</span>')
    .replace(/([A-Za-z_$][\w$]*)(\s*:)/g, '<span class="node-code-widget-key">$1</span>$2')
    .replace(/(\/\/.*|#.*)$/g, '<span class="node-code-widget-comment">$1</span>');
}

function renderNodeGraphCodeWidgetHighlight(source = "", language = "javascript") {
  const normalizedLanguage = normalizeNodeGraphCodeWidgetLanguage(language);
  const lines = String(source || "").split("\n");
  return lines
    .map((line) => highlightNodeGraphCodeWidgetCodeLine(line, normalizedLanguage) || "&nbsp;")
    .join("\n") || "&nbsp;";
}

function updateNodeGraphCodeBoxWindowEditorChrome() {
  const source = document.getElementById("nodeCodeBoxSource");
  const highlight = document.getElementById("nodeCodeBoxHighlight");
  const lineNumbers = document.getElementById("nodeCodeBoxLineNumbers");
  if (!source || !lineNumbers) {
    return;
  }
  const lines = String(source.value || "").split("\n");
  if (highlight) {
    highlight.replaceChildren();
    highlight.hidden = true;
  }
  lineNumbers.textContent = lines.map((_, index) => index + 1).join("\n") || "1";
  lineNumbers.scrollTop = source.scrollTop;
}

function handleNodeGraphCodeBoxWindowSourceInput() {
  updateNodeGraphCodeBoxWindowEditorChrome();
  updateNodeGraphCodeBoxWindowStatus();
}

function applyNodeGraphCodeBoxWindowTitle({ sync = true } = {}) {
  if (nodeGraphCodeBoxWindowTitleApplyTimer) {
    window.clearTimeout(nodeGraphCodeBoxWindowTitleApplyTimer);
    nodeGraphCodeBoxWindowTitleApplyTimer = 0;
  }
  const node = nodeGraphCodeBoxWindowNode();
  const input = document.getElementById("nodeCodeBoxTitle");
  if (!node || !input || typeof commitNodeGraphModuleTitleFromHeaderInput !== "function") {
    return;
  }
  const nextAlias = normalizeNodeGraphPatchNodeAlias(input.value);
  if (nextAlias === normalizeNodeGraphPatchNodeAlias(node.alias)) {
    return;
  }
  const selectionStart = input.selectionStart ?? null;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  commitNodeGraphModuleTitleFromHeaderInput(node.id, input.value);
  if (!sync) {
    return;
  }
  syncNodeGraphCodeBoxWindow();
  if (document.activeElement === input && selectionStart !== null) {
    input.setSelectionRange?.(selectionStart, selectionEnd);
  }
}

function scheduleNodeGraphCodeBoxWindowTitleApply() {
  updateNodeGraphCodeBoxWindowStatus();
  if (nodeGraphCodeBoxWindowTitleApplyTimer) {
    window.clearTimeout(nodeGraphCodeBoxWindowTitleApplyTimer);
  }
  nodeGraphCodeBoxWindowTitleApplyTimer = window.setTimeout(() => {
    nodeGraphCodeBoxWindowTitleApplyTimer = 0;
    applyNodeGraphCodeBoxWindowTitle();
  }, 350);
}

function syncNodeGraphCodeBoxWindow() {
  const win = document.getElementById("nodeCodeBoxWindow");
  if (!win) {
    return;
  }
  const node = nodeGraphCodeBoxWindowNode();
  const titleInput = document.getElementById("nodeCodeBoxTitle");
  const inputs = document.getElementById("nodeCodeBoxInputs");
  const outputs = document.getElementById("nodeCodeBoxOutputs");
  const source = document.getElementById("nodeCodeBoxSource");
  const status = document.getElementById("nodeCodeBoxStatus");
  const title = win.querySelector(".scene-context-title");
  if (!node) {
    if (title) {
      title.innerHTML = "<span>CODE</span><small>Box</small>";
    }
    for (const element of [titleInput, inputs, outputs, source]) {
      if (element) {
        element.value = "";
        element.disabled = true;
      }
    }
    if (status) {
      status.textContent = "select a Code Box";
      status.className = "error";
    }
    updateNodeGraphCodeBoxWindowEditorChrome();
    return;
  }
  nodeGraphMvp.codeBoxWindowTargetNodeId = node.id;
  const kind = nodeGraphCodeScreenKindForNode(node);
  const codeBox = kind.normalize(node[kind.property]);
  const compile = kind.compileStatus(codeBox);
  if (title) {
    title.innerHTML = `<span>CODE</span><small>${nodeGraphCodeScreenEscapeHtml(kind.label)}</small>`;
  }
  if (titleInput && document.activeElement !== titleInput) {
    titleInput.disabled = false;
    titleInput.value = nodeGraphPatchNodeTitle(node) || "";
  }
  if (inputs && document.activeElement !== inputs) {
    inputs.disabled = false;
    inputs.value = codeBox.inputs.join(", ");
  }
  if (outputs && document.activeElement !== outputs) {
    outputs.disabled = kind.nodeType === "customDisplay";
    outputs.value = codeBox.outputs.join(", ");
    outputs.placeholder = kind.nodeType === "customDisplay" ? "display only" : "";
  }
  if (source && document.activeElement !== source) {
    source.disabled = false;
    source.value = codeBox.code;
  }
  updateNodeGraphCodeBoxWindowEditorChrome();
  if (status) {
    status.textContent = compile.ok ? "code ok" : `compile error: ${compile.message}`;
    status.className = compile.ok ? "ok" : "error";
  }
}

function setNodeGraphCodeBoxWindowVisible(visible, nodeId = "", point = null) {
  const win = document.getElementById("nodeCodeBoxWindow");
  if (!win) {
    return false;
  }
  if (nodeId) {
    nodeGraphMvp.codeBoxWindowTargetNodeId = nodeId;
  }
  const wasVisible = !win.hidden;
  win.hidden = !visible;
  applyNodeGraphCodeBoxWindowSize(nodeGraphMvp.workspaceWindowStates?.codeBox?.size || nodeGraphMvp.codeBoxWindowSize);
  if (visible) {
    syncNodeGraphCodeBoxWindow();
    const saved = nodeGraphMvp.workspaceWindowStates?.codeBox?.position;
    if (saved) {
      positionNodeSceneContextMenu(win, saved.left, saved.top, true);
    } else if (point) {
      positionNodeSceneContextMenu(win, point.x ?? point.clientX ?? 120, point.y ?? point.clientY ?? 120, true);
    } else if (!wasVisible) {
      positionNodeSceneContextMenu(win, 120, 120, true);
    }
    if (wasVisible) {
      pulseNodeGraphFloatingWindowAttention(win);
    }
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("codeBox", win, { open: visible }, { status: false });
  }
  return true;
}

function closeNodeGraphCodeBoxWindow() {
  const win = document.getElementById("nodeCodeBoxWindow");
  if (win) {
    win.hidden = true;
  }
  nodeGraphMvp.codeBoxWindowDragging = null;
  nodeGraphMvp.codeBoxWindowResizing = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("codeBox", win, { open: false }, { status: false });
  }
}

function openNodeGraphCodeBoxWindowForNode(nodeId = "", point = null) {
  const node = nodeGraphPatchNode(nodeId || nodeGraphModuleActionTargetNodeId());
  if (!node || !Object.hasOwn(nodeGraphCodeScreenCodeBoxKinds, node.type)) {
    return false;
  }
  nodeGraphMvp.codeBoxWindowTargetNodeId = node.id;
  setNodeGraphNodeSelection([node.id]);
  return setNodeGraphCodeBoxWindowVisible(true, node.id, point);
}

function openNodeGraphCodeBoxWindowFromHeader() {
  const selected = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (selected && Object.hasOwn(nodeGraphCodeScreenCodeBoxKinds, selected.type)) {
    openNodeGraphCodeBoxWindowForNode(selected.id);
    return;
  }
  const existing = nodeGraphCodeScreenCodeblockNodes()[0];
  if (existing) {
    openNodeGraphCodeBoxWindowForNode(existing.id);
    return;
  }
  const nodeId = showNodeGraphModule("codeblock", null, { status: "debug codeblock added" });
  if (nodeId) {
    openNodeGraphCodeBoxWindowForNode(nodeId);
  }
}

function applyNodeGraphCodeBoxWindowPorts() {
  if (nodeGraphCodeBoxWindowPortsApplyTimer) {
    window.clearTimeout(nodeGraphCodeBoxWindowPortsApplyTimer);
    nodeGraphCodeBoxWindowPortsApplyTimer = 0;
  }
  const sourceNode = nodeGraphCodeBoxWindowNode();
  if (!sourceNode) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(sourceNode);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const current = kind.normalize(targetNode[kind.property]);
  const next = kind.normalize({
    ...current,
    inputs: document.getElementById("nodeCodeBoxInputs")?.value,
    outputs: document.getElementById("nodeCodeBoxOutputs")?.value,
  });
  if (
    nodeGraphCodeBoxPortListsEqual(current.inputs, next.inputs) &&
    nodeGraphCodeBoxPortListsEqual(current.outputs, next.outputs)
  ) {
    updateNodeGraphCodeBoxWindowStatus();
    return;
  }
  targetNode[kind.property] = next;
  kind.pruneConnections(patch, targetNode.id, next.inputs, next.outputs);
  commitNodeGraphPatch(patch, { status: `code box ${kind.label.toLowerCase()} ports changed` });
  syncNodeGraphCodeBoxWindow();
}

function scheduleNodeGraphCodeBoxWindowPortsApply() {
  updateNodeGraphCodeBoxWindowStatus();
  if (nodeGraphCodeBoxWindowPortsApplyTimer) {
    window.clearTimeout(nodeGraphCodeBoxWindowPortsApplyTimer);
  }
  nodeGraphCodeBoxWindowPortsApplyTimer = window.setTimeout(() => {
    nodeGraphCodeBoxWindowPortsApplyTimer = 0;
    applyNodeGraphCodeBoxWindowPorts();
  }, 350);
}

function applyNodeGraphCodeBoxWindowCode() {
  applyNodeGraphCodeBoxWindowTitle({ sync: false });
  const sourceNode = nodeGraphCodeBoxWindowNode();
  if (!sourceNode) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(sourceNode);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const next = nodeGraphCodeBoxDraftFromWindow(sourceNode);
  targetNode[kind.property] = next;
  kind.pruneConnections(patch, targetNode.id, next.inputs, next.outputs);
  const compile = kind.compileStatus(next);
  commitNodeGraphPatch(patch, {
    status: compile.ok ? `code box ${kind.label.toLowerCase()} changed` : "code box compile error",
  });
  syncNodeGraphCodeBoxWindow();
}

function updateNodeGraphCodeBoxWindowStatus() {
  const node = nodeGraphCodeBoxWindowNode();
  const status = document.getElementById("nodeCodeBoxStatus");
  if (!node || !status) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(node);
  const draft = nodeGraphCodeBoxDraftFromWindow(node);
  const compile = kind.compileStatus(draft);
  status.textContent = compile.ok ? "draft ok" : `compile error: ${compile.message}`;
  status.className = compile.ok ? "changed" : "error";
}

function openNodeGraphCodeBoxWindowFullScreen() {
  const button = document.getElementById("nodeCodeBoxOpenFullScreen");
  if (button?.disabled || button?.getAttribute("aria-disabled") === "true") {
    return;
  }
  const node = nodeGraphCodeBoxWindowNode();
  if (node) {
    nodeGraphMvp.codeScreenSelectedNodeId = node.id;
  }
  nodeGraphMvp.codeScreenSection = "codeblocks";
  setNodeGraphViewMode("code");
}

function beginNodeGraphCodeBoxWindowDrag(event) {
  const win = document.getElementById("nodeCodeBoxWindow");
  if (!win || win.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, win, "codeBoxWindowDragging");
}

function dragNodeGraphCodeBoxWindow(event) {
  const win = document.getElementById("nodeCodeBoxWindow");
  dragNodeGraphFloatingWindow(event, "codeBoxWindowDragging", win, (next) => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("codeBox", win, { open: true, position: next }, { persist: false });
    }
  });
}

function endNodeGraphCodeBoxWindowDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "codeBoxWindowDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("codeBox", document.getElementById("nodeCodeBoxWindow"), { open: true }, { status: false });
    }
  });
}

function beginNodeGraphCodeBoxWindowResize(event) {
  beginNodeGraphFloatingWindowResize(event, document.getElementById("nodeCodeBoxWindow"), "codeBoxWindowResizing");
}

function dragNodeGraphCodeBoxWindowResize(event) {
  dragNodeGraphFloatingWindowResize(event, "codeBoxWindowResizing", applyNodeGraphCodeBoxWindowSize);
}

function endNodeGraphCodeBoxWindowResize(event) {
  endNodeGraphFloatingWindowResize(event, "codeBoxWindowResizing", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("codeBox", document.getElementById("nodeCodeBoxWindow"), {
        open: true,
        size: normalizeNodeGraphCodeBoxWindowSize(nodeGraphMvp.codeBoxWindowSize),
      }, { status: false });
    }
  });
}

