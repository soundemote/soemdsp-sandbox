// Keypad look lives in the shared Display Settings popover.
// Numeric rows reuse the Waveform / LED range sliders (.node-led-settings-row).
// Colors use Sound Color Widgets.

const NODE_GRAPH_KEYPAD_DISPLAY_SLIDER_FIELDS = Object.freeze([
  "textSize",
  "textWeight",
  "buttonWidth",
  "buttonHeight",
  "buttonSize",
  "padPx",
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
    : (typeof NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS !== "undefined"
      ? { ...NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS }
      : {
        buttonHeight: 1,
        buttonWidth: 1,
        textSize: 0.87708066581306,
        textWeight: 900,
      });
}

function buildNodeGraphKeypadDisplaySettingsBodyHtml() {
  const fontOptions = typeof nodeGraphAppFontOptionsHtml === "function"
    ? nodeGraphAppFontOptionsHtml()
    : ((typeof NODE_GRAPH_KEYPAD_FONTS !== "undefined" ? NODE_GRAPH_KEYPAD_FONTS : []).map((font) => {
      const escape = typeof nodeGraphDisplaySettingsEscapeHtml === "function"
        ? nodeGraphDisplaySettingsEscapeHtml
        : (value) => String(value ?? "");
      return `<option value="${escape(font.id)}">${escape(font.label)}</option>`;
    }).join(""));
  const escape = typeof nodeGraphDisplaySettingsEscapeHtml === "function"
    ? nodeGraphDisplaySettingsEscapeHtml
    : (value) => String(value ?? "");
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildColorRowHtml
    : () => "";
  const defaultLabels = typeof NODE_GRAPH_KEYPAD_LABELS_TEXT === "string"
    ? NODE_GRAPH_KEYPAD_LABELS_TEXT
    : "123456789*0#";
  return `
    <div class="node-led-display-settings-panel" data-keypad-display-settings-panel>
      <label class="node-led-settings-row">
        <span>Keys</span>
        <input type="text" spellcheck="false" autocomplete="off" data-keypad-labels value="${escape(defaultLabels)}" aria-label="Keypad characters, one per key" placeholder="${escape(defaultLabels)}">
      </label>
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
        <span>Square ratio</span>
        <input type="checkbox" data-keypad-check="squareRatio" aria-label="Square ratio">
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
        <input type="range" min="0" max="1" step="0.01" data-keypad-field="buttonSize" aria-label="Button size 0–1">
      </label>
      <label class="node-led-settings-row">
        <span>Pad</span>
        <input type="range" min="0" max="64" step="1" data-keypad-field="padPx" aria-label="Wall padding in pixels">
        <span>px</span>
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
      ${(typeof nodeGraphBuildImageAssetRowHtml === "function"
        ? nodeGraphBuildImageAssetRowHtml({ key: "background", label: "Background" })
        : "")}
      ${colorRow("buttonColor", "keypadFace")}
      ${colorRow("hoverColor", "keypadFace")}
      ${colorRow("downColor", "keypadFace")}
      ${colorRow("textColor", "keypadFace")}
      ${colorRow("strokeColor", "keypadFace")}
      <div class="node-keypad-image-slots" role="group" aria-label="Key images">
        ${((typeof NODE_GRAPH_KEYPAD_LABELS !== "undefined" ? NODE_GRAPH_KEYPAD_LABELS : ["1","2","3","4","5","6","7","8","9","*","0","#"])).map((label, slot) => (
          typeof nodeGraphBuildImageAssetRowHtml === "function"
            ? nodeGraphBuildImageAssetRowHtml({ key: `key-${slot}`, label })
            : ""
        )).join("")}
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
  const labels = root.querySelector?.("[data-keypad-labels]");
  if (labels && document.activeElement !== labels) {
    labels.value = String(
      settings.labels
      || NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS?.labels
      || NODE_GRAPH_KEYPAD_LABELS_TEXT
      || "123456789*0#",
    );
  }
  const font = root.querySelector?.(`[data-trace-display-choice="font"]`);
  if (font) {
    font.value = String(settings.font || NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS?.font || "thasadith");
  }
  const square = root.querySelector?.(`[data-keypad-check="squareRatio"]`);
  if (square) {
    square.checked = settings.squareRatio !== false;
  }
  const corner = settings.cornerShape === "pill" ? "pill" : "squircle";
  for (const button of root.querySelectorAll?.("[data-keypad-corner]") || []) {
    const on = button.getAttribute("data-keypad-corner") === corner;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  }
  if (typeof nodeGraphSyncImageAssetRow === "function") {
    nodeGraphSyncImageAssetRow(root, "background", settings.backgroundImage);
    const images = Array.isArray(settings.keyImages) ? settings.keyImages : [];
    for (let slot = 0; slot < images.length; slot += 1) {
      nodeGraphSyncImageAssetRow(root, `key-${slot}`, images[slot]);
    }
  }
}

function bindNodeGraphKeypadDisplaySettingsBody(host) {
  if (!host || host.dataset.keypadSettingsBound === "true") {
    return;
  }
  host.dataset.keypadSettingsBound = "true";
  if (typeof nodeGraphBindImageAssetClicks === "function") {
    nodeGraphBindImageAssetClicks(host, (key, action) => {
      if (key === "background") {
        if (action === "load" && typeof pickNodeGraphKeypadBackgroundImage === "function") {
          pickNodeGraphKeypadBackgroundImage();
        } else if (action === "save") {
          const nodeId = typeof nodeGraphKeypadTargetNodeId === "function" ? nodeGraphKeypadTargetNodeId() : "";
          const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
          const layout = typeof normalizeNodeGraphKeypadLayout === "function"
            ? normalizeNodeGraphKeypadLayout(node?.layout)
            : node?.layout;
          if (typeof nodeGraphSaveImageAsset === "function") {
            nodeGraphSaveImageAsset(layout?.backgroundImage, "keypad-background");
          }
        } else if (action === "clear" && typeof commitNodeGraphKeypadBackgroundImage === "function") {
          commitNodeGraphKeypadBackgroundImage(null);
        }
        return;
      }
      const slot = Number(String(key || "").replace(/^key-/, ""));
      if (!Number.isFinite(slot)) {
        return;
      }
      if (action === "load" && typeof pickNodeGraphKeypadKeyImage === "function") {
        pickNodeGraphKeypadKeyImage(slot);
      } else if (action === "save") {
        const nodeId = typeof nodeGraphKeypadTargetNodeId === "function" ? nodeGraphKeypadTargetNodeId() : "";
        const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
        const layout = typeof normalizeNodeGraphKeypadLayout === "function"
          ? normalizeNodeGraphKeypadLayout(node?.layout)
          : node?.layout;
        if (typeof nodeGraphSaveImageAsset === "function") {
          nodeGraphSaveImageAsset(layout?.keyImages?.[slot], `keypad-${slot + 1}`);
        }
      } else if (action === "clear" && typeof commitNodeGraphKeypadKeyImage === "function") {
        commitNodeGraphKeypadKeyImage(slot, null);
      }
    });
  }
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-keypad-field], [data-keypad-labels]")) {
      apply("none", false);
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-keypad-field], [data-keypad-labels], [data-keypad-check], [data-trace-display-choice]")) {
      apply("immediate", true);
    }
  });
  host.addEventListener("click", (event) => {
    const assetBtn = event.target?.closest?.("[data-image-asset-action]");
    if (assetBtn && host.contains(assetBtn)) {
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
