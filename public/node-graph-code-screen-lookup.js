// Code Screen lookup / helpers / snippets — peeled from node-graph-code-screen.js
// (docs/GRAPHIFY_WINS_PLAN.md Track 1.2). Satellite-loaded after main code-screen UI.

function nodeGraphCodeScreenMarkdownLanguage(value = "javascript") {
  return normalizeNodeGraphCodeScreenLanguage(value || "javascript");
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


function saveNodeGraphCodeScreenCodeblockPinnedSnippet() {
  return saveNodeGraphCodeScreenCodeblockSnippetWithTags("codeblock pinned", "snippet saved + pinned");
}

function saveNodeGraphCodeScreenCodeblockSnippet() {
  return saveNodeGraphCodeScreenCodeblockSnippetWithTags("codeblock", "snippet saved");
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
