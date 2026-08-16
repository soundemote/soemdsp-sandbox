// Text Box look lives in the shared Display Settings popover.
// Numeric rows reuse the Waveform / LED range sliders (.node-led-settings-row).
// Colors use Sound Color Widgets. Titles live inside the widget (Bg / Text).

const NODE_GRAPH_TEXT_BOX_DISPLAY_SLIDER_FIELDS = Object.freeze([
  "textSizePercent",
  "verticalAlignPercent",
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
      verticalAlignPercent: 0,
    };
}

function buildNodeGraphTextBoxDisplaySettingsBodyHtml() {
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildColorRowHtml
    : () => "";
  return `
    <div class="node-led-display-settings-panel" data-textbox-display-settings-panel>
      <div class="node-led-settings-row" role="group" aria-label="Text mode">
        <span>Mode</span>
        <button type="button" data-textbox-mode="singleLine" aria-pressed="true">Single</button>
        <button type="button" data-textbox-mode="multiline" aria-pressed="false">Multi</button>
      </div>
      <div class="node-led-settings-row" role="group" aria-label="Horizontal align">
        <span>Align</span>
        <button type="button" data-textbox-align="left" aria-pressed="false">Left</button>
        <button type="button" data-textbox-align="center" aria-pressed="true">Center</button>
        <button type="button" data-textbox-align="right" aria-pressed="false">Right</button>
      </div>
      <label class="node-led-settings-row">
        <span>Vertical</span>
        <input type="range" min="-100" max="100" step="1" data-textbox-field="verticalAlignPercent" aria-label="Vertical position −100–100">
        <span>%</span>
      </label>
      <label class="node-led-settings-row">
        <span>Size</span>
        <input type="range" min="50" max="1000" step="10" data-textbox-field="textSizePercent" aria-label="Text size 50–1000 percent">
        <span>%</span>
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
    const el = root.querySelector?.(`[data-textbox-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = String(settings[key] ?? "");
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
    if (event.target?.closest?.("[data-textbox-field]")) {
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
  const defaults = nodeGraphTextBoxDisplaySliderDefaults();
  if (typeof bindNodeGraphNativeSliderModifiers === "function") {
    for (const key of NODE_GRAPH_TEXT_BOX_DISPLAY_SLIDER_FIELDS) {
      const input = host.querySelector(`[data-textbox-field="${key}"]`);
      if (input) {
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
