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

function copyNodeGraphEmojiGlyph(glyph) {
  const text = String(glyph || "");
  if (!text) {
    return;
  }
  if (typeof copyTextToClipboard === "function") {
    void copyTextToClipboard(text);
  } else if (navigator?.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(`copied ${text}`);
  }
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
      button.title = `Copy ${glyph}`;
      button.setAttribute("aria-label", `Copy ${glyph}`);
      button.addEventListener("click", () => {
        copyNodeGraphEmojiGlyph(glyph);
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
