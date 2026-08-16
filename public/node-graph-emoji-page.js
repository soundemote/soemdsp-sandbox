const nodeGraphEmojiCatalog = Object.freeze([
  {
    id: "math",
    label: "Math",
    glyphs: [
      "➕", "➖", "✖️", "❌", "➗", "+", "−", "×", "÷", "🟰", "±", "≈", "≠", "≤", "≥",
      "∞", "√", "∑", "∏", "∫", "∂", "∆", "∇", "°", "%",
      "π", "θ", "λ", "μ", "ω", "Ω", "α", "β", "Δ", "Σ", "ƒ",
      "∈", "∉", "⊂", "⊃", "∪", "∩", "∧", "∨", "¬", "∀",
      "∃", "∴", "∵", "⊥", "∥", "≅", "≡", "½", "¼", "¾",
      "²", "³", "‰",
    ],
  },
  {
    id: "arrows",
    label: "Arrows",
    glyphs: [
      "⬅️", "➡️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "↕️", "↔️",
      "↩️", "↪️", "⤴️", "⤵️", "🔃", "🔄", "🔙", "🔚", "🔛", "🔜",
      "🔝", "⏩", "⏪", "⏫", "⏬", "⏭️", "⏮️", "▶️", "◀️", "🔼",
      "🔽", "←", "→", "↑", "↓", "↔", "↕", "↩", "↪", "↺",
      "↻", "⇐", "⇒", "⇑", "⇓", "⇔",
    ],
  },
  {
    id: "dots",
    label: "Dots & shapes",
    glyphs: [
      "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤", "⚫", "⚪",
      "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫", "⬛", "⬜",
      "🔶", "🔷", "🔸", "🔹", "🔺", "🔻",
      "❤️", "🩷", "🧡", "💛", "💚", "💙", "🩵", "💜", "🤎", "🖤", "🩶", "🤍",
    ],
  },
  {
    id: "recycle",
    label: "Recycle",
    glyphs: ["♻️", "🔃", "🔄", "📼", "🎞️", "💿", "📀", "💽", "💾"],
  },
  {
    id: "city",
    label: "City",
    glyphs: [
      "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐",
      "🚚", "🚛", "🚜", "🛵", "🏍️", "🚲", "🛴", "🛺",
      "🚔", "🚍", "🚘", "🚖",
      "🚇", "🚊", "🚋", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚉",
      "🏠", "🏡", "🏘️", "🏚️", "🏢", "🏣", "🏤", "🏥", "🏦", "🏨",
      "🏪", "🏫", "🏬", "🏭", "🏯", "🏰", "⛪", "🕌", "🛕", "🕍",
      "⛩️", "🕋", "🗼", "🗽", "🗿", "🏙️", "🌆", "🌇", "🌁", "🌉",
      "🛑", "🚧", "🚦", "🚥", "⛽", "🅿️", "🚏", "🗺️",
    ],
  },
  {
    id: "tech",
    label: "Tech",
    glyphs: [
      "💻", "🖥️", "⌨️", "🖱️", "🖨️", "📱", "📲", "☎️", "📞", "📟",
      "📠", "📡", "🔋", "🔌", "💡", "🔦", "🧮", "⌚", "🕹️", "🎮",
      "📷", "📸", "📹", "🎥", "📺", "📻", "🛰️", "🤖", "⚙️", "🔧",
      "🔨", "🪛", "🧲", "🧪", "🔬", "🔭", "💾", "💿",
    ],
  },
  {
    id: "sky",
    label: "Sky",
    glyphs: [
      "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️",
      "❄️", "🌟", "⭐", "✨", "⚡", "🌙", "🌛", "🌜", "🌚", "🌝",
      "🌞", "🪐", "🌌", "🌍", "🌎", "🌏", "🌕", "🌖", "🌗", "🌘",
      "🌑", "🌒", "🌓", "🌔", "💫", "☄️", "🌠", "🌃",
    ],
  },
]);

let nodeGraphEmojiInsertTarget = null;

function applyNodeGraphEmojiPageSize(size = {}, panelArg = null) {
  const panel = panelArg || document.getElementById("nodeEmojiPage");
  if (!panel) {
    return null;
  }
  if (typeof applyNodeGraphUnifiedWindowShellSize === "function") {
    return applyNodeGraphUnifiedWindowShellSize(panel, size);
  }
  const width = Math.round(Number(size.width) || panel.getBoundingClientRect().width);
  const height = Math.round(Number(size.height) || panel.getBoundingClientRect().height);
  if (width >= 24) {
    panel.style.width = `${width}px`;
  }
  if (height >= 120) {
    panel.style.height = `${height}px`;
  }
  return { width, height };
}

function setNodeGraphEmojiPageOpen(open) {
  const panel = document.getElementById("nodeEmojiPage");
  if (!panel) {
    return;
  }
  const switching = Boolean(nodeGraphMvp?._unifiedWindowSwitching);
  if (open && !panel.hidden) {
    if (!switching && typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("emoji");
      return;
    }
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(panel);
    }
    return;
  }
  if (open && !switching && typeof openNodeGraphUnifiedWindowPage === "function") {
    openNodeGraphUnifiedWindowPage("emoji");
    return;
  }
  panel.hidden = !open;
  if (open) {
    panel.classList.add("node-unified-window");
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(panel);
    }
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("emoji", panel);
    }
    renderNodeGraphEmojiPage();
  }
}

function nodeGraphRememberEmojiInsertTarget(target) {
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest?.("#nodeEmojiPage")) {
    return;
  }
  if (typeof nodeGraphEventTargetIsTextEditable === "function") {
    if (!nodeGraphEventTargetIsTextEditable(target)) {
      return;
    }
  } else if (!target.closest?.("input, textarea, [contenteditable='true']")) {
    return;
  }
  nodeGraphEmojiInsertTarget = target.closest?.("input, textarea, [contenteditable='true']") || target;
}

function insertNodeGraphEmojiGlyph(glyph) {
  const text = String(glyph || "");
  if (!text) {
    return;
  }
  const field = nodeGraphEmojiInsertTarget && document.contains(nodeGraphEmojiInsertTarget)
    ? nodeGraphEmojiInsertTarget
    : null;
  if (!field) {
    if (typeof copyTextToClipboard === "function") {
      void copyTextToClipboard(text);
    }
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("copied emoji — click a text field, then pick again to type it");
    }
    return;
  }
  try {
    field.focus();
  } catch {
    // ignore
  }
  if (field.isContentEditable) {
    document.execCommand("insertText", false, text);
    return;
  }
  if (typeof field.selectionStart === "number") {
    const start = Number(field.selectionStart);
    const end = Number(field.selectionEnd);
    const value = String(field.value || "");
    field.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const caret = start + text.length;
    try {
      field.setSelectionRange(caret, caret);
    } catch {
      // ignore
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  field.value = `${String(field.value || "")}${text}`;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderNodeGraphEmojiPage() {
  const body = document.getElementById("nodeEmojiPageBody");
  if (!body || body.dataset.emojiGridReady === "true") {
    return;
  }
  body.dataset.emojiGridReady = "true";
  const fragment = document.createDocumentFragment();
  for (const section of nodeGraphEmojiCatalog) {
    const wrap = document.createElement("section");
    wrap.className = "node-emoji-section";
    wrap.setAttribute("aria-label", section.label);
    const title = document.createElement("h3");
    title.className = "node-emoji-section-title";
    title.textContent = section.label;
    wrap.append(title);
    const grid = document.createElement("div");
    grid.className = "node-emoji-grid";
    for (const glyph of section.glyphs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "node-emoji-glyph";
      button.textContent = glyph;
      button.title = `Type ${glyph}`;
      button.setAttribute("aria-label", `Insert ${glyph}`);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        insertNodeGraphEmojiGlyph(glyph);
      });
      grid.append(button);
    }
    wrap.append(grid);
    fragment.append(wrap);
  }
  body.replaceChildren(fragment);
}

function bindNodeGraphEmojiPageEvents() {
  if (document.documentElement.dataset.emojiPageBound === "true") {
    return;
  }
  document.documentElement.dataset.emojiPageBound = "true";
  document.addEventListener("focusin", (event) => {
    nodeGraphRememberEmojiInsertTarget(event.target);
  });
  document.getElementById("nodeEmojiPageClose")?.addEventListener("click", () => {
    if (typeof closeNodeGraphUnifiedWindowPage === "function") {
      closeNodeGraphUnifiedWindowPage("emoji");
      return;
    }
    setNodeGraphEmojiPageOpen(false);
  });
  document
    .querySelector("#nodeEmojiPage .scene-context-heading")
    ?.addEventListener("pointerdown", (event) => {
      if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
        beginNodeGraphRegisteredFloatingWindowDrag(event, "emoji");
      }
    });
  document
    .getElementById("nodeEmojiPageResizeHandle")
    ?.addEventListener("pointerdown", (event) => {
      if (typeof beginNodeGraphRegisteredFloatingWindowResize === "function") {
        beginNodeGraphRegisteredFloatingWindowResize(event, "emoji");
      }
    });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNodeGraphEmojiPageEvents, { once: true });
  } else {
    bindNodeGraphEmojiPageEvents();
  }
}
