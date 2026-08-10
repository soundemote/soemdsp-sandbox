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

function nodeGraphCodeScreenMarkdownFence(source, language = "javascript") {
  const text = String(source || "").trim();
  const fence = text.includes("```") ? "````" : "```";
  return `${fence}${nodeGraphCodeScreenMarkdownLanguage(language)}\n${text}\n${fence}`;
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
