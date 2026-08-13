const nodeGraphPatchFaceFieldKeys = Object.freeze([
  "name",
  "bank",
  "program",
  "bankName",
  "category",
  "tags",
  "author",
  "description",
]);

const nodeGraphPatchFaceDisplaySettingsDefaults = Object.freeze({
  showName: true,
  showBank: true,
  showProgram: true,
  showBankName: true,
  showCategory: true,
  showTags: true,
  showAuthor: true,
  showDescription: true,
  background: "#0a0c0e",
  color: "#f3f1ec",
});

function nodeGraphPatchFaceParseColor(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  if (/^rgba?\(/i.test(text) || /^hsla?\(/i.test(text)) {
    return text;
  }
  return fallback;
}

function normalizeNodeGraphPatchFaceDisplaySettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const flag = (key) => source[key] !== false && source[key] !== "false";
  const background = nodeGraphPatchFaceParseColor(
    source.background ?? source.backgroundColor,
    nodeGraphPatchFaceDisplaySettingsDefaults.background,
  );
  const color = nodeGraphPatchFaceParseColor(
    source.color ?? source.dot1Color,
    nodeGraphPatchFaceDisplaySettingsDefaults.color,
  );
  return {
    showName: flag("showName"),
    showBank: flag("showBank"),
    showProgram: flag("showProgram"),
    showBankName: flag("showBankName"),
    showCategory: flag("showCategory"),
    showTags: flag("showTags"),
    showAuthor: flag("showAuthor"),
    showDescription: flag("showDescription"),
    background,
    color,
    backgroundColor: background,
    dot1Color: color,
  };
}

function nodeGraphPatchFaceDisplaySettingsForNode(node) {
  return normalizeNodeGraphPatchFaceDisplaySettings(node?.traceDisplaySettings);
}

function nodeGraphPatchInfoFieldVisibility(settings) {
  const s = normalizeNodeGraphPatchFaceDisplaySettings(settings);
  return {
    name: s.showName,
    bank: s.showBank,
    program: s.showProgram,
    bankName: s.showBankName,
    category: s.showCategory,
    tags: s.showTags,
    author: s.showAuthor,
    description: s.showDescription,
  };
}

function applyNodeGraphPatchFaceDisplay(face = null, node = null) {
  const host = face || document.querySelector(".node-patch-face");
  if (!host) {
    return;
  }
  const patchNode = node
    || (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(host.dataset.node) : null);
  const settings = nodeGraphPatchFaceDisplaySettingsForNode(patchNode);
  const info = typeof normalizeNodeGraphPatchInfo === "function"
    ? normalizeNodeGraphPatchInfo(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.patch?.info : {})
    : {};
  const visible = nodeGraphPatchInfoFieldVisibility(settings);
  host.style.setProperty("--node-patch-face-bg", settings.background);
  host.style.setProperty("--node-patch-face-ink", settings.color);
  host.style.background = settings.background;
  host.style.color = settings.color;
  for (const field of host.querySelectorAll("[data-patch-info-field]")) {
    const key = String(field.getAttribute("data-patch-info-field") || "").trim();
    if (!key) {
      continue;
    }
    const row = field.closest(".node-patch-field");
    if (row) {
      row.hidden = visible[key] === false;
    }
    if (document.activeElement === field) {
      continue;
    }
    const value = info[key];
    field.value = value == null ? "" : String(value);
  }
}

function createNodeGraphPatchFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-patch-face node-module-face";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(face, "face");
  }
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} patch info`);
  face.innerHTML = `
    <div class="node-patch-module-info">
      <div class="node-patch-card-grid">
        <label class="node-patch-field node-patch-field-span-2">
          <span>Name</span>
          <input id="patchNameValue" type="text" autocomplete="off" spellcheck="false" data-patch-info-field="name" placeholder="Untitled patch">
        </label>
        <label class="node-patch-field">
          <span>Bank #</span>
          <input id="patchBankValue" type="number" min="0" max="127" step="1" data-patch-info-field="bank" inputmode="numeric">
        </label>
        <label class="node-patch-field">
          <span>Program #</span>
          <input id="patchProgramValue" type="number" min="0" max="127" step="1" data-patch-info-field="program" inputmode="numeric">
        </label>
        <label class="node-patch-field node-patch-field-span-2">
          <span>Bank name</span>
          <input id="patchBankNameValue" type="text" autocomplete="off" spellcheck="false" data-patch-info-field="bankName" placeholder="Bank name">
        </label>
        <label class="node-patch-field node-patch-field-span-2">
          <span>Category</span>
          <input id="patchCategoryValue" type="text" autocomplete="off" spellcheck="false" data-patch-info-field="category" placeholder="Category">
        </label>
        <label class="node-patch-field node-patch-field-span-2">
          <span>Tags</span>
          <input id="patchTagsValue" type="text" autocomplete="off" spellcheck="false" data-patch-info-field="tags" placeholder="tag1, tag2">
        </label>
        <label class="node-patch-field node-patch-field-span-2">
          <span>Author</span>
          <input id="patchAuthorValue" type="text" autocomplete="off" spellcheck="false" data-patch-info-field="author" placeholder="Author">
        </label>
        <label class="node-patch-field node-patch-field-span-2 node-patch-field-stack">
          <span>Description</span>
          <textarea id="patchDescriptionValue" spellcheck="true" data-patch-info-field="description" rows="4" placeholder="What this patch is for…"></textarea>
        </label>
      </div>
    </div>`;
  return face;
}

registerNodeGraphChromelessModuleUi("patch", {
  createBody: createNodeGraphPatchFace,
  afterMount(article, body, node) {
    if (!body) {
      return;
    }
    body.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    const onEdit = (event) => {
      if (!event.target?.closest?.("[data-patch-info-field]")) {
        return;
      }
      if (typeof handleNodeGraphSettingsInput === "function") {
        handleNodeGraphSettingsInput(event);
      }
    };
    body.addEventListener("input", onEdit);
    body.addEventListener("change", onEdit);
    applyNodeGraphPatchFaceDisplay(body, typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(node)
      : null);
    if (typeof syncNodeGraphSettingsView === "function") {
      syncNodeGraphSettingsView();
    }
  },
});
