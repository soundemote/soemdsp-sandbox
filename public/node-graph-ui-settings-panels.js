function setNodeUiDevHelperVisible(visible) {
  const helper = document.getElementById("nodeUiDevHelper");
  const button = document.getElementById("nodeUiDevButton");
  if (!helper || !button) {
    return;
  }
  helper.hidden = !visible;
  button.classList.toggle("active", visible);
  button.setAttribute("aria-pressed", String(visible));
  if (visible && typeof positionNodeGraphWorkspaceWindowFromState === "function") {
    positionNodeGraphWorkspaceWindowFromState("uiDev", helper);
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

function organizeNodeUiDevSections() {
  const helperBody = document.querySelector(".node-ui-dev-helper-body");
  if (!helperBody || helperBody.dataset.sectionsOrganized === "true") {
    return;
  }
  const rowForId = (id) => document
    .getElementById(id)
    ?.closest(".node-ui-dev-control, .node-ui-dev-color-control, .node-ui-dev-check");
  for (const section of nodeUiDevSettingSections) {
    const rows = section.ids.map(rowForId).filter(Boolean);
    if (!rows.length) {
      continue;
    }
    const details = document.createElement("details");
    details.className = "node-ui-dev-section";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = section.title;
    const body = document.createElement("div");
    body.className = "node-ui-dev-section-body";
    rows[0].before(details);
    details.append(summary, body);
    for (const row of rows) {
      body.append(row);
    }
  }
  helperBody.dataset.sectionsOrganized = "true";
}

let nodeUserUiSettingsDragging = null;

function positionNodeUserUiSettingsPanel(panel, x, y) {
  if (!panel) {
    return;
  }
  const { left, top } = nodeGraphFloatingWindowPosition(panel, x, y);
  setNodeGraphFloatingWindowViewportPosition(panel, left, top);
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "uiSettings",
      panel,
      { open: !panel.hidden, position: { left, top } },
      { persist: false },
    );
  }
}

function beginNodeUserUiSettingsDrag(event) {
  if (event.button > 0 || event.target.closest(".panel-close-button")) {
    return;
  }
  const panel = document.getElementById("nodeUserUiSettingsPanel");
  if (!panel || panel.hidden) {
    return;
  }
  const rect = panel.getBoundingClientRect();
  const handle =
    event.currentTarget.id === "nodeUserUiSettingsHeading"
      ? document.getElementById("nodeUserUiSettingsDragHandle")
      : event.currentTarget;
  nodeUserUiSettingsDragging = {
    handle,
    heading: document.getElementById("nodeUserUiSettingsHeading"),
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    pointerId: event.pointerId ?? null,
  };
  handle?.classList.add("dragging");
  nodeUserUiSettingsDragging.heading?.classList.add("dragging");
  if (event.pointerId !== undefined) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeUserUiSettings(event) {
  const drag = nodeUserUiSettingsDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  positionNodeUserUiSettingsPanel(
    document.getElementById("nodeUserUiSettingsPanel"),
    event.clientX - drag.offsetX,
    event.clientY - drag.offsetY,
  );
  event.preventDefault();
}

function endNodeUserUiSettingsDrag(event) {
  const drag = nodeUserUiSettingsDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.handle?.classList.remove("dragging");
  drag.heading?.classList.remove("dragging");
  if (event.pointerId !== undefined) {
    const heading = document.getElementById("nodeUserUiSettingsHeading");
    const handle = document.getElementById("nodeUserUiSettingsDragHandle");
    if (heading?.hasPointerCapture?.(event.pointerId)) {
      heading.releasePointerCapture(event.pointerId);
    }
    if (handle?.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  }
  nodeUserUiSettingsDragging = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "uiSettings",
      document.getElementById("nodeUserUiSettingsPanel"),
      { open: true },
      { status: false },
    );
  }
}

let nodeUiDevHelperDragging = null;

function positionNodeUiDevHelper(helper, x, y) {
  if (!helper) {
    return;
  }
  const { left, top } = nodeGraphFloatingWindowPosition(helper, x, y);
  setNodeGraphFloatingWindowViewportPosition(helper, left, top);
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "uiDev",
      helper,
      { open: !helper.hidden, position: { left, top } },
      { persist: false },
    );
  }
}

function beginNodeUiDevHelperDrag(event) {
  if (event.button > 0 || event.target.closest(".panel-close-button")) {
    return;
  }

  const helper = document.getElementById("nodeUiDevHelper");
  if (!helper || helper.hidden) {
    return;
  }

  const rect = helper.getBoundingClientRect();
  const handle =
    event.currentTarget.id === "nodeUiDevHelperHeading"
      ? document.getElementById("nodeUiDevHelperDragHandle")
      : event.currentTarget;
  nodeUiDevHelperDragging = {
    handle,
    heading: document.getElementById("nodeUiDevHelperHeading"),
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    pointerId: event.pointerId ?? null,
  };
  handle?.classList.add("dragging");
  nodeUiDevHelperDragging.heading?.classList.add("dragging");
  if (event.pointerId !== undefined) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeUiDevHelper(event) {
  const drag = nodeUiDevHelperDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  positionNodeUiDevHelper(
    document.getElementById("nodeUiDevHelper"),
    event.clientX - drag.offsetX,
    event.clientY - drag.offsetY,
  );
  event.preventDefault();
}

function endNodeUiDevHelperDrag(event) {
  const drag = nodeUiDevHelperDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }

  drag.handle?.classList.remove("dragging");
  drag.heading?.classList.remove("dragging");
  if (event.pointerId !== undefined) {
    const heading = document.getElementById("nodeUiDevHelperHeading");
    const handle = document.getElementById("nodeUiDevHelperDragHandle");
    if (heading?.hasPointerCapture?.(event.pointerId)) {
      heading.releasePointerCapture(event.pointerId);
    }
    if (handle?.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  }
  nodeUiDevHelperDragging = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "uiDev",
      document.getElementById("nodeUiDevHelper"),
      { open: true },
      { status: false },
    );
  }
}
