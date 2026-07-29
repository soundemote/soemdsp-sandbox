function normalizeNodeGraphSampleId(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

const nodeGraphAssetKinds = Object.freeze(["image", "video", "audio", "text", "meta", "app", "misc"]);

function normalizeNodeGraphAssetKind(kind = "misc") {
  const value = String(kind || "").trim().toLowerCase();
  return nodeGraphAssetKinds.includes(value) ? value : "misc";
}

function nodeGraphAssetFileNameFromPath(path = "") {
  return String(path || "").trim().split(/[\\/]/).pop() || "";
}

function nodeGraphAssetFileExtension(name = "") {
  const match = String(name || "").trim().match(/\.([^.\\/]+)$/);
  return match?.[1]?.toLowerCase?.().slice(0, 32) || "";
}

function normalizeNodeGraphAssetMetadataValue(value, depth = 0) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 128).map((item) => normalizeNodeGraphAssetMetadataValue(item, depth + 1));
  }
  if (value && typeof value === "object" && depth <= 4) {
    return normalizeNodeGraphAssetMetadata(value, depth + 1);
  }
  return String(value || "");
}

function normalizeNodeGraphAssetMetadata(metadata = {}, depth = 0) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || depth > 4) {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 128)) {
    const safeKey = String(key || "").trim().slice(0, 96);
    if (!safeKey) {
      continue;
    }
    normalized[safeKey] = normalizeNodeGraphAssetMetadataValue(value, depth);
  }
  return normalized;
}

function normalizeNodeGraphAssetFile(file = {}, fallback = {}) {
  const source = file && typeof file === "object" ? file : {};
  const fallbackPath = String(fallback.sourcePath || fallback.path || "").trim();
  const sourcePath = String(source.sourcePath || source.path || fallbackPath).trim().slice(0, 512);
  const fallbackName = String(fallback.sourceName || fallback.fileName || fallback.name || "").trim();
  const pathName = nodeGraphAssetFileNameFromPath(sourcePath);
  const name = String(source.name || source.fileName || fallbackName || pathName || "").trim().slice(0, 160);
  const extension = String(source.extension || nodeGraphAssetFileExtension(name || pathName)).trim().toLowerCase().slice(0, 32);
  const mime = String(source.mime || source.type || fallback.mime || fallback.type || "").trim().slice(0, 128);
  const size = Math.max(0, Math.round(Number(source.size ?? fallback.size) || 0));
  const hash = String(source.hash || fallback.hash || "").trim().slice(0, 160);
  return {
    ...(extension ? { extension } : {}),
    ...(hash ? { hash } : {}),
    ...(mime ? { mime } : {}),
    ...(name ? { name } : {}),
    ...(size ? { size } : {}),
    ...(sourcePath ? { sourcePath } : {}),
  };
}

function normalizeNodeGraphSampleReference(sample = {}) {
  const source = sample && typeof sample === "object" ? sample : {};
  const pathId = String(source.path || source.sourcePath || source.file?.sourcePath || source.file?.path || "").trim();
  const id = normalizeNodeGraphSampleId(source.id || source.resourceId || pathId);
  const name = String(source.name || id || "Sample").trim().slice(0, 128);
  const dataUrl = String(source.dataUrl || "").trim();
  const resourceId = normalizeNodeGraphSampleId(source.resourceId || source.assetId || pathId || id);
  const sourceName = String(source.sourceName || source.fileName || source.file?.name || name || "").trim().slice(0, 160);
  const sourcePath = String(source.sourcePath || source.path || source.file?.sourcePath || source.file?.path || "").trim().slice(0, 512);
  const file = normalizeNodeGraphAssetFile(source.file, { ...source, name, sourceName, sourcePath });
  const metadata = normalizeNodeGraphAssetMetadata(source.metadata);
  const sampleRate = Math.max(0, Math.round(Number(source.sampleRate) || 0));
  const channels = Math.max(0, Math.min(64, Math.round(Number(source.channels) || 0)));
  const frames = Math.max(0, Math.round(Number(source.frames) || 0));
  return {
    acceptedTypes: ["audio/*"],
    ...(channels ? { channels } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    ...(frames ? { frames } : {}),
    id,
    kind: "audio",
    file,
    metadata,
    name,
    ...(resourceId ? { resourceId } : {}),
    ...(sampleRate ? { sampleRate } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(sourcePath ? { sourcePath } : {}),
  };
}

function normalizeNodeGraphPatchSamples(samples = []) {
  if (!Array.isArray(samples)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const sample of samples) {
    const reference = normalizeNodeGraphSampleReference(sample);
    if (!reference.id || seen.has(reference.id)) {
      continue;
    }
    seen.add(reference.id);
    normalized.push(reference);
  }
  return normalized.slice(0, 128);
}

function nodeGraphPatchSampleById(sampleId, patch = nodeGraphMvp.patch) {
  const id = normalizeNodeGraphSampleId(sampleId);
  return normalizeNodeGraphPatchSamples(patch?.samples).find((sample) => sample.id === id) ||
    (typeof nodeGraphSampleReferenceFromResource === "function" ? nodeGraphSampleReferenceFromResource(id) : null);
}

function normalizeNodeGraphRequiredAsset(asset = {}) {
  const source = asset && typeof asset === "object" ? asset : {};
  const id = normalizeNodeGraphSampleId(source.id || source.assetId);
  if (!id) {
    return null;
  }
  const requiredBy = Array.isArray(source.requiredBy)
    ? source.requiredBy.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 32)
    : [];
  const nodeIds = Array.isArray(source.nodeIds)
    ? source.nodeIds.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 32)
    : [];
  const kind = normalizeNodeGraphAssetKind(source.kind);
  const resourceId = normalizeNodeGraphSampleId(source.resourceId || source.assetId);
  const file = normalizeNodeGraphAssetFile(source.file, source);
  const sourceName = String(source.sourceName || source.fileName || file.name || "").trim().slice(0, 160);
  const sourcePath = String(source.sourcePath || source.path || file.sourcePath || "").trim().slice(0, 512);
  const metadata = normalizeNodeGraphAssetMetadata(source.metadata);
  return {
    acceptedTypes: Array.isArray(source.acceptedTypes) && source.acceptedTypes.length
      ? source.acceptedTypes.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 16)
      : [`${kind}/*`],
    file,
    id,
    kind,
    metadata,
    name: String(source.name || file.name || source.sourceName || id).trim().slice(0, 160) || id,
    nodeIds,
    requiredBy,
    ...(resourceId
      ? { resourceId }
      : {}),
    ...(sourceName
      ? { sourceName }
      : {}),
    ...(sourcePath
      ? { sourcePath }
      : {}),
  };
}

function normalizeNodeGraphPatchRequiredAssets(requiredAssets = []) {
  if (!Array.isArray(requiredAssets)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const asset of requiredAssets) {
    const reference = normalizeNodeGraphRequiredAsset(asset);
    if (!reference || seen.has(reference.id)) {
      continue;
    }
    seen.add(reference.id);
    normalized.push(reference);
  }
  return normalized.slice(0, 128);
}

function nodeGraphSampleRequiredByLabel(node = {}) {
  if (typeof nodeGraphPatchNodeTitle === "function") {
    return nodeGraphPatchNodeTitle(node);
  }
  return String(node.alias || node.id || node.type || "module").trim();
}

function nodeGraphRequiredAssetsForPatch(patch = {}) {
  const explicitAssets = new Map(
    normalizeNodeGraphPatchRequiredAssets(patch.requiredAssets)
      .map((asset) => [asset.id, asset]),
  );
  const samples = new Map(normalizeNodeGraphPatchSamples(patch.samples).map((sample) => [sample.id, sample]));
  const assets = new Map();
  for (const node of patch.nodes || []) {
    if (!(node?.type === "samplePlayer" || node?.type === "sampleLooper" || node?.type === "audioPlayer")) {
      continue;
    }
    const sampleId = normalizeNodeGraphSampleId(node.sample?.id);
    if (!sampleId) {
      continue;
    }
    const sample = samples.get(sampleId) || {};
    const resource = typeof nodeGraphResourceById === "function"
      ? nodeGraphResourceById(sample.resourceId || sampleId)
      : null;
    const explicit = explicitAssets.get(sampleId) || {};
    const file = normalizeNodeGraphAssetFile(explicit.file || sample.file, {
      name: sample.name || resource?.name || explicit.name || explicit.sourceName || sampleId,
      sourceName: sample.sourceName || resource?.sourceName || explicit.sourceName,
      sourcePath: sample.sourcePath || resource?.sourcePath || explicit.sourcePath,
    });
    const metadata = {
      ...normalizeNodeGraphAssetMetadata(sample.metadata),
      ...normalizeNodeGraphAssetMetadata(explicit.metadata),
    };
    const current = assets.get(sampleId) || {
      acceptedTypes: ["audio/*"],
      file,
      id: sampleId,
      kind: "audio",
      metadata,
      name: sample.name || resource?.name || explicit.name || explicit.sourceName || sampleId,
      nodeIds: [],
      requiredBy: [],
      ...(sample.resourceId || resource?.id ? { resourceId: sample.resourceId || resource.id } : {}),
      ...(sample.sourceName || resource?.sourceName || explicit.sourceName ? { sourceName: sample.sourceName || resource?.sourceName || explicit.sourceName } : {}),
      ...(sample.sourcePath || resource?.sourcePath || explicit.sourcePath ? { sourcePath: sample.sourcePath || resource?.sourcePath || explicit.sourcePath } : {}),
    };
    const label = nodeGraphSampleRequiredByLabel(node);
    if (label && !current.requiredBy.includes(label)) {
      current.requiredBy.push(label);
    }
    if (node.id && !current.nodeIds.includes(node.id)) {
      current.nodeIds.push(node.id);
    }
    assets.set(sampleId, current);
  }
  return normalizeNodeGraphPatchRequiredAssets([...assets.values()]);
}

function nodeGraphMissingAssetSearchNames(asset = {}) {
  const values = [
    asset.sourcePath,
    asset.sourceName,
    asset.name,
    asset.id,
  ];
  const sampleMatch = String(asset.id || "").match(/^sample-\d+-(.+)$/);
  if (sampleMatch?.[1]) {
    values.push(sampleMatch[1].replace(/-/g, " "));
    values.push(sampleMatch[1]);
  }
  const names = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) {
      continue;
    }
    const name = text.split(/[\\/]/).pop();
    for (const candidate of [text, name]) {
      const cleaned = String(candidate || "").trim();
      if (cleaned && !names.includes(cleaned)) {
        names.push(cleaned);
      }
    }
  }
  return names.slice(0, 12);
}

function nodeGraphMissingAssetPrimaryNodeId(asset = {}) {
  const ids = Array.isArray(asset.nodeIds) ? asset.nodeIds : [];
  return ids.find((id) => nodeGraphPatchNode(id)) || "";
}

async function loadNodeGraphMissingSampleAssetFromPath(asset, rootPath, statusElement = null) {
  const nodeId = nodeGraphMissingAssetPrimaryNodeId(asset);
  const sourceRoot = String(rootPath || "").trim();
  if (!nodeId) {
    throw new Error("missing asset has no target module");
  }
  if (!sourceRoot) {
    throw new Error("paste a folder or file path first");
  }
  if (statusElement) {
    statusElement.textContent = "searching...";
  }
  const response = await fetch("/api/audio-file/find", {
    body: JSON.stringify({
      names: nodeGraphMissingAssetSearchNames(asset),
      root: sourceRoot,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok || !payload?.path) {
    throw new Error(payload?.error || `audio search failed (${response.status})`);
  }
  if (statusElement) {
    statusElement.textContent = `found ${payload.name || "audio"}; loading...`;
  }
  await loadNodeGraphSamplePathForNode(nodeId, payload.path);
  if (statusElement) {
    statusElement.textContent = `loaded ${payload.name || "audio"}`;
  }
}

function nodeGraphMissingSampleAssets(patch = nodeGraphMvp.patch) {
  const samples = new Map(normalizeNodeGraphPatchSamples(patch.samples).map((sample) => [sample.id, sample]));
  return nodeGraphRequiredAssetsForPatch(patch).filter((asset) => {
    const sample = samples.get(asset.id);
    const resource = typeof nodeGraphResourceById === "function"
      ? nodeGraphResourceById(sample?.resourceId || asset.resourceId || asset.id)
      : null;
    const cached = nodeGraphMvp.sampleBuffers?.get?.(asset.id);
    return !cached && !resource && !sample?.dataUrl && !sample?.sourcePath && !sample?.file?.sourcePath;
  });
}

function nodeGraphMissingSampleAssetsFingerprint(missing = []) {
  return missing
    .map((asset) => [
      asset.id,
      asset.sourcePath || "",
      asset.sourceName || "",
      (asset.nodeIds || []).join(","),
    ].join("|"))
    .sort()
    .join("\n");
}

function dismissNodeGraphMissingSampleAssetsDialog() {
  const dialog = document.getElementById("nodeMissingSampleAssetsDialog");
  const missing = nodeGraphMissingSampleAssets(nodeGraphMvp.patch);
  nodeGraphMvp.dismissedMissingSampleAssetsFingerprint = nodeGraphMissingSampleAssetsFingerprint(missing);
  if (dialog) {
    dialog.hidden = true;
  }
  document.body.classList.remove("node-missing-samples-open");
}

function renderNodeGraphMissingSampleAssetsDialog(patch = nodeGraphMvp.patch) {
  const dialog = document.getElementById("nodeMissingSampleAssetsDialog");
  const list = document.getElementById("nodeMissingSampleAssetsList");
  if (!dialog || !list) {
    return;
  }
  const missing = nodeGraphMissingSampleAssets(patch);
  const fingerprint = nodeGraphMissingSampleAssetsFingerprint(missing);
  if (!missing.length) {
    nodeGraphMvp.dismissedMissingSampleAssetsFingerprint = "";
  }
  const dismissed = Boolean(fingerprint && fingerprint === nodeGraphMvp.dismissedMissingSampleAssetsFingerprint);
  list.replaceChildren();
  for (const asset of missing) {
    const item = document.createElement("li");
    const source = document.createElement("span");
    source.textContent = asset.sourcePath
      ? `looking for: ${asset.sourcePath}`
      : `looking for: ${asset.sourceName || asset.id}`;
    const usedBy = document.createElement("small");
    usedBy.textContent = asset.requiredBy?.length
      ? `required by: ${asset.requiredBy.join(", ")}`
      : "required by: this patch";
    const controls = document.createElement("div");
    controls.className = "node-missing-sample-assets-controls";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.spellcheck = false;
    pathInput.placeholder = "paste folder or file path";
    pathInput.value = asset.sourcePath || "";
    const searchButton = document.createElement("button");
    searchButton.type = "button";
    searchButton.textContent = "Search Path";
    const status = document.createElement("small");
    status.className = "node-missing-sample-assets-status";
    searchButton.addEventListener("click", () => {
      loadNodeGraphMissingSampleAssetFromPath(asset, pathInput.value, status).catch((error) => {
        const message = String(error?.message || error || "asset search failed");
        status.textContent = message;
        setNodeInteractionHelp(`Sample search failed: ${message}`);
      });
    });
    pathInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchButton.click();
      }
    });
    controls.append(pathInput, searchButton);
    item.append(source, usedBy, controls, status);
    list.append(item);
  }
  dialog.hidden = missing.length === 0 || dismissed;
  document.body.classList.toggle("node-missing-samples-open", missing.length > 0 && !dismissed);
}

function nodeGraphSampleNameForNode(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  const sample = nodeGraphPatchSampleById(node?.sample?.id);
  if (sample?.name) {
    return sample.name;
  }
  // The Music Player's waveform display already draws its own "No sample
  // loaded" placeholder, so a second empty-state line here is pure wasted
  // height. Blank => the row hides itself (see applyNodeGraphSampleTextRow).
  // Other sample modules have no waveform, so they keep the wording.
  return node?.type === "audioPlayer" ? "" : "No sample";
}

// Sets a sample text row's content and collapses the row entirely when the
// text is empty, so a blank placeholder does not reserve vertical space.
function applyNodeGraphSampleTextRow(element, text) {
  if (!element) {
    return;
  }
  const value = String(text ?? "");
  element.textContent = value;
  element.hidden = value === "";
}

function nodeGraphSampleLoadErrorMessage(error, fileName = "audio") {
  const suffix = String(fileName || "")
    .split(".")
    .pop()
    ?.toLowerCase() || "";
  const detail = String(error?.message || error || "").trim();
  const format = suffix ? `.${suffix}` : "this file";
  if (suffix === "ogg" || suffix === "oga" || suffix === "opus") {
    return `could not decode ${format}; try WAV/MP3/FLAC or another OGG codec`;
  }
  return `could not decode ${format}${detail ? `: ${detail}` : ""}`;
}

function nodeGraphSampleStatusElementForNode(nodeId) {
  return [...document.querySelectorAll("[data-sample-status-for-node]")]
    .find((element) => element.dataset.sampleStatusForNode === nodeId) || null;
}

function nodeGraphSampleNameElementForNode(nodeId) {
  return [...document.querySelectorAll("[data-sample-name-for-node]")]
    .find((element) => element.dataset.sampleNameForNode === nodeId) || null;
}

function nodeGraphSamplePhaseElementForNode(nodeId) {
  return [...document.querySelectorAll("[data-sample-phase-for-node]")]
    .find((element) => element.dataset.samplePhaseForNode === nodeId) || null;
}

function nodeGraphSamplePhaseForNode(nodeId) {
  const phase = Number(nodeGraphMvp.sampleRuntimeStatus?.get?.(nodeId)?.phase);
  if (Number.isFinite(phase)) {
    return Math.max(0, Math.min(1, phase));
  }
  // Fall back to patch-remembered playhead before the engine has reported.
  const saved = Number(nodeGraphPatchNode(nodeId)?.samplePhase);
  return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0;
}

// Debounced write of Music Player playhead into the working patch so a page
// refresh restores the same position. Throttled to avoid autosave thrash.
const nodeGraphAudioPlayerPhasePersistTimers = new Map();
const nodeGraphAudioPlayerPhasePersistMs = 400;

function flushNodeGraphAudioPlayerSamplePhase(nodeId) {
  nodeGraphAudioPlayerPhasePersistTimers.delete(nodeId);
  const live = nodeGraphPatchNode(nodeId);
  if (!live || live.type !== "audioPlayer") {
    return;
  }
  const statusPhase = Number(nodeGraphMvp.sampleRuntimeStatus?.get?.(nodeId)?.phase);
  if (Number.isFinite(statusPhase)) {
    live.samplePhase = Math.max(0, Math.min(1, statusPhase));
  }
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings({ immediateFile: true });
  }
}

function flushAllNodeGraphAudioPlayerSamplePhases() {
  for (const node of nodeGraphMvp.patch?.nodes || []) {
    if (node?.type === "audioPlayer") {
      const statusPhase = Number(nodeGraphMvp.sampleRuntimeStatus?.get?.(node.id)?.phase);
      if (Number.isFinite(statusPhase)) {
        node.samplePhase = Math.max(0, Math.min(1, statusPhase));
      }
    }
  }
  for (const timer of nodeGraphAudioPlayerPhasePersistTimers.values()) {
    window.clearTimeout(timer);
  }
  nodeGraphAudioPlayerPhasePersistTimers.clear();
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings({ immediateFile: true });
  }
}

function rememberNodeGraphAudioPlayerSamplePhase(nodeId, phase) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const clamped = Math.max(0, Math.min(1, Number(phase) || 0));
  const previous = Number(node.samplePhase);
  if (Number.isFinite(previous) && Math.abs(previous - clamped) < 1e-5) {
    return;
  }
  node.samplePhase = clamped;
  if (nodeGraphAudioPlayerPhasePersistTimers.has(nodeId)) {
    return;
  }
  const timer = window.setTimeout(() => {
    flushNodeGraphAudioPlayerSamplePhase(nodeId);
  }, nodeGraphAudioPlayerPhasePersistMs);
  nodeGraphAudioPlayerPhasePersistTimers.set(nodeId, timer);
}

// Best-effort flush so a refresh mid-debounce still keeps the last playhead.
if (typeof window !== "undefined" && !window.__nodeGraphAudioPlayerPhaseUnloadBound) {
  window.__nodeGraphAudioPlayerPhaseUnloadBound = true;
  window.addEventListener("pagehide", () => {
    if (typeof flushAllNodeGraphAudioPlayerSamplePhases === "function") {
      flushAllNodeGraphAudioPlayerSamplePhases();
    }
  });
}

function nodeGraphSampleNodeHasSpeakerRoute(nodeId, patch = nodeGraphMvp.patch) {
  const sourceId = String(nodeId || "").trim();
  if (!sourceId || !patch || !Array.isArray(patch.connections)) {
    return false;
  }
  const outputPorts = new Set(typeof nodeGraphOutputInputPorts !== "undefined"
    ? nodeGraphOutputInputPorts
    : ["Mono", "Left", "Right"]);
  const downstream = new Map();
  for (const connection of patch.connections || []) {
    const sourceNode = String(connection?.sourceNode || "").trim();
    const destinationNode = String(connection?.destinationNode || "").trim();
    if (!sourceNode || !destinationNode) {
      continue;
    }
    const links = downstream.get(sourceNode) || [];
    links.push({
      nodeId: destinationNode,
      port: String(connection?.destinationPort || "").trim(),
    });
    downstream.set(sourceNode, links);
  }
  const visited = new Set();
  const queue = [sourceId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const link of downstream.get(current) || []) {
      if (link.nodeId === "output" && outputPorts.has(link.port)) {
        return true;
      }
      if (!visited.has(link.nodeId)) {
        queue.push(link.nodeId);
      }
    }
  }
  return false;
}

function nodeGraphSamplePhaseCopyTextForNode(nodeId) {
  return nodeGraphSamplePhaseForNode(nodeId).toPrecision(17);
}

async function copyNodeGraphSamplePhaseForNode(nodeId) {
  const text = nodeGraphSamplePhaseCopyTextForNode(nodeId);
  if (typeof copyTextToClipboard === "function") {
    await copyTextToClipboard(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
  setNodeInteractionHelp(`Copied phase ${text}`);
}

function setNodeGraphSampleStatus(nodeId, message) {
  applyNodeGraphSampleTextRow(nodeGraphSampleStatusElementForNode(nodeId), message);
  return message;
}

function nodeGraphSampleRuntimeStatusText(nodeId) {
  const status = nodeGraphMvp.sampleRuntimeStatus?.get?.(nodeId);
  if (!status) {
    return "";
  }
  const samples = Math.max(0, Math.round(Number(status.samples) || 0));
  const peak = Math.max(0, Number(status.peak) || 0);
  const reason = String(status.reason || "").trim();
  if (samples <= 0) {
    return reason || "engine not in live path";
  }
  if (peak > 0.00001) {
    return `engine pk ${peak.toFixed(3)}`;
  }
  return reason || "engine silent";
}

function syncNodeGraphAudioPlayerRuntimeStatus(message = {}) {
  const nodeIds = Array.isArray(message.nodeIds)
    ? message.nodeIds.map((id) => String(id || "")).filter(Boolean)
    : [];
  const primaryNodeId = String(message.nodeId || nodeIds[0] || "");
  const peak = Number(message.peak) || 0;
  const phase = Number(message.phase) || 0;
  const samples = Number(message.samples) || 0;
  const reason = String(message.reason || "").trim();
  const activeIds = new Set(primaryNodeId ? [primaryNodeId] : nodeIds);
  for (const nodeId of nodeIds) {
    nodeGraphMvp.sampleRuntimeStatus?.set?.(nodeId, {
      peak: activeIds.has(nodeId) ? peak : 0,
      phase: activeIds.has(nodeId) ? phase : 0,
      reason: activeIds.has(nodeId) ? reason : "engine not in live path",
      samples: activeIds.has(nodeId) ? samples : 0,
    });
  }
  if (primaryNodeId && !nodeGraphMvp.sampleRuntimeStatus?.has?.(primaryNodeId)) {
    nodeGraphMvp.sampleRuntimeStatus?.set?.(primaryNodeId, { peak, phase, reason, samples });
  }
  // Persist playhead on the active Music Player(s) for refresh restore.
  if (primaryNodeId && activeIds.has(primaryNodeId)) {
    rememberNodeGraphAudioPlayerSamplePhase(primaryNodeId, phase);
  }
  for (const nodeId of nodeIds) {
    if (activeIds.has(nodeId) && nodeId !== primaryNodeId) {
      rememberNodeGraphAudioPlayerSamplePhase(nodeId, phase);
    }
  }
  for (const nodeId of new Set([...nodeIds, primaryNodeId].filter(Boolean))) {
    syncNodeGraphSampleDisplayForNode(nodeId);
  }
}

function syncNodeGraphSampleDisplayForNode(nodeId) {
  applyNodeGraphSampleTextRow(nodeGraphSampleNameElementForNode(nodeId), nodeGraphSampleNameForNode(nodeId));
  const phaseElement = nodeGraphSamplePhaseElementForNode(nodeId);
  if (phaseElement) {
    phaseElement.textContent = nodeGraphSamplePhaseForNode(nodeId).toFixed(4);
  }
  setNodeGraphSampleStatus(nodeId, nodeGraphSampleStatusForNode(nodeId));
}

function nodeGraphAudioPlayerTargetNodeId(options = {}) {
  const explicit = String(options.nodeId || options.targetNodeId || options.audioPlayerNodeId || "").trim();
  if (explicit && nodeGraphPatchNode(explicit)?.type === "audioPlayer") {
    return explicit;
  }
  const selected = typeof nodeGraphSingleSelectedNodeId === "function"
    ? nodeGraphSingleSelectedNodeId()
    : "";
  if (selected && nodeGraphPatchNode(selected)?.type === "audioPlayer") {
    return selected;
  }
  const lastTarget = String(nodeGraphMvp.lastModuleActionTargetNode || "").trim();
  if (lastTarget && nodeGraphPatchNode(lastTarget)?.type === "audioPlayer") {
    return lastTarget;
  }
  return "";
}

function nodeGraphSampleReferenceFromFileGridResource(resource = {}) {
  const normalized = typeof normalizeNodeGraphFileGridResourceRow === "function"
    ? normalizeNodeGraphFileGridResourceRow(resource)
    : null;
  const entry = normalized || (typeof normalizeNodeGraphResourceEntry === "function"
    ? normalizeNodeGraphResourceEntry(resource)
    : null);
  if (!entry || entry.kind !== "audio") {
    return null;
  }
  return normalizeNodeGraphSampleReference({
    dataUrl: entry.dataUrl,
    file: entry.file,
    id: entry.id,
    kind: "audio",
    metadata: {
      ...normalizeNodeGraphAssetMetadata(entry.metadata),
      ...(entry.metadataSummary && typeof entry.metadataSummary === "object"
        ? normalizeNodeGraphAssetMetadata(entry.metadataSummary)
        : {}),
    },
    name: entry.name,
    resourceId: entry.id,
    sourceName: entry.sourceName || entry.name,
    sourcePath: entry.path,
  });
}

function nodeGraphSetAudioPlayerResource(nodeId, resourceRow, options = {}) {
  const targetId = String(nodeId || "").trim();
  const targetNode = nodeGraphPatchNode(targetId);
  if (!targetNode || targetNode.type !== "audioPlayer") {
    return { ok: false, reason: "target is not a Music Player" };
  }
  const resources = typeof registerNodeGraphResources === "function"
    ? registerNodeGraphResources([resourceRow])
    : [];
  const registered = resources.find((resource) =>
    resource.id === normalizeNodeGraphSampleId(resourceRow?.id || resourceRow?.resourceId || resourceRow?.path || resourceRow?.sourcePath)) ||
    (typeof normalizeNodeGraphFileGridResourceRow === "function" ? normalizeNodeGraphFileGridResourceRow(resourceRow) : null);
  const sample = nodeGraphSampleReferenceFromFileGridResource(registered || resourceRow);
  if (!sample?.id) {
    const message = "File Grid selection is not an audio resource";
    setNodeGraphSampleStatus(targetId, message);
    return { ok: false, reason: message };
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const samples = new Map(normalizeNodeGraphPatchSamples(patch.samples).map((entry) => [entry.id, entry]));
  samples.set(sample.id, sample);
  patch.samples = [...samples.values()];
  const node = patch.nodes.find((candidate) => candidate.id === targetId);
  if (node) {
    node.sample = { id: sample.id };
    node.params = { ...(node.params || {}), sample: patch.samples.length };
  }
  nodeGraphMvp.sampleLoadErrors?.delete?.(targetId);
  nodeGraphMvp.sampleRuntimeStatus?.delete?.(targetId);
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: options.record !== false,
    status: `${sample.name} referenced`,
  });
  syncNodeGraphSampleDisplayForNode(targetId);
  if (typeof renderNodeGraphMissingSampleAssetsDialog === "function") {
    renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
  }
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync("plan");
  }
  return { ok: true, nodeId: targetId, sample, resource: registered || resourceRow };
}

function stopNodeGraphSampleControlEvent(event) {
  event.stopPropagation();
}

function protectNodeGraphSampleControl(element) {
  for (const eventName of ["pointerdown", "mousedown", "click", "dblclick"]) {
    element.addEventListener(eventName, stopNodeGraphSampleControlEvent);
  }
  return element;
}

function nodeGraphSampleStatusForNode(nodeId) {
  const error = nodeGraphMvp.sampleLoadErrors?.get?.(nodeId);
  if (error) {
    return error;
  }
  const node = nodeGraphPatchNode(nodeId);
  const sample = nodeGraphPatchSampleById(node?.sample?.id);
  if (!sample?.id) {
    const asset = nodeGraphRequiredAssetsForPatch(nodeGraphMvp.patch)
      .find((candidate) => candidate.id === normalizeNodeGraphSampleId(node?.sample?.id));
    if (asset) {
      return `missing sample: ${asset.sourcePath || asset.sourceName || asset.name || asset.id}`;
    }
    // Same reasoning as nodeGraphSampleNameForNode: the waveform placeholder
    // already says it. A genuinely missing (referenced but absent) sample is
    // still reported above, because nothing else surfaces that.
    return node?.type === "audioPlayer" ? "" : "no audio loaded";
  }
  const cached = nodeGraphMvp.sampleBuffers?.get?.(sample.id);
  const frames = cached?.frames || sample.frames || 0;
  const channels = cached?.channels || sample.channels || 0;
  if (frames && channels) {
    const runtime = nodeGraphSampleRuntimeStatusText(nodeId);
    const route = nodeGraphSampleNodeHasSpeakerRoute(nodeId)
      ? ""
      : " / not routed to output";
    return `${channels}ch ${frames} frames ready${runtime ? ` / ${runtime}` : ""}${route}`;
  }
  return "audio referenced; reload file if silent";
}

function nodeGraphSampleFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Sample file read failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function decodeNodeGraphSampleDataUrl(dataUrl, fallbackName = "Sample") {
  const response = await fetch(dataUrl);
  const arrayBuffer = await response.arrayBuffer();
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio API unavailable");
  }
  const context = new AudioContextConstructor();
  let audioBuffer = null;
  try {
    audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
  } catch (error) {
    throw new Error(nodeGraphSampleLoadErrorMessage(error, fallbackName));
  } finally {
    await context.close?.();
  }
  const frames = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const channelData = Array.from({ length: channels }, (_, channel) =>
    new Float32Array(audioBuffer.getChannelData(channel)),
  );
  const mono = new Float32Array(frames);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = channelData[channel];
    for (let frame = 0; frame < frames; frame += 1) {
      mono[frame] += data[frame] / Math.max(1, channels);
    }
  }
  return {
    channelData,
    channels,
    frames,
    name: fallbackName,
    sampleRate: audioBuffer.sampleRate,
    samples: mono,
  };
}

async function loadNodeGraphSampleForNode(nodeId, file) {
  if (!file || !nodeId) {
    return;
  }
  setNodeGraphSampleStatus(nodeId, `loading ${file.name || "audio"}...`);
  nodeGraphMvp.sampleLoadErrors?.delete?.(nodeId);
  const dataUrl = await nodeGraphSampleFileToDataUrl(file);
  try {
    await loadNodeGraphSampleDataUrlForNode(nodeId, dataUrl, file.name || "Sample", {
      sourceName: file.name || "Sample",
    });
  } catch (error) {
    setNodeGraphSampleStatus(nodeId, "browser decode failed; transcoding...");
    const transcoded = await transcodeNodeGraphSampleDataUrl(file.name || "Sample", dataUrl);
    await loadNodeGraphSampleDataUrlForNode(nodeId, transcoded.dataUrl, transcoded.name || file.name || "Sample", {
      sourceName: file.name || "Sample",
    });
  }
}

async function loadNodeGraphSamplePathForNode(nodeId, path) {
  const sourcePath = String(path || "").trim();
  if (!nodeId || !sourcePath) {
    setNodeGraphSampleStatus(nodeId, "path required");
    return;
  }
  setNodeGraphSampleStatus(nodeId, "loading local path...");
  nodeGraphMvp.sampleLoadErrors?.delete?.(nodeId);
  const response = await fetch("/api/audio-file/data-url", {
    body: JSON.stringify({ path: sourcePath }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok || !payload?.dataUrl) {
    throw new Error(payload?.error || `local path load failed (${response.status})`);
  }
  await loadNodeGraphSampleDataUrlForNode(
    nodeId,
    payload.dataUrl,
    payload.name || sourcePath.split(/[\\/]/).pop() || "Sample",
    {
      sourceName: payload.name || sourcePath.split(/[\\/]/).pop() || "Sample",
      sourcePath,
    },
  );
}

async function nodeGraphDataUrlForSampleReference(reference = {}) {
  if (reference.dataUrl) {
    return reference.dataUrl;
  }
  const resource = typeof nodeGraphResourceById === "function"
    ? nodeGraphResourceById(reference.resourceId || reference.id) ||
      (typeof nodeGraphResourceByPath === "function" ? nodeGraphResourceByPath(reference.resourceId || reference.sourcePath || reference.id) : null)
    : null;
  if (resource?.path) {
    return nodeGraphDataUrlForResource(resource);
  }
  const sourcePath = String(reference.sourcePath || reference.file?.sourcePath || "").trim();
  if (!sourcePath) {
    return "";
  }
  const response = await fetch("/api/audio-file/data-url", {
    body: JSON.stringify({ path: sourcePath }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok || !payload?.dataUrl) {
    throw new Error(payload?.error || `local path load failed (${response.status})`);
  }
  return payload.dataUrl;
}

function nodeGraphBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Resource file read failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function nodeGraphDataUrlForResource(resource = {}) {
  const dataUrl = String(resource.dataUrl || "").trim();
  if (dataUrl) {
    return dataUrl;
  }
  const path = String(resource.path || resource.sourcePath || "").trim();
  if (!path) {
    return "";
  }
  if (/^data:/i.test(path)) {
    return path;
  }
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`resource load failed (${response.status})`);
  }
  return nodeGraphBlobToDataUrl(await response.blob());
}

async function transcodeNodeGraphSampleDataUrl(name, dataUrl) {
  const response = await fetch("/api/audio-file/transcode-data-url", {
    body: JSON.stringify({ dataUrl, name }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok || !payload?.dataUrl) {
    throw new Error(payload?.error || `audio transcode failed (${response.status})`);
  }
  return payload;
}

async function loadNodeGraphSampleDataUrlForNode(nodeId, dataUrl, name = "Sample", sourceInfo = {}) {
  const decoded = await decodeNodeGraphSampleDataUrl(dataUrl, name || "Sample");
  const id = normalizeNodeGraphSampleId(`sample-${Date.now()}-${name || "clip"}`);
  const sourcePath = String(sourceInfo.sourcePath || "").trim();
  const sample = normalizeNodeGraphSampleReference({
    channels: decoded.channels,
    dataUrl: sourcePath ? "" : dataUrl,
    frames: decoded.frames,
    id,
    name: name || "Sample",
    sampleRate: decoded.sampleRate,
    sourceName: sourceInfo.sourceName || name || "Sample",
    sourcePath,
  });
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const samples = normalizeNodeGraphPatchSamples(patch.samples);
  samples.push(sample);
  patch.samples = samples;
  const node = patch.nodes.find((candidate) => candidate.id === nodeId);
  if (node) {
    node.sample = { id };
    node.params = { ...(node.params || {}), sample: samples.length };
    // New sample → playhead starts at the beginning.
    if (node.type === "audioPlayer") {
      node.samplePhase = 0;
    }
  }
  nodeGraphMvp.sampleBuffers?.set?.(id, {
    channelData: decoded.channelData,
    channels: decoded.channels,
    frames: decoded.frames,
    id,
    name: sample.name,
    sampleRate: decoded.sampleRate,
    samples: decoded.samples,
  });
  nodeGraphMvp.sampleLoadErrors?.delete?.(nodeId);
  nodeGraphMvp.sampleRuntimeStatus?.delete?.(nodeId);
  commitNodeGraphPatch(patch, { status: `${sample.name} loaded` });
  const committedNode = nodeGraphPatchNode(nodeId);
  const committedSample = nodeGraphPatchSampleById(committedNode?.sample?.id);
  if (!committedSample?.id) {
    const message = `${sample.name} decoded, but was not attached to the patch`;
    nodeGraphMvp.sampleLoadErrors?.set?.(nodeId, message);
    setNodeGraphSampleStatus(nodeId, message);
    throw new Error(message);
  }
  const persistence = typeof saveNodeGraphWorkingPatchToUserSettings === "function"
    ? await Promise.resolve(saveNodeGraphWorkingPatchToUserSettings({ immediateFile: true, returnFileSave: true }))
    : { local: false, file: false };
  renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
  syncNodeGraphSampleDisplayForNode(nodeId);
  if (!persistence.local) {
    const fallbackStatus = persistence.file ? "saved to settings file" : "settings file save pending";
    setNodeGraphSampleStatus(nodeId, `${sample.name} loaded; ${fallbackStatus}`);
    setNodeInteractionHelp(
      persistence.file
        ? "Sample loaded. Browser storage was too small, so the patch was flushed to the settings file."
        : "Sample loaded. Browser storage was too small and the settings file fallback did not confirm.",
    );
  }
  scheduleNodeGraphLivePlanSync("plan");
}

// The 📂-button-plus-path-box loader, built once here so every place that
// offers "load a sample into this node" is the same widget with the same
// gestures (double-click the box to type, Enter loads, empty box + button
// opens the file picker). Used by the module body below and by the Waveform
// display options window (node-graph-phosphor-waveform.js).
// `instance` namespaces the hidden file input's id so a second copy of the
// loader for the same node cannot collide with the module's own.
function createNodeGraphSamplePathLoader(nodeId, { instance = "" } = {}) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const isMusicPlayer = patchNode?.type === "audioPlayer";
  const inputId = `node-sample-file-input-${normalizeNodeGraphSampleId(nodeId)}${instance ? `-${instance}` : ""}`;
  const input = document.createElement("input");
  input.id = inputId;
  input.className = "node-sample-file-input";
  input.type = "file";
  input.accept = "audio/*,.wav,.wave,.mp3,.ogg,.oga,.opus,.flac,.m4a,.aac";
  input.title = isMusicPlayer ? "Load music file" : "Load sample file";
  protectNodeGraphSampleControl(input);
  input.addEventListener("click", () => {
    setNodeGraphSampleStatus(nodeId, "file picker opened");
  });
  input.addEventListener("change", () => {
    setNodeGraphSampleStatus(nodeId, "file selection changed");
    const file = input.files?.[0];
    if (!file) {
      setNodeGraphSampleStatus(nodeId, "no file selected");
      return;
    }
    loadNodeGraphSampleForNode(nodeId, file).catch((error) => {
      const message = String(error?.message || error || "load failed");
      nodeGraphMvp.sampleLoadErrors?.set?.(nodeId, message);
      setNodeGraphSampleStatus(nodeId, message);
      setNodeInteractionHelp(`Sample load failed: ${message}`);
    });
  });

  const pathShell = document.createElement("div");
  pathShell.className = "node-sample-path-loader";
  protectNodeGraphSampleControl(pathShell);
  const pathInput = document.createElement("input");
  pathInput.className = "node-sample-path-input";
  pathInput.type = "text";
  pathInput.placeholder = "C:\\path\\music.mp3";
  pathInput.spellcheck = false;
  // Read-only until double-clicked, same gesture as the render range Start/End
  // fields -- a single stray click on a module should never put you in a text
  // field you did not mean to edit.
  pathInput.readOnly = true;
  pathInput.title = "Double-click to type a path";
  pathInput.addEventListener("dblclick", () => {
    pathInput.readOnly = false;
    pathInput.classList.add("editing");
    pathInput.focus();
    pathInput.select();
  });
  pathInput.addEventListener("blur", () => {
    pathInput.readOnly = true;
    pathInput.classList.remove("editing");
  });
  protectNodeGraphSampleControl(pathInput);
  const pathButton = document.createElement("button");
  pathButton.className = "node-sample-path-button";
  pathButton.type = "button";
  pathButton.textContent = "📂";
  pathButton.setAttribute("aria-label", isMusicPlayer ? "Load music from path" : "Load sample from path");
  pathButton.title = isMusicPlayer
    ? "Load a path, or choose a music file when the path box is empty"
    : "Load a path, or choose a sample file when the path box is empty";
  protectNodeGraphSampleControl(pathButton);
  pathButton.addEventListener("click", () => {
    if (!pathInput.value.trim()) {
      setNodeGraphSampleStatus(nodeId, isMusicPlayer ? "choose music file" : "choose sample file");
      input.click();
      return;
    }
    loadNodeGraphSamplePathForNode(nodeId, pathInput.value).catch((error) => {
      const message = String(error?.message || error || "path load failed");
      nodeGraphMvp.sampleLoadErrors?.set?.(nodeId, message);
      setNodeGraphSampleStatus(nodeId, message);
      setNodeInteractionHelp(`Sample path load failed: ${message}`);
    });
  });
  pathInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      pathInput.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      pathButton.click();
      pathInput.blur();
    }
  });
  pathShell.append(pathButton, pathInput);
  return { fileInput: input, pathButton, pathInput, pathShell };
}

function createNodeGraphSampleModuleBody(nodeOrId) {
  const nodeId = typeof nodeOrId === "string" ? nodeOrId : nodeOrId?.id;
  const patchNode = nodeGraphPatchNode(nodeId);
  const isMusicPlayer = patchNode?.type === "audioPlayer";
  const body = document.createElement("div");
  body.className = "node-module-interface-controls node-sample-module-body";
  const name = document.createElement("div");
  name.className = "node-sample-name";
  name.dataset.sampleNameForNode = nodeId;
  applyNodeGraphSampleTextRow(name, nodeGraphSampleNameForNode(nodeId));
  const status = document.createElement("div");
  status.className = "node-sample-status";
  status.dataset.sampleStatusForNode = nodeId;
  applyNodeGraphSampleTextRow(status, nodeGraphSampleStatusForNode(nodeId));
  const phase = document.createElement("div");
  phase.className = "node-sample-phase-readout";
  const phaseValue = document.createElement("strong");
  phaseValue.dataset.samplePhaseForNode = nodeId;
  phaseValue.textContent = nodeGraphSamplePhaseForNode(nodeId).toFixed(4);
  const copyPhaseButton = document.createElement("button");
  copyPhaseButton.className = "node-sample-copy-phase-button";
  copyPhaseButton.type = "button";
  copyPhaseButton.textContent = "📋";
  copyPhaseButton.setAttribute("aria-label", "Copy the current phase as a full precision number");
  copyPhaseButton.title = "Copy the current phase as a full precision number";
  protectNodeGraphSampleControl(copyPhaseButton);
  copyPhaseButton.addEventListener("click", () => {
    copyNodeGraphSamplePhaseForNode(nodeId).catch((error) => {
      const message = String(error?.message || error || "copy phase failed");
      setNodeInteractionHelp(message);
      setNodeGraphSampleStatus(nodeId, message);
    });
  });
  // Icon buttons sit on the LEFT of the thing they act on, matching the
  // folder button on the path row below.
  phase.append(copyPhaseButton, phaseValue);
  const { fileInput: input, pathShell } = createNodeGraphSamplePathLoader(nodeId);
  const inputId = input.id;
  const picker = document.createElement("label");
  picker.className = "node-sample-load-button node-sample-file-picker";
  picker.htmlFor = inputId;
  protectNodeGraphSampleControl(picker);
  const pickerText = document.createElement("span");
  pickerText.textContent = "Load Sample";
  picker.append(pickerText);
  body.append(name, status);
  if (!isMusicPlayer) {
    body.append(picker);
  }
  if (isMusicPlayer) {
    body.append(phase);
  }
  body.append(input);
  body.append(pathShell);
  return body;
}

async function nodeGraphDecodedSampleForReference(reference) {
  const dataUrl = await nodeGraphDataUrlForSampleReference(reference);
  if (!dataUrl) {
    return null;
  }
  const decoded = await decodeNodeGraphSampleDataUrl(dataUrl, reference.name);
  return {
    channelData: decoded.channelData,
    channels: decoded.channels,
    frames: decoded.frames,
    id: reference.id,
    name: reference.name,
    sampleRate: decoded.sampleRate,
    samples: decoded.samples,
  };
}

async function nodeGraphRuntimeSamplesForPlan(plan, patch = nodeGraphMvp.patch) {
  const needed = new Set(
    (plan?.nodes || [])
      .filter((node) => node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer")
      .map((node) => normalizeNodeGraphSampleId(node.sample?.id))
      .filter(Boolean),
  );
  if (!needed.size) {
    return [];
  }
  const samples = [];
  for (const reference of normalizeNodeGraphPatchSamples(patch.samples)) {
    if (!needed.has(reference.id)) {
      continue;
    }
    const decoded = await nodeGraphDecodedSampleForReference(reference);
    if (decoded?.samples?.length) {
      samples.push(decoded);
    }
  }
  return samples;
}

function nodeGraphLiveSampleForReference(reference) {
  const id = normalizeNodeGraphSampleId(reference?.id);
  const cached = id ? nodeGraphMvp.sampleBuffers?.get?.(id) : null;
  if (cached?.samples?.length || cached?.channelData?.length) {
    const channelData = (cached.channelData || []).map((channel) =>
      channel instanceof Float32Array ? channel : new Float32Array(channel || []));
    return {
      channelData,
      channels: cached.channels || channelData.length || 1,
      frames: cached.frames || cached.samples?.length || channelData[0]?.length || 0,
      id,
      name: cached.name || reference.name || id,
      sampleRate: cached.sampleRate || reference.sampleRate || 44100,
      samples: channelData.length
        ? new Float32Array(0)
        : (cached.samples instanceof Float32Array ? cached.samples : new Float32Array(cached.samples || [])),
    };
  }
  return null;
}

function nodeGraphLiveSamplesForPlan(plan, patch = nodeGraphMvp.patch) {
  const needed = new Set(
    (plan?.nodes || [])
      .filter((node) => node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer")
      .map((node) => normalizeNodeGraphSampleId(node.sample?.id))
      .filter(Boolean),
  );
  const references = normalizeNodeGraphPatchSamples(patch.samples);
  for (const sampleId of needed) {
    if (!references.some((reference) => reference.id === sampleId) && typeof nodeGraphSampleReferenceFromResource === "function") {
      const resourceReference = nodeGraphSampleReferenceFromResource(sampleId);
      if (resourceReference) {
        references.push(resourceReference);
      }
    }
  }
  return references
    .filter((reference) => needed.has(reference.id))
    .map((reference) => nodeGraphLiveSampleForReference(reference))
    .filter((sample) => sample?.id && (sample.samples?.length || sample.channelData?.length));
}

async function nodeGraphEnsureLiveSamplesForPlan(plan, patch = nodeGraphMvp.patch) {
  const needed = new Set(
    (plan?.nodes || [])
      .filter((node) => node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer")
      .map((node) => normalizeNodeGraphSampleId(node.sample?.id))
      .filter(Boolean),
  );
  if (!needed.size) {
    plan.samples = [];
    return plan.samples;
  }
  const references = normalizeNodeGraphPatchSamples(patch.samples);
  for (const sampleId of needed) {
    if (!references.some((reference) => reference.id === sampleId) && typeof nodeGraphSampleReferenceFromResource === "function") {
      const resourceReference = nodeGraphSampleReferenceFromResource(sampleId);
      if (resourceReference) {
        references.push(resourceReference);
      }
    }
  }
  for (const reference of references) {
    if (!needed.has(reference.id) || nodeGraphMvp.sampleBuffers?.has?.(reference.id)) {
      continue;
    }
    try {
      const dataUrl = await nodeGraphDataUrlForSampleReference(reference);
      if (!dataUrl) {
        continue;
      }
      const decoded = await nodeGraphDecodedSampleForReference({ ...reference, dataUrl });
      if (!decoded?.samples?.length && !decoded?.channelData?.length) {
        continue;
      }
      nodeGraphMvp.sampleBuffers?.set?.(reference.id, decoded);
    } catch (error) {
      const message = String(error?.message || error || "sample reload failed");
      for (const node of patch.nodes || []) {
        if (normalizeNodeGraphSampleId(node?.sample?.id) === reference.id) {
          nodeGraphMvp.sampleLoadErrors?.set?.(node.id, message);
        }
      }
    }
  }
  plan.samples = nodeGraphLiveSamplesForPlan(plan, patch);
  return plan.samples;
}
