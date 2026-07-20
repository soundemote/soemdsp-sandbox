// Codeblock is one of a few different node types that share the same
// {code, inputs, outputs} normalized shape and {ok, message} compile-status
// shape (see customDisplay below) but have their own storage property,
// compile helpers, and execution model. Rather than a parallel copy of
// list/editor/draft/apply rendering code per type (which would immediately
// start drifting between them -- see the groupOutput reachability bug and
// Wall Delay's "generic check against declared ports instead of a
// hardcoded list" fix, both from this same session, both exactly this
// failure mode), every rendering/draft/apply function below is
// parameterized by this descriptor, keyed by node.type, instead.
const nodeGraphCodeScreenCodeBoxKinds = Object.freeze({
  codeblock: {
    nodeType: "codeblock",
    property: "codeblock",
    label: "Codeblock",
    kindLabelPlural: "codeblocks",
    normalize: (value) => normalizeNodeGraphCodeblock(value),
    compileStatus: (value) => nodeGraphCodeblockCompileStatus(value),
    pruneConnections: (patch, nodeId, inputs, outputs) =>
      pruneNodeGraphConnectionsForCodeblockPortChange(patch, nodeId, inputs, outputs),
    contextHint: "state, time, dt, sampleRate, frame, frames in scope -- runs per sample in the audio thread.",
    emptyStateMessage: "No Codeblock modules exist in this patch yet. Codeblocks stay in-circuit as debug utilities; the Code Screen is where they become easier to find and edit.",
    createLabel: "New Debug Codeblock",
    createFn: () => createNodeGraphCodeScreenDebugCodeblock(),
  },
  customDisplay: {
    nodeType: "customDisplay",
    property: "customDisplay",
    label: "Custom Display",
    kindLabelPlural: "custom displays",
    normalize: (value) => normalizeNodeGraphCustomDisplay(value),
    compileStatus: (value) => nodeGraphCustomDisplayCompileStatus(value),
    pruneConnections: (patch, nodeId, inputs) =>
      pruneNodeGraphConnectionsForCodeblockPortChange(patch, nodeId, inputs, []),
    contextHint: "Define function draw(api). api has ctx, width, height, inputs, time, frame, pixelRatio, helpers, and node.",
    emptyStateMessage: "No Custom Display modules exist in this patch yet. Custom Displays draw directly inside their module face from wired input buffers.",
    createLabel: "New Custom Display",
    createFn: () => {
      const nodeId = showNodeGraphModule("customDisplay", null, { status: "custom display added" });
      if (nodeId) {
        openNodeGraphCodeBoxWindowForNode(nodeId);
      }
    },
  },
});

function nodeGraphCodeScreenKindForNode(node) {
  return nodeGraphCodeScreenCodeBoxKinds[node?.type] || nodeGraphCodeScreenCodeBoxKinds.codeblock;
}

const nodeGraphCodeScreenSections = Object.freeze([
  {
    id: "codeblocks",
    title: "Code Boxes",
    eyebrow: "Code Boxes",
    summary: "Central editing for Codeblock modules.",
  },
  {
    id: "helpers",
    title: "Helper Namespaces",
    eyebrow: "Helpers",
    summary: "Discover the code-friendly commands that can grow into the sandbox API.",
  },
  {
    id: "snippets",
    title: "Snippet Library",
    eyebrow: "Snippets",
    summary: "Save repeatable code pieces that stay searchable in helper discovery.",
  },
  {
    id: "script",
    title: "Workspace Script",
    eyebrow: "Script",
    summary: "Patch-local code notes and helper calls for UI, events, samples, and game hooks.",
  },
  {
    id: "ui",
    title: "Code-Friendly UI Settings",
    eyebrow: "UI",
    summary: "Schema-backed UI settings for things that are easier to describe in code.",
  },
  {
    id: "samples",
    title: "Sample Registry",
    eyebrow: "Samples",
    summary: "Patch-local sample metadata. Runtime loading is intentionally deferred.",
  },
  {
    id: "patchTools",
    title: "Patch Tools",
    eyebrow: "Patch Tools",
    summary: "Future graph utilities and patch manipulation helpers.",
  },
]);

const nodeGraphCodeScreenRegistryTemplates = Object.freeze({
  helpers: [
    {
      label: "Code Snippet",
      value: {
        category: "saved snippet",
        description: "Reusable code snippet saved in this patch.",
        id: "code-snippet",
        language: "javascript",
        name: "Code Snippet",
        namespace: "snippet",
        signature: "snippet.saved()",
        source: "ui.set(\"target\", \"value\")",
        tags: "ui reusable",
      },
    },
    {
      label: "Math Helper",
      value: {
        category: "patch helper",
        description: "Patch-local helper draft for reusable code.",
        id: "math-helper",
        language: "javascript",
        name: "Math Helper",
        namespace: "patch",
        signature: "patch.helper(value)",
        source: "return value;",
        tags: "math helper",
      },
    },
  ],
  patchTools: [
    {
      label: "Find Output Modules",
      value: {
        description: "Future patch utility for finding output-style modules.",
        id: "find-output-modules",
        name: "Find Output Modules",
        target: "patch.findNodes({ type: \"output\" })",
      },
    },
  ],
  samples: [
    {
      label: "Teleport Sample",
      value: {
        description: "Reserved sample metadata for teleport sound design.",
        id: "teleport",
        name: "Teleport",
        path: "samples/teleport.wav",
      },
    },
  ],
  ui: [
    {
      label: "Screen Background",
      value: {
        description: "Future code-side screen background setting.",
        id: "screen-background",
        name: "Screen Background",
        target: "screen.background",
        value: "#000000",
      },
    },
  ],
});

function nodeGraphCodeScreenCurrentSection() {
  return nodeGraphCodeScreenSections.some((section) => section.id === nodeGraphMvp.codeScreenSection)
    ? nodeGraphMvp.codeScreenSection
    : "codeblocks";
}

function nodeGraphCodeScreenCodeblockNodes() {
  return nodeGraphMvp.patch.nodes.filter((node) =>
    Object.hasOwn(nodeGraphCodeScreenCodeBoxKinds, node.type));
}

function nodeGraphCodeScreenCodeblockSearchText(node) {
  const kind = nodeGraphCodeScreenKindForNode(node);
  const codeblock = kind.normalize(node[kind.property]);
  const status = kind.compileStatus(codeblock);
  return [
    node.id,
    nodeGraphPatchNodeTitle(node),
    kind.label,
    codeblock.inputs.join(" "),
    codeblock.outputs.join(" "),
    codeblock.code,
    status.ok ? "code ok" : `compile error ${status.message}`,
  ].join(" ").toLowerCase();
}

function nodeGraphCodeScreenFilteredCodeblockNodes() {
  const query = String(nodeGraphMvp.codeScreenCodeblockSearch || "").trim().toLowerCase();
  const codeblocks = nodeGraphCodeScreenCodeblockNodes();
  if (!query) {
    return codeblocks;
  }
  return codeblocks.filter((node) => nodeGraphCodeScreenCodeblockSearchText(node).includes(query));
}

function nodeGraphCodeScreenSelectedCodeblock() {
  const codeblocks = nodeGraphCodeScreenCodeblockNodes();
  const selected = codeblocks.find((node) => node.id === nodeGraphMvp.codeScreenSelectedNodeId);
  const filtered = nodeGraphCodeScreenFilteredCodeblockNodes();
  if (selected && (!nodeGraphMvp.codeScreenCodeblockSearch || filtered.some((node) => node.id === selected.id))) {
    return selected;
  }
  const fallback = filtered[0] || codeblocks[0] || null;
  nodeGraphMvp.codeScreenSelectedNodeId = fallback?.id || "";
  return fallback;
}

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
  if (!source || !highlight || !lineNumbers) {
    return;
  }
  const lines = String(source.value || "").split("\n");
  highlight.innerHTML = renderNodeGraphCodeWidgetHighlight(source.value || "", "javascript");
  lineNumbers.textContent = lines.map((_, index) => index + 1).join("\n") || "1";
  highlight.scrollTop = source.scrollTop;
  highlight.scrollLeft = source.scrollLeft;
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

function nodeGraphCodeScreenEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeGraphCodeScreenPreviewText(value, maxLength = 120) {
  const compact = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function nodeGraphCodeScreenSourceStatsText(value) {
  const source = String(value ?? "");
  const trimmed = source.trim();
  const lines = trimmed ? source.split(/\r?\n/).length : 0;
  const chars = source.length;
  return `${lines} ${lines === 1 ? "line" : "lines"} · ${chars} ${chars === 1 ? "char" : "chars"}`;
}

function nodeGraphCodeScreenMarkdownLanguage(value = "javascript") {
  return normalizeNodeGraphCodeScreenLanguage(value || "javascript");
}

function nodeGraphCodeScreenMarkdownFence(source, language = "javascript") {
  const text = String(source || "").trim();
  const fence = text.includes("```") ? "````" : "```";
  return `${fence}${nodeGraphCodeScreenMarkdownLanguage(language)}\n${text}\n${fence}`;
}

function nodeGraphCodeScreenBuildSummaryMarkdownFor(summary) {
  if (!summary) {
    return "No build summary yet.";
  }
  const lines = [
    `${summary.total || 0} staged / ${summary.applied || 0} applied`,
    `mode: ${summary.mode || "script"}`,
    `status: ${summary.status || "ok"}`,
    `saved: ${summary.persisted ? "yes" : "no"}`,
  ];
  if (summary.error) {
    lines.push(`error: ${summary.error}`);
  }
  if (summary.tests?.total) {
    lines.push(`tests: ${summary.tests.passed}/${summary.tests.total} passed`);
    for (const test of summary.tests.items || []) {
      lines.push(`- ${test.ok ? "PASS" : "FAIL"} ${test.name}`);
    }
  }
  for (const [key, count] of Object.entries(summary.counts || {})) {
    const preview = (summary.previews?.[key] || []).join(", ") || "none";
    lines.push(`${key}: ${count} (${preview})`);
  }
  return lines.join("\n");
}

function nodeGraphCodeScreenBuildSummaryMarkdown() {
  return nodeGraphCodeScreenBuildSummaryMarkdownFor(nodeGraphMvp.codeScreenWorkspaceBuildSummary);
}

function nodeGraphCodeScreenWorkspaceDebugReportMarkdown() {
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource")?.value ?? codeScreen.script;
  const language = nodeGraphCodeScreenWorkspaceScriptLanguage();
  const consoleText = String(nodeGraphMvp.codeScreenWorkspaceConsole || "console ready").trim();
  return [
    "# Code Screen Debug Report",
    "",
    "## Workspace Script",
    "",
    nodeGraphCodeScreenMarkdownFence(source || "", language),
    "",
    "## Build Summary",
    "",
    nodeGraphCodeScreenMarkdownFence(nodeGraphCodeScreenBuildSummaryMarkdown(), "text"),
    "",
    "## Variable Watch",
    "",
    nodeGraphCodeScreenWorkspaceWatchMarkdown() || "No watched values.",
    "",
    "## Script Console",
    "",
    nodeGraphCodeScreenMarkdownFence(consoleText || "console ready", "text"),
  ].join("\n");
}

function selectNodeGraphCodeScreenCopyFallback(text) {
  document.getElementById("nodeCodeScreenCopyFallback")?.remove();
  const fallback = document.createElement("textarea");
  fallback.id = "nodeCodeScreenCopyFallback";
  fallback.value = String(text || "");
  fallback.setAttribute("readonly", "");
  fallback.spellcheck = false;
  fallback.style.position = "fixed";
  fallback.style.right = "12px";
  fallback.style.bottom = "12px";
  fallback.style.width = "360px";
  fallback.style.height = "120px";
  fallback.style.zIndex = "9999";
  fallback.style.background = "#05090b";
  fallback.style.color = "#d8f7ff";
  fallback.style.border = "1px solid #67d6ff";
  document.body.append(fallback);
  fallback.focus();
  fallback.select();
  fallback.setSelectionRange(0, fallback.value.length);
}

function nodeGraphCodeScreenRegistryKeyForSection(sectionId) {
  return {
    helpers: "helpers",
    patchTools: "patchTools",
    samples: "samples",
    ui: "ui",
  }[sectionId] || "";
}

function nodeGraphCodeScreenSectionCount(sectionId) {
  if (sectionId === "codeblocks") {
    return nodeGraphCodeScreenCodeblockNodes().length;
  }
  if (sectionId === "snippets") {
    return nodeGraphCodeScreenSnippetItems().length;
  }
  if (sectionId === "script") {
    const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
    return codeScreen.script.trim()
      ? codeScreen.script.split(/\r?\n/).filter((line) => line.trim()).length
      : 0;
  }
  const key = nodeGraphCodeScreenRegistryKeyForSection(sectionId);
  if (!key) {
    return 0;
  }
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  return codeScreen[key]?.length || 0;
}

function createNodeGraphCodeScreenButton(section) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.codeScreenSection = section.id;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", section.id === nodeGraphCodeScreenCurrentSection() ? "true" : "false");
  const count = nodeGraphCodeScreenSectionCount(section.id);
  button.innerHTML = `
    <span>${section.eyebrow}</span>
    <strong>${section.title}</strong>
    <small>${section.summary}</small>
    <em>${count}</em>
  `;
  return button;
}

function updateNodeGraphCodeScreenLookupSummary() {
  const summary = document.getElementById("nodeCodeScreenLookupSummary");
  if (!summary) {
    return;
  }
  const helpers = nodeGraphCodeScreenAllHelpers()
    .filter((helper) => (helper.namespace || "").toLowerCase() !== "snippet").length;
  const snippets = nodeGraphCodeScreenSnippetItems().length;
  summary.textContent = `${helpers} helpers - ${snippets} snippets - find what to type, save what repeats`;
}

function updateNodeGraphCodeScreenLookupStatus(message, ok = true) {
  nodeGraphMvp.codeScreenLookupStatus = message;
  const status = document.getElementById("nodeCodeScreenLookupStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = `node-code-screen-lookup-status ${ok ? "ok" : "error"}`;
}

function nodeGraphCodeScreenLookupNamespaces() {
  return [...new Set(nodeGraphCodeScreenAllHelpers()
    .map((helper) => String(helper.namespace || "").trim())
    .filter((namespace) => namespace && namespace !== "snippet"))]
    .sort((left, right) => left.localeCompare(right));
}

function createNodeGraphCodeScreenLookupResult(item) {
  const row = document.createElement("div");
  row.className = "node-code-screen-lookup-result";
  const statusText = [item.category, item.availability].filter(Boolean).join(" - ");
  const detailText = [item.tags ? `tags: ${item.tags}` : "", statusText, item.description || item.snippet]
    .filter(Boolean)
    .join(" - ");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.codeScreenLookupSnippet = item.snippet;
  button.innerHTML = `
    <span>${nodeGraphCodeScreenEscapeHtml(item.kind)}</span>
    <strong>${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenPreviewText(item.label, 42))}</strong>
    <small>${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenPreviewText(detailText, 58))}</small>
  `;
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.dataset.codeScreenSaveLookupSnippet = item.snippet;
  saveButton.dataset.codeScreenSaveLookupDescription = item.description || `Reusable snippet saved from lookup: ${item.label}`;
  saveButton.textContent = "Save";
  const savePinButton = document.createElement("button");
  savePinButton.type = "button";
  savePinButton.dataset.codeScreenSavePinLookupSnippet = item.snippet;
  savePinButton.dataset.codeScreenSaveLookupDescription = item.description || `Reusable snippet saved from lookup: ${item.label}`;
  savePinButton.textContent = "Pin";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.codeScreenCopyLookupSnippet = item.snippet;
  copyButton.textContent = "Copy";
  const copyMarkdownButton = document.createElement("button");
  copyMarkdownButton.type = "button";
  copyMarkdownButton.dataset.codeScreenCopyMarkdownLookupSnippet = item.snippet;
  copyMarkdownButton.dataset.codeScreenCopyMarkdownLanguage = item.language || "javascript";
  copyMarkdownButton.textContent = "Copy Markdown";
  row.append(button, saveButton, savePinButton, copyButton, copyMarkdownButton);
  if (item.helperKey) {
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.dataset.codeScreenLookupHelperDetail = item.helperKey;
    detailButton.textContent = "Details";
    row.append(detailButton);
  }
  if (Number.isFinite(item.snippetIndex)) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.dataset.codeScreenEditLookupSnippet = String(item.snippetIndex);
    editButton.textContent = "Edit";
    row.append(editButton);
  }
  return row;
}

function createNodeGraphCodeScreenLookupHeading(label, detail = "") {
  const heading = document.createElement("div");
  heading.className = "node-code-screen-lookup-heading";
  heading.innerHTML = `
    <span>${nodeGraphCodeScreenEscapeHtml(label)}</span>
    ${detail ? `<small>${nodeGraphCodeScreenEscapeHtml(detail)}</small>` : ""}
  `;
  return heading;
}

function nodeGraphCodeScreenLookupTargetSummary() {
  const target = nodeGraphCodeScreenSnippetTarget();
  if (target === "codeblock") {
    const selected = nodeGraphCodeScreenSelectedCodeblock();
    return selected
      ? `inserts into ${nodeGraphPatchNodeTitle(selected)}`
      : "select a Codeblock to insert there";
  }
  return "inserts into Workspace Script";
}

function syncNodeGraphCodeScreenLookupTargetControls() {
  const current = nodeGraphCodeScreenSnippetTarget();
  for (const button of document.querySelectorAll("#nodeCodeScreenLookupTarget [data-code-screen-snippet-target]")) {
    const target = button.dataset.codeScreenSnippetTarget;
    const disabled = target === "codeblock" && !nodeGraphCodeScreenSelectedCodeblock();
    button.setAttribute("aria-pressed", target === current ? "true" : "false");
    button.disabled = disabled;
  }
  const summary = document.getElementById("nodeCodeScreenLookupTargetSummary");
  if (summary) {
    summary.textContent = nodeGraphCodeScreenLookupTargetSummary();
  }
}

function renderNodeGraphCodeScreenLookupShelf() {
  const input = document.getElementById("nodeCodeScreenLookupSearch");
  const namespaces = document.getElementById("nodeCodeScreenLookupNamespaces");
  const results = document.getElementById("nodeCodeScreenLookupResults");
  const status = document.getElementById("nodeCodeScreenLookupStatus");
  syncNodeGraphCodeScreenLookupTargetControls();
  if (input) {
    input.value = nodeGraphMvp.codeScreenLookupSearch || "";
  }
  if (namespaces) {
    const query = String(nodeGraphMvp.codeScreenLookupSearch || "").trim().toLowerCase();
    namespaces.replaceChildren();
    for (const namespace of nodeGraphCodeScreenLookupNamespaces()) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.codeScreenLookupNamespace = namespace;
      button.setAttribute("aria-pressed", query === `${namespace}.` ? "true" : "false");
      button.textContent = `${namespace}.`;
      namespaces.append(button);
    }
  }
  if (status) {
    const message = nodeGraphMvp.codeScreenLookupStatus || "ready";
    status.textContent = message;
    status.className = `node-code-screen-lookup-status ${message === "ready" ? "" : "ok"}`.trim();
  }
  if (!results) {
    return;
  }
  const query = String(nodeGraphMvp.codeScreenLookupSearch || "").trim();
  const items = nodeGraphCodeScreenLookupItems();
  results.replaceChildren();
  if (!query) {
    const recentHelpers = nodeGraphCodeScreenRecentHelperLookupItems();
    const recent = nodeGraphCodeScreenRecentSnippetLookupItems();
    const pinnedCount = recent.filter((item) => item.pinned).length;
    if (recentHelpers.length) {
      results.append(createNodeGraphCodeScreenLookupHeading("Recent Helpers", "Helpers you inserted in this Code Screen session."));
      for (const item of recentHelpers) {
        results.append(createNodeGraphCodeScreenLookupResult(item));
      }
    }
    const shelfLabel = pinnedCount ? "Pinned Snippets" : recent.length ? "Recent Snippets" : recentHelpers.length ? "" : "Lookup";
    const shelfDetail = recent.length
      ? "Use saved code again without leaving the editor."
      : "Search helper names, signatures, snippets, or descriptions.";
    if (shelfLabel) {
      results.append(createNodeGraphCodeScreenLookupHeading(shelfLabel, shelfDetail));
    }
    for (const item of recent) {
      results.append(createNodeGraphCodeScreenLookupResult(item));
    }
    return;
  }
  if (!items.length) {
    results.append(createNodeGraphCodeScreenLookupHeading("No Matches", "Try a namespace like ui. or save selected editor code as a snippet."));
    return;
  }
  const helperItems = items.filter((item) => !Number.isFinite(item.snippetIndex));
  const snippetItems = items.filter((item) => Number.isFinite(item.snippetIndex));
  if (helperItems.length) {
    results.append(createNodeGraphCodeScreenLookupHeading("Helpers", `${helperItems.length} matches`));
    for (const item of helperItems) {
      results.append(createNodeGraphCodeScreenLookupResult(item));
    }
  }
  if (snippetItems.length) {
    results.append(createNodeGraphCodeScreenLookupHeading("Snippets", `${snippetItems.length} saved matches`));
    for (const item of snippetItems) {
      results.append(createNodeGraphCodeScreenLookupResult(item));
    }
  }
}

function renderNodeGraphCodeScreenSections() {
  const list = document.getElementById("nodeCodeScreenSections");
  if (!list) {
    return;
  }
  list.replaceChildren(...nodeGraphCodeScreenSections.map(createNodeGraphCodeScreenButton));
  updateNodeGraphCodeScreenLookupSummary();
  renderNodeGraphCodeScreenLookupShelf();
}

function setNodeGraphCodeScreenHeading(section) {
  const eyebrow = document.getElementById("nodeCodeScreenEyebrow");
  const title = document.getElementById("nodeCodeScreenTitle");
  const status = document.getElementById("nodeCodeScreenStatus");
  if (eyebrow) eyebrow.textContent = section.eyebrow;
  if (title) title.textContent = section.title;
  if (status) status.textContent = section.summary;
}

function nodeGraphCodeScreenCreateEmptyState(message, actionText = "", action = null) {
  const empty = document.createElement("div");
  empty.className = "node-code-screen-empty";
  const text = document.createElement("p");
  text.textContent = message;
  empty.append(text);
  if (actionText && typeof action === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionText;
    button.addEventListener("click", action);
    empty.append(button);
  }
  return empty;
}

function renderNodeGraphCodeScreenCodeblocksLanding() {
  const landing = document.createElement("div");
  landing.className = "node-code-screen-empty node-code-screen-codeblocks-landing";
  const heading = document.createElement("h3");
  heading.textContent = "Write your first Code Box";
  const text = document.createElement("p");
  text.textContent =
    "Codeblocks run per-sample in the audio thread. Create one below to open the editor.";
  landing.append(heading, text);
  const actions = document.createElement("div");
  actions.className = "node-code-screen-codeblocks-landing-actions";
  const codeblockButton = document.createElement("button");
  codeblockButton.type = "button";
  codeblockButton.className = "node-code-screen-landing-cta";
  codeblockButton.textContent = "New Debug Codeblock";
  codeblockButton.addEventListener("click", createNodeGraphCodeScreenDebugCodeblock);
  actions.append(codeblockButton);
  landing.append(actions);
  return landing;
}

function nodeGraphCodeScreenCodeblockListSummary(codeblock) {
  const inputs = codeblock.inputs || [];
  const outputs = codeblock.outputs || [];
  return `${inputs.length} in - ${outputs.length} out - ${nodeGraphCodeScreenSourceStatsText(codeblock.code)}`;
}

function renderNodeGraphCodeScreenCodeblockList(selectedNode) {
  const panel = document.createElement("div");
  panel.className = "node-code-screen-codeblock-panel";
  const totalCodeblocks = nodeGraphCodeScreenCodeblockNodes();
  const codeblocks = nodeGraphCodeScreenFilteredCodeblockNodes();
  const search = document.createElement("div");
  search.className = "node-code-screen-helper-search node-code-screen-codeblock-search";
  search.innerHTML = `
    <label>
      <span>search debug codeblocks</span>
      <input id="nodeCodeScreenCodeblockSearch" type="search" spellcheck="false" placeholder="node id, port, source...">
    </label>
    <button id="nodeCodeScreenClearCodeblockSearch" type="button">Clear</button>
  `;
  search.querySelector("input").value = nodeGraphMvp.codeScreenCodeblockSearch || "";
  panel.append(search);
  const statusLine = document.createElement("div");
  statusLine.className = "node-code-screen-list-status";
  const hasSearch = Boolean(String(nodeGraphMvp.codeScreenCodeblockSearch || "").trim());
  statusLine.textContent = hasSearch
    ? `${codeblocks.length} of ${totalCodeblocks.length} codeblocks shown`
    : `${totalCodeblocks.length} codeblocks in patch`;
  panel.append(statusLine);
  const actions = document.createElement("div");
  actions.className = "node-code-screen-registry-actions";
  actions.innerHTML = `
    <button id="nodeCodeScreenCreateCodeblockFromList" type="button">New Debug Codeblock</button>
  `;
  panel.append(actions);
  const list = document.createElement("div");
  list.className = "node-code-screen-codeblock-list";
  if (!codeblocks.length) {
    list.append(nodeGraphCodeScreenCreateEmptyState("No code boxes match this search."));
  }
  for (const node of codeblocks) {
    const kind = nodeGraphCodeScreenKindForNode(node);
    const codeblock = kind.normalize(node[kind.property]);
    const status = kind.compileStatus(codeblock);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.codeScreenNode = node.id;
    button.setAttribute("aria-pressed", node.id === selectedNode?.id ? "true" : "false");
    button.innerHTML = `
      <span>${nodeGraphCodeScreenEscapeHtml(nodeGraphPatchNodeTitle(node))} <em>${nodeGraphCodeScreenEscapeHtml(kind.label)}</em></span>
      <strong>${nodeGraphCodeScreenEscapeHtml(node.id)}</strong>
      <small>${status.ok ? "code ok" : "compile error"}</small>
      <small class="node-code-screen-codeblock-list-summary">${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenCodeblockListSummary(codeblock))}</small>
    `;
    list.append(button);
  }
  panel.append(list);
  return panel;
}

function renderNodeGraphCodeScreenAutocompleteMount() {
  const popover = document.createElement("div");
  popover.id = "nodeCodeScreenAutocomplete";
  popover.className = "node-code-screen-autocomplete";
  popover.hidden = true;
  return popover;
}

function nodeGraphCodeScreenValueType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function nodeGraphCodeScreenValuePreview(value, maxLength = 280) {
  let text;
  if (typeof value === "string") {
    text = value;
  } else if (value === undefined) {
    text = "undefined";
  } else if (typeof value === "function") {
    text = value.name ? `[function ${value.name}]` : "[function]";
  } else {
    try {
      const seen = new WeakSet();
      text = JSON.stringify(value, (_key, nested) => {
        if (nested && typeof nested === "object") {
          if (seen.has(nested)) {
            return "[Circular]";
          }
          seen.add(nested);
        }
        return nested;
      });
    } catch (_error) {
      text = String(value);
    }
  }
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...`
    : normalized;
}

function nodeGraphCodeScreenValueLiteral(value) {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "function") {
    return "undefined";
  }
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, nested) => {
      if (nested && typeof nested === "object") {
        if (seen.has(nested)) {
          return "[Circular]";
        }
        seen.add(nested);
      }
      return nested;
    });
  } catch (_error) {
    return JSON.stringify(String(value));
  }
}

function nodeGraphCodeScreenWatchFromValue(name, value) {
  const label = String(name || "value").trim() || "value";
  return {
    literal: nodeGraphCodeScreenValueLiteral(value),
    name: label.slice(0, 96),
    preview: nodeGraphCodeScreenValuePreview(value),
    source: nodeGraphCodeScreenConsoleValueText(value),
    type: nodeGraphCodeScreenValueType(value),
  };
}

function nodeGraphCodeScreenWatchInspectSnippet(watch) {
  const name = String(watch?.name || "value").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  const source = String(watch?.literal || watch?.source || watch?.preview || "undefined");
  return `debug.inspect("${name}", ${source});`;
}

function nodeGraphCodeScreenWatchLiteralValue(watch) {
  const literal = String(watch?.literal || watch?.source || "").trim();
  if (!literal || !/^[\[{"]/.test(literal)) {
    return null;
  }
  try {
    return JSON.parse(literal);
  } catch (_error) {
    return null;
  }
}

function nodeGraphCodeScreenFileListWatchRows(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!Array.isArray(value)) {
    return [];
  }
  const rows = value.filter((item) => item && typeof item === "object" &&
    typeof item.path === "string" &&
    typeof item.name === "string" &&
    item.tags && typeof item.tags === "object");
  return rows.length === value.length ? rows : [];
}

function renderNodeGraphCodeScreenFileListWatch(watch) {
  const rows = nodeGraphCodeScreenFileListWatchRows(watch);
  if (!rows.length) {
    return "";
  }
  const body = rows.map((row) => {
    const tags = Object.entries(row.tags || {})
      .map(([key, value]) => value === true ? key : `${key}=${value}`)
      .join(", ");
    return `
      <tr>
        <td>${nodeGraphCodeScreenEscapeHtml(row.name || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(row.folder || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(row.ext || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(tags)}</td>
      </tr>
    `;
  }).join("");
  return `
    <div class="node-code-screen-file-list-watch" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "file list"} table`)}">
      <div>
        <span>Tag Script File List</span>
        <strong>${rows.length} ${rows.length === 1 ? "file" : "files"}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Folder</th>
            <th>Ext</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenSlotListWatchRows(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!Array.isArray(value)) {
    return [];
  }
  const rows = value.filter((item) => item && typeof item === "object" &&
    typeof item.workflow === "string" &&
    typeof item.area === "string" &&
    typeof item.slot === "string");
  return rows.length === value.length ? rows : [];
}

function renderNodeGraphCodeScreenSlotListWatch(watch) {
  const rows = nodeGraphCodeScreenSlotListWatchRows(watch);
  if (!rows.length) {
    return "";
  }
  const body = rows.map((row) => {
    const circuit = row.circuit && typeof row.circuit === "object" ? row.circuit : {};
    const modules = Array.isArray(circuit.modules) ? circuit.modules.length : 0;
    const connections = Array.isArray(circuit.connections) ? circuit.connections.length : 0;
    return `
      <tr>
        <td>${nodeGraphCodeScreenEscapeHtml(row.area || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(row.slot || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(row.workflow || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(circuit.name || row.name || row.id || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(modules)}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(connections)}</td>
      </tr>
    `;
  }).join("");
  return `
    <div class="node-code-screen-slot-list-watch" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "circuit slots"} table`)}">
      <div>
        <span>Circuit Slot List</span>
        <strong>${rows.length} ${rows.length === 1 ? "slot" : "slots"}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Area</th>
            <th>Slot</th>
            <th>Workflow</th>
            <th>Circuit</th>
            <th>Modules</th>
            <th>Wires</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenCodeblockListWatchRows(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!Array.isArray(value)) {
    return [];
  }
  const rows = value.filter((item) => item && typeof item === "object" &&
    item.type === "codeblock" &&
    typeof item.id === "string" &&
    Array.isArray(item.inputs) &&
    Array.isArray(item.outputs) &&
    typeof item.compile === "string");
  return rows.length === value.length ? rows : [];
}

function renderNodeGraphCodeScreenCodeblockListWatch(watch) {
  const rows = nodeGraphCodeScreenCodeblockListWatchRows(watch);
  if (!rows.length) {
    return "";
  }
  const failed = rows.filter((row) => row.compile !== "ok").length;
  const body = rows.map((row) => `
    <tr class="${row.compile === "ok" ? "ok" : "error"}">
      <td>${nodeGraphCodeScreenEscapeHtml(row.id || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.title || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.inputs.join(", "))}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.outputs.join(", "))}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.compile || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.message || "")}</td>
    </tr>
  `).join("");
  return `
    <div class="node-code-screen-codeblock-list-watch ${failed ? "error" : "ok"}" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "codeblocks"} table`)}">
      <div>
        <span>Codeblock List</span>
        <strong>${nodeGraphCodeScreenEscapeHtml(`${rows.length - failed}/${rows.length} ok`)}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>Title</th>
            <th>Inputs</th>
            <th>Outputs</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenVariableGroupWatchRows(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!value || typeof value !== "object" ||
    value.runtime !== "variable watch group" ||
    !Array.isArray(value.rows)) {
    return [];
  }
  const rows = value.rows.filter((row) => row && typeof row === "object" &&
    typeof row.name === "string" &&
    typeof row.type === "string" &&
    typeof row.preview === "string");
  return rows.length === value.rows.length ? rows : [];
}

function renderNodeGraphCodeScreenVariableGroupWatch(watch) {
  const rows = nodeGraphCodeScreenVariableGroupWatchRows(watch);
  if (!rows.length) {
    return "";
  }
  const body = rows.map((row) => `
    <tr>
      <td>${nodeGraphCodeScreenEscapeHtml(row.name || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.type || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.preview || "")}</td>
    </tr>
  `).join("");
  return `
    <div class="node-code-screen-variable-group-watch" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "variables"} table`)}">
      <div>
        <span>Variable Scope</span>
        <strong>${rows.length} ${rows.length === 1 ? "value" : "values"}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenDebugTableWatchRows(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!value || typeof value !== "object" ||
    value.runtime !== "debug table" ||
    !Array.isArray(value.rows)) {
    return [];
  }
  const rows = value.rows.filter((row) => row && typeof row === "object" &&
    typeof row.key === "string" &&
    typeof row.type === "string" &&
    typeof row.preview === "string");
  return rows.length === value.rows.length ? rows : [];
}

function renderNodeGraphCodeScreenDebugTableWatch(watch) {
  const rows = nodeGraphCodeScreenDebugTableWatchRows(watch);
  if (!rows.length) {
    return "";
  }
  const body = rows.map((row) => `
    <tr>
      <td>${nodeGraphCodeScreenEscapeHtml(row.key || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.type || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.preview || "")}</td>
    </tr>
  `).join("");
  return `
    <div class="node-code-screen-debug-table-watch" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "debug table"} table`)}">
      <div>
        <span>Debug Table</span>
        <strong>${rows.length} ${rows.length === 1 ? "row" : "rows"}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Type</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenRegexMatchWatch(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!value || typeof value !== "object" ||
    typeof value.pattern !== "string" ||
    typeof value.input !== "string" ||
    !Array.isArray(value.captures) ||
    typeof value.ok !== "boolean") {
    return null;
  }
  return value;
}

function renderNodeGraphCodeScreenRegexMatchWatch(watch) {
  const match = nodeGraphCodeScreenRegexMatchWatch(watch);
  if (!match) {
    return "";
  }
  const captures = match.captures.length ? match.captures.join(", ") : "none";
  const groups = match.groups && typeof match.groups === "object" && Object.keys(match.groups).length
    ? Object.entries(match.groups).map(([key, value]) => `${key}=${value}`).join(", ")
    : "none";
  return `
    <div class="node-code-screen-regex-match-watch ${match.ok ? "ok" : "error"}" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "regex match"} preview`)}">
      <div>
        <span>Regex Match</span>
        <strong>${nodeGraphCodeScreenEscapeHtml(match.ok ? `matched at ${match.index}` : "no match")}</strong>
      </div>
      <table>
        <tbody>
          <tr>
            <th>Pattern</th>
            <td>${nodeGraphCodeScreenEscapeHtml(match.pattern || "")}</td>
          </tr>
          <tr>
            <th>Input</th>
            <td>${nodeGraphCodeScreenEscapeHtml(match.input || "")}</td>
          </tr>
          <tr>
            <th>Match</th>
            <td>${nodeGraphCodeScreenEscapeHtml(match.match || "none")}</td>
          </tr>
          <tr>
            <th>Captures</th>
            <td>${nodeGraphCodeScreenEscapeHtml(captures)}</td>
          </tr>
          <tr>
            <th>Groups</th>
            <td>${nodeGraphCodeScreenEscapeHtml(groups)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenTestResultsWatchRows(watch) {
  if (!/\btests?\b/i.test(String(watch?.name || ""))) {
    return [];
  }
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  if (!Array.isArray(value)) {
    return [];
  }
  const rows = value.filter((item) => item && typeof item === "object" &&
    typeof item.name === "string" &&
    typeof item.ok === "boolean" &&
    !Object.prototype.hasOwnProperty.call(item, "value") &&
    !Object.prototype.hasOwnProperty.call(item, "error"));
  return rows.length === value.length ? rows : [];
}

function renderNodeGraphCodeScreenTestResultsWatch(watch) {
  const rows = nodeGraphCodeScreenTestResultsWatchRows(watch);
  if (!rows.length) {
    return "";
  }
  const passed = rows.filter((row) => row.ok).length;
  const body = rows.map((row) => `
    <tr class="${row.ok ? "ok" : "error"}">
      <td>${nodeGraphCodeScreenEscapeHtml(row.ok ? "PASS" : "FAIL")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(row.name || "")}</td>
    </tr>
  `).join("");
  return `
    <div class="node-code-screen-test-results-watch ${passed === rows.length ? "ok" : "error"}" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "test results"} table`)}">
      <div>
        <span>Test Results</span>
        <strong>${nodeGraphCodeScreenEscapeHtml(`${passed}/${rows.length} passed`)}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Name</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function nodeGraphCodeScreenCircuitPlanWatch(watch) {
  const value = nodeGraphCodeScreenWatchLiteralValue(watch);
  const plan = value?.circuit && typeof value.circuit === "object" ? value.circuit : value;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.modules) || !Array.isArray(plan.connections)) {
    return null;
  }
  return plan.modules.every((module) => module && typeof module === "object" && module.id && module.type)
    ? plan
    : null;
}

function renderNodeGraphCodeScreenCircuitPlanWatch(watch) {
  const plan = nodeGraphCodeScreenCircuitPlanWatch(watch);
  if (!plan) {
    return "";
  }
  const moduleRows = plan.modules.map((module) => {
    const params = module.params && typeof module.params === "object"
      ? Object.entries(module.params)
        .map(([key, value]) => `${key}=${nodeGraphCodeScreenValuePreview(value, 40)}`)
        .join(", ")
      : "";
    return `
      <tr>
        <td>${nodeGraphCodeScreenEscapeHtml(module.id || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(module.type || "")}</td>
        <td>${nodeGraphCodeScreenEscapeHtml(params)}</td>
      </tr>
    `;
  }).join("");
  const connectionRows = plan.connections.map((connection) => `
    <tr>
      <td>${nodeGraphCodeScreenEscapeHtml(connection.from || "")}</td>
      <td>${nodeGraphCodeScreenEscapeHtml(connection.to || "")}</td>
    </tr>
  `).join("");
  return `
    <div class="node-code-screen-circuit-plan-watch" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch?.name || "circuit plan"} preview`)}">
      <div>
        <span>Circuit Plan</span>
        <strong>${nodeGraphCodeScreenEscapeHtml(`${plan.modules.length} modules / ${plan.connections.length} wires`)}</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Module</th>
            <th>Type</th>
            <th>Params</th>
          </tr>
        </thead>
        <tbody>${moduleRows}</tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
          </tr>
        </thead>
        <tbody>${connectionRows || `<tr><td colspan="2">no wires planned</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderNodeGraphCodeScreenVariableWatch() {
  const watches = Array.isArray(nodeGraphMvp.codeScreenWorkspaceWatches)
    ? nodeGraphMvp.codeScreenWorkspaceWatches
    : [];
  const query = String(nodeGraphMvp.codeScreenWorkspaceWatchSearch || "").trim().toLowerCase();
  const indexedWatches = watches
    .map((watch, index) => ({ index, watch }))
    .filter(({ watch }) => !query || [
      watch?.name,
      watch?.preview,
      watch?.source,
      watch?.type,
    ].map((value) => String(value || "").toLowerCase()).join("\n").includes(query));
  const section = document.createElement("section");
  section.className = "node-code-screen-variable-watch";
  section.setAttribute("aria-label", "Variable Watch");
  const rows = indexedWatches.length
    ? indexedWatches.map(({ watch, index }) => `
      <div class="node-code-screen-watch-row">
        <dt>
          <strong>${nodeGraphCodeScreenEscapeHtml(watch.name)}</strong>
          <span>${nodeGraphCodeScreenEscapeHtml(watch.type)}</span>
        </dt>
        <dd title="${nodeGraphCodeScreenEscapeHtml(watch.source || watch.preview)}">${nodeGraphCodeScreenEscapeHtml(watch.preview)}</dd>
        <div class="node-code-screen-watch-actions" aria-label="${nodeGraphCodeScreenEscapeHtml(`${watch.name} watch actions`)}">
          <button type="button" data-code-screen-copy-watch="${index}">Copy Value</button>
          <button type="button" data-code-screen-copy-watch-inspect="${index}">Copy Inspect</button>
          <button type="button" data-code-screen-insert-watch-inspect="${index}">Insert Inspect</button>
        </div>
        ${renderNodeGraphCodeScreenFileListWatch(watch)}
        ${renderNodeGraphCodeScreenSlotListWatch(watch)}
        ${renderNodeGraphCodeScreenCodeblockListWatch(watch)}
        ${renderNodeGraphCodeScreenVariableGroupWatch(watch)}
        ${renderNodeGraphCodeScreenDebugTableWatch(watch)}
        ${renderNodeGraphCodeScreenRegexMatchWatch(watch)}
        ${renderNodeGraphCodeScreenTestResultsWatch(watch)}
        ${renderNodeGraphCodeScreenCircuitPlanWatch(watch)}
      </div>
    `).join("")
    : watches.length && query
      ? `
        <div class="node-code-screen-watch-empty">
          <dt>No matching variables</dt>
          <dd>Clear the filter or search another value name, type, or preview.</dd>
        </div>
      `
    : `
      <div class="node-code-screen-watch-empty">
        <dt>No inspected variables yet</dt>
        <dd>Run code with <code>debug.inspect("name", value)</code> to pin variable state here.</dd>
      </div>
    `;
  section.innerHTML = `
    <div class="node-code-screen-variable-watch-heading">
      <div>
        <span>Variable Watch</span>
        <strong>${query ? `${indexedWatches.length}/${watches.length}` : watches.length} ${watches.length === 1 ? "value" : "values"}</strong>
      </div>
      <menu>
        <button id="nodeCodeScreenCopyWorkspaceWatchMarkdown" type="button">Copy Watch Markdown</button>
        <button id="nodeCodeScreenClearWorkspaceWatches" type="button">Clear Watch</button>
      </menu>
    </div>
    <label class="node-code-screen-watch-filter">
      <span>filter variables</span>
      <input id="nodeCodeScreenWorkspaceWatchSearch" type="search" spellcheck="false" autocomplete="off" placeholder="name, type, or value" value="${nodeGraphCodeScreenEscapeHtml(nodeGraphMvp.codeScreenWorkspaceWatchSearch || "")}">
    </label>
    <dl>${rows}</dl>
  `;
  return section;
}

function nodeGraphCodeScreenWorkspaceWatch(index) {
  const watches = Array.isArray(nodeGraphMvp.codeScreenWorkspaceWatches)
    ? nodeGraphMvp.codeScreenWorkspaceWatches
    : [];
  return watches[Number(index)] || null;
}

function nodeGraphCodeScreenWatchStatus(message = "watch updated", ok = true) {
  nodeGraphCodeScreenUpdateWorkspaceScriptStatus(message);
  updateNodeGraphCodeScreenLookupStatus(message, ok);
}

async function copyNodeGraphCodeScreenWorkspaceWatch(index) {
  const watch = nodeGraphCodeScreenWorkspaceWatch(index);
  const source = String(watch?.source || watch?.preview || "").trim();
  if (!source) {
    nodeGraphCodeScreenWatchStatus("watch value not found", false);
    return;
  }
  try {
    await copyTextToClipboard(source);
    nodeGraphCodeScreenWatchStatus("watch value copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(source);
    nodeGraphCodeScreenWatchStatus("watch value selected");
  }
}

async function copyNodeGraphCodeScreenWorkspaceWatchInspect(index) {
  const watch = nodeGraphCodeScreenWorkspaceWatch(index);
  if (!watch) {
    nodeGraphCodeScreenWatchStatus("watch value not found", false);
    return;
  }
  const snippet = nodeGraphCodeScreenWatchInspectSnippet(watch);
  try {
    await copyTextToClipboard(snippet);
    nodeGraphCodeScreenWatchStatus("watch inspect copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(snippet);
    nodeGraphCodeScreenWatchStatus("watch inspect selected");
  }
}

function nodeGraphCodeScreenWatchesMarkdown(watches = []) {
  const values = Array.isArray(watches) ? watches : [];
  if (!values.length) {
    return "";
  }
  return values.map((watch) => {
    const name = String(watch?.name || "value").trim() || "value";
    const type = String(watch?.type || "value").trim() || "value";
    const source = String(watch?.source || watch?.preview || "").trim();
    const language = type === "object" || type === "array" ? "json" : "text";
    return [
      `### ${name}`,
      "",
      `type: ${type}`,
      "",
      nodeGraphCodeScreenMarkdownFence(source || "undefined", language),
    ].join("\n");
  }).join("\n\n");
}

function nodeGraphCodeScreenWorkspaceWatchMarkdown() {
  return nodeGraphCodeScreenWatchesMarkdown(nodeGraphMvp.codeScreenWorkspaceWatches);
}

async function copyNodeGraphCodeScreenWorkspaceWatchMarkdown() {
  const markdown = nodeGraphCodeScreenWorkspaceWatchMarkdown();
  if (!markdown) {
    nodeGraphCodeScreenWatchStatus("watch empty", false);
    return;
  }
  try {
    await copyTextToClipboard(markdown);
    nodeGraphCodeScreenWatchStatus("watch markdown copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(markdown);
    nodeGraphCodeScreenWatchStatus("watch markdown selected");
  }
}

function insertNodeGraphCodeScreenWorkspaceWatchInspect(index) {
  const watch = nodeGraphCodeScreenWorkspaceWatch(index);
  if (!watch) {
    nodeGraphCodeScreenWatchStatus("watch value not found", false);
    return;
  }
  nodeGraphMvp.codeScreenSection = "script";
  renderNodeGraphCodeScreen();
  queueMicrotask(() => {
    insertNodeGraphCodeScreenHelperSnippet(nodeGraphCodeScreenWatchInspectSnippet(watch));
    nodeGraphCodeScreenWatchStatus("watch inspect inserted");
  });
}

function nodeGraphCodeScreenStagedCounts(staged = {}) {
  return {
    helpers: staged.helpers?.length || 0,
    patchTools: staged.patchTools?.length || 0,
    samples: staged.samples?.length || 0,
    snippets: staged.snippets?.length || 0,
    slots: staged.slots?.length || 0,
    slotsRemoved: staged.slotsRemoved?.length || 0,
    ui: staged.ui?.length || 0,
  };
}

function nodeGraphCodeScreenStagedItemLabel(item, index = 0) {
  if (!item || typeof item !== "object") {
    return `item-${index + 1}`;
  }
  return nodeGraphCodeScreenPreviewText(
    item.id || item.name || item.signature || item.target || item.path || `item-${index + 1}`,
    42,
  );
}

function nodeGraphCodeScreenStagedPreviews(staged = {}) {
  const previews = {};
  for (const key of ["helpers", "patchTools", "samples", "snippets", "slots", "slotsRemoved", "ui"]) {
    previews[key] = (Array.isArray(staged[key]) ? staged[key] : [])
      .slice(0, 3)
      .map((item, index) => nodeGraphCodeScreenStagedItemLabel(item, index));
  }
  return previews;
}

function nodeGraphCodeScreenScriptTests(tests = []) {
  return (Array.isArray(tests) ? tests : [])
    .filter((test) => test && typeof test === "object")
    .map((test) => ({
      name: String(test.name || "test").slice(0, 96),
      ok: Boolean(test.ok),
    }));
}

function nodeGraphCodeScreenTestSummary(tests = []) {
  const items = nodeGraphCodeScreenScriptTests(tests);
  const passed = items.filter((test) => test.ok).length;
  return {
    failed: items.length - passed,
    items,
    passed,
    total: items.length,
  };
}

function nodeGraphCodeScreenBuildSummary({ applied = 0, error = "", mode = "script", persisted = false, staged = {}, tests = [] } = {}) {
  const counts = nodeGraphCodeScreenStagedCounts(staged);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const testSummary = nodeGraphCodeScreenTestSummary(tests);
  return {
    applied,
    counts,
    error: String(error || "").slice(0, 180),
    mode: String(mode || "script").slice(0, 32),
    persisted: Boolean(persisted),
    previews: nodeGraphCodeScreenStagedPreviews(staged),
    status: error || testSummary.failed ? "error" : "ok",
    tests: testSummary,
    total,
  };
}

function nodeGraphCodeScreenBuildSummarySection(key) {
  return {
    helpers: "helpers",
    patchTools: "patchTools",
    samples: "samples",
    snippets: "snippets",
    slots: "script",
    ui: "ui",
  }[key] || "script";
}

function setNodeGraphCodeScreenBuildSummary(summary) {
  nodeGraphMvp.codeScreenWorkspaceBuildSummary = summary
    ? nodeGraphCodeScreenBuildSummary(summary)
    : null;
}

function renderNodeGraphCodeScreenBuildSummary() {
  const summary = nodeGraphMvp.codeScreenWorkspaceBuildSummary;
  const section = document.createElement("section");
  section.className = "node-code-screen-build-summary";
  section.setAttribute("aria-label", "Build Summary");
  const rows = summary
    ? Object.entries(summary.counts || {}).map(([key, count]) => {
      const preview = (summary.previews?.[key] || []).join(", ") || "none";
      return `
      <button type="button" data-code-screen-build-summary-section="${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenBuildSummarySection(key))}">
        <dt>${nodeGraphCodeScreenEscapeHtml(key)}</dt>
        <dd>${nodeGraphCodeScreenEscapeHtml(count)}</dd>
        <small>${nodeGraphCodeScreenEscapeHtml(preview)}</small>
      </button>
    `;
    }).join("")
    : `
      <div class="empty">
        <dt>waiting</dt>
        <dd>0</dd>
        <small>none</small>
      </div>
    `;
  const title = summary
    ? `${summary.total} staged / ${summary.applied} applied`
    : "No build yet";
  const detail = summary
    ? `${summary.mode} - ${summary.persisted ? "saved" : "scratch"}${summary.error ? ` - ${summary.error}` : ""}`
    : "Run a Workspace Script to see library changes by type.";
  const testDetail = summary?.tests?.total
    ? `<div class="node-code-screen-test-summary ${summary.tests.failed ? "error" : "ok"}">
        <span>Tests</span>
        <strong>${nodeGraphCodeScreenEscapeHtml(`${summary.tests.passed}/${summary.tests.total} passed`)}</strong>
        <small>${nodeGraphCodeScreenEscapeHtml((summary.tests.items || []).map((test) => `${test.ok ? "PASS" : "FAIL"} ${test.name}`).join(" - "))}</small>
      </div>`
    : "";
  section.innerHTML = `
    <div class="node-code-screen-build-summary-heading">
      <div>
        <span>Build Summary</span>
        <strong>${nodeGraphCodeScreenEscapeHtml(title)}</strong>
      </div>
      <small class="${summary?.status === "error" ? "error" : "ok"}">${nodeGraphCodeScreenEscapeHtml(detail)}</small>
    </div>
    ${testDetail}
    <dl>${rows}</dl>
  `;
  return section;
}

function openNodeGraphCodeScreenBuildSummarySection(sectionId) {
  const section = nodeGraphCodeScreenSections.find((entry) => entry.id === sectionId);
  if (!section) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("summary section not found");
    return;
  }
  setNodeGraphCodeScreenSection(section.id);
}

function nodeGraphCodeScreenRunHistoryPreview(code) {
  const compact = String(code || "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  return compact.length > 160 ? `${compact.slice(0, 159)}...` : compact || "empty script";
}

function nodeGraphCodeScreenRunHistoryWatches(inspections = []) {
  return (Array.isArray(inspections) ? inspections : [])
    .filter((watch) => watch && typeof watch === "object")
    .slice(-32)
    .map((watch) => ({
      literal: String(watch.literal ?? ""),
      name: String(watch.name || "value").slice(0, 96),
      preview: String(watch.preview || "").slice(0, 320),
      source: String(watch.source || watch.preview || "").slice(0, 4000),
      type: String(watch.type || "value").slice(0, 32),
    }));
}

function nodeGraphCodeScreenRunHistoryEntry({ applied = 0, code = "", error = "", inspections = [], language = "javascript", logs = [], mode = "script", staged = 0, tests = [] } = {}) {
  const time = new Date();
  const watches = nodeGraphCodeScreenRunHistoryWatches(inspections);
  const testSummary = nodeGraphCodeScreenTestSummary(tests);
  return {
    applied,
    code: String(code || "").slice(0, nodeGraphCodeScreenRegistryLimits.scriptLength),
    error: String(error || "").slice(0, 240),
    inspections: watches.length,
    language: nodeGraphCodeScreenMarkdownLanguage(language),
    lastLog: String((Array.isArray(logs) && logs.length ? logs[logs.length - 1] : "") || "").slice(0, 240),
    logs: (Array.isArray(logs) ? logs : []).slice(-32).map((line) => String(line || "").slice(0, 2000)),
    mode: String(mode || "script").slice(0, 32),
    preview: nodeGraphCodeScreenRunHistoryPreview(code),
    staged,
    status: error || testSummary.failed ? "error" : "ok",
    tests: testSummary,
    time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    watches,
  };
}

function addNodeGraphCodeScreenRunHistory(entry) {
  const current = Array.isArray(nodeGraphMvp.codeScreenWorkspaceRunHistory)
    ? nodeGraphMvp.codeScreenWorkspaceRunHistory
    : [];
  nodeGraphMvp.codeScreenWorkspaceRunHistory = [
    nodeGraphCodeScreenRunHistoryEntry(entry),
    ...current,
  ].slice(0, 12);
}

function nodeGraphCodeScreenRunHistoryItem(index) {
  const history = Array.isArray(nodeGraphMvp.codeScreenWorkspaceRunHistory)
    ? nodeGraphMvp.codeScreenWorkspaceRunHistory
    : [];
  return history[Number(index)] || null;
}

function clearNodeGraphCodeScreenRunHistory() {
  nodeGraphMvp.codeScreenWorkspaceRunHistory = [];
  renderNodeGraphCodeScreen();
}

function loadNodeGraphCodeScreenRunHistoryItem(index) {
  const item = nodeGraphCodeScreenRunHistoryItem(index);
  if (!item?.code) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history code not found");
    return;
  }
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  if (!source) {
    return;
  }
  const language = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
  source.value = item.code;
  if (language) {
    language.value = nodeGraphCodeScreenMarkdownLanguage(item.language || "javascript");
  }
  nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history loaded");
  updateNodeGraphCodeScreenWorkspaceScriptStats();
  updateNodeGraphCodeScreenWorkspaceScriptDraftState();
  source.focus();
}

function saveNodeGraphCodeScreenRunHistorySnippet(index) {
  const item = nodeGraphCodeScreenRunHistoryItem(index);
  if (!item?.code) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history code not found");
    return;
  }
  saveNodeGraphCodeScreenSnippetSource(
    item.code,
    `Reusable snippet saved from ${item.mode || "script"} run history.`,
    "code screen history snippet saved",
    `history ${item.mode || "script"}`,
    item.language || "javascript",
  );
  nodeGraphMvp.codeScreenWorkspaceScriptStatus = "history snippet saved";
  renderNodeGraphCodeScreen();
}

function runNodeGraphCodeScreenRunHistoryItem(index) {
  const item = nodeGraphCodeScreenRunHistoryItem(index);
  if (!item?.code) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history code not found");
    return;
  }
  runNodeGraphCodeScreenWorkspaceScriptCode(item.code, {
    mode: `${item.mode || "script"} again`,
    persist: false,
    statusPrefix: "history ran",
  });
}

async function copyNodeGraphCodeScreenRunHistoryMarkdown(index) {
  const item = nodeGraphCodeScreenRunHistoryItem(index);
  const source = String(item?.code || "").trim();
  if (!source) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history code not found");
    return;
  }
  const markdown = nodeGraphCodeScreenMarkdownFence(source, item.language || "javascript");
  try {
    await copyTextToClipboard(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history markdown copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history markdown selected");
  }
}

function restoreNodeGraphCodeScreenRunHistoryWatches(index) {
  const item = nodeGraphCodeScreenRunHistoryItem(index);
  if (!item?.watches?.length) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history watches not found");
    return;
  }
  setNodeGraphCodeScreenWorkspaceWatches(item.watches);
  nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history watches restored");
  renderNodeGraphCodeScreen();
}

async function copyNodeGraphCodeScreenRunHistoryReport(index) {
  const item = nodeGraphCodeScreenRunHistoryItem(index);
  if (!item?.code) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history code not found");
    return;
  }
  const previousWatches = nodeGraphMvp.codeScreenWorkspaceWatches;
  const previousConsole = nodeGraphMvp.codeScreenWorkspaceConsole;
  nodeGraphMvp.codeScreenWorkspaceWatches = nodeGraphCodeScreenRunHistoryWatches(item.watches);
  nodeGraphMvp.codeScreenWorkspaceConsole = item.logs?.length ? item.logs.join("\n") : (item.lastLog || "console ready");
  const markdown = [
    "# Code Screen Run Report",
    "",
    `mode: ${item.mode || "script"}`,
    `status: ${item.status || "ok"}`,
    `result: ${item.staged || 0} staged / ${item.applied || 0} applied / ${item.inspections || 0} watched`,
    "",
    "## Source",
    "",
    nodeGraphCodeScreenMarkdownFence(item.code, item.language || "javascript"),
    "",
    "## Watches",
    "",
    nodeGraphCodeScreenWorkspaceWatchMarkdown() || "No watched values.",
    "",
    "## Tests",
    "",
    item.tests?.total
      ? [
        `${item.tests.passed}/${item.tests.total} passed`,
        ...(item.tests.items || []).map((test) => `- ${test.ok ? "PASS" : "FAIL"} ${test.name}`),
      ].join("\n")
      : "No script tests.",
    "",
    "## Console",
    "",
    nodeGraphCodeScreenMarkdownFence(nodeGraphMvp.codeScreenWorkspaceConsole || "console ready", "text"),
  ].join("\n");
  nodeGraphMvp.codeScreenWorkspaceWatches = previousWatches;
  nodeGraphMvp.codeScreenWorkspaceConsole = previousConsole;
  try {
    await copyTextToClipboard(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history report copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("history report selected");
  }
}

function renderNodeGraphCodeScreenRunHistory() {
  const history = Array.isArray(nodeGraphMvp.codeScreenWorkspaceRunHistory)
    ? nodeGraphMvp.codeScreenWorkspaceRunHistory
    : [];
  const section = document.createElement("section");
  section.className = "node-code-screen-run-history";
  section.setAttribute("aria-label", "Run History");
  const rows = history.length
    ? history.map((entry, index) => `
      <li class="${entry.status === "error" ? "error" : "ok"}">
        <div>
          <strong>${nodeGraphCodeScreenEscapeHtml(entry.mode)}</strong>
          <span>${nodeGraphCodeScreenEscapeHtml(entry.time)}</span>
          <small>${nodeGraphCodeScreenEscapeHtml(entry.status)}</small>
        </div>
        <p>${nodeGraphCodeScreenEscapeHtml(entry.error || entry.lastLog || entry.preview)}</p>
        <code>${nodeGraphCodeScreenEscapeHtml(`${entry.staged} staged / ${entry.applied} applied / ${entry.inspections} watched${entry.tests?.total ? ` / ${entry.tests.passed}/${entry.tests.total} tests` : ""}`)}</code>
        <menu>
          <button type="button" data-code-screen-run-history="${index}">Run Again</button>
          <button type="button" data-code-screen-load-run-history="${index}">Load</button>
          <button type="button" data-code-screen-restore-run-history-watch="${index}">Restore Watch</button>
          <button type="button" data-code-screen-save-run-history-snippet="${index}">Save Snippet</button>
          <button type="button" data-code-screen-copy-run-history-markdown="${index}">Copy Markdown</button>
          <button type="button" data-code-screen-copy-run-history-report="${index}">Copy Run Report</button>
        </menu>
      </li>
    `).join("")
    : `<li class="empty"><p>No script runs yet.</p><code>Run Script or Run Selection to build a debug trail.</code></li>`;
  section.innerHTML = `
    <div class="node-code-screen-run-history-heading">
      <div>
        <span>Run History</span>
        <strong>${history.length} ${history.length === 1 ? "run" : "runs"}</strong>
      </div>
      <button id="nodeCodeScreenClearRunHistory" type="button">Clear History</button>
    </div>
    <ol>${rows}</ol>
  `;
  return section;
}

function renderNodeGraphCodeScreenWorkspaceScript(body) {
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const editor = document.createElement("div");
  editor.className = "node-code-screen-editor node-code-screen-workspace-script";
  editor.innerHTML = `
    <div class="node-code-screen-editor-heading">
      <div>
        <span>Master code sidecar</span>
        <strong>Workspace Script</strong>
        <small>Keep event bindings, game hooks, UI helper calls, and sample notes in code.</small>
      </div>
      <output id="nodeCodeScreenWorkspaceScriptStatus" class="ok" aria-live="polite">${nodeGraphCodeScreenEscapeHtml(nodeGraphMvp.codeScreenWorkspaceScriptStatus || "script ready")}</output>
    </div>
    <div id="nodeCodeScreenWorkspaceScriptStats" class="node-code-screen-script-stats">${nodeGraphCodeScreenEscapeHtml(`${nodeGraphCodeScreenSourceStatsText(codeScreen.script)} - markdown: ${nodeGraphCodeScreenMarkdownLanguage(codeScreen.scriptLanguage)}`)}</div>
    <div id="nodeCodeScreenWorkspaceScriptDraftState" class="node-code-screen-script-draft-state">script matches saved patch</div>
    <div class="node-code-screen-script-language">
      <label>
        <span>markdown language</span>
        <input id="nodeCodeScreenWorkspaceScriptLanguage" type="text" spellcheck="false" value="${nodeGraphCodeScreenEscapeHtml(codeScreen.scriptLanguage)}">
      </label>
      <code id="nodeCodeScreenWorkspaceScriptFence">${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenMarkdownLanguage(codeScreen.scriptLanguage))}</code>
      <button id="nodeCodeScreenCopyWorkspaceScriptMarkdown" type="button">Copy Script Markdown</button>
      <button id="nodeCodeScreenCopyWorkspaceDebugReport" type="button">Copy Debug Report</button>
    </div>
    <label class="node-code-screen-source-label">
      <span>source</span>
      <textarea id="nodeCodeScreenWorkspaceScriptSource" spellcheck="false"></textarea>
    </label>
    <section class="node-code-screen-script-console" aria-label="Script Console">
      <div>
        <span>Script Console</span>
        <menu>
          <button id="nodeCodeScreenCopyWorkspaceConsoleMarkdown" type="button">Copy Console Markdown</button>
          <button id="nodeCodeScreenClearWorkspaceConsole" type="button">Clear Console</button>
        </menu>
      </div>
      <pre id="nodeCodeScreenWorkspaceConsoleOutput">${nodeGraphCodeScreenEscapeHtml(nodeGraphMvp.codeScreenWorkspaceConsole || "console ready")}</pre>
    </section>
    <div class="node-code-screen-editor-actions">
      <span class="node-code-screen-shortcut-hint"><kbd>Ctrl+S</kbd> save <kbd>Ctrl+Enter</kbd> run <kbd>Ctrl+Shift+Enter</kbd> selection</span>
      <button id="nodeCodeScreenApplyWorkspaceScript" type="button">Save Script</button>
      <button id="nodeCodeScreenRunWorkspaceScript" type="button">Run Script</button>
      <button id="nodeCodeScreenRunSelectedWorkspaceScript" type="button">Run Selection</button>
      <button id="nodeCodeScreenResetWorkspaceScript" type="button">Reset Draft</button>
      <button id="nodeCodeScreenSaveWorkspaceSnippet" type="button">Save as Snippet</button>
      <button id="nodeCodeScreenSaveWorkspacePinnedSnippet" type="button">Save + Pin</button>
      <button id="nodeCodeScreenInsertLibraryDemoScript" type="button">Library Demo Script</button>
      <button id="nodeCodeScreenInsertTeleportScript" type="button">Mage Teleport Stub</button>
      <button id="nodeCodeScreenOpenHelpers" type="button">Browse Helpers</button>
    </div>
  `;
  editor.querySelector("#nodeCodeScreenWorkspaceScriptSource").value = codeScreen.script;
  editor.insertBefore(renderNodeGraphCodeScreenNamespaceRail(), editor.querySelector(".node-code-screen-source-label"));
  editor.insertBefore(renderNodeGraphCodeScreenVariableWatch(), editor.querySelector(".node-code-screen-script-console"));
  editor.insertBefore(renderNodeGraphCodeScreenBuildSummary(), editor.querySelector(".node-code-screen-script-console"));
  editor.insertBefore(renderNodeGraphCodeScreenRunHistory(), editor.querySelector(".node-code-screen-script-console"));
  editor.append(renderNodeGraphCodeScreenAutocompleteMount());
  body.append(editor);
  if (nodeGraphMvp.codeScreenPendingSnippet) {
    const snippet = nodeGraphMvp.codeScreenPendingSnippet;
    nodeGraphMvp.codeScreenPendingSnippet = "";
    queueMicrotask(() => insertNodeGraphCodeScreenHelperSnippet(snippet));
  }
}

function nodeGraphCodeScreenCodeblockDraftSummary(node, codeblock, status) {
  const inputs = codeblock.inputs || [];
  const outputs = codeblock.outputs || [];
  return [
    `node ${node?.id || "unselected"}`,
    `${inputs.length} ${inputs.length === 1 ? "input" : "inputs"}: ${inputs.join(", ") || "none"}`,
    `${outputs.length} ${outputs.length === 1 ? "output" : "outputs"}: ${outputs.join(", ") || "none"}`,
    nodeGraphCodeScreenSourceStatsText(codeblock.code),
    status?.ok ? "code ok" : "compile error",
  ].join(" - ");
}

function nodeGraphCodeScreenCodeblockDebugRows(node, codeblock, status) {
  const kind = nodeGraphCodeScreenKindForNode(node);
  const inputs = codeblock.inputs || [];
  const outputs = codeblock.outputs || [];
  return [
    ["node id", node?.id || "unselected"],
    ["title", nodeGraphPatchNodeTitle(node) || kind.label],
    ["kind", kind.label],
    ["compile", status?.ok ? "ok" : status?.message || "compile error"],
    ["inputs", inputs.length ? inputs.join(", ") : "none"],
    ["outputs", outputs.length ? outputs.join(", ") : "none"],
    ["source", nodeGraphCodeScreenSourceStatsText(codeblock.code)],
  ];
}

function renderNodeGraphCodeScreenCodeblockDebugValues(node, codeblock, status) {
  const kind = nodeGraphCodeScreenKindForNode(node);
  const panel = document.createElement("section");
  panel.className = "node-code-screen-debug-values";
  panel.innerHTML = `
    <div class="node-code-screen-debug-values-heading">
      <span>Debug Values</span>
      <strong>Selected ${nodeGraphCodeScreenEscapeHtml(kind.label)}</strong>
    </div>
    <dl>
      ${nodeGraphCodeScreenCodeblockDebugRows(node, codeblock, status).map(([label, value]) => `
        <div>
          <dt>${nodeGraphCodeScreenEscapeHtml(label)}</dt>
          <dd>${nodeGraphCodeScreenEscapeHtml(value)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
  return panel;
}

function nodeGraphCodeScreenCodeblockDraftFromInputs(node) {
  if (!node) {
    return null;
  }
  const kind = nodeGraphCodeScreenKindForNode(node);
  const current = kind.normalize(node[kind.property]);
  return kind.normalize({
    ...current,
    code: document.getElementById("nodeCodeScreenCodeblockSource")?.value ?? current.code,
    inputs: document.getElementById("nodeCodeScreenCodeblockInputs")?.value ?? current.inputs,
    outputs: document.getElementById("nodeCodeScreenCodeblockOutputs")?.value ?? current.outputs,
  });
}

function nodeGraphCodeScreenCodeblockDraftChanges(current, draft) {
  const changes = [];
  if (String(current?.code || "") !== String(draft?.code || "")) {
    changes.push("code changed");
  }
  if ((current?.inputs || []).join(",") !== (draft?.inputs || []).join(",") ||
    (current?.outputs || []).join(",") !== (draft?.outputs || []).join(",")) {
    changes.push("ports changed");
  }
  return changes;
}

function updateNodeGraphCodeScreenCodeblockDraftState(node, draft, status) {
  const state = document.getElementById("nodeCodeScreenCodeblockDraftState");
  const statusOutput = document.getElementById("nodeCodeScreenCodeblockStatus");
  if (!node || !draft) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(node);
  const current = kind.normalize(node[kind.property]);
  const changes = nodeGraphCodeScreenCodeblockDraftChanges(current, draft);
  const changed = changes.length > 0;
  if (state) {
    state.textContent = changed
      ? `unapplied ${changes.join(" + ")}`
      : "saved draft matches module";
    state.className = changed
      ? "node-code-screen-codeblock-draft-state changed"
      : "node-code-screen-codeblock-draft-state";
  }
  if (statusOutput && status?.ok) {
    statusOutput.textContent = changed ? "draft has unapplied changes" : "code ok";
    statusOutput.className = changed ? "changed" : "ok";
  }
}

function updateNodeGraphCodeScreenCodeblockSummary() {
  const node = nodeGraphCodeScreenSelectedCodeblock();
  const summary = document.getElementById("nodeCodeScreenCodeblockSummary");
  if (!node || !summary) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(node);
  const codeblock = nodeGraphCodeScreenCodeblockDraftFromInputs(node);
  const status = kind.compileStatus(codeblock);
  summary.textContent = nodeGraphCodeScreenCodeblockDraftSummary(node, codeblock, status);
  summary.className = status.ok
    ? "node-code-screen-codeblock-summary ok"
    : "node-code-screen-codeblock-summary error";
  const debugPanel = document.getElementById("nodeCodeScreenCodeblockDebugValues");
  if (debugPanel) {
    debugPanel.replaceChildren(...renderNodeGraphCodeScreenCodeblockDebugValues(node, codeblock, status).children);
  }
  updateNodeGraphCodeScreenCodeblockDraftState(node, codeblock, status);
}

function renderNodeGraphCodeScreenCodeblockEditor(node) {
  const kind = nodeGraphCodeScreenKindForNode(node);
  const codeblock = kind.normalize(node[kind.property]);
  const status = kind.compileStatus(codeblock);
  const editor = document.createElement("div");
  editor.className = "node-code-screen-editor";
  const title = nodeGraphCodeScreenEscapeHtml(nodeGraphPatchNodeTitle(node));
  const nodeId = nodeGraphCodeScreenEscapeHtml(node.id);
  const statusText = status.ok ? "code ok" : `compile error: ${nodeGraphCodeScreenEscapeHtml(status.message)}`;
  editor.innerHTML = `
    <div class="node-code-screen-editor-heading">
      <div>
        <span>${nodeGraphCodeScreenEscapeHtml(kind.label)}</span>
        <strong>${title}</strong>
        <small>${nodeId}</small>
      </div>
      <output id="nodeCodeScreenCodeblockStatus" class="${status.ok ? "ok" : "error"}" aria-live="polite">${statusText}</output>
    </div>
    <p class="node-code-screen-editor-context-hint">${nodeGraphCodeScreenEscapeHtml(kind.contextHint)}</p>
    <div id="nodeCodeScreenCodeblockSummary" class="node-code-screen-codeblock-summary ${status.ok ? "ok" : "error"}">${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenCodeblockDraftSummary(node, codeblock, status))}</div>
    <div id="nodeCodeScreenCodeblockDraftState" class="node-code-screen-codeblock-draft-state">saved draft matches module</div>
    <section id="nodeCodeScreenCodeblockDebugValues" class="node-code-screen-debug-values"></section>
    <div class="node-code-screen-port-grid">
      <label><span>inputs</span><input id="nodeCodeScreenCodeblockInputs" spellcheck="false"></label>
      <label><span>outputs</span><input id="nodeCodeScreenCodeblockOutputs" spellcheck="false"></label>
      <button id="nodeCodeScreenApplyPorts" type="button">Apply Ports</button>
    </div>
    <label class="node-code-screen-source-label">
      <span>source</span>
      <textarea id="nodeCodeScreenCodeblockSource" spellcheck="false"></textarea>
    </label>
    <div class="node-code-screen-editor-actions">
      <span class="node-code-screen-shortcut-hint"><kbd>Ctrl+S</kbd> applies all</span>
      <button id="nodeCodeScreenNewCodeblock" type="button">${nodeGraphCodeScreenEscapeHtml(kind.createLabel)}</button>
      <button id="nodeCodeScreenApplyCode" type="button">Apply Code</button>
      <button id="nodeCodeScreenApplyAll" type="button">Apply All</button>
      <button id="nodeCodeScreenResetCodeblockDraft" type="button">Reset Draft</button>
      <button id="nodeCodeScreenSaveCodeblockSnippet" type="button">Save Code as Snippet</button>
      <button id="nodeCodeScreenSaveCodeblockPinnedSnippet" type="button">Save + Pin</button>
      <button id="nodeCodeScreenApplyCodeReturn" type="button">Apply + Return</button>
      <button id="nodeCodeScreenFocusModule" type="button">Focus Module</button>
    </div>
  `;
  const debugValues = editor.querySelector("#nodeCodeScreenCodeblockDebugValues");
  if (debugValues) {
    debugValues.replaceChildren(...renderNodeGraphCodeScreenCodeblockDebugValues(node, codeblock, status).children);
  }
  editor.querySelector("#nodeCodeScreenCodeblockInputs").value = codeblock.inputs.join(", ");
  editor.querySelector("#nodeCodeScreenCodeblockOutputs").value = codeblock.outputs.join(", ");
  editor.querySelector("#nodeCodeScreenCodeblockSource").value = codeblock.code;
  editor.insertBefore(renderNodeGraphCodeScreenNamespaceRail(), editor.querySelector(".node-code-screen-source-label"));
  editor.append(renderNodeGraphCodeScreenAutocompleteMount());
  return editor;
}

function renderNodeGraphCodeScreenCodeblocks(body) {
  const selectedNode = nodeGraphCodeScreenSelectedCodeblock();
  const shell = document.createElement("div");
  shell.className = "node-code-screen-codeblocks";
  if (!selectedNode) {
    shell.append(renderNodeGraphCodeScreenCodeblocksLanding());
    body.append(shell);
    return;
  }
  shell.append(renderNodeGraphCodeScreenCodeblockList(selectedNode));
  shell.append(renderNodeGraphCodeScreenCodeblockEditor(selectedNode));
  body.append(shell);
  if (nodeGraphMvp.codeScreenPendingSnippet) {
    const snippet = nodeGraphMvp.codeScreenPendingSnippet;
    nodeGraphMvp.codeScreenPendingSnippet = "";
    queueMicrotask(() => insertNodeGraphCodeScreenHelperSnippet(snippet));
  }
}

function nodeGraphCodeScreenPatchLocalHelpers() {
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  return (codeScreen.helpers || []).map((helper) => {
    const namespace = helper.namespace || "patch";
    return {
      availability: "patch local",
      category: helper.category || (helper.namespace === "snippet" ? "saved snippet" : "patch local"),
      description: helper.description || "Patch-local helper draft.",
      name: helper.name || helper.id,
      namespace,
      signature: helper.signature || `${namespace}.${helper.name || helper.id}()`,
      snippet: helper.source || helper.signature || `${namespace}.${helper.name || helper.id}()`,
      tags: helper.tags || "",
    };
  });
}

function nodeGraphCodeScreenSnippetItems() {
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  return (codeScreen.helpers || [])
    .map((helper, index) => ({ helper, index }))
    .filter(({ helper }) => (helper.namespace || "").toLowerCase() === "snippet");
}

function nodeGraphCodeScreenNowIso() {
  return new Date().toISOString();
}

function nodeGraphCodeScreenFreshHelper(value) {
  return {
    ...(value || {}),
    updatedAt: nodeGraphCodeScreenNowIso(),
  };
}

function nodeGraphCodeScreenUpdatedAtText(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "not saved yet";
  }
  const time = Date.parse(source);
  if (!Number.isFinite(time)) {
    return source;
  }
  return new Date(time).toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function nodeGraphCodeScreenSnippetSortMode() {
  const mode = String(nodeGraphMvp.codeScreenSnippetSort || "recent").trim();
  return ["recent", "name", "category"].includes(mode) ? mode : "recent";
}

function nodeGraphCodeScreenSnippetSortValue(value) {
  return String(value || "").trim().toLowerCase();
}

function nodeGraphCodeScreenSnippetUpdatedTime(helper, index) {
  const updatedTime = Date.parse(helper?.updatedAt || "");
  return Number.isFinite(updatedTime) ? updatedTime : index;
}

function nodeGraphCodeScreenCompareSnippetItems(left, right) {
  const mode = nodeGraphCodeScreenSnippetSortMode();
  if (mode === "name") {
    return nodeGraphCodeScreenSnippetSortValue(left.helper.name || left.helper.id)
      .localeCompare(nodeGraphCodeScreenSnippetSortValue(right.helper.name || right.helper.id)) ||
      left.index - right.index;
  }
  if (mode === "category") {
    return nodeGraphCodeScreenSnippetSortValue(left.helper.category)
      .localeCompare(nodeGraphCodeScreenSnippetSortValue(right.helper.category)) ||
      nodeGraphCodeScreenSnippetSortValue(left.helper.name || left.helper.id)
        .localeCompare(nodeGraphCodeScreenSnippetSortValue(right.helper.name || right.helper.id)) ||
      left.index - right.index;
  }
  return nodeGraphCodeScreenSnippetUpdatedTime(right.helper, right.index) -
    nodeGraphCodeScreenSnippetUpdatedTime(left.helper, left.index);
}

function nodeGraphCodeScreenSortedSnippetItems(items) {
  return [...(items || [])].sort(nodeGraphCodeScreenCompareSnippetItems);
}

function nodeGraphCodeScreenFilteredSnippetItems() {
  const query = String(nodeGraphMvp.codeScreenSnippetSearch || "").trim().toLowerCase();
  return nodeGraphCodeScreenSortedSnippetItems(nodeGraphCodeScreenSnippetItems().filter(({ helper }) => {
    if (!query) {
      return true;
    }
    return [
      helper.category,
      helper.description,
      helper.id,
      helper.name,
      helper.signature,
      helper.source,
      helper.tags,
    ].join(" ").toLowerCase().includes(query);
  }));
}

function nodeGraphCodeScreenSnippetBrowseChips() {
  const chips = new Map();
  for (const { helper } of nodeGraphCodeScreenSnippetItems()) {
    const category = String(helper.category || "").trim();
    if (category) {
      const key = category.toLowerCase();
      chips.set(key, {
        label: category,
        query: category,
        type: "category",
      });
    }
    for (const tag of nodeGraphCodeScreenTagList(helper.tags)) {
      const key = `tag:${tag.toLowerCase()}`;
      chips.set(key, {
        label: tag,
        query: tag,
        type: "tag",
      });
    }
  }
  return [...chips.values()].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "category" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function nodeGraphCodeScreenTagList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function nodeGraphCodeScreenHasTag(value, tag) {
  const target = String(tag || "").trim().toLowerCase();
  return nodeGraphCodeScreenTagList(value).some((candidate) => candidate.toLowerCase() === target);
}

function nodeGraphCodeScreenToggleTag(value, tag) {
  const sourceTags = nodeGraphCodeScreenTagList(value);
  const target = String(tag || "").trim();
  const targetKey = target.toLowerCase();
  if (!target) {
    return sourceTags.join(" ");
  }
  if (sourceTags.some((candidate) => candidate.toLowerCase() === targetKey)) {
    return sourceTags.filter((candidate) => candidate.toLowerCase() !== targetKey).join(" ");
  }
  return [...sourceTags, target].join(" ");
}

function nodeGraphCodeScreenAllHelpers() {
  return nodeGraphCodeScreenPatchLocalHelpers();
}

function nodeGraphCodeScreenHelperKey(helper) {
  return [
    helper.namespace || "",
    helper.signature || "",
    helper.snippet || "",
    helper.availability || "",
  ].join("\u241F");
}

function nodeGraphCodeScreenHelperByKey(helperKey) {
  return nodeGraphCodeScreenAllHelpers()
    .find((helper) => nodeGraphCodeScreenHelperKey(helper) === helperKey) || null;
}

function nodeGraphCodeScreenHelperLookupItem(helper, kind = "helper") {
  return {
    availability: helper.availability || "",
    category: helper.category || "",
    description: helper.description || "",
    helperKey: nodeGraphCodeScreenHelperKey(helper),
    kind,
    label: helper.signature || helper.name || helper.id || "helper",
    language: helper.language || "javascript",
    snippet: helper.snippet || helper.signature || "",
    tags: helper.tags || "",
  };
}

function nodeGraphCodeScreenFilteredHelpers() {
  const query = String(nodeGraphMvp.codeScreenHelperSearch || "").trim().toLowerCase();
  const namespaceFilter = String(nodeGraphMvp.codeScreenHelperNamespaceFilter || "").trim().toLowerCase();
  return nodeGraphCodeScreenAllHelpers().filter((helper) => {
    if (namespaceFilter && String(helper.namespace || "").toLowerCase() !== namespaceFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [
      helper.availability,
      helper.category,
      helper.description,
      helper.name,
      helper.namespace,
      helper.signature,
      helper.snippet,
      helper.tags,
    ].join(" ").toLowerCase().includes(query);
  });
}

function nodeGraphCodeScreenLookupItems() {
  const query = String(nodeGraphMvp.codeScreenLookupSearch || "").trim().toLowerCase();
  if (!query) {
    return [];
  }
  const namespaceQuery = /^([a-z][a-z0-9_]*)\.$/.exec(query)?.[1] || "";
  const regularHelpers = nodeGraphCodeScreenAllHelpers()
    .filter((helper) => (helper.namespace || "").toLowerCase() !== "snippet")
    .filter((helper) => !namespaceQuery || String(helper.namespace || "").toLowerCase() === namespaceQuery)
    .map((helper) => nodeGraphCodeScreenHelperLookupItem(helper, `${helper.namespace || "patch"}.`));
  const snippetItems = namespaceQuery
    ? []
    : nodeGraphCodeScreenSnippetItems().map(({ helper, index }) => ({
      availability: "saved snippet",
      category: helper.category || "saved snippet",
      description: helper.description || "Reusable snippet saved in this patch.",
      kind: "snippet",
      label: helper.name || helper.signature || helper.id || "Saved Snippet",
      language: helper.language || "javascript",
      snippet: helper.source || helper.signature || "",
      snippetIndex: index,
      tags: helper.tags || "",
    }));
  return [...regularHelpers, ...snippetItems].filter((item) => [
      item.availability,
      item.category,
      item.description,
      item.kind,
      item.label,
      item.snippet,
      item.tags,
    ].join(" ").toLowerCase().includes(query) || (namespaceQuery && item.kind.toLowerCase() === `${namespaceQuery}.`))
    .slice(0, 6);
}

function rememberNodeGraphCodeScreenRecentHelperSnippet(snippet) {
  const source = String(snippet || "").trim();
  if (!source) {
    return;
  }
  const helper = nodeGraphCodeScreenAllHelpers()
    .filter((candidate) => (candidate.namespace || "").toLowerCase() !== "snippet")
    .find((candidate) => String(candidate.snippet || candidate.signature || "").trim() === source);
  if (!helper) {
    return;
  }
  const key = nodeGraphCodeScreenHelperKey(helper);
  nodeGraphMvp.codeScreenRecentHelperKeys = [
    key,
    ...(nodeGraphMvp.codeScreenRecentHelperKeys || []).filter((candidate) => candidate !== key),
  ].slice(0, 6);
}

function nodeGraphCodeScreenRecentHelperLookupItems(limit = 3) {
  return (nodeGraphMvp.codeScreenRecentHelperKeys || [])
    .map(nodeGraphCodeScreenHelperByKey)
    .filter(Boolean)
    .map((helper) => nodeGraphCodeScreenHelperLookupItem(helper, "recent helper"))
    .slice(0, limit);
}

function nodeGraphCodeScreenRecentHelperRank(helper) {
  const key = nodeGraphCodeScreenHelperKey(helper);
  const index = (nodeGraphMvp.codeScreenRecentHelperKeys || []).indexOf(key);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function nodeGraphCodeScreenSortHelpersByRecent(left, right) {
  return nodeGraphCodeScreenRecentHelperRank(left) - nodeGraphCodeScreenRecentHelperRank(right) ||
    String(left.signature || left.name || left.id || "").localeCompare(String(right.signature || right.name || right.id || ""));
}

function nodeGraphCodeScreenRecentSnippetLookupItems(limit = 4) {
  const snippets = nodeGraphCodeScreenSnippetItems()
    .map(({ helper, index }) => ({
      availability: "saved snippet",
      category: helper.category || "saved snippet",
      description: helper.description || "Reusable snippet saved in this patch.",
      kind: nodeGraphCodeScreenHasTag(helper.tags, "pinned") ? "pinned" : "recent",
      label: helper.name || helper.signature || helper.id || "Saved Snippet",
      language: helper.language || "javascript",
      pinned: nodeGraphCodeScreenHasTag(helper.tags, "pinned"),
      snippet: helper.source || helper.signature || "",
      snippetIndex: index,
      tags: helper.tags || "",
    }))
    .filter((item) => item.snippet);
  return [
    ...snippets.filter((item) => item.pinned).reverse(),
    ...snippets.filter((item) => !item.pinned).slice(-limit).reverse(),
  ].slice(0, limit);
}

function nodeGraphCodeScreenFirstLookupItem() {
  const query = String(nodeGraphMvp.codeScreenLookupSearch || "").trim();
  return query
    ? nodeGraphCodeScreenLookupItems()[0] || null
    : nodeGraphCodeScreenRecentSnippetLookupItems(1)[0] || null;
}

function insertFirstNodeGraphCodeScreenLookupItem() {
  const item = nodeGraphCodeScreenFirstLookupItem();
  const snippet = String(item?.snippet || "").trim();
  if (!snippet) {
    updateNodeGraphCodeScreenLookupStatus("nothing to use", false);
    return false;
  }
  insertNodeGraphCodeScreenHelperSnippet(snippet);
  nodeGraphMvp.codeScreenLookupStatus = "lookup inserted";
  renderNodeGraphCodeScreenLookupShelf();
  return true;
}

function openFirstNodeGraphCodeScreenLookupItem() {
  const item = nodeGraphCodeScreenFirstLookupItem();
  if (item?.helperKey) {
    openNodeGraphCodeScreenLookupHelper(item.helperKey);
    return true;
  }
  if (Number.isFinite(item?.snippetIndex)) {
    openNodeGraphCodeScreenLookupSnippet(item.snippetIndex);
    return true;
  }
  updateNodeGraphCodeScreenLookupStatus("nothing to open", false);
  return false;
}

function nodeGraphCodeScreenHelperGroups() {
  return nodeGraphCodeScreenFilteredHelpers().reduce((groups, helper) => {
    const key = helper.namespace;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(helper);
    return groups;
  }, new Map());
}

function nodeGraphCodeScreenNamespaces() {
  return [...nodeGraphCodeScreenHelperGroups().keys()];
}

function nodeGraphCodeScreenCountBy(items, field) {
  const counts = new Map();
  for (const item of items) {
    const key = String(item?.[field] || "uncategorized").trim() || "uncategorized";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

function renderNodeGraphCodeScreenHelperSummary() {
  const helpers = nodeGraphCodeScreenFilteredHelpers();
  const summary = document.createElement("div");
  summary.className = "node-code-screen-helper-summary";
  const groups = [
    ["Namespaces", "namespace", nodeGraphCodeScreenCountBy(helpers, "namespace")],
    ["Categories", "category", nodeGraphCodeScreenCountBy(helpers, "category")],
    ["Availability", "availability", nodeGraphCodeScreenCountBy(helpers, "availability")],
  ];
  for (const [label, filterType, counts] of groups) {
    const card = document.createElement("section");
    card.innerHTML = `<span>${nodeGraphCodeScreenEscapeHtml(label)}</span>`;
    if (!counts.length) {
      const empty = document.createElement("small");
      empty.textContent = "0";
      card.append(empty);
    }
    for (const [name, count] of counts) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.dataset.codeScreenHelperSummaryFilter = filterType;
      chip.dataset.codeScreenHelperSummaryValue = name;
      chip.textContent = `${name}: ${count}`;
      card.append(chip);
    }
    summary.append(card);
  }
  return summary;
}

function nodeGraphCodeScreenSnippetTarget() {
  if (nodeGraphMvp.codeScreenSnippetTarget === "codeblock" && nodeGraphCodeScreenSelectedCodeblock()) {
    return "codeblock";
  }
  return "script";
}

function setNodeGraphCodeScreenSnippetTarget(target) {
  nodeGraphMvp.codeScreenSnippetTarget = target === "codeblock" ? "codeblock" : "script";
  renderNodeGraphCodeScreen();
}

function renderNodeGraphCodeScreenSnippetTargetControls() {
  const current = nodeGraphCodeScreenSnippetTarget();
  const selectedNode = nodeGraphCodeScreenSelectedCodeblock();
  const selectedKindLabel = selectedNode ? nodeGraphCodeScreenKindForNode(selectedNode).label : "Code Box";
  const controls = document.createElement("div");
  controls.className = "node-code-screen-snippet-target";
  controls.innerHTML = `
    <span>send snippets to</span>
    <button type="button" data-code-screen-snippet-target="script" aria-pressed="${current === "script" ? "true" : "false"}">Workspace Script</button>
    <button type="button" data-code-screen-snippet-target="codeblock" aria-pressed="${current === "codeblock" ? "true" : "false"}">Selected ${nodeGraphCodeScreenEscapeHtml(selectedKindLabel)}</button>
  `;
  return controls;
}

function renderNodeGraphCodeScreenNamespaceRail() {
  const rail = document.createElement("div");
  rail.className = "node-code-screen-namespace-rail";
  const label = document.createElement("span");
  label.textContent = "helper namespaces";
  rail.append(label);
  for (const namespace of nodeGraphCodeScreenNamespaces()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.codeScreenInsertPrefix = `${namespace}.`;
    button.textContent = `${namespace}.`;
    button.title = `Insert ${namespace}. and show available helpers.`;
    rail.append(button);
  }
  return rail;
}

function renderNodeGraphCodeScreenHelperFilterRail() {
  const rail = document.createElement("div");
  rail.className = "node-code-screen-helper-filter-rail";
  const label = document.createElement("span");
  label.textContent = "filter namespace";
  rail.append(label);
  const current = String(nodeGraphMvp.codeScreenHelperNamespaceFilter || "").trim().toLowerCase();
  for (const namespace of ["all", ...new Set(nodeGraphCodeScreenAllHelpers().map((helper) => helper.namespace).filter(Boolean))]) {
    const value = namespace === "all" ? "" : namespace;
    const pressed = namespace === "all" ? !current : current === namespace;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.codeScreenHelperNamespaceFilter = value;
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    button.textContent = namespace === "all" ? "All" : `${namespace}.`;
    rail.append(button);
  }
  return rail;
}

function renderNodeGraphCodeScreenSnippetTagRail() {
  const chips = nodeGraphCodeScreenSnippetBrowseChips();
  const rail = document.createElement("div");
  rail.className = "node-code-screen-snippet-tag-rail";
  const label = document.createElement("span");
  label.textContent = "browse snippets";
  rail.append(label);
  if (!chips.length) {
    const empty = document.createElement("small");
    empty.textContent = "save snippets with categories or tags to filter them here";
    rail.append(empty);
    return rail;
  }
  const query = String(nodeGraphMvp.codeScreenSnippetSearch || "").trim().toLowerCase();
  const all = document.createElement("button");
  all.type = "button";
  all.dataset.codeScreenSnippetTag = "";
  all.setAttribute("aria-pressed", query ? "false" : "true");
  all.textContent = "All";
  rail.append(all);
  for (const chip of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.codeScreenSnippetTag = chip.query;
    button.dataset.codeScreenSnippetChipType = chip.type;
    button.setAttribute("aria-pressed", query === chip.query.toLowerCase() ? "true" : "false");
    button.textContent = chip.type === "category" ? `category: ${chip.label}` : chip.label;
    rail.append(button);
  }
  return rail;
}

function renderNodeGraphCodeScreenSnippetSortControls() {
  const current = nodeGraphCodeScreenSnippetSortMode();
  const rail = document.createElement("div");
  rail.className = "node-code-screen-snippet-sort";
  const label = document.createElement("span");
  label.textContent = "sort snippets";
  rail.append(label);
  for (const [mode, text] of [["recent", "Recent"], ["name", "Name"], ["category", "Category"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.codeScreenSnippetSort = mode;
    button.setAttribute("aria-pressed", current === mode ? "true" : "false");
    button.textContent = text;
    rail.append(button);
  }
  return rail;
}

function nodeGraphCodeScreenSelectedHelperDetail() {
  const helpers = nodeGraphCodeScreenFilteredHelpers();
  const selected = helpers.find((helper) => nodeGraphCodeScreenHelperKey(helper) === nodeGraphMvp.codeScreenHelperDetailKey);
  return selected || helpers[0] || null;
}

function renderNodeGraphCodeScreenHelperDetail() {
  const helper = nodeGraphCodeScreenSelectedHelperDetail();
  const detail = document.createElement("section");
  detail.className = "node-code-screen-helper-detail";
  if (!helper) {
    detail.append(nodeGraphCodeScreenCreateEmptyState("Choose a helper to see what it inserts."));
    return detail;
  }
  detail.innerHTML = `
    <div>
      <span>${nodeGraphCodeScreenEscapeHtml(helper.namespace)} helper</span>
      <strong>${nodeGraphCodeScreenEscapeHtml(helper.signature)}</strong>
      <small>${nodeGraphCodeScreenEscapeHtml([helper.category, helper.availability || "documented"].filter(Boolean).join(" - "))}</small>
    </div>
    <p>${nodeGraphCodeScreenEscapeHtml(helper.description || "Patch-local helper.")}</p>
    <code>${nodeGraphCodeScreenEscapeHtml(helper.snippet || helper.signature || "")}</code>
    <div class="node-code-screen-helper-detail-actions">
      <button type="button" data-code-screen-insert-helper="${nodeGraphCodeScreenEscapeHtml(helper.snippet || helper.signature || "")}">Use Helper</button>
      <button id="nodeCodeScreenSaveHelperSnippet" type="button">Save as Snippet</button>
      <button id="nodeCodeScreenSaveHelperPinnedSnippet" type="button">Save + Pin</button>
    </div>
  `;
  return detail;
}

function renderNodeGraphCodeScreenHelpers(body) {
  body.append(renderNodeGraphCodeScreenSnippetTargetControls());
  body.append(renderNodeGraphCodeScreenHelperFilterRail());
  const search = document.createElement("div");
  search.className = "node-code-screen-helper-search";
  search.innerHTML = `
    <label>
      <span>search helpers and snippets</span>
      <input id="nodeCodeScreenHelperSearch" type="search" spellcheck="false" placeholder="ui, event.bind, teleport, snippet...">
    </label>
    <button id="nodeCodeScreenClearHelperSearch" type="button">Clear</button>
  `;
  search.querySelector("input").value = nodeGraphMvp.codeScreenHelperSearch || "";
  body.append(search);
  body.append(renderNodeGraphCodeScreenHelperSummary());
  const namespaceFilter = String(nodeGraphMvp.codeScreenHelperNamespaceFilter || "").trim();
  if (namespaceFilter) {
    const status = document.createElement("div");
    status.className = "node-code-screen-list-status";
    status.textContent = `${nodeGraphCodeScreenFilteredHelpers().length} helpers in ${namespaceFilter}.`;
    body.append(status);
  }
  body.append(renderNodeGraphCodeScreenHelperDetail());
  const shell = document.createElement("div");
  shell.className = "node-code-screen-helper-grid";
  const groups = nodeGraphCodeScreenHelperGroups();
  if (!groups.size) {
    shell.append(nodeGraphCodeScreenCreateEmptyState("No helpers or saved snippets match this search."));
  }
  for (const [namespace, helpers] of groups) {
    const card = document.createElement("section");
    card.className = "node-code-screen-helper-card";
    const heading = document.createElement("div");
    heading.innerHTML = `<span>namespace</span><strong>${namespace}.</strong>`;
    card.append(heading);
    for (const helper of helpers) {
      const row = document.createElement("button");
      row.type = "button";
      row.dataset.codeScreenInsertHelper = helper.snippet;
      row.dataset.codeScreenHelperNamespace = namespace;
      const preview = helper.snippet && helper.snippet !== helper.signature
        ? `<code>${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenPreviewText(helper.snippet))}</code>`
        : "";
      const helperStatus = [helper.category, helper.availability].filter(Boolean).join(" - ");
      row.innerHTML = `<strong>${nodeGraphCodeScreenEscapeHtml(helper.signature)}</strong><span>${nodeGraphCodeScreenEscapeHtml(helper.description)}</span>${preview}<small>${nodeGraphCodeScreenEscapeHtml(helperStatus)}</small>`;
      const actions = document.createElement("div");
      actions.className = "node-code-screen-helper-row";
      actions.append(row);
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.dataset.codeScreenHelperDetail = nodeGraphCodeScreenHelperKey(helper);
      detailButton.setAttribute("aria-pressed", nodeGraphCodeScreenHelperKey(helper) === nodeGraphMvp.codeScreenHelperDetailKey ? "true" : "false");
      detailButton.textContent = "Details";
      actions.append(detailButton);
      card.append(actions);
    }
    shell.append(card);
  }
  body.append(shell);
}

function renderNodeGraphCodeScreenSnippets(body) {
  body.append(renderNodeGraphCodeScreenSnippetTargetControls());
  body.append(renderNodeGraphCodeScreenSnippetTagRail());
  body.append(renderNodeGraphCodeScreenSnippetSortControls());
  const totalSnippets = nodeGraphCodeScreenSnippetItems();
  const snippets = nodeGraphCodeScreenFilteredSnippetItems();
  const search = document.createElement("div");
  search.className = "node-code-screen-helper-search node-code-screen-snippet-search";
  search.innerHTML = `
    <label>
      <span>search snippets</span>
      <input id="nodeCodeScreenSnippetSearch" type="search" spellcheck="false" placeholder="teleport, ui.set, Out1...">
    </label>
    <button id="nodeCodeScreenClearSnippetSearch" type="button">Clear</button>
  `;
  search.querySelector("input").value = nodeGraphMvp.codeScreenSnippetSearch || "";
  body.append(search);
  const listStatus = document.createElement("div");
  listStatus.className = "node-code-screen-list-status";
  const hasSearch = Boolean(String(nodeGraphMvp.codeScreenSnippetSearch || "").trim());
  listStatus.textContent = hasSearch
    ? `${snippets.length} of ${totalSnippets.length} snippets shown`
    : `${totalSnippets.length} snippets saved`;
  body.append(listStatus);
  const registryStatus = document.createElement("output");
  registryStatus.id = "nodeCodeScreenRegistryStatus";
  registryStatus.className = "node-code-screen-registry-status ok";
  registryStatus.setAttribute("aria-live", "polite");
  registryStatus.textContent = nodeGraphMvp.codeScreenRegistryStatus || "metadata ready";
  body.append(registryStatus);
  const shell = document.createElement("div");
  shell.className = "node-code-screen-snippet-library";
  const actions = document.createElement("div");
  actions.className = "node-code-screen-registry-actions";
  actions.innerHTML = `
    <button type="button" data-code-screen-add-snippet>New Snippet</button>
    <button id="nodeCodeScreenSnippetsOpenHelpers" type="button">Open Helper Search</button>
  `;
  shell.append(actions);
  if (!totalSnippets.length) {
    shell.append(nodeGraphCodeScreenCreateEmptyState("No saved snippets yet. Save selected Workspace Script code or create a snippet here."));
  } else if (!snippets.length) {
    shell.append(nodeGraphCodeScreenCreateEmptyState("No snippets match this search."));
  }
  for (const { helper, index } of snippets) {
    const card = document.createElement("section");
    card.className = "node-code-screen-registry-card node-code-screen-snippet-card";
    card.dataset.codeScreenRegistryKey = "helpers";
    card.dataset.codeScreenRegistryIndex = String(index);
    const source = helper.source || helper.signature || "";
    const pinned = nodeGraphCodeScreenHasTag(helper.tags, "pinned");
    const title = document.createElement("div");
    title.className = "node-code-screen-registry-card-heading";
    title.innerHTML = `
      <span>${nodeGraphCodeScreenEscapeHtml(helper.id)}</span>
      <div class="node-code-screen-card-actions">
        <span class="node-code-screen-shortcut-hint"><kbd>Ctrl+S</kbd> saves metadata</span>
        <button type="button" data-code-screen-insert-registry="helpers" data-code-screen-registry-index="${index}">Use</button>
        <button type="button" data-code-screen-use-return-snippet="${index}">Use + Return</button>
        <button type="button" data-code-screen-copy-registry-snippet="helpers" data-code-screen-registry-index="${index}">Copy Code</button>
        <button type="button" data-code-screen-copy-markdown-registry-snippet="helpers" data-code-screen-registry-index="${index}">Copy Markdown</button>
        <button type="button" data-code-screen-pin-snippet="${index}" aria-pressed="${pinned ? "true" : "false"}">${pinned ? "Unpin" : "Pin to Shelf"}</button>
        <button type="button" data-code-screen-save-registry-metadata="helpers" data-code-screen-registry-index="${index}">Save Metadata</button>
        <button type="button" data-code-screen-reset-registry="helpers" data-code-screen-registry-index="${index}">Reset Draft</button>
        <button type="button" data-code-screen-duplicate-snippet="${index}">Duplicate</button>
        <button type="button" data-code-screen-move-registry="helpers" data-code-screen-registry-index="${index}" data-code-screen-move-direction="-1">Up</button>
        <button type="button" data-code-screen-move-registry="helpers" data-code-screen-registry-index="${index}" data-code-screen-move-direction="1">Down</button>
        <button type="button" data-code-screen-remove-registry="helpers" data-code-screen-registry-index="${index}">Remove</button>
      </div>
    `;
    card.append(title);
    const draftState = document.createElement("small");
    draftState.className = "node-code-screen-registry-draft-state";
    draftState.dataset.codeScreenRegistryDraftState = "helpers";
    draftState.textContent = "metadata matches saved entry";
    card.append(draftState);
    const preview = document.createElement("code");
    preview.className = "node-code-screen-snippet-preview";
    preview.textContent = nodeGraphCodeScreenPreviewText(source, 180);
    card.append(preview);
    const stats = document.createElement("small");
    stats.className = "node-code-screen-snippet-stats";
    stats.textContent = `${nodeGraphCodeScreenSourceStatsText(source)} - markdown: ${nodeGraphCodeScreenMarkdownLanguage(helper.language)}`;
    card.append(stats);
    const updated = document.createElement("small");
    updated.className = "node-code-screen-snippet-updated";
    updated.textContent = `updated ${nodeGraphCodeScreenUpdatedAtText(helper.updatedAt)}`;
    card.append(updated);
    const tags = nodeGraphCodeScreenTagList(helper.tags);
    if (tags.length) {
      const tagRow = document.createElement("div");
      tagRow.className = "node-code-screen-snippet-card-tags";
      for (const tag of tags) {
        const tagButton = document.createElement("button");
        tagButton.type = "button";
        tagButton.dataset.codeScreenSnippetTag = tag;
        tagButton.textContent = tag;
        tagRow.append(tagButton);
      }
      card.append(tagRow);
    }
    for (const field of ["id", "name", "category", "language", "signature", "tags", "description", "source"]) {
      const label = document.createElement("label");
      label.innerHTML = `<span>${field}</span>`;
      const input = field === "source" || field === "description"
        ? document.createElement("textarea")
        : document.createElement("input");
      input.value = helper[field] ?? "";
      input.spellcheck = false;
      input.dataset.codeScreenRegistryField = field;
      label.append(input);
      card.append(label);
    }
    shell.append(card);
  }
  body.append(shell);
}

function nodeGraphCodeScreenRegistryConfig(sectionId) {
  if (sectionId === "samples") {
    return {
      addLabel: "Add Sample",
      fields: ["id", "name", "path", "description"],
      key: "samples",
      normalizer: normalizeNodeGraphCodeScreenSample,
      snippet(item) {
        return `sample.load("${item.id}")`;
      },
    };
  }
  if (sectionId === "ui") {
    return {
      addLabel: "Add UI Setting",
      fields: ["id", "name", "target", "value", "description"],
      key: "ui",
      normalizer: normalizeNodeGraphCodeScreenUiSetting,
      snippet(item) {
        return `ui.set("${item.target || item.id}", ${JSON.stringify(item.value || "")})`;
      },
    };
  }
  if (sectionId === "patchTools") {
    return {
      addLabel: "Add Patch Tool",
      fields: ["id", "name", "target", "description"],
      key: "patchTools",
      normalizer: normalizeNodeGraphCodeScreenPatchTool,
      snippet(item) {
        return item.target || `patch.findNode("${item.id}")`;
      },
    };
  }
  return {
    addLabel: "Add Helper",
    fields: ["id", "name", "namespace", "category", "language", "signature", "tags", "description", "source"],
    key: "helpers",
    normalizer: normalizeNodeGraphCodeScreenHelper,
    snippet(item) {
      return item.source || item.signature || `${item.namespace || "patch"}.${item.name || item.id}()`;
    },
  };
}

function renderNodeGraphCodeScreenRegistry(body, sectionId) {
  const config = nodeGraphCodeScreenRegistryConfig(sectionId);
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const items = codeScreen[config.key] || [];
  const shell = document.createElement("div");
  shell.className = "node-code-screen-registry";
  const actions = document.createElement("div");
  actions.className = "node-code-screen-registry-actions";
  const add = document.createElement("button");
  add.type = "button";
  add.dataset.codeScreenAddRegistry = config.key;
  add.textContent = config.addLabel;
  actions.append(add);
  const saveAll = document.createElement("button");
  saveAll.type = "button";
  saveAll.dataset.codeScreenSaveAllRegistry = config.key;
  saveAll.textContent = "Save All Metadata";
  actions.append(saveAll);
  for (const [templateIndex, template] of (nodeGraphCodeScreenRegistryTemplates[config.key] || []).entries()) {
    const templateButton = document.createElement("button");
    templateButton.type = "button";
    templateButton.dataset.codeScreenAddTemplate = config.key;
    templateButton.dataset.codeScreenTemplateIndex = String(templateIndex);
    templateButton.textContent = template.label;
    actions.append(templateButton);
  }
  if (sectionId !== "helpers") {
    shell.append(renderNodeGraphCodeScreenSnippetTargetControls());
  }
  shell.append(actions);
  const listStatus = document.createElement("div");
  listStatus.className = "node-code-screen-list-status";
  listStatus.textContent = `${items.length} ${items.length === 1 ? "entry" : "entries"} in ${config.key}`;
  shell.append(listStatus);
  const registryStatus = document.createElement("output");
  registryStatus.id = "nodeCodeScreenRegistryStatus";
  registryStatus.className = "node-code-screen-registry-status ok";
  registryStatus.setAttribute("aria-live", "polite");
  registryStatus.textContent = nodeGraphMvp.codeScreenRegistryStatus || "metadata ready";
  shell.append(registryStatus);
  if (!items.length) {
    shell.append(nodeGraphCodeScreenCreateEmptyState("No entries yet. Add one to reserve the patch metadata shape for this section."));
  }
  const preview = document.createElement("details");
  preview.className = "node-code-screen-json-preview";
  preview.innerHTML = `<summary>Metadata JSON Preview</summary><textarea readonly spellcheck="false" data-code-screen-json-preview="${config.key}">${nodeGraphCodeScreenEscapeHtml(JSON.stringify({ [config.key]: items }, null, 2))}</textarea>`;
  shell.append(preview);
  items.forEach((item, index) => {
    const card = document.createElement("section");
    card.className = "node-code-screen-registry-card";
    card.dataset.codeScreenRegistryKey = config.key;
    card.dataset.codeScreenRegistryIndex = String(index);
    const title = document.createElement("div");
    title.className = "node-code-screen-registry-card-heading";
    title.innerHTML = `
      <span>${nodeGraphCodeScreenEscapeHtml(item.id)}</span>
      <div class="node-code-screen-card-actions">
        <span class="node-code-screen-shortcut-hint"><kbd>Ctrl+S</kbd> saves metadata</span>
        <button type="button" data-code-screen-insert-registry="${config.key}" data-code-screen-registry-index="${index}">Use</button>
        <button type="button" data-code-screen-copy-registry-snippet="${config.key}" data-code-screen-registry-index="${index}">Copy Code</button>
        <button type="button" data-code-screen-copy-markdown-registry-snippet="${config.key}" data-code-screen-registry-index="${index}">Copy Markdown</button>
        <button type="button" data-code-screen-save-registry-metadata="${config.key}" data-code-screen-registry-index="${index}">Save Metadata</button>
        <button type="button" data-code-screen-reset-registry="${config.key}" data-code-screen-registry-index="${index}">Reset Draft</button>
        <button type="button" data-code-screen-save-registry-snippet="${config.key}" data-code-screen-registry-index="${index}">Save Snippet</button>
        <button type="button" data-code-screen-save-pin-registry-snippet="${config.key}" data-code-screen-registry-index="${index}">Save + Pin</button>
        <button type="button" data-code-screen-duplicate-registry="${config.key}" data-code-screen-registry-index="${index}">Duplicate</button>
        <button type="button" data-code-screen-move-registry="${config.key}" data-code-screen-registry-index="${index}" data-code-screen-move-direction="-1">Up</button>
        <button type="button" data-code-screen-move-registry="${config.key}" data-code-screen-registry-index="${index}" data-code-screen-move-direction="1">Down</button>
        <button type="button" data-code-screen-remove-registry="${config.key}" data-code-screen-registry-index="${index}">Remove</button>
      </div>
    `;
    card.append(title);
    const draftState = document.createElement("small");
    draftState.className = "node-code-screen-registry-draft-state";
    draftState.dataset.codeScreenRegistryDraftState = config.key;
    draftState.textContent = "metadata matches saved entry";
    card.append(draftState);
    const codeCall = document.createElement("code");
    codeCall.className = "node-code-screen-registry-code-call";
    codeCall.dataset.codeScreenRegistrySnippetPreview = config.key;
    codeCall.textContent = nodeGraphCodeScreenPreviewText(config.snippet(item), 180);
    card.append(codeCall);
    for (const field of config.fields) {
      const label = document.createElement("label");
      label.innerHTML = `<span>${field}</span>`;
      const input = field === "source" || field === "description"
        ? document.createElement("textarea")
        : document.createElement("input");
      input.value = item[field] ?? "";
      input.spellcheck = false;
      input.dataset.codeScreenRegistryField = field;
      label.append(input);
      card.append(label);
    }
    shell.append(card);
  });
  body.append(shell);
}

function nodeGraphCodeScreenRegistryDraftItems(key) {
  const sectionId = nodeGraphCodeScreenCurrentSection();
  const config = nodeGraphCodeScreenRegistryConfig(sectionId);
  return Array.from(document.querySelectorAll(`[data-code-screen-registry-key="${key}"]`))
    .map((card, index) => {
      const item = {};
      for (const input of card.querySelectorAll("[data-code-screen-registry-field]")) {
        item[input.dataset.codeScreenRegistryField] = input.value;
      }
      if (key === "helpers" && sectionId === "snippets") {
        item.namespace = "snippet";
      }
      return config.normalizer(item, index + 1);
    });
}

function updateNodeGraphCodeScreenRegistryDraftPreview(key) {
  const preview = document.querySelector(`[data-code-screen-json-preview="${key}"]`);
  if (!preview) {
    return;
  }
  preview.value = JSON.stringify({ [key]: nodeGraphCodeScreenRegistryDraftItems(key) }, null, 2);
}

function nodeGraphCodeScreenRegistrySavedItemForCard(card) {
  const key = card?.dataset.codeScreenRegistryKey;
  const index = Number(card?.dataset.codeScreenRegistryIndex);
  if (!key || !Number.isFinite(index)) {
    return null;
  }
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  return codeScreen[key]?.[index] || null;
}

function nodeGraphCodeScreenComparableRegistryItem(value) {
  if (!value || typeof value !== "object") {
    return value || null;
  }
  const next = { ...value };
  delete next.updatedAt;
  return next;
}

function nodeGraphCodeScreenRegistryItemsEqual(left, right) {
  return JSON.stringify(nodeGraphCodeScreenComparableRegistryItem(left)) ===
    JSON.stringify(nodeGraphCodeScreenComparableRegistryItem(right));
}

function updateNodeGraphCodeScreenRegistryDraftState(card) {
  const state = card?.querySelector("[data-code-screen-registry-draft-state]");
  if (!state) {
    return;
  }
  const saved = nodeGraphCodeScreenRegistrySavedItemForCard(card);
  const draft = nodeGraphCodeScreenRegistryDraftItemFromCard(card);
  const changed = !nodeGraphCodeScreenRegistryItemsEqual(saved, draft);
  state.textContent = changed ? "unapplied metadata changes" : "metadata matches saved entry";
  state.className = changed
    ? "node-code-screen-registry-draft-state changed"
    : "node-code-screen-registry-draft-state";
}

function updateNodeGraphCodeScreenRegistryStatus(message = "metadata editing", ok = true) {
  nodeGraphMvp.codeScreenRegistryStatus = message;
  const status = document.getElementById("nodeCodeScreenRegistryStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = ok ? "node-code-screen-registry-status ok" : "node-code-screen-registry-status error";
}

function updateNodeGraphCodeScreenRegistryDraftCard(target) {
  const card = target.closest("[data-code-screen-registry-key]");
  if (!card) {
    return;
  }
  const key = card.dataset.codeScreenRegistryKey;
  const idInput = card.querySelector('[data-code-screen-registry-field="id"]');
  const title = card.querySelector(".node-code-screen-registry-card-heading > span");
  if (title && idInput) {
    title.textContent = idInput.value || "entry";
  }
  const snippetPreview = card.querySelector(".node-code-screen-snippet-preview");
  const sourceInput = card.querySelector('[data-code-screen-registry-field="source"]');
  if (snippetPreview && sourceInput) {
    snippetPreview.textContent = nodeGraphCodeScreenPreviewText(sourceInput.value, 180);
  }
  const snippetStats = card.querySelector(".node-code-screen-snippet-stats");
  if (snippetStats && sourceInput) {
    snippetStats.textContent = nodeGraphCodeScreenSourceStatsText(sourceInput.value);
  }
  const codeCallPreview = card.querySelector("[data-code-screen-registry-snippet-preview]");
  const draftItem = nodeGraphCodeScreenRegistryDraftItemFromCard(card);
  if (codeCallPreview && draftItem) {
    const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
    const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
    codeCallPreview.textContent = nodeGraphCodeScreenPreviewText(config.snippet(draftItem), 180);
  }
  updateNodeGraphCodeScreenRegistryDraftState(card);
  updateNodeGraphCodeScreenRegistryDraftPreview(key);
  updateNodeGraphCodeScreenRegistryStatus("metadata editing");
}

function resetNodeGraphCodeScreenRegistryDraft(key, index) {
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const item = codeScreen[key]?.[index];
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  if (!item || !card) {
    updateNodeGraphCodeScreenRegistryStatus("metadata not found", false);
    return;
  }
  for (const input of card.querySelectorAll("[data-code-screen-registry-field]")) {
    input.value = item[input.dataset.codeScreenRegistryField] ?? "";
  }
  const firstField = card.querySelector("[data-code-screen-registry-field]");
  if (firstField) {
    updateNodeGraphCodeScreenRegistryDraftCard(firstField);
  }
  updateNodeGraphCodeScreenRegistryStatus("metadata reset");
}

function nodeGraphCodeScreenRegistryDraftItemFromCard(card) {
  const key = card?.dataset.codeScreenRegistryKey;
  if (!key) {
    return null;
  }
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const item = {};
  for (const input of card.querySelectorAll("[data-code-screen-registry-field]")) {
    item[input.dataset.codeScreenRegistryField] = input.value;
  }
  if (key === "helpers" && nodeGraphCodeScreenCurrentSection() === "snippets") {
    item.namespace = "snippet";
  }
  return config.normalizer(item, Number(card.dataset.codeScreenRegistryIndex) + 1 || 1);
}

function renderNodeGraphCodeScreen() {
  const view = document.getElementById("nodeCodeScreenView");
  if (!view) {
    return;
  }
  const sectionId = nodeGraphCodeScreenCurrentSection();
  const section = nodeGraphCodeScreenSections.find((candidate) => candidate.id === sectionId);
  const body = document.getElementById("nodeCodeScreenBody");
  renderNodeGraphCodeScreenSections();
  setNodeGraphCodeScreenHeading(section);
  body?.replaceChildren();
  if (!body) {
    return;
  }
  if (sectionId === "codeblocks") {
    renderNodeGraphCodeScreenCodeblocks(body);
  } else if (sectionId === "helpers") {
    renderNodeGraphCodeScreenHelpers(body);
    renderNodeGraphCodeScreenRegistry(body, sectionId);
  } else if (sectionId === "snippets") {
    renderNodeGraphCodeScreenSnippets(body);
  } else if (sectionId === "script") {
    renderNodeGraphCodeScreenWorkspaceScript(body);
  } else {
    renderNodeGraphCodeScreenRegistry(body, sectionId);
  }
}

function openNodeGraphCodeScreenLanding() {
  nodeGraphMvp.codeScreenSection = "codeblocks";
  setNodeGraphViewMode("code");
}

function setNodeGraphCodeScreenSection(sectionId) {
  if (!nodeGraphCodeScreenSections.some((section) => section.id === sectionId)) {
    return;
  }
  nodeGraphMvp.codeScreenSection = sectionId;
  renderNodeGraphCodeScreen();
}

function openNodeGraphCodeScreenForNode(nodeId = "") {
  const node = nodeGraphPatchNode(nodeId || nodeGraphModuleActionTargetNodeId());
  if (node && Object.hasOwn(nodeGraphCodeScreenCodeBoxKinds, node.type)) {
    nodeGraphMvp.codeScreenSelectedNodeId = node.id;
  }
  nodeGraphMvp.codeScreenSection = "codeblocks";
  closeNodeSceneContextMenu();
  setNodeGraphViewMode("code");
}

function nodeGraphCodeScreenUpdateCodeStatus() {
  const node = nodeGraphCodeScreenSelectedCodeblock();
  const source = document.getElementById("nodeCodeScreenCodeblockSource");
  const statusOutput = document.getElementById("nodeCodeScreenCodeblockStatus");
  if (!node || !source || !statusOutput) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(node);
  const current = kind.normalize(node[kind.property]);
  const danglingNamespace = /(^|[^A-Za-z0-9_$])([A-Za-z][A-Za-z0-9_]*)\.\s*$/.exec(source.value);
  const status = danglingNamespace
    ? { ok: false, message: `choose a ${danglingNamespace[2]}. helper` }
    : kind.compileStatus({ ...current, code: source.value });
  statusOutput.textContent = status.ok ? "code ok" : `compile error: ${status.message}`;
  statusOutput.className = status.ok ? "ok" : "error";
  updateNodeGraphCodeScreenCodeblockDraftState(
    node,
    nodeGraphCodeScreenCodeblockDraftFromInputs(node),
    status,
  );
}

function resetNodeGraphCodeScreenCodeblockDraft() {
  const node = nodeGraphCodeScreenSelectedCodeblock();
  if (!node) {
    return;
  }
  closeNodeGraphCodeScreenAutocomplete();
  renderNodeGraphCodeScreen();
  queueMicrotask(() => {
    const status = document.getElementById("nodeCodeScreenCodeblockStatus");
    if (status) {
      status.textContent = "draft reset";
      status.className = "ok";
    }
  });
}

function applyNodeGraphCodeScreenCodeblockPorts() {
  const sourceNode = nodeGraphCodeScreenSelectedCodeblock();
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
    inputs: document.getElementById("nodeCodeScreenCodeblockInputs")?.value,
    outputs: document.getElementById("nodeCodeScreenCodeblockOutputs")?.value,
  });
  targetNode[kind.property] = next;
  kind.pruneConnections(patch, targetNode.id, next.inputs, next.outputs);
  commitNodeGraphPatch(patch, { status: `code screen ${kind.label.toLowerCase()} ports changed` });
}

function applyNodeGraphCodeScreenCodeblockSource() {
  const sourceNode = nodeGraphCodeScreenSelectedCodeblock();
  const source = document.getElementById("nodeCodeScreenCodeblockSource");
  if (!sourceNode || !source) {
    return;
  }
  const kind = nodeGraphCodeScreenKindForNode(sourceNode);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const current = kind.normalize(targetNode[kind.property]);
  targetNode[kind.property] = kind.normalize({
    ...current,
    code: source.value,
  });
  const status = kind.compileStatus(targetNode[kind.property]);
  commitNodeGraphPatch(patch, {
    status: status.ok ? `code screen ${kind.label.toLowerCase()} code changed` : "code screen compile error",
  });
}

function applyNodeGraphCodeScreenCodeblockAll() {
  const sourceNode = nodeGraphCodeScreenSelectedCodeblock();
  const source = document.getElementById("nodeCodeScreenCodeblockSource");
  if (!sourceNode || !source) {
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
    code: source.value,
    inputs: document.getElementById("nodeCodeScreenCodeblockInputs")?.value,
    outputs: document.getElementById("nodeCodeScreenCodeblockOutputs")?.value,
  });
  targetNode[kind.property] = next;
  kind.pruneConnections(patch, targetNode.id, next.inputs, next.outputs);
  const status = kind.compileStatus(next);
  commitNodeGraphPatch(patch, {
    status: status.ok ? `code screen ${kind.label.toLowerCase()} changed` : "code screen compile error",
  });
}

function applyNodeGraphCodeScreenWorkspaceScript() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  const language = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
  const status = document.getElementById("nodeCodeScreenWorkspaceScriptStatus");
  if (!source) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  codeScreen.script = String(source.value || "");
  codeScreen.scriptLanguage = normalizeNodeGraphCodeScreenLanguage(language?.value || codeScreen.scriptLanguage);
  patch.codeScreen = codeScreen;
  nodeGraphMvp.codeScreenWorkspaceScriptStatus = "script saved";
  commitNodeGraphPatch(patch, { status: "code screen workspace script changed" });
  if (status) {
    status.textContent = "script saved";
    status.className = "ok";
  }
  updateNodeGraphCodeScreenWorkspaceScriptStats();
  updateNodeGraphCodeScreenWorkspaceScriptDraftState();
}

function nodeGraphCodeScreenRegistryIdForUpsert(value, normalizer, index = 1) {
  return normalizer(value, index)?.id || "";
}

function nodeGraphCodeScreenUpsertRegistryItem(list, value, normalizer) {
  const items = [...(list || [])];
  const id = nodeGraphCodeScreenRegistryIdForUpsert(value, normalizer, items.length + 1);
  const existingIndex = id ? items.findIndex((item) => item.id === id) : -1;
  if (existingIndex >= 0) {
    items[existingIndex] = normalizer({ ...items[existingIndex], ...(value || {}), id }, existingIndex + 1);
    return items;
  }
  items.push(normalizer(nodeGraphCodeScreenUniqueRegistryValue(items, value), items.length + 1));
  return items;
}

function nodeGraphCodeScreenConsoleValueText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "undefined";
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function nodeGraphCodeScreenConsoleTableText(value) {
  if (!value || typeof value !== "object") {
    return nodeGraphCodeScreenConsoleValueText(value);
  }
  const rows = Array.isArray(value)
    ? value.slice(0, 8).map((item, index) => ({ index, value: item }))
    : Object.entries(value).slice(0, 8).map(([key, item]) => ({ key, value: item }));
  if (!rows.length) {
    return Array.isArray(value) ? "[]" : "{}";
  }
  return rows.map((row) => {
    const label = Object.prototype.hasOwnProperty.call(row, "key") ? row.key : row.index;
    return `${label}: ${nodeGraphCodeScreenValuePreview(row.value, 140)}`;
  }).join(" | ");
}

function nodeGraphCodeScreenConsoleLine(level, values) {
  const prefix = level === "error" ? "error" : level === "warn" ? "warn" : level === "inspect" ? "inspect" : level === "table" ? "table" : level === "test" ? "test" : "log";
  const text = values.map(nodeGraphCodeScreenConsoleValueText).join(" ");
  return `[${prefix}] ${text}`;
}

function nodeGraphCodeScreenInspectLine(name, value) {
  const label = String(name || "value").trim() || "value";
  return nodeGraphCodeScreenConsoleLine("inspect", [`${label} =`, value]);
}

function setNodeGraphCodeScreenWorkspaceConsole(lines) {
  const next = (Array.isArray(lines) ? lines : [String(lines || "")])
    .filter(Boolean)
    .slice(-80)
    .join("\n") || "console ready";
  nodeGraphMvp.codeScreenWorkspaceConsole = next;
  const output = document.getElementById("nodeCodeScreenWorkspaceConsoleOutput");
  if (output) {
    output.textContent = next;
  }
}

function setNodeGraphCodeScreenWorkspaceWatches(watches) {
  nodeGraphMvp.codeScreenWorkspaceWatches = (Array.isArray(watches) ? watches : [])
    .filter((watch) => watch && typeof watch === "object")
    .slice(-96);
}

function clearNodeGraphCodeScreenWorkspaceConsole() {
  setNodeGraphCodeScreenWorkspaceConsole(["console ready"]);
}

async function copyNodeGraphCodeScreenWorkspaceConsoleMarkdown() {
  const consoleText = String(nodeGraphMvp.codeScreenWorkspaceConsole || "console ready").trim();
  if (!consoleText) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("console empty");
    return;
  }
  const markdown = nodeGraphCodeScreenMarkdownFence(consoleText, "text");
  try {
    await copyTextToClipboard(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("console markdown copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("console markdown selected");
  }
}

function clearNodeGraphCodeScreenWorkspaceWatches() {
  setNodeGraphCodeScreenWorkspaceWatches([]);
  renderNodeGraphCodeScreen();
}

function nodeGraphCodeScreenPatchNodeSummary(node) {
  return {
    id: String(node?.id || ""),
    title: nodeGraphPatchNodeTitle(node),
    type: String(node?.type || ""),
    x: Number(node?.position?.x ?? node?.x ?? 0),
    y: Number(node?.position?.y ?? node?.y ?? 0),
  };
}

function nodeGraphCodeScreenPatchConnectionSummary(connection) {
  return {
    from: String(connection?.from || ""),
    fromNode: String(connection?.fromNode || connection?.sourceNode || ""),
    fromPort: String(connection?.fromPort || connection?.sourcePort || ""),
    to: String(connection?.to || ""),
    toNode: String(connection?.toNode || connection?.targetNode || ""),
    toPort: String(connection?.toPort || connection?.targetPort || ""),
  };
}

function nodeGraphCodeScreenPatchQueryMatch(node, query) {
  if (!query) {
    return true;
  }
  const summary = nodeGraphCodeScreenPatchNodeSummary(node);
  if (typeof query === "string") {
    const needle = query.toLowerCase();
    return [summary.id, summary.type, summary.title].some((value) => value.toLowerCase().includes(needle));
  }
  if (query && typeof query === "object") {
    return Object.entries(query).every(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return true;
      }
      const actual = String(summary[key] ?? node?.[key] ?? "").toLowerCase();
      return actual.includes(String(value).toLowerCase());
    });
  }
  return false;
}

function nodeGraphCodeScreenWorkspacePatchApi() {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const nodes = Array.isArray(patch.nodes) ? patch.nodes : [];
  const connections = Array.isArray(patch.connections) ? patch.connections : [];
  const planned = [];
  const summary = () => {
    const typeCounts = nodes.reduce((counts, node) => {
      const type = String(node?.type || "unknown");
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
    return {
      connections: connections.length,
      modules: nodes.length,
      planned: planned.map((item) => ({ ...item })),
      runtime: "read-only",
      typeCounts,
    };
  };
  return {
    clear() {
      const action = {
        action: "clear",
        runtime: "plan only",
        wouldRemoveConnections: connections.length,
        wouldRemoveModules: nodes.length,
      };
      planned.push(action);
      return { ...action };
    },
    clone() {
      return cloneNodeGraphPatch(patch);
    },
    connect(source, destination) {
      const action = {
        action: "connect",
        from: String(source || "").trim(),
        runtime: "plan only",
        to: String(destination || "").trim(),
      };
      planned.push(action);
      return { ...action };
    },
    connections() {
      return connections.map(nodeGraphCodeScreenPatchConnectionSummary);
    },
    countByType() {
      return { ...summary().typeCounts };
    },
    findNode(id) {
      const match = nodes.find((node) => String(node?.id || "") === String(id || ""));
      return match ? nodeGraphCodeScreenPatchNodeSummary(match) : null;
    },
    findNodes(query = "") {
      return nodes.filter((node) => nodeGraphCodeScreenPatchQueryMatch(node, query))
        .map(nodeGraphCodeScreenPatchNodeSummary);
    },
    nodes() {
      return nodes.map(nodeGraphCodeScreenPatchNodeSummary);
    },
    summary,
  };
}

function nodeGraphCodeScreenWorkspaceModuleApi(patchApi, circuitApi) {
  return {
    all() {
      return patchApi.nodes();
    },
    find(id) {
      return patchApi.findNode(id);
    },
    plan(type, id, params = {}) {
      return circuitApi.module(type, id, params);
    },
  };
}

function nodeGraphCodeScreenWorkspaceCircuitApi() {
  let planName = "Circuit Plan";
  const modules = [];
  const connections = [];
  const moduleHandle = (module) => ({
    id: module.id,
    in(port = "In") {
      return `${module.id}.${port}`;
    },
    out(port = "Out") {
      return `${module.id}.${port}`;
    },
    param(name, value) {
      module.params[name] = value;
      return this;
    },
    ref: module,
  });
  // The real osc module's `waveform` param is a numeric index into this
  // exact choice list (node-graph-module-definitions.js), not a name --
  // this lets circuit.osc() callers keep writing "saw"/"triangle"/etc.
  const oscWaveformIndex = Object.freeze({
    saw: 0, ramp: 1, square: 2, triangle: 3, sine: 4, noise: 5,
  });
  const normalizeOscParams = (params = {}) => {
    const source = params && typeof params === "object" ? params : {};
    if (!Object.hasOwn(source, "waveform") || typeof source.waveform !== "string") {
      return source;
    }
    const index = oscWaveformIndex[source.waveform.trim().toLowerCase()];
    return index === undefined ? source : { ...source, waveform: index };
  };
  const addModule = (type, id, params = {}) => {
    const typeText = String(type || "module").trim() || "module";
    const idText = normalizeNodeGraphCodeScreenId(id || `${typeText}-${modules.length + 1}`, `${typeText}-${modules.length + 1}`);
    const module = {
      id: idText,
      params: params && typeof params === "object" ? { ...params } : {},
      type: typeText,
    };
    modules.push(module);
    return moduleHandle(module);
  };
  const api = {
    connect(from, to) {
      const connection = {
        from: String(from || "").trim(),
        to: String(to || "").trim(),
      };
      connections.push(connection);
      return connection;
    },
    create(name = "Circuit Plan") {
      planName = String(name || "Circuit Plan").trim() || "Circuit Plan";
      modules.length = 0;
      connections.length = 0;
      return api;
    },
    // The real gain module's amplitude param is keyed "amount" (labeled
    // "Amplitude" in the UI, hence the friendlier param name here).
    gain(id = "gain", amplitude = 1) {
      return addModule("gain", id, { amount: Number(amplitude) || 0 });
    },
    module(type, id, params = {}) {
      return addModule(type, id, type === "osc" ? normalizeOscParams(params) : params);
    },
    osc(id = "osc", params = {}) {
      return addModule("osc", id, normalizeOscParams({
        frequency: 220,
        waveform: "sine",
        ...(params && typeof params === "object" ? params : {}),
      }));
    },
    output(id = "output") {
      return addModule("output", id, {});
    },
    plan(name = planName) {
      return {
        connections: connections.map((connection) => ({ ...connection })),
        modules: modules.map((module) => ({
          id: module.id,
          params: { ...module.params },
          type: module.type,
        })),
        name: String(name || planName || "Circuit Plan"),
        runtime: "plan only",
      };
    },
    // Commits a plan (this circuit's own, or one handed in -- e.g. the
    // output of patch.makeLead(...)/recipe.run(...)) to the real patch:
    // spawns a real node per planned module (showNodeGraphModule assigns
    // the real id; plan ids like "lead-osc" only exist to label
    // connections within the plan), applies each module's planned params,
    // then wires up every planned connection via the plan-id -> real-id
    // map. Best-effort -- an unknown module type or a connection that
    // can't resolve is recorded in `errors` instead of throwing, so one
    // bad entry doesn't abandon the rest of the circuit.
    apply(planToApply = null) {
      const target = planToApply || api.plan();
      const idMap = {};
      const errors = [];
      for (const moduleSpec of target.modules || []) {
        // A patch has exactly one "output" node, id always "output" -- a
        // planned output module isn't a new node, it's a reference to the
        // one that already exists (showNodeGraphModule would throw trying
        // to create a second one).
        if (moduleSpec.type === "output") {
          idMap[moduleSpec.id] = "output";
          continue;
        }
        const realId = showNodeGraphModule(moduleSpec.type, null, {
          status: `circuit: added ${moduleSpec.type}`,
        });
        if (!realId) {
          errors.push(`could not create module type "${moduleSpec.type}" (unknown type?)`);
          continue;
        }
        idMap[moduleSpec.id] = realId;
      }
      const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
      for (const moduleSpec of target.modules || []) {
        const realId = idMap[moduleSpec.id];
        const patchNode = realId ? patch.nodes.find((node) => node.id === realId) : null;
        if (patchNode && moduleSpec.params && Object.keys(moduleSpec.params).length) {
          patchNode.params = { ...patchNode.params, ...moduleSpec.params };
        }
      }
      commitNodeGraphPatch(patch, { status: `circuit "${target.name}" applied` });
      let connected = 0;
      for (const connection of target.connections || []) {
        const [fromId, fromPort] = String(connection.from || "").split(".");
        const [toId, toPort] = String(connection.to || "").split(".");
        const realFrom = idMap[fromId];
        const realTo = idMap[toId];
        if (realFrom && realTo && fromPort && toPort && connectNodeGraphPorts(realFrom, fromPort, realTo, toPort)) {
          connected += 1;
        } else if (fromId && toId) {
          errors.push(`could not connect ${connection.from} -> ${connection.to}`);
        }
      }
      return {
        connections: connected,
        errors,
        idMap: { ...idMap },
        modules: Object.keys(idMap).length,
        name: target.name,
        runtime: "applied",
      };
    },
  };
  return api;
}

function nodeGraphCodeScreenWorkspaceAudioApi() {
  const noteOffsets = {
    c: 0,
    "c#": 1,
    db: 1,
    d: 2,
    "d#": 3,
    eb: 3,
    e: 4,
    f: 5,
    "f#": 6,
    gb: 6,
    g: 7,
    "g#": 8,
    ab: 8,
    a: 9,
    "a#": 10,
    bb: 10,
    b: 11,
  };
  const noteToMidi = (note = 69) => {
    if (Number.isFinite(Number(note))) {
      return Number(note);
    }
    const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(note || "").trim());
    if (!match) {
      return 69;
    }
    const key = `${match[1].toLowerCase()}${match[2].toLowerCase()}`;
    const octave = Number(match[3]);
    return ((octave + 1) * 12) + (noteOffsets[key] ?? 0);
  };
  return {
    clamp(value, min = -1, max = 1) {
      const low = Math.min(Number(min), Number(max));
      const high = Math.max(Number(min), Number(max));
      return Math.min(high, Math.max(low, Number(value) || 0));
    },
    dbToGain(db = 0) {
      return 10 ** (Number(db || 0) / 20);
    },
    gainToDb(gain = 1) {
      const safeGain = Math.max(Number(gain) || 0, 1e-12);
      return 20 * Math.log10(safeGain);
    },
    hzToMidi(hz = 440, tuning = 440) {
      const safeHz = Math.max(Number(hz) || 0, 1e-12);
      const safeTuning = Math.max(Number(tuning) || 440, 1e-12);
      return 69 + (12 * Math.log2(safeHz / safeTuning));
    },
    midiToHz(note = 69, tuning = 440) {
      return (Number(tuning) || 440) * (2 ** ((Number(note) - 69) / 12));
    },
    noteToHz(note = 69, tuning = 440) {
      return this.midiToHz(noteToMidi(note), tuning);
    },
    noteToMidi,
  };
}

function nodeGraphCodeScreenWorkspaceLeadRecipe({ audio, circuit, tags, visual }) {
  return function makeLead(options = {}) {
    const value = options && typeof options === "object" ? options : {};
    const note = String(value.note || "C3").trim() || "C3";
    const tone = String(value.tone || "bright").trim().toLowerCase() || "bright";
    const name = String(value.name || `${note} ${tone} lead`).trim();
    const frequency = audio.noteToHz(note);
    const waveform = value.waveform || (tone === "dark" ? "triangle" : tone === "hollow" ? "square" : "saw");
    const cutoff = Number(value.cutoff ?? (tone === "dark" ? 650 : tone === "soft" ? 950 : 1800));
    const amplitude = Number(value.amplitude ?? 0.35);
    circuit.create(name);
    const osc = circuit.osc("lead-osc", { frequency, note, waveform });
    const toneStage = circuit.module("passiveFilter", "lead-tone", { highFrequency: cutoff });
    const amp = circuit.gain("lead-amp", amplitude);
    const out = circuit.output("lead-out");
    circuit.connect(osc.out("Out"), toneStage.in("In"));
    circuit.connect(toneStage.out("Out"), amp.in("In"));
    circuit.connect(amp.out("Out"), out.in("Mono"));
    const scope = visual.scope("lead scope", { source: amp.out("Out") });
    const metadata = tags.parse(`patch,circuit,lead,note=${note},tone=${tone}`);
    return {
      circuit: circuit.plan(name),
      frequency,
      metadata,
      note,
      runtime: "plan only",
      scope,
      tone,
    };
  };
}

function nodeGraphCodeScreenWorkspaceEnvelopeRecipe({ circuit, tags, visual }) {
  return function makeEnvelope(options = {}) {
    const value = options && typeof options === "object" ? options : {};
    const name = String(value.name || "sample envelope").trim() || "sample envelope";
    const attack = Math.max(0, Number(value.attack ?? 0.02) || 0);
    const decay = Math.max(0, Number(value.decay ?? 0.12) || 0);
    const sustain = Math.max(0, Math.min(1, Number(value.sustain ?? 0.7) || 0));
    const release = Math.max(0, Number(value.release ?? 0.35) || 0);
    const level = Number(value.level ?? 1) || 1;
    const curve = String(value.curve || "analog").trim() || "analog";
    circuit.create(name);
    // expAdsr's Gate input and the final gain's Out are left unwired --
    // applied at the top level (not inside a Module Group) there's no
    // "the" gate source or downstream consumer to guess at, so those two
    // ports are exposed for whoever applies this plan to wire by hand.
    const envelope = circuit.module("expAdsr", "env-shape", { attack, decay, release, sustain });
    const amp = circuit.gain("env-level", level);
    circuit.connect(envelope.out("Out"), amp.in("In"));
    const scope = visual.scope("envelope scope", { source: amp.out("Out") });
    const metadata = tags.parse(`patch,circuit,envelope,curve=${curve}`);
    return {
      attack,
      circuit: circuit.plan(name),
      curve,
      decay,
      metadata,
      release,
      runtime: "plan only",
      scope,
      sustain,
    };
  };
}

function nodeGraphCodeScreenWorkspaceVisualApi() {
  const scopes = [];
  return {
    scope(name = "scope", options = {}) {
      const scope = {
        name: String(name || "scope"),
        options: options && typeof options === "object" ? { ...options } : {},
        runtime: "plan only",
        type: "scope",
      };
      scopes.push(scope);
      return { ...scope, options: { ...scope.options } };
    },
    scopes() {
      return scopes.map((scope) => ({ ...scope, options: { ...scope.options } }));
    },
  };
}

function nodeGraphCodeScreenWorkspaceTagsApi() {
  const parse = (value = "") => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ...value };
    }
    const result = {};
    String(value || "")
      .split(/[`,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const match = /^([^:=\s]+)\s*[:=]\s*(.+)$/.exec(part);
        if (match) {
          result[match[1]] = match[2];
          return;
        }
        part.split(/\s+/).filter(Boolean).forEach((token) => {
          result[token] = true;
        });
      });
    return result;
  };
  return {
    parse,
    stringify(value = {}) {
      return Object.entries(parse(value))
        .map(([key, item]) => item === true ? key : `${key}=${item}`)
        .join(",");
    },
    validate(value = {}, required = []) {
      const tags = parse(value);
      const missing = (Array.isArray(required) ? required : [required])
        .map((key) => String(key || "").trim())
        .filter((key) => key && !(key in tags));
      return {
        missing,
        ok: missing.length === 0,
        tags,
      };
    },
  };
}

function nodeGraphCodeScreenWorkspaceScriptBuilders() {
  const logs = [];
  const consoleApi = {
    clear() {
      logs.length = 0;
      return { ok: true };
    },
    error(...values) {
      logs.push(nodeGraphCodeScreenConsoleLine("error", values));
    },
    log(...values) {
      logs.push(nodeGraphCodeScreenConsoleLine("log", values));
    },
    warn(...values) {
      logs.push(nodeGraphCodeScreenConsoleLine("warn", values));
    },
  };
  const audio = nodeGraphCodeScreenWorkspaceAudioApi();
  const circuit = nodeGraphCodeScreenWorkspaceCircuitApi();
  const patch = nodeGraphCodeScreenWorkspacePatchApi();
  const module = nodeGraphCodeScreenWorkspaceModuleApi(patch, circuit);
  const tags = nodeGraphCodeScreenWorkspaceTagsApi();
  const visual = nodeGraphCodeScreenWorkspaceVisualApi();
  patch.makeLead = nodeGraphCodeScreenWorkspaceLeadRecipe({ audio, circuit, tags, visual });
  patch.makeEnvelope = nodeGraphCodeScreenWorkspaceEnvelopeRecipe({ circuit, tags, visual });
  const recipeDefinitions = Object.freeze([
    {
      category: "voice",
      description: "Lead voice with oscillator, tone stage, gain, output, and scope.",
      name: "lead",
      signature: "recipe.run(\"lead\", { note, tone })",
    },
    {
      category: "envelope",
      description: "Exponential ADSR into a gain stage. Gate input and Out are left unwired for you to connect.",
      name: "envelope",
      signature: "recipe.run(\"envelope\", { attack, decay, sustain, release })",
    },
  ]);
  const recipe = {
    list() {
      return recipeDefinitions.map((item) => ({ ...item, runtime: "plan only" }));
    },
    markdown() {
      return [
        "# Easy Patch Recipes",
        "",
        ...this.list().flatMap((item) => [
          `## ${item.name}`,
          "",
          `category: ${item.category}`,
          `signature: ${item.signature}`,
          "",
          item.description,
          "",
        ]),
      ].join("\n").trim();
    },
    run(name = "", options = {}) {
      const key = String(name || "").trim().toLowerCase();
      if (key === "lead") {
        return patch.makeLead(options);
      }
      if (key === "envelope") {
        return patch.makeEnvelope(options);
      }
      return {
        error: `recipe not found: ${key || "unnamed"}`,
        name: key,
        runtime: "plan only",
      };
    },
  };
  return {
    api: { audio, circuit, console: consoleApi, module, patch, recipe, tags, visual },
    logs,
  };
}

function nodeGraphCodeScreenMergeWorkspaceScriptResult(staged, result) {
  if (!result || typeof result !== "object") {
    return staged;
  }
  for (const key of ["helpers", "patchTools", "samples", "snippets", "slots", "slotsRemoved", "ui"]) {
    const value = result[key];
    if (Array.isArray(value)) {
      staged[key].push(...value.filter((item) => item && typeof item === "object"));
    } else if (value && typeof value === "object") {
      staged[key].push(value);
    }
  }
  return staged;
}

function nodeGraphCodeScreenApplyWorkspaceScriptBuild(codeScreen, staged) {
  let applied = 0;
  for (const helper of staged.helpers || []) {
    codeScreen.helpers = nodeGraphCodeScreenUpsertRegistryItem(codeScreen.helpers, helper, normalizeNodeGraphCodeScreenHelper);
    applied += 1;
  }
  for (const snippet of staged.snippets || []) {
    const value = {
      category: snippet.category || "saved snippet",
      description: snippet.description || "Reusable snippet generated by Workspace Script.",
      language: snippet.language || "javascript",
      namespace: "snippet",
      signature: snippet.signature || "snippet.generated()",
      source: snippet.source || snippet.snippet || "",
      tags: snippet.tags || "script",
      ...snippet,
    };
    codeScreen.helpers = nodeGraphCodeScreenUpsertRegistryItem(codeScreen.helpers, value, normalizeNodeGraphCodeScreenHelper);
    applied += 1;
  }
  for (const item of staged.ui || []) {
    codeScreen.ui = nodeGraphCodeScreenUpsertRegistryItem(codeScreen.ui, item, normalizeNodeGraphCodeScreenUiSetting);
    applied += 1;
  }
  for (const item of staged.samples || []) {
    codeScreen.samples = nodeGraphCodeScreenUpsertRegistryItem(codeScreen.samples, item, normalizeNodeGraphCodeScreenSample);
    applied += 1;
  }
  for (const item of staged.patchTools || []) {
    codeScreen.patchTools = nodeGraphCodeScreenUpsertRegistryItem(codeScreen.patchTools, item, normalizeNodeGraphCodeScreenPatchTool);
    applied += 1;
  }
  for (const item of staged.slots || []) {
    codeScreen.slots = nodeGraphCodeScreenUpsertRegistryItem(codeScreen.slots, item, normalizeNodeGraphCodeScreenSlot);
    applied += 1;
  }
  for (const item of staged.slotsRemoved || []) {
    const normalized = normalizeNodeGraphCodeScreenSlot(item);
    codeScreen.slots = (codeScreen.slots || []).filter((slot) => !(
      String(slot.workflow || "").toLowerCase() === String(normalized.workflow || "").toLowerCase() &&
      String(slot.area || "").toLowerCase() === String(normalized.area || "").toLowerCase() &&
      String(slot.slot || "").toLowerCase() === String(normalized.slot || "").toLowerCase()
    ));
    applied += 1;
  }
  return applied;
}

function runNodeGraphCodeScreenWorkspaceScriptCode(code, { mode = "script", persist = true, statusPrefix = "script ran" } = {}) {
  const status = document.getElementById("nodeCodeScreenWorkspaceScriptStatus");
  const sourceCode = String(code || "");
  const builders = nodeGraphCodeScreenWorkspaceScriptBuilders();
  const scriptLanguage = nodeGraphCodeScreenWorkspaceScriptLanguage();
  try {
    const fn = Function(
      "audio",
      "circuit",
      "console",
      "module",
      "patch",
      "recipe",
      "tags",
      "visual",
      `"use strict";\n${sourceCode}`,
    );
    fn(
      builders.api.audio,
      builders.api.circuit,
      builders.api.console,
      builders.api.module,
      builders.api.patch,
      builders.api.recipe,
      builders.api.tags,
      builders.api.visual,
    );
  } catch (error) {
    nodeGraphMvp.codeScreenWorkspaceScriptStatus = `run error: ${error?.message || error}`;
    setNodeGraphCodeScreenWorkspaceConsole([
      ...builders.logs,
      nodeGraphCodeScreenConsoleLine("error", [error?.message || error]),
    ]);
    addNodeGraphCodeScreenRunHistory({
      code: sourceCode,
      error: error?.message || error,
      inspections: [],
      language: scriptLanguage,
      logs: builders.logs,
      mode,
      staged: 0,
      tests: [],
    });
    if (status) {
      status.textContent = nodeGraphMvp.codeScreenWorkspaceScriptStatus;
      status.className = "error";
    }
    renderNodeGraphCodeScreen();
    return;
  }
  if (persist) {
    const language = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
    codeScreen.script = sourceCode;
    codeScreen.scriptLanguage = normalizeNodeGraphCodeScreenLanguage(language?.value || scriptLanguage);
    patch.codeScreen = codeScreen;
    commitNodeGraphPatch(patch, { status: "code screen workspace script ran" });
  }
  const logSuffix = builders.logs.length ? ` - ${builders.logs.slice(-1)[0].replace(/^\[[a-z]+\]\s*/i, "")}` : "";
  const message = `${statusPrefix}${logSuffix}`;
  nodeGraphMvp.codeScreenWorkspaceScriptStatus = message;
  nodeGraphMvp.codeScreenLookupStatus = message;
  nodeGraphMvp.codeScreenWorkspaceConsole = builders.logs.length
    ? builders.logs.join("\n")
    : statusPrefix;
  addNodeGraphCodeScreenRunHistory({
    code: sourceCode,
    inspections: [],
    language: scriptLanguage,
    logs: builders.logs,
    mode,
    staged: 0,
    tests: [],
  });
  if (status) {
    status.textContent = message;
    status.className = "ok";
  }
  renderNodeGraphCodeScreen();
}

function runNodeGraphCodeScreenWorkspaceScript() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  if (!source) {
    return;
  }
  runNodeGraphCodeScreenWorkspaceScriptCode(source.value, { mode: "script", persist: true, statusPrefix: "script ran" });
}

function runNodeGraphCodeScreenSelectedWorkspaceScript() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  if (!source) {
    return;
  }
  const selected = nodeGraphCodeScreenStrictSelectedWorkspaceScriptText();
  if (!selected) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("select code to run");
    return;
  }
  runNodeGraphCodeScreenWorkspaceScriptCode(selected, { mode: "selection", persist: false, statusPrefix: "selection ran" });
}

function resetNodeGraphCodeScreenWorkspaceScriptDraft() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  const language = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
  if (!source) {
    return;
  }
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  source.value = codeScreen.script;
  if (language) {
    language.value = codeScreen.scriptLanguage;
  }
  nodeGraphCodeScreenUpdateWorkspaceScriptStatus("draft reset");
  updateNodeGraphCodeScreenWorkspaceScriptStats();
  updateNodeGraphCodeScreenWorkspaceScriptDraftState();
  closeNodeGraphCodeScreenAutocomplete();
}

function updateNodeGraphCodeScreenWorkspaceScriptStats() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  const language = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
  const fence = document.getElementById("nodeCodeScreenWorkspaceScriptFence");
  const stats = document.getElementById("nodeCodeScreenWorkspaceScriptStats");
  if (source && stats) {
    const languageText = nodeGraphCodeScreenMarkdownLanguage(language?.value || "javascript");
    stats.textContent = `${nodeGraphCodeScreenSourceStatsText(source.value)} - markdown: ${languageText}`;
  }
  if (language && fence) {
    fence.textContent = nodeGraphCodeScreenMarkdownLanguage(language.value);
  }
}

function updateNodeGraphCodeScreenWorkspaceScriptDraftState() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  const language = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
  const state = document.getElementById("nodeCodeScreenWorkspaceScriptDraftState");
  const status = document.getElementById("nodeCodeScreenWorkspaceScriptStatus");
  if (!source || !state) {
    return;
  }
  const saved = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const changed = String(source.value || "") !== String(saved.script || "") ||
    nodeGraphCodeScreenMarkdownLanguage(language?.value || "javascript") !== saved.scriptLanguage;
  state.textContent = changed ? "unapplied script changes" : "script matches saved patch";
  state.className = changed
    ? "node-code-screen-script-draft-state changed"
    : "node-code-screen-script-draft-state";
  if (status && changed) {
    status.textContent = "script has unapplied changes";
    status.className = "changed";
  }
}

function nodeGraphCodeScreenSelectedWorkspaceScriptText() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  if (!source) {
    return "";
  }
  const start = source.selectionStart ?? 0;
  const end = source.selectionEnd ?? start;
  return (end > start ? source.value.slice(start, end) : source.value).trim();
}

function nodeGraphCodeScreenStrictSelectedWorkspaceScriptText() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  if (!source) {
    return "";
  }
  const start = source.selectionStart ?? 0;
  const end = source.selectionEnd ?? start;
  return end > start ? source.value.slice(start, end).trim() : "";
}

function nodeGraphCodeScreenSnippetValueFromSource(snippet, description, tags = "", language = "javascript") {
  const firstLine = snippet.split(/\r?\n/).find((line) => line.trim())?.trim() || "Saved Snippet";
  const label = firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
  const signatureName = label.replace(/[^A-Za-z0-9_$]+/g, "_").replace(/^_+|_+$/g, "") || "saved";
  const id = nodeGraphCodeScreenSnippetIdFromSource(firstLine);
  return {
    category: nodeGraphCodeScreenHasTag(tags, "pinned") ? "pinned snippet" : "saved snippet",
    description,
    id,
    language: nodeGraphCodeScreenMarkdownLanguage(language),
    name: label,
    namespace: "snippet",
    signature: `${signatureName}()`,
    source: snippet,
    tags,
  };
}

function nodeGraphCodeScreenSnippetIdFromSource(firstLine) {
  const compact = String(firstLine || "")
    .replace(/["'`]/g, "")
    .replace(/\b(const|let|var|return|await|async|function)\b/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalizeNodeGraphCodeScreenId(compact, "saved-snippet");
}

function saveNodeGraphCodeScreenSnippetSource(snippet, description, commitStatus, tags = "", language = "javascript") {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const helpers = [...(codeScreen.helpers || [])];
  const value = nodeGraphCodeScreenUniqueRegistryValue(
    helpers,
    nodeGraphCodeScreenFreshHelper(nodeGraphCodeScreenSnippetValueFromSource(snippet, description, tags, language)),
  );
  helpers.push(normalizeNodeGraphCodeScreenHelper(value, helpers.length + 1));
  codeScreen.helpers = helpers;
  patch.codeScreen = codeScreen;
  commitNodeGraphPatch(patch, { status: commitStatus });
}

function nodeGraphCodeScreenWorkspaceScriptLanguage() {
  const input = document.getElementById("nodeCodeScreenWorkspaceScriptLanguage");
  const saved = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen).scriptLanguage;
  return nodeGraphCodeScreenMarkdownLanguage(input?.value || saved || "javascript");
}

async function copyNodeGraphCodeScreenWorkspaceScriptMarkdown() {
  const source = nodeGraphCodeScreenSelectedWorkspaceScriptText();
  if (!source) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("nothing to copy");
    return;
  }
  const markdown = nodeGraphCodeScreenMarkdownFence(source, nodeGraphCodeScreenWorkspaceScriptLanguage());
  try {
    await copyTextToClipboard(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("script markdown copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("script markdown selected");
  }
}

async function copyNodeGraphCodeScreenWorkspaceDebugReport() {
  const markdown = nodeGraphCodeScreenWorkspaceDebugReportMarkdown();
  try {
    await copyTextToClipboard(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("debug report copied");
  } catch (_error) {
    selectNodeGraphCodeScreenCopyFallback(markdown);
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("debug report selected");
  }
}

function saveNodeGraphCodeScreenWorkspaceSnippet() {
  return saveNodeGraphCodeScreenWorkspaceSnippetWithTags("workspace", "snippet saved");
}

function saveNodeGraphCodeScreenWorkspacePinnedSnippet() {
  return saveNodeGraphCodeScreenWorkspaceSnippetWithTags("workspace pinned", "snippet saved + pinned");
}

function saveNodeGraphCodeScreenWorkspaceSnippetWithTags(tags, message) {
  const snippet = nodeGraphCodeScreenSelectedWorkspaceScriptText();
  const status = document.getElementById("nodeCodeScreenWorkspaceScriptStatus");
  if (!snippet) {
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("nothing to save");
    return false;
  }
  nodeGraphMvp.codeScreenWorkspaceScriptStatus = message;
  saveNodeGraphCodeScreenSnippetSource(
    snippet,
    "Reusable snippet saved from Workspace Script.",
    "code screen snippet saved",
    tags,
    nodeGraphCodeScreenWorkspaceScriptLanguage(),
  );
  if (status) {
    status.textContent = message;
    status.className = "ok";
  }
  return true;
}

function saveNodeGraphCodeScreenCodeblockSnippet() {
  return saveNodeGraphCodeScreenCodeblockSnippetWithTags("codeblock", "snippet saved");
}

function saveNodeGraphCodeScreenCodeblockPinnedSnippet() {
  return saveNodeGraphCodeScreenCodeblockSnippetWithTags("codeblock pinned", "snippet saved + pinned");
}

function saveNodeGraphCodeScreenCodeblockSnippetWithTags(tags, message) {
  const source = document.getElementById("nodeCodeScreenCodeblockSource");
  const status = document.getElementById("nodeCodeScreenCodeblockStatus");
  const snippet = String(source?.value || "").trim();
  if (!snippet) {
    if (status) {
      status.textContent = "nothing to save";
      status.className = "error";
    }
    return false;
  }
  saveNodeGraphCodeScreenSnippetSource(
    snippet,
    "Reusable snippet saved from a debug Codeblock.",
    "code screen codeblock snippet saved",
    tags,
  );
  const nextStatus = document.getElementById("nodeCodeScreenCodeblockStatus") || status;
  if (nextStatus) {
    nextStatus.textContent = message;
    nextStatus.className = "ok";
  }
  renderNodeGraphCodeScreenSections();
  return true;
}

function saveNodeGraphCodeScreenHelperDetailSnippet() {
  return saveNodeGraphCodeScreenHelperDetailSnippetWithTags("helper", "helper snippet saved");
}

function saveNodeGraphCodeScreenHelperDetailPinnedSnippet() {
  return saveNodeGraphCodeScreenHelperDetailSnippetWithTags("helper pinned", "helper saved + pinned");
}

function saveNodeGraphCodeScreenHelperDetailSnippetWithTags(tags, message) {
  const helper = nodeGraphCodeScreenSelectedHelperDetail();
  const snippet = String(helper?.snippet || helper?.signature || "").trim();
  if (!snippet) {
    nodeGraphMvp.codeScreenLookupStatus = "nothing to save";
    renderNodeGraphCodeScreen();
    return false;
  }
  nodeGraphMvp.codeScreenLookupStatus = message;
  saveNodeGraphCodeScreenSnippetSource(
    snippet,
    "Reusable snippet saved from Helper lookup.",
    "code screen helper snippet saved",
    tags,
  );
  if (nodeGraphCodeScreenHasTag(tags, "pinned")) {
    nodeGraphMvp.codeScreenLookupSearch = "";
  }
  nodeGraphMvp.codeScreenSection = "helpers";
  renderNodeGraphCodeScreen();
  return true;
}

function saveNodeGraphCodeScreenLookupSnippet(snippet, description) {
  return saveNodeGraphCodeScreenLookupSnippetWithTags(snippet, description, "lookup", "snippet saved");
}

function saveNodeGraphCodeScreenLookupPinnedSnippet(snippet, description) {
  return saveNodeGraphCodeScreenLookupSnippetWithTags(snippet, description, "lookup pinned", "snippet saved + pinned");
}

function saveNodeGraphCodeScreenLookupSnippetWithTags(snippet, description, tags, message) {
  const source = String(snippet || "").trim();
  if (!source) {
    updateNodeGraphCodeScreenLookupStatus("nothing to save", false);
    return false;
  }
  nodeGraphMvp.codeScreenLookupStatus = message;
  saveNodeGraphCodeScreenSnippetSource(
    source,
    description || "Reusable snippet saved from sidebar lookup.",
    "code screen lookup snippet saved",
    tags,
  );
  if (nodeGraphCodeScreenHasTag(tags, "pinned")) {
    nodeGraphMvp.codeScreenLookupSearch = "";
  }
  renderNodeGraphCodeScreen();
  return true;
}

async function copyNodeGraphCodeScreenLookupSnippet(snippet) {
  const source = String(snippet || "").trim();
  if (!source) {
    updateNodeGraphCodeScreenLookupStatus("nothing to copy", false);
    return;
  }
  try {
    await copyTextToClipboard(source);
    updateNodeGraphCodeScreenLookupStatus("code copied");
  } catch (error) {
    selectNodeGraphCodeScreenCopyFallback(source);
    updateNodeGraphCodeScreenLookupStatus("code selected");
  }
}

async function copyNodeGraphCodeScreenLookupMarkdownSnippet(snippet, language = "javascript") {
  const source = String(snippet || "").trim();
  if (!source) {
    updateNodeGraphCodeScreenLookupStatus("nothing to copy", false);
    return;
  }
  try {
    await copyTextToClipboard(nodeGraphCodeScreenMarkdownFence(source, language));
    updateNodeGraphCodeScreenLookupStatus("markdown copied");
  } catch (error) {
    selectNodeGraphCodeScreenCopyFallback(nodeGraphCodeScreenMarkdownFence(source, language));
    updateNodeGraphCodeScreenLookupStatus("markdown selected");
  }
}

function openNodeGraphCodeScreenLookupSnippet(index) {
  const match = nodeGraphCodeScreenSnippetItems().find((item) => item.index === index);
  if (!match) {
    updateNodeGraphCodeScreenLookupStatus("snippet not found", false);
    return;
  }
  const helper = match.helper;
  nodeGraphMvp.codeScreenSection = "snippets";
  nodeGraphMvp.codeScreenSnippetSearch = helper.id || helper.name || helper.signature || "";
  nodeGraphMvp.codeScreenLookupStatus = "snippet opened";
  renderNodeGraphCodeScreen();
  queueMicrotask(() => document.querySelector(`[data-code-screen-registry-key="helpers"][data-code-screen-registry-index="${index}"]`)?.scrollIntoView({
    block: "center",
    behavior: "smooth",
  }));
}

function openNodeGraphCodeScreenLookupHelper(helperKey) {
  const helper = nodeGraphCodeScreenAllHelpers()
    .find((candidate) => nodeGraphCodeScreenHelperKey(candidate) === helperKey);
  if (!helper) {
    updateNodeGraphCodeScreenLookupStatus("helper not found", false);
    return;
  }
  nodeGraphMvp.codeScreenSection = "helpers";
  nodeGraphMvp.codeScreenHelperNamespaceFilter = helper.namespace || "";
  nodeGraphMvp.codeScreenHelperSearch = "";
  nodeGraphMvp.codeScreenHelperDetailKey = helperKey;
  nodeGraphMvp.codeScreenLookupStatus = "helper opened";
  renderNodeGraphCodeScreen();
}

function nodeGraphCodeScreenSelectedEditorSnippetText() {
  const source = document.getElementById("nodeCodeScreenCodeblockSource") ||
    document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  if (!source) {
    return "";
  }
  const start = source.selectionStart ?? 0;
  const end = source.selectionEnd ?? start;
  return (end > start ? source.value.slice(start, end) : source.value).trim();
}

function saveNodeGraphCodeScreenLookupSelectionSnippet() {
  return saveNodeGraphCodeScreenLookupSelectionSnippetWithTags("selection", "selection saved");
}

function saveNodeGraphCodeScreenLookupSelectionPinnedSnippet() {
  return saveNodeGraphCodeScreenLookupSelectionSnippetWithTags("selection pinned", "selection saved + pinned");
}

function saveNodeGraphCodeScreenLookupSelectionSnippetWithTags(tags, message) {
  const snippet = nodeGraphCodeScreenSelectedEditorSnippetText();
  if (!snippet) {
    updateNodeGraphCodeScreenLookupStatus("nothing selected", false);
    return false;
  }
  saveNodeGraphCodeScreenSnippetSource(
    snippet,
    "Reusable snippet saved from the active Code Screen editor.",
    "code screen lookup selection snippet saved",
    tags,
  );
  nodeGraphMvp.codeScreenLookupStatus = message;
  if (nodeGraphCodeScreenHasTag(tags, "pinned")) {
    nodeGraphMvp.codeScreenLookupSearch = "";
  }
  renderNodeGraphCodeScreen();
  return true;
}

function focusNodeGraphCodeScreenModule() {
  const node = nodeGraphCodeScreenSelectedCodeblock();
  if (!node) {
    return;
  }
  setNodeGraphNodeSelection([node.id]);
  setNodeGraphViewMode("modular");
}

function createNodeGraphCodeScreenDebugCodeblock() {
  const nodeId = showNodeGraphModule("codeblock", null, { status: "debug codeblock added" });
  if (!nodeId) {
    return;
  }
  nodeGraphMvp.codeScreenSelectedNodeId = nodeId;
  nodeGraphMvp.codeScreenSection = "codeblocks";
  setNodeGraphViewMode("code");
  renderNodeGraphCodeScreen();
}

function addNodeGraphCodeScreenRegistryItem(key) {
  const config = nodeGraphCodeScreenRegistryConfig(
    nodeGraphCodeScreenSections.find((section) => nodeGraphCodeScreenRegistryConfig(section.id).key === key)?.id || "helpers",
  );
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const list = codeScreen[key] || [];
  list.push(config.normalizer({ name: config.addLabel.replace(/^Add\s+/, "") }, list.length + 1));
  codeScreen[key] = list;
  patch.codeScreen = codeScreen;
  commitNodeGraphPatch(patch, { status: "code screen metadata added" });
}

function nodeGraphCodeScreenUniqueRegistryValue(list, value) {
  const used = new Set((list || []).map((item) => item.id).filter(Boolean));
  const next = { ...(value || {}) };
  const baseId = normalizeNodeGraphCodeScreenId(next.id || next.name, "entry");
  let id = baseId;
  let suffix = 2;
  while (used.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  next.id = id;
  return next;
}

function nodeGraphCodeScreenUniqueRegistryId(list, value, index) {
  const used = new Set((list || [])
    .filter((_, itemIndex) => itemIndex !== index)
    .map((item) => item.id)
    .filter(Boolean));
  const baseId = normalizeNodeGraphCodeScreenId(value, "entry");
  let id = baseId;
  let suffix = 2;
  while (used.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function nodeGraphCodeScreenUniqueRegistryDraftItems(key) {
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const drafts = nodeGraphCodeScreenRegistryDraftItems(key);
  const unique = [];
  drafts.forEach((draft, index) => {
    const value = nodeGraphCodeScreenUniqueRegistryValue(unique, draft);
    unique.push(config.normalizer(value, index + 1));
  });
  return unique;
}

function addNodeGraphCodeScreenRegistryTemplate(key, templateIndex) {
  const template = nodeGraphCodeScreenRegistryTemplates[key]?.[templateIndex];
  if (!template) {
    return;
  }
  const config = nodeGraphCodeScreenRegistryConfig(
    nodeGraphCodeScreenSections.find((section) => nodeGraphCodeScreenRegistryConfig(section.id).key === key)?.id || "helpers",
  );
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const list = [...(codeScreen[key] || [])];
  list.push(config.normalizer(nodeGraphCodeScreenUniqueRegistryValue(list, template.value), list.length + 1));
  codeScreen[key] = list;
  patch.codeScreen = codeScreen;
  commitNodeGraphPatch(patch, { status: "code screen template added" });
}

function addNodeGraphCodeScreenSnippetItem() {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const helpers = [...(codeScreen.helpers || [])];
  const value = nodeGraphCodeScreenUniqueRegistryValue(helpers, {
    category: "saved snippet",
    description: "Reusable snippet saved in this patch.",
    id: "snippet",
    name: "Saved Snippet",
    namespace: "snippet",
    language: "javascript",
    signature: "snippet.saved()",
    source: "// reusable snippet",
    updatedAt: nodeGraphCodeScreenNowIso(),
  });
  helpers.push(normalizeNodeGraphCodeScreenHelper(value, helpers.length + 1));
  codeScreen.helpers = helpers;
  patch.codeScreen = codeScreen;
  nodeGraphMvp.codeScreenSection = "snippets";
  commitNodeGraphPatch(patch, { status: "code screen snippet added" });
}

function duplicateNodeGraphCodeScreenSnippetItem(index) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const helpers = [...(codeScreen.helpers || [])];
  const card = document.querySelector(`[data-code-screen-registry-key="helpers"][data-code-screen-registry-index="${index}"]`);
  const source = nodeGraphCodeScreenRegistryDraftItemFromCard(card) || helpers[index];
  if (!source) {
    return;
  }
  const duplicate = nodeGraphCodeScreenUniqueRegistryValue(helpers, {
    ...source,
    id: `${source.id || "snippet"}-copy`,
    name: `${source.name || "Saved Snippet"} Copy`,
    namespace: "snippet",
    updatedAt: nodeGraphCodeScreenNowIso(),
  });
  helpers.push(normalizeNodeGraphCodeScreenHelper(duplicate, helpers.length + 1));
  codeScreen.helpers = helpers;
  patch.codeScreen = codeScreen;
  commitNodeGraphPatch(patch, { status: "code screen snippet duplicated" });
}

function toggleNodeGraphCodeScreenSnippetPinned(index) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const helpers = [...(codeScreen.helpers || [])];
  const item = helpers[index];
  if (!item || (item.namespace || "").toLowerCase() !== "snippet") {
    return;
  }
  const nextTags = nodeGraphCodeScreenToggleTag(item.tags, "pinned");
  const pinned = nodeGraphCodeScreenHasTag(nextTags, "pinned");
  helpers[index] = normalizeNodeGraphCodeScreenHelper({
    ...item,
    tags: nextTags,
    updatedAt: nodeGraphCodeScreenNowIso(),
  }, index + 1);
  codeScreen.helpers = helpers;
  patch.codeScreen = codeScreen;
  nodeGraphMvp.codeScreenLookupStatus = pinned ? "snippet pinned to shelf" : "snippet unpinned";
  nodeGraphMvp.codeScreenRegistryStatus = pinned ? "snippet pinned to shelf" : "snippet unpinned";
  if (pinned) {
    nodeGraphMvp.codeScreenLookupSearch = "";
  }
  commitNodeGraphPatch(patch, { status: "code screen snippet pin changed" });
}

function useNodeGraphCodeScreenSnippetAndReturn(index) {
  const match = nodeGraphCodeScreenSnippetItems().find((item) => item.index === index);
  const snippet = String(match?.helper?.source || match?.helper?.signature || "").trim();
  if (!snippet) {
    updateNodeGraphCodeScreenRegistryStatus("nothing to use", false);
    return;
  }
  const targetSection = nodeGraphCodeScreenSnippetTarget() === "codeblock" ? "codeblocks" : "script";
  nodeGraphMvp.codeScreenSection = targetSection;
  nodeGraphMvp.codeScreenPendingSnippet = snippet;
  nodeGraphMvp.codeScreenRegistryStatus = "snippet inserted";
  renderNodeGraphCodeScreen();
}

function duplicateNodeGraphCodeScreenRegistryItem(key, index) {
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const items = [...(codeScreen[key] || [])];
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  const source = nodeGraphCodeScreenRegistryDraftItemFromCard(card) || items[index];
  if (!source) {
    return;
  }
  const duplicate = nodeGraphCodeScreenUniqueRegistryValue(items, {
    ...source,
    id: `${source.id || key}-copy`,
    name: `${source.name || source.id || "Entry"} Copy`,
  });
  items.push(config.normalizer(duplicate, items.length + 1));
  codeScreen[key] = items;
  patch.codeScreen = codeScreen;
  nodeGraphMvp.codeScreenRegistryStatus = "metadata duplicated";
  commitNodeGraphPatch(patch, { status: "code screen metadata duplicated" });
}

function updateNodeGraphCodeScreenRegistryItem(target) {
  const card = target.closest("[data-code-screen-registry-key]");
  if (!card) {
    return;
  }
  const key = card.dataset.codeScreenRegistryKey;
  const index = Number(card.dataset.codeScreenRegistryIndex);
  if (!key || !Number.isFinite(index)) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const items = [...(codeScreen[key] || [])];
  const item = { ...(items[index] || {}) };
  for (const input of card.querySelectorAll("[data-code-screen-registry-field]")) {
    item[input.dataset.codeScreenRegistryField] = input.value;
  }
  const config = nodeGraphCodeScreenRegistryConfig(nodeGraphCodeScreenCurrentSection());
  if (key === "helpers" && nodeGraphCodeScreenCurrentSection() === "snippets") {
    item.namespace = "snippet";
  }
  item.id = nodeGraphCodeScreenUniqueRegistryId(items, item.id || item.name, index);
  if (key === "helpers") {
    item.updatedAt = nodeGraphCodeScreenNowIso();
  }
  items[index] = config.normalizer({ ...item, id: item.id }, index + 1);
  codeScreen[key] = items;
  patch.codeScreen = codeScreen;
  nodeGraphMvp.codeScreenRegistryStatus = "metadata saved";
  commitNodeGraphPatch(patch, { status: "code screen metadata changed" });
  updateNodeGraphCodeScreenRegistryDraftState(card);
  updateNodeGraphCodeScreenRegistryStatus("metadata saved");
}

function saveNodeGraphCodeScreenRegistryMetadata(key, index) {
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  const firstField = card?.querySelector("[data-code-screen-registry-field]");
  if (!firstField) {
    return;
  }
  updateNodeGraphCodeScreenRegistryItem(firstField);
}

function saveNodeGraphCodeScreenRegistryAllMetadata(key) {
  const cards = document.querySelectorAll(`[data-code-screen-registry-key="${key}"]`);
  if (!key || !cards.length) {
    updateNodeGraphCodeScreenRegistryStatus("no metadata drafts", false);
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  codeScreen[key] = nodeGraphCodeScreenUniqueRegistryDraftItems(key).map((item) => key === "helpers"
    ? nodeGraphCodeScreenFreshHelper(item)
    : item);
  patch.codeScreen = codeScreen;
  nodeGraphMvp.codeScreenRegistryStatus = "all metadata saved";
  commitNodeGraphPatch(patch, { status: "code screen metadata saved" });
  updateNodeGraphCodeScreenRegistryStatus("all metadata saved");
  for (const card of cards) {
    updateNodeGraphCodeScreenRegistryDraftState(card);
  }
  updateNodeGraphCodeScreenRegistryDraftPreview(key);
}

function moveNodeGraphCodeScreenRegistryItem(key, index, direction) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  const items = [...(codeScreen[key] || [])];
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return;
  }
  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  codeScreen[key] = items;
  patch.codeScreen = codeScreen;
  commitNodeGraphPatch(patch, { status: "code screen metadata reordered" });
}

function insertNodeGraphCodeScreenRegistrySnippet(key, index) {
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  const item = nodeGraphCodeScreenRegistryDraftItemFromCard(card) || codeScreen[key]?.[index];
  if (!item || typeof config.snippet !== "function") {
    return;
  }
  insertNodeGraphCodeScreenHelperSnippet(config.snippet(item));
}

function saveNodeGraphCodeScreenRegistrySnippet(key, index) {
  return saveNodeGraphCodeScreenRegistrySnippetWithTags(key, index, null, "registry snippet saved");
}

function saveNodeGraphCodeScreenRegistryPinnedSnippet(key, index) {
  return saveNodeGraphCodeScreenRegistrySnippetWithTags(key, index, "pinned", "registry snippet pinned");
}

function saveNodeGraphCodeScreenRegistrySnippetWithTags(key, index, extraTags = null, message = "registry snippet saved") {
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  const item = nodeGraphCodeScreenRegistryDraftItemFromCard(card) || codeScreen[key]?.[index];
  if (!item || typeof config.snippet !== "function") {
    updateNodeGraphCodeScreenRegistryStatus("nothing to save", false);
    return false;
  }
  const sectionTag = section?.eyebrow?.toLowerCase() || key;
  const tags = [sectionTag, extraTags].filter(Boolean).join(" ");
  saveNodeGraphCodeScreenSnippetSource(
    config.snippet(item),
    `Reusable snippet saved from ${section?.title || key}.`,
    "code screen registry snippet saved",
    tags,
  );
  if (nodeGraphCodeScreenHasTag(tags, "pinned")) {
    nodeGraphMvp.codeScreenLookupSearch = "";
    nodeGraphMvp.codeScreenLookupStatus = message;
  }
  nodeGraphMvp.codeScreenRegistryStatus = message;
  renderNodeGraphCodeScreen();
  return true;
}

async function copyNodeGraphCodeScreenRegistrySnippet(key, index) {
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  const item = nodeGraphCodeScreenRegistryDraftItemFromCard(card) || codeScreen[key]?.[index];
  if (!item || typeof config.snippet !== "function") {
    updateNodeGraphCodeScreenRegistryStatus("nothing to copy", false);
    return;
  }
  try {
    await copyTextToClipboard(config.snippet(item));
    updateNodeGraphCodeScreenRegistryStatus("code copied");
  } catch (error) {
    selectNodeGraphCodeScreenCopyFallback(config.snippet(item));
    updateNodeGraphCodeScreenRegistryStatus("code selected");
  }
}

async function copyNodeGraphCodeScreenRegistryMarkdownSnippet(key, index) {
  const section = nodeGraphCodeScreenSections.find((candidate) => nodeGraphCodeScreenRegistryConfig(candidate.id).key === key);
  const config = nodeGraphCodeScreenRegistryConfig(section?.id || nodeGraphCodeScreenCurrentSection());
  const codeScreen = normalizeNodeGraphCodeScreen(nodeGraphMvp.patch.codeScreen);
  const card = document.querySelector(`[data-code-screen-registry-key="${key}"][data-code-screen-registry-index="${index}"]`);
  const item = nodeGraphCodeScreenRegistryDraftItemFromCard(card) || codeScreen[key]?.[index];
  if (!item || typeof config.snippet !== "function") {
    updateNodeGraphCodeScreenRegistryStatus("nothing to copy", false);
    return;
  }
  try {
    await copyTextToClipboard(nodeGraphCodeScreenMarkdownFence(config.snippet(item), item.language || "javascript"));
    updateNodeGraphCodeScreenRegistryStatus("markdown copied");
  } catch (error) {
    selectNodeGraphCodeScreenCopyFallback(nodeGraphCodeScreenMarkdownFence(config.snippet(item), item.language || "javascript"));
    updateNodeGraphCodeScreenRegistryStatus("markdown selected");
  }
}

function removeNodeGraphCodeScreenRegistryItem(key, index) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const codeScreen = normalizeNodeGraphCodeScreen(patch.codeScreen);
  codeScreen[key] = (codeScreen[key] || []).filter((_, itemIndex) => itemIndex !== index);
  patch.codeScreen = codeScreen;
  commitNodeGraphPatch(patch, { status: "code screen metadata removed" });
}

function nodeGraphCodeScreenPrefixBeforeCursor(textarea) {
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, cursor);
  const match = before.match(/([A-Za-z][A-Za-z0-9_]*)\.$/);
  return match?.[1] || "";
}

function nodeGraphCodeScreenActiveTextarea() {
  return document.getElementById("nodeCodeScreenCodeblockSource") ||
    document.getElementById("nodeCodeScreenWorkspaceScriptSource");
}

function nodeGraphCodeScreenClampAutocompleteIndex(index, items = nodeGraphMvp.codeScreenAutocompleteItems || []) {
  if (!items.length) {
    return 0;
  }
  return ((index % items.length) + items.length) % items.length;
}

function renderNodeGraphCodeScreenAutocompleteItems(popover) {
  popover.replaceChildren();
  const items = nodeGraphMvp.codeScreenAutocompleteItems || [];
  const activeIndex = nodeGraphCodeScreenClampAutocompleteIndex(nodeGraphMvp.codeScreenAutocompleteIndex, items);
  nodeGraphMvp.codeScreenAutocompleteIndex = activeIndex;
  const header = document.createElement("div");
  header.className = "node-code-screen-autocomplete-header";
  const namespace = items[0]?.namespace || "helper";
  header.textContent = `${items.length} ${namespace}. ${items.length === 1 ? "helper" : "helpers"}`;
  popover.append(header);
  items.forEach((helper, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.codeScreenAutocompleteSnippet = helper.snippet;
    button.dataset.codeScreenAutocompleteIndex = String(index);
    button.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
    const preview = helper.snippet && helper.snippet !== helper.signature
      ? `<code>${nodeGraphCodeScreenEscapeHtml(nodeGraphCodeScreenPreviewText(helper.snippet))}</code>`
      : "";
    const helperStatus = [helper.category, helper.availability].filter(Boolean).join(" - ");
    button.innerHTML = `<strong>${nodeGraphCodeScreenEscapeHtml(helper.signature)}</strong><span>${nodeGraphCodeScreenEscapeHtml(helper.description)}</span>${preview}<small>${nodeGraphCodeScreenEscapeHtml(helperStatus)}</small>`;
    popover.append(button);
  });
}

function setNodeGraphCodeScreenAutocompleteIndex(index) {
  if (!nodeGraphMvp.codeScreenAutocompleteOpen) {
    return;
  }
  const popover = document.getElementById("nodeCodeScreenAutocomplete");
  if (!popover) {
    return;
  }
  nodeGraphMvp.codeScreenAutocompleteIndex = nodeGraphCodeScreenClampAutocompleteIndex(index);
  renderNodeGraphCodeScreenAutocompleteItems(popover);
}

function updateNodeGraphCodeScreenAutocomplete() {
  const textarea = nodeGraphCodeScreenActiveTextarea();
  const popover = document.getElementById("nodeCodeScreenAutocomplete");
  if (!textarea || !popover) {
    return;
  }
  const prefix = nodeGraphCodeScreenPrefixBeforeCursor(textarea);
  const prefixKey = prefix.toLowerCase();
  const items = prefix
    ? nodeGraphCodeScreenAllHelpers()
      .filter((helper) => String(helper.namespace || "").toLowerCase() === prefixKey)
      .sort(nodeGraphCodeScreenSortHelpersByRecent)
    : [];
  nodeGraphMvp.codeScreenAutocompleteItems = items;
  nodeGraphMvp.codeScreenAutocompleteOpen = items.length > 0;
  nodeGraphMvp.codeScreenAutocompleteIndex = nodeGraphCodeScreenClampAutocompleteIndex(
    nodeGraphMvp.codeScreenAutocompleteIndex,
    items,
  );
  popover.hidden = !items.length;
  renderNodeGraphCodeScreenAutocompleteItems(popover);
}

function insertNodeGraphCodeScreenHelperSnippet(snippet) {
  rememberNodeGraphCodeScreenRecentHelperSnippet(snippet);
  const textarea = nodeGraphCodeScreenActiveTextarea();
  if (!textarea) {
    nodeGraphMvp.codeScreenPendingSnippet = String(snippet || "");
    nodeGraphMvp.codeScreenSection = nodeGraphCodeScreenSnippetTarget() === "codeblock" ? "codeblocks" : "script";
    renderNodeGraphCodeScreen();
    return;
  }
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const originalBefore = textarea.value.slice(0, cursor);
  const before = originalBefore.replace(/([A-Za-z][A-Za-z0-9_]*)\.$/, "");
  const after = textarea.value.slice(textarea.selectionEnd ?? cursor);
  const replacedNamespacePrefix = before !== originalBefore;
  const leadingBreak = !replacedNamespacePrefix && before.trim() && !before.endsWith("\n") ? "\n" : "";
  const trailingBreak = !replacedNamespacePrefix && after.trim() && !after.startsWith("\n") ? "\n" : "";
  textarea.value = `${before}${leadingBreak}${snippet}${trailingBreak}${after}`;
  const nextCursor = before.length + leadingBreak.length + snippet.length;
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
  updateNodeGraphCodeScreenAutocomplete();
  if (textarea.id === "nodeCodeScreenCodeblockSource") {
    updateNodeGraphCodeScreenCodeblockSummary();
    nodeGraphCodeScreenUpdateCodeStatus();
  } else {
    updateNodeGraphCodeScreenWorkspaceScriptStats();
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("script editing");
    updateNodeGraphCodeScreenWorkspaceScriptDraftState();
  }
}

function insertNodeGraphCodeScreenText(text) {
  const textarea = nodeGraphCodeScreenActiveTextarea();
  if (!textarea) {
    return false;
  }
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? cursor;
  textarea.value = `${textarea.value.slice(0, cursor)}${text}${textarea.value.slice(end)}`;
  const nextCursor = cursor + text.length;
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
  updateNodeGraphCodeScreenAutocomplete();
  if (textarea.id === "nodeCodeScreenCodeblockSource") {
    queueMicrotask(nodeGraphCodeScreenUpdateCodeStatus);
  } else {
    queueMicrotask(() => {
      nodeGraphCodeScreenUpdateWorkspaceScriptStatus("script editing");
      updateNodeGraphCodeScreenWorkspaceScriptDraftState();
    });
  }
  return true;
}

function nodeGraphCodeScreenUpdateWorkspaceScriptStatus(message = "script editing") {
  nodeGraphMvp.codeScreenWorkspaceScriptStatus = message;
  const status = document.getElementById("nodeCodeScreenWorkspaceScriptStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = "ok";
}

function updateNodeGraphCodeScreenWorkspaceWatchSearch(value, selectionStart = null, selectionEnd = null) {
  nodeGraphMvp.codeScreenWorkspaceWatchSearch = String(value || "").slice(0, 160);
  renderNodeGraphCodeScreen();
  queueMicrotask(() => {
    const input = document.getElementById("nodeCodeScreenWorkspaceWatchSearch");
    if (!input) {
      return;
    }
    input.focus();
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function updateNodeGraphCodeScreenHelperSearch(value, selectionStart = null, selectionEnd = null) {
  nodeGraphMvp.codeScreenHelperSearch = value;
  renderNodeGraphCodeScreen();
  queueMicrotask(() => {
    const input = document.getElementById("nodeCodeScreenHelperSearch");
    if (!input) {
      return;
    }
    input.focus();
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function setNodeGraphCodeScreenHelperNamespaceFilter(namespace) {
  nodeGraphMvp.codeScreenHelperNamespaceFilter = String(namespace || "").trim();
  nodeGraphMvp.codeScreenHelperDetailKey = "";
  renderNodeGraphCodeScreen();
}

function applyNodeGraphCodeScreenHelperSummaryFilter(type, value) {
  const filterType = String(type || "").trim().toLowerCase();
  const filterValue = String(value || "").trim();
  nodeGraphMvp.codeScreenHelperDetailKey = "";
  if (filterType === "namespace") {
    nodeGraphMvp.codeScreenHelperSearch = "";
    setNodeGraphCodeScreenHelperNamespaceFilter(filterValue);
    return;
  }
  nodeGraphMvp.codeScreenHelperNamespaceFilter = "";
  updateNodeGraphCodeScreenHelperSearch(filterValue, filterValue.length, filterValue.length);
}

function clearNodeGraphCodeScreenHelperSearch() {
  nodeGraphMvp.codeScreenHelperNamespaceFilter = "";
  updateNodeGraphCodeScreenHelperSearch("", 0, 0);
}

function updateNodeGraphCodeScreenSnippetSearch(value, selectionStart = null, selectionEnd = null) {
  nodeGraphMvp.codeScreenSnippetSearch = value;
  renderNodeGraphCodeScreen();
  queueMicrotask(() => {
    const input = document.getElementById("nodeCodeScreenSnippetSearch");
    if (!input) {
      return;
    }
    input.focus();
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function clearNodeGraphCodeScreenSnippetSearch() {
  updateNodeGraphCodeScreenSnippetSearch("", 0, 0);
}

function setNodeGraphCodeScreenSnippetTagFilter(tag) {
  const value = String(tag || "").trim();
  updateNodeGraphCodeScreenSnippetSearch(value, value.length, value.length);
}

function setNodeGraphCodeScreenSnippetSort(mode) {
  nodeGraphMvp.codeScreenSnippetSort = ["recent", "name", "category"].includes(mode) ? mode : "recent";
  renderNodeGraphCodeScreen();
}

function updateNodeGraphCodeScreenCodeblockSearch(value, selectionStart = null, selectionEnd = null) {
  nodeGraphMvp.codeScreenCodeblockSearch = String(value || "").slice(0, 160);
  renderNodeGraphCodeScreen();
  queueMicrotask(() => {
    const input = document.getElementById("nodeCodeScreenCodeblockSearch");
    if (!input) {
      return;
    }
    input.focus();
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function clearNodeGraphCodeScreenCodeblockSearch() {
  updateNodeGraphCodeScreenCodeblockSearch("", 0, 0);
}

function updateNodeGraphCodeScreenLookupSearch(value) {
  nodeGraphMvp.codeScreenLookupSearch = String(value || "").slice(0, 120);
  renderNodeGraphCodeScreenLookupShelf();
}

function clearNodeGraphCodeScreenLookupSearch() {
  updateNodeGraphCodeScreenLookupSearch("");
  queueMicrotask(() => document.getElementById("nodeCodeScreenLookupSearch")?.focus());
}

function focusNodeGraphCodeScreenLookupSearch() {
  const input = document.getElementById("nodeCodeScreenLookupSearch");
  if (!input) {
    return false;
  }
  input.focus();
  input.select();
  updateNodeGraphCodeScreenLookupStatus("lookup focused");
  return true;
}

function insertNodeGraphCodeScreenTeleportScriptStub() {
  insertNodeGraphCodeScreenHelperSnippet([
    "event.bind(\"C4\", \"game.signs.mageTeleport.trigger\")",
    "game.signs.mageTeleport.trigger({ midi: 60, velocity: 1 })",
  ].join("\n"));
}

function nodeGraphCodeScreenLibraryDemoScript() {
  return [
    "snippets.add({",
    "  id: \"vision-run-demo\",",
    "  name: \"Vision Run Demo\",",
    "  source: \"ui.set(\\\"demo.panel\\\", true)\",",
    "  tags: \"script demo\",",
    "});",
    "",
    "command.save({",
    "  id: \"vision-command-demo\",",
    "  name: \"Vision Command Demo\",",
    "  source: \"command.run(\\\"patch types\\\", () => patch.countByType())\",",
    "  tags: \"command script demo\",",
    "});",
    "",
    "library.helper({",
    "  id: \"vision-run-helper\",",
    "  namespace: \"ui\",",
    "  category: \"script built\",",
    "  name: \"runDemo\",",
    "  signature: \"ui.runDemo()\",",
    "  source: \"ui.set(\\\"demo.panel\\\", true)\",",
    "  tags: \"script demo\",",
    "});",
    "",
    "library.helper({",
    "  id: \"patch-make-lead\",",
    "  namespace: \"patch\",",
    "  category: \"easy patch recipe\",",
    "  name: \"makeLead\",",
    "  signature: \"patch.makeLead({ note, tone })\",",
    "  source: \"patch.makeLead({ note: 'C3', tone: 'bright' })\",",
    "  tags: \"patch,circuit,easy\",",
    "  description: \"Placeholder helper recipe for future easy patch creation scripts.\",",
    "});",
    "",
    "ui.add({",
    "  id: \"demo-panel\",",
    "  name: \"Demo Panel\",",
    "  target: \"demo.panel\",",
    "  value: \"true\",",
    "  description: \"Script-created UI metadata.\",",
    "});",
    "",
    "ui.set(\"demo.panel.enabled\", true);",
    "ui.show(\"demo.panel\");",
    "",
    "sample.reserve(\"teleport\", \"samples/teleport.wav\", \"Reserved sample metadata created by script.\");",
    "const leadPlan = patch.makeLead({ note: \"C3\", tone: \"bright\" });",
    "const availableRecipes = recipe.list();",
    "const recipeDocs = recipe.markdown();",
    "const envelopePlan = recipe.run(\"envelope\", { attack: 0.02, decay: 0.12, sustain: 0.7, release: 0.35 });",
    "const canvasSource = canvas.starter();",
    "const canvasModel = canvas.parse(canvasSource);",
    "const canvasLayers = canvas.layers(canvasSource);",
    "const canvasModule = canvas.module(\"scene canvas\", canvasSource);",
    "const canvasMarkdown = canvas.markdown(canvasSource);",
    "patch.connect(\"lead-amp.Out\", \"lead scope\");",
    "const leadPlanSummary = plan.summary(leadPlan);",
    "const leadPlanValidation = plan.validate(leadPlan);",
    "const leadPlanSteps = plan.steps(leadPlan);",
    "const leadPlanMarkdown = plan.markdown(leadPlan);",
    "const envelopePlanSummary = plan.summary(envelopePlan);",
    "const envelopePlanValidation = plan.validate(envelopePlan);",
    "const teleportExport = exportSample.area(\"teleport sample area\");",
    "const envelopeSlot = teleportExport.use(\"envelope\", envelopePlan);",
    "const tailSlot = teleportExport.use(\"tail\", leadPlan);",
    "const defaultTailSlot = teleportExport.useDefault(\"tail\");",
    "const visualSlot = slot.use(\"exportSample\", \"teleport sample area\", \"visual\", leadPlan);",
    "const foundEnvelopeSlot = teleportExport.find(\"envelope\");",
    "const foundVisualSlot = slot.find(\"exportSample\", \"teleport sample area\", \"visual\");",
    "const teleportExportMarkdown = teleportExport.markdown();",
    "const envelopeSlotSchema = schema.validate(\"slot\", envelopeSlot);",
    "const exportSlotMarkdown = exportSample.markdown();",
    "const leadTags = tags.parse(\"patch,circuit,note=C3,tone=bright\");",
    "const teleportFile = file.parts(\"samples/teleport`note=C3`type=fx.wav\");",
    "const demoFilePaths = [",
    "  \"samples/lead`note=C3`vel=hard.wav\",",
    "  \"samples/lead`note=E3`vel=soft.wav\",",
    "  \"samples/impact`type=fx`rr=1.wav\",",
    "];",
    "const demoFileTagScript = \"library=sandbox,stem={stem},ext={ext}\";",
    "const demoFileList = file.list(demoFilePaths, demoFileTagScript);",
    "const demoFileMarkdown = file.markdown(demoFilePaths, demoFileTagScript);",
    "const itemSummary = items.summary(demoFileList);",
    "const leadItems = items.filter(demoFileList, { note: \"C3\" });",
    "const velocityCounts = items.countByTag(demoFileList, \"vel\");",
    "const leadSnapshot = watch.snapshot(\"lead item snapshot\", leadItems[0]);",
    "const itemSummaryDelta = watch.diff(\"item summary delta\", { total: 0 }, { total: itemSummary.total });",
    "watch.value(\"watched velocity counts\", velocityCounts);",
    "watch.table(\"tagscript file rows\", demoFileList);",
    "watch.table(\"canvas layers\", canvasLayers);",
    "watch.value(\"tagscript file list\", demoFileMarkdown);",
    "watch.value(\"canvas module\", canvasModule);",
    "watch.value(\"canvas markdown\", canvasMarkdown);",
    "const demoVars = watch.vars({ leadPlanSummary, itemSummary, velocityCounts }, \"demo\");",
    "const recipeListAssertion = assert.notEmpty(\"recipe list is available\", availableRecipes);",
    "const envelopeSlotAssertion = assert.equal(\"envelope slot label\", envelopeSlot.slot, \"envelope\");",
    "const visualSlotAssertion = assert.that(\"visual slot has circuit\", Boolean(visualSlot.circuit), visualSlot);",
    "const slotDebugTable = debug.table(\"slot debug table\", { envelopeSlot, visualSlot, recipeCount: availableRecipes.length });",
    "const noteMatch = regex.match(teleportFile.name, \"note=([A-G][#b]?\\\\d+)\");",
    "const demoTests = [",
    "  console.test(\"lead plan has modules\", leadPlan.circuit.modules.length >= 4),",
    "  console.test(\"recipe list includes envelope\", availableRecipes.some((item) => item.name === \"envelope\")),",
    "  console.test(\"recipe markdown names envelope\", recipeDocs.includes(\"## envelope\")),",
    "  console.test(\"envelope plan has endpoints\", envelopePlan.circuit.modules.some((item) => item.type === \"groupInput\") && envelopePlan.circuit.modules.some((item) => item.type === \"groupOutput\")),",
    "  console.test(\"plan validation ok\", leadPlanValidation.ok),",
    "  console.test(\"envelope plan validation ok\", envelopePlanValidation.ok),",
    "  console.test(\"plan markdown names lead\", leadPlanMarkdown.includes(\"C3 bright lead\")),",
    "  console.test(\"export sample slot assigned\", envelopeSlot.workflow === \"exportSample\" && envelopeSlot.slot === \"envelope\"),",
    "  console.test(\"export sample slot found\", foundEnvelopeSlot && foundEnvelopeSlot.id === envelopeSlot.id),",
    "  console.test(\"export sample default restored\", defaultTailSlot.slot === \"tail\" && !exportSample.findSlot(\"teleport sample area\", \"tail\")),",
    "  console.test(\"export sample area helper rendered markdown\", teleportExportMarkdown.includes(\"Export Sample Area: teleport sample area\")),",
    "  console.test(\"generic slot authoring found visual slot\", foundVisualSlot && visualSlot.id === foundVisualSlot.id),",
    "  console.test(\"export sample slot schema valid\", envelopeSlotSchema.ok),",
    "  console.test(\"export sample slot markdown names envelope\", exportSlotMarkdown.includes(\"teleport sample area / envelope\")),",
    "  console.test(\"file list parsed\", demoFileList.length === 3),",
    "  console.test(\"file markdown displays tagscript list\", demoFileMarkdown.includes(\"tag:library\") && demoFileMarkdown.includes(\"samples/lead\")),",
    "  console.test(\"first file note tag\", demoFileList[0].tags.note === \"C3\"),",
    "  console.test(\"items summary counted\", itemSummary.total === 3),",
    "  console.test(\"items filter found lead note\", leadItems.length === 1),",
    "  console.test(\"canvas starter parsed layers\", canvasLayers.length >= 2),",
    "  console.test(\"canvas module has RGBA output\", canvasModule.outputs.includes(\"RGBA\")),",
    "  console.test(\"canvas markdown names ratio\", canvasMarkdown.includes(\"ratio: 1:1\")),",
    "  console.test(\"watch snapshot copied\", leadSnapshot.tags.note === \"C3\"),",
    "  console.test(\"watch diff changed\", itemSummaryDelta.changed === true),",
    "  console.test(\"watch vars returned named values\", demoVars.itemSummary.total === 3 && demoVars.velocityCounts.hard === 1),",
    "  console.test(\"assert helpers pass\", recipeListAssertion.ok && envelopeSlotAssertion.ok && visualSlotAssertion.ok),",
    "  console.test(\"debug table has slot rows\", slotDebugTable.rows.length === 3 && slotDebugTable.rows.some((row) => row.key === \"visualSlot\")),",
    "  console.test(\"regex note parsed\", noteMatch.captures[0] === \"C3\"),",
    "];",
    "const demoReport = report.markdown(\"Library Demo Report\");",
    "demoTests.push(console.test(\"report markdown has watches\", demoReport.includes(\"## Variable Watch\")));",
    "const reportSummary = report.summary();",
    "demoTests.push(console.test(\"report summary counted watches\", reportSummary.watches >= 4));",
    "const watchSummary = watch.summary();",
    "const watchMarkdown = watch.markdown();",
    "const demoWatchRows = watch.list(\"demo\");",
    "const foundVelocityWatch = watch.find(\"velocity\");",
    "const demoWatchMarkdown = watch.markdown(\"demo\");",
    "demoTests.push(console.test(\"watch summary counted values\", watchSummary.total >= 4));",
    "demoTests.push(console.test(\"watch markdown names variable scope\", watchMarkdown.includes(\"demo variables\") || watchMarkdown.includes(\"Variable Scope\")));",
    "demoTests.push(console.test(\"watch list filters demo values\", demoWatchRows.length >= 3 && demoWatchRows.some((row) => row.name === \"demo variables\")));",
    "demoTests.push(console.test(\"watch find locates velocity\", foundVelocityWatch && foundVelocityWatch.name.includes(\"velocity\")));",
    "demoTests.push(console.test(\"watch markdown filters demo\", demoWatchMarkdown.includes(\"demo variables\") && !demoWatchMarkdown.includes(\"lead item snapshot\")));",
    "watch.value(\"script report summary\", reportSummary);",
    "watch.value(\"watch summary\", watchSummary);",
    "watch.value(\"watch markdown\", { excerpt: code.excerpt(watchMarkdown, 260), stats: code.stats(watchMarkdown) });",
    "watch.table(\"demo watch rows\", demoWatchRows);",
    "watch.value(\"found velocity watch\", foundVelocityWatch);",
    "watch.value(\"demo watch markdown\", { excerpt: code.excerpt(demoWatchMarkdown, 260), stats: code.stats(demoWatchMarkdown) });",
    "watch.value(\"demo report markdown\", { title: \"Library Demo Report\", hasVariableWatch: demoReport.includes(\"## Variable Watch\"), preview: demoReport.slice(0, 360) });",
    "const patchHelpers = help.search(\"patch\");",
    "const uiHelpers = help.namespace(\"ui\");",
    "const helperNamespaces = help.namespaces();",
    "const demoSnippets = help.snippets(\"demo\");",
    "const uiHelperReference = help.reference(\"ui\");",
    "const patchHelperMarkdown = help.markdown(\"patch\");",
    "const scriptSnippetList = snippets.list(\"demo\");",
    "const scriptCommandSnippet = snippets.find(\"Command Demo\");",
    "const scriptSnippetMarkdown = snippets.markdown(\"demo\");",
    "const librarySummary = library.summary();",
    "const librarySnippetItems = library.items(\"snippets\");",
    "const libraryMarkdown = library.markdown();",
    "const uiMetadataRows = ui.list(\"demo.panel\");",
    "const uiPanelSetting = ui.find(\"demo.panel.enabled\");",
    "const uiMetadataMarkdown = ui.markdown(\"demo\");",
    "const sampleMetadataRows = sample.list(\"teleport\");",
    "const teleportSampleMetadata = sample.find(\"teleport\");",
    "const sampleMetadataMarkdown = sample.markdown(\"teleport\");",
    "demoTests.push(console.test(\"help found staged patch helper\", patchHelpers.some((helper) => helper.signature === \"patch.makeLead({ note, tone })\")));",
    "demoTests.push(console.test(\"help found envelope recipe\", patchHelpers.some((helper) => helper.signature === \"patch.makeEnvelope({ attack, decay, sustain, release })\")));",
    "demoTests.push(console.test(\"help namespace found ui\", uiHelpers.some((helper) => helper.signature === \"ui.set(target, value)\")));",
    "demoTests.push(console.test(\"help reference names ui set\", uiHelperReference.includes(\"ui.set(target, value)\")));",
    "demoTests.push(console.test(\"help markdown names patch lead\", patchHelperMarkdown.includes(\"patch.makeLead({ note, tone })\")));",
    "demoTests.push(console.test(\"snippets list found staged snippets\", scriptSnippetList.length >= 2));",
    "demoTests.push(console.test(\"snippets find found command snippet\", scriptCommandSnippet && scriptCommandSnippet.name === \"Vision Command Demo\"));",
    "demoTests.push(console.test(\"snippets markdown names command\", scriptSnippetMarkdown.includes(\"Vision Command Demo\")));",
    "demoTests.push(console.test(\"library summary counted staged snippets\", librarySummary.staged.snippets >= 2));",
    "demoTests.push(console.test(\"library items listed snippets\", librarySnippetItems.some((item) => item.label.includes(\"vision-command-demo\"))));",
    "demoTests.push(console.test(\"library markdown names samples\", libraryMarkdown.includes(\"## samples\")));",
    "demoTests.push(console.test(\"ui metadata list found demo settings\", uiMetadataRows.length >= 2));",
    "demoTests.push(console.test(\"ui metadata find found enabled setting\", uiPanelSetting && uiPanelSetting.target === \"demo.panel.enabled\"));",
    "demoTests.push(console.test(\"sample metadata find found teleport\", teleportSampleMetadata && teleportSampleMetadata.id === \"teleport\"));",
    "demoTests.push(console.test(\"sample metadata markdown names teleport\", sampleMetadataMarkdown.includes(\"teleport\")));",
    "watch.table(\"patch helper search\", patchHelpers);",
    "watch.value(\"helper namespaces\", helperNamespaces);",
    "watch.value(\"ui helper reference\", { excerpt: code.excerpt(uiHelperReference, 240), stats: code.stats(uiHelperReference) });",
    "watch.value(\"patch helper markdown\", { excerpt: code.excerpt(patchHelperMarkdown, 240), stats: code.stats(patchHelperMarkdown) });",
    "watch.table(\"demo snippets\", demoSnippets);",
    "watch.table(\"script snippet list\", scriptSnippetList);",
    "watch.value(\"script snippet markdown\", { excerpt: code.excerpt(scriptSnippetMarkdown, 240), stats: code.stats(scriptSnippetMarkdown) });",
    "debug.table(\"library summary table\", librarySummary.totals);",
    "watch.table(\"library snippet items\", librarySnippetItems);",
    "watch.value(\"library markdown\", { excerpt: code.excerpt(libraryMarkdown, 260), stats: code.stats(libraryMarkdown) });",
    "watch.table(\"ui metadata rows\", uiMetadataRows);",
    "watch.value(\"ui metadata markdown\", { excerpt: code.excerpt(uiMetadataMarkdown, 220), stats: code.stats(uiMetadataMarkdown) });",
    "watch.table(\"sample metadata rows\", sampleMetadataRows);",
    "watch.value(\"sample metadata markdown\", { excerpt: code.excerpt(sampleMetadataMarkdown, 220), stats: code.stats(sampleMetadataMarkdown) });",
    "const sampleSchema = schema.validate(\"sample\", sample.load(\"teleport\"));",
    "const uiSchema = schema.validate(\"ui\", { id: \"demo-panel\", target: \"demo.panel\", value: \"true\" });",
    "const helperSchema = schema.preview(\"helper\", schema.defaults(\"helper\").metadata);",
    "demoTests.push(console.test(\"schema validates sample\", sampleSchema.ok));",
    "demoTests.push(console.test(\"schema previews helper\", helperSchema.normalized.namespace === \"patch\"));",
    "watch.value(\"sample schema\", sampleSchema);",
    "watch.value(\"ui schema\", uiSchema);",
    "watch.value(\"helper schema preview\", helperSchema);",
    "const codeMarkdown = code.fence(\"ui.set(\\\"demo.panel\\\", true)\", \"JS\");",
    "const codeHighlight = code.highlight(\"ui.set(\\\"demo.panel\\\", true)\", \"JS\");",
    "const codeStats = code.stats(codeMarkdown);",
    "demoTests.push(console.test(\"code fence uses javascript\", codeMarkdown.startsWith(\"```javascript\")));",
    "demoTests.push(console.test(\"code highlight normalizes language\", codeHighlight.language === \"javascript\" && codeHighlight.markdown.startsWith(\"```javascript\")));",
    "demoTests.push(console.test(\"code stats counted lines\", codeStats.lines >= 3));",
    "watch.value(\"code markdown preview\", { language: code.language(\"JS\"), excerpt: code.excerpt(codeMarkdown, 160), stats: codeStats });",
    "watch.value(\"code highlight preview\", { language: codeHighlight.language, excerpt: code.excerpt(codeHighlight.markdown, 160), stats: codeHighlight.stats });",
    "const blockSummary = block.summary();",
    "const blockTemplate = block.template({ id: \"gate-pass\", inputs: [\"Gate\"], outputs: [\"Out\"], code: \"Out = Gate;\" });",
    "const blockCompile = block.compile(blockTemplate.codeblock);",
    "const blockInspect = block.inspect(blockTemplate);",
    "const blockFindResults = block.find(\"Gate\");",
    "const blockTemplateMarkdown = block.markdown(blockTemplate);",
    "const blockMarkdown = block.markdown();",
    "demoTests.push(console.test(\"block summary is readable\", blockSummary.total >= 0));",
    "demoTests.push(console.test(\"block template compiles\", blockCompile.ok));",
    "demoTests.push(console.test(\"block inspect reports ports\", blockInspect.ports === 2 && blockInspect.compile === \"ok\"));",
    "demoTests.push(console.test(\"block find returns current patch matches\", Array.isArray(blockFindResults)));",
    "demoTests.push(console.test(\"block template markdown names gate pass\", blockTemplateMarkdown.includes(\"gate-pass\") && blockTemplateMarkdown.includes(\"Out = Gate\")));",
    "demoTests.push(console.test(\"block markdown reports empty patch\", blockMarkdown.includes(\"No Codeblock debug modules found\")));",
    "watch.value(\"codeblock summary\", blockSummary);",
    "watch.value(\"codeblock template\", blockTemplate);",
    "watch.table(\"codeblock inspect\", [blockInspect]);",
    "watch.table(\"codeblock find\", blockFindResults);",
    "watch.value(\"codeblock template markdown\", blockTemplateMarkdown);",
    "watch.value(\"codeblock markdown\", blockMarkdown);",
    "watch.table(\"codeblocks in patch\", block.all());",
    "event.bind(\"C4\", \"game.signs.mageTeleport.trigger\");",
    "game.signs.mageTeleport.trigger({ midi: 60, velocity: 1 });",
    "command.run(\"patch types\", () => patch.countByType());",
    "const commandBatchResults = command.batch([",
    "  [\"patch summary command\", () => patch.summary()],",
    "  [\"lead steps command\", () => plan.steps(leadPlan).length],",
    "]);",
    "const commandSummary = command.summary();",
    "const commandReport = command.markdown();",
    "demoTests.push(console.test(\"command summary counted runs\", commandSummary.total >= 3 && commandSummary.failed === 0));",
    "demoTests.push(console.test(\"command markdown names command\", commandReport.includes(\"patch types\")));",
    "watch.value(\"command summary\", commandSummary);",
    "watch.value(\"command report markdown\", commandReport);",
    "watch.table(\"command batch results\", commandBatchResults);",
    "",
    "patchTools.add({",
    "  id: \"find-output-modules\",",
    "  name: \"Find Output Modules\",",
    "  target: \"patch.findNodes({ type: \\\"output\\\" })\",",
    "  description: \"Script-created patch utility metadata.\",",
    "});",
    "const patchToolRows = patchTools.list(\"output\");",
    "const outputPatchTool = patchTools.find(\"Find Output\");",
    "const patchToolMarkdown = patchTools.markdown(\"output\");",
    "demoTests.push(console.test(\"patch tools list found output tool\", patchToolRows.length >= 1));",
    "demoTests.push(console.test(\"patch tools find found target\", outputPatchTool && outputPatchTool.target.includes(\"patch.findNodes\")));",
    "demoTests.push(console.test(\"patch tools markdown names output tool\", patchToolMarkdown.includes(\"Find Output Modules\")));",
    "watch.table(\"patch tool rows\", patchToolRows);",
    "watch.value(\"patch tools markdown\", { excerpt: code.excerpt(patchToolMarkdown, 220), stats: code.stats(patchToolMarkdown) });",
    "",
    "debug.inspect(\"audio math\", { c4: audio.midiToHz(60), minus6: audio.dbToGain(-6) });",
    "debug.inspect(\"patch summary\", patch.summary());",
    "debug.inspect(\"event bindings\", event.bindings());",
    "debug.inspect(\"event triggers\", event.triggers());",
    "debug.inspect(\"command runs\", command.runs());",
    "debug.inspect(\"lead plan\", leadPlan);",
    "watch.table(\"easy patch recipes\", availableRecipes);",
    "watch.value(\"recipe docs\", { excerpt: code.excerpt(recipeDocs, 240), stats: code.stats(recipeDocs) });",
    "debug.inspect(\"lead plan summary\", leadPlanSummary);",
    "debug.inspect(\"lead plan validation\", leadPlanValidation);",
    "debug.inspect(\"envelope plan\", envelopePlan);",
    "debug.inspect(\"envelope plan summary\", envelopePlanSummary);",
    "debug.inspect(\"envelope plan validation\", envelopePlanValidation);",
    "debug.inspect(\"export sample envelope slot\", envelopeSlot);",
    "debug.inspect(\"export sample tail slot before default\", tailSlot);",
    "debug.inspect(\"export sample default tail slot\", defaultTailSlot);",
    "debug.inspect(\"generic visual slot\", visualSlot);",
    "debug.inspect(\"found export sample envelope slot\", foundEnvelopeSlot);",
    "debug.inspect(\"found generic visual slot\", foundVisualSlot);",
    "watch.value(\"teleport export markdown\", { excerpt: code.excerpt(teleportExportMarkdown, 240), stats: code.stats(teleportExportMarkdown) });",
    "debug.inspect(\"export sample slot schema\", envelopeSlotSchema);",
    "watch.value(\"export sample slot markdown\", { excerpt: code.excerpt(exportSlotMarkdown, 240), stats: code.stats(exportSlotMarkdown) });",
    "watch.table(\"export sample slots\", exportSample.slots());",
    "watch.table(\"all export sample slots\", exportSample.allSlots());",
    "watch.table(\"slot authoring slots\", slot.all(\"exportSample\"));",
    "watch.table(\"lead plan steps\", leadPlanSteps);",
    "watch.value(\"lead plan markdown\", { excerpt: code.excerpt(leadPlanMarkdown, 240), stats: code.stats(leadPlanMarkdown) });",
    "debug.inspect(\"circuit plan\", circuit.plan());",
    "debug.inspect(\"visual scopes\", visual.scopes());",
    "debug.inspect(\"lead tags\", leadTags);",
    "debug.inspect(\"tag check\", tags.validate(leadTags, [\"note\", \"tone\"]));",
    "debug.inspect(\"file parts\", teleportFile);",
    "debug.inspect(\"file tags\", file.tags(teleportFile.path));",
    "debug.inspect(\"file list\", demoFileList);",
    "debug.inspect(\"item summary\", itemSummary);",
    "debug.inspect(\"lead items\", leadItems);",
    "debug.inspect(\"velocity counts\", velocityCounts);",
    "debug.inspect(\"regex note\", noteMatch);",
    "debug.inspect(\"demo tests\", demoTests);",
    "debug.inspect(\"sample metadata\", sample.load(\"teleport\"));",
    "debug.inspect(\"patch types\", patch.countByType());",
    "debug.inspect(\"staged\", library.staged);",
    "console.table(demoFileList);",
    "console.table(library.staged);",
    "console.log(\"library built\", { snippets: 2, helpers: 2, ui: 3, samples: 1, patchTools: 1, slots: 2 });",
  ].join("\n");
}

function insertNodeGraphCodeScreenLibraryDemoScript() {
  const source = document.getElementById("nodeCodeScreenWorkspaceScriptSource");
  const script = nodeGraphCodeScreenLibraryDemoScript();
  if (source) {
    source.value = script;
    source.focus();
    source.setSelectionRange(script.length, script.length);
    updateNodeGraphCodeScreenWorkspaceScriptStats();
    updateNodeGraphCodeScreenWorkspaceScriptDraftState();
    updateNodeGraphCodeScreenAutocomplete();
    nodeGraphCodeScreenUpdateWorkspaceScriptStatus("demo script ready");
    return;
  }
  nodeGraphMvp.codeScreenPendingSnippet = script;
  nodeGraphMvp.codeScreenSection = "script";
  renderNodeGraphCodeScreen();
}

function closeNodeGraphCodeScreenAutocomplete() {
  const popover = document.getElementById("nodeCodeScreenAutocomplete");
  if (popover) {
    popover.hidden = true;
    popover.replaceChildren();
  }
  nodeGraphMvp.codeScreenAutocompleteOpen = false;
  nodeGraphMvp.codeScreenAutocompleteItems = [];
  nodeGraphMvp.codeScreenAutocompleteIndex = 0;
}

function insertFirstNodeGraphCodeScreenAutocompleteItem() {
  const items = nodeGraphMvp.codeScreenAutocompleteItems || [];
  const item = items[nodeGraphCodeScreenClampAutocompleteIndex(nodeGraphMvp.codeScreenAutocompleteIndex, items)];
  if (!item) {
    return false;
  }
  insertNodeGraphCodeScreenHelperSnippet(item.snippet);
  return true;
}

function saveNodeGraphCodeScreenActiveDraftFromKeyboard(target) {
  const active = target instanceof HTMLElement ? target : document.activeElement;
  if (active?.id === "nodeCodeScreenWorkspaceScriptSource") {
    applyNodeGraphCodeScreenWorkspaceScript();
    return true;
  }
  if (active?.id === "nodeCodeScreenCodeblockSource" ||
    active?.id === "nodeCodeScreenCodeblockInputs" ||
    active?.id === "nodeCodeScreenCodeblockOutputs") {
    applyNodeGraphCodeScreenCodeblockAll();
    return true;
  }
  const registryField = active?.closest?.("[data-code-screen-registry-key]");
  if (registryField) {
    saveNodeGraphCodeScreenRegistryMetadata(
      registryField.dataset.codeScreenRegistryKey,
      Number(registryField.dataset.codeScreenRegistryIndex),
    );
    return true;
  }
  return false;
}

function handleNodeGraphCodeScreenClick(event) {
  const sectionButton = event.target.closest("[data-code-screen-section]");
  if (sectionButton) {
    setNodeGraphCodeScreenSection(sectionButton.dataset.codeScreenSection);
    return;
  }
  const snippetTargetButton = event.target.closest("[data-code-screen-snippet-target]");
  if (snippetTargetButton) {
    setNodeGraphCodeScreenSnippetTarget(snippetTargetButton.dataset.codeScreenSnippetTarget);
    return;
  }
  const nodeButton = event.target.closest("[data-code-screen-node]");
  if (nodeButton) {
    nodeGraphMvp.codeScreenSelectedNodeId = nodeButton.dataset.codeScreenNode;
    renderNodeGraphCodeScreen();
    return;
  }
  const helperButton = event.target.closest("[data-code-screen-insert-helper]");
  if (helperButton) {
    insertNodeGraphCodeScreenHelperSnippet(helperButton.dataset.codeScreenInsertHelper);
    return;
  }
  const lookupButton = event.target.closest("[data-code-screen-lookup-snippet]");
  if (lookupButton) {
    insertNodeGraphCodeScreenHelperSnippet(lookupButton.dataset.codeScreenLookupSnippet);
    return;
  }
  if (event.target.closest("#nodeCodeScreenNewLookupSnippet")) {
    nodeGraphMvp.codeScreenLookupStatus = "new snippet draft";
    addNodeGraphCodeScreenSnippetItem();
    return;
  }
  const copyLookupButton = event.target.closest("[data-code-screen-copy-lookup-snippet]");
  if (copyLookupButton) {
    copyNodeGraphCodeScreenLookupSnippet(copyLookupButton.dataset.codeScreenCopyLookupSnippet);
    return;
  }
  const copyMarkdownLookupButton = event.target.closest("[data-code-screen-copy-markdown-lookup-snippet]");
  if (copyMarkdownLookupButton) {
    copyNodeGraphCodeScreenLookupMarkdownSnippet(
      copyMarkdownLookupButton.dataset.codeScreenCopyMarkdownLookupSnippet,
      copyMarkdownLookupButton.dataset.codeScreenCopyMarkdownLanguage,
    );
    return;
  }
  const editLookupButton = event.target.closest("[data-code-screen-edit-lookup-snippet]");
  if (editLookupButton) {
    openNodeGraphCodeScreenLookupSnippet(Number(editLookupButton.dataset.codeScreenEditLookupSnippet));
    return;
  }
  const detailLookupButton = event.target.closest("[data-code-screen-lookup-helper-detail]");
  if (detailLookupButton) {
    openNodeGraphCodeScreenLookupHelper(detailLookupButton.dataset.codeScreenLookupHelperDetail);
    return;
  }
  const saveLookupButton = event.target.closest("[data-code-screen-save-lookup-snippet]");
  if (saveLookupButton) {
    saveNodeGraphCodeScreenLookupSnippet(
      saveLookupButton.dataset.codeScreenSaveLookupSnippet,
      saveLookupButton.dataset.codeScreenSaveLookupDescription,
    );
    return;
  }
  const savePinLookupButton = event.target.closest("[data-code-screen-save-pin-lookup-snippet]");
  if (savePinLookupButton) {
    saveNodeGraphCodeScreenLookupPinnedSnippet(
      savePinLookupButton.dataset.codeScreenSavePinLookupSnippet,
      savePinLookupButton.dataset.codeScreenSaveLookupDescription,
    );
    return;
  }
  const lookupNamespaceButton = event.target.closest("[data-code-screen-lookup-namespace]");
  if (lookupNamespaceButton) {
    const namespace = lookupNamespaceButton.dataset.codeScreenLookupNamespace || "";
    updateNodeGraphCodeScreenLookupSearch(namespace ? `${namespace}.` : "");
    return;
  }
  const buildSummarySectionButton = event.target.closest("[data-code-screen-build-summary-section]");
  if (buildSummarySectionButton) {
    openNodeGraphCodeScreenBuildSummarySection(
      buildSummarySectionButton.dataset.codeScreenBuildSummarySection,
    );
    return;
  }
  if (event.target.closest("#nodeCodeScreenSaveLookupSelection")) {
    saveNodeGraphCodeScreenLookupSelectionSnippet();
    return;
  }
  if (event.target.closest("#nodeCodeScreenSavePinLookupSelection")) {
    saveNodeGraphCodeScreenLookupSelectionPinnedSnippet();
    return;
  }
  const helperDetailButton = event.target.closest("[data-code-screen-helper-detail]");
  if (helperDetailButton) {
    nodeGraphMvp.codeScreenHelperDetailKey = helperDetailButton.dataset.codeScreenHelperDetail;
    renderNodeGraphCodeScreen();
    return;
  }
  const helperNamespaceFilterButton = event.target.closest("[data-code-screen-helper-namespace-filter]");
  if (helperNamespaceFilterButton) {
    setNodeGraphCodeScreenHelperNamespaceFilter(helperNamespaceFilterButton.dataset.codeScreenHelperNamespaceFilter || "");
    return;
  }
  const helperSummaryFilterButton = event.target.closest("[data-code-screen-helper-summary-filter]");
  if (helperSummaryFilterButton) {
    applyNodeGraphCodeScreenHelperSummaryFilter(
      helperSummaryFilterButton.dataset.codeScreenHelperSummaryFilter,
      helperSummaryFilterButton.dataset.codeScreenHelperSummaryValue,
    );
    return;
  }
  const snippetTagButton = event.target.closest("[data-code-screen-snippet-tag]");
  if (snippetTagButton) {
    setNodeGraphCodeScreenSnippetTagFilter(snippetTagButton.dataset.codeScreenSnippetTag || "");
    return;
  }
  const snippetSortButton = event.target.closest("[data-code-screen-snippet-sort]");
  if (snippetSortButton) {
    setNodeGraphCodeScreenSnippetSort(snippetSortButton.dataset.codeScreenSnippetSort || "recent");
    return;
  }
  const prefixButton = event.target.closest("[data-code-screen-insert-prefix]");
  if (prefixButton) {
    insertNodeGraphCodeScreenText(prefixButton.dataset.codeScreenInsertPrefix);
    return;
  }
  const autocompleteButton = event.target.closest("[data-code-screen-autocomplete-snippet]");
  if (autocompleteButton) {
    nodeGraphMvp.codeScreenAutocompleteIndex = nodeGraphCodeScreenClampAutocompleteIndex(
      Number(autocompleteButton.dataset.codeScreenAutocompleteIndex),
    );
    insertNodeGraphCodeScreenHelperSnippet(autocompleteButton.dataset.codeScreenAutocompleteSnippet);
    return;
  }
  const addButton = event.target.closest("[data-code-screen-add-registry]");
  if (addButton) {
    addNodeGraphCodeScreenRegistryItem(addButton.dataset.codeScreenAddRegistry);
    return;
  }
  const addSnippetButton = event.target.closest("[data-code-screen-add-snippet]");
  if (addSnippetButton) {
    addNodeGraphCodeScreenSnippetItem();
    return;
  }
  if (event.target.closest("#nodeCodeScreenCreateCodeblockFromList")) {
    createNodeGraphCodeScreenDebugCodeblock();
    return;
  }
  const duplicateSnippetButton = event.target.closest("[data-code-screen-duplicate-snippet]");
  if (duplicateSnippetButton) {
    duplicateNodeGraphCodeScreenSnippetItem(Number(duplicateSnippetButton.dataset.codeScreenDuplicateSnippet));
    return;
  }
  const pinSnippetButton = event.target.closest("[data-code-screen-pin-snippet]");
  if (pinSnippetButton) {
    toggleNodeGraphCodeScreenSnippetPinned(Number(pinSnippetButton.dataset.codeScreenPinSnippet));
    return;
  }
  const useReturnSnippetButton = event.target.closest("[data-code-screen-use-return-snippet]");
  if (useReturnSnippetButton) {
    useNodeGraphCodeScreenSnippetAndReturn(Number(useReturnSnippetButton.dataset.codeScreenUseReturnSnippet));
    return;
  }
  const loadRunHistoryButton = event.target.closest("[data-code-screen-load-run-history]");
  if (loadRunHistoryButton) {
    loadNodeGraphCodeScreenRunHistoryItem(Number(loadRunHistoryButton.dataset.codeScreenLoadRunHistory));
    return;
  }
  const runHistoryButton = event.target.closest("[data-code-screen-run-history]");
  if (runHistoryButton) {
    runNodeGraphCodeScreenRunHistoryItem(Number(runHistoryButton.dataset.codeScreenRunHistory));
    return;
  }
  const saveRunHistorySnippetButton = event.target.closest("[data-code-screen-save-run-history-snippet]");
  if (saveRunHistorySnippetButton) {
    saveNodeGraphCodeScreenRunHistorySnippet(
      Number(saveRunHistorySnippetButton.dataset.codeScreenSaveRunHistorySnippet),
    );
    return;
  }
  const copyRunHistoryMarkdownButton = event.target.closest("[data-code-screen-copy-run-history-markdown]");
  if (copyRunHistoryMarkdownButton) {
    copyNodeGraphCodeScreenRunHistoryMarkdown(
      Number(copyRunHistoryMarkdownButton.dataset.codeScreenCopyRunHistoryMarkdown),
    );
    return;
  }
  const restoreRunHistoryWatchButton = event.target.closest("[data-code-screen-restore-run-history-watch]");
  if (restoreRunHistoryWatchButton) {
    restoreNodeGraphCodeScreenRunHistoryWatches(
      Number(restoreRunHistoryWatchButton.dataset.codeScreenRestoreRunHistoryWatch),
    );
    return;
  }
  const copyRunHistoryReportButton = event.target.closest("[data-code-screen-copy-run-history-report]");
  if (copyRunHistoryReportButton) {
    copyNodeGraphCodeScreenRunHistoryReport(
      Number(copyRunHistoryReportButton.dataset.codeScreenCopyRunHistoryReport),
    );
    return;
  }
  const duplicateRegistryButton = event.target.closest("[data-code-screen-duplicate-registry]");
  if (duplicateRegistryButton) {
    duplicateNodeGraphCodeScreenRegistryItem(
      duplicateRegistryButton.dataset.codeScreenDuplicateRegistry,
      Number(duplicateRegistryButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const templateButton = event.target.closest("[data-code-screen-add-template]");
  if (templateButton) {
    addNodeGraphCodeScreenRegistryTemplate(
      templateButton.dataset.codeScreenAddTemplate,
      Number(templateButton.dataset.codeScreenTemplateIndex),
    );
    return;
  }
  const removeButton = event.target.closest("[data-code-screen-remove-registry]");
  if (removeButton) {
    removeNodeGraphCodeScreenRegistryItem(
      removeButton.dataset.codeScreenRemoveRegistry,
      Number(removeButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const saveMetadataButton = event.target.closest("[data-code-screen-save-registry-metadata]");
  if (saveMetadataButton) {
    saveNodeGraphCodeScreenRegistryMetadata(
      saveMetadataButton.dataset.codeScreenSaveRegistryMetadata,
      Number(saveMetadataButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const saveAllMetadataButton = event.target.closest("[data-code-screen-save-all-registry]");
  if (saveAllMetadataButton) {
    saveNodeGraphCodeScreenRegistryAllMetadata(saveAllMetadataButton.dataset.codeScreenSaveAllRegistry);
    return;
  }
  const resetRegistryButton = event.target.closest("[data-code-screen-reset-registry]");
  if (resetRegistryButton) {
    resetNodeGraphCodeScreenRegistryDraft(
      resetRegistryButton.dataset.codeScreenResetRegistry,
      Number(resetRegistryButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const moveButton = event.target.closest("[data-code-screen-move-registry]");
  if (moveButton) {
    moveNodeGraphCodeScreenRegistryItem(
      moveButton.dataset.codeScreenMoveRegistry,
      Number(moveButton.dataset.codeScreenRegistryIndex),
      Number(moveButton.dataset.codeScreenMoveDirection),
    );
    return;
  }
  const insertRegistryButton = event.target.closest("[data-code-screen-insert-registry]");
  if (insertRegistryButton) {
    insertNodeGraphCodeScreenRegistrySnippet(
      insertRegistryButton.dataset.codeScreenInsertRegistry,
      Number(insertRegistryButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const saveRegistrySnippetButton = event.target.closest("[data-code-screen-save-registry-snippet]");
  if (saveRegistrySnippetButton) {
    saveNodeGraphCodeScreenRegistrySnippet(
      saveRegistrySnippetButton.dataset.codeScreenSaveRegistrySnippet,
      Number(saveRegistrySnippetButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const savePinRegistrySnippetButton = event.target.closest("[data-code-screen-save-pin-registry-snippet]");
  if (savePinRegistrySnippetButton) {
    saveNodeGraphCodeScreenRegistryPinnedSnippet(
      savePinRegistrySnippetButton.dataset.codeScreenSavePinRegistrySnippet,
      Number(savePinRegistrySnippetButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const copyRegistrySnippetButton = event.target.closest("[data-code-screen-copy-registry-snippet]");
  if (copyRegistrySnippetButton) {
    copyNodeGraphCodeScreenRegistrySnippet(
      copyRegistrySnippetButton.dataset.codeScreenCopyRegistrySnippet,
      Number(copyRegistrySnippetButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
  const copyMarkdownRegistrySnippetButton = event.target.closest("[data-code-screen-copy-markdown-registry-snippet]");
  if (copyMarkdownRegistrySnippetButton) {
    copyNodeGraphCodeScreenRegistryMarkdownSnippet(
      copyMarkdownRegistrySnippetButton.dataset.codeScreenCopyMarkdownRegistrySnippet,
      Number(copyMarkdownRegistrySnippetButton.dataset.codeScreenRegistryIndex),
    );
    return;
  }
}

function bindNodeGraphCodeScreenEvents() {
  const view = document.getElementById("nodeCodeScreenView");
  if (!view) {
    return;
  }
  view.addEventListener("click", handleNodeGraphCodeScreenClick);
  view.addEventListener("input", (event) => {
    if (event.target?.id === "nodeCodeScreenCodeblockSource") {
      updateNodeGraphCodeScreenAutocomplete();
      updateNodeGraphCodeScreenCodeblockSummary();
      queueMicrotask(nodeGraphCodeScreenUpdateCodeStatus);
    } else if (event.target?.id === "nodeCodeScreenCodeblockInputs" ||
      event.target?.id === "nodeCodeScreenCodeblockOutputs") {
      updateNodeGraphCodeScreenCodeblockSummary();
    } else if (event.target?.id === "nodeCodeScreenWorkspaceScriptSource") {
      updateNodeGraphCodeScreenAutocomplete();
      updateNodeGraphCodeScreenWorkspaceScriptStats();
      nodeGraphCodeScreenUpdateWorkspaceScriptStatus("script editing");
      updateNodeGraphCodeScreenWorkspaceScriptDraftState();
    } else if (event.target?.id === "nodeCodeScreenWorkspaceScriptLanguage") {
      updateNodeGraphCodeScreenWorkspaceScriptStats();
      nodeGraphCodeScreenUpdateWorkspaceScriptStatus("script language editing");
      updateNodeGraphCodeScreenWorkspaceScriptDraftState();
    } else if (event.target?.id === "nodeCodeScreenHelperSearch") {
      updateNodeGraphCodeScreenHelperSearch(
        event.target.value,
        event.target.selectionStart ?? event.target.value.length,
        event.target.selectionEnd ?? event.target.value.length,
      );
    } else if (event.target?.id === "nodeCodeScreenSnippetSearch") {
      updateNodeGraphCodeScreenSnippetSearch(
        event.target.value,
        event.target.selectionStart ?? event.target.value.length,
        event.target.selectionEnd ?? event.target.value.length,
      );
    } else if (event.target?.id === "nodeCodeScreenCodeblockSearch") {
      updateNodeGraphCodeScreenCodeblockSearch(
        event.target.value,
        event.target.selectionStart ?? event.target.value.length,
        event.target.selectionEnd ?? event.target.value.length,
      );
    } else if (event.target?.id === "nodeCodeScreenLookupSearch") {
      updateNodeGraphCodeScreenLookupSearch(event.target.value);
    } else if (event.target?.id === "nodeCodeScreenWorkspaceWatchSearch") {
      updateNodeGraphCodeScreenWorkspaceWatchSearch(
        event.target.value,
        event.target.selectionStart ?? event.target.value.length,
        event.target.selectionEnd ?? event.target.value.length,
      );
    } else if (event.target?.matches("[data-code-screen-registry-field]")) {
      updateNodeGraphCodeScreenRegistryDraftCard(event.target);
    }
  });
  view.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
      if (saveNodeGraphCodeScreenActiveDraftFromKeyboard(event.target)) {
        event.preventDefault();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
      if (focusNodeGraphCodeScreenLookupSearch()) {
        event.preventDefault();
      }
      return;
    }
    if (event.target?.id === "nodeCodeScreenLookupSearch" && event.key === "Enter") {
      const handled = event.shiftKey
        ? openFirstNodeGraphCodeScreenLookupItem()
        : insertFirstNodeGraphCodeScreenLookupItem();
      if (handled) {
        event.preventDefault();
      }
      return;
    }
    if (event.target?.id !== "nodeCodeScreenCodeblockSource" &&
      event.target?.id !== "nodeCodeScreenWorkspaceScriptSource") {
      return;
    }
    if (event.target?.id === "nodeCodeScreenWorkspaceScriptSource" &&
      (event.ctrlKey || event.metaKey) && !event.altKey && event.key === "Enter" &&
      !nodeGraphMvp.codeScreenAutocompleteOpen) {
      if (event.shiftKey) {
        runNodeGraphCodeScreenSelectedWorkspaceScript();
      } else {
        runNodeGraphCodeScreenWorkspaceScript();
      }
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && nodeGraphMvp.codeScreenAutocompleteOpen) {
      closeNodeGraphCodeScreenAutocomplete();
      event.preventDefault();
    } else if (event.key === "ArrowDown" && nodeGraphMvp.codeScreenAutocompleteOpen) {
      setNodeGraphCodeScreenAutocompleteIndex(nodeGraphMvp.codeScreenAutocompleteIndex + 1);
      event.preventDefault();
    } else if (event.key === "ArrowUp" && nodeGraphMvp.codeScreenAutocompleteOpen) {
      setNodeGraphCodeScreenAutocompleteIndex(nodeGraphMvp.codeScreenAutocompleteIndex - 1);
      event.preventDefault();
    } else if ((event.key === "Tab" || event.key === "Enter") && nodeGraphMvp.codeScreenAutocompleteOpen) {
      if (insertFirstNodeGraphCodeScreenAutocompleteItem()) {
        event.preventDefault();
      }
    }
  });
  view.addEventListener("change", (event) => {
    if (event.target?.matches("[data-code-screen-registry-field]")) {
      updateNodeGraphCodeScreenRegistryItem(event.target);
    }
  });
  view.addEventListener("click", (event) => {
    if (event.target?.id === "nodeCodeScreenApplyPorts") {
      applyNodeGraphCodeScreenCodeblockPorts();
    } else if (event.target?.id === "nodeCodeScreenNewCodeblock") {
      // Label reflects the currently-selected node's kind (see
      // renderNodeGraphCodeScreenCodeblockEditor) -- must create that same
      // kind, not silently fall back to a Codeblock.
      nodeGraphCodeScreenKindForNode(nodeGraphCodeScreenSelectedCodeblock()).createFn();
    } else if (event.target?.id === "nodeCodeScreenApplyCode") {
      applyNodeGraphCodeScreenCodeblockSource();
    } else if (event.target?.id === "nodeCodeScreenApplyAll") {
      applyNodeGraphCodeScreenCodeblockAll();
    } else if (event.target?.id === "nodeCodeScreenResetCodeblockDraft") {
      resetNodeGraphCodeScreenCodeblockDraft();
    } else if (event.target?.id === "nodeCodeScreenSaveCodeblockSnippet") {
      saveNodeGraphCodeScreenCodeblockSnippet();
    } else if (event.target?.id === "nodeCodeScreenSaveCodeblockPinnedSnippet") {
      saveNodeGraphCodeScreenCodeblockPinnedSnippet();
    } else if (event.target?.id === "nodeCodeScreenSaveHelperSnippet") {
      saveNodeGraphCodeScreenHelperDetailSnippet();
    } else if (event.target?.id === "nodeCodeScreenSaveHelperPinnedSnippet") {
      saveNodeGraphCodeScreenHelperDetailPinnedSnippet();
    } else if (event.target?.id === "nodeCodeScreenApplyCodeReturn") {
      applyNodeGraphCodeScreenCodeblockAll();
      focusNodeGraphCodeScreenModule();
    } else if (event.target?.id === "nodeCodeScreenFocusModule") {
      focusNodeGraphCodeScreenModule();
    } else if (event.target?.id === "nodeCodeScreenApplyWorkspaceScript") {
      applyNodeGraphCodeScreenWorkspaceScript();
    } else if (event.target?.id === "nodeCodeScreenRunWorkspaceScript") {
      runNodeGraphCodeScreenWorkspaceScript();
    } else if (event.target?.id === "nodeCodeScreenRunSelectedWorkspaceScript") {
      runNodeGraphCodeScreenSelectedWorkspaceScript();
    } else if (event.target?.id === "nodeCodeScreenCopyWorkspaceScriptMarkdown") {
      copyNodeGraphCodeScreenWorkspaceScriptMarkdown();
    } else if (event.target?.id === "nodeCodeScreenCopyWorkspaceDebugReport") {
      copyNodeGraphCodeScreenWorkspaceDebugReport();
    } else if (event.target?.id === "nodeCodeScreenCopyWorkspaceConsoleMarkdown") {
      copyNodeGraphCodeScreenWorkspaceConsoleMarkdown();
    } else if (event.target?.id === "nodeCodeScreenClearWorkspaceConsole") {
      clearNodeGraphCodeScreenWorkspaceConsole();
    } else if (event.target?.id === "nodeCodeScreenClearWorkspaceWatches") {
      clearNodeGraphCodeScreenWorkspaceWatches();
    } else if (event.target?.id === "nodeCodeScreenCopyWorkspaceWatchMarkdown") {
      copyNodeGraphCodeScreenWorkspaceWatchMarkdown();
    } else if (event.target?.id === "nodeCodeScreenClearRunHistory") {
      clearNodeGraphCodeScreenRunHistory();
    } else if (event.target?.matches("[data-code-screen-copy-watch]")) {
      copyNodeGraphCodeScreenWorkspaceWatch(event.target.dataset.codeScreenCopyWatch);
    } else if (event.target?.matches("[data-code-screen-copy-watch-inspect]")) {
      copyNodeGraphCodeScreenWorkspaceWatchInspect(event.target.dataset.codeScreenCopyWatchInspect);
    } else if (event.target?.matches("[data-code-screen-insert-watch-inspect]")) {
      insertNodeGraphCodeScreenWorkspaceWatchInspect(event.target.dataset.codeScreenInsertWatchInspect);
    } else if (event.target?.id === "nodeCodeScreenResetWorkspaceScript") {
      resetNodeGraphCodeScreenWorkspaceScriptDraft();
    } else if (event.target?.id === "nodeCodeScreenSaveWorkspaceSnippet") {
      saveNodeGraphCodeScreenWorkspaceSnippet();
    } else if (event.target?.id === "nodeCodeScreenSaveWorkspacePinnedSnippet") {
      saveNodeGraphCodeScreenWorkspacePinnedSnippet();
    } else if (event.target?.id === "nodeCodeScreenInsertLibraryDemoScript") {
      insertNodeGraphCodeScreenLibraryDemoScript();
    } else if (event.target?.id === "nodeCodeScreenInsertTeleportScript") {
      insertNodeGraphCodeScreenTeleportScriptStub();
    } else if (event.target?.id === "nodeCodeScreenOpenHelpers") {
      setNodeGraphCodeScreenSection("helpers");
    } else if (event.target?.id === "nodeCodeScreenSnippetsOpenHelpers") {
      setNodeGraphCodeScreenSection("helpers");
    } else if (event.target?.id === "nodeCodeScreenClearHelperSearch") {
      clearNodeGraphCodeScreenHelperSearch();
    } else if (event.target?.id === "nodeCodeScreenClearSnippetSearch") {
      clearNodeGraphCodeScreenSnippetSearch();
    } else if (event.target?.id === "nodeCodeScreenClearCodeblockSearch") {
      clearNodeGraphCodeScreenCodeblockSearch();
    } else if (event.target?.id === "nodeCodeScreenClearLookupSearch") {
      clearNodeGraphCodeScreenLookupSearch();
    }
  });
}
