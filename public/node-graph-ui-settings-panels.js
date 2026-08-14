const nodeUserUiSettingsWindowDefaultSize = Object.freeze({
  width: 360,
  height: 620,
  minWidth: 280,
  minHeight: 240,
});

const nodeUiDevHelperWindowDefaultSize = Object.freeze({
  width: 360,
  height: 520,
  minWidth: 280,
  minHeight: 200,
});

function normalizeNodeUserUiSettingsWindowSize(size = {}, element = null) {
  return normalizeNodeGraphFloatingWindowSize(
    size,
    nodeUserUiSettingsWindowDefaultSize,
    { element: element || document.getElementById("nodeUserUiSettingsPanel") },
  );
}

function normalizeNodeUiDevHelperWindowSize(size = {}, element = null) {
  return normalizeNodeGraphFloatingWindowSize(
    size,
    nodeUiDevHelperWindowDefaultSize,
    { element: element || document.getElementById("nodeUiDevHelper") },
  );
}

function applyNodeUserUiSettingsWindowSize(size = nodeGraphMvp.userUiSettingsWindowSize, element = null) {
  const panel = element || document.getElementById("nodeUserUiSettingsPanel");
  const merged = (size && typeof size === "object")
    ? size
    : (nodeGraphMvp.userUiSettingsWindowSize || nodeUserUiSettingsWindowDefaultSize);
  const normalized = normalizeNodeUserUiSettingsWindowSize(merged, panel);
  const stored = {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
  nodeGraphMvp.userUiSettingsWindowSize = stored;
  if (!panel) {
    return stored;
  }
  applyNodeGraphFloatingWindowSizeVars(
    panel,
    "node-user-ui-settings",
    nodeUserUiSettingsWindowDefaultSize,
    { ...stored, _maxWidth: normalized._maxWidth, _maxHeight: normalized._maxHeight },
  );
  if (typeof syncNodeGraphFloatingWindowInlineBox === "function") {
    syncNodeGraphFloatingWindowInlineBox(panel, stored);
  }
  return stored;
}

function applyNodeUiDevHelperWindowSize(size = nodeGraphMvp.uiDevHelperWindowSize, element = null) {
  const helper = element || document.getElementById("nodeUiDevHelper");
  const merged = (size && typeof size === "object")
    ? size
    : (nodeGraphMvp.uiDevHelperWindowSize || nodeUiDevHelperWindowDefaultSize);
  const normalized = normalizeNodeUiDevHelperWindowSize(merged, helper);
  const stored = {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
  nodeGraphMvp.uiDevHelperWindowSize = stored;
  if (!helper) {
    return stored;
  }
  applyNodeGraphFloatingWindowSizeVars(
    helper,
    "node-ui-dev-helper",
    nodeUiDevHelperWindowDefaultSize,
    { ...stored, _maxWidth: normalized._maxWidth, _maxHeight: normalized._maxHeight },
  );
  if (typeof syncNodeGraphFloatingWindowInlineBox === "function") {
    syncNodeGraphFloatingWindowInlineBox(helper, stored);
  }
  return stored;
}

function setNodeUiDevHelperVisible(visible) {
  const helper = document.getElementById("nodeUiDevHelper");
  const button = document.getElementById("nodeUiDevButton");
  if (!helper) {
    return;
  }
  helper.hidden = !visible;
  button?.classList.toggle("active", visible);
  button?.setAttribute("aria-pressed", String(visible));
  if (visible) {
    // Always re-check: closed <details> leave only section titles visible.
    if (typeof organizeNodeUiDevSections === "function") {
      organizeNodeUiDevSections();
    }
    if (typeof syncNodeUiDevPatchGridFields === "function") {
      syncNodeUiDevPatchGridFields();
    }
    if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
      bindNodeGraphFloatingWindowResizeHandle("uiDev");
    }
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(helper);
    }
    const savedSize = nodeGraphMvp.workspaceWindowStates?.uiDev?.size
      || nodeGraphMvp.uiDevHelperWindowSize;
    applyNodeUiDevHelperWindowSize(savedSize || nodeUiDevHelperWindowDefaultSize, helper);
    if (typeof positionNodeGraphWorkspaceWindowFromState === "function") {
      positionNodeGraphWorkspaceWindowFromState("uiDev", helper);
    }
  }
  setNodeInteractionHelp(
    visible
      ? "UIDEV helper open. Future UI tuning controls can live in this floating window."
      : "UIDEV helper closed.",
  );
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("uiDev", helper, { open: visible }, { status: false });
  }
}

function toggleNodeUiDevHelper() {
  const helper = document.getElementById("nodeUiDevHelper");
  setNodeUiDevHelperVisible(Boolean(helper?.hidden));
}

function setNodeUserUiSettingsVisible(visible) {
  const panel = document.getElementById("nodeUserUiSettingsPanel");
  const button = document.getElementById("nodeUserUiSettingsButton");
  if (!panel) {
    return;
  }
  if (visible && !panel.hidden) {
    pulseNodeGraphFloatingWindowAttention(panel);
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("uiSettings", panel);
    }
    return;
  }
  panel.hidden = !visible;
  button?.classList.toggle("active", visible);
  button?.setAttribute("aria-pressed", String(visible));
  if (visible) {
    if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
      bindNodeGraphFloatingWindowResizeHandle("uiSettings");
    }
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(panel);
    }
    const savedSize = nodeGraphMvp.workspaceWindowStates?.uiSettings?.size
      || nodeGraphMvp.userUiSettingsWindowSize;
    applyNodeUserUiSettingsWindowSize(savedSize || nodeUserUiSettingsWindowDefaultSize, panel);
    const pending = nodeGraphMvp._unifiedWindowPendingPosition;
    if (pending && Number.isFinite(Number(pending.left)) && Number.isFinite(Number(pending.top))) {
      if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
        setNodeGraphFloatingWindowViewportPosition(panel, pending.left, pending.top);
      } else {
        panel.style.left = `${Math.round(pending.left)}px`;
        panel.style.top = `${Math.round(pending.top)}px`;
      }
    } else if (typeof positionNodeGraphWorkspaceWindowFromState === "function") {
      positionNodeGraphWorkspaceWindowFromState("uiSettings", panel);
    }
    renderNodeUserUiSettingsControls();
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("uiSettings", panel);
    }
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("uiSettings", panel, { open: visible }, { status: false });
  }
}

function toggleNodeUserUiSettings() {
  const panel = document.getElementById("nodeUserUiSettingsPanel");
  setNodeUserUiSettingsVisible(Boolean(panel?.hidden));
}

function installNodeUiDevExposeControls() {
  for (const definition of nodeUiDevSettingControls) {
    const input = document.getElementById(definition.id);
    const row = input?.closest?.(".node-ui-dev-control, .node-ui-dev-color-control, .node-ui-dev-check");
    if (!row || row.querySelector("[data-node-ui-dev-expose]")) {
      continue;
    }
    row.classList.add("has-expose");
    const label = document.createElement("label");
    label.className = "node-ui-dev-expose";
    label.title = "Show this control in the user UI settings panel.";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = nodeUiDevExposeCheckboxId(definition.key);
    checkbox.dataset.nodeUiDevExpose = definition.key;
    // Default off — UI Settings starts empty; opt-in per control in UIDEV.
    checkbox.checked = Boolean(definition.exposeDefault);
    checkbox.setAttribute("aria-label", `Expose ${nodeUiDevControlLabel(definition)} in UI settings`);
    label.append(checkbox);
    row.append(label);
    checkbox.addEventListener("change", () => {
      renderNodeUserUiSettingsControls();
      setNodeUiDevSettingsStatus(
        checkbox.checked ? "control exposed to ui settings" : "control hidden from ui settings",
        true,
      );
    });
  }
}

/**
 * Flatten any prior section/details wrappers so control rows sit back in the
 * helper body (closed <details> hide everything but the title).
 */
function flattenNodeUiDevSections(helperBody) {
  if (!helperBody) {
    return;
  }
  // Nested or top-level — unwrap completely.
  for (const old of [...helperBody.querySelectorAll(".node-ui-dev-section, details.node-ui-dev-section")]) {
    // Prefer body contents; if missing, move every non-heading child.
    const body = old.querySelector(":scope > .node-ui-dev-section-body");
    if (body) {
      while (body.firstChild) {
        old.before(body.firstChild);
      }
    }
    for (const child of [...old.childNodes]) {
      if (
        child.nodeType === 1
        && (
          child.classList?.contains("node-ui-dev-section-heading")
          || child.classList?.contains("node-ui-dev-section-body")
          || child.tagName === "SUMMARY"
        )
      ) {
        continue;
      }
      if (child.nodeType === 1 || (child.nodeType === 3 && child.textContent.trim())) {
        old.before(child);
      }
    }
    old.remove();
  }
  // Any leftover closed details in the helper (defensive).
  for (const details of [...helperBody.querySelectorAll("details")]) {
    details.open = true;
    while (details.firstChild) {
      const child = details.firstChild;
      if (child.tagName === "SUMMARY") {
        details.removeChild(child);
        continue;
      }
      details.before(child);
    }
    details.remove();
  }
}

/**
 * Group UIDEV controls into always-visible section boxes (never <details>).
 * Re-runs when leftover details are detected so options cannot stay hidden.
 */
function organizeNodeUiDevSections() {
  const helperBody = document.querySelector("#nodeUiDevHelper .node-ui-dev-helper-body")
    || document.querySelector(".node-ui-dev-helper-body");
  if (!helperBody) {
    return;
  }
  const organizerVersion = "section-v3-flat";
  const hasHiddenDetails = Boolean(
    helperBody.querySelector("details.node-ui-dev-section:not([open]), details:not([open])"),
  );
  const hasDetailsAtAll = Boolean(helperBody.querySelector("details"));
  if (
    helperBody.dataset.sectionsOrganized === organizerVersion
    && !hasHiddenDetails
    && !hasDetailsAtAll
  ) {
    return;
  }

  flattenNodeUiDevSections(helperBody);

  const rowForId = (id) => {
    const el = document.getElementById(id);
    if (!el || !helperBody.contains(el)) {
      return null;
    }
    return el.closest(".node-ui-dev-control, .node-ui-dev-color-control, .node-ui-dev-check");
  };

  for (const section of nodeUiDevSettingSections) {
    const rows = section.ids.map(rowForId).filter(Boolean);
    if (!rows.length) {
      continue;
    }
    const box = document.createElement("section");
    box.className = "node-ui-dev-section";
    box.setAttribute("aria-label", section.title);
    const heading = document.createElement("div");
    heading.className = "node-ui-dev-section-heading";
    heading.textContent = section.title;
    const body = document.createElement("div");
    body.className = "node-ui-dev-section-body";
    rows[0].before(box);
    box.append(heading, body);
    for (const row of rows) {
      body.append(row);
    }
  }

  helperBody.dataset.sectionsOrganized = organizerVersion;
}

// Move / resize use the shared floating-window registry
// (beginNodeGraphRegisteredFloatingWindowDrag/Resize + pointer bridge).
// Keep thin wrappers so existing event bindings keep compiling.

function beginNodeUserUiSettingsDrag(event) {
  if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
    beginNodeGraphRegisteredFloatingWindowDrag(event, "uiSettings");
  }
}

function beginNodeUiDevHelperDrag(event) {
  if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
    beginNodeGraphRegisteredFloatingWindowDrag(event, "uiDev");
  }
}

/** @deprecated registry pointer bridge owns move/up */
function dragNodeUserUiSettings() {}
/** @deprecated registry pointer bridge owns move/up */
function endNodeUserUiSettingsDrag() {}
/** @deprecated registry pointer bridge owns move/up */
function dragNodeUiDevHelper() {}
/** @deprecated registry pointer bridge owns move/up */
function endNodeUiDevHelperDrag() {}
