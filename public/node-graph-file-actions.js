function nodeGraphPatchFileName() {
  const info = normalizeNodeGraphPatchInfo(nodeGraphMvp.patch.info);
  const baseName = info.name || "soemdsp-patch";
  const tagName = info.tags && info.tags !== "tags"
    ? `-${info.tags}`
    : "";
  const safeName = `${baseName}${tagName}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "soemdsp-patch"}.json`;
}

function nodeGraphPatchWithLiveHeaderInfo(patch = nodeGraphMvp.patch) {
  const nextPatch = cloneNodeGraphPatch(patch);
  const headerBankName = document.getElementById("nodePatchBankNameHeader");
  const headerName = document.getElementById("nodePatchNameHeader");
  const headerTags = document.getElementById("nodePatchTagsHeader");
  const explorerName = document.getElementById("nodeSavedPatchesPatchNameInput");
  const explorerTags = document.getElementById("nodeSavedPatchesPatchTagsInput");
  const explorerBankName = document.getElementById("nodeSavedPatchesBankNameInput");
  const bank = normalizeNodeGraphSavedPatchBankIndex(nodeGraphMvp.savedPatchBankIndex);
  const program = normalizeNodeGraphSavedPatchProgramIndex(nodeGraphMvp.selectedSavedPatchProgram);
  nextPatch.info = normalizeNodeGraphPatchInfo({
    ...nextPatch.info,
    bank,
    bankName: explorerBankName ? explorerBankName.value : headerBankName ? headerBankName.value : nodeGraphMvp.savedPatchBankName,
    name: explorerName ? explorerName.value : headerName ? headerName.value : nextPatch.info?.name,
    program,
    tags: explorerTags ? explorerTags.value : headerTags ? headerTags.value : nextPatch.info?.tags,
  });
  return nextPatch;
}

const nodeGraphPatchPresetStorageKey = "soemdsp-sandbox.patchPresets.v1";
const nodeGraphSavedPatchBankSlotCount = 128;
const nodeGraphSavedPatchBankMaxProgram = nodeGraphSavedPatchBankSlotCount - 1;
const nodeGraphSavedPatchesWindowDefaultSize = Object.freeze({
  width: 380,
  height: 620,
  minWidth: 280,
  maxWidth: 720,
  minHeight: 280,
  maxHeight: 760,
});

function nodeGraphSavedPatchDisplayName(filename) {
  return String(filename || "")
    .replace(/\.json$/i, "")
    .replace(/^\d{8}-\d{6}-\d{3}-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function normalizeNodeGraphSavedPatchesWindowSize(size = {}) {
  if (typeof normalizeNodeGraphFloatingWindowSize === "function") {
    return normalizeNodeGraphFloatingWindowSize(size, nodeGraphSavedPatchesWindowDefaultSize);
  }
  const source = size && typeof size === "object" ? size : {};
  return {
    width: Math.max(
      nodeGraphSavedPatchesWindowDefaultSize.minWidth,
      Math.min(
        nodeGraphSavedPatchesWindowDefaultSize.maxWidth,
        Math.round(Number(source.width) || nodeGraphSavedPatchesWindowDefaultSize.width),
      ),
    ),
    height: Math.max(
      nodeGraphSavedPatchesWindowDefaultSize.minHeight,
      Math.min(
        nodeGraphSavedPatchesWindowDefaultSize.maxHeight,
        Math.round(Number(source.height) || nodeGraphSavedPatchesWindowDefaultSize.height),
      ),
    ),
  };
}

function applyNodeGraphSavedPatchesWindowSize(size = {}) {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  const normalized = normalizeNodeGraphSavedPatchesWindowSize(size);
  if (panel) {
    if (typeof applyNodeGraphFloatingWindowSizeVars === "function") {
      applyNodeGraphFloatingWindowSizeVars(panel, "node-saved-patches", nodeGraphSavedPatchesWindowDefaultSize, normalized);
    } else {
      panel.style.setProperty("--node-saved-patches-width", `${normalized.width}px`);
      panel.style.setProperty("--node-saved-patches-height", `${normalized.height}px`);
    }
  }
  return normalized;
}

function setNodeGraphCurrentSavedPatch(filename = "") {
  nodeGraphMvp.currentSavedPatchFilename = String(filename || "");
  if (nodeGraphMvp.currentSavedPatchFilename) {
    nodeGraphMvp.selectedSavedPatchFilename = nodeGraphMvp.currentSavedPatchFilename;
    const entry = nodeGraphSavedPatchEntryByFilename(nodeGraphMvp.currentSavedPatchFilename);
    if (Number.isFinite(Number(entry?.program))) {
      nodeGraphMvp.selectedSavedPatchProgram = normalizeNodeGraphSavedPatchProgramIndex(entry.program);
    }
  }
  syncNodeGraphSelectedSavedPatchEditor();
  syncNodeGraphCurrentSavedPatchHeader();
  syncNodeGraphSavedPatchRowSelection();
  if (nodeGraphMvp.workingPatch && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  }
}

function selectNodeGraphSavedPatch(filename = "", program = null) {
  const safeFilename = String(filename || "");
  nodeGraphMvp.selectedSavedPatchFilename = safeFilename;
  if (program !== null) {
    nodeGraphMvp.selectedSavedPatchProgram = normalizeNodeGraphSavedPatchProgramIndex(program);
  }
  syncNodeGraphSelectedSavedPatchEditor();
  syncNodeGraphSavedPatchRowSelection();
  const slot = String(nodeGraphMvp.selectedSavedPatchProgram).padStart(3, "0");
  setNodeGraphScriptStatus(safeFilename ? `patch slot ${slot} selected: ${safeFilename}` : `empty patch slot ${slot} selected`, true);
}

function setNodeGraphPatchDirtyState(state = "edited") {
  nodeGraphMvp.patchDirtyState = ["saved", "edited", "untouched"].includes(state) ? state : "edited";
  syncNodeGraphCurrentSavedPatchHeader();
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings();
  }
}

let nodeGraphWorkingPatchFileAutosaveTimer = 0;

function scheduleNodeGraphWorkingPatchFileAutosave(text, options = {}) {
  if (typeof postNodeUiDevSettingsPreset !== "function") {
    return Promise.resolve(false);
  }
  if (nodeGraphWorkingPatchFileAutosaveTimer) {
    window.clearTimeout(nodeGraphWorkingPatchFileAutosaveTimer);
  }
  if (options.immediate) {
    nodeGraphWorkingPatchFileAutosaveTimer = 0;
    return postNodeUiDevSettingsPreset(text).then(() => true).catch(() => {
      // Local settings already saved when possible; file sync is a best-effort fallback.
      return false;
    });
  }
  nodeGraphWorkingPatchFileAutosaveTimer = window.setTimeout(() => {
    nodeGraphWorkingPatchFileAutosaveTimer = 0;
    postNodeUiDevSettingsPreset(text).catch(() => {
      // Local settings already saved; file sync is best-effort while dragging.
    });
  }, 350);
  return Promise.resolve(true);
}

function saveNodeGraphWorkingPatchToUserSettings(options = {}) {
  if (
    typeof serializeNodeUiDevSettings !== "function" ||
    typeof saveNodeUiDevLocalDefaultSettings !== "function"
  ) {
    return false;
  }
  // Prefer live graph; fall back to last known working patch if patch is empty
  // mid-transition (should not happen, but never serialize "no modules" over a
  // non-empty autosave by accident).
  const live = nodeGraphMvp.patch;
  const liveCount = Array.isArray(live?.nodes) ? live.nodes.length : 0;
  const priorCount = Array.isArray(nodeGraphMvp.workingPatch?.nodes)
    ? nodeGraphMvp.workingPatch.nodes.length
    : 0;
  if (liveCount === 0 && priorCount > 0 && options.allowEmpty !== true) {
    console.warn(
      "[soemdsp] Refusing to autosave empty patch over non-empty working patch",
      `(had ${priorCount} modules)`,
    );
    return false;
  }
  nodeGraphMvp.workingPatch = cloneNodeGraphPatch(live);
  syncNodeGraphCurrentSavedPatchHeader();
  const text = serializeNodeUiDevSettings();
  const saved = saveNodeUiDevLocalDefaultSettings(text);
  const fileSave = scheduleNodeGraphWorkingPatchFileAutosave(text, { immediate: Boolean(options.immediateFile) });
  if (options.returnFileSave) {
    return Promise.resolve(fileSave).then((fileSaved) => ({ local: saved, file: Boolean(fileSaved) }));
  }
  return saved;
}

/** Flush working-patch autosave on tab close / refresh (sync localStorage). */
function flushNodeGraphWorkingPatchToUserSettingsOnUnload() {
  try {
    if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings({ immediateFile: false });
    }
  } catch (error) {
    console.warn("[soemdsp] Working-patch unload flush failed", error);
  }
}

if (typeof window !== "undefined" && !window.__nodeGraphWorkingPatchUnloadBound) {
  window.__nodeGraphWorkingPatchUnloadBound = true;
  window.addEventListener("pagehide", flushNodeGraphWorkingPatchToUserSettingsOnUnload);
  window.addEventListener("beforeunload", flushNodeGraphWorkingPatchToUserSettingsOnUnload);
}

function clearNodeGraphWorkingPatchFromUserSettings() {
  if (
    typeof serializeNodeUiDevSettings !== "function" ||
    typeof saveNodeUiDevLocalDefaultSettings !== "function"
  ) {
    return false;
  }
  nodeGraphMvp.workingPatch = null;
  nodeGraphMvp.currentSavedPatchFilename = "";
  nodeGraphMvp.patchDirtyState = "untouched";
  return saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
}

function initNodeGraphPatchFromDefault() {
  clearNodeGraphWorkingPatchFromUserSettings();
  commitNodeGraphPatch(cloneNodeGraphPatch(nodeGraphMvp.defaultPatch || nodeGraphDefaultPatch), {
    autosaveWorkingPatch: false,
    record: true,
    patchDirtyState: "untouched",
    status: "init patch loaded",
  });
  setNodeGraphCurrentSavedPatch("");
}

function confirmAndInitNodeGraphPatchFromDefault(event) {
  const button = event?.currentTarget;
  if (!confirmNodeGraphDefaultButtonClick(
    button,
    () => setNodeGraphScriptStatus("click Confirm Init to initialize the patch", true),
    { confirmText: "Confirm Init" },
  )) {
    return;
  }
  flashNodeGraphDefaultButtonSaved(button);
  initNodeGraphPatchFromDefault();
}

function syncNodeGraphCurrentSavedPatchHeader() {
  const button = document.getElementById("nodeCurrentSavedPatchButton");
  if (!button) {
    return;
  }
  const filename = nodeGraphMvp.currentSavedPatchFilename || "";
  const dirtyState = ["saved", "edited", "untouched"].includes(nodeGraphMvp.patchDirtyState)
    ? nodeGraphMvp.patchDirtyState
    : "untouched";
  const label = dirtyState === "saved" ? "Saved" : dirtyState === "edited" ? "Edited" : "";
  button.replaceChildren();
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Patch";
  const name = document.createElement("strong");
  name.textContent = label;
  button.append(eyebrow, name);
  button.title = filename
    ? `Current saved patch: ${filename}`
    : dirtyState === "edited"
      ? "Current patch has unsaved file changes, but is autosaved in UI settings."
      : "Init patch";
  button.classList.toggle("unsaved", dirtyState !== "saved");
  button.dataset.patchDirtyState = dirtyState;
}

function syncNodeGraphSavedPatchRowSelection() {
  const activeFilename = nodeGraphMvp.currentSavedPatchFilename || "";
  const selectedFilename = nodeGraphMvp.selectedSavedPatchFilename || activeFilename;
  const selectedProgram = normalizeNodeGraphSavedPatchProgramIndex(nodeGraphMvp.selectedSavedPatchProgram);
  for (const row of document.querySelectorAll("[data-patch-filename]")) {
    const active = Boolean(activeFilename && row.dataset.patchFilename === activeFilename);
    const program = normalizeNodeGraphSavedPatchProgramIndex(row.dataset.patchProgram);
    const selected = selectedFilename
      ? row.dataset.patchFilename === selectedFilename
      : program === selectedProgram;
    row.classList.toggle("active", active);
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-current", active ? "true" : "false");
    row.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function normalizeNodeGraphSavedPatchTag(tag) {
  return String(tag || "")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nodeGraphSavedPatchTagSet(patch = {}) {
  const text = [
    patch.tags,
    patch.name,
    patch.filename,
  ].filter(Boolean).join(" ");
  return new Set(String(text)
    .split(/[,\s#]+/g)
    .map(normalizeNodeGraphSavedPatchTag)
    .filter(Boolean));
}

function nodeGraphSavedPatchTagLabelList(patch = null) {
  const activeFilters = Array.isArray(nodeGraphMvp.savedPatchTagFilters)
    ? nodeGraphMvp.savedPatchTagFilters
    : [];
  const patchTags = patch
    ? String(patch.tags || "")
      .split(/[,\s#]+/g)
      .map(normalizeNodeGraphSavedPatchTag)
      .filter(Boolean)
    : [];
  const availableTags = !patch && Array.isArray(nodeGraphMvp.savedPatchEntries)
    ? nodeGraphMvp.savedPatchEntries
      .flatMap((entry) => String(entry?.tags || "").split(/[,\s#]+/g))
      .map(normalizeNodeGraphSavedPatchTag)
      .filter(Boolean)
    : [];
  const tags = [...new Set(patchTags.length ? patchTags : activeFilters.length ? activeFilters : availableTags)]
    .slice(0, 12);
  if (tags.length) {
    return tags.map((tag) => `#${tag}`).join(" ");
  }
  return patch ? "#untagged" : "no tags yet";
}

function nodeGraphSavedPatchBankLabel(patch = null) {
  const bankName = nodeGraphOneLineText(patch?.bankName || "");
  if (bankName) {
    return bankName;
  }
  const patchInfo = normalizeNodeGraphPatchInfo(nodeGraphMvp.patch?.info);
  return nodeGraphOneLineText(patchInfo.bankName || "") || "Default Bank";
}

function nodeGraphSavedPatchBankIndex(patch = null) {
  return normalizeNodeGraphSavedPatchBankIndex(patch?.bank ?? 0);
}

function nodeGraphSavedPatchBankGroups(patches = []) {
  const groups = new Map();
  for (const patch of patches) {
    if (!patch?.filename) {
      continue;
    }
    const bank = nodeGraphSavedPatchBankIndex(patch);
    const current = groups.get(bank) || {
      bank,
      label: nodeGraphSavedPatchBankLabel(patch),
      count: 0,
      patches: [],
    };
    current.count += 1;
    current.patches.push(patch);
    if (!current.label || current.label === "Default Bank") {
      current.label = nodeGraphSavedPatchBankLabel(patch);
    }
    groups.set(bank, current);
  }
  return [...groups.values()].sort((a, b) => a.bank - b.bank);
}

function setNodeGraphSavedPatchExplorerView(view = "banks") {
  nodeGraphMvp.savedPatchExplorerView = view === "patches" ? "patches" : "banks";
  if (typeof saveNodeGraphWorkspaceWindowStatesToUserSettings === "function") {
    saveNodeGraphWorkspaceWindowStatesToUserSettings({ status: false });
  }
}

function openNodeGraphSavedPatchBank(bank) {
  nodeGraphMvp.savedPatchBankIndex = normalizeNodeGraphSavedPatchBankIndex(bank);
  setNodeGraphSavedPatchExplorerView("patches");
  renderNodeGraphDemoPatchRows(nodeGraphMvp.savedPatchEntries);
}

function showNodeGraphSavedPatchBanks() {
  setNodeGraphSavedPatchExplorerView("banks");
  renderNodeGraphDemoPatchRows(nodeGraphMvp.savedPatchEntries);
}

function nodeGraphSavedPatchMatchesTagFilters(patch = {}) {
  const filters = Array.isArray(nodeGraphMvp.savedPatchTagFilters)
    ? nodeGraphMvp.savedPatchTagFilters
    : [];
  if (!filters.length) {
    return true;
  }
  const patchTags = nodeGraphSavedPatchTagSet(patch);
  return filters.every((tag) => patchTags.has(tag));
}

function filteredNodeGraphSavedPatchEntries(patches = nodeGraphMvp.savedPatchEntries) {
  const safePatches = Array.isArray(patches) ? patches : [];
  return safePatches.filter(nodeGraphSavedPatchMatchesTagFilters);
}

function nodeGraphSavedPatchEntryByFilename(filename) {
  const safeFilename = String(filename || "");
  return (Array.isArray(nodeGraphMvp.savedPatchEntries) ? nodeGraphMvp.savedPatchEntries : [])
    .find((patch) => patch?.filename === safeFilename) || {
    filename: safeFilename,
    name: nodeGraphSavedPatchDisplayName(safeFilename) || safeFilename,
    tags: "",
  };
}

function syncNodeGraphSavedPatchTagChips() {
  const chips = document.getElementById("nodeSavedPatchesTagChips");
  const input = document.getElementById("nodeSavedPatchesTagInput");
  if (!chips) {
    return;
  }
  chips.replaceChildren();
  const filters = Array.isArray(nodeGraphMvp.savedPatchTagFilters)
    ? nodeGraphMvp.savedPatchTagFilters
    : [];
  for (const tag of filters) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "node-saved-patches-tag-chip";
    chip.dataset.patchTagFilter = tag;
    chip.textContent = `#${tag} x`;
    chip.setAttribute("aria-label", `Remove tag filter ${tag}`);
    chip.addEventListener("click", () => removeNodeGraphSavedPatchTagFilter(tag));
    chips.append(chip);
  }
  if (input && filters.length) {
    input.placeholder = "search another tag";
  } else if (input) {
    input.placeholder = "search tag";
  }
}

function addNodeGraphSavedPatchTagFilter(tag) {
  const normalized = normalizeNodeGraphSavedPatchTag(tag);
  if (!normalized) {
    return;
  }
  const filters = Array.isArray(nodeGraphMvp.savedPatchTagFilters)
    ? nodeGraphMvp.savedPatchTagFilters
    : [];
  if (!filters.includes(normalized)) {
    nodeGraphMvp.savedPatchTagFilters = [...filters, normalized];
  }
  syncNodeGraphSavedPatchTagChips();
  renderNodeGraphDemoPatchRows(filteredNodeGraphSavedPatchEntries());
}

function removeNodeGraphSavedPatchTagFilter(tag) {
  const normalized = normalizeNodeGraphSavedPatchTag(tag);
  nodeGraphMvp.savedPatchTagFilters = (nodeGraphMvp.savedPatchTagFilters || [])
    .filter((candidate) => candidate !== normalized);
  syncNodeGraphSavedPatchTagChips();
  renderNodeGraphDemoPatchRows(filteredNodeGraphSavedPatchEntries());
}

function clearNodeGraphSavedPatchTagFilters() {
  nodeGraphMvp.savedPatchTagFilters = [];
  const input = document.getElementById("nodeSavedPatchesTagInput");
  if (input) {
    input.value = "";
  }
  syncNodeGraphSavedPatchTagChips();
}

function handleNodeGraphSavedPatchTagInput(event) {
  const input = event.currentTarget;
  const value = String(input?.value || "");
  if (event.type === "input" && !/[,#\s]$/.test(value)) {
    return;
  }
  if (event.type === "keydown" && event.key !== "Enter") {
    return;
  }
  if (event.type === "keydown") {
    event.preventDefault();
  }
  const tags = value
    .split(/[,\s#]+/g)
    .map(normalizeNodeGraphSavedPatchTag)
    .filter(Boolean);
  for (const tag of tags) {
    addNodeGraphSavedPatchTagFilter(tag);
  }
  if (input) {
    input.value = "";
  }
}

function normalizeNodeGraphSavedPatchBankIndex(value) {
  const bank = Math.round(Number(value));
  return Number.isFinite(bank) ? Math.max(0, Math.min(127, bank)) : 0;
}

function normalizeNodeGraphSavedPatchProgramIndex(value) {
  const program = Math.round(Number(value));
  return Number.isFinite(program) ? Math.max(0, Math.min(nodeGraphSavedPatchBankMaxProgram, program)) : 0;
}

function nodeGraphSelectedSavedPatchEntry() {
  return nodeGraphSavedPatchEntryAtProgram(nodeGraphMvp.selectedSavedPatchProgram);
}

function syncNodeGraphSelectedSavedPatchEditor() {
  const bankNameInput = document.getElementById("nodeSavedPatchesBankNameInput");
  const headerBankNameInput = document.getElementById("nodePatchBankNameHeader");
  const nameInput = document.getElementById("nodeSavedPatchesPatchNameInput");
  const headerNameInput = document.getElementById("nodePatchNameHeader");
  const tagsInput = document.getElementById("nodeSavedPatchesPatchTagsInput");
  const headerTagsInput = document.getElementById("nodePatchTagsHeader");
  const entry = nodeGraphSelectedSavedPatchEntry();
  const patchInfo = normalizeNodeGraphPatchInfo(nodeGraphMvp.patch.info);
  const bankName = nodeGraphMvp.savedPatchBankName || entry?.bankName || patchInfo.bankName || "";
  const name = entry?.name || patchInfo.name || "";
  const tags = entry?.tags || patchInfo.tags || "";
  nodeGraphMvp.savedPatchBankName = bankName;
  if (bankNameInput && document.activeElement !== bankNameInput) {
    bankNameInput.value = bankName;
  }
  if (headerBankNameInput && document.activeElement !== headerBankNameInput) {
    headerBankNameInput.value = bankName;
  }
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = name;
  }
  if (headerNameInput && document.activeElement !== headerNameInput) {
    headerNameInput.value = name;
  }
  if (tagsInput && document.activeElement !== tagsInput) {
    tagsInput.value = tags;
  }
  if (headerTagsInput && document.activeElement !== headerTagsInput) {
    headerTagsInput.value = tags;
  }
  if (typeof syncNodeGraphPatchLibraryPathFields === "function") {
    syncNodeGraphPatchLibraryPathFields();
  }
}

function nodeGraphPatchLibraryPathDefaults() {
  return {
    factory: String(nodeGraphMvp.savedPatchFactoryPath || "").trim(),
    user: String(nodeGraphMvp.savedPatchUserPath || "").trim(),
  };
}

function syncNodeGraphPatchLibraryPathFields() {
  const paths = nodeGraphPatchLibraryPathDefaults();
  for (const kind of ["factory", "user"]) {
    const input = document.querySelector(`[data-patch-library-path="${kind}"]`);
    if (input && document.activeElement !== input) {
      input.value = paths[kind] || "";
    }
  }
}

function handleNodeGraphPatchLibraryPathInput(event) {
  const kind = String(event.currentTarget?.dataset?.patchLibraryPath || "").trim();
  const value = String(event.currentTarget?.value || "").trim();
  if (kind === "factory") {
    nodeGraphMvp.savedPatchFactoryPath = value;
  } else if (kind === "user") {
    nodeGraphMvp.savedPatchUserPath = value;
  } else {
    return;
  }
  if (typeof saveNodeGraphWorkspaceWindowStatesToUserSettings === "function") {
    saveNodeGraphWorkspaceWindowStatesToUserSettings({ status: false });
  } else if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings({ immediateFile: false });
  }
}

function handleNodeGraphPatchLibraryPathButtonClick(event) {
  const kind = event.currentTarget?.id === "nodePatchFactoryPathButton" ? "factory" : "user";
  const input = document.querySelector(`[data-patch-library-path="${kind}"]`);
  if (!input) {
    return;
  }
  // Exposed for setup: focus + select so the user can type/paste a path.
  // Folder pickers can land here later without changing the chrome.
  input.focus();
  try {
    input.select();
  } catch (_) { /* ignore */ }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      kind === "factory"
        ? "Type or paste the factory patches folder path."
        : "Type or paste the user patches folder path.",
    );
  }
}

function syncNodeGraphSavedPatchBankControls(patches = null) {
  const input = document.getElementById("nodeSavedPatchesBankInput");
  const status = document.getElementById("nodeSavedPatchesBankStatus");
  const bank = normalizeNodeGraphSavedPatchBankIndex(nodeGraphMvp.savedPatchBankIndex);
  nodeGraphMvp.savedPatchBankIndex = bank;
  if (input) {
    input.value = String(bank);
  }
  if (status && Array.isArray(patches)) {
    const savedCount = Math.min(nodeGraphSavedPatchBankSlotCount, patches.filter((patch) => patch?.filename).length);
    status.textContent = `${savedCount}/${nodeGraphSavedPatchBankSlotCount} patches`;
    status.title = `Bank ${bank}: programs 0-${nodeGraphSavedPatchBankMaxProgram}`;
  }
  syncNodeGraphSelectedSavedPatchEditor();
}

function handleNodeGraphSavedPatchBankInput(event) {
  nodeGraphMvp.savedPatchBankIndex = normalizeNodeGraphSavedPatchBankIndex(event.currentTarget?.value);
  syncNodeGraphSavedPatchBankControls();
  renderNodeGraphDemoPatchList();
  if (typeof saveNodeGraphWorkspaceWindowStatesToUserSettings === "function") {
    saveNodeGraphWorkspaceWindowStatesToUserSettings({ status: false });
  }
}

function handleNodeGraphSavedPatchBankNameInput(event) {
  nodeGraphMvp.savedPatchBankName = nodeGraphOneLineText(event.currentTarget?.value);
  if (typeof saveNodeGraphWorkspaceWindowStatesToUserSettings === "function") {
    saveNodeGraphWorkspaceWindowStatesToUserSettings({ status: false });
  }
}

function handleNodeGraphSavedPatchInfoInput(event) {
  const field = event.currentTarget?.dataset?.patchInfoField;
  if (!["name", "tags"].includes(field)) {
    return;
  }
  const value = nodeGraphOneLineText(event.currentTarget?.value);
  const header = document.getElementById(field === "name" ? "nodePatchNameHeader" : "nodePatchTagsHeader");
  if (header && document.activeElement !== header) {
    header.value = value;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.info = normalizeNodeGraphPatchInfo({
    ...patch.info,
    bank: normalizeNodeGraphSavedPatchBankIndex(nodeGraphMvp.savedPatchBankIndex),
    bankName: nodeGraphMvp.savedPatchBankName,
    program: normalizeNodeGraphSavedPatchProgramIndex(nodeGraphMvp.selectedSavedPatchProgram),
    [field]: value,
  });
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: false,
    status: "patch metadata synced",
  });
  syncNodeGraphCurrentSavedPatchHeader();
}

function nodeGraphPatchPresetDefaultName() {
  const info = normalizeNodeGraphPatchInfo(nodeGraphMvp.patch.info);
  return info.name && info.name !== "Untitled Patch" ? info.name : "Preset";
}

function normalizeNodeGraphPatchPresetName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function loadNodeGraphPatchPresetEntries() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(nodeGraphPatchPresetStorageKey) || "[]");
    return Array.isArray(parsed)
      ? parsed
        .map((entry) => ({
          name: normalizeNodeGraphPatchPresetName(entry?.name),
          text: typeof entry?.text === "string" ? entry.text : "",
          updatedAt: Number(entry?.updatedAt) || 0,
        }))
        .filter((entry) => entry.name && entry.text)
        .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  } catch {
    return [];
  }
}

function saveNodeGraphPatchPresetEntries(entries) {
  window.localStorage.setItem(nodeGraphPatchPresetStorageKey, JSON.stringify(entries));
}

function selectedNodeGraphPatchPresetName() {
  const inputName = normalizeNodeGraphPatchPresetName(document.getElementById("nodePatchPresetName")?.value);
  const selectName = normalizeNodeGraphPatchPresetName(document.getElementById("nodePatchPresetSelect")?.value);
  return inputName || selectName;
}

function renderNodeGraphPatchPresetControls(selectedName = "") {
  const nameInput = document.getElementById("nodePatchPresetName");
  const select = document.getElementById("nodePatchPresetSelect");
  const loadButton = document.getElementById("nodePatchPresetLoadButton");
  const deleteButton = document.getElementById("nodePatchPresetDeleteButton");
  if (!nameInput || !select || !loadButton || !deleteButton) {
    return;
  }
  const entries = loadNodeGraphPatchPresetEntries();
  const normalizedSelected = normalizeNodeGraphPatchPresetName(selectedName || select.value);
  select.replaceChildren();
  if (!entries.length) {
    select.append(new Option("No saved presets", ""));
  } else {
    for (const entry of entries) {
      select.append(new Option(entry.name, entry.name));
    }
  }
  const selectedExists = entries.some((entry) => entry.name === normalizedSelected);
  select.value = selectedExists ? normalizedSelected : entries[0]?.name || "";
  if (!nameInput.value) {
    nameInput.value = select.value || nodeGraphPatchPresetDefaultName();
  }
  loadButton.disabled = !select.value;
  deleteButton.disabled = !select.value;
}

function saveCurrentNodeGraphPatchPreset() {
  if (!nodeGraphScriptReadyForGraphAction("save preset")) {
    return;
  }
  const name = selectedNodeGraphPatchPresetName();
  if (!name) {
    setNodeGraphScriptStatus("preset needs a name", false);
    return;
  }
  const text = serializeNodeGraphPatch();
  const entries = loadNodeGraphPatchPresetEntries().filter((entry) => entry.name !== name);
  entries.push({ name, text, updatedAt: Date.now() });
  try {
    saveNodeGraphPatchPresetEntries(entries.sort((a, b) => a.name.localeCompare(b.name)));
    const nameInput = document.getElementById("nodePatchPresetName");
    if (nameInput) {
      nameInput.value = name;
    }
    renderNodeGraphPatchPresetControls(name);
    setNodeGraphScriptStatus(`preset saved: ${name}`, true);
  } catch (error) {
    setNodeGraphScriptStatus(`preset save failed: ${error?.message || error}`, false);
  }
}

function loadSelectedNodeGraphPatchPreset() {
  const name = normalizeNodeGraphPatchPresetName(document.getElementById("nodePatchPresetSelect")?.value);
  const entry = loadNodeGraphPatchPresetEntries().find((candidate) => candidate.name === name);
  if (!entry) {
    setNodeGraphScriptStatus("choose a saved preset", false);
    renderNodeGraphPatchPresetControls();
    return;
  }
  try {
    commitNodeGraphPatch(loadNodeGraphPatchFromScript(entry.text), { status: `preset loaded: ${entry.name}` });
    const nameInput = document.getElementById("nodePatchPresetName");
    if (nameInput) {
      nameInput.value = entry.name;
    }
    renderNodeGraphPatchPresetControls(entry.name);
  } catch (error) {
    const message = String(error?.message || error || "failed to load patch");
    if (typeof nodeGraphShowPatchLoadFault === "function") {
      nodeGraphShowPatchLoadFault({
        message,
        script: error?.patchScript || entry.text || "",
        title: "Failed to load preset",
      });
    } else {
      setNodeGraphScriptStatus(`preset load failed: ${message}`, false);
    }
  }
}

function deleteSelectedNodeGraphPatchPreset() {
  const name = normalizeNodeGraphPatchPresetName(document.getElementById("nodePatchPresetSelect")?.value);
  if (!name) {
    setNodeGraphScriptStatus("choose a saved preset", false);
    return;
  }
  try {
    const entries = loadNodeGraphPatchPresetEntries().filter((entry) => entry.name !== name);
    saveNodeGraphPatchPresetEntries(entries);
    const nameInput = document.getElementById("nodePatchPresetName");
    if (nameInput) {
      nameInput.value = entries[0]?.name || nodeGraphPatchPresetDefaultName();
    }
    renderNodeGraphPatchPresetControls(entries[0]?.name || "");
    setNodeGraphScriptStatus(`preset deleted: ${name}`, true);
  } catch (error) {
    setNodeGraphScriptStatus(`preset delete failed: ${error?.message || error}`, false);
  }
}

function handleNodeGraphPatchPresetSelectChange(event) {
  const name = normalizeNodeGraphPatchPresetName(event.currentTarget.value);
  const nameInput = document.getElementById("nodePatchPresetName");
  if (name && nameInput) {
    nameInput.value = name;
  }
}

async function saveNodeGraphScript() {
  const script = document.getElementById("nodePatchScript");
  if (script && document.activeElement !== script) {
    syncNodeGraphScriptView("script synced before save", true);
  }
  if (!nodeGraphScriptReadyForGraphAction("save")) {
    return false;
  }
  try {
    const patchToSave = nodeGraphPatchWithLiveHeaderInfo();
    const patchText = serializeNodeGraphPatch(patchToSave);
    const info = normalizeNodeGraphPatchInfo(patchToSave.info);
    const response = await fetch(
      `/api/patches/save?bank=${encodeURIComponent(info.bank)}&program=${encodeURIComponent(info.program)}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: patchText,
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    const filename = result.filename || nodeGraphPatchFileName();
    commitNodeGraphPatch(patchToSave, {
      markPending: false,
      patchDirtyState: "saved",
      record: false,
      status: `patch saved: ${filename}`,
    });
    setNodeGraphCurrentSavedPatch(filename);
    clearNodeGraphSavedPatchTagFilters();
    await renderNodeGraphDemoPatchList();
    setNodeGraphCurrentSavedPatch(filename);
    const listed = (nodeGraphMvp.savedPatchEntries || []).some((entry) => entry?.filename === filename);
    setNodeGraphScriptStatus(
      listed ? `patch saved: ${filename}` : `patch saved, but explorer did not list it: ${filename}`,
      listed,
    );
    return listed;
  } catch (error) {
    setNodeGraphScriptStatus(`patch save failed: ${error?.message || error}`, false);
    return false;
  }
}

async function confirmAndSaveNodeGraphScript(event) {
  const button = event?.currentTarget;
  if (!confirmNodeGraphDefaultButtonClick(
    button,
    () => setNodeGraphScriptStatus("click Confirm Save to save this patch", true),
    { confirmText: "Confirm Save" },
  )) {
    return;
  }
  const saved = await saveNodeGraphScript();
  if (saved) {
    flashNodeGraphDefaultButtonSaved(button);
  }
}

function loadNodeGraphScript() {
  if (!nodeGraphScriptReadyForGraphAction("load")) {
    return;
  }
  document.getElementById("nodePatchScriptFileInput")?.click();
}

async function loadSelectedNodeGraphSavedPatch() {
  const filename = nodeGraphMvp.selectedSavedPatchFilename || nodeGraphSelectedSavedPatchEntry()?.filename || "";
  if (!filename) {
    setNodeGraphScriptStatus("selected patch slot is empty", false);
    return;
  }
  await loadNodeGraphDemoPatch(filename);
}

function handleNodeGraphScriptFileLoad(event) {
  const [file] = event.currentTarget.files || [];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const scriptText = String(reader.result || "");
    try {
      commitNodeGraphPatch(loadNodeGraphPatchFromScript(scriptText), {
        patchDirtyState: "saved",
        status: "script loaded",
      });
      setNodeGraphCurrentSavedPatch("");
    } catch (error) {
      const message = String(error?.message || error || "failed to load patch");
      if (typeof nodeGraphShowPatchLoadFault === "function") {
        nodeGraphShowPatchLoadFault({
          message,
          script: error?.patchScript || scriptText,
          title: "Failed to load patch file",
        });
      } else {
        setNodeGraphScriptStatus(message, false);
      }
    } finally {
      event.currentTarget.value = "";
    }
  });
  reader.addEventListener("error", () => {
    setNodeGraphScriptStatus("script file read failed", false);
    event.currentTarget.value = "";
  });
  reader.readAsText(file);
}

function handleNodePatchScriptInput(event) {
  scheduleNodeGraphScriptCommit(event.currentTarget.value);
}

function saveNodeGraphScriptEditor() {
  const script = document.getElementById("nodePatchScript");
  clearNodeGraphScriptCommitTimer();
  if (commitNodeGraphScript(script?.value || serializeNodeGraphPatch())) {
    setNodeGraphScriptStatus("script saved", true);
  }
}

async function copyNodeGraphScriptToClipboard() {
  const script = document.getElementById("nodePatchScript");
  const text = script?.value || serializeNodeGraphPatch();
  try {
    await navigator.clipboard.writeText(text);
    setNodeGraphScriptStatus("script copied", true);
  } catch {
    script?.focus();
    script?.select();
    setNodeGraphScriptStatus("copy blocked: select text manually", false);
  }
}

async function copyNodeGraphShareLinkToClipboard(event) {
  const button = event?.currentTarget;
  if (!nodeGraphScriptReadyForGraphAction("share")) {
    return;
  }
  try {
    const link = nodeGraphShareLinkForPatch(nodeGraphPatchWithLiveHeaderInfo());
    await navigator.clipboard.writeText(link);
    setNodeGraphScriptStatus("share link copied", true);
    flashNodeGraphDefaultButtonSaved(button);
  } catch (error) {
    setNodeGraphScriptStatus(`share link failed: ${error?.message || error}`, false);
  }
}

function nodeGraphDownloadTextFile(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function pasteNodeGraphScriptFromClipboard() {
  const script = document.getElementById("nodePatchScript");
  try {
    const text = await navigator.clipboard.readText();
    if (script) {
      script.value = text;
    }
    commitNodeGraphScript(text);
  } catch {
    setNodeGraphScriptStatus("paste blocked: use keyboard paste", false);
  }
}

async function setNodeGraphPatchAsDefaultFromButton(event) {
  if (!confirmNodeGraphDefaultButtonClick(event.currentTarget, () => {
    setNodeGraphScriptStatus("click Confirm Init to save this patch as init", true);
  }, { confirmText: "Confirm Init" })) {
    return;
  }
  flashNodeGraphDefaultButtonSaved(event.currentTarget);
  await updateDefaultNodeGraphPreset();
}

async function saveNodeGraphSavedPatchBank() {
  try {
    if (!Array.isArray(nodeGraphMvp.savedPatchEntries) || !nodeGraphMvp.savedPatchEntries.length) {
      await renderNodeGraphDemoPatchList();
    }
    const entries = Array.isArray(nodeGraphMvp.savedPatchEntries) ? nodeGraphMvp.savedPatchEntries : [];
    const slots = [];
    for (let program = 0; program < nodeGraphSavedPatchBankSlotCount; program += 1) {
      const entry = nodeGraphSavedPatchEntryAtProgram(program);
      if (!entry?.filename) {
        slots.push(null);
        continue;
      }
      const response = await fetch(`/api/patches/file?name=${encodeURIComponent(entry.filename)}`);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`failed to read ${entry.filename}: HTTP ${response.status}`);
      }
      slots.push({
        filename: entry.filename,
        name: entry.name || "",
        tags: entry.tags || "",
        modifiedUtc: entry.modifiedUtc || "",
        text,
      });
    }
    const payload = {
      kind: "soemdsp-sandbox.patch-bank",
      version: 1,
      bank: normalizeNodeGraphSavedPatchBankIndex(nodeGraphMvp.savedPatchBankIndex),
      bankName: nodeGraphMvp.savedPatchBankName || "",
      slotCount: nodeGraphSavedPatchBankSlotCount,
      exportedUtc: new Date().toISOString(),
      slots,
    };
    const bank = String(payload.bank).padStart(3, "0");
    nodeGraphDownloadTextFile(`soemdsp-patch-bank-${bank}.json`, JSON.stringify(payload, null, 2));
    setNodeGraphScriptStatus(`patch bank ${bank} saved`, true);
  } catch (error) {
    setNodeGraphScriptStatus(`bank save failed: ${error?.message || error}`, false);
  }
}

function loadNodeGraphSavedPatchBank() {
  document.getElementById("nodeSavedPatchesBankFileInput")?.click();
}

async function handleNodeGraphSavedPatchBankFileLoad(event) {
  const [file] = event.currentTarget.files || [];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const slots = Array.isArray(payload?.slots) ? payload.slots : [];
    const bank = normalizeNodeGraphSavedPatchBankIndex(payload?.bank ?? nodeGraphMvp.savedPatchBankIndex);
    nodeGraphMvp.savedPatchBankIndex = bank;
    nodeGraphMvp.savedPatchBankName = nodeGraphOneLineText(payload?.bankName || nodeGraphMvp.savedPatchBankName);
    let imported = 0;
    for (const [program, slot] of slots.slice(0, nodeGraphSavedPatchBankSlotCount).entries()) {
      const patchText = typeof slot?.text === "string" ? slot.text : "";
      if (!patchText.trim()) {
        continue;
      }
      const response = await fetch(`/api/patches/save?bank=${bank}&program=${program}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: patchText,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      imported += 1;
    }
    setNodeGraphScriptStatus(`patch bank loaded: ${imported} patches`, true);
    await renderNodeGraphDemoPatchList();
  } catch (error) {
    setNodeGraphScriptStatus(`bank load failed: ${error?.message || error}`, false);
  } finally {
    event.currentTarget.value = "";
  }
}

function renderNodeGraphDemoPatchRows(patches = [], listId = "nodeSavedPatchWindowList") {
  const list = document.getElementById(listId);
  if (!list) {
    return;
  }
  list.replaceChildren();
  const safePatches = Array.isArray(patches)
    ? patches.filter((patch) => patch?.filename)
    : [];
  syncNodeGraphSavedPatchGridColumns(safePatches.length);
  syncNodeGraphSavedPatchBankControls(safePatches);
  if (!safePatches.length) {
    syncNodeGraphSavedPatchRowSelection();
    syncNodeGraphSelectedSavedPatchEditor();
    return;
  }
  if (nodeGraphMvp.savedPatchExplorerView !== "patches") {
    for (const group of nodeGraphSavedPatchBankGroups(safePatches)) {
      const row = document.createElement("button");
      row.className = "node-saved-patch-bank-row";
      row.type = "button";
      row.dataset.patchBank = String(group.bank);
      row.addEventListener("click", () => openNodeGraphSavedPatchBank(group.bank));
      const name = document.createElement("strong");
      name.textContent = group.label || `Bank ${group.bank}`;
      const count = document.createElement("span");
      count.textContent = String(group.count);
      row.append(name, count);
      list.append(row);
    }
    syncNodeGraphSavedPatchRowSelection();
    syncNodeGraphSelectedSavedPatchEditor();
    return;
  }
  const bank = normalizeNodeGraphSavedPatchBankIndex(nodeGraphMvp.savedPatchBankIndex);
  const back = document.createElement("button");
  back.className = "node-saved-patch-bank-back";
  back.type = "button";
  back.textContent = "Back";
  back.addEventListener("click", showNodeGraphSavedPatchBanks);
  list.append(back);
  const bankPatches = safePatches.filter((patch) => nodeGraphSavedPatchBankIndex(patch) === bank);
  bankPatches.forEach((patch, index) => {
    const program = normalizeNodeGraphSavedPatchProgramIndex(patch.program ?? index);
    const row = document.createElement("button");
    row.className = "node-demo-patch-row";
    row.type = "button";
    row.dataset.patchFilename = patch.filename || "";
    row.dataset.patchProgram = String(program);
    row.classList.toggle("active", patch.filename === nodeGraphMvp.currentSavedPatchFilename);
    row.classList.toggle("selected", patch.filename === nodeGraphMvp.selectedSavedPatchFilename);
    row.setAttribute("aria-current", patch.filename === nodeGraphMvp.currentSavedPatchFilename ? "true" : "false");
    row.setAttribute("aria-selected", patch.filename === nodeGraphMvp.selectedSavedPatchFilename ? "true" : "false");
    row.addEventListener("click", () => selectNodeGraphSavedPatch(patch.filename, program));
    row.addEventListener("dblclick", () => {
      selectNodeGraphSavedPatch(patch.filename, program);
      loadNodeGraphDemoPatch(patch.filename);
    });
    const bank = document.createElement("span");
    bank.className = "node-demo-patch-bank";
    bank.textContent = nodeGraphSavedPatchBankLabel(patch);
    const name = document.createElement("strong");
    name.textContent = patch.name || nodeGraphSavedPatchDisplayName(patch.filename) || "Patch";
    row.append(bank, name);
    list.append(row);
  });
  syncNodeGraphSavedPatchRowSelection();
  syncNodeGraphSelectedSavedPatchEditor();
}

function normalizeNodeGraphSavedPatchGridColumns(value) {
  const columns = Math.round(Number(value));
  return Number.isFinite(columns) ? Math.max(1, Math.min(16, columns)) : 3;
}

function syncNodeGraphSavedPatchGridColumns() {
  const requestedColumns = normalizeNodeGraphSavedPatchGridColumns(nodeGraphMvp.savedPatchGridColumns);
  nodeGraphMvp.savedPatchGridColumns = requestedColumns;
}

async function loadNodeGraphDemoPatchEntries() {
  const response = await fetch("/api/patches");
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.patches || [];
}

async function renderNodeGraphDemoPatchList(listId = "nodeSavedPatchWindowList") {
  const list = document.getElementById(listId);
  if (!list) {
    return [];
  }
  list.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "node-demo-patch-row node-demo-patch-status";
  loading.textContent = "Loading patch explorer...";
  list.append(loading);
  syncNodeGraphSavedPatchGridColumns();
  syncNodeGraphSavedPatchTagChips();
  try {
    nodeGraphMvp.savedPatchEntries = await loadNodeGraphDemoPatchEntries();
    renderNodeGraphDemoPatchRows(nodeGraphMvp.savedPatchEntries, listId);
    return nodeGraphMvp.savedPatchEntries;
  } catch (error) {
    list.replaceChildren();
    const row = document.createElement("div");
    row.className = "node-demo-patch-row node-demo-patch-status error";
    row.textContent = `Patch list unavailable: ${error?.message || error}`;
    list.append(row);
    syncNodeGraphSavedPatchGridColumns();
    return [];
  }
}

async function loadNodeGraphDemoPatch(filename) {
  const safeFilename = String(filename || "");
  if (!safeFilename) {
    return;
  }
  if (!nodeGraphScriptReadyForGraphAction("load saved patch")) {
    return;
  }
  let scriptText = "";
  try {
    const response = await fetch(`/api/patches/file?name=${encodeURIComponent(safeFilename)}`);
    scriptText = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    commitNodeGraphPatch(loadNodeGraphPatchFromScript(scriptText), {
      patchDirtyState: "saved",
      status: `patch loaded: ${safeFilename}`,
    });
    setNodeGraphCurrentSavedPatch(safeFilename);
  } catch (error) {
    const message = String(error?.message || error || "failed to load patch");
    if (typeof nodeGraphShowPatchLoadFault === "function") {
      nodeGraphShowPatchLoadFault({
        message,
        script: error?.patchScript || scriptText,
        title: `Failed to load ${safeFilename}`,
      });
    } else {
      setNodeGraphScriptStatus(`patch load failed: ${message}`, false);
    }
  }
}

function nodeGraphSavedPatchProgramIndex(filename) {
  const entries = Array.isArray(nodeGraphMvp.savedPatchEntries) ? nodeGraphMvp.savedPatchEntries : [];
  const matchIndex = entries.findIndex((entry) => entry?.filename === filename);
  const match = matchIndex >= 0 ? entries[matchIndex] : null;
  const program = Number(match?.program);
  if (Number.isFinite(program)) {
    return Math.max(0, Math.min(nodeGraphSavedPatchBankMaxProgram, Math.round(program)));
  }
  return matchIndex >= 0 ? Math.max(0, Math.min(nodeGraphSavedPatchBankMaxProgram, matchIndex)) : -1;
}

function nodeGraphSavedPatchEntryAtProgram(program) {
  const entries = Array.isArray(nodeGraphMvp.savedPatchEntries) ? nodeGraphMvp.savedPatchEntries : [];
  return entries.find((entry) => Math.round(Number(entry?.program)) === program) || entries[program] || null;
}

async function loadAdjacentNodeGraphSavedPatch(direction) {
  if (!Array.isArray(nodeGraphMvp.savedPatchEntries) || !nodeGraphMvp.savedPatchEntries.length) {
    await renderNodeGraphDemoPatchList();
  }
  const entries = (Array.isArray(nodeGraphMvp.savedPatchEntries) ? nodeGraphMvp.savedPatchEntries : [])
    .filter((entry) => entry?.filename);
  if (!entries.length) {
    setNodeGraphScriptStatus("no saved patches available", false);
    return;
  }
  const step = direction < 0 ? -1 : 1;
  const currentFilename = nodeGraphMvp.currentSavedPatchFilename || nodeGraphMvp.selectedSavedPatchFilename || "";
  const currentIndex = entries.findIndex((entry) => entry.filename === currentFilename);
  const startIndex = currentIndex >= 0 ? currentIndex : (step > 0 ? -1 : 0);
  const nextIndex = (startIndex + step + entries.length) % entries.length;
  await loadNodeGraphDemoPatch(entries[nextIndex].filename);
}

function positionNodeGraphSavedPatchesWindowNearButton() {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  if (!panel) {
    return;
  }
  const anchor =
    document.getElementById("nodeSceneOpenSavedPatches") ||
    document.getElementById("nodePatchSaveButton");
  const rect = anchor?.getBoundingClientRect?.() || {
    left: nodeGraphMvp.sceneContextPoint?.x ?? window.innerWidth * 0.5,
    bottom: nodeGraphMvp.sceneContextPoint?.y ?? window.innerHeight * 0.25,
  };
  panel.hidden = false;
  const { left, top } = nodeGraphFloatingWindowPosition(panel, rect.left, rect.bottom + 8);
  positionNodeGraphSavedPatchesWindow(left, top);
}

function positionNodeGraphSavedPatchesWindow(x, y) {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  if (!panel) {
    return;
  }
  const { left, top } = nodeGraphFloatingWindowPosition(panel, x, y);
  panel.style.position = "fixed";
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(panel, left, top);
  } else {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "patchExplorer",
      panel,
      { open: !panel.hidden, position: { left, top } },
      { persist: false },
    );
  }
}

function nodeGraphSavedPatchesWindowSizeFromElement(panel = document.getElementById("nodeSavedPatchesWindow")) {
  const rect = panel?.getBoundingClientRect?.();
  return normalizeNodeGraphSavedPatchesWindowSize({
    width: rect?.width,
    height: rect?.height,
  });
}

function saveNodeGraphSavedPatchesWindowSizeToUserSettings() {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "patchExplorer",
      panel,
      { open: !panel?.hidden, size: nodeGraphSavedPatchesWindowSizeFromElement(panel) },
      { status: false },
    );
  }
}

function beginNodeGraphSavedPatchesWindowResize(event) {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  beginNodeGraphFloatingWindowResize(event, panel, "savedPatchesWindowResizing");
}

function dragNodeGraphSavedPatchesWindowResize(event) {
  dragNodeGraphFloatingWindowResize(event, "savedPatchesWindowResizing", applyNodeGraphSavedPatchesWindowSize);
}

function endNodeGraphSavedPatchesWindowResize(event) {
  endNodeGraphFloatingWindowResize(event, "savedPatchesWindowResizing", saveNodeGraphSavedPatchesWindowSizeToUserSettings);
}

function beginNodeGraphSavedPatchesWindowDrag(event) {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  if (!panel || panel.hidden) {
    return;
  }
  const heading = document.getElementById("nodeSavedPatchesWindowHeading");
  const drag = beginNodeGraphFloatingWindowDrag(event, panel, "savedPatchesWindowDragging");
  if (drag) {
    drag.heading = heading;
    heading?.classList.add("dragging");
  }
}

function dragNodeGraphSavedPatchesWindow(event) {
  dragNodeGraphFloatingWindow(
    event,
    "savedPatchesWindowDragging",
    document.getElementById("nodeSavedPatchesWindow"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "patchExplorer",
          document.getElementById("nodeSavedPatchesWindow"),
          { open: true, position: next },
          { persist: false },
        );
      }
    },
  );
}

function endNodeGraphSavedPatchesWindowDrag(event) {
  const drag = nodeGraphMvp.savedPatchesWindowDragging;
  endNodeGraphFloatingWindowDrag(event, "savedPatchesWindowDragging", () => {
    drag?.heading?.classList.remove("dragging");
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "patchExplorer",
        document.getElementById("nodeSavedPatchesWindow"),
        { open: true },
        { status: false },
      );
    }
  });
}

function setNodeGraphSavedPatchesWindowVisible(visible) {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  const button = document.getElementById("nodeSavedPatchesWindowButton");
  if (!panel) {
    return;
  }
  if (visible && !panel.hidden) {
    pulseNodeGraphFloatingWindowAttention(panel);
    return;
  }
  panel.hidden = !visible;
  button?.classList.toggle("active", visible);
  button?.setAttribute("aria-pressed", String(visible));
  if (visible) {
    applyNodeGraphSavedPatchesWindowSize(nodeGraphMvp.workspaceWindowStates?.patchExplorer?.size);
    const pending = nodeGraphMvp._unifiedWindowPendingPosition;
    if (pending && Number.isFinite(Number(pending.left)) && Number.isFinite(Number(pending.top))) {
      if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
        setNodeGraphFloatingWindowViewportPosition(panel, pending.left, pending.top);
      } else {
        panel.style.left = `${Math.round(pending.left)}px`;
        panel.style.top = `${Math.round(pending.top)}px`;
      }
    } else {
      openNodeGraphFloatingWindowAtPosition("patchExplorer", panel, () => {
        positionNodeGraphSavedPatchesWindowNearButton();
      });
    }
    syncNodeGraphSavedPatchGridColumns();
    syncNodeGraphSelectedSavedPatchEditor();
    syncNodeGraphPatchLibraryPathFields();
    renderNodeGraphDemoPatchList();
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("patchExplorer", panel);
    }
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("patchExplorer", panel, { open: visible }, { status: false });
  }
}

function toggleNodeGraphSavedPatchesWindow() {
  const panel = document.getElementById("nodeSavedPatchesWindow");
  setNodeGraphSavedPatchesWindowVisible(Boolean(panel?.hidden));
}

async function updateDefaultNodeGraphPreset() {
  if (!nodeGraphScriptReadyForGraphAction("save init")) {
    return false;
  }
  const text = serializeNodeGraphPatch();
  try {
    const response = await fetch("/api/presets/default", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: text,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    nodeGraphMvp.defaultPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    setNodeGraphScriptStatus("init patch updated", true);
    return true;
  } catch (error) {
    if (saveNodeGraphLocalDefaultPreset(text)) {
      nodeGraphMvp.defaultPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
      setNodeGraphScriptStatus("local init patch updated", true);
      return true;
    }
    setNodeGraphScriptStatus(`init update failed: ${error.message}`, false);
    return false;
  }
}

async function handleUpdateDefaultNodeGraphPresetClick(event) {
  if (!confirmNodeGraphDefaultButtonClick(event.currentTarget, () => {
    setNodeGraphScriptStatus("click Confirm Init to save this patch as init", true);
  }, { confirmText: "Confirm Init" })) {
    return;
  }
  flashNodeGraphDefaultButtonSaved(event.currentTarget);
  await updateDefaultNodeGraphPreset();
}
