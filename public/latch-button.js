// App-wide latch / action button widget.
//
// Full-cell button: label fills available space (font sized to fit),
// on = highlighted, off = dim. Reusable anywhere (Display Settings packing
// row, future face chrome, etc.).
//
// Usage:
//   const el = AppLatchButton.create({ label: "Full Dot Economy", on: false, title: "…" });
//   AppLatchButton.toggle(el);
//   AppLatchButton.fitAll(root); // clears legacy inline sizes; CSS owns font-size
//   html = AppLatchButton.buildHtml({ label, on, title, toggleKey: "fullDotEconomy" });
//
// Modes:
//   latch (default) — aria-pressed true/false
//   action          — momentary (Clear); no pressed state

(function initAppLatchButton(global) {
  const ROOT_CLASS = "app-latch-button";
  const LABEL_CLASS = "app-latch-button-label";
  const ROW_CLASS = "app-latch-button-row";

  let measureCanvas = null;
  const fitObservers = new WeakMap();

  function measureContext() {
    if (!measureCanvas) {
      measureCanvas = document.createElement("canvas");
    }
    return measureCanvas.getContext("2d");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isLatchButton(el) {
    return Boolean(el && el.classList && el.classList.contains(ROOT_CLASS));
  }

  function isAction(el) {
    return el?.dataset?.latchMode === "action";
  }

  function isOn(el) {
    if (!el || isAction(el)) {
      return false;
    }
    return el.getAttribute("aria-pressed") === "true" || el.dataset.latchOn === "1";
  }

  function setOn(el, on) {
    if (!el || isAction(el)) {
      return;
    }
    const next = Boolean(on);
    el.setAttribute("aria-pressed", next ? "true" : "false");
    el.dataset.latchOn = next ? "1" : "0";
    el.classList.toggle("is-on", next);
    el.classList.toggle("is-off", !next);
  }

  function toggle(el) {
    if (!el || isAction(el)) {
      return false;
    }
    setOn(el, !isOn(el));
    return isOn(el);
  }

  /**
   * Label size is CSS-owned (container query on .app-latch-button).
   * Keep these as no-ops that only clear leftover inline font-size from older builds.
   */
  function clearInlineLabelSize(el) {
    if (!isLatchButton(el)) {
      return;
    }
    const label = el.querySelector(`.${LABEL_CLASS}`);
    if (label?.style) {
      label.style.removeProperty("font-size");
    }
  }

  function fitLabel(el) {
    clearInlineLabelSize(el);
  }

  function fitAll(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    for (const el of scope.querySelectorAll(`.${ROOT_CLASS}`)) {
      clearInlineLabelSize(el);
    }
  }

  function scheduleFit(root = document) {
    requestAnimationFrame(() => fitAll(root));
  }

  function observe(_el) {
    // No ResizeObserver font fitting — CSS owns size.
  }

  function observeAll(root = document) {
    fitAll(root);
  }

  function applyAttrs(btn, options = {}) {
    btn.type = "button";
    btn.className = [ROOT_CLASS, options.className || ""].filter(Boolean).join(" ");
    btn.dataset.latchButton = "true";
    if (options.id) {
      btn.id = options.id;
    }
    if (options.title) {
      btn.title = options.title;
    }
    if (options.toggleKey) {
      btn.dataset.traceDisplayToggle = options.toggleKey;
    }
    if (options.action) {
      btn.dataset.latchMode = "action";
      btn.dataset.latchAction = options.action;
      btn.dataset.traceDisplayAction = options.action;
      btn.removeAttribute("aria-pressed");
      btn.classList.remove("is-on", "is-off");
    } else {
      btn.dataset.latchMode = "latch";
      setOn(btn, options.on === true);
    }
    if (options.ariaLabel) {
      btn.setAttribute("aria-label", options.ariaLabel);
    } else if (options.label) {
      btn.setAttribute("aria-label", options.label);
    }
  }

  function create(options = {}) {
    const btn = document.createElement("button");
    applyAttrs(btn, options);
    const span = document.createElement("span");
    span.className = LABEL_CLASS;
    span.textContent = options.label || "";
    btn.appendChild(span);
    return btn;
  }

  /** Static HTML for form builders (no DOM create). */
  function buildHtml(options = {}) {
    const label = escapeHtml(options.label || "");
    const titleAttr = options.title
      ? ` title="${escapeHtml(options.title)}"`
      : "";
    const idAttr = options.id ? ` id="${escapeHtml(options.id)}"` : "";
    const onClass = options.action
      ? ""
      : (options.on === true ? " is-on" : " is-off");
    const classAttr = escapeHtml(
      [ROOT_CLASS, options.className || "", onClass.trim()].filter(Boolean).join(" "),
    );
    const toggleAttr = options.toggleKey
      ? ` data-trace-display-toggle="${escapeHtml(options.toggleKey)}"`
      : "";
    const modeAttrs = options.action
      ? ` data-latch-mode="action" data-latch-action="${escapeHtml(options.action)}" data-trace-display-action="${escapeHtml(options.action)}"`
      : ` data-latch-mode="latch" aria-pressed="${options.on === true ? "true" : "false"}" data-latch-on="${options.on === true ? "1" : "0"}"`;
    const ariaLabel = escapeHtml(options.ariaLabel || options.label || "");
    return (
      `<button type="button" class="${classAttr}" data-latch-button="true"`
      + `${idAttr}${titleAttr}${toggleAttr}${modeAttrs}`
      + ` aria-label="${ariaLabel}">`
      + `<span class="${LABEL_CLASS}">${label}</span>`
      + `</button>`
    );
  }

  /** Equal-width row of latch/action buttons (columns match child count). */
  function buildRowHtml(buttons = [], rowClass = "") {
    const list = Array.isArray(buttons) ? buttons : [];
    const cells = list.map((opts) => buildHtml(opts)).join("");
    const extra = rowClass ? ` ${escapeHtml(rowClass)}` : "";
    const cols = Math.max(1, list.length);
    return (
      `<div class="${ROW_CLASS}${extra}" data-latch-button-row data-trace-display-control-row`
      + ` style="--latch-cols:${cols};grid-template-columns:repeat(${cols},minmax(0,1fr))">`
      + `${cells}</div>`
    );
  }

  const api = {
    ROOT_CLASS,
    LABEL_CLASS,
    ROW_CLASS,
    create,
    buildHtml,
    buildRowHtml,
    isLatchButton,
    isAction,
    isOn,
    setOn,
    toggle,
    fitLabel,
    fitAll,
    scheduleFit,
    observe,
    observeAll,
    escapeHtml,
  };

  global.AppLatchButton = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
