const nodeGraphDefaultPresetUrl = "./public/presets/default.json";
// v4: Efficient Init (allowlist). Old v3 local presets often still carried audioPlayer
// and hard-blocked Live under efficientProduct ("not in efficient build").
const nodeGraphDefaultPresetStorageKey = "soemdsp-sandbox.defaultPatch.live.v4";

async function nodeGraphDefaultPresetUrlToLoad() {
  const override = typeof nodeGraphResolveEmbedOverride === "function"
    ? await nodeGraphResolveEmbedOverride("defaultPresetUrl", "defaultPreset")
    : null;
  return override || nodeGraphDefaultPresetUrl;
}

async function loadNodeGraphDefaultPresetPatch() {
  const storedPatch = loadNodeGraphLocalDefaultPresetPatch();
  if (nodeGraphDefaultPresetPatchIsUsable(storedPatch)) {
    return normalizeNodeGraphDefaultPresetScopeShaders(storedPatch);
  }
  try {
    const response = await fetch(await nodeGraphDefaultPresetUrlToLoad(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const fetchedPatch = loadNodeGraphPatchFromScript(await response.text());
    return nodeGraphDefaultPresetPatchIsUsable(fetchedPatch)
      ? normalizeNodeGraphDefaultPresetScopeShaders(fetchedPatch)
      : cloneNodeGraphPatch(nodeGraphDefaultPatch);
  } catch {
    return cloneNodeGraphPatch(nodeGraphDefaultPatch);
  }
}

function normalizeNodeGraphDefaultPresetScopeShaders(patch) {
  const normalized = cloneNodeGraphPatch(patch);
  for (const node of normalized.nodes || []) {
    if (!node || !Object.hasOwn(node, "scopeShader")) {
      continue;
    }
    const defaultSource = typeof nodeGraphScopeShaderDefaultSourceForType === "function"
      ? nodeGraphScopeShaderDefaultSourceForType(node.type)
      : nodeGraphScopeShaderDefaultSource;
    node.scopeShader = normalizeNodeGraphScopeShader({
      enabled: true,
      language: "scope-js",
      source: defaultSource,
    });
  }
  return normalized;
}

function nodeGraphDefaultPresetPatchIsUsable(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return false;
  }
  const hasOutput = patch.nodes.some((node) => node?.id === "output" && node?.type === "output");
  const visibleNodeCount = patch.nodes.filter((node) => (
    typeof nodeGraphModuleShouldBeVisible === "function"
      ? nodeGraphModuleShouldBeVisible(node)
      : Boolean(node)
  )).length;
  if (!(hasOutput && visibleNodeCount > 1)) {
    return false;
  }
  // Efficient product default must not ship foreign DSP (audioPlayer, etc.) —
  // those refuse the entire live plan and look like "engine on, no audio".
  if (typeof nodeGraphEfficientProductEnabled === "function"
    && nodeGraphEfficientProductEnabled()
    && typeof nodeGraphEfficientProductForeignTypesFromNodes === "function") {
    const foreign = nodeGraphEfficientProductForeignTypesFromNodes(patch.nodes);
    if (foreign.length) {
      return false;
    }
  }
  return true;
}

function nodeGraphLocalDefaultPresetAllowed() {
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
}

function loadNodeGraphLocalDefaultPresetPatch() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return null;
  }
  try {
    const text = window.localStorage.getItem(nodeGraphDefaultPresetStorageKey);
    return text ? loadNodeGraphPatchFromScript(text) : null;
  } catch {
    return null;
  }
}

function saveNodeGraphLocalDefaultPreset(text) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(nodeGraphDefaultPresetStorageKey, text);
    return true;
  } catch {
    return false;
  }
}

function configureNodeGraphDefaultPresetButton() {
  const button = document.getElementById("updateDefaultPresetButton");
  if (!button || !nodeGraphLocalDefaultPresetAllowed()) {
    return;
  }
  button.hidden = false;
}
