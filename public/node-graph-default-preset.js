// Factory / Clear-Startup / no-working-patch boot always resolves to Init
// (patches/init.json ≡ presets/default.json ≡ nodeGraphDefaultPatch).
// Local "Update Default Preset" may rewrite those files via /api, but boot
// never prefers a separate localStorage graph over Init when there is no
// working/autosaved patch.

const nodeGraphInitPatchUrls = Object.freeze([
  "./patches/init.json",
  "/soemdsp-sandbox/patches/init.json",
  "./public/presets/default.json",
]);

// Legacy key — still cleared on Clear Startup; no longer read for boot.
const nodeGraphDefaultPresetStorageKey = "soemdsp-sandbox.defaultPatch.live.v6";

async function nodeGraphDefaultPresetUrlToLoad() {
  const override = typeof nodeGraphResolveEmbedOverride === "function"
    ? await nodeGraphResolveEmbedOverride("defaultPresetUrl", "defaultPreset")
    : null;
  return override || "./public/presets/default.json";
}

function nodeGraphHardcodedInitPatch() {
  if (typeof nodeGraphDefaultPatch !== "undefined" && nodeGraphDefaultPatch) {
    return cloneNodeGraphPatch(nodeGraphDefaultPatch);
  }
  return { nodes: [], connections: [], format: { kind: "soemdsp-sandbox-node-patch", version: 2 } };
}

/**
 * Sole factory default when there is no working/autosaved patch.
 * Always Init — never a divergent localStorage "defaultPatch.live.*" blob.
 */
async function loadNodeGraphDefaultPresetPatch() {
  const urls = [];
  try {
    urls.push(await nodeGraphDefaultPresetUrlToLoad());
  } catch (_error) {
    // ignore override failure
  }
  for (const url of nodeGraphInitPatchUrls) {
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  for (const url of urls) {
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        continue;
      }
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_error) {
        data = null;
      }
      const raw = data?.kind === "sandbox_patch"
        ? (data.patch_data || data)
        : (data || null);
      const fetchedPatch = raw
        ? (typeof loadNodeGraphPatchFromObject === "function"
          ? loadNodeGraphPatchFromObject(raw)
          : (typeof loadNodeGraphPatchFromScript === "function"
            ? loadNodeGraphPatchFromScript(text)
            : raw))
        : (typeof loadNodeGraphPatchFromScript === "function"
          ? loadNodeGraphPatchFromScript(text)
          : null);
      if (nodeGraphDefaultPresetPatchIsUsable(fetchedPatch)) {
        return normalizeNodeGraphDefaultPresetScopeShaders(fetchedPatch);
      }
    } catch (_error) {
      // try next URL
    }
  }
  return normalizeNodeGraphDefaultPresetScopeShaders(nodeGraphHardcodedInitPatch());
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

/**
 * Old factory default (polyBlep→ladder→clip→reverb→pingpong). Sessions often
 * autosaved that as workingPatch when it was still the default — treat it as
 * "no real user patch" so boot falls through to Init.
 */
function nodeGraphPatchIsLegacyEfficientDefault(patch) {
  if (!patch || !Array.isArray(patch.nodes)) {
    return false;
  }
  const types = new Set(patch.nodes.map((node) => String(node?.type || "")));
  return types.has("polyBlep")
    && types.has("ladderFilter")
    && types.has("softClipper")
    && types.has("reverbEffect")
    && types.has("pingPongDelay")
    && types.has("output")
    && !types.has("textBox");
}

/** Working/autosave counts only when it is a real user graph, not legacy default. */
function nodeGraphWorkingPatchShouldRestore(patch) {
  if (!patch || !Array.isArray(patch.nodes) || patch.nodes.length === 0) {
    return false;
  }
  if (nodeGraphPatchIsLegacyEfficientDefault(patch)) {
    return false;
  }
  if (typeof nodeGraphDefaultPresetPatchIsUsable === "function"
    && !nodeGraphDefaultPresetPatchIsUsable(patch)) {
    return false;
  }
  return true;
}

function nodeGraphLocalDefaultPresetAllowed() {
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
}

function loadNodeGraphLocalDefaultPresetPatch() {
  // Boot no longer reads this. Kept for Clear Startup key cleanup / legacy.
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
