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

function nodeGraphAudioPlayerLibraryFolderHandles() {
  if (!globalThis.nodeGraphAudioPlayerLibraryFolderHandleMap) {
    globalThis.nodeGraphAudioPlayerLibraryFolderHandleMap = new Map();
  }
  return globalThis.nodeGraphAudioPlayerLibraryFolderHandleMap;
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

function nodeGraphAudioPlayerLibraryFolderName(path) {
  const raw = String(path || "").trim().replace(/\\/g, "/");
  if (!raw) {
    return "";
  }
  const parts = raw.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
}

async function nodeGraphAudioPlayerLibraryHandleDb() {
  if (typeof nodeGraphFilePickerOpenDb === "function") {
    return nodeGraphFilePickerOpenDb();
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("soemdsp-sandbox-file-picker", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("folder handle db failed"));
  });
}

async function nodeGraphAudioPlayerLibraryIdbGetHandle(key) {
  try {
    const db = await nodeGraphAudioPlayerLibraryHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readonly");
      const req = tx.objectStore("handles").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (_error) {
    return null;
  }
}

async function nodeGraphAudioPlayerLibraryIdbPutHandle(key, handle) {
  if (!key || !handle) {
    return;
  }
  try {
    const db = await nodeGraphAudioPlayerLibraryHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (_error) {
    // Private mode / quota — in-memory map still works this session.
  }
}

async function nodeGraphAudioPlayerLibraryRememberFolderHandle(nodeId, handle) {
  if (!handle) {
    return;
  }
  const id = String(nodeId || "");
  const name = nodeGraphAudioPlayerLibraryFolderName(handle.name);
  const map = nodeGraphAudioPlayerLibraryFolderHandles();
  if (id) {
    map.set(id, handle);
  }
  map.set("*last*", handle);
  if (id) {
    await nodeGraphAudioPlayerLibraryIdbPutHandle(`audioPlayer:${id}`, handle);
  }
  await nodeGraphAudioPlayerLibraryIdbPutHandle("audioPlayer:last", handle);
  if (name) {
    await nodeGraphAudioPlayerLibraryIdbPutHandle(`audioPlayer:name:${name}`, handle);
  }
}

async function nodeGraphAudioPlayerLibraryRestoreFolderHandle(nodeId, folderPath) {
  const id = String(nodeId || "");
  const map = nodeGraphAudioPlayerLibraryFolderHandles();
  let handle = (id && map.get(id)) || map.get("*last*") || null;
  const wantName = nodeGraphAudioPlayerLibraryLooksLikeOsPath(folderPath)
    ? ""
    : nodeGraphAudioPlayerLibraryFolderName(folderPath);
  if (!handle) {
    const keys = [];
    if (id) {
      keys.push(`audioPlayer:${id}`);
    }
    if (wantName) {
      keys.push(`audioPlayer:name:${wantName}`);
    }
    keys.push("audioPlayer:last");
    for (const key of keys) {
      const stored = await nodeGraphAudioPlayerLibraryIdbGetHandle(key);
      if (!stored) {
        continue;
      }
      const storedName = nodeGraphAudioPlayerLibraryFolderName(stored.name);
      if (key === "audioPlayer:last" && wantName && storedName && storedName !== wantName) {
        continue;
      }
      handle = stored;
      break;
    }
  }
  if (!handle) {
    return null;
  }
  if (typeof handle.queryPermission === "function" && typeof handle.requestPermission === "function") {
    let perm = "prompt";
    try {
      perm = await handle.queryPermission({ mode: "read" });
    } catch (_error) {
      perm = "prompt";
    }
    if (perm !== "granted") {
      try {
        perm = await handle.requestPermission({ mode: "read" });
      } catch (_error) {
        return null;
      }
    }
    if (perm !== "granted") {
      return null;
    }
  }
  await nodeGraphAudioPlayerLibraryRememberFolderHandle(id, handle);
  return handle;
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
  const cards = nodeGraphAudioPlayerLibrarySetCatalog(nodeId, files).map((card, index) => {
    card.listNumber = index + 1;
    return card;
  });
  pl.played = [];
  pl.playing = cards[0] || null;
  pl.unplayed = cards.slice(1);
  if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
    nodeGraphAudioPlayerPlaylistRebuildItems(pl);
  } else {
    pl.items = cards;
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
  nodeGraphAudioPlayerLibraryFolderFileLists().set(String(nodeId), [...(fileList || [])]);
  const files = [...(fileList || [])];
  const firstRel = String(files[0]?.webkitRelativePath || files[0]?.name || "").replace(/\\/g, "/");
  const folderName = firstRel.includes("/") ? firstRel.split("/")[0] : "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (node && node.type === "audioPlayer" && folderName) {
    const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
    pl.folderPath = folderName;
    node.playlist = pl;
    if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
      nodeGraphAudioPlayerPlaylistPersist(nodeId);
    }
  }
  return nodeGraphAudioPlayerLibraryLoadPlaylist(nodeId);
}

async function nodeGraphAudioPlayerLibraryWalkDirectoryHandle(handle, prefix, recursive, out) {
  if (!handle || typeof handle.entries !== "function") {
    return out;
  }
  const list = Array.isArray(out) ? out : [];
  for await (const [name, entry] of handle.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "file") {
      try {
        const file = await entry.getFile();
        list.push({ file, rel, name: file.name, bytes: file.size });
      } catch (_error) {
        // Skip unreadable entries.
      }
    } else if (recursive && entry.kind === "directory") {
      await nodeGraphAudioPlayerLibraryWalkDirectoryHandle(entry, rel, true, list);
    }
  }
  return list;
}

async function nodeGraphAudioPlayerLibraryPickFolder(nodeId) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  if (typeof window.showDirectoryPicker === "function") {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    await nodeGraphAudioPlayerLibraryRememberFolderHandle(nodeId, handle);
    nodeGraphAudioPlayerLibraryFolderFileLists().delete(String(nodeId));
    const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
    pl.folderPath = String(handle.name || "folder").trim();
    node.playlist = pl;
    if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
      nodeGraphAudioPlayerPlaylistPersist(nodeId);
    }
    if (typeof setNodeGraphSampleStatus === "function") {
      setNodeGraphSampleStatus(nodeId, `folder ${pl.folderPath}`);
    }
    return pl;
  }
  return null;
}

function nodeGraphAudioPlayerLibrarySetFolderFromWebkitFiles(nodeId, fileList) {
  const files = [...(fileList || [])];
  nodeGraphAudioPlayerLibraryFolderFileLists().set(String(nodeId), files);
  nodeGraphAudioPlayerLibraryFolderFileLists().set("*last*", files);
  nodeGraphAudioPlayerLibraryFolderHandles().delete(String(nodeId));
  const firstRel = String(files[0]?.webkitRelativePath || files[0]?.name || "").replace(/\\/g, "/");
  const folderName = firstRel.includes("/") ? firstRel.split("/")[0] : (files[0]?.name || "folder");
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
    return null;
  }
  const pl = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  pl.folderPath = folderName;
  node.playlist = pl;
  if (typeof nodeGraphAudioPlayerPlaylistPersist === "function") {
    nodeGraphAudioPlayerPlaylistPersist(nodeId);
  }
  if (typeof setNodeGraphSampleStatus === "function") {
    setNodeGraphSampleStatus(nodeId, `folder ${pl.folderPath}`);
  }
  return pl;
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
  if (pathBox?.value?.trim() && nodeGraphAudioPlayerLibraryLooksLikeOsPath(pathBox.value)) {
    pl.folderPath = pathBox.value.trim();
    node.playlist = pl;
  }
  const recursive = Boolean(pl.folderDive);
  const formats = pl.formats;
  const store = nodeGraphAudioPlayerLibraryFiles();
  const cards = [];
  const handles = nodeGraphAudioPlayerLibraryFolderHandles();
  const lists = nodeGraphAudioPlayerLibraryFolderFileLists();
  let handle = handles.get(String(nodeId)) || handles.get("*last*") || null;
  if (!handle) {
    handle = await nodeGraphAudioPlayerLibraryRestoreFolderHandle(nodeId, pl.folderPath);
    if (handle) {
      nodeGraphAudioPlayerLog("INFO", "folder restored", {
        nodeId,
        folder: handle.name || pl.folderPath || "",
      });
    }
  }
  let files = lists.get(String(nodeId)) || lists.get("*last*") || [];
  if (handle && !handles.has(String(nodeId))) {
    handles.set(String(nodeId), handle);
  }
  if (files.length && !lists.has(String(nodeId))) {
    lists.set(String(nodeId), files);
  }
  if (handle) {
    if (handle.queryPermission && handle.requestPermission) {
      const perm = await handle.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        await handle.requestPermission({ mode: "read" });
      }
    }
    nodeGraphAudioPlayerLibraryReport(nodeId, `scanning ${pl.folderPath || "folder"}…`);
    const walked = await nodeGraphAudioPlayerLibraryWalkDirectoryHandle(handle, "", recursive, []);
    for (const entry of walked) {
      if (!nodeGraphAudioPlayerLibraryFileMatchesFormats(entry.name, formats)) {
        continue;
      }
      const fileKey = nodeGraphAudioPlayerLibraryFileKey(entry.file);
      if (fileKey) {
        store.set(fileKey, entry.file);
      }
      cards.push({
        bytes: entry.bytes,
        fileKey,
        name: entry.rel || entry.name,
        path: entry.rel || entry.name,
      });
    }
  } else if (files.length) {
    nodeGraphAudioPlayerLibraryReport(nodeId, `scanning ${pl.folderPath || "folder"}…`);
    for (const file of files) {
      const rel = String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
      const depth = rel.split("/").filter(Boolean).length;
      if (!recursive && depth > 2) {
        continue;
      }
      if (!nodeGraphAudioPlayerLibraryFileMatchesFormats(file.name, formats)) {
        continue;
      }
      const fileKey = nodeGraphAudioPlayerLibraryFileKey(file);
      if (fileKey) {
        store.set(fileKey, file);
      }
      cards.push({
        bytes: file.size,
        fileKey,
        name: rel || file.name,
        path: rel || file.name,
      });
    }
  } else if (nodeGraphAudioPlayerLibraryLooksLikeOsPath(pl.folderPath)) {
    nodeGraphAudioPlayerLibraryReport(nodeId, `listing ${pl.folderPath}…`);
    const payload = await nodeGraphAudioPlayerLibraryListFolder(pl.folderPath, { dive: recursive });
    const listed = Array.isArray(payload.files) ? payload.files : [];
    if (payload.path && nodeGraphAudioPlayerLibraryLooksLikeOsPath(payload.path)) {
      pl.folderPath = payload.path;
      node.playlist = pl;
    }
    for (const file of listed) {
      if (!nodeGraphAudioPlayerLibraryFileMatchesFormats(file.name || file.path || file.rel, formats)) {
        continue;
      }
      cards.push(file);
    }
  } else {
    nodeGraphAudioPlayerLog("FAIL", "Load: no folder handle or OS path", {
      nodeId,
      folder: pl.folderPath || "",
    });
    nodeGraphAudioPlayerLibraryReport(
      nodeId,
      "Choose a folder with 📂 first, then Load. The browser cannot see C:\\ from the picker — we remember the folder handle. Or paste a full C:\\ path.",
    );
    return pl;
  }
  nodeGraphAudioPlayerLibraryBindCards(nodeId, cards, {
    folderDive: recursive,
    folderPath: pl.folderPath,
  });
  if (!cards.length) {
    nodeGraphAudioPlayerLog("FAIL", "Load: no matching audio", {
      nodeId,
      folder: pl.folderPath || "",
      recursive,
    });
    nodeGraphAudioPlayerLibraryReport(
      nodeId,
      recursive
        ? `no matching audio in ${pl.folderPath || "folder"}`
        : `no matching audio in ${pl.folderPath || "folder"} (try Recursive search)`,
    );
  }
  if (typeof nodeGraphAudioPlayerPlaylistSetFace === "function") {
    nodeGraphAudioPlayerPlaylistSetFace(nodeId, "pl");
  }
  const loaded = nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 0;
  nodeGraphAudioPlayerLog("INFO", "listed", {
    nodeId,
    tracks: loaded?.items?.length || 0,
    folder: loaded?.folderPath || "",
    handle: Boolean(handles.get(String(nodeId)) || handles.get("*last*")),
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
  pl.unplayed = shuffleFn(pl.unplayed || []);
  if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
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

async function nodeGraphAudioPlayerLibraryFileFromFolderHandle(nodeId, item) {
  const handles = typeof nodeGraphAudioPlayerLibraryFolderHandles === "function"
    ? nodeGraphAudioPlayerLibraryFolderHandles()
    : null;
  let handle = handles?.get?.(String(nodeId)) || handles?.get?.("*last*") || null;
  if (!handle) {
    const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
      ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
      : null;
    handle = await nodeGraphAudioPlayerLibraryRestoreFolderHandle(nodeId, pl?.folderPath || item?.path || "");
  }
  if (!handle) {
    return null;
  }
  const pl = typeof nodeGraphAudioPlayerPlaylistForNode === "function"
    ? nodeGraphAudioPlayerPlaylistForNode(nodeId)
    : null;
  const recursive = Boolean(pl?.folderDive);
  const wantPath = String(item?.path || "").replace(/\\/g, "/");
  const wantName = String(item?.name || wantPath).replace(/\\/g, "/").split("/").pop();
  const walked = await nodeGraphAudioPlayerLibraryWalkDirectoryHandle(handle, "", recursive, []);
  const store = nodeGraphAudioPlayerLibraryFiles();
  for (const entry of walked) {
    const rel = String(entry.rel || entry.name || "").replace(/\\/g, "/");
    const name = String(entry.name || "").split("/").pop();
    if ((wantPath && rel === wantPath) || (wantName && name === wantName)) {
      const fileKey = nodeGraphAudioPlayerLibraryFileKey(entry.file);
      if (fileKey) {
        store.set(fileKey, entry.file);
        if (item) {
          item.fileKey = fileKey;
        }
      }
      return entry.file;
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
  let file = nodeGraphAudioPlayerLibraryFindFileForItem(item);
  if (file) {
    source = "store";
  } else {
    file = await nodeGraphAudioPlayerLibraryFileFromFolderHandle(nodeId, item);
    if (file) {
      source = "handle";
    }
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
  throw new Error(`no local file for ${item.name || item.path || "track"} — Load the folder again`);
}

async function nodeGraphAudioPlayerLibraryPlayIndex(nodeId, index, { autoplay = true } = {}) {
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node || node.type !== "audioPlayer") {
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
    nodeGraphAudioPlayerLog("FAIL", "play ignored: playlist empty", { nodeId });
    return;
  }
  const nextIndex = Math.max(0, Math.min(pl.items.length - 1, Math.round(Number(index) || 0)));
  let item = pl.items[nextIndex];
  if (!item) {
    nodeGraphAudioPlayerLog("FAIL", "play ignored: no item at index", {
      nodeId,
      index: nextIndex,
      items: pl.items.length,
    });
    return;
  }
  if (typeof nodeGraphAudioPlayerPlaylistAdoptPlaying === "function") {
    nodeGraphAudioPlayerPlaylistAdoptPlaying(pl, item, { retireCurrent: true });
    item = pl.playing || item;
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
    hasHandle: Boolean(
      nodeGraphAudioPlayerLibraryFolderHandles().get(String(nodeId))
      || nodeGraphAudioPlayerLibraryFolderHandles().get("*last*"),
    ),
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
  if (typeof cloneNodeGraphPatch === "function" && typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(cloneNodeGraphPatch(nodeGraphMvp.patch), {
      record: false,
      status: `playing ${item.name}`,
    });
  }
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync("plan");
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

function nodeGraphAudioPlayerLibraryPlayNext(nodeId) {
  const pl = typeof nodeGraphAudioPlayerPlaylistEnsureQueues === "function"
    ? nodeGraphAudioPlayerPlaylistEnsureQueues(nodeGraphAudioPlayerPlaylistForNode(nodeId))
    : nodeGraphAudioPlayerPlaylistForNode(nodeId);
  const transport = typeof nodeGraphAudioPlayerTransportBase === "function"
    ? nodeGraphAudioPlayerTransportBase(nodeId)
    : 4;
  const wrap = pl.loopMode === "all" || transport === 5;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (pl.removeAfterPlay) {
    pl.playing = null;
  } else if (pl.playing) {
    pl.played = [...(pl.played || []), pl.playing];
    pl.playing = null;
  }
  if (!(pl.unplayed || []).length) {
    if (wrap && (pl.played || []).length) {
      pl.unplayed = pl.shuffle && typeof nodeGraphAudioPlayerPlaylistShuffleArray === "function"
        ? nodeGraphAudioPlayerPlaylistShuffleArray(pl.played)
        : pl.played.slice();
      pl.played = [];
    } else {
      if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
        nodeGraphAudioPlayerPlaylistRebuildItems(pl);
      }
      if (node) {
        node.playlist = pl;
      }
      if (typeof nodeGraphAudioPlayerWriteTransport === "function") {
        nodeGraphAudioPlayerWriteTransport(nodeId, 1);
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
  if (pl.shuffle && pl.unplayed.length) {
    const pick = Math.floor(Math.random() * pl.unplayed.length);
    next = pl.unplayed.splice(pick, 1)[0];
  } else {
    next = pl.unplayed.shift();
  }
  pl.playing = next || null;
  if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
    nodeGraphAudioPlayerPlaylistRebuildItems(pl);
  }
  if (node) {
    node.playlist = pl;
  }
  if (next) {
    nodeGraphAudioPlayerLibraryPlayIndex(nodeId, pl.index, { autoplay: true });
    return;
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
  if (typeof nodeGraphAudioPlayerPlaylistRebuildItems === "function") {
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
