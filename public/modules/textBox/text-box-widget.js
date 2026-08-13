// Isolated Text Box face. One div: type here, see glyphs here.
// Not a textarea (CSS zoom on the workspace does not paint textarea glyphs).
// Host may call setText / setLayout and listen for onChange / onCommit.

const TextBoxWidgetFitLimits = Object.freeze({
  min: 0.4,
  maxFill: 16,
});

function textBoxWidgetNormalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "multiline" || mode === "multi" || mode === "multi-line") {
    return "multiline";
  }
  if (mode === "fill" || mode === "multilinefill" || mode === "multiline-fill" || mode === "fit") {
    return "fill";
  }
  return "singleLine";
}

function textBoxWidgetNormalizeAlign(value) {
  const align = String(value || "").toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "center";
}

function textBoxWidgetNormalizeVertical(value) {
  if (typeof normalizeNodeGraphTextBoxVerticalAlignPercent === "function") {
    return normalizeNodeGraphTextBoxVerticalAlignPercent(value);
  }
  const numeric = Math.round(Number(value));
  if (Number.isFinite(numeric)) {
    return Math.max(-50, Math.min(150, numeric));
  }
  const align = String(value || "").toLowerCase();
  if (align === "top") return 0;
  if (align === "bottom") return 100;
  return 50;
}

function textBoxWidgetReadText(field) {
  if (!field) return "";
  const raw = String(field.innerText ?? field.textContent ?? "").replace(/\u00a0/g, " ");
  return raw === "\n" ? "" : raw;
}

function textBoxWidgetWriteText(field, value) {
  if (!field) return;
  const next = String(value ?? "");
  if (textBoxWidgetReadText(field) === next) return;
  field.textContent = next;
}

function textBoxWidgetMeasureMaxLineWidth(field, mode) {
  if (!field) return 0;
  const style = window.getComputedStyle(field);
  const text = textBoxWidgetReadText(field);
  const lines = text.split(/\r\n|\r|\n/);
  const samples = mode === "singleLine"
    ? [text || " "]
    : [
      ...lines.map((line) => line || " "),
      ...lines.flatMap((line) => line.trim().split(/\s+/).filter(Boolean)),
    ];
  const list = samples.length ? samples : [" "];
  const canvas = textBoxWidgetMeasureMaxLineWidth.canvas ||= document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 0;
  context.font = style.font;
  return list.reduce((width, sample) => Math.max(width, context.measureText(sample || " ").width), 0);
}

function textBoxWidgetFitScale(field, layout) {
  if (!field) return 1;
  const mode = textBoxWidgetNormalizeMode(layout.textMode);
  if (mode === "singleLine") return 1;
  const style = window.getComputedStyle(field);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const availableWidth = Math.max(1, field.clientWidth - paddingLeft - paddingRight);
  const maxWidth = textBoxWidgetMeasureMaxLineWidth(field, mode);
  if (mode === "multiline") {
    if (!(maxWidth > 0) || maxWidth <= availableWidth) return 1;
    return Math.max(TextBoxWidgetFitLimits.min, availableWidth / maxWidth);
  }
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const availableHeight = Math.max(1, field.clientHeight - paddingTop - paddingBottom);
  const text = textBoxWidgetReadText(field);
  const lineCount = Math.max(1, text.split(/\r\n|\r|\n/).length);
  const contentHeightAt1 = lineCount * lineHeight;
  const sHeight = contentHeightAt1 > 0 ? availableHeight / contentHeightAt1 : TextBoxWidgetFitLimits.maxFill;
  const sWidth = maxWidth > 0 ? availableWidth / maxWidth : TextBoxWidgetFitLimits.maxFill;
  return Math.max(
    TextBoxWidgetFitLimits.min,
    Math.min(TextBoxWidgetFitLimits.maxFill, Math.min(sHeight, sWidth)),
  );
}

function textBoxWidgetApplyAlign(field, layout) {
  if (!field) return;
  field.style.setProperty("--node-text-box-content-offset", "0px");
  void field.offsetHeight;
  const style = window.getComputedStyle(field);
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const text = textBoxWidgetReadText(field);
  const multiline = textBoxWidgetNormalizeMode(layout.textMode) !== "singleLine";
  const lineCount = multiline ? Math.max(1, text.split(/\r\n|\r|\n/).length) : 1;
  const contentHeight = lineCount * lineHeight;
  const box = Math.max(0, field.clientHeight);
  const slack = box - contentHeight;
  const offset = slack * textBoxWidgetNormalizeVertical(layout.verticalAlignPercent) / 100;
  field.style.setProperty("--node-text-box-content-offset", `${offset.toFixed(2)}px`);
}

function textBoxWidgetApplyVisual(field, layout) {
  if (!field) return;
  field.scrollLeft = 0;
  field.scrollTop = 0;
  field.style.setProperty("--node-text-box-font-fit-scale", "1");
  void field.offsetWidth;
  field.style.setProperty("--node-text-box-font-fit-scale", String(textBoxWidgetFitScale(field, layout)));
  textBoxWidgetApplyAlign(field, layout);
}

function createTextBoxWidget(body, options = {}) {
  if (!body) return null;
  const layout = {
    text: String(options.text ?? ""),
    textMode: textBoxWidgetNormalizeMode(options.textMode),
    horizontalAlign: textBoxWidgetNormalizeAlign(options.horizontalAlign || options.align),
    verticalAlignPercent: textBoxWidgetNormalizeVertical(options.verticalAlignPercent ?? options.verticalAlign),
    textSizePercent: Number.isFinite(Number(options.textSizePercent))
      ? Math.max(50, Math.min(1000, Math.round(Number(options.textSizePercent))))
      : 100,
    backgroundColor: String(options.backgroundColor || ""),
    textColor: String(options.textColor || ""),
  };
  let editable = options.editable !== false;
  let changeFn = typeof options.onChange === "function" ? options.onChange : null;
  let commitFn = typeof options.onCommit === "function" ? options.onCommit : null;
  const backgroundWheel = typeof options.onBackgroundWheel === "function"
    ? options.onBackgroundWheel
    : null;
  let commitTimer = 0;
  let applying = false;
  let observer = null;

  // Div, not textarea: CSS `zoom` on the workspace surface does not paint
  // textarea glyphs. Face is the live editor (settings field mirrors it).
  const field = document.createElement("div");
  field.className = "node-text-box-input";
  field.setAttribute("role", "textbox");
  field.setAttribute("aria-multiline", layout.textMode === "singleLine" ? "false" : "true");
  field.setAttribute("aria-label", options.ariaLabel || "Text box");
  field.spellcheck = false;
  textBoxWidgetWriteText(field, layout.text);

  function applyEditable() {
    field.contentEditable = editable ? "true" : "false";
    field.setAttribute("aria-readonly", editable ? "false" : "true");
    field.tabIndex = editable ? 0 : -1;
  }

  if (typeof nodeGraphTextBoxBindFieldKeySteal === "function") {
    nodeGraphTextBoxBindFieldKeySteal(field);
  }

  field.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  field.addEventListener("click", (event) => event.stopPropagation());
  field.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    const nodeId = body.dataset?.node;
    if (typeof nodeGraphTextBoxOpenFloatingEditor === "function" && nodeId) {
      nodeGraphTextBoxOpenFloatingEditor(nodeId, "text", event);
    }
  });
  field.addEventListener("contextmenu", (event) => {
    const nodeId = body.dataset?.node;
    if (!nodeId || typeof openNodeGraphTraceDisplaySettings !== "function") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openNodeGraphTraceDisplaySettings(nodeId, event);
  });
  field.addEventListener("keydown", (event) => {
    if (layout.textMode === "singleLine" && event.key === "Enter") {
      event.preventDefault();
    }
  });
  field.addEventListener("paste", (event) => {
    if (!editable) return;
    event.preventDefault();
    const pasted = String(event.clipboardData?.getData("text/plain") ?? "");
    const text = layout.textMode === "singleLine"
      ? pasted.replace(/[\r\n]+/g, " ")
      : pasted;
    document.execCommand("insertText", false, text);
  });
  field.addEventListener("wheel", (event) => {
    if (document.activeElement === field) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    backgroundWheel?.(event);
  }, { passive: false });

  function applyLayoutAttrs() {
    field.dataset.textAlign = layout.horizontalAlign;
    field.dataset.textBoxMode = layout.textMode;
    field.dataset.textBoxModeCss = layout.textMode === "singleLine" ? "singleLine" : "multiline";
    field.style.textAlign = layout.horizontalAlign;
    field.style.setProperty("--node-text-box-font-scale", String(layout.textSizePercent / 100));
    if (layout.backgroundColor) {
      field.style.setProperty("--node-text-box-bg", layout.backgroundColor);
    }
    if (layout.textColor) {
      field.style.setProperty("--node-text-box-fg", layout.textColor);
    }
    field.setAttribute("aria-multiline", layout.textMode === "singleLine" ? "false" : "true");
    body.dataset.textHorizontalAlign = layout.horizontalAlign;
    body.dataset.textVerticalAlignPercent = String(layout.verticalAlignPercent);
  }

  function scheduleVisual() {
    const run = () => {
      if (field.isConnected) textBoxWidgetApplyVisual(field, layout);
    };
    requestAnimationFrame(run);
    document.fonts?.ready?.then(() => requestAnimationFrame(run));
  }

  function flushCommit() {
    if (commitTimer) {
      window.clearTimeout(commitTimer);
      commitTimer = 0;
    }
    commitFn?.(textBoxWidgetReadText(field));
  }

  field.addEventListener("input", () => {
    if (applying || !editable) return;
    layout.text = textBoxWidgetReadText(field);
    scheduleVisual();
    changeFn?.(layout.text);
    if (commitTimer) window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(flushCommit, 400);
  });
  field.addEventListener("blur", () => {
    if (applying || !editable) return;
    flushCommit();
  });

  applyEditable();
  applyLayoutAttrs();
  body.replaceChildren(field);
  if (window.ResizeObserver) {
    observer = new ResizeObserver(() => scheduleVisual());
    observer.observe(field);
  }
  scheduleVisual();

  return {
    field,
    getText() {
      return textBoxWidgetReadText(field);
    },
    setText(value) {
      const next = String(value ?? "");
      if (textBoxWidgetReadText(field) === next) return;
      applying = true;
      textBoxWidgetWriteText(field, next);
      layout.text = next;
      applying = false;
      scheduleVisual();
    },
    setLayout(next = {}) {
      if (next.textMode != null) layout.textMode = textBoxWidgetNormalizeMode(next.textMode);
      if (next.horizontalAlign != null || next.align != null) {
        layout.horizontalAlign = textBoxWidgetNormalizeAlign(next.horizontalAlign || next.align);
      }
      if (next.verticalAlignPercent != null || next.verticalAlign != null) {
        layout.verticalAlignPercent = textBoxWidgetNormalizeVertical(
          next.verticalAlignPercent ?? next.verticalAlign,
        );
      }
      if (next.textSizePercent != null) {
        const n = Math.round(Number(next.textSizePercent));
        if (Number.isFinite(n)) layout.textSizePercent = Math.max(50, Math.min(1000, n));
      }
      if (next.backgroundColor != null) layout.backgroundColor = String(next.backgroundColor || "");
      if (next.textColor != null) layout.textColor = String(next.textColor || "");
      if (next.text != null) this.setText(next.text);
      applyLayoutAttrs();
      scheduleVisual();
    },
    setEditable(on) {
      editable = on !== false;
      applyEditable();
    },
    focus() {
      if (editable) field.focus();
    },
    onChange(fn) {
      changeFn = typeof fn === "function" ? fn : null;
    },
    onCommit(fn) {
      commitFn = typeof fn === "function" ? fn : null;
    },
    destroy() {
      if (commitTimer) window.clearTimeout(commitTimer);
      observer?.disconnect();
      field.remove();
    },
  };
}
