// While a mirror control here is mid-interaction, syncNodeUserUiSettingsMirrorControls
// (called on every UIDEV apply pass) must not overwrite it with the source
// value -- that would fight the user's drag/keystroke. Set while an input is
// focused/dragging, cleared on change/blur.
let nodeUserUiSettingsActiveMirrorKey = null;

// Generic proxy control for any UI Dev slider/checkbox/color/select the user
// has exposed via the "Expose in UI settings" checkbox next to it in UI Dev.
// Writes go to the real UI Dev source input (dispatching input/change so the
// existing syncNodeUiDevSettingsHeaderControls pipeline applies them), reads
// come back via [data-node-ui-dev-mirror] in syncNodeUserUiSettingsMirrorControls.
function createNodeUserUiSettingsMirrorControl(definition) {
  const source = document.getElementById(definition.id);
  if (!source || definition.locked) {
    return null;
  }
  const label = nodeUiDevControlLabel(definition);

  if (definition.type === "boolean") {
    const row = document.createElement("label");
    row.className = "node-user-ui-setting-control boolean";
    const title = document.createElement("span");
    title.textContent = label;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.nodeUiDevMirror = definition.key;
    input.checked = Boolean(source.checked);
    input.addEventListener("change", () => {
      source.checked = input.checked;
      source.dispatchEvent(new Event("change", { bubbles: true }));
    });
    row.append(title, input);
    return row;
  }

  if (definition.type === "color") {
    const row = document.createElement("label");
    row.className = "node-user-ui-setting-control color";
    const title = document.createElement("span");
    title.textContent = label;
    const input = document.createElement("input");
    input.type = "color";
    input.dataset.nodeUiDevMirror = definition.key;
    input.value = normalizeNodeUiDevColor(source.value, definition.defaultValue);
    const output = document.createElement("output");
    output.dataset.nodeUiDevMirrorValue = definition.key;
    output.textContent = input.value;
    input.addEventListener("input", () => {
      nodeUserUiSettingsActiveMirrorKey = definition.key;
      source.value = input.value;
      source.dispatchEvent(new Event("input", { bubbles: true }));
      output.textContent = input.value;
    });
    input.addEventListener("change", () => {
      source.value = input.value;
      source.dispatchEvent(new Event("change", { bubbles: true }));
      nodeUserUiSettingsActiveMirrorKey = null;
    });
    row.append(title, input, output);
    return row;
  }

  if (definition.type === "select") {
    const row = document.createElement("label");
    row.className = "node-user-ui-setting-control select";
    const title = document.createElement("span");
    title.textContent = label;
    const select = document.createElement("select");
    select.dataset.nodeUiDevMirror = definition.key;
    for (const option of definition.options || []) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      select.append(optionElement);
    }
    select.value = source.value;
    select.addEventListener("change", () => {
      source.value = select.value;
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.dispatchEvent(new Event("change", { bubbles: true }));
    });
    row.append(title, select);
    return row;
  }

  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(definition.min);
  input.max = String(definition.max);
  input.step = String(definition.step ?? 1);
  input.dataset.nodeUiDevMirror = definition.key;
  input.value = String(source.value);
  const readout = document.createElement("input");
  readout.type = "number";
  readout.min = String(definition.min);
  readout.max = String(definition.max);
  readout.step = String(definition.step ?? 1);
  readout.dataset.nodeUiDevMirrorValue = definition.key;
  readout.value = String(source.value);
  const commit = (value) => {
    nodeUserUiSettingsActiveMirrorKey = definition.key;
    const clamped = normalizeNodeUiDevControlValue(definition, value);
    source.value = String(clamped);
    source.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = String(clamped);
    readout.value = String(clamped);
  };
  input.addEventListener("input", () => commit(input.value));
  input.addEventListener("change", () => {
    nodeUserUiSettingsActiveMirrorKey = null;
  });
  readout.addEventListener("input", () => commit(readout.value));
  readout.addEventListener("change", () => {
    commit(readout.value);
    nodeUserUiSettingsActiveMirrorKey = null;
  });
  row.append(title, input, readout);
  return row;
}

function createNodeUserUiSettingsViewCheckbox({ key, label, getValue, setValue, id }) {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control boolean";
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  if (id) {
    input.id = id;
  }
  input.dataset.nodeUiViewSetting = key;
  input.checked = Boolean(getValue());
  input.addEventListener("change", () => {
    setValue(Boolean(input.checked));
  });
  row.append(title, input);
  return row;
}

function persistAndRenderUserUiVisibility(render) {
  if (typeof persistNodeGraphPatchVisibilityView === "function") {
    persistNodeGraphPatchVisibilityView();
  }
  if (typeof render === "function") {
    render();
  }
}

function createNodeUserUiSettingsViewControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "gridVisible",
    id: "nodeUiDevViewGridVisible",
    label: "Show grid",
    getValue: () => nodeGraphMvp.gridVisible,
    setValue: (visible) => {
      nodeGraphMvp.gridVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphGridToggle);
    },
  });
}

function createNodeUserUiSettingsGridLightControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "gridLightVisible",
    id: "nodeUiDevViewGridLightVisible",
    label: "Show grid light",
    getValue: () => nodeGraphMvp.gridLightVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.gridLightVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphGridLightToggle);
    },
  });
}

function createNodeUserUiSettingsWireLengthsControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "wireLengthsVisible",
    id: "nodeUiDevViewWireLengths",
    label: "Show wire lengths",
    getValue: () => nodeGraphMvp.wireLengthsVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.wireLengthsVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphWireLengthsToggle);
    },
  });
}

function createNodeUserUiSettingsWiresAboveControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "wiresAboveModules",
    id: "nodeUiDevViewWiresAbove",
    label: "Wires above modules",
    getValue: () => Boolean(nodeGraphMvp.wiresAboveModules),
    setValue: (visible) => {
      nodeGraphMvp.wiresAboveModules = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphWiresAboveModulesToggle);
    },
  });
}

function createNodeUserUiSettingsKeyboardDebugControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "keyboardDebugInfoVisible",
    id: "nodeUiDevViewKeyboardDebug",
    label: "Show debug",
    getValue: () => nodeGraphMvp.keyboardDebugInfoVisible === true,
    setValue: (visible) => {
      nodeGraphMvp.keyboardDebugInfoVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphKeyboardDebugToggle);
    },
  });
}

function createNodeUserUiSettingsSliderAmountControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "sliderAmountVisible",
    id: "nodeUiDevViewSliderAmount",
    label: "Show amount slider",
    getValue: () => nodeGraphMvp.sliderAmountVisible,
    setValue: (visible) => {
      nodeGraphMvp.sliderAmountVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphSliderVisibilityToggles);
    },
  });
}

function createNodeUserUiSettingsSliderPositionControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "sliderPositionVisible",
    id: "nodeUiDevViewSliderPosition",
    label: "Show position slider",
    getValue: () => nodeGraphMvp.sliderPositionVisible,
    setValue: (visible) => {
      nodeGraphMvp.sliderPositionVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphSliderVisibilityToggles);
    },
  });
}

function createNodeUserUiSettingsModuleButtonsControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleButtonsVisible",
    id: "nodeUiDevViewModuleButtons",
    label: "Show module buttons",
    getValue: () => nodeGraphMvp.moduleButtonsVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleButtonsVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphModuleVisibilityToggles);
    },
  });
}

function createNodeUserUiSettingsModuleOscilloscopeControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleOscilloscopesVisible",
    id: "nodeUiDevViewModuleOscilloscopes",
    label: "Show displays",
    getValue: () => nodeGraphMvp.moduleOscilloscopesVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleOscilloscopesVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphModuleVisibilityToggles);
      if (typeof scheduleNodeGraphLivePlanSync === "function") {
        scheduleNodeGraphLivePlanSync();
      }
    },
  });
}

function createNodeUserUiSettingsModuleInterfaceControlsControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleInterfaceControlsVisible",
    id: "nodeUiDevViewModuleInterface",
    label: "Show control surfaces",
    getValue: () => nodeGraphMvp.moduleInterfaceControlsVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleInterfaceControlsVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphModuleVisibilityToggles);
    },
  });
}


function createNodeUserUiSettingsModuleSlidersControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleSlidersVisible",
    id: "nodeUiDevViewModuleSliders",
    label: "Show module sliders",
    getValue: () => nodeGraphMvp.moduleSlidersVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleSlidersVisible = visible;
      persistAndRenderUserUiVisibility(renderNodeGraphModuleVisibilityToggles);
    },
  });
}

function createNodeUserUiSettingsSliderLayoutControl() {
  const row = document.createElement("div");
  row.className = "node-user-ui-setting-control action";
  row.id = "nodeUiDevViewSliderLayout";
  const title = document.createElement("span");
  title.textContent = "Slider layout";
  const button = document.createElement("button");
  button.id = "nodeUserSliderLayoutCycleButton";
  button.type = "button";
  button.dataset.nodeUiViewSetting = "sliderLayout";
  button.addEventListener("click", cycleNodeGraphSliderLayout);
  row.append(title, button);
  return row;
}

function createNodeUserUiSettingsSection(title, controls) {
  const visibleControls = controls.filter(Boolean);
  if (!visibleControls.length) {
    return null;
  }
  const section = document.createElement("section");
  section.className = "node-ui-dev-section node-user-ui-settings-section";
  const heading = document.createElement("div");
  heading.className = "node-user-ui-settings-section-heading";
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "node-ui-dev-section-body";
  body.append(...visibleControls);
  section.append(heading, body);
  return section;
}

// Everything in this panel is whatever UI Dev controls have their "Expose in
// UI settings" checkbox checked, grouped by the same sections UI Dev itself
// uses (see nodeUiDevSettingSections). Macro knob look lives on the Macro
// Controls display-settings face (not UI Dev / user settings).
function renderNodeUserUiSettingsControls() {
  const container = document.getElementById("nodeUserUiSettingsControls");
  if (!container) {
    return;
  }
  container.textContent = "";
  const sections = [];
  for (const section of nodeUiDevSettingSections) {
    const controls = section.ids
      .map((id) => nodeUiDevSettingControls.find((definition) => definition.id === id))
      .filter((definition) => definition && nodeUiDevControlIsExposed(definition.key))
      .map((definition) => createNodeUserUiSettingsMirrorControl(definition));
    sections.push(createNodeUserUiSettingsSection(section.title, controls));
  }
  const visibleSections = sections.filter(Boolean);
  if (visibleSections.length) {
    container.append(...visibleSections);
  } else {
    const empty = document.createElement("div");
    empty.className = "node-user-ui-settings-empty";
    empty.textContent = "no ui settings exposed";
    container.append(empty);
  }
}

// Mounts UI Dev–only view chrome (tuning + layout) into the helper.
// Guarded by a dataset flag so repeated helper opens don't duplicate sections.
function renderNodeUiDevHelperViewControls() {
  const helperBody = document.querySelector(".node-ui-dev-helper-body");
  if (!helperBody || helperBody.dataset.viewControlsMounted === "true") {
    return;
  }
  const maybe = (fn) => (typeof fn === "function" ? fn() : null);
  const viewRows = [
    maybe(createNodeUserUiSettingsViewControl),
    maybe(createNodeUserUiSettingsGridLightControl),
    maybe(createNodeUserUiSettingsWireLengthsControl),
    maybe(createNodeUserUiSettingsWiresAboveControl),
    maybe(createNodeUserUiSettingsModuleButtonsControl),
    maybe(createNodeUserUiSettingsModuleOscilloscopeControl),
    maybe(createNodeUserUiSettingsModuleInterfaceControlsControl),
    maybe(createNodeUserUiSettingsModuleSlidersControl),
    maybe(createNodeUserUiSettingsSliderAmountControl),
    maybe(createNodeUserUiSettingsSliderPositionControl),
    maybe(createNodeUserUiSettingsSliderLayoutControl),
    maybe(createNodeUserUiSettingsKeyboardDebugControl),
  ].filter(Boolean);
  helperBody.append(...viewRows);
  helperBody.dataset.viewControlsMounted = "true";
}

function syncNodeUserUiSettingsViewControls() {
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='gridVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = Boolean(nodeGraphMvp.gridVisible);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='gridLightVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.gridLightVisible !== false;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='wireLengthsVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.wireLengthsVisible !== false;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='wiresAboveModules']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = Boolean(nodeGraphMvp.wiresAboveModules);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='keyboardDebugInfoVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.keyboardDebugInfoVisible === true;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='sliderAmountVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = Boolean(nodeGraphMvp.sliderAmountVisible);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='sliderPositionVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = Boolean(nodeGraphMvp.sliderPositionVisible);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleButtonsVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.moduleButtonsVisible !== false;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleOscilloscopesVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.moduleOscilloscopesVisible !== false;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleInterfaceControlsVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.moduleInterfaceControlsVisible !== false;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleSlidersVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.moduleSlidersVisible !== false;
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleScopeBrightness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness ?? 1).toFixed(2);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='moduleScopeBrightness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness ?? 1).toFixed(2);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleScopeLineThickness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness ?? 1).toFixed(2);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='moduleScopeLineThickness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness ?? 1).toFixed(2);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='moduleScopeFramesPerSecond']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60));
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='moduleScopeFramesPerSecond']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60));
  }
  for (const button of document.querySelectorAll("[data-node-ui-view-setting='sliderLayout']")) {
    const label = nodeGraphSliderLayoutLabel(nodeGraphMvp.sliderLayout);
    button.textContent = label;
    button.setAttribute("aria-label", `Cycle slider layout. Current: ${label}`);
    button.setAttribute("data-current-slider-layout", normalizeNodeGraphSliderLayout(nodeGraphMvp.sliderLayout));
  }
}

function syncNodeUserUiSettingsMirrorControls() {
  syncNodeUserUiSettingsViewControls();
  for (const input of document.querySelectorAll("[data-node-ui-dev-mirror]")) {
    if (
      document.activeElement === input ||
      (nodeUserUiSettingsActiveMirrorKey && nodeUserUiSettingsActiveMirrorKey === input.dataset.nodeUiDevMirror)
    ) {
      continue;
    }
    const definition = nodeUiDevSettingControls.find((candidate) => candidate.key === input.dataset.nodeUiDevMirror);
    if (!definition) {
      continue;
    }
    const source = document.getElementById(definition.id);
    if (!source) {
      continue;
    }
    if (definition.type === "boolean") {
      input.checked = Boolean(source.checked);
    } else {
      input.value = String(source.value);
      const output = input.parentElement?.querySelector("output, [data-node-ui-dev-mirror-value]");
      if (output) {
        if (definition.type === "number") {
          output.value = input.value;
        } else {
          output.textContent = definition.type === "select"
            ? nodeUiDevSelectLabel(definition, input.value)
            : input.value;
        }
      }
    }
  }
}
