const nodeGraphEmojiCatalog = Object.freeze([
  {
    id: "math",
    label: "Math",
    glyphs: [
      "➕", "➖", "✖️", "➗", "+", "−", "×", "÷", "🟰", "±", "≈", "≠", "≤", "≥",
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
      "❌", "✅", "❎", "☑️", "✔️",
      "✓", "✔", "☑",
      "✕", "✖", "✗", "✘", "☒",
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

const nodeGraphEmojiGlyphNames = Object.freeze({
  "➕": "plus",
  "➖": "minus",
  "✖️": "multiply",
  "➗": "divide",
  "+": "plus sign",
  "−": "minus sign",
  "×": "multiplication sign",
  "÷": "division sign",
  "🟰": "heavy equals",
  "±": "plus-minus",
  "≈": "approximately equal",
  "≠": "not equal",
  "≤": "less than or equal",
  "≥": "greater than or equal",
  "∞": "infinity",
  "√": "square root",
  "∑": "summation",
  "∏": "product",
  "∫": "integral",
  "∂": "partial differential",
  "∆": "increment",
  "∇": "nabla",
  "°": "degree",
  "%": "percent",
  "π": "pi",
  "θ": "theta",
  "λ": "lambda",
  "μ": "mu",
  "ω": "omega",
  "Ω": "ohm",
  "α": "alpha",
  "β": "beta",
  "Δ": "delta",
  "Σ": "sigma",
  "ƒ": "function",
  "∈": "element of",
  "∉": "not an element of",
  "⊂": "subset of",
  "⊃": "superset of",
  "∪": "union",
  "∩": "intersection",
  "∧": "logical and",
  "∨": "logical or",
  "¬": "not",
  "∀": "for all",
  "∃": "there exists",
  "∴": "therefore",
  "∵": "because",
  "⊥": "perpendicular",
  "∥": "parallel",
  "≅": "congruent",
  "≡": "identical to",
  "½": "one half",
  "¼": "one quarter",
  "¾": "three quarters",
  "²": "superscript two",
  "³": "superscript three",
  "‰": "per mille",
  "⬅️": "left arrow",
  "➡️": "right arrow",
  "⬆️": "up arrow",
  "⬇️": "down arrow",
  "↗️": "up-right arrow",
  "↘️": "down-right arrow",
  "↙️": "down-left arrow",
  "↖️": "up-left arrow",
  "↕️": "up-down arrow",
  "↔️": "left-right arrow",
  "↩️": "right arrow curving left",
  "↪️": "left arrow curving right",
  "⤴️": "right arrow curving up",
  "⤵️": "right arrow curving down",
  "🔃": "clockwise vertical arrows",
  "🔄": "counterclockwise arrows button",
  "🔙": "back arrow",
  "🔚": "end arrow",
  "🔛": "on arrow",
  "🔜": "soon arrow",
  "🔝": "top arrow",
  "⏩": "fast-forward",
  "⏪": "fast reverse",
  "⏫": "fast up",
  "⏬": "fast down",
  "⏭️": "next track",
  "⏮️": "last track",
  "▶️": "play",
  "◀️": "reverse",
  "🔼": "upwards button",
  "🔽": "downwards button",
  "←": "leftwards arrow",
  "→": "rightwards arrow",
  "↑": "upwards arrow",
  "↓": "downwards arrow",
  "↔": "left-right arrow",
  "↕": "up-down arrow",
  "↩": "leftwards arrow with hook",
  "↪": "rightwards arrow with hook",
  "↺": "anticlockwise open circle arrow",
  "↻": "clockwise open circle arrow",
  "⇐": "leftwards double arrow",
  "⇒": "rightwards double arrow",
  "⇑": "upwards double arrow",
  "⇓": "downwards double arrow",
  "⇔": "left-right double arrow",
  "🔴": "red circle",
  "🟠": "orange circle",
  "🟡": "yellow circle",
  "🟢": "green circle",
  "🔵": "blue circle",
  "🟣": "purple circle",
  "🟤": "brown circle",
  "⚫": "black circle",
  "⚪": "white circle",
  "🟥": "red square",
  "🟧": "orange square",
  "🟨": "yellow square",
  "🟩": "green square",
  "🟦": "blue square",
  "🟪": "purple square",
  "🟫": "brown square",
  "⬛": "black large square",
  "⬜": "white large square",
  "🔶": "large orange diamond",
  "🔷": "large blue diamond",
  "🔸": "small orange diamond",
  "🔹": "small blue diamond",
  "🔺": "red triangle pointed up",
  "🔻": "red triangle pointed down",
  "❌": "cross mark",
  "✅": "check mark button",
  "❎": "cross mark button",
  "☑️": "ballot box with check",
  "✔️": "check mark",
  "✓": "check mark",
  "✔": "heavy check mark",
  "☑": "ballot box with check",
  "✕": "multiplication x",
  "✖": "heavy multiplication x",
  "✗": "ballot x",
  "✘": "heavy ballot x",
  "☒": "ballot box with x",
  "❤️": "red heart",
  "🩷": "pink heart",
  "🧡": "orange heart",
  "💛": "yellow heart",
  "💚": "green heart",
  "💙": "blue heart",
  "🩵": "light blue heart",
  "💜": "purple heart",
  "🤎": "brown heart",
  "🖤": "black heart",
  "🩶": "grey heart",
  "🤍": "white heart",
  "♻️": "recycling symbol",
  "📼": "videocassette",
  "🎞️": "film frames",
  "💿": "optical disk",
  "📀": "dvd",
  "💽": "computer disk",
  "💾": "floppy disk",
  "🚗": "automobile",
  "🚕": "taxi",
  "🚙": "sport utility vehicle",
  "🚌": "bus",
  "🚎": "trolleybus",
  "🏎️": "racing car",
  "🚓": "police car",
  "🚑": "ambulance",
  "🚒": "fire engine",
  "🚐": "minibus",
  "🚚": "delivery truck",
  "🚛": "articulated lorry",
  "🚜": "tractor",
  "🛵": "motor scooter",
  "🏍️": "motorcycle",
  "🚲": "bicycle",
  "🛴": "kick scooter",
  "🛺": "auto rickshaw",
  "🚔": "oncoming police car",
  "🚍": "oncoming bus",
  "🚘": "oncoming automobile",
  "🚖": "oncoming taxi",
  "🚇": "metro",
  "🚊": "tram",
  "🚋": "tram car",
  "🚝": "monorail",
  "🚄": "high-speed train",
  "🚅": "bullet train",
  "🚈": "light rail",
  "🚂": "locomotive",
  "🚆": "train",
  "🚉": "station",
  "🏠": "house",
  "🏡": "house with garden",
  "🏘️": "houses",
  "🏚️": "derelict house",
  "🏢": "office building",
  "🏣": "Japanese post office",
  "🏤": "post office",
  "🏥": "hospital",
  "🏦": "bank",
  "🏨": "hotel",
  "🏪": "convenience store",
  "🏫": "school",
  "🏬": "department store",
  "🏭": "factory",
  "🏯": "Japanese castle",
  "🏰": "castle",
  "⛪": "church",
  "🕌": "mosque",
  "🛕": "hindu temple",
  "🕍": "synagogue",
  "⛩️": "shinto shrine",
  "🕋": "kaaba",
  "🗼": "Tokyo tower",
  "🗽": "Statue of Liberty",
  "🗿": "moai",
  "🏙️": "cityscape",
  "🌆": "cityscape at dusk",
  "🌇": "sunset",
  "🌁": "foggy",
  "🌉": "bridge at night",
  "🛑": "stop sign",
  "🚧": "construction",
  "🚦": "vertical traffic light",
  "🚥": "horizontal traffic light",
  "⛽": "fuel pump",
  "🅿️": "parking",
  "🚏": "bus stop",
  "🗺️": "world map",
  "💻": "laptop",
  "🖥️": "desktop computer",
  "⌨️": "keyboard",
  "🖱️": "computer mouse",
  "🖨️": "printer",
  "📱": "mobile phone",
  "📲": "mobile phone with arrow",
  "☎️": "telephone",
  "📞": "telephone receiver",
  "📟": "pager",
  "📠": "fax machine",
  "📡": "satellite antenna",
  "🔋": "battery",
  "🔌": "electric plug",
  "💡": "light bulb",
  "🔦": "flashlight",
  "🧮": "abacus",
  "⌚": "watch",
  "🕹️": "joystick",
  "🎮": "video game",
  "📷": "camera",
  "📸": "camera with flash",
  "📹": "video camera",
  "🎥": "movie camera",
  "📺": "television",
  "📻": "radio",
  "🛰️": "satellite",
  "🤖": "robot",
  "⚙️": "gear",
  "🔧": "wrench",
  "🔨": "hammer",
  "🪛": "screwdriver",
  "🧲": "magnet",
  "🧪": "test tube",
  "🔬": "microscope",
  "🔭": "telescope",
  "☀️": "sun",
  "🌤️": "sun behind small cloud",
  "⛅": "sun behind cloud",
  "🌥️": "sun behind large cloud",
  "☁️": "cloud",
  "🌦️": "sun behind rain cloud",
  "🌧️": "cloud with rain",
  "⛈️": "cloud with lightning and rain",
  "🌩️": "cloud with lightning",
  "🌨️": "cloud with snow",
  "❄️": "snowflake",
  "🌟": "glowing star",
  "⭐": "star",
  "✨": "sparkles",
  "⚡": "high voltage",
  "🌙": "crescent moon",
  "🌛": "first quarter moon face",
  "🌜": "last quarter moon face",
  "🌚": "new moon face",
  "🌝": "full moon face",
  "🌞": "sun with face",
  "🪐": "ringed planet",
  "🌌": "milky way",
  "🌍": "globe Europe-Africa",
  "🌎": "globe Americas",
  "🌏": "globe Asia-Australia",
  "🌕": "full moon",
  "🌖": "waning gibbous moon",
  "🌗": "last quarter moon",
  "🌘": "waning crescent moon",
  "🌑": "new moon",
  "🌒": "waxing crescent moon",
  "🌓": "first quarter moon",
  "🌔": "waxing gibbous moon",
  "💫": "dizzy",
  "☄️": "comet",
  "🌠": "shooting star",
  "🌃": "night with stars",
});

function nodeGraphEmojiGlyphKey(glyph) {
  return String(glyph || "").replace(/[\uFE0E\uFE0F]/g, "");
}

function nodeGraphEmojiGlyphName(glyph) {
  const raw = String(glyph || "");
  return nodeGraphEmojiGlyphNames[raw]
    || nodeGraphEmojiGlyphNames[nodeGraphEmojiGlyphKey(raw)]
    || "";
}

function nodeGraphEmojiCopyTooltip(glyph) {
  const name = nodeGraphEmojiGlyphName(glyph);
  return name ? `Copy ${glyph} — ${name}` : `Copy ${glyph}`;
}

function copyNodeGraphEmojiGlyph(glyph, button = null) {
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
  if (button && typeof flashNodeGraphDefaultButtonSaved === "function") {
    flashNodeGraphDefaultButtonSaved(button, text);
  } else if (button) {
    button.classList.remove("saved-default");
    void button.offsetWidth;
    button.classList.add("saved-default");
    window.setTimeout(() => button.classList.remove("saved-default"), 1000);
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
      const tip = nodeGraphEmojiCopyTooltip(glyph);
      button.title = tip;
      button.dataset.defaultButtonLabel = tip;
      button.setAttribute("aria-label", tip);
      button.addEventListener("click", () => {
        copyNodeGraphEmojiGlyph(glyph, button);
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
