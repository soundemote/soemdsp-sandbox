function nodeUserUiSettingsMirrorValue(definition) {
  const input = document.getElementById(definition.id);
  if (!input) {
    return definition.defaultValue;
  }
  return definition.type === "boolean" ? input.checked : input.value;
}

let nodeUserUiSettingsActiveMirrorKey = null;

function dispatchNodeUiDevControlInput(source, commit = false) {
  source.dispatchEvent(new Event("input", { bubbles: true }));
  if (commit) {
    source.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function createNodeUserUiSettingsControl(definition) {
  if (!definition) {
    return null;
  }
  const source = document.getElementById(definition.id);
  if (!source) {
    return null;
  }
  const row = document.createElement("label");
  row.className = `node-user-ui-setting-control ${definition.type}`;
  const title = document.createElement("span");
  title.textContent = nodeUiDevControlLabel(definition);
  row.append(title);

  if (definition.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.nodeUiDevMirror = definition.key;
    input.checked = Boolean(nodeUserUiSettingsMirrorValue(definition));
    input.addEventListener("change", () => {
      source.checked = input.checked;
      dispatchNodeUiDevControlInput(source, true);
    });
    row.append(input);
    return row;
  }

  const input = definition.type === "select"
    ? document.createElement("select")
    : document.createElement("input");
  if (definition.type === "select") {
    for (const optionDefinition of definition.options || []) {
      const option = document.createElement("option");
      option.value = optionDefinition.value;
      option.textContent = optionDefinition.label;
      input.append(option);
    }
  } else {
    input.type = definition.type === "color" ? "color" : "range";
  }
  input.value = String(nodeUserUiSettingsMirrorValue(definition));
  input.dataset.nodeUiDevMirror = definition.key;
  if (definition.type === "number") {
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = "1";
  }
  const output = definition.type === "number"
    ? document.createElement("input")
    : document.createElement("output");
  if (definition.type === "number") {
    output.type = "number";
    output.min = String(definition.min);
    output.max = String(definition.max);
    output.step = "1";
    output.dataset.nodeUiDevMirrorValue = definition.key;
    output.value = input.value;
  } else {
    output.textContent = definition.type === "select"
      ? nodeUiDevSelectLabel(definition, input.value)
      : input.value;
  }
  const syncOutput = () => {
    if (definition.type === "number") {
      output.value = input.value;
      return;
    }
    output.textContent = definition.type === "select"
        ? nodeUiDevSelectLabel(definition, input.value)
        : `${input.value}`;
  };
  const claimControl = () => {
    nodeUserUiSettingsActiveMirrorKey = definition.key;
  };
  const releaseControl = () => {
    window.setTimeout(() => {
      if (nodeUserUiSettingsActiveMirrorKey === definition.key) {
        nodeUserUiSettingsActiveMirrorKey = null;
      }
    }, 0);
  };
  input.addEventListener("pointerdown", claimControl);
  input.addEventListener("focus", claimControl);
  input.addEventListener("pointerup", releaseControl);
  input.addEventListener("pointercancel", releaseControl);
  input.addEventListener("blur", releaseControl);
  input.addEventListener("input", () => {
    claimControl();
    source.value = input.value;
    dispatchNodeUiDevControlInput(source, false);
    syncOutput();
  });
  input.addEventListener("change", () => {
    source.value = input.value;
    dispatchNodeUiDevControlInput(source, true);
    syncOutput();
  });
  if (definition.type === "number") {
    output.addEventListener("pointerdown", claimControl);
    output.addEventListener("focus", claimControl);
    output.addEventListener("blur", releaseControl);
    output.addEventListener("input", () => {
      claimControl();
      const value = normalizeNodeUiDevControlValue(definition, output.value);
      input.value = String(value);
      source.value = String(value);
      dispatchNodeUiDevControlInput(source, false);
    });
    output.addEventListener("change", () => {
      const value = normalizeNodeUiDevControlValue(definition, output.value);
      output.value = String(value);
      input.value = String(value);
      source.value = String(value);
      dispatchNodeUiDevControlInput(source, true);
    });
  }
  row.append(input, output);
  return row;
}

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

function createNodeUserUiSettingsMacroKnobArcThicknessControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Macro knob arc thickness";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "2";
  input.max = "16";
  input.step = "0.5";
  input.dataset.nodeUiViewSetting = "macroKnobArcThickness";
  input.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness ?? 7).toFixed(1);
  const output = document.createElement("input");
  output.type = "number";
  output.min = "2";
  output.max = "16";
  output.step = "0.5";
  output.dataset.nodeUiViewSettingValue = "macroKnobArcThickness";
  output.value = input.value;
  input.addEventListener("input", () => {
    setNodeGraphMacroKnobArcThickness(input.value);
    output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
  });
  input.addEventListener("change", () => {
    setNodeGraphMacroKnobArcThickness(input.value);
    output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
  });
  output.addEventListener("input", () => {
    setNodeGraphMacroKnobArcThickness(output.value);
    input.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
  });
  output.addEventListener("change", () => {
    setNodeGraphMacroKnobArcThickness(output.value);
    output.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness).toFixed(1);
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

function renderNodeUserUiSettingsControls() {
  const container = document.getElementById("nodeUserUiSettingsControls");
  if (!container) {
    return;
  }
  container.textContent = "";
  const definitionsById = new Map(nodeUiDevSettingControls.map((definition) => [definition.id, definition]));
  let renderedAnySection = false;
  for (const section of nodeUiDevSettingSections) {
    const controls = [];
    if (section.title === "workspace") {
      controls.push(createNodeUserUiSettingsHideMouseWhileDraggingControl());
      controls.push(createNodeUserUiSettingsViewControl());
      controls.push(createNodeUserUiSettingsSliderAmountControl());
      controls.push(createNodeUserUiSettingsSliderPositionControl());
    }
    if (section.title === "modules and nodes") {
      controls.push(createNodeUserUiSettingsModuleButtonsControl());
      controls.push(createNodeUserUiSettingsModuleOscilloscopeControl());
      controls.push(createNodeUserUiSettingsModuleInterfaceControlsControl());
      controls.push(createNodeUserUiSettingsModuleScopeBrightnessControl());
      controls.push(createNodeUserUiSettingsModuleScopeLineThicknessControl());
      controls.push(createNodeUserUiSettingsModuleScopeFramesPerSecondControl());
      controls.push(createNodeUserUiSettingsMacroKnobArcThicknessControl());
      controls.push(createNodeUserUiSettingsModuleSlidersControl());
      controls.push(createNodeUserUiSettingsSliderLayoutControl());
    }
    for (const id of section.ids) {
      const definition = definitionsById.get(id);
      if (!definition || !nodeUiDevControlIsExposed(definition.key)) {
        continue;
      }
      controls.push(createNodeUserUiSettingsControl(definition));
    }
    const sectionElement = createNodeUserUiSettingsSection(section.title, controls);
    if (sectionElement) {
      container.append(sectionElement);
      renderedAnySection = true;
    }
  }
  if (!renderedAnySection) {
    const empty = document.createElement("div");
    empty.className = "node-user-ui-settings-empty";
    empty.textContent = "no ui settings exposed";
    container.append(empty);
  }
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
    input.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness ?? 7).toFixed(1);
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='macroKnobArcThickness']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness ?? 7).toFixed(1);
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
