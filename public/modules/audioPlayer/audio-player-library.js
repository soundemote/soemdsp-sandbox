// Music Player folder library: catalog is names/sizes only.
// Visible playlist is a 100-track window. Decode only the playing file.
// Shuffle applies when filling the next window, never while playing it.

var NODE_GRAPH_AUDIO_PLAYER_LIBRARY_WINDOW = 100;

const NODE_GRAPH_AUDIO_PLAYER_FORMATS = Object.freeze([
  { id: "wav", label: "wav", exts: Object.freeze([".wav", ".wave"]) },
  { id: "mp3", label: "mp3", exts: Object.freeze([".mp3"]) },
  { id: "ogg", label: "ogg", exts: Object.freeze([".ogg", ".oga"]) },
  { id: "flac", label: "flac", exts: Object.freeze([".flac"]) },
  { id: "m4a", label: "m4a", exts: Object.freeze([".m4a"]) },
  { id: "aac", label: "aac", exts: Object.freeze([".aac"]) },
  { id: "opus", label: "opus", exts: Object.freeze([".opus"]) },
]);

function nodeGraphAudioPlayerLibraryNormalizeFormats(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const next = {};
  for (const fmt of NODE_GRAPH_AUDIO_PLAYER_FORMATS) {
    const v = src[fmt.id];
    next[fmt.id] = v !== false && v !== "false" && v !== 0;
  }
  return next;
}

function nodeGraphAudioPlayerLibraryFileMatchesFormats(name, formats) {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  const enabled = nodeGraphAudioPlayerLibraryNormalizeFormats(formats);
  for (const fmt of NODE_GRAPH_AUDIO_PLAYER_FORMATS) {
    if (enabled[fmt.id] && fmt.exts.includes(ext)) {
      return true;
    }
  }
  return false;
}

function nodeGraphAudioPlayerLibraryFolderFileLists() {
  if (!globalThis.nodeGraphAudioPlayerLibraryFolderFileListMap) {
    globalThis.nodeGraphAudioPlayerLibraryFolderFileListMap = new Map();
  }
  return globalThis.nodeGraphAudioPlayerLibraryFolderFileListMap;
}

function nodeGraphAudioPlayerLibraryLooksLikeOsPath(path) {
  const p = String(path || "").trim();
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
}

function nodeGraphAudioPlayerLibraryStoredFolderPath(path) {
  const p = String(path || "").trim();
  return nodeGraphAudioPlayerLibraryLooksLikeOsPath(p) ? p : "";
}

function nodeGraphAudioPlayerLog(level, message, extra) {
  const text = extra !== undefined
    ? `[music-player] ${message} ${JSON.stringify(extra)}`
    : `[music-player] ${message}`;
  try {
    const se = typeof window !== "undefined" ? window.SE : null;
    if (level === "FAIL") {
      if (typeof se?.FAIL === "function") {
        se.FAIL(text);
      }
    } else if (typeof se?.LIVE === "function") {
      se.LIVE(text);
    } else if (typeof se?.INFO === "function") {
      se.INFO(text);
    }
  } catch (_error) {
    // ignore
  }
  try {
    if (level === "FAIL") {
      console.error(text);
    } else {
      console.info(text);
    }
  } catch (_error) {
    // ignore
  }
}

function nodeGraphAudioPlayerLibraryReport(nodeId, message) {
  const text = String(message || "").trim();
  if (!text) {
    return;
  }
  if (typeof setNodeGraphSampleStatus === "function") {
    setNodeGraphSampleStatus(nodeId, text);
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(text);
  }
}

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
  if (typeof nodeGraphSampleFileStore === "function") {
    return nodeGraphSampleFileStore();
  }
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
  let response;
  try {
    response = await fetch("/api/audio-file/list", {
      body: JSON.stringify({ dive: Boolean(dive), path: folderPath, recursive: Boolean(dive) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    throw new Error(
      `local folder API unreachable (${String(error?.message || error || "network")}). `
      + "On soundemote.io use Browse (📂), or run python server.py locally for pasted C:\\ paths.",
    );
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const raw = await response.text();
  let payload = {};
  if (contentType.includes("json") || /^\s*[{[]/.test(raw)) {
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      payload = {};
    }
  }
  if (!contentType.includes("json") || typeof payload?.ok !== "boolean") {
    throw new Error(
      "folder list needs local python server.py (pasted paths). "
      + "On soundemote.io/sandbox use Browse (📂) instead.",
    );
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `folder list failed (${response.status})`);
  }
  return payload;
}

async function nodeGraphAudioPlayerLibraryCollectDirectoryHandle(dirHandle, {
  dive = false,
  prefix = "",
} = {}) {
  const out = [];
  if (!dirHandle?.entries) {
    return out;
  }
  for await (const [name, handle] of dirHandle.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      try {
        const file = await handle.getFile();
        out.push(file);
      } catch (_error) {
        // skip unreadable entries
      }
      continue;
    }
    if (handle.kind === "directory" && dive) {
      const nested = await nodeGraphAudioPlayerLibraryCollectDirectoryHandle(handle, {
        dive: true,
        prefix: rel,
      });
      out.push(...nested);
    }
  }
  return out;
}

function nodeGraphAudioPlayerLibraryPickFolderViaInput({ dive = false } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "audio/*,.wav,.wave,.mp3,.ogg,.oga,.opus,.flac,.m4a,.aac";
    try {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    } catch (_error) {
      // ignore
    }
    input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    const finish = (files, error) => {
      try {
        input.remove();
      } catch (_error) {
        // ignore
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(files);
    };
    input.addEventListener("change", () => {
      const picked = [...(input.files || [])];
      if (!picked.length) {
        finish([], null);
        return;
      }
      if (dive) {
        finish(picked, null);
        return;
      }
      // webkitdirectory always walks the tree; keep top-level files only when Recursive is off.
      finish(picked.filter((file) => {
        const rel = String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
        return rel.split("/").filter(Boolean).length <= 2;
      }), null);
    }, { once: true });
    input.addEventListener("cancel", () => finish([], null), { once: true });
    document.body.appendChild(input);
    try {
      input.click();
    } catch (error) {
      finish([], error);
    }
  });
}

async function nodeGraphAudioPlayerLibraryPickFolderFiles({ dive = false } = {}) {
  if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });
      const files = await nodeGraphAudioPlayerLibraryCollectDirectoryHandle(dirHandle, {
        dive: Boolean(dive),
        prefix: "",
      });
      return {
        files,
        folderName: String(dirHandle?.name || "folder").trim() || "folder",
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { files: [], folderName: "", cancelled: true };
      }
      // Fall through to the legacy directory input.
    }
  }
  const files = await nodeGraphAudioPlayerLibraryPickFolderViaInput({ dive: Boolean(dive) });
  if (!files.length) {
    return { files: [], folderName: "", cancelled: true };
  }
  const firstRel = String(files[0]?.webkitRelativePath || "").replace(/\\/g, "/");
  const folderName = firstRel.split("/").filter(Boolean)[0] || "folder";
  return { files, folderName };
}

function nodeGraphAudioPlayerLibraryRememberPickedFiles(nodeId, files) {
  const store = nodeGraphAudioPlayerLibraryFiles();
  const list = [];
  const cards = [];
  for (const file of files || []) {
    if (!file) {
      continue;
    }
    const fileKey = nodeGraphAudioPlayerLibraryFileKey(file)
      || (typeof nodeGraphSampleFileKeyFromFile === "function"
        ? nodeGraphSampleFileKeyFromFile(file)
        : "");
    if (!fileKey) {
      continue;
    }
    store.set(fileKey, file);
    const rel = String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
    const path = rel || file.name || fileKey;
    list.push(file);
    cards.push({
      bytes: Math.max(0, Math.round(Number(file.size) || 0)),
      fileKey,
      name: file.name || path.split("/").pop() || fileKey,
      path: `browser:${path}`,
      rel,
    });
  }
  nodeGraphAudioPlayerLibraryFolderFileLists().set(String(nodeId), list);
  return cards;
}

async function nodeGraphAudioPlayerLibraryBindPickedFolder(nodeId, { dive = null, persist = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const recursive = dive == null ? Boolean(pl.folderDive) : Boolean(dive);
  const picked = await nodeGraphAudioPlayerLibraryPickFolderFiles({ dive: recursive });
  if (picked.cancelled) {
    nodeGraphAudioPlayerLibraryReport(nodeId, "Browse cancelled");
    return null;
  }
  const matched = (picked.files || []).filter((file) =>
    nodeGraphAudioPlayerLibraryFileMatchesFormats(file.name || file.webkitRelativePath, pl.formats),
  );
  if (!matched.length) {
    throw new Error(
      recursive
        ? "folder has no matching audio"
        : "folder has no matching audio (try Recursive search)",
    );
  }
  const cards = nodeGraphAudioPlayerLibraryRememberPickedFiles(nodeId, matched);
  // Browser picks cannot rehydrate from a pasted OS path later.
  pl.folderPath = "";
  nodeGraphAudioPlayerLibraryBindCards(nodeId, cards, {
    folderDive: recursive,
    folderPath: "",
    persist,
  });
  const pathBox = document.querySelector(
    `.node-sample-path-input[data-sample-path-for-node="${CSS.escape(String(nodeId))}"]`,
  );
  if (pathBox && document.activeElement !== pathBox) {
    pathBox.value = picked.folderName ? `${picked.folderName} (browser)` : "";
    pathBox.title = "Loaded from Browse — use Browse again to change folders online";
  }
  if (typeof setNodeGraphSampleStatus === "function") {
    setNodeGraphSampleStatus(
      nodeId,
      `${Math.min(cards.length, nodeGraphAudioPlayerLibraryWindowSize())} of ${cards.length} listed`,
    );
  }
  nodeGraphAudioPlayerLog("INFO", "listed via browse", {
    nodeId,
    tracks: cards.length,
    folder: picked.folderName || "",
  });
  return { files: cards, folderName: picked.folderName || "" };
}

async function nodeGraphAudioPlayerLibraryBrowseFolder(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    nodeGraphAudioPlayerLibraryReport(nodeId, "Browse: no Music Player selected");
    return null;
  }
  try {
    const result = await nodeGraphAudioPlayerLibraryBindPickedFolder(nodeId);
    if (!result) {
      return null;
    }
    if (typeof nodeGraphAudioPlayerPlaylistSetFace === "function") {
      nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
    }
    const loaded = nodeGraphAudioPlayerPlaylistForNode(nodeId);
    const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
      ? nodeGraphAudioPlayerTransportBase(nodeId)
      : 0;
    if ((loaded?.items?.length || 0) > 0 && transport >= 3) {
      nodeGraphAudioPlayerLibraryPlayIndex(nodeId, loaded.index || 0, { autoplay: true }).catch((error) => {
        nodeGraphAudioPlayerLog("FAIL", String(error?.message || error || "autostart failed"));
      });
    }
    return loaded;
  } catch (error) {
    const message = String(error?.message || error || "browse failed");
    nodeGraphAudioPlayerLog("FAIL", message, { nodeId });
    nodeGraphAudioPlayerLibraryReport(nodeId, message);
    return null;
  }
}

function nodeGraphAudioPlayerLibraryBindCards(nodeId, files, extras = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.folderPath = nodeGraphAudioPlayerLibraryStoredFolderPath(extras.folderPath || pl.folderPath);
  if (Object.prototype.hasOwnProperty.call(extras, "folderDive")) {
    pl.folderDive = Boolean(extras.folderDive);
  }
  pl.used = [];
  const cards = nodeGraphAudioPlayerLibrarySetCatalog(nodeId, files).map((card, index) => {
    card.listNumber = index + 1;
    return card;
  });
  pl.items = cards;
  pl.played = [];
  pl.playing = cards[0] || null;
  pl.unplayed = cards.slice(1);
  if (typeof nodeGraphAudioPlayerPlaylistSyncQueues === "function") {
    nodeGraphAudioPlayerPlaylistSyncQueues(pl);
  } else if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
    nodeGraphAudioPlayerPlaylistRebuildItems(pl);
  } else {
    pl.index = 0;
    pl.selectedIndex = 0;
  }
  node.playlist = pl;
  if (extras.refresh !== false && typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  if (extras.persist !== false && typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
  nodeGraphAudioPlayerLibraryReport(
    nodeId,
    `${cards.length} track${cards.length === 1 ? "" : "s"} listed (slots only on screen)`,
  );
  return pl;
}

async function nodeGraphAudioPlayerLibraryBindFolder(nodeId, folderPath, { dive = null, persist = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const sourcePath = nodeGraphAudioPlayerLibraryStoredFolderPath(folderPath);
  if (!sourcePath) {
    throw new Error("paste a full folder path, then Load");
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const recursive = dive == null ? Boolean(pl.folderDive) : Boolean(dive);
  const payload = await nodeGraphAudioPlayerLibraryListFolder(sourcePath, { dive: recursive });
  const listed = Array.isArray(payload.files) ? payload.files : [];
  const files = listed.filter((file) =>
    nodeGraphAudioPlayerLibraryFileMatchesFormats(file.name || file.path || file.rel, pl.formats),
  );
  if (!files.length) {
    throw new Error(
      recursive
        ? "folder has no matching audio"
        : "folder has no matching audio (try Recursive search)",
    );
  }
  nodeGraphAudioPlayerLibraryBindCards(nodeId, files, {
    folderDive: recursive,
    folderPath: nodeGraphAudioPlayerLibraryStoredFolderPath(payload.path || sourcePath),
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

async function nodeGraphAudioPlayerLibraryLoadPlaylist(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    nodeGraphAudioPlayerLibraryReport(nodeId, "Load: no Music Player selected");
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const pathBox = document.querySelector(
    `.node-sample-path-input[data-sample-path-for-node="${CSS.escape(String(nodeId))}"]`,
  );
  const typed = nodeGraphAudioPlayerLibraryStoredFolderPath(pathBox?.value);
  const folder = typed || nodeGraphAudioPlayerLibraryStoredFolderPath(pl.folderPath);
  if (!folder) {
    // Online / no pasted OS path: Browse is the supported way to list files.
    return nodeGraphAudioPlayerLibraryBrowseFolder(nodeId);
  }
  pl.folderPath = folder;
  node.playlist = pl;
  try {
    await nodeGraphAudioPlayerLibraryBindFolder(nodeId, folder);
  } catch (error) {
    const message = String(error?.message || error || "load failed");
    nodeGraphAudioPlayerLog("FAIL", message, { nodeId, folder });
    nodeGraphAudioPlayerLibraryReport(nodeId, message);
    return pl;
  }
  const loaded = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (pathBox && document.activeElement !== pathBox) {
    pathBox.value = loaded?.folderPath || folder;
  }
  if (typeof nodeGraphAudioPlayerPlaylistSetFace === "function") {
    nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
  }
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 0;
  nodeGraphAudioPlayerLog("INFO", "listed", {
    nodeId,
    tracks: loaded?.items?.length || 0,
    folder: loaded?.folderPath || folder,
    transport,
  });
  if ((loaded?.items?.length || 0) > 0 && transport >= 3) {
    nodeGraphAudioPlayerLog("INFO", "autostart after load (Playmode already on)");
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, loaded.index || 0, { autoplay: true }).catch((error) => {
      nodeGraphAudioPlayerLog("FAIL", String(error?.message || error || "autostart failed"));
    });
  }
  return loaded;
}

function nodeGraphAudioPlayerLibraryShufflePlaylist(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = typeof nodeGraphAudioPlayerPlaylistEnsureQueues === "function"
    ? nodeGraphAudioPlayerPlaylistEnsureQueues(nodeGraphAudioPlayerPlaylistForNode(nodeId))
    : nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const shuffleFn = typeof nodeGraphAudioPlayerPlaylistShuffleArray === "function"
    ? nodeGraphAudioPlayerPlaylistShuffleArray
    : (list) => list;
  const items = Array.isArray(pl.items) ? pl.items : [];
  const playedKeys = typeof nodeGraphAudioPlayerPlaylistPlayedKeySet === "function"
    ? nodeGraphAudioPlayerPlaylistPlayedKeySet(pl)
    : new Set();
  const playingKey = typeof nodeGraphAudioPlayerPlaylistItemKey === "function"
    ? nodeGraphAudioPlayerPlaylistItemKey(pl.playing)
    : "";
  const slots = [];
  const cards = [];
  for (let i = 0; i < items.length; i += 1) {
    const key = typeof nodeGraphAudioPlayerPlaylistItemKey === "function"
      ? nodeGraphAudioPlayerPlaylistItemKey(items[i])
      : "";
    if (key && key !== playingKey && !playedKeys.has(key)) {
      slots.push(i);
      cards.push(items[i]);
    }
  }
  const shuffled = shuffleFn(cards);
  for (let n = 0; n < slots.length; n += 1) {
    items[slots[n]] = shuffled[n];
  }
  pl.items = items;
  if (typeof nodeGraphAudioPlayerPlaylistSyncQueues === "function") {
    nodeGraphAudioPlayerPlaylistSyncQueues(pl);
  } else if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
    nodeGraphAudioPlayerPlaylistRebuildItems(pl);
  }
  node.playlist = pl;
  if (typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
  if (typeof setNodeGraphSampleStatus === "function") {
    setNodeGraphSampleStatus(nodeId, `shuffled ${pl.unplayed.length} unplayed (playing stays #${pl.playing?.listNumber || pl.index + 1})`);
  }
  return pl;
}

function nodeGraphAudioPlayerLibraryCandidateSampleIds(item) {
  const ids = [];
  const push = (value) => {
    const id = typeof normalizeNodeGraphSampleId === "function"
      ? normalizeNodeGraphSampleId(value)
      : String(value || "").trim().replace(/[^A-Za-z0-9_.:-]+/g, "-");
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  };
  push(item?.sampleId);
  push(item?.path);
  push(item?.fileKey);
  const base = String(item?.name || item?.path || "").replace(/\\/g, "/").split("/").pop();
  push(base);
  return ids;
}

function nodeGraphAudioPlayerLibraryFindBufferForItem(item) {
  const buffers = nodeGraphMvp?.sampleBuffers;
  if (!item || !buffers?.get) {
    return null;
  }
  for (const id of nodeGraphAudioPlayerLibraryCandidateSampleIds(item)) {
    const buf = buffers.get(id);
    const frames = Math.max(
      0,
      Number(buf?.frames) || buf?.channelData?.[0]?.length || buf?.samples?.length || 0,
    );
    if (buf && frames > 0) {
      return { buf, frames, id };
    }
  }
  return null;
}

function nodeGraphAudioPlayerLibraryItemLoaded(item) {
  return Boolean(nodeGraphAudioPlayerLibraryFindBufferForItem(item));
}

function nodeGraphAudioPlayerLibraryFindFileForItem(item) {
  if (!item) {
    return null;
  }
  const store = nodeGraphAudioPlayerLibraryFiles();
  const key = String(item.fileKey || "").trim();
  if (key) {
    const held = store.get(key);
    if (held) {
      return held;
    }
  }
  const base = String(item.name || item.path || "").replace(/\\/g, "/").split("/").pop();
  if (!base) {
    return null;
  }
  for (const file of store.values()) {
    if (file && String(file.name || "") === base) {
      return file;
    }
  }
  const lists = typeof nodeGraphAudioPlayerLibraryFolderFileLists === "function"
    ? nodeGraphAudioPlayerLibraryFolderFileLists()
    : null;
  if (lists) {
    for (const list of lists.values()) {
      const found = (list || []).find((file) => String(file?.name || "") === base);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

async function nodeGraphAudioPlayerLibraryEnsureItemLoaded(nodeId, item) {
  if (!item) {
    nodeGraphAudioPlayerLog("FAIL", "decode skipped: no playlist item", { nodeId });
    return null;
  }
  const held = nodeGraphAudioPlayerLibraryFindBufferForItem(item);
  if (held) {
    item.sampleId = held.id;
    nodeGraphAudioPlayerLog("INFO", "decode skipped: already in memory", {
      nodeId,
      sampleId: held.id,
      frames: held.frames,
    });
    return held.id;
  }
  let source = "none";
  const file = nodeGraphAudioPlayerLibraryFindFileForItem(item);
  if (file) {
    source = "store";
  }
  const path = String(item.path || "").trim();
  nodeGraphAudioPlayerLog("INFO", "decode source", {
    nodeId,
    name: item.name || "",
    source,
    fileKey: item.fileKey || "",
    path,
    fileName: file?.name || "",
    fileBytes: Math.max(0, Math.round(Number(file?.size) || 0)),
  });
  if (file && typeof loadNodeGraphSampleForNode === "function") {
    const sample = await loadNodeGraphSampleForNode(nodeId, file, {
      commit: true,
      livePlan: true,
      persist: false,
      record: false,
      sourcePath: path || item.name || "",
      syncDisplay: true,
    });
    return sample?.id || "";
  }
  if (path && typeof nodeGraphAudioPlayerLibraryLooksLikeOsPath === "function"
    && nodeGraphAudioPlayerLibraryLooksLikeOsPath(path)
    && typeof loadNodeGraphSamplePathForNode === "function") {
    nodeGraphAudioPlayerLog("INFO", "decode via OS path", { nodeId, path });
    await loadNodeGraphSamplePathForNode(nodeId, path, {
      commit: true,
      livePlan: true,
      persist: false,
      record: false,
      singleFile: true,
      syncDisplay: true,
    });
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    return node?.sample?.id || "";
  }
  throw new Error(`no local file for ${item.name || item.path || "track"} — paste a full folder path and Load`);
}

async function nodeGraphAudioPlayerLibraryPlayIndex(nodeId, index, { autoplay = true } = {}) {
  if (typeof nodeGraphAudioPlayerPlaylistBeginLoad === "function") {
    nodeGraphAudioPlayerPlaylistBeginLoad(nodeId);
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
      nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
    }
    nodeGraphAudioPlayerLog("FAIL", "play ignored: not a Music Player", {
      nodeId,
      type: node?.type || "",
    });
    return;
  }
  const pl = typeof nodeGraphAudioPlayerPlaylistEnsureQueues === "function"
    ? nodeGraphAudioPlayerPlaylistEnsureQueues(nodeGraphAudioPlayerPlaylistForNode(nodeId))
    : nodeGraphAudioPlayerPlaylistForNode(nodeId);
  if (!pl.items.length) {
    if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
      nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
    }
    nodeGraphAudioPlayerLog("FAIL", "play ignored: playlist empty", { nodeId });
    return;
  }
  const nextIndex = Math.max(0, Math.min(pl.items.length - 1, Math.round(Number(index) || 0)));
  let item = pl.items[nextIndex];
  if (!item) {
    if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
      nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
    }
    nodeGraphAudioPlayerLog("FAIL", "play ignored: no item at index", {
      nodeId,
      index: nextIndex,
      items: pl.items.length,
    });
    return;
  }
  if (typeof nodeGraphAudioPlayerPlaylistSetLoadTarget === "function") {
    nodeGraphAudioPlayerPlaylistSetLoadTarget(nodeId, item);
  }
  if (typeof nodeGraphAudioPlayerPlaylistAdoptPlaying === "function") {
    nodeGraphAudioPlayerPlaylistAdoptPlaying(pl, item, { retireCurrent: true });
    item = pl.playing || item;
  }
  if (pl.playNext && typeof nodeGraphAudioPlayerPlaylistItemKey === "function"
    && nodeGraphAudioPlayerPlaylistItemKey(pl.playNext) === nodeGraphAudioPlayerPlaylistItemKey(item)) {
    pl.playNext = null;
  }
  const tokens = nodeGraphAudioPlayerLibraryPlayTokens();
  const token = (Number(tokens.get(nodeId)) || 0) + 1;
  tokens.set(nodeId, token);
  node.playlist = pl;
  nodeGraphAudioPlayerLog("INFO", "play", {
    nodeId,
    index: nextIndex,
    name: item.name || "",
    fileKey: item.fileKey || "",
    path: item.path || "",
    sampleId: item.sampleId || "",
    hasFile: Boolean(nodeGraphAudioPlayerLibraryFindFileForItem(item)),
  });
  if (!nodeGraphAudioPlayerLibraryItemLoaded(item)) {
    if (typeof setNodeGraphSampleStatus === "function") {
      setNodeGraphSampleStatus(nodeId, `loading ${item.name}...`);
    }
    try {
      const sampleId = await nodeGraphAudioPlayerLibraryEnsureItemLoaded(nodeId, item);
      if (tokens.get(nodeId) !== token) {
        nodeGraphAudioPlayerLog("INFO", "play superseded during decode", { nodeId, token });
        return;
      }
      item.sampleId = sampleId || item.sampleId;
      nodeGraphAudioPlayerLog("INFO", "decoded", {
        nodeId,
        sampleId: item.sampleId || "",
        frames: nodeGraphMvp?.sampleBuffers?.get?.(item.sampleId)?.frames || 0,
        channels: nodeGraphMvp?.sampleBuffers?.get?.(item.sampleId)?.channels || 0,
      });
    } catch (error) {
      if (tokens.get(nodeId) !== token) {
        return;
      }
      const message = String(error?.message || error || "load failed");
      if (typeof setNodeGraphSampleStatus === "function") {
        setNodeGraphSampleStatus(nodeId, message);
      }
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp(message);
      }
      nodeGraphAudioPlayerLog("FAIL", message, {
        name: item.name || "",
        fileKey: item.fileKey || "",
        path: item.path || "",
      });
      if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
        nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
      }
      return;
    }
  }
  const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : node;
  if (!live || tokens.get(nodeId) !== token) {
    nodeGraphAudioPlayerLog("INFO", "play superseded after decode", { nodeId, token });
    return;
  }
  const found = nodeGraphAudioPlayerLibraryFindBufferForItem(item)
    || (live.sample?.id && nodeGraphMvp?.sampleBuffers?.get?.(live.sample.id)
      ? { id: live.sample.id, buf: nodeGraphMvp.sampleBuffers.get(live.sample.id) }
      : null);
  if (found?.id) {
    item.sampleId = found.id;
  } else if (!item.sampleId && live.sample?.id) {
    item.sampleId = String(live.sample.id);
  }
  if (!found && !nodeGraphAudioPlayerLibraryItemLoaded(item) && !nodeGraphMvp?.sampleBuffers?.get?.(item.sampleId || live.sample?.id)) {
    const message = `could not decode ${item.name || "track"}`;
    if (typeof setNodeGraphSampleStatus === "function") {
      setNodeGraphSampleStatus(nodeId, message);
    }
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(message);
    }
    nodeGraphAudioPlayerLog("FAIL", message, { sampleId: item.sampleId || live.sample?.id || "" });
    if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
      nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
    }
    return;
  }
  nodeGraphAudioPlayerLibraryReleaseOrphans(nodeId, item.sampleId || found?.id || live.sample?.id);
  live.sample = {
    id: item.sampleId,
    name: item.name || found?.buf?.name || item.sampleId,
    ...(item.fileKey ? { fileKey: item.fileKey } : {}),
    ...(item.path ? { sourcePath: item.path } : {}),
  };
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
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync("plan");
  }
  if (typeof syncNodeGraphSampleDisplayForNode === "function") {
    syncNodeGraphSampleDisplayForNode(nodeId);
  }
  if (typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
    nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
  }
  const section = document.querySelector(
    `.node-phosphor-waveform-display[data-node="${CSS.escape(String(nodeId))}"]`,
  );
  if (section && typeof nodeGraphPhosphorWaveformEnsureLoop === "function") {
    nodeGraphPhosphorWaveformEnsureLoop(section);
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(`playing ${item.name}`);
  }
  const boundId = String(live.sample?.id || item.sampleId || "");
  const boundBuf = boundId ? nodeGraphMvp?.sampleBuffers?.get?.(boundId) : null;
  nodeGraphAudioPlayerLog("INFO", "bound", {
    nodeId,
    sampleId: boundId,
    frames: boundBuf?.frames || 0,
    channels: boundBuf?.channels || 0,
    transport: live.params?.transport || "",
    autoplay,
    displayName: typeof nodeGraphAudioPlayerPlaylistCurrentSampleRef === "function"
      ? (nodeGraphAudioPlayerPlaylistCurrentSampleRef(live)?.name || "")
      : (live.sample?.name || ""),
  });
}

function nodeGraphAudioPlayerLibraryPlayNext(nodeId, options = {}) {
  if (options.fromAuto && typeof nodeGraphAudioPlayerPlaylistAutoAdvanceBlocked === "function"
    && nodeGraphAudioPlayerPlaylistAutoAdvanceBlocked(nodeId)) {
    nodeGraphAudioPlayerLog("INFO", "auto-advance ignored: still loading next track", { nodeId });
    return;
  }
  const pl = typeof nodeGraphAudioPlayerPlaylistEnsureQueues === "function"
    ? nodeGraphAudioPlayerPlaylistEnsureQueues(nodeGraphAudioPlayerPlaylistForNode(nodeId))
    : nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 4;
  const wrap = pl.loopMode === "all" || transport === 5;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (typeof nodeGraphAudioPlayerPlaylistRetirePlaying === "function") {
    nodeGraphAudioPlayerPlaylistRetirePlaying(pl);
  } else if (pl.removeAfterPlay) {
    pl.playing = null;
  } else if (pl.playing) {
    pl.played = [...(pl.played || []), pl.playing];
    pl.playing = null;
  }
  if (typeof nodeGraphAudioPlayerPlaylistSyncQueues === "function") {
    nodeGraphAudioPlayerPlaylistSyncQueues(pl);
  }
  const keyOf = typeof nodeGraphAudioPlayerPlaylistItemKey === "function"
    ? nodeGraphAudioPlayerPlaylistItemKey
    : (item) => String(item?.path || item?.id || "");
  const queuedKey = keyOf(pl.playNext);
  const queued = queuedKey
    ? (pl.items || []).find((item) => keyOf(item) === queuedKey) || null
    : null;
  if (!(pl.unplayed || []).length && !queued) {
    if (wrap && (pl.played || []).length) {
      pl.played = [];
      if (typeof nodeGraphAudioPlayerPlaylistSyncQueues === "function") {
        nodeGraphAudioPlayerPlaylistSyncQueues(pl);
      }
    } else {
      if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
        nodeGraphAudioPlayerPlaylistRebuildItems(pl);
      }
      if (node) {
        node.playlist = pl;
      }
      if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
        nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
      }
      if (typeof nodeGraphAudioPlayerWriteTransport === "function") {
        nodeGraphAudioPlayerWriteTransport(nodeId, 1);
      }
      if (typeof nodeGraphAudioPlayerPlaylistDebug === "function") {
        nodeGraphAudioPlayerPlaylistDebug(nodeId, "play-next-stop", {
          fromAuto: Boolean(options.fromAuto),
          wrap,
          why: "no unplayed tracks",
        });
      }
      if (typeof nodeGraphAudioPlayerPlaylistRefreshUi === "function") {
        nodeGraphAudioPlayerPlaylistRefreshUi(nodeId);
      }
      if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
        nodeGraphAudioPlayerPlaylistPersist(nodeId);
      }
      return;
    }
  }
  let next = null;
  if (queued) {
    next = queued;
    pl.playNext = null;
  }
  const pool = Array.isArray(pl.unplayed) ? pl.unplayed : [];
  if (!next && pl.shuffle && pool.length) {
    next = pool[Math.floor(Math.random() * pool.length)];
  } else if (!next && pool.length) {
    const fromKey = String(options.fromKey || "");
    let from = fromKey
      ? (pl.items || []).findIndex((entry) => keyOf(entry) === fromKey)
      : -1;
    if (from < 0) {
      from = Math.max(0, Math.round(Number(pl.index) || 0));
    }
    const after = pool.find((item) => {
      const found = (pl.items || []).findIndex((entry) => keyOf(entry) === keyOf(item));
      return found > from;
    });
    next = after || pool[0];
  }
  pl.playing = next || null;
  if (typeof nodeGraphAudioPlayerPlaylistSyncQueues === "function") {
    nodeGraphAudioPlayerPlaylistSyncQueues(pl);
  } else if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
    nodeGraphAudioPlayerPlaylistRebuildItems(pl);
  }
  if (node) {
    node.playlist = pl;
  }
  if (next) {
    if (typeof nodeGraphAudioPlayerPlaylistDebug === "function") {
      nodeGraphAudioPlayerPlaylistDebug(nodeId, "play-next", {
        fromAuto: Boolean(options.fromAuto),
        name: next.name || "",
        queued: Boolean(queued && next === queued),
        wrap,
        index: pl.index,
      });
    }
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, pl.index, { autoplay: true });
    return;
  }
  if (typeof nodeGraphAudioPlayerPlaylistDebug === "function") {
    nodeGraphAudioPlayerPlaylistDebug(nodeId, "play-next-stop", {
      fromAuto: Boolean(options.fromAuto),
      wrap,
      why: "next pick empty",
    });
  }
  if (typeof nodeGraphAudioPlayerPlaylistEndLoad === "function") {
    nodeGraphAudioPlayerPlaylistEndLoad(nodeId);
  }
  if (typeof nodeGraphAudioPlayerWriteTransport === "function") {
    nodeGraphAudioPlayerWriteTransport(nodeId, 1);
  }
}

function nodeGraphAudioPlayerLibraryPlayPrev(nodeId) {
  const pl = typeof nodeGraphAudioPlayerPlaylistEnsureQueues === "function"
    ? nodeGraphAudioPlayerPlaylistEnsureQueues(nodeGraphAudioPlayerPlaylistForNode(nodeId))
    : nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 4;
  const wrap = pl.loopMode === "all" || transport === 5;
  if (!(pl.played || []).length) {
    if (wrap && (pl.unplayed || []).length) {
      const last = pl.unplayed.pop();
      if (pl.playing) {
        pl.unplayed.unshift(pl.playing);
      }
      pl.playing = last;
    } else {
      return;
    }
  } else {
    if (pl.playing) {
      pl.unplayed = [pl.playing, ...(pl.unplayed || [])];
    }
    pl.playing = pl.played.pop();
  }
  if (typeof nodeGraphAudioPlayerPlaylistSyncQueues === "function") {
    nodeGraphAudioPlayerPlaylistSyncQueues(pl);
  } else if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
    nodeGraphAudioPlayerPlaylistRebuildItems(pl);
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (node) {
    node.playlist = pl;
  }
  if (pl.playing) {
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, pl.index, { autoplay: true });
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
  if (nodeGraphAudioPlayerLibraryStoredFolderPath(pl.folderPath)) {
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
