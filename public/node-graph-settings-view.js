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
  const highlighter = window.nodeCodeSettingsEditor?.jsonHighlightHtml;
  highlight.innerHTML = typeof highlighter === "function"
    ? highlighter(raw.value)
    : (window.nodeCodeSettingsEditor?.escapeHtml?.(raw.value) || raw.value);
  highlight.scrollTop = raw.scrollTop;
  highlight.scrollLeft = raw.scrollLeft;
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
  setNodeGraphSettingsField("patchNameValue", info.name);
  setNodeGraphSettingsField("patchBankValue", info.bank);
  setNodeGraphSettingsField("patchProgramValue", info.program);
  setNodeGraphSettingsField("patchBankNameValue", info.bankName);
  setNodeGraphSettingsField("patchAuthorValue", info.author);
  setNodeGraphSettingsField("patchTagsValue", info.tags);
  setNodeGraphSettingsField("patchDescriptionValue", info.description);
  // Grid unit px is edited in UIDEV.
  if (typeof syncNodeUiDevPatchGridFields === "function") {
    syncNodeUiDevPatchGridFields();
  }
}

function readNodeGraphSettingsView() {
  return normalizeNodeGraphPatchInfo({
    author: document.getElementById("patchAuthorValue")?.value,
    bank: document.getElementById("patchBankValue")?.value,
    bankName: document.getElementById("patchBankNameValue")?.value,
    description: document.getElementById("patchDescriptionValue")?.value,
    name: document.getElementById("patchNameValue")?.value,
    program: document.getElementById("patchProgramValue")?.value,
    tags: document.getElementById("patchTagsValue")?.value,
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
  if (event?.currentTarget?.hasAttribute?.("data-patch-info-field")
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

