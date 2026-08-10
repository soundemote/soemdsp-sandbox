// Code Screen registry — peeled from node-graph-code-screen.js
// (docs/GRAPHIFY_WINS_PLAN.md Track 1.3). Satellite-loaded after main UI.

function nodeGraphCodeScreenRegistryKeyForSection(sectionId) {
  return {
    helpers: "helpers",
    patchTools: "patchTools",
    samples: "samples",
    ui: "ui",
  }[sectionId] || "";
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
