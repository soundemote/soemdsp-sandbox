// Code Screen render / codeblocks / watches — peeled from
// node-graph-code-screen.js (docs/GRAPHIFY_WINS_PLAN.md Track 1.5).

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
