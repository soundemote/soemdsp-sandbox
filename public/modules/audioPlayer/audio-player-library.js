// Music Player folder library: catalog is names/sizes only.
// Visible playlist is a 100-track window. Decode only the playing file.
// Shuffle applies when filling the next window, never while playing it.

var NODE_GRAPH_AUDIO_PLAYER_LIBRARY_WINDOW = 100;

function nodeGraphAudioPlayerLibraryWindowSize() {
  const n = Number(NODE_GRAPH_AUDIO_PLAYER_LIBRARY_WINDOW);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 100;
}

function nodeGraphAudioPlayerLibraryShuffleTake(list, count) {
  const pool = Array.isArray(list) ? list.slice() : [];
  const want = Math.max(0, Math.min(pool.length, Math.round(Number(count) || 0)));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return pool.slice(0, want);
}

function nodeGraphAudioPlayerLibraryPickWindow(catalog, usedPaths, size, shuffle) {
  const all = Array.isArray(catalog) ? catalog.filter((file) => file && file.path) : [];
  const used = new Set((Array.isArray(usedPaths) ? usedPaths : []).map((path) => String(path || "")));
  used.delete("");
  let unused = all.filter((file) => !used.has(file.path));
  let wrapped = false;
  if (!unused.length && all.length) {
    unused = all.slice();
    used.clear();
    wrapped = true;
  }
  const want = Math.max(1, Math.round(Number(size) || nodeGraphAudioPlayerLibraryWindowSize()));
  const picked = shuffle
    ? nodeGraphAudioPlayerLibraryShuffleTake(unused, want)
    : unused.slice(0, want);
  const nextUsed = [...used, ...picked.map((file) => file.path)];
  return { items: picked, used: nextUsed, wrapped };
}

function nodeGraphAudioPlayerLibraryFileKey(file) {
  if (!file) {
    return "";
  }
  const name = String(file.name || "").trim();
  const size = Math.max(0, Math.round(Number(file.size) || 0));
  const stamp = Math.max(0, Math.round(Number(file.lastModified) || 0));
  return `${name}:${size}:${stamp}`;
}

function nodeGraphAudioPlayerLibraryCatalogs() {
  if (!globalThis.nodeGraphAudioPlayerLibraryCatalogMap) {
    globalThis.nodeGraphAudioPlayerLibraryCatalogMap = new Map();
  }
  return globalThis.nodeGraphAudioPlayerLibraryCatalogMap;
}

function nodeGraphAudioPlayerLibraryFiles() {
  if (!globalThis.nodeGraphAudioPlayerLibraryFileMap) {
    globalThis.nodeGraphAudioPlayerLibraryFileMap = new Map();
  }
  return globalThis.nodeGraphAudioPlayerLibraryFileMap;
}

function nodeGraphAudioPlayerLibraryPlayTokens() {
  if (!globalThis.nodeGraphAudioPlayerLibraryPlayTokenMap) {
    globalThis.nodeGraphAudioPlayerLibraryPlayTokenMap = new Map();
  }
  return globalThis.nodeGraphAudioPlayerLibraryPlayTokenMap;
}

function nodeGraphAudioPlayerLibraryNormalizeCard(raw, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const path = String(source.path || source.sourcePath || "").trim();
  const fileKey = String(source.fileKey || "").trim();
  const name = String(source.name || source.rel || path.split(/[\\/]/).pop() || fileKey || `track-${index + 1}`)
    .trim()
    .slice(0, 220);
  const rel = String(source.rel || "").trim().replace(/\\/g, "/");
  const label = (rel && rel.includes("/") ? rel : name).slice(0, 220) || name;
  const sampleId = String(source.sampleId || "").trim();
  if (!path && !fileKey && !sampleId) {
    return null;
  }
  return {
    bytes: Math.max(0, Math.round(Number(source.bytes) || 0)),
    channels: Math.max(0, Math.round(Number(source.channels) || 0)),
    fileKey,
    frames: Math.max(0, Math.round(Number(source.frames) || 0)),
    id: String(source.id || `pl-${index}-${label}`).slice(0, 80),
    name: label || name,
    path,
    sampleId,
    sampleRate: Math.max(0, Math.round(Number(source.sampleRate) || 0)),
  };
}

function nodeGraphAudioPlayerLibrarySetCatalog(nodeId, files) {
  const cards = (Array.isArray(files) ? files : [])
    .map((file, index) => nodeGraphAudioPlayerLibraryNormalizeCard(file, index))
    .filter(Boolean);
  nodeGraphAudioPlayerLibraryCatalogs().set(String(nodeId), cards);
  return cards;
}

function nodeGraphAudioPlayerLibraryCatalog(nodeId) {
  return nodeGraphAudioPlayerLibraryCatalogs().get(String(nodeId)) || [];
}

function nodeGraphAudioPlayerLibraryFillWindow(nodeId, { persist = true, refresh = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const catalog = nodeGraphAudioPlayerLibraryCatalog(nodeId);
  const picked = nodeGraphAudioPlayerLibraryPickWindow(
    catalog,
    pl.used,
    nodeGraphAudioPlayerLibraryWindowSize(),
    Boolean(pl.shuffle),
  );
  pl.items = picked.items.map((file, index) => nodeGraphAudioPlayerLibraryNormalizeCard(file, index));
  pl.used = picked.used;
  pl.index = 0;
  pl.selectedIndex = 0;
  node.playlist = pl;
  if (typeof nodeGraphAudioPlayerPlaylistEnsureCurrentSample === "function") {
    nodeGraphAudioPlayerPlaylistEnsureCurrentSample(nodeId, { persist: false, refresh: false });
  }
  if (refresh && typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  if (persist && typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
  return pl;
}

function nodeGraphAudioPlayerLibraryReleaseOrphans(nodeId, keepId = "") {
  const keep = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(keepId)
    : String(keepId || "").trim();
  const patch = nodeGraphMvp?.patch;
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const held = new Set();
  if (keep) {
    held.add(keep);
  }
  for (const other of nodes) {
    if (!other || other.id === nodeId) {
      continue;
    }
    const sid = typeof normalizeNodeGraphSampleId === "function"
      ? normalizeNodeGraphSampleId(other.sample?.id)
      : String(other.sample?.id || "").trim();
    if (sid) {
      held.add(sid);
    }
  }
  const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
    ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
    : null;
  if (pl) {
    for (const item of pl.items) {
      const sid = String(item.sampleId || "").trim();
      if (sid && sid !== keep) {
        item.sampleId = "";
        item.frames = 0;
        item.sampleRate = 0;
        item.channels = 0;
      }
    }
  }
  const samples = Array.isArray(patch?.samples) ? patch.samples : [];
  if (patch) {
    patch.samples = samples.filter((sample) => {
      const sid = typeof normalizeNodeGraphSampleId === "function"
        ? normalizeNodeGraphSampleId(sample?.id)
        : String(sample?.id || "").trim();
      if (!sid || held.has(sid)) {
        return true;
      }
      nodeGraphMvp?.sampleBuffers?.delete?.(sid);
      return false;
    });
  }
}

async function nodeGraphAudioPlayerLibraryListFolder(folderPath, { dive = false } = {}) {
  const response = await fetch("/api/audio-file/list", {
    body: JSON.stringify({ dive: Boolean(dive), path: folderPath, recursive: Boolean(dive) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `folder list failed (${response.status})`);
  }
  return payload;
}

function nodeGraphAudioPlayerLibraryBindCards(nodeId, files, extras = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.folderPath = String(extras.folderPath || pl.folderPath || "").trim();
  if (Object.prototype.hasOwnProperty.call(extras, "folderDive")) {
    pl.folderDive = Boolean(extras.folderDive);
  }
  pl.used = [];
  node.playlist = pl;
  nodeGraphAudioPlayerLibrarySetCatalog(nodeId, files);
  return nodeGraphAudioPlayerLibraryFillWindow(nodeId, {
    persist: extras.persist !== false,
    refresh: extras.refresh !== false,
  });
}

async function nodeGraphAudioPlayerLibraryBindFolder(nodeId, folderPath, { dive = null, persist = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const recursive = dive == null ? Boolean(pl.folderDive) : Boolean(dive);
  const payload = await nodeGraphAudioPlayerLibraryListFolder(folderPath, { dive: recursive });
  if (payload.kind === "file") {
    return payload;
  }
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (!files.length) {
    throw new Error("folder has no supported audio files");
  }
  nodeGraphAudioPlayerLibraryBindCards(nodeId, files, {
    folderDive: recursive,
    folderPath: payload.path || folderPath,
    persist,
  });
  if (typeof setNodeGraphSampleStatus === "function") {
    setNodeGraphSampleStatus(
      nodeId,
      `${Math.min(files.length, nodeGraphAudioPlayerLibraryWindowSize())} of ${files.length} listed`,
    );
  }
  return payload;
}

function nodeGraphAudioPlayerLibraryBindBrowserFiles(nodeId, fileList) {
  const files = [...(fileList || [])];
  const store = nodeGraphAudioPlayerLibraryFiles();
  const cards = files.map((file, index) => {
    const fileKey = nodeGraphAudioPlayerLibraryFileKey(file);
    if (fileKey) {
      store.set(fileKey, file);
    }
    return nodeGraphAudioPlayerLibraryNormalizeCard({
      bytes: file.size,
      fileKey,
      name: file.name,
    }, index);
  }).filter(Boolean);
  return nodeGraphAudioPlayerLibraryBindCards(nodeId, cards, { folderPath: "" });
}

function nodeGraphAudioPlayerLibraryItemLoaded(item) {
  const sampleId = String(item?.sampleId || "").trim();
  if (!sampleId) {
    return false;
  }
  return Boolean(nodeGraphMvp?.sampleBuffers?.get?.(sampleId));
}

async function nodeGraphAudioPlayerLibraryEnsureItemLoaded(nodeId, item) {
  if (!item) {
    return null;
  }
  if (nodeGraphAudioPlayerLibraryItemLoaded(item)) {
    return item.sampleId;
  }
  const file = item.fileKey ? nodeGraphAudioPlayerLibraryFiles().get(item.fileKey) : null;
  if (file && typeof loadNodeGraphSampleForNode === "function") {
    const sample = await loadNodeGraphSampleForNode(nodeId, file, {
      commit: false,
      livePlan: false,
      persist: false,
      record: false,
      syncDisplay: false,
    });
    return sample?.id || "";
  }
  const path = String(item.path || "").trim();
  if (path && typeof loadNodeGraphSamplePathForNode === "function") {
    await loadNodeGraphSamplePathForNode(nodeId, path, {
      commit: false,
      livePlan: false,
      persist: false,
      record: false,
      singleFile: true,
      syncDisplay: false,
    });
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    return node?.sample?.id || "";
  }
  return item.sampleId || "";
}

async function nodeGraphAudioPlayerLibraryPlayIndex(nodeId, index, { autoplay = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    return;
  }
  const nextIndex = Math.max(0, Math.min(pl.items.length - 1, Math.round(Number(index) || 0)));
  const item = pl.items[nextIndex];
  if (!item) {
    return;
  }
  const tokens = nodeGraphAudioPlayerLibraryPlayTokens();
  const token = (Number(tokens.get(nodeId)) || 0) + 1;
  tokens.set(nodeId, token);
  pl.index = nextIndex;
  pl.selectedIndex = nextIndex;
  node.playlist = pl;
  if (!nodeGraphAudioPlayerLibraryItemLoaded(item)) {
    if (typeof setNodeGraphSampleStatus === "function") {
      setNodeGraphSampleStatus(nodeId, `loading ${item.name}...`);
    }
    try {
      const sampleId = await nodeGraphAudioPlayerLibraryEnsureItemLoaded(nodeId, item);
      if (tokens.get(nodeId) !== token) {
        return;
      }
      item.sampleId = sampleId || item.sampleId;
    } catch (error) {
      if (tokens.get(nodeId) !== token) {
        return;
      }
      const message = String(error?.message || error || "load failed");
      if (typeof setNodeGraphSampleStatus === "function") {
        setNodeGraphSampleStatus(nodeId, message);
      }
      return;
    }
  }
  const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : node;
  if (!live || tokens.get(nodeId) !== token) {
    return;
  }
  nodeGraphAudioPlayerLibraryReleaseOrphans(nodeId, item.sampleId || live.sample?.id);
  const ref = (typeof normalizeNodeGraphPatchSamples === "function"
    ? normalizeNodeGraphPatchSamples(nodeGraphMvp.patch?.samples || [])
    : [])
    .find((sample) => sample.id === item.sampleId);
  live.sample = ref
    ? { id: ref.id, name: ref.name || item.name }
    : (item.sampleId ? { id: item.sampleId, name: item.name } : live.sample);
  live.samplePhase = 0;
  live.samplePhaseSeek = (Math.round(Number(live.samplePhaseSeek) || 0) + 1) || 1;
  if (!live.params || typeof live.params !== "object") {
    live.params = {};
  }
  live.params.playlistScrub = "0";
  if (autoplay && typeof nodeGraphAudioPlayerWriteTransport === "function") {
    nodeGraphAudioPlayerWriteTransport(
      nodeId,
      nodeGraphAudioPlayerPlaylistPlayModeForLoop(pl.loopMode),
    );
  }
  const est = typeof nodeGraphAudioPlayerPlaylistEstimateBytes === "function"
    ? nodeGraphAudioPlayerPlaylistEstimateBytes(item.sampleId)
    : null;
  if (est?.loaded) {
    item.bytes = est.bytes || item.bytes;
    item.frames = est.frames;
    item.sampleRate = est.sampleRate;
    item.channels = est.channels;
  }
  if (typeof cloneNodeGraphPatch === "function" && typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(cloneNodeGraphPatch(nodeGraphMvp.patch), {
      record: false,
      status: `playing ${item.name}`,
    });
  } else if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync();
  }
  if (typeof syncNodeGraphSampleDisplayForNode === "function") {
    syncNodeGraphSampleDisplayForNode(nodeId);
  }
  if (typeof nodeGraphAudioPlayerPlaylistAdvanceArmed?.set === "function") {
    nodeGraphAudioPlayerPlaylistAdvanceArmed.set(nodeId, true);
  }
  if (typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
}

function nodeGraphAudioPlayerLibraryPlayNext(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    return;
  }
  const from = typeof nodeGraphAudioPlayerPlaylistPlayingFrom === "function"
    ? nodeGraphAudioPlayerPlaylistPlayingFrom(nodeId, pl)
    : pl.index;
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 4;
  const wrap = pl.loopMode === "all" || transport === 5;
  if (from + 1 < pl.items.length) {
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, from + 1, { autoplay: true });
    return;
  }
  let catalog = nodeGraphAudioPlayerLibraryCatalog(nodeId);
  if (!catalog.length && pl.folderPath) {
    nodeGraphAudioPlayerLibraryBindFolder(nodeId, pl.folderPath, { persist: false }).then(() => {
      nodeGraphAudioPlayerLibraryPlayNext(nodeId);
    }).catch((error) => {
      if (typeof setNodeGraphSampleStatus === "function") {
        setNodeGraphSampleStatus(nodeId, String(error?.message || error || "folder list failed"));
      }
    });
    return;
  }
  const unused = catalog.filter((file) => !(pl.used || []).includes(file.path));
  if (catalog.length && (unused.length || wrap)) {
    if (!unused.length && wrap) {
      pl.used = [];
    }
    const next = nodeGraphAudioPlayerLibraryFillWindow(nodeId, { persist: false, refresh: true });
    if (next?.items?.length) {
      nodeGraphAudioPlayerLibraryPlayIndex(nodeId, 0, { autoplay: true });
      return;
    }
  }
  if (wrap) {
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, 0, { autoplay: true });
    return;
  }
  if (typeof nodeGraphAudioPlayerWriteTransport === "function") {
    nodeGraphAudioPlayerWriteTransport(nodeId, 1);
  }
}

function nodeGraphAudioPlayerLibraryPlayPrev(nodeId) {
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    return;
  }
  // Always the previous item — never “restart this track if we’re past 0:00”.
  const from = typeof nodeGraphAudioPlayerPlaylistPlayingFrom === "function"
    ? nodeGraphAudioPlayerPlaylistPlayingFrom(nodeId, pl)
    : pl.index;
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 4;
  const wrap = pl.loopMode === "all" || transport === 5;
  if (from > 0) {
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, from - 1, { autoplay: true });
    return;
  }
  if (wrap) {
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, pl.items.length - 1, { autoplay: true });
  }
}

async function nodeGraphAudioPlayerLibraryToggleDive(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.folderDive = !pl.folderDive;
  node.playlist = pl;
  if (pl.folderPath) {
    await nodeGraphAudioPlayerLibraryBindFolder(nodeId, pl.folderPath, { dive: pl.folderDive });
    return;
  }
  if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
  if (typeof nodeGraphAudioPlayerPlaylistSyncTransport === "function") {
    nodeGraphAudioPlayerPlaylistSyncTransport(nodeId);
  }
}
