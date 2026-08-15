function serializeNodeGraphPatch(patch = nodeGraphMvp.patch, options = {}) {
  const cameraState = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  const payload = {
    activeCameraId: cameraState.activeCameraId,
    audio: normalizeNodeGraphPatchAudio(patch.audio),
    bypassedNodes: patch.bypassedNodes || [],
    cameras: cameraState.cameras,
    codeScreen: typeof normalizeNodeGraphCodeScreen === "function"
      ? normalizeNodeGraphCodeScreen(patch.codeScreen)
      : patch.codeScreen,
    connections: patch.connections,
    format: { ...nodeGraphPatchFormat },
    graphConnections: patch.graphConnections || [],
    grid: patch.grid,
    info: normalizeNodeGraphPatchInfo(patch.info),
    modularOnlyControlsVisible: Boolean(patch.modularOnlyControlsVisible),
    modulations: patch.modulations || [],
    monitors: normalizeNodeGraphPatchMonitors(patch.monitors, patch),
    nodes: patch.nodes,
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patch)
      : [],
    samples: typeof normalizeNodeGraphPatchSamples === "function"
      ? normalizeNodeGraphPatchSamples(patch.samples)
      : [],
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems: normalizeNodeGraphPatchUiItems(patch.uiItems),
    view: normalizeNodeGraphPatchView(patch.view),
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: typeof normalizeNodeGraphPatchWindows === "function"
      ? normalizeNodeGraphPatchWindows(patch.windows)
      : patch.windows,
  };
  return options.pretty === false
    ? JSON.stringify(payload)
    : JSON.stringify(payload, null, 2);
}

function nodeGraphShareProjectData(patch = nodeGraphMvp.patch) {
  const patchToShare = typeof nodeGraphPatchWithLiveHeaderInfo === "function"
    ? nodeGraphPatchWithLiveHeaderInfo(patch)
    : patch;
  const info = normalizeNodeGraphPatchInfo(patchToShare.info);
  return {
    kind: "sandbox_patch",
    version: 1,
    title: info.name || "Untitled Project",
    bank_name: info.bankName || "",
    patch_data: JSON.parse(serializeNodeGraphPatch(patchToShare)),
    assets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patchToShare)
      : [],
    created_with: {
      app: "soemdsp-sandbox",
      patch_format: { ...nodeGraphPatchFormat },
    },
  };
}

function nodeGraphSharePayload(patch = nodeGraphMvp.patch) {
  const projectData = nodeGraphShareProjectData(patch);
  return {
    title: projectData.title,
    visibility: "unlisted",
    project_data: projectData,
  };
}

function nodeGraphEncodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function nodeGraphDecodeSharePayload(encoded = "") {
  const normalized = String(encoded || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function nodeGraphPatchFromShareProjectData(projectData = {}) {
  if (projectData?.kind !== "sandbox_patch") {
    throw new Error(`unsupported share kind: ${projectData?.kind || "unknown"}`);
  }
  if (!projectData.patch_data) {
    throw new Error("share payload is missing patch_data");
  }
  return loadNodeGraphPatchFromScript(JSON.stringify(projectData.patch_data));
}

function nodeGraphSharePayloadFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search || "");
  const encoded = params.get("share");
  return encoded ? nodeGraphDecodeSharePayload(encoded) : null;
}

function nodeGraphShareLinkForPatch(patch = nodeGraphMvp.patch) {
  const payload = nodeGraphSharePayload(patch);
  const encoded = nodeGraphEncodeSharePayload(payload);
  const url = new URL(
    window.location.hostname === "soundemote.io"
      ? window.location.href
      : "https://soundemote.io/sandbox",
  );
  url.searchParams.set("share", encoded);
  url.hash = "";
  return url.toString();
}

function nodeGraphPatchFingerprint(patch = nodeGraphMvp.patch) {
  const text = typeof patch === "string" ? patch : serializeNodeGraphPatch(patch);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
