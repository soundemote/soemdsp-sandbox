// Limiter face: Gain (volume adjustment) as a simple history line.
// Reads the existing Gain output — does not change DSP.

const nodeGraphLimiterGainFaceSettingsDefaults = Object.freeze({
  historySeconds: 2,
  lineThickness: 2,
  hue: 42,
  lineBrightness: 0.5,
  backgroundColor: "#020407",
});

function normalizeNodeGraphLimiterGainFaceSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const historyRaw = Number(source.historySeconds ?? source.history);
  const thicknessRaw = Number(source.lineThickness ?? source.thickness);
  const hueRaw = Number(source.hue);
  const brightRaw = Number(source.lineBrightness ?? source.brightness);
  const maxHistory = Number(typeof nodeGraphTraceDisplayMaxZoomSeconds !== "undefined"
    ? nodeGraphTraceDisplayMaxZoomSeconds
    : 10);
  let backgroundColor = String(source.backgroundColor || source.background || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(backgroundColor)) {
    backgroundColor = nodeGraphLimiterGainFaceSettingsDefaults.backgroundColor;
  }
  return {
    historySeconds: Number.isFinite(historyRaw)
      ? Math.max(0.05, Math.min(maxHistory, historyRaw))
      : nodeGraphLimiterGainFaceSettingsDefaults.historySeconds,
    lineThickness: Number.isFinite(thicknessRaw)
      ? Math.max(0.5, Math.min(12, thicknessRaw))
      : nodeGraphLimiterGainFaceSettingsDefaults.lineThickness,
    hue: Number.isFinite(hueRaw)
      ? ((hueRaw % 360) + 360) % 360
      : nodeGraphLimiterGainFaceSettingsDefaults.hue,
    lineBrightness: Number.isFinite(brightRaw)
      ? Math.max(0, Math.min(1, brightRaw))
      : nodeGraphLimiterGainFaceSettingsDefaults.lineBrightness,
    backgroundColor: backgroundColor.toLowerCase(),
  };
}

function nodeGraphLimiterGainFaceSettingsForNode(node) {
  return normalizeNodeGraphLimiterGainFaceSettings(node?.traceDisplaySettings);
}

function buildNodeGraphLimiterGainDisplaySettingsBodyHtml() {
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildColorRowHtml("backgroundColor", "limiterGainFace")
    : "";
  return `
    <div class="node-led-display-settings-panel" data-limiter-gain-display-settings-panel>
      <label class="node-led-settings-row">
        <span>History</span>
        <input type="range" min="0.05" max="10" step="0.05" data-limiter-gain-field="historySeconds" aria-label="Limiter gain history in seconds">
        <span>s</span>
      </label>
      <label class="node-led-settings-row">
        <span>Line thickness</span>
        <input type="range" min="0.5" max="12" step="0.25" data-limiter-gain-field="lineThickness" aria-label="Limiter gain line thickness">
        <span>px</span>
      </label>
      <label class="node-led-settings-row">
        <span>Line hue</span>
        <input type="range" min="0" max="360" step="1" data-limiter-gain-field="hue" aria-label="Limiter gain line hue">
      </label>
      <label class="node-led-settings-row">
        <span>Line brightness</span>
        <input type="range" min="0" max="1" step="0.01" data-limiter-gain-field="lineBrightness" aria-label="Limiter gain line brightness">
      </label>
      ${colorRow}
    </div>`;
}

function syncNodeGraphLimiterGainDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  const setRange = (key, value) => {
    const el = root.querySelector?.(`[data-limiter-gain-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = String(value);
    }
  };
  setRange("historySeconds", settings.historySeconds);
  setRange("lineThickness", settings.lineThickness);
  setRange("hue", settings.hue);
  setRange("lineBrightness", settings.lineBrightness);
  const color = root.querySelector?.(`[data-trace-display-color="backgroundColor"]`);
  if (color) {
    color.value = settings.backgroundColor;
  }
}

function bindNodeGraphLimiterGainDisplaySettingsBody(host) {
  if (!host || host.dataset.limiterGainSettingsBound === "true") {
    return;
  }
  host.dataset.limiterGainSettingsBound = "true";
  const apply = (persist) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty([
        "historySeconds",
        "lineThickness",
        "hue",
        "lineBrightness",
        "backgroundColor",
      ]);
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record: persist === "immediate" });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-limiter-gain-field]")) {
      apply("debounce");
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-limiter-gain-field]")) {
      apply("immediate");
    }
  });
  if (typeof bindNodeGraphNativeSliderModifiers === "function") {
    const defaults = nodeGraphLimiterGainFaceSettingsDefaults;
    for (const [key, fallback] of Object.entries({
      historySeconds: defaults.historySeconds,
      lineThickness: defaults.lineThickness,
      hue: defaults.hue,
      lineBrightness: defaults.lineBrightness,
    })) {
      const input = host.querySelector(`[data-limiter-gain-field="${key}"]`);
      if (input) {
        bindNodeGraphNativeSliderModifiers(input, fallback);
      }
    }
  }
}

function nodeGraphLimiterGainFaceLineCss(settings) {
  const hue = Number(settings?.hue);
  const brightness = Number(settings?.lineBrightness);
  if (typeof nodeGraphHueBrightnessCss === "function") {
    return nodeGraphHueBrightnessCss(
      Number.isFinite(hue) ? hue : nodeGraphLimiterGainFaceSettingsDefaults.hue,
      Number.isFinite(brightness) ? brightness : nodeGraphLimiterGainFaceSettingsDefaults.lineBrightness,
    );
  }
  return `hsl(${Number.isFinite(hue) ? hue : 42} 90% 55%)`;
}

function drawNodeGraphLimiterGainFaceItem(_renderer, item, pixelRatio) {
  const slot = item?.slot;
  const screenElement = item?.screenElement || slot?.scopeElement;
  if (!slot || !screenElement) {
    return;
  }
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(screenElement)
  ) {
    return;
  }
  const canvas = typeof nodeGraphModuleScopeLocalFallbackCanvas === "function"
    ? nodeGraphModuleScopeLocalFallbackCanvas(slot)
    : null;
  if (
    !canvas
    || typeof syncNodeGraphModuleScopeLocalFallbackCanvas !== "function"
    || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)
  ) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(slot)
    : (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(slot.nodeId) : null);
  const settings = nodeGraphLimiterGainFaceSettingsForNode(node);
  const bg = settings.backgroundColor || nodeGraphLimiterGainFaceSettingsDefaults.backgroundColor;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const buffer = item?.buffer;
  const available = typeof nodeGraphScopeAvailableSampleCount === "function"
    ? nodeGraphScopeAvailableSampleCount(buffer)
    : (buffer?.length || 0);
  const rate = typeof nodeGraphScopeSampleRate === "function"
    ? nodeGraphScopeSampleRate(buffer)
    : 12000;
  const want = Math.max(2, Math.ceil(Math.max(0.05, settings.historySeconds) * Math.max(1, rate)));
  const count = Math.min(available, want);
  const start = Math.max(0, (buffer?.length || 0) - count);
  const columns = Math.max(2, w);
  ctx.beginPath();
  if (!buffer?.length || count < 2) {
    const y = 0.5;
    ctx.moveTo(0.5, y);
    ctx.lineTo(w - 0.5, y);
  } else {
    for (let x = 0; x < columns; x += 1) {
      const t = columns <= 1 ? 0 : x / (columns - 1);
      const index = start + Math.min(count - 1, Math.floor(t * (count - 1)));
      const gain = Math.max(0, Math.min(1, Number(buffer[index]) || 0));
      const y = (1 - gain) * (h - 1) + 0.5;
      if (x === 0) {
        ctx.moveTo(x + 0.5, y);
      } else {
        ctx.lineTo(x + 0.5, y);
      }
    }
  }
  const dpr = Math.max(1, Number(pixelRatio) || 1);
  ctx.strokeStyle = nodeGraphLimiterGainFaceLineCss(settings);
  ctx.lineWidth = Math.max(1, settings.lineThickness * dpr);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  let latest = 1;
  if (buffer?.length) {
    latest = Math.max(0, Math.min(1, Number(buffer[buffer.length - 1]) || 0));
  }
  const reduction = 1 - latest;
  if (typeof nodeGraphModuleScopeMarkScreenLit === "function") {
    nodeGraphModuleScopeMarkScreenLit(screenElement, Math.max(0.12, 0.18 + reduction * 0.75));
  }
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.limiterGainFace = drawNodeGraphLimiterGainFaceItem;
}
