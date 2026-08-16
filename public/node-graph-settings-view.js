function renderNodeGraphVisualSettings() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const visual = normalizeNodeGraphPatchVisual(nodeGraphMvp.patch.visual);
  const uiBackground = document.getElementById("nodeUiDevWorkspaceBackgroundColor")?.value;
  workspace.style.setProperty(
    "--node-workspace-bg",
    uiBackground
      ? normalizeNodeUiDevColor(uiBackground, nodeGraphWorkspaceBackgroundCss(visual.background))
      : nodeGraphWorkspaceBackgroundCss(visual.background),
  );
}

function syncNodePatchRawTextHighlight() {
  const raw = document.getElementById("nodePatchRawText");
  const highlight = document.getElementById("nodePatchRawHighlight");
  if (!raw || !highlight) {
    return;
  }
  // Syntax highlighting is off: rebuilding a span forest for a full patch
  // JSON is what made the script page unusably heavy.
  highlight.replaceChildren();
  highlight.hidden = true;
}

function nodeGraphBookScriptPage() {
  return nodeGraphMvp?.bookScriptPage === "ui-settings" ? "ui-settings" : "patch";
}

function renderNodeGraphBookScriptPage() {
  const page = nodeGraphBookScriptPage();
  const view = document.getElementById("nodeSettingsView");
  view?.setAttribute("data-book-script-page", page);
  const title = document.getElementById("nodeSettingsViewTitle");
  if (title) {
    title.textContent = "Script";
  }
  const heading = view?.querySelector(":scope > .scene-context-heading");
  heading?.setAttribute("aria-label", page === "ui-settings" ? "UI settings script page" : "Script page");
  const patchPage = document.getElementById("nodePatchScriptPage");
  const uiPage = document.getElementById("nodeUiSettingsScriptPage");
  if (patchPage) {
    patchPage.hidden = page !== "patch";
  }
  if (uiPage) {
    uiPage.hidden = page !== "ui-settings";
  }
  for (const tab of document.querySelectorAll("[data-book-script-page]")) {
    if (tab.getAttribute("role") !== "tab") {
      continue;
    }
    tab.setAttribute("aria-selected", String(tab.dataset.bookScriptPage === page));
  }
}

function setNodeGraphBookScriptPage(page, options = {}) {
  const next = page === "ui-settings" ? "ui-settings" : "patch";
  const previous = nodeGraphBookScriptPage();
  if (previous === "ui-settings" && next !== "ui-settings" && typeof flushNodeUiDevSettingsScriptCommit === "function") {
    flushNodeUiDevSettingsScriptCommit();
  }
  if (previous === "patch" && next !== "patch" && typeof flushNodeGraphScriptCommit === "function") {
    flushNodeGraphScriptCommit();
  }
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.bookScriptPage = next;
  }
  renderNodeGraphBookScriptPage();
  if (next === "ui-settings" && typeof syncNodeUiDevSettingsScriptView === "function") {
    syncNodeUiDevSettingsScriptView();
  }
  if (next === "patch" && typeof syncNodeGraphSettingsView === "function" && options.sync !== false) {
    const raw = document.getElementById("nodePatchRawText");
    if (raw && document.activeElement !== raw && typeof serializeNodeGraphPatch === "function") {
      raw.value = serializeNodeGraphPatch();
    }
  }
  if (next !== previous && options.note !== false && typeof noteNodeGraphCommandCenterPage === "function") {
    noteNodeGraphCommandCenterPage(next === "ui-settings" ? "ui settings script page" : "script page");
  }
  if (next !== previous && options.persist !== false && typeof persistNodeGraphUserSession === "function") {
    persistNodeGraphUserSession();
  }
}

function syncNodeUiDevSettingsScriptView() {
  const raw = document.getElementById("nodeUiSettingsRawText");
  if (!raw || document.activeElement === raw || nodeGraphMvp?.uiSettingsScriptDirty) {
    return;
  }
  if (typeof serializeNodeUiDevSettings !== "function") {
    return;
  }
  raw.value = serializeNodeUiDevSettings();
}

function syncNodeGraphSettingsView() {
  const info = normalizeNodeGraphPatchInfo(nodeGraphMvp.patch.info);
  if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    syncNodeGraphCurrentSavedPatchHeader();
  }
  const raw = document.getElementById("nodePatchRawText");
  if (raw && document.activeElement !== raw && typeof serializeNodeGraphPatch === "function") {
    raw.value = serializeNodeGraphPatch();
  }
  syncNodePatchRawTextHighlight();
  if (typeof renderNodeGraphBookScriptPage === "function") {
    renderNodeGraphBookScriptPage();
  }
  if (typeof syncNodeUiDevSettingsScriptView === "function") {
    syncNodeUiDevSettingsScriptView();
  }
  setNodeGraphSettingsField("patchNameValue", info.name);
  setNodeGraphSettingsField("nodePatchDefaultsName", info.name);
  setNodeGraphSettingsField("patchBankValue", info.bank);
  setNodeGraphSettingsField("nodePatchDefaultsBank", info.bank);
  setNodeGraphSettingsField("patchProgramValue", info.program);
  setNodeGraphSettingsField("nodePatchDefaultsProgram", info.program);
  setNodeGraphSettingsField("patchBankNameValue", info.bankName);
  setNodeGraphSettingsField("nodePatchDefaultsBankName", info.bankName);
  setNodeGraphSettingsField("patchCategoryValue", info.category);
  setNodeGraphSettingsField("nodePatchDefaultsCategory", info.category);
  setNodeGraphSettingsField("patchAuthorValue", info.author);
  setNodeGraphSettingsField("nodePatchDefaultsAuthor", info.author);
  setNodeGraphSettingsField("patchTagsValue", info.tags);
  setNodeGraphSettingsField("nodePatchDefaultsTags", info.tags);
  setNodeGraphSettingsField("patchDescriptionValue", info.description);
  setNodeGraphSettingsField("nodePatchDefaultsDescription", info.description);
  if (typeof applyNodeGraphPatchFaceDisplay === "function") {
    applyNodeGraphPatchFaceDisplay();
  }
  // Grid unit px is edited in UIDEV.
  if (typeof syncNodeUiDevPatchGridFields === "function") {
    syncNodeUiDevPatchGridFields();
  }
}

function nodeGraphPatchInfoFieldValue(key, ...ids) {
  const active = document.activeElement;
  if (active?.getAttribute?.("data-patch-info-field") === key) {
    return active.value;
  }
  for (const id of ids) {
    const field = document.getElementById(id);
    if (field) {
      return field.value;
    }
  }
  const any = document.querySelector(`[data-patch-info-field="${CSS.escape(String(key || ""))}"]`);
  return any?.value ?? "";
}

function readNodeGraphSettingsView() {
  return normalizeNodeGraphPatchInfo({
    author: nodeGraphPatchInfoFieldValue("author", "nodePatchDefaultsAuthor", "patchAuthorValue"),
    bank: nodeGraphPatchInfoFieldValue("bank", "nodePatchDefaultsBank", "patchBankValue"),
    bankName: nodeGraphPatchInfoFieldValue("bankName", "nodePatchDefaultsBankName", "patchBankNameValue"),
    category: nodeGraphPatchInfoFieldValue("category", "nodePatchDefaultsCategory", "patchCategoryValue"),
    description: nodeGraphPatchInfoFieldValue("description", "nodePatchDefaultsDescription", "patchDescriptionValue"),
    name: nodeGraphPatchInfoFieldValue("name", "nodePatchDefaultsName", "patchNameValue"),
    program: nodeGraphPatchInfoFieldValue("program", "nodePatchDefaultsProgram", "patchProgramValue"),
    tags: nodeGraphPatchInfoFieldValue("tags", "nodePatchDefaultsTags", "patchTagsValue"),
  });
}

/** Visual chrome is not edited on the patch page (UIDEV + patch.visual defaults). */
function readNodeGraphVisualSettingsView() {
  return normalizeNodeGraphPatchVisual(nodeGraphMvp?.patch?.visual);
}

/** Audio sample-rate UI removed; keep patch.audio intact. */
function readNodeGraphAudioSettingsView() {
  return normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio);
}

function readNodeGraphGridSettingsView() {
  // Prefer UIDEV patch-grid fields; otherwise keep current patch.grid.
  const fromUi = {
    heightPx: nodeGraphSyncedFieldValue(["nodeUiDevPatchGridHeightPx"]),
    widthPx: nodeGraphSyncedFieldValue(["nodeUiDevPatchGridWidthPx"]),
  };
  if (Number.isFinite(Number(fromUi.widthPx)) || Number.isFinite(Number(fromUi.heightPx))) {
    return normalizeNodeGraphPatchGrid({
      ...normalizeNodeGraphPatchGrid(nodeGraphMvp?.patch?.grid),
      ...fromUi,
    });
  }
  return normalizeNodeGraphPatchGrid(nodeGraphMvp?.patch?.grid);
}

/** Sync UIDEV grid unit fields from patch.grid (and show px outputs). */
function syncNodeUiDevPatchGridFields() {
  const grid = normalizeNodeGraphPatchGrid(nodeGraphMvp?.patch?.grid);
  const w = document.getElementById("nodeUiDevPatchGridWidthPx");
  const h = document.getElementById("nodeUiDevPatchGridHeightPx");
  const wOut = document.getElementById("nodeUiDevPatchGridWidthPxValue");
  const hOut = document.getElementById("nodeUiDevPatchGridHeightPxValue");
  if (w && document.activeElement !== w) {
    w.value = String(grid.widthPx);
  }
  if (h && document.activeElement !== h) {
    h.value = String(grid.heightPx);
  }
  if (wOut) {
    wOut.textContent = `${grid.widthPx}px`;
  }
  if (hOut) {
    hOut.textContent = `${grid.heightPx}px`;
  }
}

/**
 * Apply grid unit px from UIDEV → patch.grid and refresh modular layout.
 */
function applyNodeUiDevPatchGridFromFields(options = {}) {
  const widthPx = Number(document.getElementById("nodeUiDevPatchGridWidthPx")?.value);
  const heightPx = Number(document.getElementById("nodeUiDevPatchGridHeightPx")?.value);
  if (!Number.isFinite(widthPx) && !Number.isFinite(heightPx)) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.grid = normalizeNodeGraphPatchGrid({
    ...patch.grid,
    ...(Number.isFinite(widthPx) ? { widthPx } : {}),
    ...(Number.isFinite(heightPx) ? { heightPx } : {}),
  });
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: options.record === true,
    status: "grid unit size changed",
  });
  syncNodeUiDevPatchGridFields();
  if (typeof applyNodeGraphWorkspaceView === "function") {
    applyNodeGraphWorkspaceView();
  }
}

function handleNodeGraphSettingsInput(event) {
  if (event?.target?.closest?.("[data-patch-info-field]")
    && typeof setNodeGraphCurrentSavedPatch === "function") {
    setNodeGraphCurrentSavedPatch("");
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.audio = readNodeGraphAudioSettingsView();
  patch.grid = readNodeGraphGridSettingsView();
  patch.info = readNodeGraphSettingsView();
  patch.visual = readNodeGraphVisualSettingsView();
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: false,
    softDom: true,
    status: "patch settings synced",
  });
  if (typeof drawNodeRenderedVisualOutput === "function") {
    drawNodeRenderedVisualOutput();
  }
}

function commitNodeGraphSettingsHistory() {
  recordNodeGraphHistory();
  const scriptStatus = nodeGraphPatchScriptStatus("patch settings saved", true);
  syncNodeGraphScriptView(scriptStatus.message, scriptStatus.ok);
}

