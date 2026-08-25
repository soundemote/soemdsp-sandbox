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

function nodeGraphSampleFileStore() {
  if (!(nodeGraphMvp?.sampleFiles instanceof Map)) {
    if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
      nodeGraphMvp.sampleFiles = new Map();
    }
  }
  return nodeGraphMvp?.sampleFiles || new Map();
}

function nodeGraphSampleFileKeyFromFile(file) {
  if (!file) {
    return "";
  }
  if (typeof nodeGraphAudioPlayerLibraryFileKey === "function") {
    return nodeGraphAudioPlayerLibraryFileKey(file);
  }
  const name = String(file.name || "").trim();
  const size = Math.max(0, Math.round(Number(file.size) || 0));
  const stamp = Math.max(0, Math.round(Number(file.lastModified) || 0));
  return name ? `${name}:${size}:${stamp}` : "";
}

function normalizeNodeGraphSampleReference(sample = {}) {
  const source = sample && typeof sample === "object" ? sample : {};
  const sourcePath = String(source.sourcePath || source.path || source.file?.sourcePath || source.file?.path || "").trim().slice(0, 512);
  const fileKey = String(source.fileKey || source.file?.fileKey || "").trim().slice(0, 220);
  // Keep an already-assigned id. Path/fileKey only mint an id for a new
  // reference — otherwise clone/bind from a playlist path retargets the
  // node onto a key the decoder never wrote (No sample loaded).
  const id = normalizeNodeGraphSampleId(source.id || source.resourceId || sourcePath || fileKey);
  const name = String(source.name || id || "Sample").trim().slice(0, 128);
  const resourceId = normalizeNodeGraphSampleId(source.resourceId || source.assetId || sourcePath || id);
  const sourceName = String(source.sourceName || source.fileName || source.file?.name || name || "").trim().slice(0, 160);
  const file = normalizeNodeGraphAssetFile(source.file, { ...source, name, sourceName, sourcePath });
  const metadata = normalizeNodeGraphAssetMetadata(source.metadata);
  const sampleRate = Math.max(0, Math.round(Number(source.sampleRate) || 0));
  const channels = Math.max(0, Math.min(64, Math.round(Number(source.channels) || 0)));
  const frames = Math.max(0, Math.round(Number(source.frames) || 0));
  return {
    acceptedTypes: ["audio/*"],
    ...(channels ? { channels } : {}),
    ...(fileKey ? { fileKey } : {}),
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

/** Patch/node pointer: location only. Never audio bytes. */
function normalizeNodeGraphNodeSamplePointer(sample = {}) {
  const ref = normalizeNodeGraphSampleReference(sample);
  if (!ref.id) {
    return null;
  }
  return {
    id: ref.id,
    ...(ref.fileKey ? { fileKey: ref.fileKey } : {}),
    ...(ref.name ? { name: ref.name } : {}),
    ...(ref.sourcePath ? { sourcePath: ref.sourcePath } : {}),
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

/** Patch sample bank is location metadata only. Never embed audio. */
function nodeGraphPatchSamplesWithoutEmbeddedAudio(samples = []) {
  return normalizeNodeGraphPatchSamples(samples);
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
    // Music Player window cards are path metadata. Only the playing sample
    // is a required decoded asset.
    const sampleIds = [normalizeNodeGraphSampleId(node.sample?.id)].filter(Boolean);
    for (const sampleId of sampleIds) {
      const sample = samples.get(sampleId) || {};
      const resource = typeof nodeGraphResourceById === "function"
        ? nodeGraphResourceById(sample.resourceId || sampleId)
        : null;
      const explicit = explicitAssets.get(sampleId) || {};
      const pointerPath = String(node.sample?.sourcePath || node.sample?.path || "").trim();
      const pointerKey = String(node.sample?.fileKey || "").trim();
      const file = normalizeNodeGraphAssetFile(explicit.file || sample.file, {
        name: sample.name || resource?.name || explicit.name || explicit.sourceName || sampleId,
        sourceName: sample.sourceName || resource?.sourceName || explicit.sourceName,
        sourcePath: sample.sourcePath || resource?.sourcePath || explicit.sourcePath || pointerPath,
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
        ...(sample.sourcePath || resource?.sourcePath || explicit.sourcePath || pointerPath
          ? { sourcePath: sample.sourcePath || resource?.sourcePath || explicit.sourcePath || pointerPath }
          : {}),
        ...(sample.fileKey || pointerKey ? { fileKey: sample.fileKey || pointerKey } : {}),
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

function nodeGraphNormalizeAudioFileKey(name = "") {
  return String(name || "").trim().toLowerCase().split(/[\\/]/).pop();
}

function nodeGraphMissingAssetMatchesFile(asset, file) {
  const fileName = nodeGraphNormalizeAudioFileKey(file?.name);
  if (!fileName) {
    return false;
  }
  const fileStem = fileName.replace(/\.[^.]+$/, "");
  return nodeGraphMissingAssetSearchNames(asset)
    .map((name) => nodeGraphNormalizeAudioFileKey(name))
    .filter(Boolean)
    .some((name) => {
      const stem = name.replace(/\.[^.]+$/, "");
      return name === fileName || stem === fileStem || name === fileStem || stem === fileName;
    });
}

function bindNodeGraphMissingSampleFolderLink() {
  const button = document.getElementById("nodeMissingSampleAssetsLinkFolder");
  const pathInput = document.getElementById("nodeMissingSampleAssetsPath");
  if (!button || button.dataset.bound === "1") {
    return;
  }
  button.dataset.bound = "1";
  const run = () => {
    const root = String(pathInput?.value || "").trim();
    loadNodeGraphMissingSamplesFromSearchPath(root).catch((error) => {
      const message = String(error?.message || error || "folder link failed");
      const status = document.getElementById("nodeMissingSampleAssetsLinkStatus");
      if (status) {
        status.textContent = message;
      }
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp(`Sample folder link failed: ${message}`);
      }
    });
  };
  button.addEventListener("click", (event) => {
    event.preventDefault();
    run();
  });
  pathInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
}

async function loadNodeGraphMissingSamplesFromSearchPath(rootPath) {
  const status = document.getElementById("nodeMissingSampleAssetsLinkStatus");
  const sourceRoot = String(rootPath || "").trim();
  const missing = nodeGraphMissingSampleAssets(nodeGraphMvp.patch);
  if (!sourceRoot) {
    if (status) {
      status.textContent = "paste a folder path first";
    }
    return;
  }
  if (!missing.length) {
    if (status) {
      status.textContent = "nothing missing";
    }
    return;
  }
  if (status) {
    status.textContent = `searching ${missing.length} missing…`;
  }
  beginNodeGraphSampleLoadLock({
    total: missing.length,
    title: "Loading missing samples",
  });
  let loaded = 0;
  let missed = 0;
  let batchError = "";
  const firstNodeId = nodeGraphMissingAssetPrimaryNodeId(missing[0]);
  try {
    for (let index = 0; index < missing.length; index += 1) {
      const asset = missing[index];
      const nodeId = nodeGraphMissingAssetPrimaryNodeId(asset);
      updateNodeGraphSampleLoadLock({
        index: index + 1,
        total: missing.length,
        name: asset.sourceName || asset.id || "audio",
      });
      if (!nodeId) {
        missed += 1;
        continue;
      }
      if (nodeGraphSampleRamWouldExceed(0)) {
        batchError = `Memory budget reached after ${loaded} file${loaded === 1 ? "" : "s"}.`;
        break;
      }
      try {
        await loadNodeGraphMissingSampleAssetFromPath(asset, sourceRoot, null);
        loaded += 1;
        const node = nodeGraphPatchNode(nodeId);
        if (node?.type === "audioPlayer" && typeof nodeGraphAudioPlayerPlaylistAppendSample === "function") {
          nodeGraphAudioPlayerPlaylistAppendSample(nodeId, {
            id: node?.sample?.id,
            name: asset.sourceName || node?.sample?.name,
          }, { persist: false, refresh: false });
        }
      } catch (_error) {
        missed += 1;
      }
    }
  } catch (error) {
    batchError = String(error?.message || error || "folder search failed");
  }
  await finishNodeGraphSampleLoadBatch(firstNodeId, {
    count: loaded,
    playlist: Boolean(nodeGraphPatchNode(firstNodeId)?.type === "audioPlayer"),
    error: batchError,
  });
  renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
  if (status) {
    status.textContent = batchError
      ? batchError
      : `loaded ${loaded}${missed ? `, ${missed} not found` : ""}`;
  }
}

async function loadNodeGraphMissingSamplesFromFolderFiles(files = []) {
  const status = document.getElementById("nodeMissingSampleAssetsLinkStatus");
  const missing = nodeGraphMissingSampleAssets(nodeGraphMvp.patch);
  if (!files.length) {
    if (status) {
      status.textContent = "no folder selected";
    }
    return;
  }
  const matches = [];
  for (const asset of missing) {
    const file = files.find((candidate) => nodeGraphMissingAssetMatchesFile(asset, candidate));
    if (file) {
      matches.push({ asset, file });
    }
  }
  if (!matches.length) {
    if (status) {
      status.textContent = `no matches in that folder (${files.length} file${files.length === 1 ? "" : "s"})`;
    }
    return;
  }
  if (status) {
    status.textContent = `loading ${matches.length} match${matches.length === 1 ? "" : "es"}…`;
  }
  beginNodeGraphSampleLoadLock({
    total: matches.length,
    title: "Loading missing samples",
  });
  let loaded = 0;
  let batchError = "";
  const firstNodeId = nodeGraphMissingAssetPrimaryNodeId(matches[0].asset);
  try {
    for (let index = 0; index < matches.length; index += 1) {
      const { asset, file } = matches[index];
      const nodeId = nodeGraphMissingAssetPrimaryNodeId(asset);
      updateNodeGraphSampleLoadLock({
        index: index + 1,
        total: matches.length,
        name: file.name || asset.sourceName || "audio",
      });
      if (!nodeId) {
        continue;
      }
      if (nodeGraphSampleRamWouldExceed(0)) {
        batchError = `Memory budget reached after ${loaded} file${loaded === 1 ? "" : "s"}.`;
        break;
      }
      try {
        await loadNodeGraphSampleForNode(nodeId, file, {
          commit: false,
          persist: false,
          livePlan: false,
          record: false,
          syncDisplay: false,
        });
        loaded += 1;
        const node = nodeGraphPatchNode(nodeId);
        if (node?.type === "audioPlayer" && typeof nodeGraphAudioPlayerPlaylistAppendSample === "function") {
          nodeGraphAudioPlayerPlaylistAppendSample(nodeId, {
            id: node?.sample?.id,
            name: file.name || node?.sample?.name,
          }, { persist: false, refresh: false });
        }
      } catch (error) {
        const message = String(error?.message || error || "load failed");
        if (/memory budget/i.test(message)) {
          batchError = message;
          break;
        }
      }
    }
  } catch (error) {
    batchError = String(error?.message || error || "folder load failed");
  }
  await finishNodeGraphSampleLoadBatch(firstNodeId, {
    count: loaded,
    playlist: Boolean(nodeGraphPatchNode(firstNodeId)?.type === "audioPlayer"),
    error: batchError,
  });
  renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
  if (status) {
    status.textContent = batchError
      ? batchError
      : `loaded ${loaded} of ${matches.length} from folder`;
  }
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
    const fileKey = sample?.fileKey || asset.fileKey || "";
    const held = Boolean(fileKey && nodeGraphSampleFileStore().get(fileKey));
    return !cached && !resource && !held && !sample?.sourcePath && !sample?.file?.sourcePath && !asset.sourcePath;
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

function renderNodeGraphMissingSampleAssetsDialog(_patch = nodeGraphMvp.patch) {
  const dialog = document.getElementById("nodeMissingSampleAssetsDialog");
  if (dialog) {
    dialog.hidden = true;
  }
  document.body.classList.remove("node-missing-samples-open");
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

function nodeGraphSamplePhaseElementsForNode(nodeId) {
  return [...document.querySelectorAll("[data-sample-phase-for-node]")]
    .filter((element) => element.dataset.samplePhaseForNode === nodeId);
}

function nodeGraphSamplePhaseElementForNode(nodeId) {
  return nodeGraphSamplePhaseElementsForNode(nodeId)[0] || null;
}

function nodeGraphAudioPlayerLiveSpeedForNode(nodeId) {
  const id = String(nodeId || "");
  const reported = Number(nodeGraphMvp.sampleRuntimeStatus?.get?.(id)?.speed);
  if (Number.isFinite(reported)) {
    if (!nodeGraphMvp.audioPlayerActualSpeeds) {
      nodeGraphMvp.audioPlayerActualSpeeds = new Map();
    }
    nodeGraphMvp.audioPlayerActualSpeeds.set(id, reported);
    return reported;
  }
  const held = Number(nodeGraphMvp.audioPlayerActualSpeeds?.get?.(id));
  return Number.isFinite(held) ? held : null;
}

function syncNodeGraphAudioPlayerSpeedReadout(nodeId) {
  const nodeElement = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(nodeId)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(nodeId || ""))}"]`);
  const slider = nodeElement?.querySelector?.('input[data-param="speed"]');
  if (slider && typeof syncNodeSliderReadout === "function") {
    syncNodeSliderReadout(slider);
  }
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

function rememberNodeGraphAudioPlayerSamplePhase(nodeId, phase, reason = "") {
  const node = nodeGraphPatchNode(nodeId);
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const why = String(reason || "").trim().toLowerCase();
  // End-of-file complete snapshots were overwriting samplePhase with 1, so the
  // next Play/plan rebuild restored the playhead at the end and instantly
  // completed again (Play looked dead until Stop then Play).
  if (why === "engine complete" || why === "engine stopped") {
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

const nodeGraphAudioPlayerLastEngineReason = new Map();

function syncNodeGraphAudioPlayerRuntimeStatus(message = {}) {
  const nodeIds = Array.isArray(message.nodeIds)
    ? message.nodeIds.map((id) => String(id || "")).filter(Boolean)
    : [];
  const primaryNodeId = String(message.nodeId || nodeIds[0] || "");
  const phase = Number(message.phase) || 0;
  const reason = String(message.reason || "").trim();
  const workletSampleId = String(message.sampleId || "").trim();
  const speeds = message.speeds && typeof message.speeds === "object" ? message.speeds : null;
  const primarySpeed = Number(message.speed);
  const activeIds = new Set(primaryNodeId ? [primaryNodeId] : nodeIds);
  for (const nodeId of nodeIds) {
    const mapped = speeds ? Number(speeds[nodeId]) : NaN;
    const speed = Number.isFinite(mapped)
      ? mapped
      : (activeIds.has(nodeId) && Number.isFinite(primarySpeed) ? primarySpeed : undefined);
    nodeGraphMvp.sampleRuntimeStatus?.set?.(nodeId, {
      phase: activeIds.has(nodeId) ? phase : 0,
      reason: activeIds.has(nodeId) ? reason : "engine not in live path",
      sampleId: activeIds.has(nodeId) ? workletSampleId : "",
      speed,
    });
  }
  if (primaryNodeId && !nodeGraphMvp.sampleRuntimeStatus?.has?.(primaryNodeId)) {
    nodeGraphMvp.sampleRuntimeStatus?.set?.(primaryNodeId, {
      phase,
      reason,
      sampleId: workletSampleId,
      speed: Number.isFinite(primarySpeed) ? primarySpeed : undefined,
    });
  }
  // Persist playhead on the active Music Player(s) for refresh restore.
  if (primaryNodeId && activeIds.has(primaryNodeId)) {
    rememberNodeGraphAudioPlayerSamplePhase(primaryNodeId, phase, reason);
  }
  for (const nodeId of nodeIds) {
    if (activeIds.has(nodeId) && nodeId !== primaryNodeId) {
      rememberNodeGraphAudioPlayerSamplePhase(nodeId, phase, reason);
    }
  }
  if (primaryNodeId && reason && typeof nodeGraphAudioPlayerLog === "function") {
    const interesting = reason.includes("sample")
      || reason === "engine playing"
      || reason === "engine looping"
      || reason === "engine complete"
      || reason === "engine stopped"
      || reason === "engine paused";
    const prev = nodeGraphAudioPlayerLastEngineReason.get(primaryNodeId) || "";
    if (interesting && prev !== reason) {
      nodeGraphAudioPlayerLastEngineReason.set(primaryNodeId, reason);
      const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(primaryNodeId) : null;
      const sampleId = workletSampleId || String(node?.sample?.id || "");
      const frames = sampleId ? (nodeGraphMvp?.sampleBuffers?.get?.(sampleId)?.frames || 0) : 0;
      const missing = reason.includes("sample");
      nodeGraphAudioPlayerLog(missing ? "FAIL" : "INFO", "engine", {
        nodeId: primaryNodeId,
        reason,
        sampleId,
        workletSampleId,
        nodeSampleId: String(node?.sample?.id || ""),
        frames,
      });
    }
  }
  for (const nodeId of new Set([...nodeIds, primaryNodeId].filter(Boolean))) {
    syncNodeGraphSampleDisplayForNode(nodeId);
    if (typeof syncNodeGraphAudioPlayerSpeedReadout === "function") {
      syncNodeGraphAudioPlayerSpeedReadout(nodeId);
    }
  }
  // Music Player playlist: auto-advance on complete + live scrubber value.
  if (primaryNodeId && typeof nodeGraphAudioPlayerPlaylistOnRuntimeStatus === "function") {
    nodeGraphAudioPlayerPlaylistOnRuntimeStatus(primaryNodeId, reason, workletSampleId);
  }
}

function syncNodeGraphSampleDisplayForNode(nodeId) {
  applyNodeGraphSampleTextRow(nodeGraphSampleNameElementForNode(nodeId), nodeGraphSampleNameForNode(nodeId));
  // Module body and waveform display settings each host a phase readout;
  // update every live copy so hiding the control surface still leaves a
  // correct number in settings.
  const phaseText = nodeGraphSamplePhaseForNode(nodeId).toFixed(4);
  for (const phaseElement of nodeGraphSamplePhaseElementsForNode(nodeId)) {
    phaseElement.textContent = phaseText;
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
  nodeGraphMvp.audioPlayerActualSpeeds?.delete?.(targetId);
  commitNodeGraphPatch(patch, {
    markPending: false,
    record: options.record !== false,
    status: `${sample.name} referenced`,
  });
  if (typeof nodeGraphAudioPlayerPlaylistEnsureCurrentSample === "function") {
    nodeGraphAudioPlayerPlaylistEnsureCurrentSample(targetId, {
      persist: options.record !== false,
      refresh: true,
    });
  }
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
  return "";
}

function nodeGraphSampleFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Sample file read failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

const nodeGraphSampleDecodeTargetRate = 44100;
let nodeGraphSampleDecodeAudioContext = null;

function nodeGraphSampleSharedDecodeContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio API unavailable");
  }
  if (!nodeGraphSampleDecodeAudioContext || nodeGraphSampleDecodeAudioContext.state === "closed") {
    try {
      nodeGraphSampleDecodeAudioContext = new AudioContextConstructor({
        sampleRate: nodeGraphSampleDecodeTargetRate,
      });
    } catch {
      nodeGraphSampleDecodeAudioContext = new AudioContextConstructor();
    }
  }
  return nodeGraphSampleDecodeAudioContext;
}

async function resampleNodeGraphAudioBuffer(audioBuffer, targetRate = nodeGraphSampleDecodeTargetRate) {
  const rate = Math.max(1, Number(targetRate) || nodeGraphSampleDecodeTargetRate);
  if (!audioBuffer || Math.round(Number(audioBuffer.sampleRate) || 0) === rate) {
    return audioBuffer;
  }
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) {
    return audioBuffer;
  }
  const frames = Math.max(1, Math.round(audioBuffer.length * (rate / Math.max(1, audioBuffer.sampleRate))));
  const offline = new Offline(audioBuffer.numberOfChannels || 1, frames, rate);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

function nodeGraphSampleChannelBytes(channelData = []) {
  let bytes = 0;
  for (const channel of channelData || []) {
    bytes += channel?.byteLength || 0;
  }
  return bytes;
}

function nodeGraphSampleDecodedRamBytes() {
  let bytes = 0;
  const buffers = nodeGraphMvp?.sampleBuffers;
  if (!buffers || typeof buffers.values !== "function") {
    return 0;
  }
  for (const buf of buffers.values()) {
    bytes += nodeGraphSampleChannelBytes(buf?.channelData);
    if (!buf?.channelData?.length && buf?.samples?.byteLength) {
      bytes += buf.samples.byteLength;
    }
  }
  return bytes;
}

function nodeGraphSampleRamBudgetBytes() {
  const heap = Number(performance?.memory?.jsHeapSizeLimit) || 0;
  if (heap > 0) {
    return Math.max(128 * 1024 * 1024, Math.floor(heap * 0.4));
  }
  return 512 * 1024 * 1024;
}

function nodeGraphSampleFormatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024 * 1024) {
    return `${Math.round(n / 1024)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function nodeGraphSampleRamWouldExceed(extraBytes = 0) {
  return nodeGraphSampleDecodedRamBytes() + Math.max(0, Number(extraBytes) || 0)
    > nodeGraphSampleRamBudgetBytes();
}

function bindNodeGraphSampleLoadLockClose() {
  const close = document.getElementById("nodeSampleLoadLockClose");
  if (!close || close.dataset.bound === "1") {
    return;
  }
  close.dataset.bound = "1";
  close.addEventListener("click", (event) => {
    event.preventDefault();
    endNodeGraphSampleLoadLock();
  });
}

function nodeGraphSampleLoadLockBlockEvent(event) {
  if (!document.body.classList.contains("node-sample-load-lock-open")) {
    return;
  }
  if (event.target?.closest?.("#nodeSampleLoadLockClose")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function bindNodeGraphSampleLoadLockGuard() {
  if (typeof document === "undefined" || document.documentElement.dataset.sampleLoadLockGuard === "1") {
    return;
  }
  document.documentElement.dataset.sampleLoadLockGuard = "1";
  document.addEventListener("pointerdown", nodeGraphSampleLoadLockBlockEvent, true);
  document.addEventListener("keydown", nodeGraphSampleLoadLockBlockEvent, true);
}

function beginNodeGraphSampleLoadLock({ total = 1, title = "Loading audio" } = {}) {
  bindNodeGraphSampleLoadLockClose();
  bindNodeGraphSampleLoadLockGuard();
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.sampleLoadLock = { active: true, total: Math.max(1, Number(total) || 1), index: 0 };
  }
  const lock = document.getElementById("nodeSampleLoadLock");
  const titleEl = document.getElementById("nodeSampleLoadLockTitle");
  const progress = document.getElementById("nodeSampleLoadLockProgress");
  const detail = document.getElementById("nodeSampleLoadLockDetail");
  const ram = document.getElementById("nodeSampleLoadLockRam");
  const close = document.getElementById("nodeSampleLoadLockClose");
  if (titleEl) {
    titleEl.textContent = title;
  }
  if (progress) {
    progress.textContent = `0 / ${Math.max(1, Number(total) || 1)}`;
  }
  if (detail) {
    detail.textContent = "Decoding files into RAM…";
    detail.title = "";
  }
  if (ram) {
    ram.textContent = `Decoded ${nodeGraphSampleFormatBytes(nodeGraphSampleDecodedRamBytes())} / budget ${nodeGraphSampleFormatBytes(nodeGraphSampleRamBudgetBytes())}`;
  }
  if (close) {
    close.hidden = true;
  }
  if (lock) {
    lock.hidden = false;
  }
  document.body.classList.add("node-sample-load-lock-open");
}

function updateNodeGraphSampleLoadLock({ index, total, name = "", error = "" } = {}) {
  const lockState = nodeGraphMvp?.sampleLoadLock;
  const nextIndex = Number.isFinite(Number(index)) ? Number(index) : (lockState?.index || 0);
  const nextTotal = Number.isFinite(Number(total)) ? Number(total) : (lockState?.total || 1);
  if (lockState) {
    lockState.index = nextIndex;
    lockState.total = nextTotal;
  }
  const progress = document.getElementById("nodeSampleLoadLockProgress");
  const detail = document.getElementById("nodeSampleLoadLockDetail");
  const ram = document.getElementById("nodeSampleLoadLockRam");
  if (progress) {
    progress.textContent = `${nextIndex} / ${nextTotal}`;
  }
  if (detail) {
    const line = error || name || "Decoding files into RAM…";
    detail.textContent = line;
    detail.title = line;
  }
  if (ram) {
    ram.textContent = `Decoded ${nodeGraphSampleFormatBytes(nodeGraphSampleDecodedRamBytes())} / budget ${nodeGraphSampleFormatBytes(nodeGraphSampleRamBudgetBytes())}`;
  }
}

function endNodeGraphSampleLoadLock({ error = "" } = {}) {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.sampleLoadLock = { active: false };
  }
  const lock = document.getElementById("nodeSampleLoadLock");
  const close = document.getElementById("nodeSampleLoadLockClose");
  if (error) {
    updateNodeGraphSampleLoadLock({ error });
    if (close) {
      close.hidden = false;
    }
    return;
  }
  if (lock) {
    lock.hidden = true;
  }
  if (close) {
    close.hidden = true;
  }
  document.body.classList.remove("node-sample-load-lock-open");
}

async function decodeNodeGraphSampleArrayBuffer(arrayBuffer, fallbackName = "Sample") {
  const context = nodeGraphSampleSharedDecodeContext();
  let audioBuffer = null;
  try {
    audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    audioBuffer = await resampleNodeGraphAudioBuffer(audioBuffer, nodeGraphSampleDecodeTargetRate);
  } catch (error) {
    throw new Error(nodeGraphSampleLoadErrorMessage(error, fallbackName));
  }
  const frames = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const channelData = Array.from({ length: channels }, (_, channel) =>
    new Float32Array(audioBuffer.getChannelData(channel)),
  );
  return {
    channelData,
    channels,
    frames,
    name: fallbackName,
    sampleRate: audioBuffer.sampleRate || nodeGraphSampleDecodeTargetRate,
  };
}

async function decodeNodeGraphSampleDataUrl(dataUrl, fallbackName = "Sample") {
  const response = await fetch(dataUrl);
  const arrayBuffer = await response.arrayBuffer();
  return decodeNodeGraphSampleArrayBuffer(arrayBuffer, fallbackName);
}

async function loadNodeGraphSampleForNode(nodeId, file, options = {}) {
  if (!file || !nodeId) {
    return null;
  }
  setNodeGraphSampleStatus(nodeId, `loading ${file.name || "audio"}...`);
  nodeGraphMvp.sampleLoadErrors?.delete?.(nodeId);
  const arrayBuffer = await file.arrayBuffer();
  try {
    const decoded = await decodeNodeGraphSampleArrayBuffer(arrayBuffer, file.name || "Sample");
    const rel = String(file.webkitRelativePath || "").replace(/\\/g, "/");
    return attachNodeGraphDecodedSampleToNode(nodeId, decoded, {
      file,
      fileKey: nodeGraphSampleFileKeyFromFile(file),
      sourceName: file.name || "Sample",
      sourcePath: String(options.sourcePath || rel || file.name || "").trim(),
    }, options);
  } catch (error) {
    setNodeGraphSampleStatus(nodeId, "browser decode failed; transcoding...");
    const dataUrl = await nodeGraphSampleFileToDataUrl(file);
    try {
      const transcoded = await transcodeNodeGraphSampleDataUrl(file.name || "Sample", dataUrl);
      const rel = String(file.webkitRelativePath || "").replace(/\\/g, "/");
      return loadNodeGraphSampleDataUrlForNode(nodeId, transcoded.dataUrl, transcoded.name || file.name || "Sample", {
        file,
        fileKey: nodeGraphSampleFileKeyFromFile(file),
        sourceName: file.name || "Sample",
        sourcePath: String(options.sourcePath || rel || file.name || "").trim(),
        ...options,
      });
    } finally {
      // Drop the base64 string immediately — it is the OOM path.
    }
  }
}

async function loadNodeGraphSamplePathForNode(nodeId, path, options = {}) {
  const sourcePath = String(path || "").trim();
  if (!nodeId || !sourcePath) {
    setNodeGraphSampleStatus(nodeId, "path required");
    return;
  }
  setNodeGraphSampleStatus(nodeId, "loading local path...");
  nodeGraphMvp.sampleLoadErrors?.delete?.(nodeId);
  const patchNode = nodeGraphPatchNode(nodeId);
  const isMusicPlayer = patchNode?.type === "audioPlayer";

  if (isMusicPlayer && !options.singleFile && typeof nodeGraphAudioPlayerLibraryBindFolder === "function") {
    try {
      const listed = await nodeGraphAudioPlayerLibraryBindFolder(nodeId, sourcePath);
      if (listed && listed.kind === "dir") {
        if (typeof nodeGraphAudioPlayerPlaylistSetFace === "function") {
          nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
        }
        return;
      }
    } catch (error) {
      if (String(error?.message || "").includes("folder has no")) {
        throw error;
      }
    }
  }

  const response = await fetch("/api/audio-file/bytes", {
    body: JSON.stringify({ path: sourcePath }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `local path load failed (${response.status})`);
  }
  const name = response.headers.get("X-Audio-File-Name")
    || sourcePath.split(/[\\/]/).pop()
    || "Sample";
  const arrayBuffer = await response.arrayBuffer();
  const decoded = await decodeNodeGraphSampleArrayBuffer(arrayBuffer, name);
  return attachNodeGraphDecodedSampleToNode(nodeId, decoded, {
    sourceName: name,
    sourcePath,
  }, {
    commit: options.commit,
    persist: options.persist,
    livePlan: options.livePlan,
    record: options.record,
    syncDisplay: options.syncDisplay,
  });
}

async function nodeGraphDataUrlForSampleReference(reference = {}) {
  const fileKey = String(reference.fileKey || "").trim();
  const held = fileKey ? nodeGraphSampleFileStore().get(fileKey) : null;
  if (held) {
    return nodeGraphBlobToDataUrl(held);
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

function attachNodeGraphDecodedSampleToNode(nodeId, decoded, sourceInfo = {}, options = {}) {
  const extra = nodeGraphSampleChannelBytes(decoded?.channelData);
  if (nodeGraphSampleRamWouldExceed(extra)) {
    throw new Error(
      `Memory budget reached (${nodeGraphSampleFormatBytes(nodeGraphSampleRamBudgetBytes())}). Stopped before this file.`,
    );
  }
  const name = decoded?.name || sourceInfo.sourceName || "Sample";
  const sourcePath = String(sourceInfo.sourcePath || "").trim();
  const fileKey = String(sourceInfo.fileKey || nodeGraphSampleFileKeyFromFile(sourceInfo.file) || "").trim();
  if (sourceInfo.file && fileKey) {
    nodeGraphSampleFileStore().set(fileKey, sourceInfo.file);
  }
  const sample = normalizeNodeGraphSampleReference({
    channels: decoded.channels,
    fileKey,
    frames: decoded.frames,
    name: name || "Sample",
    sampleRate: decoded.sampleRate,
    sourceName: sourceInfo.sourceName || name || "Sample",
    sourcePath,
  });
  const id = sample.id;
  if (!id) {
    throw new Error("sample has no file location");
  }
  if (!nodeGraphMvp.sampleBuffers) {
    nodeGraphMvp.sampleBuffers = new Map();
  }
  nodeGraphMvp.sampleBuffers.set(id, {
    channelData: decoded.channelData,
    channels: decoded.channels,
    frames: decoded.frames,
    id,
    name: sample.name,
    sampleRate: decoded.sampleRate,
  });
  const livePatch = nodeGraphMvp.patch;
  if (livePatch && options.commit === false) {
    const samples = normalizeNodeGraphPatchSamples(livePatch.samples).filter((entry) => entry.id !== id);
    samples.push(sample);
    livePatch.samples = samples;
    const node = livePatch.nodes?.find?.((candidate) => candidate.id === nodeId);
    if (node) {
      node.sample = normalizeNodeGraphNodeSamplePointer(sample);
      node.params = { ...(node.params || {}), sample: samples.length };
      if (node.type === "audioPlayer") {
        node.samplePhase = 0;
      }
    }
  } else {
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    const samples = normalizeNodeGraphPatchSamples(patch.samples).filter((entry) => entry.id !== id);
    samples.push(sample);
    patch.samples = samples;
    const node = patch.nodes.find((candidate) => candidate.id === nodeId);
    if (node) {
      node.sample = normalizeNodeGraphNodeSamplePointer(sample);
      node.params = { ...(node.params || {}), sample: samples.length };
      if (node.type === "audioPlayer") {
        node.samplePhase = 0;
      }
    }
    commitNodeGraphPatch(patch, {
      status: `${sample.name} loaded`,
      record: options.record !== false,
      autosaveWorkingPatch: options.persist !== false,
      skipLivePlan: options.livePlan === false,
    });
  }
  nodeGraphMvp.sampleLoadErrors?.delete?.(nodeId);
  nodeGraphMvp.sampleRuntimeStatus?.delete?.(nodeId);
  nodeGraphMvp.audioPlayerActualSpeeds?.delete?.(nodeId);
  if (typeof nodeGraphAudioPlayerLog === "function") {
    const liveType = nodeGraphPatchNode(nodeId)?.type || "";
    if (liveType === "audioPlayer") {
      nodeGraphAudioPlayerLog("INFO", "attached", {
        nodeId,
        sampleId: id,
        frames: decoded?.frames || 0,
        channels: decoded?.channels || 0,
        fileKey,
        sourcePath,
      });
    }
  }
  const liveNode = nodeGraphPatchNode(nodeId);
  if (liveNode?.type === "audioPlayer" && typeof nodeGraphAudioPlayerPlaylistEnsureCurrentSample === "function") {
    nodeGraphAudioPlayerPlaylistEnsureCurrentSample(nodeId, {
      persist: options.persist !== false && options.commit !== false,
      refresh: options.syncDisplay !== false,
    });
  }
  if (options.syncDisplay !== false) {
    syncNodeGraphSampleDisplayForNode(nodeId);
  }
  return sample;
}

async function loadNodeGraphSampleDataUrlForNode(nodeId, dataUrl, name = "Sample", sourceInfo = {}) {
  const decoded = await decodeNodeGraphSampleDataUrl(dataUrl, name || "Sample");
  return attachNodeGraphDecodedSampleToNode(nodeId, decoded, {
    file: sourceInfo.file,
    fileKey: sourceInfo.fileKey || "",
    sourceName: sourceInfo.sourceName || name || "Sample",
    sourcePath: sourceInfo.sourcePath || "",
  }, {
    commit: sourceInfo.commit,
    persist: sourceInfo.persist,
    livePlan: sourceInfo.livePlan,
    record: sourceInfo.record,
    syncDisplay: sourceInfo.syncDisplay,
  });
}

async function finishNodeGraphSampleLoadBatch(nodeId, { count = 0, playlist = false, error = "" } = {}) {
  const patch = nodeGraphMvp.patch;
  if (patch && typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(cloneNodeGraphPatch(patch), {
      status: error || (count ? `${count} track${count === 1 ? "" : "s"} loaded` : "load stopped"),
      record: true,
      autosaveWorkingPatch: true,
    });
  }
  if (typeof renderNodeGraphMissingSampleAssetsDialog === "function") {
    renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch);
  }
  syncNodeGraphSampleDisplayForNode(nodeId);
  if (playlist && typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  if (playlist && count > 1 && typeof nodeGraphAudioPlayerPlaylistSetFace === "function") {
    nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
  }
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync("plan");
  }
  if (error) {
    setNodeGraphSampleStatus(nodeId, error);
    setNodeInteractionHelp(error);
    endNodeGraphSampleLoadLock({ error });
    return;
  }
  setNodeGraphSampleStatus(nodeId, count ? `loaded ${count} track${count === 1 ? "" : "s"}` : "no files loaded");
  endNodeGraphSampleLoadLock();
}

// Phase readout + 📋 copy button. Used by the waveform display options window
// (right-click). Not mounted on the Music Player face.
function createNodeGraphSamplePhaseReadout(nodeId) {
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
  // folder button on the path row.
  phase.append(copyPhaseButton, phaseValue);
  return { phase, phaseValue, copyPhaseButton };
}

// Path loader: sample modules get 📂 + path box. Music Player keeps paste C:\
// for local server.py, plus Browse (📂) for soundemote.io / any host without
// the audio-file API. Used by the module body and Music Player Display Settings.
// `instance` namespaces the hidden file input's id so a second copy of the
// loader for the same node cannot collide with the module's own.
function createNodeGraphSamplePathLoader(nodeId, { instance = "" } = {}) {
  const patchNode = nodeGraphPatchNode(nodeId);
  const isMusicPlayer = patchNode?.type === "audioPlayer";
  const inputId = `node-sample-file-input-${normalizeNodeGraphSampleId(nodeId)}${instance ? `-${instance}` : ""}`;
  const input = isMusicPlayer ? null : document.createElement("input");
  if (input) {
    input.id = inputId;
    input.className = "node-sample-file-input";
    input.type = "file";
    input.accept = "audio/*,.wav,.wave,.mp3,.ogg,.oga,.opus,.flac,.m4a,.aac";
    input.title = "Load sample file";
    protectNodeGraphSampleControl(input);
    input.addEventListener("change", () => {
    const files = [...(input.files || [])];
    if (!files.length) {
      return;
    }
    (async () => {
      beginNodeGraphSampleLoadLock({
        total: files.length,
        title: "Loading sample",
      });
      let loaded = 0;
      let batchError = "";
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          updateNodeGraphSampleLoadLock({
            index: index + 1,
            total: files.length,
            name: file.name || "audio",
          });
          if (nodeGraphSampleRamWouldExceed(0)) {
            batchError = `Memory budget reached after ${loaded} file${loaded === 1 ? "" : "s"}.`;
            break;
          }
          try {
            await loadNodeGraphSampleForNode(nodeId, file, {
              commit: false,
              persist: false,
              livePlan: false,
              record: false,
              syncDisplay: false,
            });
            loaded += 1;
          } catch (error) {
            const message = String(error?.message || error || "load failed");
            if (/memory budget/i.test(message)) {
              batchError = message;
              break;
            }
          }
        }
      } catch (error) {
        batchError = String(error?.message || error || "load failed");
        nodeGraphMvp.sampleLoadErrors?.set?.(nodeId, batchError);
      }
      await finishNodeGraphSampleLoadBatch(nodeId, {
        count: loaded,
        playlist: false,
        error: batchError,
      });
    })();
    });
  }

  const pathShell = document.createElement("div");
  pathShell.className = "node-sample-path-loader";
  protectNodeGraphSampleControl(pathShell);
  const pathInput = document.createElement("input");
  pathInput.className = "node-sample-path-input";
  pathInput.type = "text";
  pathInput.spellcheck = false;
  protectNodeGraphSampleControl(pathInput);
  if (isMusicPlayer) {
    pathInput.dataset.samplePathForNode = nodeId;
    pathInput.placeholder = "Browse or paste C:\\folder or file (local server)";
    pathInput.title = "Online: use the folder button. Local python server.py: paste a full folder or audio file path, then Load Folder / Load File";
    const stored = typeof nodeGraphAudioPlayerLibraryStoredFolderPath === "function"
      ? nodeGraphAudioPlayerLibraryStoredFolderPath(
        typeof nodeGraphAudioPlayerPlaylistForNode === "function"
          ? nodeGraphAudioPlayerPlaylistForNode(nodeId)?.folderPath
          : "",
      )
      : "";
    pathInput.value = stored;
    const pathButton = document.createElement("button");
    pathButton.className = "node-sample-path-button";
    pathButton.type = "button";
    pathButton.textContent = "📂";
    pathButton.setAttribute("aria-label", "Browse folder");
    pathButton.title = "Browse a folder (works on soundemote.io/sandbox)";
    protectNodeGraphSampleControl(pathButton);
    pathButton.addEventListener("click", () => {
      if (typeof nodeGraphAudioPlayerLibraryBrowseFolder === "function") {
        nodeGraphAudioPlayerLibraryBrowseFolder(nodeId).catch((error) => {
          const message = String(error?.message || error || "browse failed");
          if (typeof setNodeGraphSampleStatus === "function") {
            setNodeGraphSampleStatus(nodeId, message);
          }
        });
      }
    });
    pathInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        pathInput.blur();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (typeof nodeGraphAudioPlayerLibraryLoadPlaylist === "function") {
          nodeGraphAudioPlayerLibraryLoadPlaylist(nodeId);
        }
        pathInput.blur();
      }
    });
    pathInput.addEventListener("blur", () => {
      const node = nodeGraphPatchNode(nodeId);
      if (!node || node.type !== "audioPlayer") {
        return;
      }
      const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
        ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
        : null;
      if (!pl) {
        return;
      }
      const typed = String(pathInput.value || "").trim();
      // Keep a browser-folder label visible; only OS paths are persisted for reload.
      if (/\(browser\)\s*$/i.test(typed) || typed.startsWith("browser:")) {
        return;
      }
      const next = typeof nodeGraphAudioPlayerLibraryStoredFolderPath === "function"
        ? nodeGraphAudioPlayerLibraryStoredFolderPath(typed)
        : "";
      if (pl.folderPath === next) {
        pathInput.value = next || typed;
        return;
      }
      pl.folderPath = next;
      pathInput.value = next;
      node.playlist = pl;
      if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
        nodeGraphAudioPlayerPlaylistPersist(nodeId);
      }
    });
    pathShell.append(pathButton, pathInput);
    return { fileInput: null, pathButton, pathInput, pathShell };
  }
  pathInput.placeholder = "C:\\path\\music.mp3";
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
  const pathButton = document.createElement("button");
  pathButton.className = "node-sample-path-button";
  pathButton.type = "button";
  pathButton.textContent = "📂";
  pathButton.setAttribute("aria-label", "Load sample from path");
  pathButton.title = "Load a path, or choose a sample file when the path box is empty";
  protectNodeGraphSampleControl(pathButton);
  pathButton.addEventListener("click", () => {
    if (!pathInput.value.trim()) {
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
  // Music Player load/path/status live in Display Settings + the waveform.
  // A module-body status row stole face height for picker chatter.
  if (patchNode?.type === "audioPlayer") {
    return null;
  }
  const body = document.createElement("div");
  body.className = "node-module-interface-controls node-sample-module-body";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(body, "controls");
  }
  const status = document.createElement("div");
  status.className = "node-sample-status";
  status.dataset.sampleStatusForNode = nodeId;
  applyNodeGraphSampleTextRow(status, nodeGraphSampleStatusForNode(nodeId));
  const { fileInput: input, pathShell } = createNodeGraphSamplePathLoader(nodeId);
  const name = document.createElement("div");
  name.className = "node-sample-name";
  name.dataset.sampleNameForNode = nodeId;
  applyNodeGraphSampleTextRow(name, nodeGraphSampleNameForNode(nodeId));
  const picker = document.createElement("label");
  picker.className = "node-sample-load-button node-sample-file-picker";
  picker.htmlFor = input.id;
  protectNodeGraphSampleControl(picker);
  const pickerText = document.createElement("span");
  pickerText.textContent = "Load Sample";
  picker.append(pickerText);
  body.append(name, status, picker, input, pathShell);
  return body;
}

async function nodeGraphDecodedSampleForReference(reference) {
  const fileKey = String(reference.fileKey || "").trim();
  const held = fileKey ? nodeGraphSampleFileStore().get(fileKey) : null;
  if (held) {
    const decoded = await decodeNodeGraphSampleArrayBuffer(await held.arrayBuffer(), reference.name || held.name || "Sample");
    return {
      channelData: decoded.channelData,
      channels: decoded.channels,
      frames: decoded.frames,
      id: reference.id,
      name: reference.name || decoded.name,
      sampleRate: decoded.sampleRate,
    };
  }
  const sourcePath = String(reference.sourcePath || reference.file?.sourcePath || "").trim();
  if (!sourcePath) {
    return null;
  }
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
    if (decoded?.channelData?.length || decoded?.samples?.length) {
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
      const decoded = await nodeGraphDecodedSampleForReference(reference);
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
