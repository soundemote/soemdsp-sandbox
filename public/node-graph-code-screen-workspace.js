// Code Screen workspace script / autocomplete / run history — peeled from
// node-graph-code-screen.js (docs/GRAPHIFY_WINS_PLAN.md Track 1.4 + 1.6).

function renderNodeGraphCodeScreenAutocompleteMount() {
  const popover = document.createElement("div");
  popover.id = "nodeCodeScreenAutocomplete";
  popover.className = "node-code-screen-autocomplete";
  popover.hidden = true;
  return popover;
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


function nodeGraphCodeScreenUpdateWorkspaceScriptStatus(message = "script editing") {
  nodeGraphMvp.codeScreenWorkspaceScriptStatus = message;
  const status = document.getElementById("nodeCodeScreenWorkspaceScriptStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.className = "ok";
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
