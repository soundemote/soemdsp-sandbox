// Require a double-click to enter typing mode on a field (single click / drag
// just focuses/selects, never edits). Matches the drag-number controls' behavior
// so header text boxes aren't accidentally edited. Re-locks on blur/Enter/Escape.
function applyNodeGraphDoubleClickToEdit(field) {
  if (!field || field.dataset.dblclickEditBound === "true") {
    return;
  }
  field.dataset.dblclickEditBound = "true";
  field.readOnly = true;
  field.addEventListener("pointerdown", (event) => {
    if (field.readOnly) {
      event.preventDefault();
    }
  });
  field.addEventListener("dblclick", () => {
    field.readOnly = false;
    field.focus();
    try { field.select(); } catch (_) {}
  });
  field.addEventListener("blur", () => {
    field.readOnly = true;
  });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      field.blur();
    }
  });
}

function bindNodeGraphSettingsFormEvents() {
  document
    .getElementById("nodePatchScriptFileInput")
    .addEventListener("change", handleNodeGraphScriptFileLoad);
  document
    .getElementById("nodeUiDevSettingsFileInput")
    .addEventListener("change", handleNodeUiDevSettingsFileLoad);
  for (const field of document.querySelectorAll("[data-patch-info-field]")) {
    field.addEventListener("input", handleNodeGraphSettingsInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
  // Patch Explorer name/tags are always editable (no double-click gate).
  for (const field of document.querySelectorAll("[data-patch-header-info-field]")) {
    field.readOnly = false;
    field.addEventListener("input", handleNodeGraphHeaderInfoInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
  for (const field of document.querySelectorAll("[data-patch-bank-name-field]")) {
    field.addEventListener("input", handleNodeGraphSavedPatchBankNameInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
  for (const field of document.querySelectorAll("[data-patch-library-path]")) {
    field.addEventListener("input", handleNodeGraphPatchLibraryPathInput);
    field.addEventListener("change", handleNodeGraphPatchLibraryPathInput);
  }
  document
    .getElementById("nodePatchFactoryPathButton")
    ?.addEventListener("click", handleNodeGraphPatchLibraryPathButtonClick);
  document
    .getElementById("nodePatchUserPathButton")
    ?.addEventListener("click", handleNodeGraphPatchLibraryPathButtonClick);
  for (const field of document.querySelectorAll("[data-patch-visual-field]")) {
    field.addEventListener("input", handleNodeGraphSettingsInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
  for (const field of document.querySelectorAll("[data-patch-audio-field]")) {
    field.addEventListener("input", handleNodeGraphSettingsInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
  for (const field of document.querySelectorAll("[data-patch-grid-field]")) {
    field.addEventListener("input", handleNodeGraphSettingsInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
  document.getElementById("toggleDebugButton").addEventListener("click", toggleDebugSections);
  bindNodeGraphMetadataPopoverEvents();
}
