// Text Box look lives in the shared Display Settings popover.
// Range rows reuse Waveform / LED (.node-led-settings-row).
// Layout: two-column grid (label | controls) scoped to this panel only.
// Background alpha reuses the app-wide scrub number (data-unit-stepper-drag),
// same interaction family as top-bar BPM and Display Settings unit fields.
// Colors use Sound Color Widgets. Titles live inside the widget (Bg / Text).

const NODE_GRAPH_TEXT_BOX_DISPLAY_SLIDER_FIELDS = Object.freeze([
  "textSizePercent",
  "textWeight",
  "lineHeight",
  "verticalAlignPercent",
]);

/** Scrubbable editable numbers -- same data-unit-stepper-drag family as BPM-style 0..1 fields. */
const NODE_GRAPH_TEXT_BOX_DISPLAY_SCRUB_FIELDS = Object.freeze([
  "backgroundAlpha",
]);

function nodeGraphTextBoxDisplaySettingsForNode(node) {
  return typeof normalizeNodeGraphTextBoxLayout === "function"
    ? normalizeNodeGraphTextBoxLayout(node?.layout)
    : {};
}

function nodeGraphTextBoxDisplaySliderDefaults() {
  return typeof normalizeNodeGraphTextBoxLayout === "function"
    ? normalizeNodeGraphTextBoxLayout()
    : {
      textSizePercent: 100,
      textWeight: typeof NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_WEIGHT === "number"
        ? NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_WEIGHT
        : 400,
      backgroundAlpha: typeof NODE_GRAPH_TEXT_BOX_DEFAULT_BACKGROUND_ALPHA === "number"
        ? NODE_GRAPH_TEXT_BOX_DEFAULT_BACKGROUND_ALPHA
        : 0.78,
      lineHeight: typeof NODE_GRAPH_TEXT_BOX_DEFAULT_LINE_HEIGHT === "number"
        ? NODE_GRAPH_TEXT_BOX_DEFAULT_LINE_HEIGHT
        : 1.2,
      verticalAlignPercent: 50,
    };
}

function nodeGraphTextBoxFormatBackgroundAlpha(value) {
  if (typeof normalizeNodeGraphTextBoxBackgroundAlpha === "function") {
    return String(normalizeNodeGraphTextBoxBackgroundAlpha(value));
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "0.78";
  }
  return String(Math.max(0, Math.min(1, Number((Math.round(n * 100) / 100).toFixed(2)))));
}

function buildNodeGraphTextBoxDisplaySettingsBodyHtml() {
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildColorRowHtml
    : () => "";
  const fontOptions = typeof nodeGraphAppFontOptionsHtml === "function"
    ? nodeGraphAppFontOptionsHtml()
    : "";
  // Inline Boldness (same as nodeGraphAppFontWeightSettingsRowHtml) so we can
  // wrap the range in .textbox-display-controls for the two-column grid.
  const boldnessRow = `
      <label class="node-led-settings-row textbox-display-settings-row">
        <span>Boldness</span>
        <div class="textbox-display-controls">
          <input type="range" min="100" max="900" step="100" data-textbox-field="textWeight" aria-label="Font weight 100–900">
        </div>
      </label>`;
  return `
    <div class="node-led-display-settings-panel" data-textbox-display-settings-panel>
      <div class="node-led-settings-row textbox-display-settings-row" role="group" aria-label="Text mode">
        <span>Mode</span>
        <div class="textbox-display-controls">
          <button type="button" data-textbox-mode="singleLine" aria-pressed="true">Single</button>
          <button type="button" data-textbox-mode="multiline" aria-pressed="false">Multi</button>
        </div>
      </div>
      <div class="node-led-settings-row textbox-display-settings-row" role="group" aria-label="Horizontal align">
        <span>Align</span>
        <div class="textbox-display-controls">
          <button type="button" data-textbox-align="left" aria-pressed="false">Left</button>
          <button type="button" data-textbox-align="center" aria-pressed="true">Center</button>
          <button type="button" data-textbox-align="right" aria-pressed="false">Right</button>
        </div>
      </div>
      <label class="node-led-settings-row textbox-display-settings-row" data-trace-display-choice-row="font">
        <span>Font</span>
        <div class="textbox-display-controls">
          <select data-trace-display-choice="font" data-textbox-font aria-label="Text box font">
            ${fontOptions}
          </select>
        </div>
      </label>
      <label class="node-led-settings-row textbox-display-settings-row">
        <span>Vertical</span>
        <div class="textbox-display-controls">
          <input type="range" min="0" max="100" step="any" data-textbox-field="verticalAlignPercent" aria-label="Vertical position: 0 up, 50 natural, 100 down (±2 face heights)">
          <span>%</span>
        </div>
      </label>
      <label class="node-led-settings-row textbox-display-settings-row">
        <span>Size</span>
        <div class="textbox-display-controls">
          <input type="range" min="50" max="1000" step="10" data-textbox-field="textSizePercent" aria-label="Text size 50–1000 percent">
          <span>%</span>
        </div>
      </label>
      ${boldnessRow}
      <label class="node-led-settings-row textbox-display-settings-row">
        <span>Line height</span>
        <div class="textbox-display-controls">
          <input type="range" min="0.5" max="3" step="0.05" data-textbox-field="lineHeight" aria-label="Newline vertical spacing 0.5–3">
        </div>
      </label>
      <label class="node-led-settings-row textbox-display-settings-row">
        <span>Background alpha</span>
        <div class="textbox-display-controls">
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            inputmode="decimal"
            data-textbox-field="backgroundAlpha"
            data-unit-stepper-drag="true"
            data-unit-min="0"
            data-unit-max="1"
            readonly
            autocomplete="off"
            aria-label="Background alpha"
            title="Drag to adjust · double-click to type"
          >
        </div>
      </label>
      ${colorRow("backgroundColor", "textBoxFace")}
      ${colorRow("textColor", "textBoxFace")}
    </div>`;
}

function syncNodeGraphTextBoxDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  for (const key of NODE_GRAPH_TEXT_BOX_DISPLAY_SLIDER_FIELDS) {
    const value = String(settings[key] ?? "");
    const el = root.querySelector?.(`[data-textbox-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = value;
    }
  }
  for (const key of NODE_GRAPH_TEXT_BOX_DISPLAY_SCRUB_FIELDS) {
    const value = key === "backgroundAlpha"
      ? nodeGraphTextBoxFormatBackgroundAlpha(settings[key])
      : String(settings[key] ?? "");
    const el = root.querySelector?.(`[data-textbox-field="${key}"]`);
    if (el && document.activeElement !== el && !el.classList.contains("editing")) {
      el.value = value;
    }
    if (el) {
      // Live current value as help -- not a useless 0..1 range hint.
      el.title = value + " (drag to adjust, double-click to type)";
      el.setAttribute("aria-valuetext", value);
    }
  }
  const mode = settings.textMode === "multiline" ? "multiline" : "singleLine";
  for (const button of root.querySelectorAll?.("[data-textbox-mode]") || []) {
    const on = button.getAttribute("data-textbox-mode") === mode;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  }
  const align = settings.horizontalAlign === "left" || settings.horizontalAlign === "right"
    ? settings.horizontalAlign
    : "center";
  for (const button of root.querySelectorAll?.("[data-textbox-align]") || []) {
    const on = button.getAttribute("data-textbox-align") === align;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  }
  const font = root.querySelector?.(`[data-trace-display-choice="font"], [data-textbox-font]`);
  if (font) {
    const fallback = typeof NODE_GRAPH_TEXT_BOX_DEFAULT_FONT === "string"
      ? NODE_GRAPH_TEXT_BOX_DEFAULT_FONT
      : "cascadia-mono";
    font.value = String(settings.font || fallback);
  }
}

function bindNodeGraphTextBoxDisplaySettingsBody(host) {
  if (!host || host.dataset.textboxSettingsBound === "true") {
    return;
  }
  host.dataset.textboxSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-textbox-field]")) {
      apply("none", false);
    }
  });
  host.addEventListener("change", (event) => {
    const field = event.target?.closest?.("[data-textbox-field]");
    if (field?.getAttribute("data-textbox-field") === "backgroundAlpha") {
      // Number inputs accept out-of-range / over-precise text while editing;
      // commit the same 0.01-stepped value that the face and patch store use.
      field.value = nodeGraphTextBoxFormatBackgroundAlpha(field.value);
    }
    if (
      field
      || event.target?.closest?.(`[data-trace-display-choice="font"], [data-textbox-font]`)
    ) {
      apply("immediate", true);
    }
  });
  host.addEventListener("click", (event) => {
    const modeButton = event.target?.closest?.("[data-textbox-mode]");
    if (modeButton && host.contains(modeButton)) {
      event.preventDefault();
      const next = modeButton.getAttribute("data-textbox-mode");
      for (const button of host.querySelectorAll("[data-textbox-mode]")) {
        const on = button.getAttribute("data-textbox-mode") === next;
        button.classList.toggle("active", on);
        button.setAttribute("aria-pressed", String(on));
      }
      apply("immediate", true);
      return;
    }
    const alignButton = event.target?.closest?.("[data-textbox-align]");
    if (alignButton && host.contains(alignButton)) {
      event.preventDefault();
      const next = alignButton.getAttribute("data-textbox-align");
      for (const button of host.querySelectorAll("[data-textbox-align]")) {
        const on = button.getAttribute("data-textbox-align") === next;
        button.classList.toggle("active", on);
        button.setAttribute("aria-pressed", String(on));
      }
      apply("immediate", true);
    }
  });
  // Scrub number: drag via app-wide data-unit-stepper-drag; dblclick to type (BPM-style).
  host.addEventListener("dblclick", (event) => {
    const input = event.target?.closest?.("input[data-textbox-field][data-unit-stepper-drag]");
    if (!input || !host.contains(input)) {
      return;
    }
    input.readOnly = false;
    input.classList.add("editing");
    input.focus();
    input.select();
    event.preventDefault();
    event.stopPropagation();
  }, true);
  host.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute("data-unit-stepper-drag")) {
      return;
    }
    if (input.getAttribute("data-textbox-field") === "backgroundAlpha") {
      input.value = nodeGraphTextBoxFormatBackgroundAlpha(input.value);
    }
    input.readOnly = true;
    input.classList.remove("editing");
  }, true);
  host.addEventListener("keydown", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute("data-unit-stepper-drag")) {
      return;
    }
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      input.blur();
    }
  }, true);

  const defaults = nodeGraphTextBoxDisplaySliderDefaults();
  if (typeof bindNodeGraphNativeSliderModifiers === "function") {
    for (const key of NODE_GRAPH_TEXT_BOX_DISPLAY_SLIDER_FIELDS) {
      const input = host.querySelector(`[data-textbox-field="${key}"]`);
      // Range sliders only -- scrub numbers use unit-stepper-drag, not native-range modifiers.
      if (input && input.type === "range") {
        bindNodeGraphNativeSliderModifiers(input, defaults[key]);
      }
    }
  }
}

function applyNodeGraphTextBoxDisplaySettingsToFace(node) {
  if (!node?.id || typeof nodeGraphTextBoxHostSync !== "function") {
    return;
  }
  const el = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(node.id)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(node.id))}"]`);
  if (el) {
    nodeGraphTextBoxHostSync(el, node);
  }
}
