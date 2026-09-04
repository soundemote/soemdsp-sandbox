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
  const raw = document.getElementById("nodePatchRawText");
  if (raw) {
    const refreshHighlight = () => {
      if (typeof syncNodePatchRawTextHighlight === "function") {
        syncNodePatchRawTextHighlight();
      }
    };
    raw.addEventListener("input", () => {
      refreshHighlight();
      if (typeof scheduleNodeGraphScriptCommit === "function") {
        scheduleNodeGraphScriptCommit(raw.value);
      }
    });
    raw.addEventListener("change", () => {
      refreshHighlight();
      if (typeof commitNodeGraphScript === "function") {
        commitNodeGraphScript(raw.value);
      }
    });
    raw.addEventListener("scroll", refreshHighlight);
  }
  const uiSettingsRaw = document.getElementById("nodeUiSettingsRawText");
  if (uiSettingsRaw) {
    uiSettingsRaw.addEventListener("input", () => {
      if (typeof scheduleNodeUiDevSettingsScriptCommit === "function") {
        scheduleNodeUiDevSettingsScriptCommit(uiSettingsRaw.value);
      }
    });
    uiSettingsRaw.addEventListener("change", () => {
      if (typeof commitNodeUiDevSettingsScript === "function") {
        commitNodeUiDevSettingsScript(uiSettingsRaw.value);
      }
    });
  }
  for (const tab of document.querySelectorAll(".node-patch-script-tabs [data-book-script-page]")) {
    tab.addEventListener("click", () => {
      if (typeof setNodeGraphBookScriptPage === "function") {
        setNodeGraphBookScriptPage(tab.dataset.bookScriptPage);
      }
    });
  }
  for (const field of document.querySelectorAll("[data-patch-bank-name-field]")) {
    field.addEventListener("input", handleNodeGraphSavedPatchBankNameInput);
    field.addEventListener("change", commitNodeGraphSettingsHistory);
  }
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
  const toggleDebug = document.getElementById("toggleDebugButton");
  if (toggleDebug && typeof toggleDebugSections === "function") {
    toggleDebug.addEventListener("click", toggleDebugSections);
  }
  bindNodeGraphMetadataPopoverEvents();
}
