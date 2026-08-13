// Isolated Text Box face. Displays and edits text. No patch, no wires, no audio.
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
  const numeric = Math.round(Number(value));
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, numeric));
  }
  const align = String(value || "").toLowerCase();
  if (align === "top") return 0;
  if (align === "bottom") return 100;
  return 50;
}

function textBoxWidgetMeasureMaxLineWidth(field, mode) {
  if (!field) return 0;
  const style = window.getComputedStyle(field);
  const text = String(field.value || "");
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
  const text = String(field.value || "");
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
  const style = window.getComputedStyle(field);
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const text = String(field.value || "");
  const multiline = textBoxWidgetNormalizeMode(layout.textMode) !== "singleLine";
  const lineCount = multiline ? Math.max(1, text.split(/\r\n|\r|\n/).length) : 1;
  const contentHeight = lineCount * lineHeight;
  const availableHeight = Math.max(0, field.clientHeight - paddingTop - paddingBottom);
  const remainingHeight = Math.max(0, availableHeight - contentHeight);
  const offset = remainingHeight * textBoxWidgetNormalizeVertical(layout.verticalAlignPercent) / 100;
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

  const field = document.createElement("textarea");
  field.className = "node-text-box-input";
  field.spellcheck = false;
  field.rows = 1;
  field.value = layout.text;
  field.readOnly = !editable;
  field.tabIndex = editable ? 0 : -1;
  field.setAttribute("aria-label", options.ariaLabel || "Text box");

  if (typeof nodeGraphTextBoxBindFieldKeySteal === "function") {
    nodeGraphTextBoxBindFieldKeySteal(field);
  } else {
    const stopKeys = (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) event.stopPropagation();
    };
    field.addEventListener("keydown", stopKeys, true);
    field.addEventListener("keyup", stopKeys, true);
    field.addEventListener("keypress", stopKeys, true);
  }
  field.addEventListener("pointerdown", (event) => {
    // Same as the module title: click must not focus this surface.
    // Double-click opens the floating area field. A first-click :focus flash
    // here is what made it look like focus arrived and immediately left.
    event.preventDefault();
    event.stopPropagation();
  });
  field.addEventListener("click", (event) => event.stopPropagation());
  field.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = body.dataset?.node;
    if (typeof nodeGraphTextBoxOpenFloatingEditor === "function" && nodeId) {
      nodeGraphTextBoxOpenFloatingEditor(nodeId, "text", event);
    }
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
    commitFn?.(field.value);
  }

  field.addEventListener("input", () => {
    if (applying || !editable) return;
    layout.text = field.value;
    scheduleVisual();
    changeFn?.(field.value);
    if (commitTimer) window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(flushCommit, 400);
  });
  field.addEventListener("change", () => {
    if (applying || !editable) return;
    flushCommit();
  });
  field.addEventListener("blur", () => {
    if (applying || !editable) return;
    flushCommit();
  });

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
      return field.value;
    },
    setText(value) {
      const next = String(value ?? "");
      if (field.value === next) return;
      applying = true;
      field.value = next;
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
      if (next.text != null) this.setText(next.text);
      applyLayoutAttrs();
      scheduleVisual();
    },
    setEditable(on) {
      editable = on !== false;
      field.readOnly = !editable;
      field.tabIndex = editable ? 0 : -1;
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
