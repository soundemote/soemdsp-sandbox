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
  input.step = "1";
  input.dataset.nodeUiDevMirror = definition.key;
  input.value = String(source.value);
  const readout = document.createElement("input");
  readout.type = "number";
  readout.min = String(definition.min);
  readout.max = String(definition.max);
  readout.step = "1";
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

// Felt/shown as a percent (100% = the knob's normal size) even though the
// stored value is a plain scale multiplier -- matches how the rest of this
// section (arc thickness, arc-space brightness) already reads as percent.
function createNodeUserUiSettingsMacroKnobSizeControl() {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control number";
  const title = document.createElement("span");
  title.textContent = "Macro knob size";
  const minPercent = Math.round(nodeGraphMacroKnobSizeScaleMin * 100);
  const maxPercent = Math.round(nodeGraphMacroKnobSizeScaleMax * 100);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(minPercent);
  input.max = String(maxPercent);
  input.step = "5";
  input.dataset.nodeUiViewSetting = "macroKnobSizeScale";
  input.value = String(Math.round(normalizeNodeGraphMacroKnobSizeScale(nodeGraphMvp.macroKnobSizeScale ?? 1) * 100));
  const output = document.createElement("input");
  output.type = "number";
  output.min = String(minPercent);
  output.max = String(maxPercent);
  output.step = "5";
  output.dataset.nodeUiViewSettingValue = "macroKnobSizeScale";
  output.value = input.value;
  input.addEventListener("input", () => {
    setNodeGraphMacroKnobSizeScale(Number(input.value) / 100);
    output.value = String(Math.round(nodeGraphMvp.macroKnobSizeScale * 100));
  });
  input.addEventListener("change", () => {
    setNodeGraphMacroKnobSizeScale(Number(input.value) / 100);
    output.value = String(Math.round(nodeGraphMvp.macroKnobSizeScale * 100));
  });
  output.addEventListener("input", () => {
    setNodeGraphMacroKnobSizeScale(Number(output.value) / 100);
    input.value = String(Math.round(nodeGraphMvp.macroKnobSizeScale * 100));
  });
  output.addEventListener("change", () => {
    setNodeGraphMacroKnobSizeScale(Number(output.value) / 100);
    output.value = String(Math.round(nodeGraphMvp.macroKnobSizeScale * 100));
    input.value = output.value;
  });
  row.append(title, input, output);
  return row;
}

function createNodeUserUiSettingsMacroKnobHitboxOutlineControl() {
  return createNodeUserUiSettingsViewCheckbox({
    key: "macroKnobHitboxOutlineVisible",
    label: "Show macro knob hit-box outline",
    getValue: () => Boolean(nodeGraphMvp.macroKnobHitboxOutlineVisible),
    setValue: (visible) => {
      setNodeGraphMacroKnobHitboxOutlineVisible(visible);
    },
  });
}

function createNodeUserUiSettingsSelect({ key, label, options, getValue, setValue }) {
  const row = document.createElement("label");
  row.className = "node-user-ui-setting-control select";
  const title = document.createElement("span");
  title.textContent = label;
  const select = document.createElement("select");
  select.dataset.nodeUiViewSetting = key;
  for (const option of options) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    select.append(optionElement);
  }
  select.value = getValue();
  select.addEventListener("change", () => {
    setValue(select.value);
  });
  row.append(title, select);
  return row;
}

const nodeGraphMacroKnobPositionOptions = Object.freeze([
  { value: "top", label: "Top" },
  { value: "mid", label: "Mid" },
  { value: "bottom", label: "Bottom" },
]);

// Deliberately no logic to keep label/value/dial apart -- any combination
// (including all three on "mid") is allowed and just overlaps.
function createNodeUserUiSettingsMacroKnobLabelPositionControl() {
  return createNodeUserUiSettingsSelect({
    key: "macroKnobLabelPosition",
    label: "Macro knob label position",
    options: nodeGraphMacroKnobPositionOptions,
    getValue: () => normalizeNodeGraphMacroKnobLabelPosition(nodeGraphMvp.macroKnobLabelPosition),
    setValue: (value) => setNodeGraphMacroKnobLabelPosition(value),
  });
}

function createNodeUserUiSettingsMacroKnobValuePositionControl() {
  return createNodeUserUiSettingsSelect({
    key: "macroKnobValuePosition",
    label: "Macro knob value position",
    options: nodeGraphMacroKnobPositionOptions,
    getValue: () => normalizeNodeGraphMacroKnobValuePosition(nodeGraphMvp.macroKnobValuePosition),
    setValue: (value) => setNodeGraphMacroKnobValuePosition(value),
  });
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

// Everything in this panel is whatever UI Dev controls have their "Expose in
// UI settings" checkbox checked, grouped by the same sections UI Dev itself
// uses (see nodeUiDevSettingSections). Knob style used to be pinned here
// always-on; it now lives in UI Dev with the rest of the builder-level knobs
// (see renderNodeUiDevHelperViewControls) and is no longer user-exposed.
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
// Visibility on/off toggles (Grid, Grid Light, Wire Lengths, Wires Above,
// Displays, Sliders, Buttons, Control Surfaces, Amount/Position slider, Debug)
// live ONLY in the Visibility menu — never duplicated here.
// Guarded by a dataset flag so repeated helper opens don't duplicate sections.
function renderNodeUiDevHelperViewControls() {
  const helperBody = document.querySelector(".node-ui-dev-helper-body");
  if (!helperBody || helperBody.dataset.viewControlsMounted === "true") {
    return;
  }
  const knobSection = createNodeUserUiSettingsSection("knob style", [
    createNodeUserUiSettingsMacroKnobArcThicknessControl(),
    createNodeUserUiSettingsMacroKnobArcGapBrightnessControl(),
    createNodeUserUiSettingsMacroKnobSizeControl(),
    createNodeUserUiSettingsMacroKnobHitboxOutlineControl(),
    createNodeUserUiSettingsMacroKnobLabelPositionControl(),
    createNodeUserUiSettingsMacroKnobValuePositionControl(),
  ]);
  // Tuning + layout only — not the same on/off flags as Visibility.
  const moduleSection = createNodeUserUiSettingsSection("modules and nodes view", [
    createNodeUserUiSettingsModuleScopeBrightnessControl(),
    createNodeUserUiSettingsModuleScopeLineThicknessControl(),
    createNodeUserUiSettingsModuleScopeFramesPerSecondControl(),
    createNodeUserUiSettingsSliderLayoutControl(),
  ]);
  for (const section of [moduleSection, knobSection]) {
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
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='macroKnobSizeScale']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(Math.round(normalizeNodeGraphMacroKnobSizeScale(nodeGraphMvp.macroKnobSizeScale ?? 1) * 100));
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting-value='macroKnobSizeScale']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.value = String(Math.round(normalizeNodeGraphMacroKnobSizeScale(nodeGraphMvp.macroKnobSizeScale ?? 1) * 100));
  }
  for (const input of document.querySelectorAll("[data-node-ui-view-setting='macroKnobHitboxOutlineVisible']")) {
    if (document.activeElement === input) {
      continue;
    }
    input.checked = Boolean(nodeGraphMvp.macroKnobHitboxOutlineVisible);
  }
  for (const select of document.querySelectorAll("[data-node-ui-view-setting='macroKnobLabelPosition']")) {
    if (document.activeElement === select) {
      continue;
    }
    select.value = normalizeNodeGraphMacroKnobLabelPosition(nodeGraphMvp.macroKnobLabelPosition);
  }
  for (const select of document.querySelectorAll("[data-node-ui-view-setting='macroKnobValuePosition']")) {
    if (document.activeElement === select) {
      continue;
    }
    select.value = normalizeNodeGraphMacroKnobValuePosition(nodeGraphMvp.macroKnobValuePosition);
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
