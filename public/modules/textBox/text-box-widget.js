// Isolated Text Box face. One div: type here, see glyphs here.
// Not a textarea (CSS zoom on the workspace does not paint textarea glyphs).
// Host may call setText / setLayout and listen for onChange / onCommit.

function textBoxWidgetNormalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "multiline" || mode === "multi" || mode === "multi-line") {
    return "multiline";
  }
  if (
    mode === "fill"
    || mode === "multilinefill"
    || mode === "multiline-fill"
    || mode === "fit"
  ) {
    return "multiline";
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
    return Math.max(-100, Math.min(100, numeric));
  }
  const align = String(value || "").toLowerCase();
  if (align === "top") return -100;
  if (align === "bottom") return 100;
  return 0;
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

function textBoxWidgetApplyAlign(field, layout) {
  if (!field) return;
  field.style.setProperty("--node-text-box-content-offset", "0px");
  void field.offsetHeight;
  const box = Math.max(0, field.clientHeight);
  const contentHeight = Math.max(0, field.scrollHeight);
  const slack = box - contentHeight;
  const bipolar = textBoxWidgetNormalizeVertical(layout.verticalAlignPercent);
  const offset = slack * 0.5 + (slack * bipolar) / 200;
  field.style.setProperty("--node-text-box-content-offset", `${offset.toFixed(2)}px`);
}

function textBoxWidgetApplyVisual(field, layout) {
  if (!field) return;
  field.scrollLeft = 0;
  field.scrollTop = 0;
  field.style.setProperty("--node-text-box-font-fit-scale", "1");
  textBoxWidgetApplyAlign(field, layout);
}

function textBoxWidgetRangeFromPoint(x, y) {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos?.offsetNode) {
      return null;
    }
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

function textBoxWidgetPlaceCaretAtPoint(field, x, y) {
  if (!field) {
    return;
  }
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
  const selection = window.getSelection?.();
  if (!selection) {
    return;
  }
  const fromPoint = textBoxWidgetRangeFromPoint(x, y);
  if (fromPoint && field.contains(fromPoint.startContainer)) {
    fromPoint.collapse(true);
    selection.removeAllRanges();
    selection.addRange(fromPoint);
    return;
  }
  const end = document.createRange();
  end.selectNodeContents(field);
  end.collapse(false);
  selection.removeAllRanges();
  selection.addRange(end);
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

  let pointerStart = null;
  field.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (!editable || event.button !== 0) {
      return;
    }
    pointerStart = { x: event.clientX, y: event.clientY };
    if (document.activeElement !== field) {
      try {
        field.focus({ preventScroll: true });
      } catch {
        field.focus();
      }
    }
  });
  field.addEventListener("pointerup", (event) => {
    if (!editable || event.button !== 0 || !pointerStart) {
      return;
    }
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    const dragged = (dx * dx) + (dy * dy) > 16;
    pointerStart = null;
    if (dragged || event.shiftKey) {
      return;
    }
    const selected = String(window.getSelection?.()?.toString() || "");
    const all = textBoxWidgetReadText(field);
    if (selected && all && selected === all) {
      textBoxWidgetPlaceCaretAtPoint(field, event.clientX, event.clientY);
    }
  });
  field.addEventListener("click", (event) => event.stopPropagation());
  field.addEventListener("dblclick", (event) => {
    // Stay on the face. Native dblclick selects the whole nowrap line.
    event.preventDefault();
    event.stopPropagation();
    if (editable) {
      textBoxWidgetPlaceCaretAtPoint(field, event.clientX, event.clientY);
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
      body.style.setProperty("--node-text-box-bg", layout.backgroundColor);
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
