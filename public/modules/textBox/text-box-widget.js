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
    return Math.max(0, Math.min(100, numeric));
  }
  const align = String(value || "").toLowerCase();
  if (align === "top") return 0;
  if (align === "bottom") return 100;
  return 50;
}

function textBoxWidgetNormalizeFont(value) {
  if (typeof nodeGraphAppNormalizeFont === "function") {
    return nodeGraphAppNormalizeFont(
      value,
      typeof NODE_GRAPH_TEXT_BOX_DEFAULT_FONT === "string"
        ? NODE_GRAPH_TEXT_BOX_DEFAULT_FONT
        : "cascadia-mono",
    );
  }
  const id = String(value || "").trim().toLowerCase();
  return id || "cascadia-mono";
}

function textBoxWidgetFontFamily(value) {
  if (typeof nodeGraphTextBoxFontFamily === "function") {
    return nodeGraphTextBoxFontFamily(value);
  }
  if (typeof nodeGraphAppFontFamily === "function") {
    return nodeGraphAppFontFamily(value, "cascadia-mono");
  }
  return "\"Cascadia Mono\", \"Cascadia Code\", Consolas, \"Courier New\", monospace";
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

/** Vertical slider range in face-heights: 0% = −N, 50% = 0, 100% = +N. */
const TEXT_BOX_VERTICAL_RANGE = 2;

function textBoxWidgetApplyAlign(field, layout) {
  if (!field) return false;
  const face = field.parentElement;
  const box = Math.max(0, face?.clientHeight || 0);
  // Boot race: face may be 0 until chrome lays out — retry via scheduleVisual.
  if (!(box > 0)) {
    return false;
  }
  const percent = textBoxWidgetNormalizeVertical(layout.verticalAlignPercent);
  // Plain translate — no content-height math. 50 = natural top; slide freely.
  const t = (percent - 50) / 50;
  const offset = t * box * TEXT_BOX_VERTICAL_RANGE;
  field.style.setProperty("--node-text-box-content-offset", `${offset.toFixed(2)}px`);
  return true;
}

function textBoxWidgetApplyVisual(field, layout) {
  if (!field) return false;
  field.scrollLeft = 0;
  field.scrollTop = 0;
  field.style.setProperty("--node-text-box-font-fit-scale", "1");
  return textBoxWidgetApplyAlign(field, layout);
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
    textWeight: typeof normalizeNodeGraphTextBoxTextWeight === "function"
      ? normalizeNodeGraphTextBoxTextWeight(options.textWeight ?? options.boldness ?? options.fontWeight)
      : (typeof nodeGraphAppClampFontWeight === "function"
        ? nodeGraphAppClampFontWeight(options.textWeight ?? options.boldness ?? options.fontWeight, 400)
        : 400),
    lineHeight: typeof normalizeNodeGraphTextBoxLineHeight === "function"
      ? normalizeNodeGraphTextBoxLineHeight(options.lineHeight ?? options.lineSpacing ?? options.newlineSpacing)
      : 1.2,
    font: textBoxWidgetNormalizeFont(options.font),
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
  let settleTimers = [];
  let visualGen = 0;

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
    // Second click of a double-click: leave the native word selection alone.
    if (dragged || event.shiftKey || Number(event.detail) > 1) {
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
    // Keep the gesture on the face (no module settings / drag).
    event.stopPropagation();
    if (!editable) {
      return;
    }
    // Already focused: native word/line select. preventDefault + PlaceCaret
    // was why the highlight appeared then vanished.
    if (document.activeElement === field) {
      return;
    }
    event.preventDefault();
    textBoxWidgetPlaceCaretAtPoint(field, event.clientX, event.clientY);
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
    field.dataset.textBoxFont = layout.font;
    field.style.textAlign = layout.horizontalAlign;
    field.style.setProperty("--node-text-box-font-scale", String(layout.textSizePercent / 100));
    field.style.setProperty("--node-text-box-font", textBoxWidgetFontFamily(layout.font));
    field.style.setProperty("--node-text-box-font-weight", String(layout.textWeight || 400));
    field.style.setProperty("--node-text-box-line-height", String(layout.lineHeight || 1.2));
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
    body.dataset.textBoxFont = layout.font;
    void field.offsetHeight;
  }

  function scheduleVisual() {
    visualGen += 1;
    const gen = visualGen;
    for (const timer of settleTimers) {
      window.clearTimeout(timer);
    }
    settleTimers = [];

    const run = () => {
      if (gen !== visualGen || !field.isConnected) {
        return;
      }
      const ok = textBoxWidgetApplyVisual(field, layout);
      // Face still 0 at boot — one short retry after chrome sizes.
      if (!ok) {
        settleTimers.push(window.setTimeout(() => {
          if (gen !== visualGen) return;
          requestAnimationFrame(run);
        }, 50));
      }
    };

    requestAnimationFrame(run);
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
    observer.observe(body);
    const host = body.closest?.(".dsp-node");
    if (host) {
      observer.observe(host);
    }
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
      if (next.textWeight != null || next.boldness != null || next.fontWeight != null) {
        layout.textWeight = typeof normalizeNodeGraphTextBoxTextWeight === "function"
          ? normalizeNodeGraphTextBoxTextWeight(next.textWeight ?? next.boldness ?? next.fontWeight)
          : (typeof nodeGraphAppClampFontWeight === "function"
            ? nodeGraphAppClampFontWeight(next.textWeight ?? next.boldness ?? next.fontWeight, 400)
            : 400);
      }
      if (next.lineHeight != null || next.lineSpacing != null || next.newlineSpacing != null) {
        layout.lineHeight = typeof normalizeNodeGraphTextBoxLineHeight === "function"
          ? normalizeNodeGraphTextBoxLineHeight(next.lineHeight ?? next.lineSpacing ?? next.newlineSpacing)
          : 1.2;
      }
      if (next.font != null) layout.font = textBoxWidgetNormalizeFont(next.font);
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
      visualGen += 1;
      if (commitTimer) window.clearTimeout(commitTimer);
      for (const timer of settleTimers) {
        window.clearTimeout(timer);
      }
      settleTimers = [];
      observer?.disconnect();
      field.remove();
    },
  };
}
