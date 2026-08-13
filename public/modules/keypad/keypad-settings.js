// Keypad look lives in the shared Display Settings popover.
// Numeric rows reuse the Waveform / LED range sliders (.node-led-settings-row).
// Colors use Sound Color Widgets.

const NODE_GRAPH_KEYPAD_DISPLAY_SLIDER_FIELDS = Object.freeze([
  "textSize",
  "textWeight",
  "buttonWidth",
  "buttonHeight",
  "buttonSize",
  "rounding",
  "stroke",
]);

function nodeGraphKeypadDisplaySettingsForNode(node) {
  return typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout(node?.layout)
    : {};
}

function nodeGraphKeypadDisplaySliderDefaults() {
  return typeof normalizeNodeGraphKeypadLayout === "function"
    ? normalizeNodeGraphKeypadLayout()
    : {
      buttonHeight: 0.94,
      buttonWidth: 0.94,
      textSize: 0.55,
      textWeight: 400,
    };
}

function buildNodeGraphKeypadDisplaySettingsBodyHtml() {
  const fonts = typeof NODE_GRAPH_KEYPAD_FONTS !== "undefined" ? NODE_GRAPH_KEYPAD_FONTS : [];
  const escape = typeof nodeGraphDisplaySettingsEscapeHtml === "function"
    ? nodeGraphDisplaySettingsEscapeHtml
    : (value) => String(value ?? "");
  const fontOptions = fonts.map((font) => (
    `<option value="${escape(font.id)}">${escape(font.label)}</option>`
  )).join("");
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildColorRowHtml
    : () => "";
  return `
    <div class="node-led-display-settings-panel" data-keypad-display-settings-panel>
      <label class="node-led-settings-row" data-trace-display-choice-row="font">
        <span>Font</span>
        <select data-trace-display-choice="font" id="nodeTraceDisplayKeypadFont" aria-label="Keypad font">
          ${fontOptions}
        </select>
      </label>
      <label class="node-led-settings-row">
        <span>Font size</span>
        <input type="range" min="0" max="1" step="0.01" data-keypad-field="textSize" aria-label="Font size 0–1">
      </label>
      <label class="node-led-settings-row">
        <span>Boldness</span>
        <input type="range" min="100" max="900" step="100" data-keypad-field="textWeight" aria-label="Font weight 100–900">
      </label>
      <label class="node-led-settings-row">
        <span>Button width</span>
        <input type="range" min="0" max="1" step="0.01" data-keypad-field="buttonWidth" aria-label="Button width 0–1">
      </label>
      <label class="node-led-settings-row">
        <span>Button height</span>
        <input type="range" min="0" max="1" step="0.01" data-keypad-field="buttonHeight" aria-label="Button height 0–1">
      </label>
      <label class="node-led-settings-row">
        <span>Button size</span>
        <input type="range" min="0" max="1" step="0.01" data-keypad-field="buttonSize" aria-label="Button size 0–1 square">
      </label>
      <div class="node-led-settings-row" role="group" aria-label="Button corner shape">
        <span>Corners</span>
        <button type="button" data-keypad-corner="pill" aria-pressed="false">Pill</button>
        <button type="button" data-keypad-corner="squircle" aria-pressed="true">Squircle</button>
      </div>
      <label class="node-led-settings-row">
        <span>Rounding</span>
        <input type="range" min="0" max="100" step="1" data-keypad-field="rounding" aria-label="Button rounding">
        <span>%</span>
      </label>
      <label class="node-led-settings-row">
        <span>Stroke</span>
        <input type="range" min="0" max="1" step="0.01" data-keypad-field="stroke" aria-label="Button stroke 0–1">
      </label>
      ${colorRow("backgroundColor", "keypadFace")}
      ${colorRow("buttonColor", "keypadFace")}
      ${colorRow("hoverColor", "keypadFace")}
      ${colorRow("downColor", "keypadFace")}
      ${colorRow("textColor", "keypadFace")}
      ${colorRow("strokeColor", "keypadFace")}
      <div class="node-keypad-image-slots" role="group" aria-label="Key images">
        ${((typeof NODE_GRAPH_KEYPAD_LABELS !== "undefined" ? NODE_GRAPH_KEYPAD_LABELS : ["1","2","3","4","5","6","7","8","9","*","0","#"])).map((label, slot) => `
        <div class="node-led-settings-row node-keypad-image-slot" data-keypad-image-slot="${slot}">
          <span>${escape(label)}</span>
          <button type="button" data-keypad-image-action="load" data-keypad-image-slot="${slot}">Load</button>
          <button type="button" data-keypad-image-action="clear" data-keypad-image-slot="${slot}">Clear</button>
          <small data-keypad-image-name="${slot}">—</small>
        </div>`).join("")}
      </div>
    </div>`;
}

function syncNodeGraphKeypadDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  for (const key of NODE_GRAPH_KEYPAD_DISPLAY_SLIDER_FIELDS) {
    const el = root.querySelector?.(`[data-keypad-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = String(settings[key] ?? "");
    }
  }
  const font = root.querySelector?.(`[data-trace-display-choice="font"]`);
  if (font) {
    font.value = String(settings.font || "poiret-one");
  }
  const corner = settings.cornerShape === "pill" ? "pill" : "squircle";
  for (const button of root.querySelectorAll?.("[data-keypad-corner]") || []) {
    const on = button.getAttribute("data-keypad-corner") === corner;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  }
  const images = Array.isArray(settings.keyImages) ? settings.keyImages : [];
  for (const nameEl of root.querySelectorAll?.("[data-keypad-image-name]") || []) {
    const slot = Number(nameEl.getAttribute("data-keypad-image-name"));
    const file = images[slot]?.fileName || (images[slot]?.dataUrl ? "image" : "");
    nameEl.textContent = file || "—";
    nameEl.title = file || "no image";
  }
}

function bindNodeGraphKeypadDisplaySettingsBody(host) {
  if (!host || host.dataset.keypadSettingsBound === "true") {
    return;
  }
  host.dataset.keypadSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-keypad-field]")) {
      apply("none", false);
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-keypad-field], [data-trace-display-choice]")) {
      apply("immediate", true);
    }
  });
  host.addEventListener("click", (event) => {
    const imageBtn = event.target?.closest?.("[data-keypad-image-action]");
    if (imageBtn && host.contains(imageBtn)) {
      event.preventDefault();
      const slot = Number(imageBtn.getAttribute("data-keypad-image-slot"));
      const action = imageBtn.getAttribute("data-keypad-image-action");
      if (action === "clear" && typeof commitNodeGraphKeypadKeyImage === "function") {
        commitNodeGraphKeypadKeyImage(slot, null);
        apply("immediate", true);
      } else if (action === "load" && typeof pickNodeGraphKeypadKeyImage === "function") {
        pickNodeGraphKeypadKeyImage(slot);
      }
      return;
    }
    const corner = event.target?.closest?.("[data-keypad-corner]");
    if (!corner || !host.contains(corner)) {
      return;
    }
    event.preventDefault();
    const next = corner.getAttribute("data-keypad-corner") === "pill" ? "pill" : "squircle";
    for (const button of host.querySelectorAll("[data-keypad-corner]")) {
      const on = button.getAttribute("data-keypad-corner") === next;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }
    apply("immediate", true);
  });
  const defaults = nodeGraphKeypadDisplaySliderDefaults();
  if (typeof bindNodeGraphNativeSliderModifiers === "function") {
    for (const key of NODE_GRAPH_KEYPAD_DISPLAY_SLIDER_FIELDS) {
      const input = host.querySelector(`[data-keypad-field="${key}"]`);
      if (input) {
        bindNodeGraphNativeSliderModifiers(input, defaults[key]);
      }
    }
  }
}

function applyNodeGraphKeypadDisplaySettingsToFace(node) {
  if (!node?.id || typeof syncNodeGraphKeypadElement !== "function") {
    return;
  }
  const el = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(node.id)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(node.id))}"]`);
  if (el) {
    syncNodeGraphKeypadElement(el, node);
  }
}
