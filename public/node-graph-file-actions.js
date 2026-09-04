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
  const field = (key, ...ids) => (
    typeof nodeGraphPatchInfoFieldValue === "function"
      ? nodeGraphPatchInfoFieldValue(key, ...ids)
      : (document.getElementById(ids[0])?.value ?? document.getElementById(ids[1])?.value)
  );
  const rawBank = field("bank", "nodePatchDefaultsBank", "patchBankValue");
  const rawProgram = field("program", "nodePatchDefaultsProgram", "patchProgramValue");
  const bank = normalizeNodeGraphSavedPatchBankIndex(
    rawBank === "" || rawBank == null ? nodeGraphMvp.savedPatchBankIndex : rawBank,
  );
  const program = normalizeNodeGraphSavedPatchProgramIndex(
    rawProgram === "" || rawProgram == null
      ? nodeGraphMvp.selectedSavedPatchProgram
      : rawProgram,
  );
  nextPatch.info = normalizeNodeGraphPatchInfo({
    ...nextPatch.info,
    bank,
    bankName: field("bankName", "nodePatchDefaultsBankName", "patchBankNameValue")
      || nodeGraphMvp.savedPatchBankName
      || nextPatch.info?.bankName,
    description: field("description", "nodePatchDefaultsDescription", "patchDescriptionValue")
      || nextPatch.info?.description,
    name: field("name", "nodePatchDefaultsName", "patchNameValue") || nextPatch.info?.name,
    program,
    tags: field("tags", "nodePatchDefaultsTags", "patchTagsValue") || nextPatch.info?.tags,
    author: field("author", "nodePatchDefaultsAuthor", "patchAuthorValue") || nextPatch.info?.author,
    category: field("category", "nodePatchDefaultsCategory", "patchCategoryValue") || nextPatch.info?.category,
  });
  return nextPatch;
}

const nodeGraphPatchPresetStorageKey = "soemdsp-sandbox.patchPresets.v1";
const nodeGraphSavedPatchBankSlotCount = 128;
const nodeGraphSavedPatchBankMaxProgram = nodeGraphSavedPatchBankSlotCount - 1;
function nodeGraphSavedPatchDisplayName(filename) {
  return String(filename || "")
    .replace(/\.json$/i, "")
    .replace(/^\d{8}-\d{6}-\d{3}-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
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
  syncNodeGraphCurrentSavedPatchHeader();
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
  void text;
  void options;
  // Working-patch restore is the session blob in localStorage, not the
  // shipped useruisettings.json preset.
  return Promise.resolve(false);
}

function saveNodeGraphWorkingPatchToUserSettings(options = {}) {
  // Name is historical: writes the session blob, not useruisettings.json.
  // Prefer live graph; fall back to last known working patch if patch is empty
  // mid-transition (should not happen, but never serialize "no modules" over a
  // non-empty autosave by accident).
  const persist = typeof persistSession === "function"
    ? () => persistSession({ reason: "session" })
    : (typeof persistNodeGraphUserSession === "function" ? persistNodeGraphUserSession : null);
  if (!persist) {
    return false;
  }
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
  const saved = persist();
  if (options.returnFileSave) {
    return Promise.resolve({ local: saved, file: false });
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
  const persist = typeof persistSession === "function"
    ? () => persistSession({ reason: "session" })
    : (typeof persistNodeGraphUserSession === "function" ? persistNodeGraphUserSession : null);
  if (!persist) {
    return false;
  }
  nodeGraphMvp.workingPatch = null;
  nodeGraphMvp.currentSavedPatchFilename = "";
  nodeGraphMvp.patchDirtyState = "untouched";
  return persist();
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

function nodeGraphSavedPatchEntryByFilename(filename) {
  const safeFilename = String(filename || "");
  return (Array.isArray(nodeGraphMvp.savedPatchEntries) ? nodeGraphMvp.savedPatchEntries : [])
    .find((patch) => patch?.filename === safeFilename) || {
    filename: safeFilename,
    name: nodeGraphSavedPatchDisplayName(safeFilename) || safeFilename,
    tags: "",
  };
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

function handleNodeGraphSavedPatchBankNameInput(event) {
  nodeGraphMvp.savedPatchBankName = nodeGraphOneLineText(event.currentTarget?.value);
  if (typeof saveNodeGraphWorkspaceWindowStatesToUserSettings === "function") {
    saveNodeGraphWorkspaceWindowStatesToUserSettings({ status: false });
  }
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

/**
 * Filename for a static site page patch download.
 * When embedded on soundemote.io/{slug}, use `{slug}.json` so it drops straight
 * into soemdsp-sandbox/patches/. Otherwise fall back to the normal patch file name.
 */
function nodeGraphStaticPagePatchFileName() {
  try {
    if (window.parent && window.parent !== window) {
      const path = String(window.parent.location.pathname || "").replace(/^\/+|\/+$/g, "");
      if (!path || path === "sandbox") {
        return "init.json";
      }
      if (/^[a-z0-9][a-z0-9-]*$/i.test(path)) {
        return `${path.toLowerCase()}.json`;
      }
    }
  } catch (_error) {
    // Cross-origin parent — ignore.
  }
  if (typeof nodeGraphPatchFileName === "function") {
    return nodeGraphPatchFileName();
  }
  return "patch.json";
}

/**
 * Download the current graph as JSON for soemdsp-sandbox/patches/{name}.json.
 * No login — drop the file next to the sandbox embed and deploy.
 */
function downloadNodeGraphStaticPagePatch() {
  const payload = nodeGraphPatchExportPayload();
  if (!payload) {
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus("Share Patch: fix script / graph before exporting", false);
    }
    return;
  }
  const filename = nodeGraphStaticPagePatchFileName();
  const blob = new Blob([payload.text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  if (typeof setNodeGraphScriptStatus === "function") {
    setNodeGraphScriptStatus(
      `Share Patch: downloaded ${filename} — put it in soemdsp-sandbox/patches/ and deploy`,
      true,
    );
  }
}

/**
 * Build current patch JSON for export (header fields + live patch).
 * Returns { text, filename, patch } or null if not ready.
 */
function nodeGraphPatchExportPayload() {
  const script = document.getElementById("nodePatchScript");
  if (script && document.activeElement !== script) {
    try {
      syncNodeGraphScriptView("script synced before save", true);
    } catch (_error) {
      // Best-effort.
    }
  }
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("save")) {
    return null;
  }
  const patchToSave = typeof nodeGraphPatchWithLiveHeaderInfo === "function"
    ? nodeGraphPatchWithLiveHeaderInfo()
    : nodeGraphMvp?.patch;
  if (!patchToSave) {
    return null;
  }
  const patchText = typeof serializeNodeGraphPatch === "function"
    ? serializeNodeGraphPatch(patchToSave)
    : JSON.stringify(patchToSave, null, 2);
  const filename = typeof nodeGraphPatchFileName === "function"
    ? nodeGraphPatchFileName()
    : "soemdsp-patch.json";
  return { text: patchText, filename, patch: patchToSave };
}

const nodeGraphFilePickerWellKnown = Object.freeze(["desktop", "documents", "downloads"]);

function normalizeNodeGraphFilePickerState(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const startIn = String(source.startIn || "desktop").toLowerCase();
  return {
    startIn: nodeGraphFilePickerWellKnown.includes(startIn) ? startIn : "desktop",
    lastSettingsName: String(source.lastSettingsName || "useruisettings.json").slice(0, 180) || "useruisettings.json",
    lastPatchName: String(source.lastPatchName || "").slice(0, 180),
  };
}

function nodeGraphFilePickerState() {
  const next = normalizeNodeGraphFilePickerState(nodeGraphMvp?.filePicker);
  if (nodeGraphMvp) {
    nodeGraphMvp.filePicker = next;
  }
  return next;
}

function rememberNodeGraphFilePickerMeta(patch = {}) {
  const next = {
    ...nodeGraphFilePickerState(),
    ...(patch.lastSettingsName ? { lastSettingsName: String(patch.lastSettingsName).slice(0, 180) } : {}),
    ...(patch.lastPatchName ? { lastPatchName: String(patch.lastPatchName).slice(0, 180) } : {}),
    startIn: "desktop",
  };
  if (nodeGraphMvp) {
    nodeGraphMvp.filePicker = next;
  }
  if (typeof scheduleNodeUiDevSettingsAutosave === "function") {
    scheduleNodeUiDevSettingsAutosave();
  }
  return next;
}

function nodeGraphFilePickerOpenDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("soemdsp-sandbox-file-picker", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("file picker db failed"));
  });
}

async function nodeGraphFilePickerGetHandle() {
  try {
    const db = await nodeGraphFilePickerOpenDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readonly");
      const req = tx.objectStore("handles").get("last");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function nodeGraphFilePickerPutHandle(handle) {
  if (!handle) {
    return;
  }
  try {
    const db = await nodeGraphFilePickerOpenDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(handle, "last");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Handle persistence is best-effort (private mode / quota).
  }
}

async function nodeGraphFilePickerStartIn({ allowHandle = true } = {}) {
  if (allowHandle) {
    const handle = await nodeGraphFilePickerGetHandle();
    if (handle && typeof handle.queryPermission === "function") {
      try {
        const permission = await handle.queryPermission({ mode: "readwrite" });
        if (permission === "granted") {
          return handle;
        }
      } catch {
        // Fall through to Desktop.
      }
    } else if (handle) {
      return handle;
    }
  }
  return nodeGraphFilePickerState().startIn || "desktop";
}

function nodeGraphDownloadTextFile(text, filename) {
  const blob = new Blob([`${text}`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "soemdsp.json";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function nodeGraphSaveTextFileWithNativeDialog({
  text,
  suggestedName,
  description = "JSON",
  accept = { "application/json": [".json"] },
  folderOnly = false,
} = {}) {
  const name = String(suggestedName || "soemdsp.json");
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        startIn: await nodeGraphFilePickerStartIn({ allowHandle: !folderOnly }),
        types: [{ description, accept }],
        excludeAcceptAllOption: false,
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      if (!folderOnly) {
        await nodeGraphFilePickerPutHandle(handle);
      }
      return { ok: true, name: handle.name || name, cancelled: false };
    } catch (error) {
      if (error && (error.name === "AbortError" || error.name === "NotAllowedError")) {
        return { ok: false, cancelled: true };
      }
      throw error;
    }
  }
  nodeGraphDownloadTextFile(text, name);
  return { ok: true, name, cancelled: false, downloaded: true };
}

async function nodeGraphOpenTextFileWithNativeDialog({
  description = "JSON",
  accept = { "application/json": [".json"] },
  fallbackInputId = "",
} = {}) {
  if (typeof window.showOpenFilePicker === "function") {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        startIn: await nodeGraphFilePickerStartIn(),
        types: [{ description, accept }],
        excludeAcceptAllOption: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      await nodeGraphFilePickerPutHandle(handle);
      return { ok: true, name: handle.name || file.name, text, cancelled: false };
    } catch (error) {
      if (error && (error.name === "AbortError" || error.name === "NotAllowedError")) {
        return { ok: false, cancelled: true };
      }
      throw error;
    }
  }
  const input = fallbackInputId ? document.getElementById(fallbackInputId) : null;
  if (!input) {
    throw new Error("file picker unavailable");
  }
  return new Promise((resolve) => {
    const onChange = () => {
      input.removeEventListener("change", onChange);
      const [file] = input.files || [];
      if (!file) {
        resolve({ ok: false, cancelled: true });
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        resolve({
          ok: true,
          name: file.name,
          text: String(reader.result || ""),
          cancelled: false,
        });
        input.value = "";
      });
      reader.addEventListener("error", () => {
        resolve({ ok: false, cancelled: false, error: "file read failed" });
        input.value = "";
      });
      reader.readAsText(file);
    };
    input.addEventListener("change", onChange);
    input.click();
  });
}

/**
 * Fallback when File System Access API is unavailable: browser download dialog
 * (location is usually Downloads; path cannot be forced to Desktop).
 */
function nodeGraphDownloadPatchTextFile(text, filename) {
  nodeGraphDownloadTextFile(text, filename || "soemdsp-patch.json");
}

/**
 * Native save dialog for the current patch (Save Patch / Ctrl+S).
 * Always opens the folder picker (never writes a remembered session file).
 * The OS overwrite prompt is allowed if the user picks an existing name.
 */
async function saveNodeGraphPatchWithNativeDialog() {
  const payload = nodeGraphPatchExportPayload();
  if (!payload) {
    return false;
  }
  const { text, filename, patch } = payload;
  try {
    if (typeof nodeGraphSaveTextFileWithNativeDialog === "function") {
      const result = await nodeGraphSaveTextFileWithNativeDialog({
        text,
        suggestedName: filename,
        description: "soemdsp patch JSON",
        accept: { "application/json": [".json"] },
        folderOnly: true,
      });
      if (result.cancelled) {
        if (typeof setNodeGraphScriptStatus === "function") {
          setNodeGraphScriptStatus("save cancelled", true);
        }
        return false;
      }
      const savedName = result.name || filename;
      rememberNodeGraphFilePickerMeta({ lastPatchName: savedName });
      if (typeof commitNodeGraphPatch === "function") {
        commitNodeGraphPatch(patch, {
          markPending: false,
          patchDirtyState: "saved",
          record: false,
          status: `patch saved: ${savedName}`,
        });
      }
      if (typeof setNodeGraphCurrentSavedPatch === "function") {
        setNodeGraphCurrentSavedPatch(savedName);
      }
      if (typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus(`patch saved: ${savedName}`, true);
      }
      return true;
    }

    // No File System Access API — download (browser chooses location).
    nodeGraphDownloadPatchTextFile(text, filename);
    if (typeof commitNodeGraphPatch === "function") {
      commitNodeGraphPatch(patch, {
        markPending: false,
        patchDirtyState: "saved",
        record: false,
        status: `patch downloaded: ${filename}`,
      });
    }
    if (typeof setNodeGraphCurrentSavedPatch === "function") {
      setNodeGraphCurrentSavedPatch(filename);
    }
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus(`patch downloaded: ${filename}`, true);
    }
    return true;
  } catch (error) {
    const message = String(error?.message || error || "save failed");
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus(`patch save failed: ${message}`, false);
    }
    return false;
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

async function loadNodeGraphScript() {
  if (!nodeGraphScriptReadyForGraphAction("load")) {
    return;
  }
  try {
    const result = await nodeGraphOpenTextFileWithNativeDialog({
      description: "soemdsp patch JSON",
      accept: { "application/json": [".json"] },
      fallbackInputId: "nodePatchScriptFileInput",
    });
    if (result.cancelled) {
      setNodeGraphScriptStatus("load cancelled", true);
      return;
    }
    if (!result.ok) {
      setNodeGraphScriptStatus(result.error || "load failed", false);
      return;
    }
    rememberNodeGraphFilePickerMeta({ lastPatchName: result.name });
    commitNodeGraphPatch(loadNodeGraphPatchFromScript(result.text), {
      patchDirtyState: "saved",
      status: "script loaded",
    });
    setNodeGraphCurrentSavedPatch(result.name || "");
    setNodeGraphScriptStatus(`patch loaded: ${result.name || "file"}`, true);
  } catch (error) {
    const message = String(error?.message || error || "failed to load patch");
    if (typeof nodeGraphShowPatchLoadFault === "function") {
      nodeGraphShowPatchLoadFault({
        message,
        script: error?.patchScript || "",
        title: "Failed to load patch file",
      });
    } else {
      setNodeGraphScriptStatus(message, false);
    }
  }
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

async function copyNodeGraphScriptToClipboard(event) {
  const button = event?.currentTarget;
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("copy")) {
    return;
  }
  const text = typeof serializeNodeGraphPatch === "function"
    ? serializeNodeGraphPatch()
    : JSON.stringify(nodeGraphMvp?.patch || {}, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setNodeGraphScriptStatus("patch copied", true);
    if (typeof flashNodeGraphDefaultButtonSaved === "function" && button) {
      flashNodeGraphDefaultButtonSaved(button, "Copied");
    }
  } catch {
    setNodeGraphScriptStatus("copy blocked: clipboard permission denied", false);
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

function nodeGraphPreviewClipboardPatchText(text) {
  const source = String(text ?? "").trim();
  if (!source) {
    throw new Error("paste empty: clipboard has no text");
  }
  if (typeof loadNodeGraphPatchFromScript === "function") {
    return loadNodeGraphPatchFromScript(source);
  }
  const data = JSON.parse(source);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("paste rejected: clipboard is not a patch object");
  }
  if (typeof validateNodeGraphPatch === "function") {
    return validateNodeGraphPatch(data);
  }
  return data;
}

async function pasteNodeGraphScriptFromClipboard(event) {
  const button = event?.currentTarget;
  const confirming = Boolean(
    button
    && typeof nodeGraphMvp !== "undefined"
    && nodeGraphMvp.confirmDefaultButton === button
    && button.classList.contains("confirming-default"),
  );
  if (confirming) {
    const cached = nodeGraphMvp._pendingPastePatchText;
    if (typeof clearNodeGraphConfirmDefaultButton === "function") {
      clearNodeGraphConfirmDefaultButton(button);
    }
    delete nodeGraphMvp._pendingPastePatchText;
    if (!cached) {
      setNodeGraphScriptStatus("paste expired: copy the patch again", false);
      return;
    }
    if (typeof commitNodeGraphScript === "function") {
      commitNodeGraphScript(cached);
    }
    if (typeof flashNodeGraphDefaultButtonSaved === "function" && button) {
      flashNodeGraphDefaultButtonSaved(button, "Pasted");
    }
    return;
  }
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    setNodeGraphScriptStatus("paste blocked: clipboard permission denied", false);
    return;
  }
  try {
    nodeGraphPreviewClipboardPatchText(text);
  } catch (error) {
    if (typeof nodeGraphMvp !== "undefined") {
      delete nodeGraphMvp._pendingPastePatchText;
    }
    setNodeGraphScriptStatus(error?.message || "paste rejected: not a valid patch", false);
    return;
  }
  if (typeof nodeGraphMvp !== "undefined") {
    nodeGraphMvp._pendingPastePatchText = String(text);
  }
  if (typeof confirmNodeGraphDefaultButtonClick === "function" && button) {
    confirmNodeGraphDefaultButtonClick(button, () => {
      setNodeGraphScriptStatus("click Confirm Paste to replace this patch", true);
    }, { confirmText: "Confirm Paste" });
    return;
  }
  if (typeof commitNodeGraphScript === "function") {
    commitNodeGraphScript(text);
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

function normalizeNodeGraphSavedPatchGridColumns(value) {
  const columns = Math.round(Number(value));
  return Number.isFinite(columns) ? Math.max(1, Math.min(16, columns)) : 3;
}

async function loadNodeGraphDemoPatchEntries() {
  const response = await fetch("/api/patches");
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.patches || [];
}

/** Refresh in-memory saved-patch index (no UI — explorer removed). */
async function renderNodeGraphDemoPatchList() {
  try {
    nodeGraphMvp.savedPatchEntries = await loadNodeGraphDemoPatchEntries();
    return nodeGraphMvp.savedPatchEntries;
  } catch (error) {
    nodeGraphMvp.savedPatchEntries = [];
    setNodeGraphScriptStatus(`patch list unavailable: ${error?.message || error}`, false);
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
