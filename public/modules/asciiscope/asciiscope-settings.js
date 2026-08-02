// Matrix Waterfall + Matrix Display — Display Settings bodies.
// Form types: matrixWaterfallFace | matrixDisplayFace

function nodeGraphMatrixFaceKindFromFormType(formType) {
  return formType === "matrixWaterfallFace" ? "waterfall" : "plate";
}

function nodeGraphMatrixStoreFromNode(node) {
  if (node?.type === "matrixWaterfall") {
    return typeof normalizeNodeGraphMatrixWaterfall === "function"
      ? normalizeNodeGraphMatrixWaterfall(node.matrixWaterfall || node.matrixDisplay)
      : { glyphTable: ".", renderStyle: "vector", gradientStops: null };
  }
  return typeof normalizeNodeGraphMatrixPlate === "function"
    ? normalizeNodeGraphMatrixPlate(node?.matrixDisplay)
    : { message: "READY", renderStyle: "vector", gradientStops: null };
}

function normalizeNodeGraphMatrixFaceSettings(settings = null, formType = null) {
  const kind = nodeGraphMatrixFaceKindFromFormType(
    formType || (typeof nodeGraphTraceDisplaySettingsFormType === "function"
      ? nodeGraphTraceDisplaySettingsFormType()
      : "matrixDisplayFace"),
  );
  if (kind === "waterfall") {
    return typeof normalizeNodeGraphMatrixWaterfall === "function"
      ? normalizeNodeGraphMatrixWaterfall(settings)
      : settings || {};
  }
  return typeof normalizeNodeGraphMatrixPlate === "function"
    ? normalizeNodeGraphMatrixPlate(settings)
    : settings || {};
}

function buildNodeGraphMatrixWaterfallDisplaySettingsBodyHtml() {
  return `
    <div class="node-matrix-face-settings-panel" data-matrix-face-settings-panel data-matrix-kind="waterfall">
      <div class="metadata-section-title node-trace-display-gradient-title">Gradient</div>
      <p class="node-matrix-face-settings-hint">
        Mono cell energy (black → white) remapped through this gradient.
      </p>
      <div class="metadata-field-section node-trace-display-gradient-section">
        <div
          id="nodeTraceDisplayGradientSelectorHost"
          class="node-gradient-selector-host node-shared-gradient-host node-spectrogram-gradient-host"
          data-gradient-selector-host
          data-shared-gradient-host
          data-spectrogram-gradient-host></div>
      </div>

      <div class="metadata-section-title">Render</div>
      <p class="node-matrix-face-settings-hint">
        Same grid and residual. Sharp = smooth sampling; Pixel = nearest/pixelated of the same image. Switching style does not wipe trails.
      </p>
      <div class="node-matrix-face-render-toggle" role="group" aria-label="Render style">
        <button type="button" class="node-matrix-face-tool" data-matrix-face-render="vector" aria-pressed="true">Sharp</button>
        <button type="button" class="node-matrix-face-tool" data-matrix-face-render="pixel" aria-pressed="false">Pixel</button>
      </div>

      <div class="metadata-section-title">Glyph table</div>
      <p class="node-matrix-face-settings-hint">
        Rain charset — one glyph per line (half-width katakana, digits, Latin).
      </p>
      <textarea
        class="node-matrix-face-glyph-table"
        data-matrix-face-field="glyphTable"
        spellcheck="false"
        autocomplete="off"
        rows="12"
        aria-label="Matrix glyph table"></textarea>
      <div class="node-matrix-face-settings-tools">
        <button type="button" class="node-matrix-face-tool" data-matrix-face-action="default-glyphs">Default glyphs</button>
        <button type="button" class="node-matrix-face-tool" data-matrix-face-action="clear-cells">Clear cells</button>
      </div>
    </div>`;
}

function buildNodeGraphMatrixDisplaySettingsBodyHtml() {
  return `
    <div class="node-matrix-face-settings-panel" data-matrix-face-settings-panel data-matrix-kind="plate">
      <div class="metadata-section-title node-trace-display-gradient-title">Gradient</div>
      <p class="node-matrix-face-settings-hint">
        Mono cell energy (black → white) remapped through this gradient.
      </p>
      <div class="metadata-field-section node-trace-display-gradient-section">
        <div
          id="nodeTraceDisplayGradientSelectorHost"
          class="node-gradient-selector-host node-shared-gradient-host node-spectrogram-gradient-host"
          data-gradient-selector-host
          data-shared-gradient-host
          data-spectrogram-gradient-host></div>
      </div>

      <div class="metadata-section-title">Render</div>
      <p class="node-matrix-face-settings-hint">
        Same grid and residual. Sharp = smooth sampling; Pixel = nearest/pixelated of the same image. Switching style does not wipe trails.
      </p>
      <div class="node-matrix-face-render-toggle" role="group" aria-label="Render style">
        <button type="button" class="node-matrix-face-tool" data-matrix-face-render="vector" aria-pressed="true">Sharp</button>
        <button type="button" class="node-matrix-face-tool" data-matrix-face-render="pixel" aria-pressed="false">Pixel</button>
      </div>

      <div class="metadata-section-title">Info message</div>
      <p class="node-matrix-face-settings-hint">
        Info mode plate text (sanitized to matrix glyph set). Bottom row can show live In value.
      </p>
      <textarea
        class="node-matrix-face-message"
        data-matrix-face-field="message"
        spellcheck="false"
        autocomplete="off"
        rows="5"
        aria-label="Matrix info message"></textarea>
      <div class="node-matrix-face-settings-tools">
        <button type="button" class="node-matrix-face-tool" data-matrix-face-action="default-message">Default message</button>
        <button type="button" class="node-matrix-face-tool" data-matrix-face-action="clear-cells">Clear cells</button>
      </div>
    </div>`;
}

// Shared entry used by module-scopes body builder
function buildNodeGraphMatrixFaceDisplaySettingsBodyHtml(formType) {
  if (formType === "matrixWaterfallFace") {
    return buildNodeGraphMatrixWaterfallDisplaySettingsBodyHtml();
  }
  return buildNodeGraphMatrixDisplaySettingsBodyHtml();
}

function syncNodeGraphMatrixFaceDisplaySettingsControls(root, settings) {
  if (!root || !settings) return;
  const style = typeof matrixNormalizeRenderStyle === "function"
    ? matrixNormalizeRenderStyle(settings.renderStyle)
    : (settings.renderStyle === "vector" ? "vector" : "pixel");
  for (const btn of root.querySelectorAll?.("[data-matrix-face-render]") || []) {
    const active = btn.getAttribute("data-matrix-face-render") === style;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  const glyph = root.querySelector?.('[data-matrix-face-field="glyphTable"]');
  if (glyph && document.activeElement !== glyph && settings.glyphTable != null) {
    glyph.value = settings.glyphTable || "";
  }
  const message = root.querySelector?.('[data-matrix-face-field="message"]');
  if (message && document.activeElement !== message && settings.message != null) {
    message.value = settings.message || "";
  }
}

function readNodeGraphMatrixFaceDisplaySettingsForm(root, current = null) {
  const formType = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "matrixDisplayFace";
  const base = normalizeNodeGraphMatrixFaceSettings(current, formType);
  const panel = root?.querySelector?.("[data-matrix-face-settings-panel]") || root;
  const glyph = panel?.querySelector?.('[data-matrix-face-field="glyphTable"]');
  const message = panel?.querySelector?.('[data-matrix-face-field="message"]');
  const activeRender = panel?.querySelector?.(
    "[data-matrix-face-render].active, [data-matrix-face-render][aria-pressed='true']",
  );
  const renderStyle = activeRender?.getAttribute?.("data-matrix-face-render")
    || base.renderStyle
    || "vector";

  let gradientStops = base.gradientStops;
  const editor = typeof NodeGraphGradientSelector !== "undefined"
    ? NodeGraphGradientSelector.getActive?.()
    : (typeof nodeGraphMvp !== "undefined"
      ? (nodeGraphMvp?.gradientSelector
        || nodeGraphMvp?.spectrogramGradientEditor
        || nodeGraphMvp?.sharedGradientEditor)
      : null);
  if (editor && typeof editor.getStops === "function") {
    gradientStops = editor.getStops();
  }

  if (formType === "matrixWaterfallFace") {
    return normalizeNodeGraphMatrixFaceSettings({
      glyphTable: glyph ? glyph.value : base.glyphTable,
      renderStyle,
      gradientStops,
    }, formType);
  }
  return normalizeNodeGraphMatrixFaceSettings({
    message: message ? message.value : base.message,
    renderStyle,
    gradientStops,
  }, formType);
}

function bindNodeGraphMatrixFaceDisplaySettingsBody(host) {
  if (!host || host.dataset.matrixFaceSettingsBound === "true") return;
  host.dataset.matrixFaceSettingsBound = "true";

  const stopNav = (event) => event.stopPropagation();
  for (const field of host.querySelectorAll?.("[data-matrix-face-field]") || []) {
    field.addEventListener("pointerdown", stopNav);
    field.addEventListener("keydown", stopNav);
  }

  let inputTimer = 0;
  host.addEventListener("input", (event) => {
    if (!event.target?.closest?.("[data-matrix-face-field]")) return;
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => {
      if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
        applyNodeGraphTraceDisplaySettingsForm({ persist: "debounce", record: false });
      }
    }, 220);
  });
  host.addEventListener("change", (event) => {
    if (!event.target?.closest?.("[data-matrix-face-field]")) return;
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
    }
  });

  host.addEventListener("click", (event) => {
    const renderBtn = event.target?.closest?.("[data-matrix-face-render]");
    if (renderBtn && host.contains(renderBtn)) {
      event.preventDefault();
      event.stopPropagation();
      const style = renderBtn.getAttribute("data-matrix-face-render") === "vector" ? "vector" : "pixel";
      for (const btn of host.querySelectorAll?.("[data-matrix-face-render]") || []) {
        const active = btn.getAttribute("data-matrix-face-render") === style;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", String(active));
      }
      if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
        applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
      }
      return;
    }

    const action = event.target?.closest?.("[data-matrix-face-action]")?.getAttribute?.("data-matrix-face-action");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const panel = host.querySelector?.("[data-matrix-face-settings-panel]") || host;

    if (action === "default-glyphs") {
      const glyph = panel.querySelector?.('[data-matrix-face-field="glyphTable"]');
      if (glyph) {
        glyph.value = typeof matrixDefaultGlyphTable === "function" ? matrixDefaultGlyphTable() : ".";
      }
      if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
        applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
      }
      return;
    }
    if (action === "default-message") {
      const message = panel.querySelector?.('[data-matrix-face-field="message"]');
      if (message) {
        message.value = typeof MATRIX_DEFAULT_MESSAGE === "string" ? MATRIX_DEFAULT_MESSAGE : "READY";
      }
      if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
        applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
      }
      return;
    }
    if (action === "clear-cells") {
      const nodeId = String(
        document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset?.displaySettingsTargetNode
        || (typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.traceDisplaySettingsTargetNode : "")
        || "",
      );
      const sim = (typeof matrixSimStates !== "undefined" && matrixSimStates?.get?.(nodeId))
        || (typeof asciiscopeSimStates !== "undefined" && asciiscopeSimStates?.get?.(nodeId));
      if (sim) {
        sim.live?.fill?.(" ");
        sim.residual?.fill?.(" ");
        sim.energy?.fill?.(0);
        sim.serialCursor = 0;
        if (sim.heads) {
          for (let c = 0; c < sim.heads.length; c += 1) {
            sim.heads[c] = -1;
            sim.headLife[c] = 0;
          }
        }
      }
    }
  });
}
