// The old exposed-control "mirror" system (createNodeUserUiSettingsControl
// et al -- built a simplified proxy control that dispatched synthetic
// input/change events back at the real UI Dev source input) has no callers
// left now that renderNodeUserUiSettingsControls only renders the arc
// thickness control directly; every UI Dev control already lives in UI Dev
// itself, so there's nothing left to mirror out of it.
function createNodeUserUiSettingsViewCheckbox({ key, label, getValue, setValue }) {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control boolean";
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.nodeUiViewSetting = key;
  input.checked = Boolean(getValue());
  input.addEventListener("change", () => {
    setValue(Boolean(input.checked));
  });
  row.append(title, input);
  return row;
}

function createNodeUserUiSettingsViewControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "gridVisible",
    label: "Show grid",
    getValue: () => nodeGraphMvp.gridVisible,
    setValue: (visible) => {
      nodeGraphMvp.gridVisible = visible;
      renderNodeGraphGridToggle();
    },
  });
}

function createNodeUserUiSettingsHideMouseWhileDraggingControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "hideMouseWhileDragging",
    label: "Hide mouse while dragging",
    getValue: () => nodeGraphMvp.hideMouseWhileDragging !== false,
    setValue: (visible) => {
      nodeGraphMvp.hideMouseWhileDragging = visible;
      if (typeof syncNodeSliderHiddenMouseClass === "function") {
        syncNodeSliderHiddenMouseClass();
      }
    },
  });
}

function createNodeUserUiSettingsSliderAmountControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "sliderAmountVisible",
    label: "Show amount slider",
    getValue: () => nodeGraphMvp.sliderAmountVisible,
    setValue: (visible) => {
      nodeGraphMvp.sliderAmountVisible = visible;
      renderNodeGraphSliderVisibilityToggles();
    },
  });
}

function createNodeUserUiSettingsSliderPositionControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "sliderPositionVisible",
    label: "Show position slider",
    getValue: () => nodeGraphMvp.sliderPositionVisible,
    setValue: (visible) => {
      nodeGraphMvp.sliderPositionVisible = visible;
      renderNodeGraphSliderVisibilityToggles();
    },
  });
}

function createNodeUserUiSettingsModuleButtonsControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleButtonsVisible",
    label: "Show module buttons",
    getValue: () => nodeGraphMvp.moduleButtonsVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleButtonsVisible = visible;
      renderNodeGraphModuleVisibilityToggles();
    },
  });
}

function createNodeUserUiSettingsModuleOscilloscopeControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleOscilloscopesVisible",
    label: "Show displays",
    getValue: () => nodeGraphMvp.moduleOscilloscopesVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleOscilloscopesVisible = visible;
      renderNodeGraphModuleVisibilityToggles();
      if (typeof scheduleNodeGraphLivePlanSync === "function") {
        scheduleNodeGraphLivePlanSync();
      }
    },
  });
}

function createNodeUserUiSettingsModuleInterfaceControlsControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleInterfaceControlsVisible",
    label: "Show control surfaces",
    getValue: () => nodeGraphMvp.moduleInterfaceControlsVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleInterfaceControlsVisible = visible;
      renderNodeGraphModuleVisibilityToggles();
    },
  });
}

function createNodeUserUiSettingsModuleScopeBrightnessControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Master display brightness";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "16";
  input.step = "0.01";
  input.dataset.nodeUiViewSetting = "moduleScopeBrightness";
  input.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness ?? 1).toFixed(2);
  const output = document.createElement("input");
  output.type = "number";
  output.min = "0";
  output.max = "16";
  output.step = "0.01";
  output.dataset.nodeUiViewSettingValue = "moduleScopeBrightness";
  output.value = input.value;
  input.addEventListener("input", () => {
    setNodeGraphModuleScopeBrightness(input.value);
    output.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness).toFixed(2);
  });
  input.addEventListener("change", () => {
    setNodeGraphModuleScopeBrightness(input.value);
    output.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness).toFixed(2);
  });
  output.addEventListener("input", () => {
    setNodeGraphModuleScopeBrightness(output.value);
    input.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness).toFixed(2);
  });
  output.addEventListener("change", () => {
    setNodeGraphModuleScopeBrightness(output.value);
    output.value = normalizeNodeGraphModuleScopeBrightness(nodeGraphMvp.moduleScopeBrightness).toFixed(2);
    input.value = output.value;
  });
  row.append(title, input, output);
  return row;
}

function createNodeUserUiSettingsModuleScopeLineThicknessControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Master display line thickness";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0.25";
  input.max = "4";
  input.step = "0.01";
  input.dataset.nodeUiViewSetting = "moduleScopeLineThickness";
  input.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness ?? 1).toFixed(2);
  const output = document.createElement("input");
  output.type = "number";
  output.min = "0.25";
  output.max = "4";
  output.step = "0.01";
  output.dataset.nodeUiViewSettingValue = "moduleScopeLineThickness";
  output.value = input.value;
  input.addEventListener("input", () => {
    setNodeGraphModuleScopeLineThickness(input.value);
    output.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness).toFixed(2);
  });
  input.addEventListener("change", () => {
    setNodeGraphModuleScopeLineThickness(input.value);
    output.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness).toFixed(2);
  });
  output.addEventListener("input", () => {
    setNodeGraphModuleScopeLineThickness(output.value);
    input.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness).toFixed(2);
  });
  output.addEventListener("change", () => {
    setNodeGraphModuleScopeLineThickness(output.value);
    output.value = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness).toFixed(2);
    input.value = output.value;
  });
  row.append(title, input, output);
  return row;
}

// The slider itself is felt as a plain 0-100% -- 0% is the 1px floor,
// 100% is the knob's own radius (past that a "ring" is just a filled
// disc again, see nodeGraphMacroKnobArcThicknessMaxPx). The number
// readout still shows/accepts real pixels, converting back to the
// matching percent so the two stay in lockstep.
function createNodeUserUiSettingsMacroKnobArcThicknessControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Macro knob arc thickness";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.dataset.nodeUiViewSetting = "macroKnobArcThickness";
  input.value = String(Math.round(nodeGraphMacroKnobArcThicknessPxToPercent(nodeGraphMvp.macroKnobArcThickness ?? 7)));
  const output = document.createElement("input");
  output.type = "number";
  output.min = String(nodeGraphMacroKnobArcThicknessMinPx);
  output.max = String(nodeGraphMacroKnobArcThicknessMaxPx);
  output.step = "0.5";
  output.dataset.nodeUiViewSettingValue = "macroKnobArcThickness";
  output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness ?? 7).toFixed(1);
  input.addEventListener("input", () => {
    setNodeGraphMacroKnobArcThickness(nodeGraphMacroKnobArcThicknessPercentToPx(input.value));
    output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
  });
  input.addEventListener("change", () => {
    setNodeGraphMacroKnobArcThickness(nodeGraphMacroKnobArcThicknessPercentToPx(input.value));
    output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
  });
  output.addEventListener("input", () => {
    setNodeGraphMacroKnobArcThickness(output.value);
    input.value = String(Math.round(nodeGraphMacroKnobArcThicknessPxToPercent(nodeGraphMvp.macroKnobArcThickness)));
  });
  output.addEventListener("change", () => {
    setNodeGraphMacroKnobArcThickness(output.value);
    output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
    input.value = String(Math.round(nodeGraphMacroKnobArcThicknessPxToPercent(nodeGraphMvp.macroKnobArcThickness)));
  });
  row.append(title, input, output);
  return row;
}

// The knob's -132..+132deg travel-limit gap is what makes it read as an
// open arc instead of a closed loop -- 0% keeps it fully transparent (the
// normal arc look); turning it up dims it in rather than leaving it a hard
// invisible notch, for anyone who wants a softer or fully closed pie look.
function createNodeUserUiSettingsMacroKnobArcGapBrightnessControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Macro knob arc-space brightness";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.dataset.nodeUiViewSetting = "macroKnobArcGapBrightness";
  input.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness ?? 0));
  const output = document.createElement("input");
  output.type = "number";
  output.min = "0";
  output.max = "100";
  output.step = "1";
  output.dataset.nodeUiViewSettingValue = "macroKnobArcGapBrightness";
  output.value = input.value;
  input.addEventListener("input", () => {
    setNodeGraphMacroKnobArcGapBrightness(input.value);
    output.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness));
  });
  input.addEventListener("change", () => {
    setNodeGraphMacroKnobArcGapBrightness(input.value);
    output.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness));
  });
  output.addEventListener("input", () => {
    setNodeGraphMacroKnobArcGapBrightness(output.value);
    input.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness));
  });
  output.addEventListener("change", () => {
    setNodeGraphMacroKnobArcGapBrightness(output.value);
    output.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness));
    input.value = output.value;
  });
  row.append(title, input, output);
  return row;
}

function createNodeUserUiSettingsModuleScopeFramesPerSecondControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Master display FPS";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "240";
  input.step = "1";
  input.dataset.nodeUiViewSetting = "moduleScopeFramesPerSecond";
  input.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60));
  const output = document.createElement("input");
  output.type = "number";
  output.min = "0";
  output.max = "240";
  output.step = "1";
  output.dataset.nodeUiViewSettingValue = "moduleScopeFramesPerSecond";
  output.value = input.value;
  input.addEventListener("input", () => {
    setNodeGraphModuleScopeFramesPerSecond(input.value);
    output.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond));
  });
  input.addEventListener("change", () => {
    setNodeGraphModuleScopeFramesPerSecond(input.value);
    output.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond));
  });
  output.addEventListener("input", () => {
    setNodeGraphModuleScopeFramesPerSecond(output.value);
    input.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond));
  });
  output.addEventListener("change", () => {
    setNodeGraphModuleScopeFramesPerSecond(output.value);
    output.value = String(normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond));
    input.value = output.value;
  });
  row.append(title, input, output);
  return row;
}

function createNodeUserUiSettingsModuleSlidersControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "moduleSlidersVisible",
    label: "Show module sliders",
    getValue: () => nodeGraphMvp.moduleSlidersVisible !== false,
    setValue: (visible) => {
      nodeGraphMvp.moduleSlidersVisible = visible;
      renderNodeGraphModuleVisibilityToggles();
    },
  });
}

function createNodeUserUiSettingsSliderLayoutControl() {
  const row = document.createElement("div");
  row.className = "node-user-ui-setting-control action";
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

// Every other user-facing view control that used to live in this panel has
// moved into the UI Dev helper (see renderNodeUiDevHelperViewControls) --
// User UI Settings is now just the one thing regular users are meant to
// tune, everything else lives with the rest of the developer controls.
function renderNodeUserUiSettingsControls() {
  const container = document.getElementById("nodeUserUiSettingsControls");
  if (!container) {
    return;
  }
  container.textContent = "";
  const sectionElement = createNodeUserUiSettingsSection("knob style", [
    createNodeUserUiSettingsMacroKnobArcThicknessControl(),
    createNodeUserUiSettingsMacroKnobArcGapBrightnessControl(),
  ]);
  if (sectionElement) {
    container.append(sectionElement);
  } else {
    const empty = document.createElement("div");
    empty.className = "node-user-ui-settings-empty";
    empty.textContent = "no ui settings exposed";
    container.append(empty);
  }
}

// Mounts everything that used to live in the User UI Settings panel (view
// toggles, module display controls, slider layout) into the UI Dev helper
// instead, reusing the same control-factory functions so behavior/
// persistence (data-node-ui-view-setting) is unchanged -- only where they're
// displayed moves. Guarded by a dataset flag so repeated helper opens don't
// duplicate the section.
function renderNodeUiDevHelperViewControls() {
  const helperBody = document.querySelector(".node-ui-dev-helper-body");
  if (!helperBody || helperBody.dataset.viewControlsMounted === "true") {
    return;
  }
  const workspaceSection = createNodeUserUiSettingsSection("workspace view", [
    createNodeUserUiSettingsHideMouseWhileDraggingControl(),
    createNodeUserUiSettingsViewControl(),
    createNodeUserUiSettingsSliderAmountControl(),
    createNodeUserUiSettingsSliderPositionControl(),
  ]);
  const moduleSection = createNodeUserUiSettingsSection("modules and nodes view", [
    createNodeUserUiSettingsModuleButtonsControl(),
    createNodeUserUiSettingsModuleOscilloscopeControl(),
    createNodeUserUiSettingsModuleInterfaceControlsControl(),
    createNodeUserUiSettingsModuleScopeBrightnessControl(),
    createNodeUserUiSettingsModuleScopeLineThicknessControl(),
    createNodeUserUiSettingsModuleScopeFramesPerSecondControl(),
    createNodeUserUiSettingsModuleSlidersControl(),
    createNodeUserUiSettingsSliderLayoutControl(),
  ]);
  for (const section of [workspaceSection, moduleSection]) {
    if (section) {
      helperBody.append(section);
    }
  }
  helperBody.dataset.viewControlsMounted = "true";
}

function syncNodeUserUiSettingsViewControls() {
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='gridVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = Boolean(nodeGraphMvp.gridVisible);
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
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='hideMouseWhileDragging']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = nodeGraphMvp.hideMouseWhileDragging !== false;
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
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='macroKnobArcThickness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(Math.round(nodeGraphMacroKnobArcThicknessPxToPercent(nodeGraphMvp.macroKnobArcThickness ?? 7)));
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='macroKnobArcThickness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness ?? 7).toFixed(1);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='macroKnobArcGapBrightness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness ?? 0));
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='macroKnobArcGapBrightness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness ?? 0));
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
