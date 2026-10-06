// Arp Keys face look — Display Settings popover.
// Stroke / font: LED hue-title steppers (black → full hue @ 0.5 → white).
// Corners / Rounding / Edge Spacing: Music Player plate chrome.

function nodeGraphArpKeysHueHex(hueDeg, fallback = 165) {
  if (typeof nodeGraphHueUnitHex === "function") {
    return nodeGraphHueUnitHex(Number.isFinite(Number(hueDeg)) ? Number(hueDeg) : fallback);
  }
  return "#3dffd0";
}

const NODE_GRAPH_ARP_KEYS_DISPLAY_DEFAULTS = Object.freeze({
  strokeColor: nodeGraphArpKeysHueHex(165),
  strokeBrightness: 0.5,
  // Fraction of the face's short side. 0 is a 1px hairline. Grows with the
  // module and the canvas tile; workspace zoom scales the bitmap with the face.
  strokeThickness: 0.01,
  fontColor: nodeGraphArpKeysHueHex(165),
  fontBrightness: 0.5,
  inactiveFillColor: "#000000",
  inactiveFillBrightness: 0,
  activeFillColor: nodeGraphArpKeysHueHex(165),
  activeFillBrightness: 0.5,
  inactiveTextColor: nodeGraphArpKeysHueHex(165),
  inactiveTextBrightness: 0.5,
  activeTextColor: "#000000",
  activeTextBrightness: 0,
  previousColor: nodeGraphArpKeysHueHex(165),
  previousBrightness: 0.28,
  previousFadeSeconds: 0.5,
  // Music Player: "square" button is labeled Pill (CSS corner-shape: round).
  cornerShape: "squircle",
  cornerRadius: 0,
  edgeSpacing: 0.05,
});

const NODE_GRAPH_GRAVITY_WALKER_DISPLAY_DEFAULTS = Object.freeze({
  ...NODE_GRAPH_ARP_KEYS_DISPLAY_DEFAULTS,
  strokeColor: "#ff0000",
  fontColor: "#ff0000",
  activeFillColor: "#ff0000",
  inactiveTextColor: "#ff0000",
  previousColor: "#ff0000",
});

const NODE_GRAPH_ARP_KEYS_HUE_PAIRS = Object.freeze([
  ["strokeBrightness", "strokeColor"],
  ["fontBrightness", "fontColor"],
  ["inactiveFillBrightness", "inactiveFillColor"],
  ["activeFillBrightness", "activeFillColor"],
  ["inactiveTextBrightness", "inactiveTextColor"],
  ["activeTextBrightness", "activeTextColor"],
  ["previousBrightness", "previousColor"],
]);

function nodeGraphArpKeysClampFade(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(8, n));
}

function nodeGraphArpKeysClamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphArpKeysNormalizeColor(value, fallbackHex) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{3}$/.test(raw)) {
    return raw;
  }
  return fallbackHex;
}

function normalizeNodeGraphArpKeysSettings(settings, defaults = NODE_GRAPH_ARP_KEYS_DISPLAY_DEFAULTS) {
  const d = defaults;
  const src = settings && typeof settings === "object" ? settings : {};
  const shape = String(src.cornerShape || "").trim().toLowerCase();
  return {
    strokeColor: nodeGraphArpKeysNormalizeColor(src.strokeColor, d.strokeColor),
    strokeBrightness: nodeGraphArpKeysClamp01(src.strokeBrightness, d.strokeBrightness),
    strokeThickness: nodeGraphArpKeysClamp01(src.strokeThickness, d.strokeThickness),
    fontColor: nodeGraphArpKeysNormalizeColor(src.fontColor, d.fontColor),
    fontBrightness: nodeGraphArpKeysClamp01(src.fontBrightness, d.fontBrightness),
    inactiveFillColor: nodeGraphArpKeysNormalizeColor(src.inactiveFillColor, d.inactiveFillColor),
    inactiveFillBrightness: nodeGraphArpKeysClamp01(src.inactiveFillBrightness, d.inactiveFillBrightness),
    activeFillColor: nodeGraphArpKeysNormalizeColor(
      src.activeFillColor != null ? src.activeFillColor : src.strokeColor,
      d.activeFillColor,
    ),
    activeFillBrightness: nodeGraphArpKeysClamp01(
      src.activeFillBrightness != null ? src.activeFillBrightness : src.strokeBrightness,
      d.activeFillBrightness,
    ),
    inactiveTextColor: nodeGraphArpKeysNormalizeColor(
      src.inactiveTextColor != null ? src.inactiveTextColor : src.fontColor,
      d.inactiveTextColor,
    ),
    inactiveTextBrightness: nodeGraphArpKeysClamp01(
      src.inactiveTextBrightness != null ? src.inactiveTextBrightness : src.fontBrightness,
      d.inactiveTextBrightness,
    ),
    activeTextColor: nodeGraphArpKeysNormalizeColor(
      src.activeTextColor != null
        ? src.activeTextColor
        : (nodeGraphArpKeysClamp01(src.strokeBrightness, d.strokeBrightness) >= 0.4 ? "#000000" : "#ffffff"),
      d.activeTextColor,
    ),
    activeTextBrightness: nodeGraphArpKeysClamp01(
      src.activeTextBrightness != null
        ? src.activeTextBrightness
        : (nodeGraphArpKeysClamp01(src.strokeBrightness, d.strokeBrightness) >= 0.4 ? 0 : 1),
      d.activeTextBrightness,
    ),
    previousColor: nodeGraphArpKeysNormalizeColor(
      src.previousColor != null ? src.previousColor : src.strokeColor,
      d.previousColor,
    ),
    previousBrightness: nodeGraphArpKeysClamp01(src.previousBrightness, d.previousBrightness),
    previousFadeSeconds: nodeGraphArpKeysClampFade(src.previousFadeSeconds, d.previousFadeSeconds),
    cornerShape: shape === "square" ? "square" : "squircle",
    cornerRadius: nodeGraphArpKeysClamp01(src.cornerRadius, d.cornerRadius),
    edgeSpacing: nodeGraphArpKeysClamp01(src.edgeSpacing, d.edgeSpacing),
  };
}

function nodeGraphArpKeysSettingsForNode(node) {
  const defaults = node?.type === "gravityWalker"
    ? NODE_GRAPH_GRAVITY_WALKER_DISPLAY_DEFAULTS
    : NODE_GRAPH_ARP_KEYS_DISPLAY_DEFAULTS;
  return normalizeNodeGraphArpKeysSettings(node?.arpKeysSettings, defaults);
}

function nodeGraphArpKeysHueCss(colorHex, brightness, alpha = 1, fallbackHue = 165) {
  const hue = typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(colorHex)
    : fallbackHue;
  if (typeof nodeGraphHueBrightnessCss === "function") {
    return nodeGraphHueBrightnessCss(hue, brightness, alpha);
  }
  return colorHex || "#3dffd0";
}

function buildNodeGraphArpKeysDisplaySettingsBodyHtml() {
  const hueRow = (title, stepField, colorField, fallbackHue) => (
    typeof nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml === "function"
      ? nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
        title,
        stepField,
        colorField,
        formType: "arpKeysFace",
        defaultHueHex: nodeGraphArpKeysHueHex(fallbackHue, fallbackHue),
        titleAttr: `${title} brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.`,
      })
      : ""
  );
  const corners = typeof buildNodeGraphSampleWaveformCornerChromeHtml === "function"
    ? buildNodeGraphSampleWaveformCornerChromeHtml({
      squareId: "nodeArpKeysCornerSquareButton",
      squircleId: "nodeArpKeysCornerSquircleButton",
      radiusId: "nodeArpKeysCornerRadiusInput",
      spacingId: "nodeArpKeysEdgeSpacingInput",
    })
    : "";
  return `
    <div class="node-led-display-settings-panel" data-arp-keys-display-settings-panel>
      ${hueRow("Stroke", "strokeBrightness", "strokeColor", 165)}
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Stroke thickness</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeArpKeysStrokeThicknessInput" type="range" min="0" max="1" step="0.01" title="0 = 1px hairline. 1 = the short side of the face. Follows module size, canvas size, and zoom.">
        </span>
      </label>
      ${hueRow("Font", "fontBrightness", "fontColor", 165)}
      ${hueRow("Inactive fill", "inactiveFillBrightness", "inactiveFillColor", 0)}
      ${hueRow("Active fill", "activeFillBrightness", "activeFillColor", 165)}
      ${hueRow("Inactive text", "inactiveTextBrightness", "inactiveTextColor", 165)}
      ${hueRow("Active text", "activeTextBrightness", "activeTextColor", 0)}
      ${hueRow("Previously activated", "previousBrightness", "previousColor", 165)}
      <label class="node-led-settings-row node-sample-waveform-settings-row node-sample-waveform-tune-row">
        <span>Fadeout</span>
        <span class="node-sample-waveform-control-widgets">
          <input id="nodeArpKeysFadeSecondsInput" type="range" min="0" max="8" step="0.01" title="Seconds the previously activated fill takes to fade to the inactive fill. 0 is instant.">
        </span>
      </label>
      ${corners}
    </div>`;
}

function syncNodeGraphArpKeysDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  const s = normalizeNodeGraphArpKeysSettings(settings);
  for (const [brightKey, colorKey] of NODE_GRAPH_ARP_KEYS_HUE_PAIRS) {
    const bright = root.querySelector?.(`[data-trace-display-field="${brightKey}"]`);
    if (bright && document.activeElement !== bright) {
      bright.value = String(s[brightKey]);
    }
    const color = root.querySelector?.(`[data-trace-display-color="${colorKey}"]`);
    if (color) {
      color.value = s[colorKey];
    }
  }
  const setPressed = (id, active) => {
    const el = root.querySelector?.(`#${id}`) || document.getElementById(id);
    if (!el) {
      return;
    }
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  };
  setPressed("nodeArpKeysCornerSquareButton", s.cornerShape === "square");
  setPressed("nodeArpKeysCornerSquircleButton", s.cornerShape === "squircle");
  const radius = root.querySelector?.("#nodeArpKeysCornerRadiusInput")
    || document.getElementById("nodeArpKeysCornerRadiusInput");
  if (radius && document.activeElement !== radius) {
    radius.value = String(s.cornerRadius);
  }
  const spacing = root.querySelector?.("#nodeArpKeysEdgeSpacingInput")
    || document.getElementById("nodeArpKeysEdgeSpacingInput");
  if (spacing && document.activeElement !== spacing) {
    spacing.value = String(s.edgeSpacing);
  }
  const thickness = root.querySelector?.("#nodeArpKeysStrokeThicknessInput")
    || document.getElementById("nodeArpKeysStrokeThicknessInput");
  if (thickness && document.activeElement !== thickness) {
    thickness.value = String(s.strokeThickness);
  }
  const fade = root.querySelector?.("#nodeArpKeysFadeSecondsInput")
    || document.getElementById("nodeArpKeysFadeSecondsInput");
  if (fade && document.activeElement !== fade) {
    fade.value = String(s.previousFadeSeconds);
  }
  if (typeof syncNodeGraphHueTitleSteppers === "function") {
    syncNodeGraphHueTitleSteppers(root);
  }
}

function bindNodeGraphArpKeysDisplaySettingsBody(host) {
  if (!host || host.dataset.arpKeysSettingsBound === "true") {
    return;
  }
  host.dataset.arpKeysSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-trace-display-field], #nodeArpKeysCornerRadiusInput, #nodeArpKeysEdgeSpacingInput, #nodeArpKeysStrokeThicknessInput, #nodeArpKeysFadeSecondsInput")) {
      apply("none", false);
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-trace-display-field], [data-trace-display-color], #nodeArpKeysCornerRadiusInput, #nodeArpKeysEdgeSpacingInput, #nodeArpKeysStrokeThicknessInput, #nodeArpKeysFadeSecondsInput")) {
      apply("immediate", true);
    }
  });
  host.addEventListener("click", (event) => {
    const corner = event.target?.closest?.("[data-corner-shape]");
    if (!corner || !host.contains(corner)) {
      return;
    }
    event.preventDefault();
    const next = corner.getAttribute("data-corner-shape") === "square" ? "square" : "squircle";
    for (const button of host.querySelectorAll("[data-corner-shape]")) {
      const on = button.getAttribute("data-corner-shape") === next;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }
    apply("immediate", true);
  });
}

function readNodeGraphArpKeysDisplaySettingsForm(root, current) {
  const panel = root?.querySelector?.("[data-arp-keys-display-settings-panel]") || root;
  const next = { ...current };
  for (const [brightKey, colorKey] of NODE_GRAPH_ARP_KEYS_HUE_PAIRS) {
    const bright = panel?.querySelector?.(`[data-trace-display-field="${brightKey}"]`);
    if (bright) {
      next[brightKey] = Number(bright.value);
    }
    const color = panel?.querySelector?.(`[data-trace-display-color="${colorKey}"]`);
    if (color) {
      next[colorKey] = color.value;
    }
  }
  const radius = panel?.querySelector?.("#nodeArpKeysCornerRadiusInput")
    || document.getElementById("nodeArpKeysCornerRadiusInput");
  if (radius) {
    next.cornerRadius = Number(radius.value);
  }
  const spacing = panel?.querySelector?.("#nodeArpKeysEdgeSpacingInput")
    || document.getElementById("nodeArpKeysEdgeSpacingInput");
  if (spacing) {
    next.edgeSpacing = Number(spacing.value);
  }
  const thickness = panel?.querySelector?.("#nodeArpKeysStrokeThicknessInput")
    || document.getElementById("nodeArpKeysStrokeThicknessInput");
  if (thickness) {
    next.strokeThickness = Number(thickness.value);
  }
  const fade = panel?.querySelector?.("#nodeArpKeysFadeSecondsInput")
    || document.getElementById("nodeArpKeysFadeSecondsInput");
  if (fade) {
    next.previousFadeSeconds = Number(fade.value);
  }
  const squareOn = panel?.querySelector?.("#nodeArpKeysCornerSquareButton")?.classList.contains("active")
    || document.getElementById("nodeArpKeysCornerSquareButton")?.classList.contains("active");
  next.cornerShape = squareOn ? "square" : "squircle";
  return normalizeNodeGraphArpKeysSettings(next);
}
